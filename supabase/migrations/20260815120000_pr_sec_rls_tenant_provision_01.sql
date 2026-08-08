-- 20260815120000_pr_sec_rls_tenant_provision_01.sql
-- PR-SEC-RLS-TENANT-PROVISION-01 — provisionamento de cliente por RPC transacional.
--
-- MOTIVO. O fluxo de src/pages/ClientesTab.tsx faz 3 INSERT diretos (clientes,
-- fazendas, cliente_membros) como `authenticated`. Prova de runtime em cluster
-- local (2026-08-07), com claims de um admin_agroinblue ATIVO, reproduzindo os
-- payloads exatos do front:
--     PASSO 1  INSERT clientes ......... BLOQUEADO 42501 (RLS)
--     PASSO 2  INSERT fazendas ......... BLOQUEADO 42501 (RLS, testado isolado)
--     PASSO 3  INSERT cliente_membros .. BLOQUEADO 42501 (RLS, testado isolado)
-- Como DONO da tabela os mesmos 3 INSERT passam => o bloqueio e' de RLS, nao de
-- payload/constraint. As 3 tabelas tem RLS ligada e NENHUMA policy de INSERT.
-- Evidencia runtime no proto: ultimo provisionamento em 2026-04-18 (6 clientes,
-- 6 fazendas 'ADM', 0 orfaos); o endurecimento RLS e' de 2026-07-14/15 e
-- 2026-07-27/28. A quebra existe ha' ~3 semanas e esta' LATENTE porque nenhum
-- cliente foi criado desde abril.
--
-- SOLUCAO. RPC SECURITY DEFINER admin-only, transacional. O SECURITY DEFINER e'
-- usado APENAS para atravessar o ovo-e-galinha: no INSERT em clientes ainda nao
-- existe membership, logo nenhum predicado de pertencimento pode ser satisfeito.
-- NENHUMA policy e NENHUM grant direto e' criado nas 3 tabelas — a superficie
-- aberta continua sendo exatamente a de hoje.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2 — seis perguntas)
--   (a) Isso ja existe? NAO. Nenhuma RPC de provisionamento; hoje sao 3 INSERT
--       diretos em src/pages/ClientesTab.tsx L84-L117.
--   (b) Componente semelhante a reutilizar? SIM, o padrao de autorizacao
--       is_admin_agroinblue(auth.uid()) (SECURITY DEFINER), ja usado por 45
--       policies do schema. Reutilizado, nao recriado.
--   (c) Fonte soberana? public.clientes / public.fazendas / public.cliente_membros.
--       A RPC nao cria fonte nova — apenas o caminho de escrita.
--   (d) Segunda forma de resolver o mesmo problema? NAO. SUBSTITUI os 3 inserts;
--       nenhum deles permanece no fluxo de criacao.
--   (e) Melhora so a tela ou fortalece a plataforma? Plataforma: torna o bootstrap
--       atomico e move a autorizacao do front para o banco.
--   (f) Divida tecnica? REDUZ: elimina Promise.all sem transacao, o codigo morto de
--       tratamento de duplicata e o risco de cliente orfao.
--   Desvio registrado: o briefing de GO desta etapa nao trazia esta secao; a
--   implementacao foi executada antes da solicitacao formal e as seis respostas
--   foram aprovadas na revisao pre-commit de 2026-08-07.
--
-- Migration PREPARADA — aplicar somente pelo processo autorizado.


