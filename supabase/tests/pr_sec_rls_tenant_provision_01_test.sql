-- PR-SEC-RLS-TENANT-PROVISION-01 — testes de public.provisionar_cliente(text,text).
--
--   EXECUCAO REAL COMO ROLE: os casos T1-T6 chamam a RPC com SET LOCAL ROLE ativo
--   (authenticated ou anon) no nivel de statement, nao dentro de um DO rodando como owner.
--   RESET ROLE e' usado SOMENTE para preparar e inspecionar fixtures. Assim o sucesso nao pode
--   depender de a suite estar rodando como dono das tabelas.
--
--   NOTA P1-2 (semantica de RLS): SUPERUSER e BYPASSRLS ignoram RLS SEMPRE, inclusive com
--   FORCE RLS ligado. FORCE RLS so' sujeita as policies o owner COMUM, sem BYPASSRLS. Hoje a RPC
--   funciona porque o owner `postgres` tem rolbypassrls=true. A checagem de
--   relforcerowsecurity=false e' invariante CONSERVADORA para um fallback futuro sem BYPASSRLS —
--   nao e' a condicao que faz a RPC funcionar hoje.
--
--   Cobre: premissas do SECURITY DEFINER (owners, FORCE RLS, bypassrls), ACL do schema public,
--   trigger on_fazenda_created, autorizacao (admin ativo / comum / admin inativo / sem JWT /
--   anon), validacao de entrada, atomicidade dos 3 INSERT, contrato 23505, membership do
--   solicitante, ACL da funcao, search_path, prosecdef, assinatura e o indice parcial.
--
--   Requer aplicada: 20260815120000_pr_sec_rls_tenant_provision_01.
--   Fixtures sinteticas com prefixo fixo; NAO usa IDs reais. BEGIN...ROLLBACK + residuo zero.
--   Pode rodar em cluster local descartavel. NAO aplicar no proto.
--
--   UUIDs sinteticos (prefixo 11111111-0000-4000-8000-):
--     ...000000000a01 admin_agroinblue ATIVO      ...000000000a02 gestor_cliente
--     ...000000000a03 admin_agroinblue INATIVO    ...000000000a04 membro do tenant B
--     ...000000000c00 cliente semente             ...000000000c0b tenant B

BEGIN;

-- ==============================================================================================
-- FIXTURES — como postgres (owner). Preparacao apenas.
-- ==============================================================================================
INSERT INTO auth.users (id) VALUES
  ('11111111-0000-4000-8000-000000000a01'),
  ('11111111-0000-4000-8000-000000000a02'),
  ('11111111-0000-4000-8000-000000000a03'),
  ('11111111-0000-4000-8000-000000000a04');

INSERT INTO public.clientes (id, nome, slug) VALUES
  ('11111111-0000-4000-8000-000000000c00', '__PROV01_SEED__',     '__prov01_seed__'),
  ('11111111-0000-4000-8000-000000000c0b', '__PROV01_TENANT_B__', '__prov01_tenant_b__');

INSERT INTO public.cliente_membros (cliente_id, user_id, perfil, ativo) VALUES
  ('11111111-0000-4000-8000-000000000c00', '11111111-0000-4000-8000-000000000a01', 'admin_agroinblue', true),
  ('11111111-0000-4000-8000-000000000c00', '11111111-0000-4000-8000-000000000a02', 'gestor_cliente',   true),
  ('11111111-0000-4000-8000-000000000c00', '11111111-0000-4000-8000-000000000a03', 'admin_agroinblue', false),
  ('11111111-0000-4000-8000-000000000c0b', '11111111-0000-4000-8000-000000000a04', 'admin_agroinblue', true);

-- slug unico por execucao, para nao colidir entre rodadas na mesma base
DO $t$ BEGIN
  PERFORM set_config('app.prov01_slug', '__prov01_' || replace(gen_random_uuid()::text,'-',''), true);
END $t$;

