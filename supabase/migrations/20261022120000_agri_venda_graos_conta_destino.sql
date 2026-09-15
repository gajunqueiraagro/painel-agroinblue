-- PR-ESTOQUE-VENDA-05 (F3.3) — a receita da venda passa a gravar a conta em `conta_destino_id`.
--
-- ⚠ JA APLICADA NO PROTO pelo arquiteto em 15/09/2026, com GO do Gabriel. E' REGISTRO HISTORICO.
--   Nao foi reaplicada.
-- ⚠ O CORPO NAO FOI TRANSCRITO — e nem precisou. O `prosrc` encolheu EXATAMENTE 1 byte
--   (11.627 -> 11.626), e `conta_bancaria_id` -> `conta_destino_id` e' exatamente −1 caractere.
--   Reconstrui a partir da versao ja versionada na `20261021120000` trocando UMA ocorrencia de
--   cada vez e deixando o md5 julgar: a PRIMEIRA bateu (`88d86663…`, e `6934a7cd` no
--   `pg_get_functiondef`), as outras duas nao. Byte a byte, sem eu digitar uma linha.
-- ⚠ E A MEDICAO DISSE QUAL INSERT MUDOU, que e' a parte que importa: a primeira ocorrencia e' a
--   da RECEITA (logo depois de `v_rec_i`), e as outras duas — Senar e descontos — continuam em
--   `conta_bancaria_id`. Nao foi uma troca cega no arquivo inteiro.
--
-- ⚠⚠ E' CONVENCAO DO FINANCEIRO, NAO ESTILO: em `1-Entradas` a conta vai em `conta_destino_id`;
--   em saidas, em `conta_bancaria_id`. Medido pelo arquiteto: manual, OFX, importacao e rebanho
--   gravam 100% assim. A venda de graos era a excecao, e uma receita com a conta no campo de saida
--   nao aparece onde o Financeiro a procura — some do extrato da conta e da conciliacao.
-- ⚠ O SENAR CONTINUA EM `conta_bancaria_id` PORQUE ELE E' SAIDA. Os dois campos convivem na mesma
--   venda, cada um do seu lado da convencao.

