-- PR-ESTOQUE-EL-03 — as RPCs de escrita passam a saber de que local o grao sai.
--
-- ⚠ JA APLICADA NO PROTO pelo arquiteto em 15/09/2026, com GO do Gabriel. E' REGISTRO HISTORICO.
--   Nao foi reaplicada.
--
-- ⚠ CORPOS EXTRAIDOS DO BANCO, NAO DIGITADOS, conferidos por md5 do `pg_get_functiondef`:
--     agri_local_estoque_resolver   5e36640d…  (   900 caracteres)  NOVA
--     agri_quebra_registrar         cfc13be3…  ( 1.341)
--     agri_venda_graos_registrar    6c462f49…  (14.982)
--     agri_venda_graos_corrigir     02d37f2a…  ( 2.161)
-- ⚠ E OS 4.682 ULTIMOS CARACTERES DO `registrar` NAO FORAM TRANSCRITOS DE NOVO: sao IDENTICOS
--   aos da versao anterior, ja verificada byte a byte na `20261024120000` (md5 e3748d3f…).
--   O md5 da cauda nova casou em `velho[9587:14269]` — deslocamento de 713 caracteres, que e'
--   exatamente o que a funcao cresceu. So' a cabeca mudou, e so' ela foi transcrita.
--
-- ⚠⚠ O RESOLVER E' A REGRA 2.3 DA SPEC EM UM LUGAR SO'. A trigger do EL-02 ja fazia isto no
--   INSERT; a funcao existe porque as RPCs precisam do id ANTES de inserir — para consultar o
--   saldo DAQUELE local. Duas implementacoes da mesma regra divergiriam no primeiro ajuste;
--   a trigger continua de pe' como rede para quem insere sem passar por RPC.
--   ⚠ ELE ACEITA LOCAL INATIVO quando informado explicitamente (`where id = … and cliente_id = …`,
--     sem `and ativo`): corrigir uma venda antiga de um local desativado tem de continuar
--     possivel. So' a RESOLUCAO AUTOMATICA exige `ativo` — ali a pergunta e' "qual e' o unico
--     lugar em uso hoje".
--
-- ⚠⚠ E AQUI NASCE UMA GUARDA QUE NUNCA EXISTIU: ate' hoje `agri_venda_graos_registrar` NAO
--   conferia saldo. Vender 40 mil sacas de um estoque de 4 mil gravava sem reclamar, e o saldo
--   ficava negativo na tela. Agora ha' `VENDA_ACIMA_DO_SALDO_DO_LOCAL`, por CLASSE, contra o
--   saldo DO LOCAL, com tolerancia de 0,005 sc — a mesma meia-casa que o resto do modulo usa
--   para arredondamento de romaneio.
--   ⚠ A TOLERANCIA E' DE SACA, NAO DE PORCENTAGEM: 0,005 e' menos que um centesimo de saca, o
--     residuo tipico de uma divisao a 4 casas. Percentual deixaria passar mais quanto maior a
--     venda, que e' exatamente ao contrario do que se quer.
--
-- ⚠ A GUARDA DA QUEBRA MUDOU DE DENOMINADOR: era `fn_estoque_graos(cliente, safra, cultura)` —
--   tres argumentos, o saldo da SAFRA INTEIRA. Com o quarto argumento do EL-02 tendo default,
--   aquela chamada continuou compilando e passou a estar silenciosamente errada com 2+ locais:
--   uma quebra no galpao vazio era aceita porque a cooperativa tinha saldo. Agora e'
--   `QUEBRA_ACIMA_DO_SALDO_DO_LOCAL`.
--
-- ⚠ AS TRES ASSINATURAS ANTIGAS SAO DROPADAS ANTES DO CREATE — acrescentar argumento com default
--   cria SOBRECARGA, e com as duas vivas o PostgREST casaria a chamada sem `p_local_id` com a
--   versao que nao resolve local nem confere saldo.