-- ==============================================================================================
-- P1-2 — PREMISSAS DO SECURITY DEFINER (inspecao, como postgres)
-- ==============================================================================================
DO $t$
DECLARE v_bad text; v_super boolean; v_bypass boolean; v_fn text; v_tb text;
BEGIN
  SELECT string_agg(c.relname || '->' || ow.rolname, ', ' ORDER BY c.relname) INTO v_bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles ow ON ow.oid = c.relowner
   WHERE n.nspname = 'public' AND c.relname IN ('clientes','fazendas','cliente_membros')
     AND ow.rolname <> 'postgres';
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'P1-2 FALHOU owner das tabelas: %', v_bad; END IF;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('clientes','fazendas','cliente_membros')
     AND c.relforcerowsecurity;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'P1-2 FALHOU FORCE RLS ativo em: %', v_bad; END IF;

  SELECT r.rolsuper, r.rolbypassrls INTO v_super, v_bypass FROM pg_roles r WHERE r.rolname='postgres';
  IF NOT (v_super OR v_bypass) THEN
    RAISE EXCEPTION 'P1-2 FALHOU: owner nao ignora RLS (super=%, bypass=%)', v_super, v_bypass;
  END IF;

  SELECT ow.rolname INTO v_fn FROM pg_proc p JOIN pg_roles ow ON ow.oid=p.proowner
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='provisionar_cliente';
  SELECT string_agg(DISTINCT ow.rolname, ',') INTO v_tb
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles ow ON ow.oid=c.relowner
   WHERE n.nspname='public' AND c.relname IN ('clientes','fazendas','cliente_membros');
  IF v_fn IS DISTINCT FROM v_tb THEN
    RAISE EXCEPTION 'P1-2 FALHOU: owner da funcao (%) <> owner das tabelas (%)', v_fn, v_tb;
  END IF;

  RAISE NOTICE 'P1-2 premissas SECDEF ................. OK (owner=%, super=%, bypassrls=%, FORCE RLS off)',
               v_fn, v_super, v_bypass;
END $t$;

-- ==============================================================================================
-- P2.5 — ACL do schema public
-- ==============================================================================================
DO $t$
DECLARE v_bad text;
BEGIN
  IF NOT has_schema_privilege('authenticated','public','USAGE') THEN
    RAISE EXCEPTION 'P2.5 FALHOU: authenticated sem USAGE em public (a RPC seria inalcancavel)';
  END IF;
  SELECT string_agg(x.r, ', ') INTO v_bad FROM (
    SELECT unnest(ARRAY['anon','authenticated','service_role']) AS r
  ) x WHERE has_schema_privilege(x.r,'public','CREATE');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'P2.5 FALHOU: CREATE em public para: %', v_bad; END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
              WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='CREATE') THEN
    RAISE EXCEPTION 'P2.5 FALHOU: PUBLIC com CREATE em public';
  END IF;
  RAISE NOTICE 'P2.5 schema public: USAGE sim, CREATE nao  OK';
END $t$;

-- ==============================================================================================
-- P1-3 — trigger on_fazenda_created: existe e escreve em fazenda_membros (NAO cliente_membros)
-- ==============================================================================================
DO $t$
DECLARE v_fn text; v_src text; v_en char;
BEGIN
  SELECT p.proname, p.prosrc, t.tgenabled INTO v_fn, v_src, v_en
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE n.nspname='public' AND c.relname='fazendas' AND t.tgname='on_fazenda_created'
     AND NOT t.tgisinternal;
  IF v_fn IS NULL THEN RAISE EXCEPTION 'P1-3 FALHOU: trigger on_fazenda_created ausente'; END IF;
  IF v_fn <> 'auto_add_owner_as_membro' THEN
    RAISE EXCEPTION 'P1-3 FALHOU: funcao inesperada no trigger: %', v_fn;
  END IF;
  IF v_en <> 'O' THEN RAISE EXCEPTION 'P1-3 FALHOU: trigger nao habilitado (tgenabled=%)', v_en; END IF;
  IF v_src !~ 'fazenda_membros' THEN
    RAISE EXCEPTION 'P1-3 FALHOU: trigger nao escreve em fazenda_membros';
  END IF;
  IF v_src ~ 'cliente_membros' THEN
    RAISE EXCEPTION 'P1-3 PARAR: o trigger TAMBEM escreve em cliente_membros — redesenhar a RPC antes';
  END IF;
  RAISE NOTICE 'P1-3 trigger: escreve so em fazenda_membros  OK (habilitado, %)', v_fn;
