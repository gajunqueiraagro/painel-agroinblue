-- PR-FIN-DATAS-04A — teste do writer oficial de financiamento (RPC
--   fn_reconciliar_parcela_financiamento) preservando data_vencimento.
--   BEGIN...ROLLBACK: nada persiste. Requer aplicada a migration
--   20260729160000_pr_fin_datas_04a_financiamento_vencimento. Rodar SOMENTE no PROTO
--   (binbcdfbisgscrifztia). Falha => RAISE EXCEPTION (aborta a transação).
--
--   Parte A (CATÁLOGO — robusto, sem fixtures): assinatura da função; existência da coluna;
--     a definição referencia data_vencimento vindo da PARCELA; não copia data_pagamento p/ venc.
--   Parte B (COMPORTAMENTAL — fixtures mínimas nas tabelas reais): criação (principal+juros
--     recebem o mesmo venc; data_pagamento/competencia/ano_mes/status legados); idempotência
--     (ids estáveis); mudança de venc re-projeta; baixa preserva venc e grava pagamento efetivo;
--     dry-run não persiste. Fixtures usam cliente/fazenda/planos de teste do Proto
--     (mesmo padrão do fin_flags_01a_..._test.sql); em BEGIN...ROLLBACK.
--
--   LIMITAÇÃO REGISTRADA: as proteções de editado_manual/conciliado_em NÃO existem no ramo de
--   ATUALIZAÇÃO de campos da RPC (apenas no cancelamento em cascata TS) — logo não há "proteção
--   de update" a testar aqui; esta PR preserva exatamente o comportamento vigente. Estorno é
--   coberto por retorno de 'pago' → 'pendente' (não por rotina de estorno dedicada).

BEGIN;

-- ─────────────────────── PARTE A — CATÁLOGO / DEFINIÇÃO ───────────────────────
DO $a$
DECLARE
  v_args text;
  v_src  text;
  v_col  int;
