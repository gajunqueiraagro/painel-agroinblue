-- FIN-FINANC-28 · EDITAR = CADASTRO NOVO v2 — parte B: regerar, desfazer, cabecalho, ACL. Sintetico no Teste; termina em RAISE 'OK'.
--   B1 'manter_ajustes': a ajustada fica intacta; as outras somam saldo − principal da ajustada; o motor regera os lancamentos
--   B2 'recalcular_todas': todas substituidas, principal = saldo, nenhuma ajustada
--   B3 desfazer a ultima volta ao antes (foto igual); desfazer uma que nao e' a ultima recusa; motivo obrigatorio
--   B4 salvar cabecalho: liga a captacao (cria), muda o valor (atualiza), desliga (cancela pelo dono); cronograma_mudou diz o que mudou
--   B5 ACL: anon nao executa as publicas; authenticated nao executa as internas; outro usuario -> 42501
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  fin uuid; pa uuid; r jsonb; r2 jsonb; i int; foto1 jsonb; op1 uuid; op2 uuid; plano uuid; cap uuid; s text;
BEGIN
  insert into financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato, valor_total, valor_entrada,
                              data_contrato, data_primeira_parcela, total_parcelas, status, conta_bancaria_id, taxa_juros, taxa_juros_mensal,
                              sistema_amortizacao, periodicidade)
  values (k, fz, 'financiamento', 'pecuaria', 'SINT REGERAR', 'SINT-6611', 3000, 0, date '2031-01-10', date '2031-02-15', 3, 'ativo', cta, 12, 0.948879, 'sac', 'mensal')
  returning id into fin;
  FOR i IN 1..3 LOOP
    insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
    values (fin, k, i, (date '2031-02-15' + make_interval(months => i - 1))::date, 1000, 10, 1010, 'pendente');
  END LOOP;
  r := public.fn_reconciliar_financiamento(fin, false, true);
  insert into financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma) values (k, fin, date '2026-01-10', 3000, 'fornecedor');  -- o saldo e' o de hoje: a liberacao tem de ser passada
  select id into pa from financiamento_parcelas where financiamento_id = fin and numero_parcela = 3;
  r := public.fn_financiamento_parcelas_editar(fin, jsonb_build_object('alterar', jsonb_build_array(jsonb_build_object('id', pa, 'valor_principal', 400))), false);

  /* B1 */
  foto1 := public._fn_parcelas_foto(fin);
  r := public.fn_financiamento_parcelas_regerar(fin, 'manter_ajustes', false);
  IF (select valor_principal from financiamento_parcelas where id = pa) <> 400 or not (select ajustada from financiamento_parcelas where id = pa)
     or (select sum(valor_principal) from financiamento_parcelas where financiamento_id = fin and status <> 'cancelado' and id <> pa) <> 2600
     or (r #>> '{base,principal}')::numeric <> 2600
     or exists (select 1 from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id
                 where q.financiamento_id = fin and q.status <> 'cancelado' and (l.cancelado or l.valor <> q.valor_principal))
  THEN RAISE EXCEPTION 'B1: % %', r -> 'base', public._fn_parcelas_foto(fin); END IF;
  op1 := (r ->> 'operacao_id')::uuid;

  /* B2 */
  r2 := public._fn_parcelas_foto(fin);
  r := public.fn_financiamento_parcelas_regerar(fin, 'recalcular_todas', false);
  op2 := (r ->> 'operacao_id')::uuid;
  IF (select sum(valor_principal) from financiamento_parcelas where financiamento_id = fin and status <> 'cancelado') <> 3000
     or exists (select 1 from financiamento_parcelas where financiamento_id = fin and ajustada and status <> 'cancelado')
  THEN RAISE EXCEPTION 'B2: %', public._fn_parcelas_foto(fin); END IF;

  /* B3 */
  BEGIN
    r := public.fn_financiamento_parcelas_desfazer(op1, 'teste', false);
    RAISE EXCEPTION 'B3 desfez a que nao e a ultima';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF sqlerrm not like 'Só a última alteração%' THEN RAISE EXCEPTION 'B3 recusa: %', sqlerrm; END IF;
  END;
  BEGIN
    r := public.fn_financiamento_parcelas_desfazer(op2, '  ', false);
    RAISE EXCEPTION 'B3 sem motivo passou';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF sqlerrm not like 'Informe o motivo%' THEN RAISE EXCEPTION 'B3 motivo: %', sqlerrm; END IF;
  END;
  r := public.fn_financiamento_parcelas_desfazer(op2, 'teste', false);
  IF (select jsonb_agg(e - 'tipo' order by e->>'id') from jsonb_array_elements(public._fn_parcelas_foto(fin)) e where e->>'status' <> 'cancelado')
     is distinct from (select jsonb_agg(e - 'tipo' order by e->>'id') from jsonb_array_elements(r2) e where e->>'status' <> 'cancelado')
     or (select desfeita_em from financiamento_parcelas_operacoes where id = op2) is null
  THEN RAISE EXCEPTION 'B3 foto: % x %', public._fn_parcelas_foto(fin), r2; END IF;

  /* B4 */
  select id into plano from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '1-Entradas' order by ordem_exibicao limit 1;
  r := public.fn_financiamento_salvar_cabecalho(fin, jsonb_build_object('gerar_lancamento_captacao', true, 'plano_conta_captacao_id', plano,
         'descricao', 'SINT REGERAR 2'), false);
  cap := (select lancamento_captacao_id from financiamentos where id = fin);
  IF r ->> 'captacao' <> 'criada' or cap is null or (r ->> 'cronograma_mudou')::boolean
     or (select valor from financeiro_lancamentos_v2 where id = cap) <> 3000 or (select conta_destino_id from financeiro_lancamentos_v2 where id = cap) <> cta
  THEN RAISE EXCEPTION 'B4 criar: %', r; END IF;
  r := public.fn_financiamento_salvar_cabecalho(fin, jsonb_build_object('valor_total', 3200, 'taxa_aa', 10), false);
  IF r ->> 'captacao' <> 'atualizada' or (select valor from financeiro_lancamentos_v2 where id = cap) <> 3200
     or not (r -> 'campos_do_cronograma') @> '["valor","taxa"]' or not (r ->> 'cronograma_mudou')::boolean
     or (select total_parcelas from financiamentos where id = fin) <> 3
  THEN RAISE EXCEPTION 'B4 atualizar: %', r; END IF;
  r := public.fn_financiamento_salvar_cabecalho(fin, jsonb_build_object('linha_credito_id', null), false);
  IF (r ->> 'cronograma_mudou')::boolean THEN RAISE EXCEPTION 'B4 linha de credito mudou o cronograma'; END IF;
  r := public.fn_financiamento_salvar_cabecalho(fin, jsonb_build_object('gerar_lancamento_captacao', false), false);
  IF r ->> 'captacao' <> 'cancelada' or not (select cancelado from financeiro_lancamentos_v2 where id = cap) THEN RAISE EXCEPTION 'B4 cancelar: %', r; END IF;
  r := public.fn_financiamento_salvar_cabecalho(fin, jsonb_build_object('natureza', 'consorcio'));
  IF r #>> '{recusa,frase}' is distinct from 'Campo natureza não se edita aqui.' THEN RAISE EXCEPTION 'B4 natureza: %', r; END IF;

  /* B5 */
  FOREACH s IN ARRAY array['public.fn_financiamento_salvar_cabecalho(uuid, jsonb, boolean)', 'public.fn_financiamento_parcelas_editar(uuid, jsonb, boolean)',
                           'public.fn_financiamento_parcelas_regerar(uuid, text, boolean)', 'public.fn_financiamento_parcelas_desfazer(uuid, text, boolean)'] LOOP
    IF has_function_privilege('anon', s, 'execute') or not has_function_privilege('authenticated', s, 'execute') THEN RAISE EXCEPTION 'B5 publica %', s; END IF;
  END LOOP;
  FOREACH s IN ARRAY array['public._fn_financiamento_parcelas_editar_exec(uuid, jsonb)', 'public._fn_financiamento_parcelas_regerar_exec(uuid, text)',
                           'public._fn_parcela_credito_retirar(uuid, text)', 'public._fn_financiamento_salvar_cabecalho_exec(uuid, jsonb)'] LOOP
    IF has_function_privilege('authenticated', s, 'execute') THEN RAISE EXCEPTION 'B5 interna %', s; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  BEGIN
    r := public.fn_financiamento_parcelas_regerar(fin, 'recalcular_todas');
    RAISE EXCEPTION 'B5 tenant passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE EXCEPTION 'OK';
END $t$;