END $t$;

-- ==============================================================================================
-- T5 — anon NAO pode executar a RPC.  EXECUCAO REAL COMO anon.
-- ==============================================================================================
SET LOCAL ROLE anon;
DO $t$
DECLARE acusou boolean := false; st text;
BEGIN
  IF current_user <> 'anon' THEN RAISE EXCEPTION 'T5 setup: current_user=% (esperado anon)', current_user; END IF;
  BEGIN
    PERFORM public.provisionar_cliente('__T5__', '__t5__');
  EXCEPTION WHEN insufficient_privilege THEN acusou := true; st := SQLSTATE;
            WHEN OTHERS THEN st := SQLSTATE;
  END;
  IF acusou THEN RAISE NOTICE 'T5 anon EXECUTE negado (42501) ........ OK';
  ELSE RAISE EXCEPTION 'T5 FALHOU: anon nao recebeu insufficient_privilege (sqlstate=%)', coalesce(st,'nenhum'); END IF;
END $t$;
RESET ROLE;

-- ==============================================================================================
-- T4 — sem JWT.  EXECUCAO REAL COMO authenticated, claims vazios.
-- ==============================================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '';
SET LOCAL request.jwt.claim.sub = '';
DO $t$
DECLARE st text;
BEGIN
  IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'T4 setup: current_user=%', current_user; END IF;
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'T4 setup: auth.uid() deveria ser NULL'; END IF;
  BEGIN PERFORM public.provisionar_cliente('__T4__','__t4__'); st := 'SEM ERRO';
  EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
  IF st = '28000' THEN RAISE NOTICE 'T4 sem JWT -> 28000 ................... OK';
  ELSE RAISE EXCEPTION 'T4 FALHOU: %', st; END IF;
END $t$;
RESET ROLE;

-- ==============================================================================================
-- T2 — gestor_cliente.  EXECUCAO REAL COMO authenticated.
-- ==============================================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-0000-4000-8000-000000000a02","role":"authenticated"}';
DO $t$
DECLARE st text;
BEGIN
  IF auth.uid() <> '11111111-0000-4000-8000-000000000a02' THEN RAISE EXCEPTION 'T2 setup: uid=%', auth.uid(); END IF;
  BEGIN PERFORM public.provisionar_cliente('__T2__','__t2__'); st := 'SEM ERRO';
  EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
  IF st = '42501' THEN RAISE NOTICE 'T2 gestor_cliente -> 42501 ............ OK';
  ELSE RAISE EXCEPTION 'T2 FALHOU: %', st; END IF;
END $t$;
RESET ROLE;

-- ==============================================================================================
-- T3 — admin_agroinblue INATIVO.  EXECUCAO REAL COMO authenticated.
-- ==============================================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-0000-4000-8000-000000000a03","role":"authenticated"}';
DO $t$
DECLARE st text;
BEGIN
  BEGIN PERFORM public.provisionar_cliente('__T3__','__t3__'); st := 'SEM ERRO';
  EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
  IF st = '42501' THEN RAISE NOTICE 'T3 admin INATIVO -> 42501 ............. OK';
  ELSE RAISE EXCEPTION 'T3 FALHOU: %', st; END IF;
END $t$;
RESET ROLE;