BEGIN
  -- A1: função existe com a assinatura esperada (4 args na ordem correta)
  SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_reconciliar_parcela_financiamento';
  IF v_args IS NULL THEN RAISE EXCEPTION '04A: função fn_reconciliar_parcela_financiamento não existe'; END IF;
  IF v_args IS DISTINCT FROM 'p_parcela_id uuid, p_dry_run boolean, p_recalcula_vt boolean, p_conta_bancaria_id uuid'
    THEN RAISE EXCEPTION '04A: assinatura inesperada: %', v_args; END IF;

  -- A2: coluna data_vencimento existe em financeiro_lancamentos_v2
  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financeiro_lancamentos_v2' AND column_name='data_vencimento';
  IF v_col <> 1 THEN RAISE EXCEPTION '04A: coluna data_vencimento ausente'; END IF;

  -- A3: a definição referencia data_vencimento e usa a PARCELA como fonte
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_reconciliar_parcela_financiamento';
  IF position('data_vencimento' IN v_src) = 0 THEN
    RAISE EXCEPTION '04A: definição não referencia data_vencimento';
  END IF;
  IF position('''data_vencimento'', v_parcela.data_vencimento' IN v_src) = 0 THEN
    RAISE EXCEPTION '04A: builder não usa v_parcela.data_vencimento como fonte';
  END IF;
  IF position('(v_novo->>''data_vencimento'')::date' IN v_src) = 0 THEN
    RAISE EXCEPTION '04A: INSERT não grava data_vencimento a partir do payload';
  END IF;
  -- A4: NÃO copia data_pagamento para data_vencimento
  IF position('''data_vencimento'', v_data_pag' IN v_src) <> 0 THEN
    RAISE EXCEPTION '04A: proibido — venc atribuído a partir de v_data_pag (pagamento)';
  END IF;

  RAISE NOTICE '04A/A: catálogo OK (assinatura, coluna, fonte=parcela, sem cópia de pagamento).';
END
$a$;

-- ─────────────────────── PARTE B — COMPORTAMENTAL (fixtures) ───────────────────────
DO $b$
DECLARE
  -- fixtures oficiais de teste do Proto (mesmo padrão do fin_flags_01a test)
  v_cli uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  v_faz uuid := '161b905e-f14c-4a9b-965f-dd3c8f82dc74';
  v_fin uuid; v_par uuid;
  v_venc1 date := (CURRENT_DATE + 90);   -- vencimento futuro (=> status 'programado')
  v_contr date := (CURRENT_DATE - 10);   -- data do contrato (competência)
  v_venc2 date := (CURRENT_DATE + 120);  -- novo vencimento (mudança)
  v_pag   date := (CURRENT_DATE - 5);    -- pagamento efetivo (baixa antecipada vs venc futuro)
  v_lp uuid; v_lj uuid; v_lp2 uuid; v_lj2 uuid;
  v_res jsonb; v_venc_lp date; v_venc_lj date; v_pagto_lp date; v_comp_lp date; v_anomes text; v_status text;
  v_cnt int;
BEGIN
  -- financiamento pecuária (planos hardcoded da RPC existem no Proto p/ pecuária)
  INSERT INTO financiamentos (id, cliente_id, fazenda_id, tipo_financiamento, descricao, numero_contrato, data_contrato, status)
  VALUES (gen_random_uuid(), v_cli, v_faz, 'pecuaria', 'TESTE 04A', 'C-04A', v_contr, 'ativo')
  RETURNING id INTO v_fin;

  -- parcela pendente com principal e juros > 0
  INSERT INTO financiamento_parcelas (id, financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  VALUES (gen_random_uuid(), v_fin, v_cli, 1, v_venc1, 1000, 200, 1200, 'pendente')
  RETURNING id INTO v_par;

  -- ── Criação (execução real) ──
  v_res := public.fn_reconciliar_parcela_financiamento(v_par, false, false, NULL);
  SELECT lancamento_id, lancamento_juros_id INTO v_lp, v_lj FROM financiamento_parcelas WHERE id=v_par;
  IF v_lp IS NULL OR v_lj IS NULL THEN RAISE EXCEPTION '04A/B: criação não gerou principal+juros (lp=%, lj=%)', v_lp, v_lj; END IF;

  -- B4/B5: ambos recebem o MESMO data_vencimento = parcela.data_vencimento
  SELECT data_vencimento INTO v_venc_lp FROM financeiro_lancamentos_v2 WHERE id=v_lp;
  SELECT data_vencimento INTO v_venc_lj FROM financeiro_lancamentos_v2 WHERE id=v_lj;
  IF v_venc_lp IS DISTINCT FROM v_venc1 THEN RAISE EXCEPTION '04A/B: principal venc=% esperado %', v_venc_lp, v_venc1; END IF;
  IF v_venc_lj IS DISTINCT FROM v_venc1 THEN RAISE EXCEPTION '04A/B: juros venc=% esperado %', v_venc_lj, v_venc1; END IF;

  -- B6/B7/B8/B9: legados — data_pagamento(=venc p/ programado), competencia(=contrato), ano_mes, status
  SELECT data_pagamento, data_competencia, ano_mes, status_transacao INTO v_pagto_lp, v_comp_lp, v_anomes, v_status
    FROM financeiro_lancamentos_v2 WHERE id=v_lp;
  IF v_pagto_lp IS DISTINCT FROM v_venc1 THEN RAISE EXCEPTION '04A/B: data_pagamento legado esperado=venc(%), obtido=%', v_venc1, v_pagto_lp; END IF;
  IF v_comp_lp IS DISTINCT FROM v_contr THEN RAISE EXCEPTION '04A/B: data_competencia esperado=contrato(%), obtido=%', v_contr, v_comp_lp; END IF;
  IF v_anomes IS DISTINCT FROM to_char(v_venc1,'YYYY-MM') THEN RAISE EXCEPTION '04A/B: ano_mes inesperado %', v_anomes; END IF;
  IF v_status IS DISTINCT FROM 'programado' THEN RAISE EXCEPTION '04A/B: status esperado programado, obtido %', v_status; END IF;

  -- B10/B11/B12: rerun idempotente — sem duplicar, ids estáveis
  PERFORM public.fn_reconciliar_parcela_financiamento(v_par, false, false, NULL);
  SELECT lancamento_id, lancamento_juros_id INTO v_lp2, v_lj2 FROM financiamento_parcelas WHERE id=v_par;
  IF v_lp2 IS DISTINCT FROM v_lp OR v_lj2 IS DISTINCT FROM v_lj THEN RAISE EXCEPTION '04A/B: rerun trocou ids'; END IF;
  SELECT count(*) INTO v_cnt FROM financeiro_lancamentos_v2
   WHERE observacao IN ('parcela:'||v_par::text||':parcela_principal','parcela:'||v_par::text||':parcela_juros') AND cancelado=false;
  IF v_cnt <> 2 THEN RAISE EXCEPTION '04A/B: rerun duplicou (ativos=%)', v_cnt; END IF;

  -- B13/B14/B15: mudança de vencimento re-projeta os dois espelhos, sem recriar
  UPDATE financiamento_parcelas SET data_vencimento=v_venc2 WHERE id=v_par;
  PERFORM public.fn_reconciliar_parcela_financiamento(v_par, false, false, NULL);
  SELECT lancamento_id, lancamento_juros_id INTO v_lp2, v_lj2 FROM financiamento_parcelas WHERE id=v_par;
  IF v_lp2 IS DISTINCT FROM v_lp OR v_lj2 IS DISTINCT FROM v_lj THEN RAISE EXCEPTION '04A/B: mudança de venc recriou/trocou ids'; END IF;
  SELECT data_vencimento INTO v_venc_lp FROM financeiro_lancamentos_v2 WHERE id=v_lp;
  SELECT data_vencimento INTO v_venc_lj FROM financeiro_lancamentos_v2 WHERE id=v_lj;
  IF v_venc_lp IS DISTINCT FROM v_venc2 OR v_venc_lj IS DISTINCT FROM v_venc2 THEN
    RAISE EXCEPTION '04A/B: venc não re-projetado (lp=%, lj=%, esperado %)', v_venc_lp, v_venc_lj, v_venc2; END IF;

  -- B16/B18: baixa antecipada — venc preservado, data_pagamento efetiva anterior, status realizado, sem duplicar
  UPDATE financiamento_parcelas SET status='pago', data_pagamento=v_pag WHERE id=v_par;
  PERFORM public.fn_reconciliar_parcela_financiamento(v_par, false, false, NULL);
  SELECT data_vencimento, data_pagamento, status_transacao INTO v_venc_lp, v_pagto_lp, v_status FROM financeiro_lancamentos_v2 WHERE id=v_lp;
  IF v_venc_lp IS DISTINCT FROM v_venc2 THEN RAISE EXCEPTION '04A/B: baixa não preservou venc (%, esperado %)', v_venc_lp, v_venc2; END IF;
  IF v_pagto_lp IS DISTINCT FROM v_pag THEN RAISE EXCEPTION '04A/B: baixa não gravou pagamento efetivo (%, esperado %)', v_pagto_lp, v_pag; END IF;
  IF v_status IS DISTINCT FROM 'realizado' THEN RAISE EXCEPTION '04A/B: baixa status esperado realizado, obtido %', v_status; END IF;
  SELECT count(*) INTO v_cnt FROM financeiro_lancamentos_v2
   WHERE observacao IN ('parcela:'||v_par::text||':parcela_principal','parcela:'||v_par::text||':parcela_juros') AND cancelado=false;
  IF v_cnt <> 2 THEN RAISE EXCEPTION '04A/B: baixa duplicou (ativos=%)', v_cnt; END IF;

  -- B19: estorno (pago→pendente) preserva/ressincroniza venc; volta status não-realizado
  UPDATE financiamento_parcelas SET status='pendente', data_pagamento=NULL WHERE id=v_par;
  PERFORM public.fn_reconciliar_parcela_financiamento(v_par, false, false, NULL);
  SELECT data_vencimento, status_transacao INTO v_venc_lp, v_status FROM financeiro_lancamentos_v2 WHERE id=v_lp;
  IF v_venc_lp IS DISTINCT FROM v_venc2 THEN RAISE EXCEPTION '04A/B: estorno perdeu venc'; END IF;
  IF v_status = 'realizado' THEN RAISE EXCEPTION '04A/B: estorno manteve realizado'; END IF;

  -- B20/B21: dry-run não persiste e sinaliza divergência de venc (após novo venc)
  UPDATE financiamento_parcelas SET data_vencimento=(CURRENT_DATE + 200) WHERE id=v_par;
  v_res := public.fn_reconciliar_parcela_financiamento(v_par, true, false, NULL);   -- dry-run
  SELECT data_vencimento INTO v_venc_lp FROM financeiro_lancamentos_v2 WHERE id=v_lp;
  IF v_venc_lp IS DISTINCT FROM v_venc2 THEN RAISE EXCEPTION '04A/B: dry-run PERSISTIU alteração de venc'; END IF;
  IF position('data_vencimento' IN v_res::text) = 0 THEN
    RAISE EXCEPTION '04A/B: dry-run não sinalizou divergência de data_vencimento';
  END IF;

  RAISE NOTICE '04A/B: comportamental OK (criação/idempotência/mudança de venc/baixa/estorno/dry-run).';
END
$b$;

ROLLBACK;
