-- PR-ESTOQUE-VENDA-07 — a descricao do lancamento diz o que foi vendido, e a venda leva documento.
--
-- ⚠ JA APLICADA NO PROTO pelo arquiteto em 15/09/2026, com GO do Gabriel. E' REGISTRO HISTORICO.
--   Nao foi reaplicada.
--
-- ⚠⚠ A ASSINATURA MUDOU, e por isso o `drop` vem antes. A versao de 13 argumentos foi DROPADA no
--   banco e so' existe a de 15 (`p_documento`, `p_tipo_documento`). Sem o drop, um `create or
--   replace` deixaria as DUAS vivas: o PostgREST escolhe por nome de argumento, e a chamada do
--   front — que agora manda 15 nomes — passaria a casar com uma e nao com a outra conforme o dia.
--   Duas funcoes de mesmo nome sao duas verdades sobre o mesmo ato.
-- ⚠ CONFERIDO EM pg_proc ANTES DE ESCREVER: existe UMA unica `agri_venda_graos_registrar`, a de
--   15 argumentos. O drop abaixo descreve o que ja aconteceu, nao um segundo apagamento.
--
-- ⚠ O CORPO FOI EXTRAIDO DO BANCO, NAO DIGITADO. `pg_get_functiondef` veio em seis blocos base64
--   de 2.400 caracteres, remontado aqui e conferido pelo md5 do conjunto:
--     md5(pg_get_functiondef) = 4d9f8a74a2dcab8f2d894cafa4b30777   (13.876 caracteres)
--     md5(prosrc)             = 648afae5811ba1d9408d9be8e943d7ed   (13.362 caracteres)
--   So' hashes atravessaram a transcricao. Um `e` perdido numa palavra ja derrubou uma versao
--   anterior deste mesmo arquivo — o md5 e' o que impede isso de virar registro infiel.
--
-- ⚠⚠ O QUE MUDOU DE COMPORTAMENTO, em duas frentes:
--
--   1. A DESCRICAO PASSA A DIZER O QUE FOI VENDIDO. Era "Venda amendoim - parcela 1/2"; e'
--      "Venda 3.549,31 sc amendoim · Ate 20 ppb · parcela 1/2". O Senar acompanha, com o
--      percentual efetivo: "Senar 0,20% s/ venda 3.549,31 sc amendoim · parcela 1/2".
--      ⚠ A UNIDADE VEM DA CULTURA (`sc` para amendoim/soja/milho, `t` para o resto) e o numero e'
--        formatado em pt-BR dentro do SQL, com o rodeio do `to_char` + tres `replace`: o
--        `to_char` do Postgres nao tem locale por sessao aqui, entao troca-se `,`->`#`,
--        `.`->`,` e `#`->`.`. Feio e deliberado — a alternativa era mandar o texto pronto do
--        front, e ai' a descricao gravada dependeria de quem chamou.
--      ⚠ AS CLASSES SO' ENTRAM COM SACAS > 0, e a quantidade por classe so' aparece quando ha'
--        mais de um item: numa venda de uma classe so', repetir a quantidade ao lado do nome
--        diria duas vezes o mesmo numero.
--      ⚠ `agri_oc_partes.descricao` NAO MUDOU — continua "Venda amendoim - parcela 1/2". A parte
--        e' o elo interno da operacao; quem o operador le' no Financeiro e' o lancamento.
--
--   2. A VENDA GRAVA DOCUMENTO. `p_documento` vai para `numero_documento` e `p_tipo_documento`
--      para `tipo_documento`, nos TRES lancamentos — receita, Senar e descontos.
--      ⚠ `nullif(btrim(p_documento),'')` NOS TRES: documento em branco e' documento ausente, e
--        gravar string vazia faria o filtro do Financeiro achar uma linha que nao tem documento.
--      ⚠ O TIPO SO' EXISTE COM NUMERO — `case when ... is not null then coalesce(p_tipo_documento,
--        'Outros') end`. Tipo sem numero seria uma classificacao de nada.
--
-- ⚠ A EDICAO CONTINUA SEM DOCUMENTO. `agri_venda_avulsa_editar` tem 4 argumentos
--   (uuid, date, uuid, text) e nao aceita documento — conferido em pg_proc. Por isso o modal
--   mostra os campos de documento TRAVADOS no modo editar, dizendo onde se edita.

drop function if exists public.agri_venda_graos_registrar(uuid,uuid,text,uuid,uuid,date,jsonb,numeric,numeric,jsonb,jsonb,text,uuid[]);

CREATE OR REPLACE FUNCTION public.agri_venda_graos_registrar(p_cliente uuid, p_safra_id uuid, p_cultura text, p_fazenda_id uuid, p_comprador_id uuid, p_data date, p_itens jsonb, p_valor_bruto numeric, p_senar numeric, p_descontos jsonb, p_parcelas jsonb, p_observacoes text, p_substituir uuid[] DEFAULT NULL::uuid[], p_documento text DEFAULT NULL::text, p_tipo_documento text DEFAULT NULL::text)
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
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'VENDA_SEM_ITENS'; end if;
  if p_parcelas is null or jsonb_array_length(p_parcelas) = 0 then raise exception 'VENDA_SEM_PARCELAS'; end if;
  if p_data is null then raise exception 'DATA_OBRIGATORIA'; end if;

  select coalesce(sum(round((y->>'sacas')::numeric * coalesce((y->>'preco')::numeric,0), 2)),0) into v_soma_itens from jsonb_array_elements(p_itens) y;
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

  insert into agri_operacoes_comerciais(cliente_id, fazenda_id, contraparte_fornecedor_id, tipo_operacao, cultura, safra_id, data_operacao, tipo_precificacao, condicao_pagamento, valor_bruto, descontos, valor_liquido, status_comercial, status_financeiro, observacoes, ativo, created_by)
  values (p_cliente, p_fazenda_id, p_comprador_id, 'venda_grao', p_cultura, p_safra_id, p_data, 'fixo', 'dinheiro', v_bruto, v_ded, v_liq, 'fechado', 'pendente', p_observacoes, true, auth.uid())
  returning id into v_op;

  -- entregas: valor por item (escalado se valor total), preco derivado a 4 casas
  if p_valor_bruto is not null and (select coalesce(sum(round((y->>'sacas')::numeric * coalesce((y->>'preco')::numeric,0), 2)),0) from jsonb_array_elements(p_itens) y) = 0 then
    insert into agri_oc_entregas(cliente_id, operacao_id, classe_aflatoxina, sacas, preco_saca, valor, created_by)
    select p_cliente, v_op, y->>'classe', (y->>'sacas')::numeric, round(v_fator, 4), round((y->>'sacas')::numeric * v_fator, 2), auth.uid()
    from jsonb_array_elements(p_itens) y;
  else
    insert into agri_oc_entregas(cliente_id, operacao_id, classe_aflatoxina, sacas, preco_saca, valor, created_by)
    select p_cliente, v_op, y->>'classe', (y->>'sacas')::numeric,
           round(round((y->>'sacas')::numeric * (y->>'preco')::numeric, 2) * v_fator / nullif((y->>'sacas')::numeric,0), 4),
           round(round((y->>'sacas')::numeric * (y->>'preco')::numeric, 2) * v_fator, 2), auth.uid()
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

revoke all on function public.agri_venda_graos_registrar(uuid, uuid, text, uuid, uuid, date, jsonb, numeric, numeric, jsonb, jsonb, text, uuid[], text, text) from public;
grant execute on function public.agri_venda_graos_registrar(uuid, uuid, text, uuid, uuid, date, jsonb, numeric, numeric, jsonb, jsonb, text, uuid[], text, text) to authenticated;

-- ── O BACKFILL DAS 4 DESCRICOES JA GRAVADAS ──────────────────────────────────────────────────
-- ⚠ SAO OS QUATRO LANCAMENTOS DA VENDA REAL DE 23/24 (3.549,31 sc de amendoim em duas parcelas),
--   gravados antes desta versao da RPC. A funcao nova so' vale para o que for registrado daqui
--   em diante — corrigir o passado e' este UPDATE, por id, um a um.
-- ⚠ POR ID E COM A DESCRICAO ANTIGA NA CLAUSULA: `where id = ... and descricao = '<a antiga>'`
--   torna o passo IDEMPOTENTE e AUDITAVEL. Rodar de novo nao casa (a descricao ja e' a nova), e
--   se alguem tiver editado a linha a mao no meio do caminho, o UPDATE nao a atropela — ele
--   simplesmente nao encontra, e a divergencia fica visivel em vez de ser apagada.
-- ⚠ OS TEXTOS FORAM LIDOS DO BANCO, nao redigitados: vieram no mesmo `select` que trouxe os ids,
--   com `encode(convert_to(descricao,'UTF8'),'base64')` ao lado para conferir o `·` (U+00B7) e a
--   virgula decimal. O ponto do meio e' MEIO, nao bullet — trocar por `-` mudaria a descricao de
--   4 lancamentos reais do Financeiro.
-- ⚠ E A DESCRICAO ANTIGA NAO FOI ADIVINHADA — foi LIDA da versao anterior da RPC, versionada na
--   `20261022120000`. A primeira tentativa escreveu 'Senar - parcela 1/2', que e' o texto de
--   `agri_oc_partes`, NAO o do lancamento: o lancamento dizia 'Senar s/ venda amendoim - parcela
--   1/2'. Os dois textos convivem na mesma venda, em tabelas diferentes, e so' um deles e' o que
--   este UPDATE toca. Um `where` com o texto errado nao teria falhado — teria simplesmente nao
--   casado, e o registro historico afirmaria uma correcao que nunca aconteceu.

update financeiro_lancamentos_v2 set descricao = 'Venda 3.549,31 sc amendoim · Ate 20 ppb · parcela 1/2', updated_at = now()
 where id = '523310ce-0805-4d3b-a61f-bc425d1e8de0' and descricao = 'Venda amendoim - parcela 1/2';

update financeiro_lancamentos_v2 set descricao = 'Venda 3.549,31 sc amendoim · Ate 20 ppb · parcela 2/2', updated_at = now()
 where id = '79ff67ff-e8c1-4331-8183-2f418c3db355' and descricao = 'Venda amendoim - parcela 2/2';

update financeiro_lancamentos_v2 set descricao = 'Senar 0,20% s/ venda 3.549,31 sc amendoim · parcela 1/2', updated_at = now()
 where id = '8b0df43a-582e-44b3-bf5e-ebf342e4fd24' and descricao = 'Senar s/ venda amendoim - parcela 1/2';

update financeiro_lancamentos_v2 set descricao = 'Senar 0,20% s/ venda 3.549,31 sc amendoim · parcela 2/2', updated_at = now()
 where id = '490cc696-7007-4f83-a343-2fde2a524113' and descricao = 'Senar s/ venda amendoim - parcela 2/2';