-- A.0 PREMISSAS do SECURITY DEFINER — FATAIS ---------------------------------------------------
-- SECURITY DEFINER so' atravessa a RLS se um conjunto de premissas for verdadeiro. Sem prova-las
-- a funcao vira "mascarar RLS por fe". Este bloco aborta a migration antes de qualquer DDL se
-- alguma divergir.
--   1. as 3 tabelas pertencem ao MESMO owner;
--   2. esse owner e' `postgres` (esperado no proto e no local);
--   3. o owner consegue de fato ignorar RLS — por rolsuper OU rolbypassrls. Medido em 2026-08-07:
--      postgres tem rolsuper=false e rolbypassrls=TRUE, entao e' o bypassrls que sustenta a RPC;
--   4. relforcerowsecurity = false nas 3 tabelas — INVARIANTE CONSERVADORA, nao condicao atual.
--      Semantica correta: SUPERUSER e BYPASSRLS ignoram RLS SEMPRE, inclusive com FORCE RLS
--      ligado. FORCE RLS so' sujeita as policies o owner COMUM, isto e', sem BYPASSRLS.
--      Hoje a RPC funciona pelo item 3 — postgres tem rolbypassrls=true — e continuaria
--      funcionando mesmo se FORCE RLS fosse ligado. A exigencia de relforcerowsecurity=false
--      e' mantida como trava para um cenario FUTURO em que o owner perca o BYPASSRLS: nesse
--      fallback, FORCE RLS passaria a bloquear a RPC, e queremos falhar na migration em vez de
--      descobrir em producao.
DO $$
DECLARE
  c_owner CONSTANT text := 'postgres';
  v_bad text; v_n int; v_super boolean; v_bypass boolean;
BEGIN
  SELECT string_agg(c.relname || ' -> ' || ow.rolname, ', ' ORDER BY c.relname)
    INTO v_bad
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_roles ow ON ow.oid = c.relowner
   WHERE n.nspname = 'public'
     AND c.relname IN ('clientes','fazendas','cliente_membros')
     AND ow.rolname <> c_owner;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PROVISION-01 premissa 1/2: owner inesperado (esperado %): %', c_owner, v_bad;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('clientes','fazendas','cliente_membros');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'PROVISION-01 premissa 1: esperadas 3 tabelas em public, achei %', v_n;
  END IF;

  SELECT r.rolsuper, r.rolbypassrls INTO v_super, v_bypass
    FROM pg_catalog.pg_roles r WHERE r.rolname = c_owner;
  IF v_super IS NULL THEN
    RAISE EXCEPTION 'PROVISION-01 premissa 3: role % inexistente', c_owner;
  END IF;
  IF NOT (v_super OR v_bypass) THEN
    RAISE EXCEPTION 'PROVISION-01 premissa 3: owner % nao ignora RLS '
                    '(rolsuper=%, rolbypassrls=%) — SECURITY DEFINER nao resolveria',
                    c_owner, v_super, v_bypass;
  END IF;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_bad
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('clientes','fazendas','cliente_membros')
     AND c.relforcerowsecurity;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PROVISION-01 premissa 4: FORCE ROW LEVEL SECURITY ativo em %: owner atual '
                    'possui BYPASSRLS, mas a invariante conservadora exige FORCE RLS desligado '
                    'para preservar fallback futuro sem BYPASSRLS', v_bad;
  END IF;

  RAISE NOTICE 'PROVISION-01 premissas OK: owner=% (rolsuper=%, rolbypassrls=%), '
               'as 3 tabelas com o mesmo owner e FORCE RLS desligado.',
               c_owner, v_super, v_bypass;
END $$;


-- A.1 Pre-check: unicidade de slug -----------------------------------------------------------
-- O indice parcial abaixo sustenta o contrato 23505 da RPC. Ele so' pode ser criado se nao
-- houver slug nao-NULL duplicado. Verificacao read-only no proto em 2026-08-07: 6 clientes,
-- 5 slugs distintos, 1 slug NULL, 0 duplicados. O bloco abaixo REVALIDA na aplicacao — nao
-- confiamos na leitura anterior.
DO $$
DECLARE v_dup int; v_det text;
BEGIN
  SELECT count(*), string_agg(d.slug, ', ' ORDER BY d.slug)
    INTO v_dup, v_det
    FROM (SELECT c.slug FROM public.clientes c
           WHERE c.slug IS NOT NULL
           GROUP BY c.slug HAVING count(*) > 1) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'PROVISION-01: % slug(s) nao-NULL duplicado(s), sanear antes: %', v_dup, v_det;
  END IF;
  RAISE NOTICE 'PROVISION-01 pre-check: zero slugs nao-NULL duplicados.';
