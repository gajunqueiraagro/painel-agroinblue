-- SEG-TENANT-VARREDURA-01C — nenhuma funcao do SISTEMA no schema `public` e' executavel sem login, e funcao nova nasce fechada.
--
-- Roda como `postgres` (o dono das funcoes do sistema), numa transacao que TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Qualquer outra excecao e' falha e diz qual prova caiu.
--
-- T0  a busca prova que sabe achar: uma funcao aberta a `anon` de proposito tem de aparecer na contagem (a lei do auto-teste).
-- T1  zero funcoes do sistema executaveis por `anon` (direto ou por PUBLIC); a falha NOMEIA as que achar.
-- T2  a excecao nomeada: so' funcoes de extensao (`pg_trgm`, `unaccent`) seguem executaveis por `anon`.
-- T3  funcao nova criada pelo `postgres` no `public` nasce sem EXECUTE para `anon` e para `authenticated`, e com `service_role`.
-- T4  chamada de verdade como `anon`: "permission denied for function" (42501) numa funcao do sistema; a de extensao responde.

DO $teste$
DECLARE
  v_n int; v_antes int; v_lista text; v_ext text; v_estado text; v_msg text; v_ok text := '';
BEGIN
  -- T0: o detector acha uma funcao aberta (uma a mais do que havia antes de abri-la)
  SELECT count(*) INTO v_antes FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
  CREATE FUNCTION public._teste_01c_aberta() RETURNS int LANGUAGE sql AS 'select 1';
  GRANT EXECUTE ON FUNCTION public._teste_01c_aberta() TO anon;
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
  IF v_n <> v_antes + 1 THEN RAISE EXCEPTION 'T0 o detector nao achou a funcao aberta de proposito (% antes, % depois)', v_antes, v_n; END IF;
  DROP FUNCTION public._teste_01c_aberta();
  v_ok := v_ok || 'T0 ok (o detector acha a funcao aberta de proposito); ';

  -- T1: nenhuma funcao do sistema executavel por anon
  SELECT count(*), string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text) INTO v_n, v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T1 % funcao(oes) do sistema executavel(is) sem login: % — falta REVOKE EXECUTE … FROM PUBLIC, anon', v_n, left(v_lista, 600);
  END IF;
  v_ok := v_ok || 'T1 ok (0 funcoes do sistema executaveis por anon); ';

  -- T2: o que sobra aberto e' so' extensao, e so' as duas nomeadas
  SELECT count(*), string_agg(DISTINCT e.extname, ',' ORDER BY e.extname) INTO v_n, v_ext
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e' JOIN pg_extension e ON e.oid = d.refobjid
   WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n = 0 THEN RAISE EXCEPTION 'T2 nenhuma funcao de extensao encontrada: a busca nao esta vendo o que devia'; END IF;
  IF v_ext <> 'pg_trgm,unaccent' THEN RAISE EXCEPTION 'T2 extensao fora da excecao nomeada com funcao aberta a anon: %', v_ext; END IF;
  v_ok := v_ok || 'T2 ok (' || v_n || ' de extensao: ' || v_ext || '); ';

  -- T3: funcao nova nasce fechada
  CREATE FUNCTION public._teste_01c_nova() RETURNS int LANGUAGE sql AS 'select 1';
  IF has_function_privilege('anon', 'public._teste_01c_nova()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._teste_01c_nova()'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public._teste_01c_nova()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'T3 funcao nova nasceu aberta: anon=% authenticated=% service_role=%',
      has_function_privilege('anon', 'public._teste_01c_nova()'::regprocedure, 'EXECUTE'),
      has_function_privilege('authenticated', 'public._teste_01c_nova()'::regprocedure, 'EXECUTE'),
      has_function_privilege('service_role', 'public._teste_01c_nova()'::regprocedure, 'EXECUTE');
  END IF;
  DROP FUNCTION public._teste_01c_nova();
  v_ok := v_ok || 'T3 ok (funcao nova: anon nao, authenticated nao, service_role sim); ';

  -- T4: a chamada de verdade, como anon
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.fn_get_mesa_v2_mode();
    v_msg := 'RESPONDEU';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT; END;
  IF v_msg = 'RESPONDEU' OR v_estado <> '42501' OR v_msg NOT LIKE 'permission denied for function%' THEN
    RESET ROLE; RAISE EXCEPTION 'T4 anon chamou funcao do sistema: % %', v_estado, v_msg;
  END IF;
  BEGIN
    PERFORM public.unaccent('ação');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; RAISE EXCEPTION 'T4 a extensao deixou de responder a anon: %', SQLERRM; END;
  RESET ROLE;
  v_ok := v_ok || 'T4 ok (anon: 42501 permission denied for function; unaccent responde)';

  RAISE EXCEPTION 'OK %', v_ok;
END $teste$;