-- ==============================================================================================
-- P2.1 — validacao de entrada: NULL, vazio e whitespace -> 22023.  COMO authenticated (admin).
-- ==============================================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-0000-4000-8000-000000000a01","role":"authenticated"}';
DO $t$
DECLARE r record; st text; falhas int := 0;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('nome NULL',        NULL,      'x'),
      ('slug NULL',        'x',       NULL),
      ('nome vazio',       '',        'x'),
      ('slug vazio',       'x',       ''),
      ('nome whitespace',  '   ',     'x'),
      ('slug whitespace',  'x',       E' \t '),
      ('ambos NULL',       NULL,      NULL)
    ) v(caso, nome, slug)
  LOOP
    BEGIN PERFORM public.provisionar_cliente(r.nome, r.slug); st := 'SEM ERRO';
    EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
    IF st <> '22023' THEN falhas := falhas + 1; RAISE WARNING 'P2.1 FALHOU [%]: %', r.caso, st; END IF;
  END LOOP;
  IF falhas > 0 THEN RAISE EXCEPTION 'P2.1: % caso(s) de entrada invalida nao deram 22023', falhas; END IF;
  RAISE NOTICE 'P2.1 entrada invalida -> 22023 (7 casos) OK';
END $t$;
RESET ROLE;

-- ==============================================================================================
-- T1 — admin ativo cria as 3 linhas.  EXECUCAO REAL COMO authenticated.
-- ==============================================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-0000-4000-8000-000000000a01","role":"authenticated"}';
DO $t$
DECLARE v_cli uuid; v_faz uuid; v_mem uuid; v_slug text := current_setting('app.prov01_slug');
BEGIN
  IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'T1 setup: current_user=%', current_user; END IF;
  SELECT pc.cliente_id, pc.fazenda_id, pc.membro_id INTO v_cli, v_faz, v_mem
    FROM public.provisionar_cliente('  Cliente Teste 01  ', v_slug) pc;
  IF v_cli IS NULL OR v_faz IS NULL OR v_mem IS NULL THEN
    RAISE EXCEPTION 'T1 FALHOU: id retornado NULL (cli=%, faz=%, mem=%)', v_cli, v_faz, v_mem;
  END IF;
  PERFORM set_config('app.prov01_cli', v_cli::text, true);
  PERFORM set_config('app.prov01_faz', v_faz::text, true);
  PERFORM set_config('app.prov01_mem', v_mem::text, true);
  RAISE NOTICE 'T1 admin cria as 3 linhas (como %) .... OK', current_user;
END $t$;
RESET ROLE;

-- ==============================================================================================
-- T1b / P1-3 — conferencia das linhas criadas (inspecao, como postgres)
-- ==============================================================================================
DO $t$
DECLARE
  v_cli uuid := current_setting('app.prov01_cli')::uuid;
  v_faz uuid := current_setting('app.prov01_faz')::uuid;
  v_mem uuid := current_setting('app.prov01_mem')::uuid;
  v_uid uuid := '11111111-0000-4000-8000-000000000a01';
  v_slug text := current_setting('app.prov01_slug');
  v_n int; falhas int := 0;