END $$;


-- A.2 Indice UNIQUE parcial -----------------------------------------------------------------
-- Parcial (WHERE slug IS NOT NULL) para preservar o cliente legado com slug NULL e permitir
-- multiplos NULL no futuro. Unico indice deste PR.
CREATE UNIQUE INDEX IF NOT EXISTS clientes_slug_uniq
  ON public.clientes (slug)
  WHERE slug IS NOT NULL;

-- A.3 Prova NOMINAL de equivalencia do indice ------------------------------------------------
-- "IF NOT EXISTS" sozinho nao prova nada: se ja' existisse um indice homonimo com outra
-- definicao, o CREATE seria um no-op silencioso. Validamos definicao, unicidade, coluna e
-- predicado no catalogo.
DO $$
DECLARE
  v_oid oid; v_unique boolean; v_pred text; v_cols text; v_nkeys int;
BEGIN
  SELECT i.indexrelid, i.indisunique,
         pg_catalog.pg_get_expr(i.indpred, i.indrelid),
         i.indnatts
    INTO v_oid, v_unique, v_pred, v_nkeys
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = ic.relnamespace
   WHERE n.nspname = 'public' AND ic.relname = 'clientes_slug_uniq';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'PROVISION-01: indice clientes_slug_uniq nao existe apos o CREATE';
  END IF;
  IF NOT v_unique THEN
    RAISE EXCEPTION 'PROVISION-01: clientes_slug_uniq existe mas NAO e unico';
  END IF;
  IF v_nkeys <> 1 THEN
    RAISE EXCEPTION 'PROVISION-01: clientes_slug_uniq tem % colunas, esperado 1', v_nkeys;
  END IF;

  SELECT string_agg(a.attname, ',' ORDER BY a.attnum)
    INTO v_cols
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
   WHERE i.indexrelid = v_oid;
  IF v_cols IS DISTINCT FROM 'slug' THEN
    RAISE EXCEPTION 'PROVISION-01: clientes_slug_uniq indexa "%", esperado "slug"', v_cols;
  END IF;

  IF v_pred IS NULL THEN
    RAISE EXCEPTION 'PROVISION-01: clientes_slug_uniq NAO e parcial (sem predicado)';
  END IF;
  IF replace(replace(v_pred, '(', ''), ')', '') IS DISTINCT FROM 'slug IS NOT NULL' THEN
    RAISE EXCEPTION 'PROVISION-01: predicado inesperado em clientes_slug_uniq: %', v_pred;
  END IF;

  RAISE NOTICE 'PROVISION-01 indice OK: UNIQUE parcial em public.clientes(slug) WHERE %', v_pred;
END $$;


