-- FIN-CONTRATO-NC-SALVAR-01 — a captacao segue o creditado em conta. Roda depois da 20261027204200. Sintetico no Teste; termina em RAISE 'OK'.
--   K1 contrato novo com captacao: o salvar do cabecalho que MUDA O VALOR do contrato nao mexe no valor da captacao
--   K2 a data do contrato segue acompanhando (so' o valor deixou de acompanhar)
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  fin uuid; plano uuid; r jsonb; cap uuid;
BEGIN
  select id into plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '1-Entradas' order by ordem_exibicao limit 1;
  insert into financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato, valor_total, valor_entrada,
                              data_contrato, data_primeira_parcela, total_parcelas, status, conta_bancaria_id, taxa_juros, taxa_juros_mensal,
                              sistema_amortizacao, periodicidade)
  values (k, fz, 'financiamento', 'pecuaria', 'SINT CAPTACAO', 'SINT-8811', 1000, 0, date '2031-01-10', date '2031-02-15', 1, 'ativo', cta, 12, 0.948879, 'sac', 'anual')
  returning id into fin;
  r := public.fn_financiamento_salvar_cabecalho(fin, jsonb_build_object('gerar_lancamento_captacao', true, 'plano_conta_captacao_id', plano), false);
  cap := (r->>'lancamento_captacao_id')::uuid;
  IF (select valor from financeiro_lancamentos_v2 where id = cap) <> 1000 THEN RAISE EXCEPTION 'K0: %', r; END IF;

  /* K1 */
  r := public.fn_financiamento_salvar_cabecalho(fin, jsonb_build_object('valor_total', 1080.50), false);
  IF (select valor from financeiro_lancamentos_v2 where id = cap) <> 1000 THEN RAISE EXCEPTION 'K1: a captacao seguiu o valor do contrato'; END IF;

  /* K2 */
  r := public.fn_financiamento_salvar_cabecalho(fin, jsonb_build_object('data_contrato', '2031-01-12'), false);
  IF (select data_competencia from financeiro_lancamentos_v2 where id = cap) <> date '2031-01-12' THEN RAISE EXCEPTION 'K2'; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
