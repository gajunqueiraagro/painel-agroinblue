-- FIN-RLS-CORE-00B — suíte de isolamento multitenant de financeiro_lancamentos_v2.
--   Requer a migration 20260728120000 aplicada. BEGIN...ROLLBACK; fixtures temporárias.
--   Usa 2 clientes REAIS (com dados) + usuários fabricados; simula `authenticated` via claim JWT
--   (auth.uid()). Prova isolamento A×B em SELECT/INSERT/UPDATE, bloqueio de troca de cliente_id,
--   ausência de DELETE (soft-delete preservado), bypass admin, órfão e anon.
--   Rodar SOMENTE em runtime autorizado no PROTO. NUNCA em produção. Não altera dados reais.
BEGIN;

DO $t$
DECLARE
  -- clientes reais (com lançamentos): A = Vera Ligia Milani, B = NJ Pecuária
  v_cliA uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  v_cliB uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  v_userA uuid := gen_random_uuid(); v_userB uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid(); v_orphan uuid := gen_random_uuid();
  v_fazA uuid; v_lanA uuid; v_lanB uuid;
  v_cnt int; v_ok boolean; v_qual text; v_chk text;
BEGIN
  -- ===== T1..T5 estruturais =====
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.financeiro_lancamentos_v2'::regclass) THEN
    RAISE EXCEPTION 'T1 FAIL: RLS desabilitado'; END IF;
  FOR v_qual, v_chk IN
    SELECT pg_get_expr(polqual,polrelid), pg_get_expr(polwithcheck,polrelid)
    FROM pg_policy WHERE polrelid='public.financeiro_lancamentos_v2'::regclass
  LOOP
    IF v_qual='true' THEN RAISE EXCEPTION 'T2 FAIL: policy USING(true) presente'; END IF;
    IF v_chk='true' THEN RAISE EXCEPTION 'T3 FAIL: policy WITH CHECK(true) presente'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid='public.financeiro_lancamentos_v2'::regclass) <> 3 THEN
    RAISE EXCEPTION 'T4 FAIL: esperado 3 policies (S/I/U)'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.financeiro_lancamentos_v2'::regclass AND polcmd='d') THEN
    RAISE EXCEPTION 'T5 FAIL: policy DELETE presente (contrato = sem DELETE)'; END IF;

  -- ===== Fixtures (privileged bypassa RLS) =====
  INSERT INTO public.cliente_membros (user_id, cliente_id, perfil, ativo) VALUES
    (v_userA, v_cliA, 'membro', true),
    (v_userB, v_cliB, 'membro', true),
    (v_admin, v_cliA, 'admin_agroinblue', true);  -- v_orphan sem vínculo
  SELECT fazenda_id INTO v_fazA FROM public.financeiro_lancamentos_v2 WHERE cliente_id=v_cliA AND fazenda_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_lanA FROM public.financeiro_lancamentos_v2 WHERE cliente_id=v_cliA AND coalesce(cancelado,false)=false LIMIT 1;
  SELECT id INTO v_lanB FROM public.financeiro_lancamentos_v2 WHERE cliente_id=v_cliB AND coalesce(cancelado,false)=false LIMIT 1;
  IF v_lanA IS NULL OR v_lanB IS NULL THEN RAISE EXCEPTION 'fixture: exige lançamentos reais em A e B'; END IF;

  -- ===== T6..T16 como authenticated = userA (cliente A) =====
  PERFORM set_config('request.jwt.claim.sub', v_userA::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2 WHERE cliente_id=v_cliA;               -- T6
  IF v_cnt < 1 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T6 FAIL: userA nao ve A (%)',v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2 WHERE cliente_id=v_cliB;               -- T7
  IF v_cnt <> 0 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T7 FAIL: userA ve B (%)',v_cnt; END IF;
  SELECT count(DISTINCT cliente_id) INTO v_cnt FROM public.financeiro_lancamentos_v2;                     -- T8 sem filtro
  IF v_cnt <> 1 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T8 FAIL: sem-filtro ve % clientes',v_cnt; END IF;

  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,valor,tipo_operacao,data_competencia,descricao,origem_lancamento)
    VALUES (v_cliA,v_fazA,1,'2-Saídas','2026-01-15','rls_test_A','manual');                                -- T9 insert A ok
  v_ok := false;                                                                                          -- T10 insert B -> falha
  BEGIN INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,valor,tipo_operacao,data_competencia,descricao,origem_lancamento)
    VALUES (v_cliB,v_fazA,1,'2-Saídas','2026-01-15','rls_test_B','manual');
  EXCEPTION WHEN insufficient_privilege THEN v_ok:=true; WHEN others THEN v_ok:=(SQLSTATE='42501'); END;
  IF NOT v_ok THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T10 FAIL: insert B permitido'; END IF;

  UPDATE public.financeiro_lancamentos_v2 SET observacao='rls_test' WHERE id=v_lanA;                      -- T11
  GET DIAGNOSTICS v_cnt = ROW_COUNT; IF v_cnt<>1 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T11 FAIL rows=%',v_cnt; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET observacao='rls_test' WHERE id=v_lanB;                      -- T12 (USING filtra)
  GET DIAGNOSTICS v_cnt = ROW_COUNT; IF v_cnt<>0 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T12 FAIL rows=%',v_cnt; END IF;

  v_ok := false;                                                                                          -- T13 trocar cliente_id -> falha
  BEGIN UPDATE public.financeiro_lancamentos_v2 SET cliente_id=v_cliB WHERE id=v_lanA;
  EXCEPTION WHEN insufficient_privilege THEN v_ok:=true; WHEN others THEN v_ok:=(SQLSTATE='42501'); END;
  IF NOT v_ok THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T13 FAIL: troca de cliente_id permitida'; END IF;

  -- T14 DELETE indisponível: sem policy DELETE, a RLS filtra qualquer DELETE para 0 linhas
  -- (não gera 42501; o guard BEFORE DELETE nem dispara pois nenhuma linha é visível ao comando).
  DELETE FROM public.financeiro_lancamentos_v2 WHERE id=v_lanA;
  GET DIAGNOSTICS v_cnt = ROW_COUNT; IF v_cnt<>0 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T14 FAIL: DELETE afetou % linhas (esperado 0, sem policy DELETE)',v_cnt; END IF;

  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true, cancelado_em=now(), cancelado_por=v_userA WHERE id=v_lanA;  -- T15 soft-delete próprio
  GET DIAGNOSTICS v_cnt = ROW_COUNT; IF v_cnt<>1 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T15 FAIL soft-delete próprio rows=%',v_cnt; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true WHERE id=v_lanB;                             -- T16 soft-delete alheio -> 0
  GET DIAGNOSTICS v_cnt = ROW_COUNT; IF v_cnt<>0 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T16 FAIL soft-delete alheio rows=%',v_cnt; END IF;
  EXECUTE 'RESET ROLE';

  -- ===== T17 admin vê A e B =====
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(DISTINCT cliente_id) INTO v_cnt FROM public.financeiro_lancamentos_v2 WHERE cliente_id IN (v_cliA,v_cliB);
  IF v_cnt < 2 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T17 FAIL: admin nao ve A e B (%)',v_cnt; END IF;
  EXECUTE 'RESET ROLE';

  -- ===== T18 órfão vê 0 =====
  PERFORM set_config('request.jwt.claim.sub', v_orphan::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2;
  IF v_cnt <> 0 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T18 FAIL: orphan ve % linhas',v_cnt; END IF;
  EXECUTE 'RESET ROLE';

  -- ===== T19 anon sem grant -> permission denied =====
  v_ok := false;
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN EXECUTE 'SELECT 1 FROM public.financeiro_lancamentos_v2 LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN v_ok:=true; WHEN others THEN v_ok:=(SQLSTATE='42501'); END;
  EXECUTE 'RESET ROLE';
  IF NOT v_ok THEN RAISE EXCEPTION 'T19 FAIL: anon teve acesso'; END IF;

  RAISE NOTICE '=== FIN-RLS-CORE-00B: T1..T19 PASS ===';   -- T20: ROLLBACK garante reversão
END $t$;

ROLLBACK;  -- T20: nada persiste
SELECT 'fin_rls_core_00b_rolled_back' AS fim;