BEGIN
  SELECT count(*) INTO v_n FROM public.clientes c
   WHERE c.id = v_cli AND c.nome = 'Cliente Teste 01' AND c.slug = v_slug;
  IF v_n <> 1 THEN falhas := falhas+1; RAISE WARNING 'T1b FALHOU cliente/trim'; END IF;

  SELECT count(*) INTO v_n FROM public.fazendas f
   WHERE f.id = v_faz AND f.cliente_id = v_cli AND f.nome = 'Administrativo'
     AND f.codigo = 'ADM' AND f.codigo_importacao = 'ADM'
     AND f.tem_pecuaria = false AND f.owner_id = v_uid;
  IF v_n <> 1 THEN falhas := falhas+1; RAISE WARNING 'T1b FALHOU fazenda ADM'; END IF;

  -- exatamente 1 membership para (cliente criado, auth.uid())
  SELECT count(*) INTO v_n FROM public.cliente_membros m
   WHERE m.cliente_id = v_cli AND m.user_id = v_uid;
  IF v_n <> 1 THEN falhas := falhas+1; RAISE WARNING 'T1b FALHOU: % membership(s) p/ (cliente,uid), esperado 1', v_n; END IF;

  -- exatamente 1 membership com o membro_id retornado, perfil e ativo exatos
  SELECT count(*) INTO v_n FROM public.cliente_membros m
   WHERE m.id = v_mem AND m.cliente_id = v_cli AND m.user_id = v_uid
     AND m.perfil = 'admin_agroinblue' AND m.ativo = true;
  IF v_n <> 1 THEN falhas := falhas+1; RAISE WARNING 'T1b FALHOU membership pelo membro_id retornado'; END IF;

  -- NENHUMA membership adicional no cliente criado (o trigger nao pode ter criado outra)
  SELECT count(*) INTO v_n FROM public.cliente_membros m WHERE m.cliente_id = v_cli;
  IF v_n <> 1 THEN falhas := falhas+1; RAISE WARNING 'T1b FALHOU: % membership(s) no cliente, esperado 1', v_n; END IF;

  -- o trigger criou a linha dele, em fazenda_membros (tabela DIFERENTE)
  SELECT count(*) INTO v_n FROM public.fazenda_membros fm
   WHERE fm.fazenda_id = v_faz AND fm.user_id = v_uid AND fm.papel = 'dono';
  IF v_n <> 1 THEN falhas := falhas+1; RAISE WARNING 'T1b FALHOU: fazenda_membros do trigger = %, esperado 1', v_n; END IF;

  IF falhas > 0 THEN RAISE EXCEPTION 'T1b: % conferencia(s) falharam', falhas; END IF;
  RAISE NOTICE 'T1b linhas criadas + trigger isolado ... OK';
END $t$;

-- ==============================================================================================
-- T9 — membership pertence ao solicitante (inspecao)
-- ==============================================================================================
DO $t$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.cliente_membros m
   WHERE m.cliente_id = current_setting('app.prov01_cli')::uuid
     AND m.user_id <> '11111111-0000-4000-8000-000000000a01';
  IF v_n > 0 THEN RAISE EXCEPTION 'T9 FALHOU: % membership(s) de outro usuario', v_n; END IF;
  RAISE NOTICE 'T9 membership = auth.uid() ............ OK';
END $t$;

-- ==============================================================================================
-- T10 — outro tenant nao virou membro (inspecao)
-- ==============================================================================================
DO $t$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.cliente_membros m
   WHERE m.cliente_id = current_setting('app.prov01_cli')::uuid
     AND m.user_id = '11111111-0000-4000-8000-000000000a04';
  IF v_n > 0 THEN RAISE EXCEPTION 'T10 FALHOU: outro tenant virou membro'; END IF;
  RAISE NOTICE 'T10 outro tenant sem membership ....... OK';
END $t$;

-- ==============================================================================================
-- T6 — slug duplicado -> 23505 e zero residuo.  EXECUCAO REAL COMO authenticated.
-- ==============================================================================================
DO $t$ BEGIN PERFORM set_config('app.prov01_n_clientes', (SELECT count(*)::text FROM public.clientes), true); END $t$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-0000-4000-8000-000000000a01","role":"authenticated"}';
DO $t$
DECLARE st text;
BEGIN
  BEGIN PERFORM public.provisionar_cliente('Outro Nome', current_setting('app.prov01_slug')); st := 'SEM ERRO';
  EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
  IF st = '23505' THEN RAISE NOTICE 'T6 slug duplicado -> 23505 ............ OK';
  ELSE RAISE EXCEPTION 'T6 FALHOU: %', st; END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF (SELECT count(*) FROM public.clientes) <> current_setting('app.prov01_n_clientes')::int THEN
    RAISE EXCEPTION 'T6 FALHOU: slug duplicado deixou residuo';
  END IF;
  RAISE NOTICE 'T6 zero residuo apos 23505 ............ OK';