-- A.4 RPC de provisionamento ------------------------------------------------------------------
-- Assinatura publica minima: (p_nome, p_slug). Nome e codigo da fazenda inicial sao FIXOS no
-- corpo, reproduzindo exatamente o bootstrap atual do ClientesTab ('Administrativo' / 'ADM').
--
-- Ambiguidade: os OUT de RETURNS TABLE (cliente_id, fazenda_id, membro_id) sao homonimos de
-- colunas reais de fazendas/cliente_membros. Por isso o corpo NAO referencia esses nomes em
-- nenhuma expressao: usa apenas variaveis v_* e qualifica toda coluna com alias de tabela.
CREATE OR REPLACE FUNCTION public.provisionar_cliente(
  p_nome text,
  p_slug text
) RETURNS TABLE (cliente_id uuid, fazenda_id uuid, membro_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  -- btrim() sem segundo argumento remove APENAS espacos. Um slug composto so' de tabs
  -- (E'\t') sobreviveria a validacao de vazio — defeito encontrado pelo teste P2.1.
  -- O conjunto explicito cobre espaco, tab, CR, LF, FF e VT. Continua sendo apenas trim:
  -- nao ha' lowercase nem remocao de acento, para preservar a normalizacao do front.
  v_nome text := btrim(p_nome, E' \t\r\n\f\x0B');
  v_slug text := btrim(p_slug, E' \t\r\n\f\x0B');
  v_cli  uuid;
  v_faz  uuid;
  v_mem  uuid;
BEGIN
  -- Autorizacao repetida no corpo: o GRANT sozinho nao e' a autorizacao.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'provisionar_cliente: sessao sem usuario autenticado'
      USING ERRCODE = '28000';
  END IF;

  -- admin inativo reprova aqui: is_admin_agroinblue exige ativo = true.
  IF NOT public.is_admin_agroinblue(v_uid) THEN
    RAISE EXCEPTION 'provisionar_cliente: exige perfil admin_agroinblue ativo'
      USING ERRCODE = '42501';
  END IF;

  -- Validacao de entrada. Preserva a normalizacao ja' feita pelo front: apenas trim,
  -- sem lowercase e sem remocao de acentos (mudar isso exigiria prova dos consumidores).
  IF v_nome IS NULL OR v_nome = '' OR v_slug IS NULL OR v_slug = '' THEN
    RAISE EXCEPTION 'provisionar_cliente: nome e identificador sao obrigatorios'
      USING ERRCODE = '22023';
  END IF;

  -- Conflito de slug chega ao front como 23505 nos dois caminhos:
  --   caso comum  -> este EXISTS, que da' a mensagem legivel;
  --   corrida     -> o indice parcial clientes_slug_uniq, cujo unique_violation tambem e' 23505.
  -- Decisao registrada: NAO ha' teste de duas sessoes concorrentes. A garantia de unicidade sob
  -- concorrencia e' do indice — propriedade do PostgreSQL, nao logica desta funcao — e um teste
  -- multi-sessao exigiria orquestracao fora do padrao BEGIN/ROLLBACK da suite. O teste T15b prova
  -- que o indice barra o duplicado mesmo contornando o EXISTS.
  IF EXISTS (SELECT 1 FROM public.clientes c WHERE c.slug = v_slug) THEN
    RAISE EXCEPTION 'provisionar_cliente: ja existe cliente com o identificador %', v_slug
      USING ERRCODE = '23505';
  END IF;

  -- Os tres INSERT sao atomicos: qualquer excecao daqui em diante desfaz os anteriores.
  INSERT INTO public.clientes AS c (nome, slug)
       VALUES (v_nome, v_slug)
    RETURNING c.id INTO v_cli;

  INSERT INTO public.fazendas AS f (nome, cliente_id, tem_pecuaria, owner_id, codigo, codigo_importacao)
       VALUES ('Administrativo', v_cli, false, v_uid, 'ADM', 'ADM')
    RETURNING f.id INTO v_faz;

  -- Membership SEMPRE do solicitante: a funcao nao aceita user_id arbitrario.
  -- Perfil mantido como no fluxo atual do front; este PR nao muda semantica de papeis.
  INSERT INTO public.cliente_membros AS m (cliente_id, user_id, perfil, ativo)
       VALUES (v_cli, v_uid, 'admin_agroinblue', true)
    RETURNING m.id INTO v_mem;

  RETURN QUERY SELECT v_cli, v_faz, v_mem;
END;
$fn$;

COMMENT ON FUNCTION public.provisionar_cliente(text, text) IS
  'PR-SEC-RLS-TENANT-PROVISION-01. Cria cliente + fazenda Administrativo/ADM + membership '
  'admin_agroinblue do solicitante, atomicamente. Admin-only. SECURITY DEFINER apenas para '
  'atravessar o ovo-e-galinha do primeiro INSERT (sem membership nao ha predicado de tenant).';


-- A.5 Superficie de execucao -------------------------------------------------------------------
-- REVOKE FROM PUBLIC e' o que efetivamente fecha (licao SEC-RPC: revogar de anon e' no-op se
-- PUBLIC mantem o privilegio). anon e service_role ficam explicitos para auditoria.
-- service_role e' revogado DE PROPOSITO: ele recebe EXECUTE por default privilege
-- (a Fase 2 do baseline concede ALL ON FUNCTIONS a postgres e service_role), mas esta RPC
-- exige sessao humana — auth.uid() nao nulo e admin_agroinblue ativo. Nao existe consumidor
-- server-side autorizado, e o default privilege nao deve ampliar a API.
-- postgres permanece apenas como owner (execucao implicita do dono).
REVOKE ALL ON FUNCTION public.provisionar_cliente(text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.provisionar_cliente(text, text) TO authenticated;


-- A.6 Pos-checks FATAIS -------------------------------------------------------------------------
DO $$
DECLARE
  v_oid oid; v_secdef boolean; v_cfg text[]; v_args text; v_ret text;
  v_pub boolean; v_anon boolean; v_auth boolean; v_srv boolean;
  v_fnowner text; v_tbowner text;
BEGIN
  SELECT p.oid, p.prosecdef, p.proconfig,
         pg_catalog.pg_get_function_identity_arguments(p.oid),
         pg_catalog.pg_get_function_result(p.oid)
    INTO v_oid, v_secdef, v_cfg, v_args, v_ret
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'provisionar_cliente';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'PROVISION-01: funcao provisionar_cliente nao encontrada';
  END IF;

  -- assinatura exata
  IF v_args IS DISTINCT FROM 'p_nome text, p_slug text' THEN
    RAISE EXCEPTION 'PROVISION-01: assinatura inesperada: (%)', v_args;
  END IF;
  IF v_ret NOT LIKE 'TABLE(cliente_id uuid, fazenda_id uuid, membro_id uuid)%' THEN
    RAISE EXCEPTION 'PROVISION-01: retorno inesperado: %', v_ret;
  END IF;

  -- SECURITY DEFINER
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'PROVISION-01: funcao nao e SECURITY DEFINER';
  END IF;

  -- owner da FUNCAO tem de ser o mesmo das 3 tabelas (premissa 1 do A.0). Se divergir, o
  -- SECURITY DEFINER passaria a rodar sob um role que talvez nao ignore a RLS delas.
  SELECT ow.rolname INTO v_fnowner
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles ow ON ow.oid = p.proowner
   WHERE p.oid = v_oid;
  SELECT string_agg(DISTINCT ow.rolname, ',') INTO v_tbowner
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_roles ow ON ow.oid = c.relowner
   WHERE n.nspname = 'public' AND c.relname IN ('clientes','fazendas','cliente_membros');
  IF v_fnowner IS DISTINCT FROM v_tbowner THEN
    RAISE EXCEPTION 'PROVISION-01: owner da funcao (%) difere do owner das tabelas (%)',
                    v_fnowner, v_tbowner;
  END IF;

  -- search_path exato
  IF v_cfg IS NULL OR NOT ('search_path=pg_catalog, public' = ANY(v_cfg)) THEN
    RAISE EXCEPTION 'PROVISION-01: search_path inesperado: %', coalesce(v_cfg::text, 'NULL');
  END IF;

  -- ACL canonica via aclexplode: PUBLIC = grantee 0
  SELECT bool_or(a.grantee = 0),
         bool_or(g.rolname = 'anon'),
         bool_or(g.rolname = 'authenticated'),
         bool_or(g.rolname = 'service_role')
    INTO v_pub, v_anon, v_auth, v_srv
    FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL aclexplode(p.proacl) a
    LEFT JOIN pg_catalog.pg_roles g ON g.oid = a.grantee
   WHERE p.oid = v_oid AND a.privilege_type = 'EXECUTE';

  IF coalesce(v_pub, false) THEN
    RAISE EXCEPTION 'PROVISION-01: PUBLIC ainda tem EXECUTE';
  END IF;
  IF coalesce(v_anon, false) THEN
    RAISE EXCEPTION 'PROVISION-01: anon ainda tem EXECUTE';
  END IF;
  IF coalesce(v_srv, false) THEN
    RAISE EXCEPTION 'PROVISION-01: service_role ainda tem EXECUTE';
  END IF;
  IF NOT coalesce(v_auth, false) THEN
    RAISE EXCEPTION 'PROVISION-01: authenticated NAO tem EXECUTE';
  END IF;

  -- efetividade (cobre heranca por PUBLIC)
  IF pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVISION-01: anon tem EXECUTE efetivo';
  END IF;
  IF pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVISION-01: service_role tem EXECUTE efetivo';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVISION-01: authenticated sem EXECUTE efetivo';
  END IF;

  RAISE NOTICE 'PROVISION-01 pos-checks OK: assinatura, retorno, SECDEF, search_path e ACL '
               '(PUBLIC/anon/service_role sem EXECUTE; authenticated com).';
END $$;


-- A.7 Invariante de ESTADO: nenhuma policy de INSERT/DELETE nas 3 tabelas ----------------------
-- ATENCAO ao que este bloco prova e ao que NAO prova. Ele afere o ESTADO do schema no momento da
-- aplicacao: apos esta migration, clientes/fazendas/cliente_membros seguem sem policy de INSERT
-- ou DELETE. Ele NAO prova autoria — nao consegue distinguir "este PR nao criou" de "outra
-- migration criou antes". Serve como trava contra regressao do escopo, nao como prova historica.
DO $$
DECLARE v_pol int; v_bad text;
BEGIN
  SELECT count(*), string_agg(c.relname || '.' || pol.polname, ', ')
    INTO v_pol, v_bad
    FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('clientes','fazendas','cliente_membros')
     AND pol.polcmd IN ('a','d');   -- INSERT / DELETE
  IF v_pol > 0 THEN
    RAISE EXCEPTION 'PROVISION-01: este PR nao deve criar policy de INSERT/DELETE; achei: %', v_bad;
  END IF;
  RAISE NOTICE 'PROVISION-01 invariante OK: zero policy de INSERT/DELETE nas 3 tabelas.';
END $$;


-- ==============================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado, por decisao: uma migration
-- reversa em supabase/migrations rodaria no `db reset` e desfaria o PR a cada reset.
-- Para reverter, copiar o SQL abaixo (sem os prefixos "-- ") e rodar pelo processo autorizado.
-- Copia executavel espelhada usada nos testes: scratchpad/rollback_pr_sec_rls_tenant_provision_01.sql
--
-- Efeito: volta ao estado anterior, em que o provisionamento fica BLOQUEADO por RLS.
-- NAO reabre exposicao alguma — este PR nao criou policy nem grant de tabela.
-- ----------------------------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.provisionar_cliente(text, text);
-- DROP INDEX IF EXISTS public.clientes_slug_uniq;
--
-- DO $rb$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
--                JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
--               WHERE n.nspname = 'public' AND p.proname = 'provisionar_cliente') THEN
--     RAISE EXCEPTION 'rollback PROVISION-01: funcao ainda existe';
--   END IF;
--   IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c
--                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
--               WHERE n.nspname = 'public' AND c.relname = 'clientes_slug_uniq') THEN
--     RAISE EXCEPTION 'rollback PROVISION-01: indice ainda existe';
--   END IF;
--   RAISE NOTICE 'rollback PROVISION-01 OK: funcao e indice removidos.';
-- END $rb$;
-- ----------------------------------------------------------------------------------------------
-- VERIFICACOES ESPERADAS APOS O ROLLBACK:
--   1) funcao ausente:
--      SELECT count(*) = 0 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.proname = 'provisionar_cliente';
--   2) indice ausente:
--      SELECT count(*) = 0 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--       WHERE n.nspname = 'public' AND c.relname = 'clientes_slug_uniq';
--   3) as 3 tabelas seguem SEM policy de INSERT/DELETE (invariante preservada):
--      SELECT count(*) = 0 FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
--        JOIN pg_namespace n ON n.oid = c.relnamespace
--       WHERE n.nspname = 'public' AND c.relname IN ('clientes','fazendas','cliente_membros')
--         AND pol.polcmd IN ('a','d');
--   4) provisionamento volta a falhar 42501 para authenticated (estado pre-PR).
-- ==============================================================================================