create or replace function public.agri_venda_graos_registrar(
  p_cliente uuid, p_safra_id uuid, p_cultura text, p_fazenda_id uuid, p_comprador_id uuid,
  p_data date, p_itens jsonb, p_valor_bruto numeric, p_senar numeric, p_descontos jsonb,
  p_parcelas jsonb, p_observacoes text, p_substituir uuid[] default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $fn$
declare
  v_op uuid; v_bruto numeric; v_soma_itens numeric; v_fator numeric := 1;
  v_senar numeric := round(coalesce(p_senar,0),2); v_desc numeric := 0; v_ded numeric; v_liq numeric; v_soma_parc numeric;
  v_plano_rec uuid; v_subc_rec text; v_plano_ded uuid; v_macro_ded text; v_grupo_ded text; v_centro_ded text; v_subc_ded text;
  v_n int; i int; x jsonb; v_venc date; v_pago boolean; v_pag date; v_conta uuid; v_parc numeric;
  v_ded_i numeric; v_acum_ded numeric := 0; v_rec_i numeric; v_status text; v_lanc uuid; v_lancs uuid[] := '{}';
  v_todos_pagos boolean := true; v_algum_pago boolean := false; v_sub uuid; v_ult uuid; v_dif numeric;
  v_senar_i numeric; v_acum_senar numeric := 0; v_desc_i numeric;
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

    insert into financeiro_lancamentos_v2(valor, sinal, tipo_operacao, data_competencia, data_vencimento, data_pagamento, ano_mes, conta_destino_id, sem_movimentacao_caixa, status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, safra_id, fazenda_id, cliente_id, descricao, created_by)
    values (v_rec_i, '1', '1-Entradas', p_data, v_venc, case when v_pago then v_pag end, to_char(p_data,'YYYY-MM'), v_conta, false, v_status, 'venda_avulsa', 'venda_avulsa:receita', 'agricultura', p_cultura, p_comprador_id, v_plano_rec, 'Receita Operacional', 'Receita Agrícola', 'Venda Produção', v_subc_rec, p_safra_id, p_fazenda_id, p_cliente,
            'Venda '||p_cultura||case when v_n > 1 then ' - parcela '||(i+1)||'/'||v_n else '' end, auth.uid())
    returning id into v_lanc;
    v_lancs := v_lancs || v_lanc;
    insert into agri_oc_partes(cliente_id, operacao_id, natureza, descricao, valor, data_vencimento, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, financeiro_lancamento_id, incluso_no_total, created_by)
    values (p_cliente, v_op, 'receita_venda', 'Venda '||p_cultura||' - parcela '||(i+1)||'/'||v_n, v_rec_i, v_venc, v_plano_rec, 'Receita Operacional', 'Receita Agrícola', 'Venda Produção', v_subc_rec, v_lanc, true, auth.uid());

    if v_senar_i > 0 then
      insert into financeiro_lancamentos_v2(valor, sinal, tipo_operacao, data_competencia, data_vencimento, data_pagamento, ano_mes, conta_bancaria_id, sem_movimentacao_caixa, status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, safra_id, fazenda_id, cliente_id, descricao, created_by)
      values (v_senar_i, '-1', '2-Saídas', p_data, v_venc, case when v_pago then v_pag end, to_char(p_data,'YYYY-MM'), v_conta, false, v_status, 'venda_avulsa', 'venda_avulsa:imposto', 'agricultura', p_cultura, p_comprador_id, v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded, p_safra_id, p_fazenda_id, p_cliente,
              'Senar s/ venda '||p_cultura||case when v_n > 1 then ' - parcela '||(i+1)||'/'||v_n else '' end, auth.uid())
      returning id into v_lanc;
      v_lancs := v_lancs || v_lanc;
      insert into agri_oc_partes(cliente_id, operacao_id, natureza, descricao, valor, data_vencimento, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, financeiro_lancamento_id, incluso_no_total, created_by)
      values (p_cliente, v_op, 'imposto', 'Senar - parcela '||(i+1)||'/'||v_n, v_senar_i, v_venc, v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded, v_lanc, true, auth.uid());
    end if;
    if v_desc_i > 0 then
      insert into financeiro_lancamentos_v2(valor, sinal, tipo_operacao, data_competencia, data_vencimento, data_pagamento, ano_mes, conta_bancaria_id, sem_movimentacao_caixa, status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, safra_id, fazenda_id, cliente_id, descricao, created_by)
      values (v_desc_i, '-1', '2-Saídas', p_data, v_venc, case when v_pago then v_pag end, to_char(p_data,'YYYY-MM'), v_conta, false, v_status, 'venda_avulsa', 'venda_avulsa:desconto', 'agricultura', p_cultura, p_comprador_id, v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded, p_safra_id, p_fazenda_id, p_cliente,
              'Descontos s/ venda '||p_cultura||case when v_n > 1 then ' - parcela '||(i+1)||'/'||v_n else '' end, auth.uid())
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
end $fn$;

revoke all on function public.agri_venda_graos_registrar(uuid, uuid, text, uuid, uuid, date, jsonb, numeric, numeric, jsonb, jsonb, text, uuid[]) from public;
grant execute on function public.agri_venda_graos_registrar(uuid, uuid, text, uuid, uuid, date, jsonb, numeric, numeric, jsonb, jsonb, text, uuid[]) to authenticated;

-- ── O BACKFILL DOS 4 LANCAMENTOS JA GRAVADOS ─────────────────────────────────────────────────
-- ⚠ IDEMPOTENTE POR CONSTRUCAO: `conta_destino_id is null and conta_bancaria_id is not null` so'
--   e' verdade uma vez por linha — depois de mover, a condicao deixa de casar. Rodar de novo nao
--   mexe em nada.
-- ⚠ E ELE E' ESTREITO DE PROPOSITO: so' `origem_tipo = 'venda_avulsa:receita'` e so'
--   `1-Entradas`. O Senar da mesma venda tem outro `origem_tipo` e e' saida — move-lo aqui
--   inverteria a convencao que este PR veio cumprir.
update financeiro_lancamentos_v2
   set conta_destino_id = conta_bancaria_id, conta_bancaria_id = null, updated_at = now()
 where origem_tipo = 'venda_avulsa:receita' and tipo_operacao = '1-Entradas'
   and conta_destino_id is null and conta_bancaria_id is not null;