END $t$;

-- ==============================================================================================
-- T7/T8 — atomicidade: falha no passo 2 desfaz o passo 1.
-- Trigger sintetico criado como postgres; a RPC e' chamada como authenticated.
-- ==============================================================================================
CREATE OR REPLACE FUNCTION pg_temp.prov01_falha_fazenda() RETURNS trigger
  LANGUAGE plpgsql AS $x$ BEGIN RAISE EXCEPTION 'falha sintetica no passo 2'; END $x$;
CREATE TRIGGER zz_prov01_falha BEFORE INSERT ON public.fazendas
  FOR EACH ROW EXECUTE FUNCTION pg_temp.prov01_falha_fazenda();
DO $t$ BEGIN PERFORM set_config('app.prov01_n2', (SELECT count(*)::text FROM public.clientes), true); END $t$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-0000-4000-8000-000000000a01","role":"authenticated"}';
DO $t$
DECLARE st text;
BEGIN
  BEGIN PERFORM public.provisionar_cliente('Falha Passo 2',
                current_setting('app.prov01_slug') || '_f2'); st := 'SEM ERRO';
  EXCEPTION WHEN OTHERS THEN st := SQLERRM; END;
  IF st = 'SEM ERRO' THEN RAISE EXCEPTION 'T7 FALHOU: a falha do passo 2 nao foi propagada'; END IF;
  RAISE NOTICE 'T7 falha no passo 2 propagada ......... OK (%)', st;
END $t$;
RESET ROLE;

DROP TRIGGER zz_prov01_falha ON public.fazendas;
DO $t$
BEGIN
  IF (SELECT count(*) FROM public.clientes) <> current_setting('app.prov01_n2')::int THEN
    RAISE EXCEPTION 'T8 FALHOU: cliente orfao apos falha no passo 2';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clientes c WHERE c.slug = current_setting('app.prov01_slug') || '_f2') THEN
    RAISE EXCEPTION 'T8 FALHOU: cliente do passo 1 persistiu';
  END IF;
  RAISE NOTICE 'T8 rollback integral do passo 1 ....... OK';
END $t$;

-- ==============================================================================================
-- T11..T14 — ACL, search_path, prosecdef, assinatura (inspecao de catalogo)
-- ==============================================================================================
DO $t$
DECLARE v_n int; v_txt text; falhas int := 0;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='provisionar_cliente'
     AND a.privilege_type='EXECUTE' AND a.grantee=0;
  IF v_n > 0 THEN falhas:=falhas+1; RAISE WARNING 'T11 FALHOU: PUBLIC tem EXECUTE'; END IF;
  IF has_function_privilege('anon','public.provisionar_cliente(text,text)','EXECUTE') THEN
    falhas:=falhas+1; RAISE WARNING 'T11 FALHOU: anon EXECUTE efetivo'; END IF;
  IF has_function_privilege('service_role','public.provisionar_cliente(text,text)','EXECUTE') THEN
    falhas:=falhas+1; RAISE WARNING 'T11 FALHOU: service_role EXECUTE efetivo'; END IF;
  IF NOT has_function_privilege('authenticated','public.provisionar_cliente(text,text)','EXECUTE') THEN
    falhas:=falhas+1; RAISE WARNING 'T11 FALHOU: authenticated sem EXECUTE'; END IF;
  IF falhas = 0 THEN RAISE NOTICE 'T11 ACL: PUBLIC/anon/service_role sem  OK'; END IF;

  SELECT string_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE g.rolname END, ',' ORDER BY 1) INTO v_txt
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    LEFT JOIN pg_roles g ON g.oid=a.grantee JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='provisionar_cliente' AND a.privilege_type='EXECUTE';
  IF v_txt IS DISTINCT FROM 'authenticated,postgres' THEN
    falhas:=falhas+1; RAISE WARNING 'T11b FALHOU grantees: %', v_txt;
  ELSE RAISE NOTICE 'T11b grantees = authenticated+owner ... OK'; END IF;

  SELECT p.proconfig::text INTO v_txt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='provisionar_cliente';
  IF v_txt IS DISTINCT FROM '{"search_path=pg_catalog, public"}' THEN
    falhas:=falhas+1; RAISE WARNING 'T12 FALHOU search_path: %', v_txt;
  ELSE RAISE NOTICE 'T12 search_path exato ................ OK'; END IF;

  IF NOT (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='provisionar_cliente') THEN
    falhas:=falhas+1; RAISE WARNING 'T13 FALHOU: nao e SECURITY DEFINER';
  ELSE RAISE NOTICE 'T13 SECURITY DEFINER ................. OK'; END IF;

  SELECT pg_get_function_identity_arguments(p.oid) INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='provisionar_cliente';
  IF v_txt IS DISTINCT FROM 'p_nome text, p_slug text' THEN
    falhas:=falhas+1; RAISE WARNING 'T14 FALHOU assinatura: (%)', v_txt;
  ELSE RAISE NOTICE 'T14 assinatura (p_nome, p_slug) ...... OK'; END IF;

  IF falhas > 0 THEN RAISE EXCEPTION 'T11-T14: % falha(s)', falhas; END IF;