drop function if exists public.agri_quebra_registrar(uuid,uuid,text,text,numeric,date,text,text);
drop function if exists public.agri_venda_graos_registrar(uuid,uuid,text,uuid,uuid,date,jsonb,numeric,numeric,jsonb,jsonb,text,uuid[],text,text);
drop function if exists public.agri_venda_graos_corrigir(uuid,text,uuid,uuid,text,uuid,uuid,date,jsonb,numeric,numeric,jsonb,jsonb,text,uuid[],text,text);

CREATE OR REPLACE FUNCTION public.agri_local_estoque_resolver(p_cliente uuid, p_local_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_n int; v_id uuid; v_ok boolean;
begin
  if p_local_id is not null then
    select true into v_ok from agri_locais_estoque where id = p_local_id and cliente_id = p_cliente;
    if v_ok is null then raise exception 'LOCAL_ESTOQUE_INVALIDO'; end if;
    return p_local_id;
  end if;
  select count(*), (array_agg(id))[1] into v_n, v_id from agri_locais_estoque where cliente_id = p_cliente and ativo;
  if v_n = 1 then return v_id; end if;
  if v_n = 0 then raise exception 'LOCAL_ESTOQUE_NAO_CADASTRADO: cadastre um local de estoque antes de movimentar grao'; end if;
  raise exception 'LOCAL_ESTOQUE_OBRIGATORIO: o cliente tem % locais ativos; informe o local', v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.agri_quebra_registrar(p_cliente uuid, p_safra_id uuid, p_cultura text, p_classe text, p_quantidade numeric, p_data date, p_motivo text, p_observacoes text DEFAULT NULL::text, p_local_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_saldo numeric; v_id uuid; v_local uuid;
begin
  v_local := agri_local_estoque_resolver(p_cliente, p_local_id);
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'QUEBRA_QUANTIDADE_INVALIDA'; end if;
  select (it->>'saldo')::numeric into v_saldo
    from jsonb_array_elements(fn_estoque_graos(p_cliente, p_safra_id, p_cultura, v_local)) it where it->>'classe' = p_classe;
  if v_saldo is null then raise exception 'QUEBRA_CLASSE_SEM_ESTOQUE: %', p_classe; end if;
  if p_quantidade > v_saldo then raise exception 'QUEBRA_ACIMA_DO_SALDO_DO_LOCAL: % > %', p_quantidade, v_saldo; end if;
  insert into agri_estoque_movimentacoes(cliente_id, safra_id, cultura, classe, tipo, quantidade, data_movimento, motivo, observacoes, local_estoque_id, created_by, updated_by)
  values (p_cliente, p_safra_id, p_cultura, p_classe, 'quebra', p_quantidade, p_data, p_motivo, p_observacoes, v_local, auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.agri_venda_graos_registrar(p_cliente uuid, p_safra_id uuid, p_cultura text, p_fazenda_id uuid, p_comprador_id uuid, p_data date, p_itens jsonb, p_valor_bruto numeric, p_senar numeric, p_descontos jsonb, p_parcelas jsonb, p_observacoes text, p_substituir uuid[] DEFAULT NULL::uuid[], p_documento text DEFAULT NULL::text, p_tipo_documento text DEFAULT NULL::text, p_local_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_op uuid; v_bruto numeric; v_soma_itens numeric; v_fator numeric := 1;
  v_senar numeric := round(coalesce(p_senar,0),2); v_desc numeric := 0; v_ded numeric; v_liq numeric; v_soma_parc numeric;
  v_plano_rec uuid; v_subc_rec text; v_plano_ded uuid; v_macro_ded text; v_grupo_ded text; v_centro_ded text; v_subc_ded text;
  v_n int; i int; x jsonb; v_venc date; v_pago boolean; v_pag date; v_conta uuid; v_parc numeric;
  v_ded_i numeric; v_acum_ded numeric := 0; v_rec_i numeric; v_status text; v_lanc uuid; v_lancs uuid[] := '{}';
  v_todos_pagos boolean := true; v_algum_pago boolean := false; v_sub uuid; v_ult uuid; v_dif numeric;
  v_senar_i numeric; v_acum_senar numeric := 0; v_desc_i numeric;
  v_sacas_txt text; v_unid text; v_classes text; v_pct_txt text; v_desc_rec text; v_desc_sen text; v_desc_dsc text;
  v_local uuid; v_falta record;
begin
  v_local := agri_local_estoque_resolver(p_cliente, p_local_id);
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'VENDA_SEM_ITENS'; end if;
  if p_parcelas is null or jsonb_array_length(p_parcelas) = 0 then raise exception 'VENDA_SEM_PARCELAS'; end if;
  if p_data is null then raise exception 'DATA_OBRIGATORIA'; end if;
  if exists (select 1 from jsonb_array_elements(p_itens) y where (y->>'valor') is not null and coalesce((y->>'sacas')::numeric,0) <= 0) then raise exception 'VALOR_DE_LINHA_SEM_SACAS'; end if;

  select coalesce(sum(coalesce(round((y->>'valor')::numeric, 2), round((y->>'sacas')::numeric * coalesce((y->>'preco')::numeric,0), 2))),0) into v_soma_itens from jsonb_array_elements(p_itens) y;
  if p_valor_bruto is not null then
    if v_soma_itens = 0 then
      -- sem preco informado: rateia o valor total pelas sacas
      select coalesce(sum((y->>'sacas')::numeric),0) into v_soma_itens from jsonb_array_elements(p_itens) y;
      if v_soma_itens = 0 then raise exception 'VALOR_TOTAL_SEM_SACAS'; end if;
      v_fator := round(p_valor_bruto,2) / v_soma_itens; -- fator = preco medio
    else
      v_fator := round(p_valor_bruto,2) / v_soma_itens;
    end if;
    v_bruto := round(p_valor_bruto,2);
  else
    if v_soma_itens = 0 then raise exception 'VENDA_SEM_PRECO_NEM_VALOR'; end if;
    v_bruto := v_soma_itens;
  end if;
  select coalesce(sum(round((y->>'valor')::numeric,2)),0) into v_desc from jsonb_array_elements(coalesce(p_descontos,'[]'::jsonb)) y;
  v_ded := round(v_senar + v_desc, 2);
  v_liq := round(v_bruto - v_ded, 2);
  if v_liq < 0 then raise exception 'LIQUIDO_NEGATIVO'; end if;
  select coalesce(sum(round((y->>'valor')::numeric,2)),0) into v_soma_parc from jsonb_array_elements(p_parcelas) y;
  if abs(v_soma_parc - v_liq) > 0.01 then raise exception 'PARCELAS_NAO_FECHAM_LIQUIDO: parcelas % x liquido %', v_soma_parc, v_liq; end if;

  v_unid := case when p_cultura in ('amendoim','soja','milho') then 'sc' else 't' end;
  select replace(replace(replace(to_char(sum((y->>'sacas')::numeric), 'FM999G999G999G990D00'), ',', '#'), '.', ','), '#', '.') into v_sacas_txt from jsonb_array_elements(p_itens) y;
  select string_agg(case y->>'classe' when 'ate_20' then 'Ate 20 ppb' when 'acima_20' then 'Acima de 20 ppb' when 'roca' then 'Grao de roca' else coalesce(y->>'classe','') end
    || case when jsonb_array_length(p_itens) > 1 then ' '||replace(replace(replace(to_char((y->>'sacas')::numeric, 'FM999G999G999G990D00'), ',', '#'), '.', ','), '#', '.') else '' end, ' · ' order by y->>'classe') into v_classes from jsonb_array_elements(p_itens) y where (y->>'sacas')::numeric > 0;
  v_pct_txt := case when v_bruto > 0 and v_senar > 0 then replace(to_char(round(v_senar / v_bruto * 100, 2), 'FM990.00'), '.', ',')||'%' else null end;
  v_desc_rec := 'Venda '||v_sacas_txt||' '||v_unid||' '||p_cultura||coalesce(' · '||v_classes, '');
  v_desc_sen := 'Senar'||coalesce(' '||v_pct_txt, '')||' s/ venda '||v_sacas_txt||' '||v_unid||' '||p_cultura;
  v_desc_dsc := 'Descontos s/ venda '||v_sacas_txt||' '||v_unid||' '||p_cultura;

  select id, subcentro into v_plano_rec, v_subc_rec from financeiro_plano_contas where subcentro = 'Venda de '||initcap(p_cultura) and grupo_custo = 'Receita Agrícola' and cliente_id is null limit 1;
  if v_plano_rec is null then select id, subcentro into v_plano_rec, v_subc_rec from financeiro_plano_contas where subcentro = 'Venda de Outras Culturas' and grupo_custo = 'Receita Agrícola' and cliente_id is null limit 1; end if;
  select id, macro_custo, grupo_custo, centro_custo, subcentro into v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded from financeiro_plano_contas where subcentro = 'Impostos e Despesas de Vendas Agricultura' and cliente_id is null limit 1;
  if v_plano_ded is null then raise exception 'PLANO_DEDUCAO_AGRICULTURA_NAO_ENCONTRADO'; end if;

  -- substituir lancamentos manuais/importados (cancelamento logico, nunca conciliado)
  if p_substituir is not null then
    foreach v_sub in array p_substituir loop
      perform 1 from financeiro_lancamentos_v2 l where l.id = v_sub and l.cliente_id = p_cliente;
      if not found then raise exception 'SUBSTITUIR_LANCAMENTO_NAO_ENCONTRADO: %', v_sub; end if;
      perform 1 from financeiro_lancamentos_v2 l where l.id = v_sub and (l.cancelado or l.conciliado_em is not null);
      if found then raise exception 'SUBSTITUIR_LANCAMENTO_CANCELADO_OU_CONCILIADO: %', v_sub; end if;
    end loop;
  end if;

  for v_falta in
    select y->>'classe' classe, (y->>'sacas')::numeric pedido, coalesce((it->>'saldo')::numeric, 0) saldo
      from jsonb_array_elements(p_itens) y
      left join jsonb_array_elements(fn_estoque_graos(p_cliente, p_safra_id, p_cultura, v_local)) it on it->>'classe' = y->>'classe'
     where (y->>'sacas')::numeric > coalesce((it->>'saldo')::numeric, 0) + 0.005
  loop
    raise exception 'VENDA_ACIMA_DO_SALDO_DO_LOCAL: % pede % e o local tem %', v_falta.classe, v_falta.pedido, v_falta.saldo;
  end loop;

  insert into agri_operacoes_comerciais(cliente_id, fazenda_id, contraparte_fornecedor_id, tipo_operacao, cultura, safra_id, data_operacao, tipo_precificacao, condicao_pagamento, valor_bruto, descontos, valor_liquido, status_comercial, status_financeiro, observacoes, ativo, created_by)
  values (p_cliente, p_fazenda_id, p_comprador_id, 'venda_grao', p_cultura, p_safra_id, p_data, 'fixo', 'dinheiro', v_bruto, v_ded, v_liq, 'fechado', 'pendente', p_observacoes, true, auth.uid())
  returning id into v_op;

  -- entregas: valor por item (escalado se valor total), preco derivado a 4 casas
  if p_valor_bruto is not null and (select coalesce(sum(coalesce(round((y->>'valor')::numeric, 2), round((y->>'sacas')::numeric * coalesce((y->>'preco')::numeric,0), 2))),0) from jsonb_array_elements(p_itens) y) = 0 then
    insert into agri_oc_entregas(cliente_id, operacao_id, classe_aflatoxina, sacas, preco_saca, valor, local_estoque_id, created_by)
    select p_cliente, v_op, y->>'classe', (y->>'sacas')::numeric, round(v_fator, 4), round((y->>'sacas')::numeric * v_fator, 2), v_local, auth.uid()
    from jsonb_array_elements(p_itens) y;
  else
    insert into agri_oc_entregas(cliente_id, operacao_id, classe_aflatoxina, sacas, preco_saca, valor, local_estoque_id, created_by)
    select p_cliente, v_op, y->>'classe', (y->>'sacas')::numeric,
           round(coalesce(round((y->>'valor')::numeric, 2), round((y->>'sacas')::numeric * coalesce((y->>'preco')::numeric,0), 2)) * v_fator / nullif((y->>'sacas')::numeric,0), 4),
           round(coalesce(round((y->>'valor')::numeric, 2), round((y->>'sacas')::numeric * coalesce((y->>'preco')::numeric,0), 2)) * v_fator, 2), v_local, auth.uid()
    from jsonb_array_elements(p_itens) y;
  end if;
  -- centavos do escalonamento vao para a ultima linha
  select v_bruto - coalesce(sum(valor),0) into v_dif from agri_oc_entregas where operacao_id = v_op;
  if v_dif <> 0 then
    select id into v_ult from agri_oc_entregas where operacao_id = v_op order by classe_aflatoxina desc limit 1;
    update agri_oc_entregas set valor = valor + v_dif, preco_saca = round((valor + v_dif) / nullif(sacas,0), 4) where id = v_ult;
  end if;

  -- parcelas: receita bruta proporcional + deducoes proporcionais, ultima leva o residuo
  v_n := jsonb_array_length(p_parcelas);
  for i in 0 .. v_n - 1 loop
    x := p_parcelas -> i;
    v_venc := (x->>'vencimento')::date; v_parc := round((x->>'valor')::numeric, 2);
    v_pago := coalesce((x->>'pago')::boolean, false); v_pag := (x->>'data_pagamento')::date; v_conta := nullif(x->>'conta_id','')::uuid;
    if v_venc is null then raise exception 'PARCELA_SEM_VENCIMENTO'; end if;
    if v_pago and v_pag is null then v_pag := v_venc; end if;
    if v_pago then v_algum_pago := true; else v_todos_pagos := false; end if;
    if i < v_n - 1 then
      v_senar_i := round(v_senar * v_parc / nullif(v_liq,0), 2); v_desc_i := round(v_desc * v_parc / nullif(v_liq,0), 2);
      v_acum_senar := v_acum_senar + v_senar_i; v_acum_ded := v_acum_ded + v_desc_i;
    else
      v_senar_i := round(v_senar - v_acum_senar, 2); v_desc_i := round(v_desc - v_acum_ded, 2);
    end if;
    v_rec_i := round(v_parc + v_senar_i + v_desc_i, 2);
    v_status := case when v_pago then 'realizado' else 'programado' end;

    insert into financeiro_lancamentos_v2(valor, sinal, tipo_operacao, data_competencia, data_vencimento, data_pagamento, ano_mes, conta_destino_id, sem_movimentacao_caixa, status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, safra_id, fazenda_id, cliente_id, descricao, numero_documento, tipo_documento, created_by)
    values (v_rec_i, '1', '1-Entradas', p_data, v_venc, case when v_pago then v_pag end, to_char(p_data,'YYYY-MM'), v_conta, false, v_status, 'venda_avulsa', 'venda_avulsa:receita', 'agricultura', p_cultura, p_comprador_id, v_plano_rec, 'Receita Operacional', 'Receita Agrícola', 'Venda Produção', v_subc_rec, p_safra_id, p_fazenda_id, p_cliente,
            v_desc_rec||case when v_n > 1 then ' · parcela '||(i+1)||'/'||v_n else '' end, nullif(btrim(p_documento),''), case when nullif(btrim(p_documento),'') is not null then coalesce(p_tipo_documento,'Outros') end, auth.uid())
    returning id into v_lanc;
    v_lancs := v_lancs || v_lanc;
    insert into agri_oc_partes(cliente_id, operacao_id, natureza, descricao, valor, data_vencimento, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, financeiro_lancamento_id, incluso_no_total, created_by)
    values (p_cliente, v_op, 'receita_venda', 'Venda '||p_cultura||' - parcela '||(i+1)||'/'||v_n, v_rec_i, v_venc, v_plano_rec, 'Receita Operacional', 'Receita Agrícola', 'Venda Produção', v_subc_rec, v_lanc, true, auth.uid());

    if v_senar_i > 0 then
      insert into financeiro_lancamentos_v2(valor, sinal, tipo_operacao, data_competencia, data_vencimento, data_pagamento, ano_mes, conta_bancaria_id, sem_movimentacao_caixa, status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, safra_id, fazenda_id, cliente_id, descricao, numero_documento, tipo_documento, created_by)
      values (v_senar_i, '-1', '2-Saídas', p_data, v_venc, case when v_pago then v_pag end, to_char(p_data,'YYYY-MM'), v_conta, false, v_status, 'venda_avulsa', 'venda_avulsa:imposto', 'agricultura', p_cultura, p_comprador_id, v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded, p_safra_id, p_fazenda_id, p_cliente,
              v_desc_sen||case when v_n > 1 then ' · parcela '||(i+1)||'/'||v_n else '' end, nullif(btrim(p_documento),''), case when nullif(btrim(p_documento),'') is not null then coalesce(p_tipo_documento,'Outros') end, auth.uid())
      returning id into v_lanc;
      v_lancs := v_lancs || v_lanc;
      insert into agri_oc_partes(cliente_id, operacao_id, natureza, descricao, valor, data_vencimento, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, financeiro_lancamento_id, incluso_no_total, created_by)
      values (p_cliente, v_op, 'imposto', 'Senar - parcela '||(i+1)||'/'||v_n, v_senar_i, v_venc, v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded, v_lanc, true, auth.uid());
    end if;
    if v_desc_i > 0 then
      insert into financeiro_lancamentos_v2(valor, sinal, tipo_operacao, data_competencia, data_vencimento, data_pagamento, ano_mes, conta_bancaria_id, sem_movimentacao_caixa, status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, safra_id, fazenda_id, cliente_id, descricao, numero_documento, tipo_documento, created_by)
      values (v_desc_i, '-1', '2-Saídas', p_data, v_venc, case when v_pago then v_pag end, to_char(p_data,'YYYY-MM'), v_conta, false, v_status, 'venda_avulsa', 'venda_avulsa:desconto', 'agricultura', p_cultura, p_comprador_id, v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded, p_safra_id, p_fazenda_id, p_cliente,
              v_desc_dsc||case when v_n > 1 then ' · parcela '||(i+1)||'/'||v_n else '' end, nullif(btrim(p_documento),''), case when nullif(btrim(p_documento),'') is not null then coalesce(p_tipo_documento,'Outros') end, auth.uid())
      returning id into v_lanc;
      v_lancs := v_lancs || v_lanc;
      insert into agri_oc_partes(cliente_id, operacao_id, natureza, descricao, valor, data_vencimento, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, financeiro_lancamento_id, incluso_no_total, created_by)
      values (p_cliente, v_op, 'desconto', 'Descontos - parcela '||(i+1)||'/'||v_n, v_desc_i, v_venc, v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded, v_lanc, true, auth.uid());
    end if;
  end loop;

  update agri_operacoes_comerciais set status_financeiro = case when v_todos_pagos then 'liquidado' when v_algum_pago then 'parcial' else 'pendente' end where id = v_op;

  if p_substituir is not null then
    update financeiro_lancamentos_v2 set cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(),
      cancelado_motivo = 'Substituido pela venda de grao registrada no Estoque (operacao '||v_op||')', updated_at = now()
    where id = any(p_substituir);
  end if;

  return jsonb_build_object('ok', true, 'operacao_id', v_op, 'bruto', v_bruto, 'senar', v_senar, 'descontos', v_desc, 'liquido', v_liq, 'lancamentos', to_jsonb(v_lancs), 'substituidos', coalesce(array_length(p_substituir,1),0));
end $function$
;

CREATE OR REPLACE FUNCTION public.agri_venda_graos_corrigir(p_venda_id uuid, p_motivo text, p_cliente uuid, p_safra_id uuid, p_cultura text, p_fazenda_id uuid, p_comprador_id uuid, p_data date, p_itens jsonb, p_valor_bruto numeric, p_senar numeric, p_descontos jsonb, p_parcelas jsonb, p_observacoes text, p_substituir uuid[] DEFAULT NULL::uuid[], p_documento text DEFAULT NULL::text, p_tipo_documento text DEFAULT NULL::text, p_local_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_cli uuid; v_ativo boolean; v_cond text; v_pago boolean; r jsonb; v_nova uuid;
begin
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'CORRECAO_SEM_MOTIVO'; end if;
  select cliente_id, ativo, condicao_pagamento into v_cli, v_ativo, v_cond
    from agri_operacoes_comerciais where id = p_venda_id and tipo_operacao = 'venda_grao' for update;
  if v_cli is null then raise exception 'VENDA_NAO_ENCONTRADA'; end if;
  if v_cli <> p_cliente then raise exception 'VENDA_DE_OUTRO_CLIENTE'; end if;
  if v_cond <> 'dinheiro' then raise exception 'VENDA_NAO_AVULSA_CORRIJA_NO_BARTER'; end if;
  if not v_ativo then raise exception 'VENDA_JA_CANCELADA'; end if;
  select coalesce(bool_or(l.conciliado_em is not null), false) into v_pago
    from agri_oc_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id
   where p.operacao_id = p_venda_id and not l.cancelado;
  if v_pago then raise exception 'VENDA_JA_PAGA_CORRIJA_NO_FINANCEIRO'; end if;

  perform agri_venda_avulsa_cancelar(p_venda_id, 'Corrigida: '||btrim(p_motivo));
  r := agri_venda_graos_registrar(p_cliente, p_safra_id, p_cultura, p_fazenda_id, p_comprador_id, p_data, p_itens, p_valor_bruto, p_senar, p_descontos, p_parcelas, p_observacoes, p_substituir, p_documento, p_tipo_documento, p_local_id);
  v_nova := (r->>'operacao_id')::uuid;
  update agri_operacoes_comerciais set substitui_operacao_id = p_venda_id, updated_at = now(), updated_by = auth.uid() where id = v_nova;
  return r || jsonb_build_object('corrigida_de', p_venda_id, 'motivo', btrim(p_motivo));
end $function$
;

revoke all on function public.agri_local_estoque_resolver(uuid, uuid) from public;
grant execute on function public.agri_local_estoque_resolver(uuid, uuid) to authenticated;
revoke all on function public.agri_quebra_registrar(uuid, uuid, text, text, numeric, date, text, text, uuid) from public;
grant execute on function public.agri_quebra_registrar(uuid, uuid, text, text, numeric, date, text, text, uuid) to authenticated;
revoke all on function public.agri_venda_graos_registrar(uuid, uuid, text, uuid, uuid, date, jsonb, numeric, numeric, jsonb, jsonb, text, uuid[], text, text, uuid) from public;
grant execute on function public.agri_venda_graos_registrar(uuid, uuid, text, uuid, uuid, date, jsonb, numeric, numeric, jsonb, jsonb, text, uuid[], text, text, uuid) to authenticated;
revoke all on function public.agri_venda_graos_corrigir(uuid, text, uuid, uuid, text, uuid, uuid, date, jsonb, numeric, numeric, jsonb, jsonb, text, uuid[], text, text, uuid) from public;
grant execute on function public.agri_venda_graos_corrigir(uuid, text, uuid, uuid, text, uuid, uuid, date, jsonb, numeric, numeric, jsonb, jsonb, text, uuid[], text, text, uuid) to authenticated;
