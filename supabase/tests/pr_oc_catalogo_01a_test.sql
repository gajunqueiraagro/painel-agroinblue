-- PR-OC-CATALOGO-01A — asserções da ACL mínima do catálogo soberano.
--   Read-only: a suíte não escreve nada (dispensa sentinela de rollback).
--   Requer a migration 01A aplicada. Cada asserção emite PASS/FAIL explícito.
DO $t$
DECLARE
  v_auth text[];
  v_anon int;
  v_public int;
  v_srv int;
  v_rls boolean;
  v_pol int;
  v_pol_cmd text;
BEGIN
  -- A1: authenticated tem EXATAMENTE {SELECT} na tabela.
  SELECT array_agg(privilege_type ORDER BY privilege_type) INTO v_auth
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='zoo_componentes_financeiros'
     AND grantee='authenticated';
  IF v_auth IS DISTINCT FROM ARRAY['SELECT'] THEN
    RAISE EXCEPTION 'A1 FAIL: authenticated=% (esperado {SELECT})', v_auth; END IF;
  RAISE NOTICE 'A1 PASS: authenticated == {SELECT}';

  -- A2: anon sem qualquer privilégio.
  SELECT count(*) INTO v_anon
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='zoo_componentes_financeiros'
     AND grantee='anon';
  IF v_anon <> 0 THEN RAISE EXCEPTION 'A2 FAIL: anon tem % privilegios', v_anon; END IF;
  RAISE NOTICE 'A2 PASS: anon == zero privilegios';

  -- A3: nenhum grant a PUBLIC.
  SELECT count(*) INTO v_public
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='zoo_componentes_financeiros'
     AND grantee='PUBLIC';
  IF v_public <> 0 THEN RAISE EXCEPTION 'A3 FAIL: PUBLIC tem % grants', v_public; END IF;
  RAISE NOTICE 'A3 PASS: PUBLIC == zero grants';

  -- A4: service_role preserva privilégios plenos (7: arwdDxt).
  SELECT count(*) INTO v_srv
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='zoo_componentes_financeiros'
     AND grantee='service_role'
     AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');
  IF v_srv <> 7 THEN RAISE EXCEPTION 'A4 FAIL: service_role tem % dos 7 privilegios plenos', v_srv; END IF;
  RAISE NOTICE 'A4 PASS: service_role preserva os 7 privilegios plenos';

  -- A5 (não-regressão): RLS habilitada e 1 policy de SELECT intacta.
  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='zoo_componentes_financeiros';
  IF v_rls IS NOT TRUE THEN RAISE EXCEPTION 'A5 FAIL: RLS nao habilitada'; END IF;
  SELECT count(*), min(p.polcmd::text) INTO v_pol, v_pol_cmd
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='zoo_componentes_financeiros';
  IF v_pol <> 1 OR v_pol_cmd <> 'r' THEN
    RAISE EXCEPTION 'A5 FAIL: policies=% cmd=% (esperado 1 policy SELECT)', v_pol, v_pol_cmd; END IF;
  RAISE NOTICE 'A5 PASS: RLS habilitada + 1 policy SELECT intacta';

  RAISE NOTICE 'PR-OC-CATALOGO-01A: A1..A5 OK';
END $t$;