END $t$;

-- ==============================================================================================
-- T15 — indice parcial: permite multiplos NULL, barra slug nao-NULL repetido
-- ==============================================================================================
INSERT INTO public.clientes (nome, slug) VALUES ('__PROV01_NULO_A__', NULL), ('__PROV01_NULO_B__', NULL);
DO $t$
DECLARE st text;
BEGIN
  RAISE NOTICE 'T15a indice permite multiplos NULL .... OK';
  BEGIN
    INSERT INTO public.clientes (nome, slug) VALUES ('__PROV01_DUP__', current_setting('app.prov01_slug'));
    st := 'SEM ERRO';
  EXCEPTION WHEN unique_violation THEN st := 'unique_violation'; END;
  IF st = 'unique_violation' THEN RAISE NOTICE 'T15b indice barra slug repetido ....... OK';
  ELSE RAISE EXCEPTION 'T15b FALHOU: indice aceitou slug duplicado (%)', st; END IF;
END $t$;

DO $t$ BEGIN RAISE NOTICE '=== PROVISION-01: TODOS OS TESTES PASSARAM ==='; END $t$;

ROLLBACK;

-- ==============================================================================================
-- Residuo (fora da transacao) — filtrado SOMENTE pelos sentinelas/UUIDs sinteticos deste teste.
-- Nao conta linhas legitimas preexistentes da base.
-- ==============================================================================================
SELECT 'clientes sentinela __PROV01_' AS alvo, count(*) AS n
  FROM public.clientes WHERE nome LIKE '\_\_PROV01\_%'
UNION ALL SELECT 'clientes Cliente Teste 01', count(*)
  FROM public.clientes WHERE nome = 'Cliente Teste 01'
UNION ALL SELECT 'clientes slug __prov01_', count(*)
  FROM public.clientes WHERE slug LIKE '\_\_prov01\_%'
UNION ALL SELECT 'auth.users sinteticos 11111111-', count(*)
  FROM auth.users WHERE id::text LIKE '11111111-0000-4000-8000-%'
UNION ALL SELECT 'cliente_membros dos uids sinteticos', count(*)
  FROM public.cliente_membros WHERE user_id::text LIKE '11111111-0000-4000-8000-%'
UNION ALL SELECT 'fazendas dos clientes sinteticos', count(*)
  FROM public.fazendas f WHERE f.owner_id::text LIKE '11111111-0000-4000-8000-%'
UNION ALL SELECT 'fazenda_membros dos uids sinteticos', count(*)
  FROM public.fazenda_membros WHERE user_id::text LIKE '11111111-0000-4000-8000-%';
