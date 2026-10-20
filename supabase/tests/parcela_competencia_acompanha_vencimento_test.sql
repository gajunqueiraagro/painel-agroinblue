-- CONC-BLOCO-SINAL-MISTO-01 item 2 — a competencia dos lancamentos da parcela acompanha o vencimento ajustado. Roda depois da
-- 20261027203800. Sintetico no Teste (financiamento com juros, em 2031); termina em RAISE 'OK'.
--   V1 editar o vencimento da parcela 2 (o gesto da tela): principal e juros dela ganham vencimento E competencia novos; ano_mes junto
--   V2 a parcela que nao mudou de vencimento nao e' tocada (competencia diferente do vencimento fica como estava)
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  fin uuid; p1 uuid; p2 uuid; r jsonb; i int; l1 uuid;
BEGIN
  insert into financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato, valor_total, valor_entrada,
                              data_contrato, data_primeira_parcela, total_parcelas, status, conta_bancaria_id, taxa_juros, taxa_juros_mensal,
                              sistema_amortizacao, periodicidade)
  values (k, fz, 'financiamento', 'pecuaria', 'SINT COMPETENCIA', 'SINT-7711', 2000, 0, date '2031-01-10', date '2031-02-15', 2, 'ativo', cta, 12, 0.948879, 'sac', 'mensal')
  returning id into fin;
  FOR i IN 1..2 LOOP
    insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
    values (fin, k, i, (date '2031-02-15' + make_interval(months => i - 1))::date, 1000, 10, 1010, 'pendente');
  END LOOP;
  r := public.fn_reconciliar_financiamento(fin, false, true);
  select id, lancamento_id into p1, l1 from financiamento_parcelas where financiamento_id = fin and numero_parcela = 1;
  select id into p2 from financiamento_parcelas where financiamento_id = fin and numero_parcela = 2;
  -- a parcela 1 com competencia diferente do vencimento (o legado), e que o gesto nao toca
  update financeiro_lancamentos_v2 set data_competencia = date '2031-01-10' where id = l1;

  /* V1 */
  r := public.fn_financiamento_parcelas_editar(fin, jsonb_build_object('alterar', jsonb_build_array(jsonb_build_object('id', p2, 'data_vencimento', '2031-04-20'))), false);
  IF (select count(*) from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id in (q.lancamento_id, q.lancamento_juros_id)
       where q.id = p2 and l.cancelado is not true and l.data_vencimento = date '2031-04-20' and l.data_competencia = date '2031-04-20' and l.ano_mes = '2031-04') <> 2
  THEN RAISE EXCEPTION 'V1: %', (select jsonb_agg(jsonb_build_object('v', l.data_vencimento, 'c', l.data_competencia, 'am', l.ano_mes))
       from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id in (q.lancamento_id, q.lancamento_juros_id) where q.id = p2); END IF;

  /* V2 */
  IF (select data_competencia from financeiro_lancamentos_v2 where id = l1) <> date '2031-01-10' THEN RAISE EXCEPTION 'V2: a parcela 1 foi tocada'; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
