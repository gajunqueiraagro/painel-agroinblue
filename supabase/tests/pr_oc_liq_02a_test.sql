-- PR-OC-LIQ-02A — assercoes da ACL minima das views de liquidacao.
--   Read-only: a suite nao escreve nada (dispensa sentinela de rollback).
--   Requer LIQ-02-1 (views) e a migration 02A aplicadas. PASS/FAIL explicito por view.
DO $t$
DECLARE
  v_views text[] := ARRAY['vw_oc_titulos_liquidacao','vw_oc_operacao_liquidacao'];
  v_cols  int[]  := ARRAY[8, 6];  -- titulos: 8 colunas; operacao: 6 colunas (publicadas no LIQ-02)
  v_view text; v_auth text[]; v_n int; v_si text; v_ncol int; v_esperado_col int;
  i int;
BEGIN
  FOR i IN 1 .. array_length(v_views,1) LOOP
    v_view := v_views[i];
    v_esperado_col := v_cols[i];

    -- A1: authenticated == EXATAMENTE {SELECT}
    SELECT array_agg(privilege_type ORDER BY privilege_type) INTO v_auth
      FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name=v_view AND grantee='authenticated';
    IF v_auth IS DISTINCT FROM ARRAY['SELECT'] THEN
      RAISE EXCEPTION 'A1 FAIL [%]: authenticated=% (esperado {SELECT})', v_view, v_auth; END IF;
    RAISE NOTICE 'A1 PASS [%]: authenticated == {SELECT}', v_view;

    -- A2: anon sem qualquer privilegio
    SELECT count(*) INTO v_n FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name=v_view AND grantee='anon';
    IF v_n <> 0 THEN RAISE EXCEPTION 'A2 FAIL [%]: anon tem % privilegios', v_view, v_n; END IF;
    RAISE NOTICE 'A2 PASS [%]: anon == zero', v_view;

    -- A3: nenhum grant a PUBLIC
    SELECT count(*) INTO v_n FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name=v_view AND grantee='PUBLIC';
    IF v_n <> 0 THEN RAISE EXCEPTION 'A3 FAIL [%]: PUBLIC tem % grants', v_view, v_n; END IF;
    RAISE NOTICE 'A3 PASS [%]: PUBLIC == zero', v_view;

    -- A4: service_role preserva privilegios plenos (7)
    SELECT count(*) INTO v_n FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name=v_view AND grantee='service_role'
       AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');
    IF v_n <> 7 THEN RAISE EXCEPTION 'A4 FAIL [%]: service_role tem % dos 7 plenos', v_view, v_n; END IF;
    RAISE NOTICE 'A4 PASS [%]: service_role pleno', v_view;

    -- A5: security_invoker=true preservado + numero de colunas identico ao publicado
    SELECT option_value INTO v_si
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
           LATERAL pg_options_to_table(c.reloptions)
     WHERE n.nspname='public' AND c.relname=v_view AND option_name='security_invoker';
    IF v_si IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'A5 FAIL [%]: security_invoker=% (esperado true)', v_view, v_si; END IF;
    SELECT count(*) INTO v_ncol FROM information_schema.columns
     WHERE table_schema='public' AND table_name=v_view;
    IF v_ncol <> v_esperado_col THEN RAISE EXCEPTION 'A5 FAIL [%]: % colunas (esperado %)', v_view, v_ncol, v_esperado_col; END IF;
    RAISE NOTICE 'A5 PASS [%]: security_invoker=true + % colunas', v_view, v_ncol;
  END LOOP;

  RAISE NOTICE 'PR-OC-LIQ-02A: A1..A5 OK (ambas as views)';
END $t$;
