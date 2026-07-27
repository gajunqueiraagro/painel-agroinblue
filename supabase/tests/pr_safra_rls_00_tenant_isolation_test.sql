-- PR-SAFRA-RLS-00 — suíte de isolamento multitenant de financeiro_safras.
--   Requer a migration 20260727150000 aplicada. BEGIN...ROLLBACK; fixtures temporárias por tag.
--   Simula o papel `authenticated` com claim JWT (auth.uid()); prova isolamento A×B, bypass admin,
--   usuário sem vínculo e anon. Rodar SOMENTE em runtime autorizado no PROTO. NUNCA em produção.
--   NÃO modifica clientes/usuários/safras reais (só cria fixtures revertidas por ROLLBACK).
BEGIN;

DO $t$
DECLARE
  v_cliA uuid; v_cliB uuid;
  v_userA uuid := gen_random_uuid(); v_userB uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid(); v_orphan uuid := gen_random_uuid();
  v_tag text := replace(gen_random_uuid()::text,'-','');
  v_safraA uuid; v_safraB uuid; v_tmpA uuid;
  v_cnt int; v_ok boolean; v_qual text; v_chk text;
BEGIN
  -- ===== T1..T5 estruturais (privileged) =====
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.financeiro_safras'::regclass) THEN
    RAISE EXCEPTION 'T1 FAIL: RLS desabilitado'; END IF;
  -- Nenhuma policy permissiva (true) pode restar para SELECT/INSERT/UPDATE/DELETE.
  FOR v_qual, v_chk IN
    SELECT pg_get_expr(polqual,polrelid), pg_get_expr(polwithcheck,polrelid)
    FROM pg_policy WHERE polrelid='public.financeiro_safras'::regclass
  LOOP
    IF v_qual = 'true' THEN RAISE EXCEPTION 'T2/T4/T5 FAIL: policy com USING(true) presente'; END IF;
    IF v_chk = 'true' THEN RAISE EXCEPTION 'T3/T4 FAIL: policy com WITH CHECK(true) presente'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid='public.financeiro_safras'::regclass) < 4 THEN
    RAISE EXCEPTION 'T2..T5 FAIL: menos de 4 policies'; END IF;

  -- ===== Fixtures (privileged bypassa RLS) =====
  SELECT id INTO v_cliA FROM public.clientes ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cliB FROM public.clientes WHERE id <> v_cliA ORDER BY created_at LIMIT 1;
  IF v_cliA IS NULL OR v_cliB IS NULL THEN RAISE EXCEPTION 'fixture: exige 2 clientes'; END IF;

  INSERT INTO public.cliente_membros (user_id, cliente_id, perfil, ativo) VALUES
    (v_userA, v_cliA, 'membro', true),
    (v_userB, v_cliB, 'membro', true),
    (v_admin, v_cliA, 'admin_agroinblue', true);   -- v_orphan: sem vínculo

  INSERT INTO public.financeiro_safras (cliente_id,nome,codigo,ativa) VALUES (v_cliA, v_tag||'-A',   v_tag||'-A',   true) RETURNING id INTO v_safraA;
  INSERT INTO public.financeiro_safras (cliente_id,nome,codigo,ativa) VALUES (v_cliB, v_tag||'-B',   v_tag||'-B',   true) RETURNING id INTO v_safraB;
  INSERT INTO public.financeiro_safras (cliente_id,nome,codigo,ativa) VALUES (v_cliA, v_tag||'-tmpA',v_tag||'-tmpA',true) RETURNING id INTO v_tmpA;

  -- ===== T6..T14 como authenticated = userA (cliente A) =====
  PERFORM set_config('request.jwt.claim.sub', v_userA::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_cnt FROM public.financeiro_safras WHERE cliente_id=v_cliA;               -- T6
  IF v_cnt < 1 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T6 FAIL: userA nao ve cliA (%)',v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.financeiro_safras WHERE cliente_id=v_cliB;               -- T7
  IF v_cnt <> 0 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T7 FAIL: userA ve cliB (%)',v_cnt; END IF;

  INSERT INTO public.financeiro_safras (cliente_id,nome,codigo,ativa) VALUES (v_cliA, v_tag||'-A2', v_tag||'-A2', true);  -- T8 ok
  v_ok := false;                                                                                  -- T9 insert cliB -> falha
  BEGIN INSERT INTO public.financeiro_safras (cliente_id,nome,codigo,ativa) VALUES (v_cliB, v_tag||'-X', v_tag||'-X', true);
  EXCEPTION WHEN insufficient_privilege THEN v_ok:=true; WHEN others THEN v_ok:=(SQLSTATE='42501'); END;
  IF NOT v_ok THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T9 FAIL: insert cliB permitido'; END IF;

  UPDATE public.financeiro_safras SET descricao=v_tag WHERE id=v_safraA;                          -- T10
  GET DIAGNOSTICS v_cnt = ROW_COUNT; IF v_cnt<>1 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T10 FAIL rows=%',v_cnt; END IF;
  UPDATE public.financeiro_safras SET descricao=v_tag WHERE id=v_safraB;                          -- T11 (USING filtra)
  GET DIAGNOSTICS v_cnt = ROW_COUNT; IF v_cnt<>0 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T11 FAIL rows=%',v_cnt; END IF;

  v_ok := false;                                                                                  -- T12 trocar tenant -> falha
  BEGIN UPDATE public.financeiro_safras SET cliente_id=v_cliB WHERE id=v_safraA;
  EXCEPTION WHEN insufficient_privilege THEN v_ok:=true; WHEN others THEN v_ok:=(SQLSTATE='42501'); END;
  IF NOT v_ok THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T12 FAIL: troca de cliente_id permitida'; END IF;

  DELETE FROM public.financeiro_safras WHERE id=v_tmpA;                                           -- T13
  GET DIAGNOSTICS v_cnt = ROW_COUNT; IF v_cnt<>1 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T13 FAIL rows=%',v_cnt; END IF;
  DELETE FROM public.financeiro_safras WHERE id=v_safraB;                                         -- T14
  GET DIAGNOSTICS v_cnt = ROW_COUNT; IF v_cnt<>0 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T14 FAIL rows=%',v_cnt; END IF;
  EXECUTE 'RESET ROLE';

  -- ===== T15 admin AGROinBLUE (bypass) vê ambos =====
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_cnt FROM public.financeiro_safras WHERE id IN (v_safraA, v_safraB);
  IF v_cnt < 2 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T15 FAIL: admin nao ve ambos (%)',v_cnt; END IF;
  EXECUTE 'RESET ROLE';

  -- ===== T16 usuário sem vínculo vê 0 =====
  PERFORM set_config('request.jwt.claim.sub', v_orphan::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_cnt FROM public.financeiro_safras WHERE id IN (v_safraA, v_safraB);
  IF v_cnt <> 0 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T16 FAIL: orphan ve % safras',v_cnt; END IF;
  EXECUTE 'RESET ROLE';

  -- ===== T17 anon sem grant -> permission denied =====
  v_ok := false;
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN EXECUTE 'SELECT 1 FROM public.financeiro_safras LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN v_ok:=true; WHEN others THEN v_ok:=(SQLSTATE='42501'); END;
  EXECUTE 'RESET ROLE';
  IF NOT v_ok THEN RAISE EXCEPTION 'T17 FAIL: anon teve acesso'; END IF;

  RAISE NOTICE '=== PR-SAFRA-RLS-00: T1..T17 PASS ===';   -- T18: ROLLBACK garante reversão
END $t$;

ROLLBACK;  -- T18: nada persiste
SELECT 'safra_rls_00_rolled_back' AS fim;
