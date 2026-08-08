-- 20260816120000_pr_sec_rls_tenant_core_02b_view_invoker.sql
-- PR-SEC-RLS-TENANT-CORE-02B — fecha o bypass de RLS da view de preview da Mesa.
--
-- MOTIVO. public.vw_classificacao_staging_preview tem owner=postgres e security_invoker
-- AUSENTE, logo executa com privilegio do dono (rolbypassrls=true) e IGNORA a RLS de todas
-- as tabelas-base. Prova de runtime read-only no proto (2026-08-08), ator gestor_cliente
-- nao-admin com membership unica:
--     pela VIEW ......... 37390 linhas visiveis, 0 do proprio tenant, 37390 de OUTROS (3 tenants)
--     acesso DIRETO ..... financeiro_lancamentos_v2 de outros tenants = 0  (RLS protegendo)
--     so' a VIEW ........ 22480 lancamentos de outros tenants + 21 contas bancarias alheias
-- Ou seja: a view e' o UNICO caminho conhecido de bypass da financeiro_lancamentos_v2, que
-- e' uma das tabelas ja' protegidas pelo programa de isolamento de 27-28/07.
--
-- ESTE RISCO JA ESTAVA REGISTRADO NO REPO. A migration 20260715180000_sec_views_tenant_01a
-- diz textualmente: "as 8 views seguem security_invoker=false ... e permitem leitura
-- CROSS-TENANT por authenticated. Correcao (security_invoker=true ou ...)". E o
-- ADR-2026-14 (Views tenant-safe, ACEITO 14/07/2026) fixa o padrao preferencial:
-- "security_invoker=on + revoke anon + manter authenticated". Esta migration executa
-- exatamente esse padrao — nao inventa mecanismo novo.
--
-- ORDEM. Aplicar ANTES do CORE-02 (20260816130000). Fechar a view primeiro elimina a janela
-- em que as policies seriam declaradas seguras enquanto o bypass segue acessivel.
--
-- IMPACTO FUNCIONAL ESPERADO: ZERO no fluxo real. O unico consumidor e'
-- src/v2/hooks/useClassificacaoStaging.ts:191, que filtra por sessao_id; uma sessao pertence
-- a UM cliente, e quem a abre e' membro dele. As colunas lanc_* so' viram NULL para linhas de
-- tenant alheio — que o usuario nao deveria ver. Admin segue coberto pelo ramo
-- is_admin_agroinblue das policies das tabelas-base.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2)
--   (a) Ja existe? A DECISAO ja existe: ADR-2026-14 e o risco registrado na 20260715180000.
--       Esta migration executa o que ja foi decidido.
--   (b) Reutilizar? Sim: o padrao security_invoker=on do ADR-2026-14, sem variacao.
--   (c) Fonte soberana? As tabelas-base; a view deixa de mascarar a RLS delas.
--   (d) Segunda forma? Nao. Liga uma flag. Sem RPC nova, sem redefinir a view.
--   (e) Tela ou plataforma? Plataforma: elimina o unico bypass conhecido de uma tabela
--       protegida.
--   (f) Divida? Reduz. Registra que as OUTRAS 7 views do ADR-2026-14 seguem invoker=false
--       (pacote SEC-VIEWS-TENANT-01).
--
-- Migration PREPARADA — aplicar somente pelo processo autorizado.


-- B.0 PRE-CHECKS FATAIS -------------------------------------------------------------------------
DO $$
DECLARE
  v_oid oid; v_owner text; v_opts text; v_anon boolean; v_auth boolean; v_def_md5 text;
BEGIN
  SELECT c.oid, ow.rolname, coalesce(c.reloptions::text,'')
    INTO v_oid, v_owner, v_opts
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_roles ow ON ow.oid = c.relowner
   WHERE n.nspname = 'public' AND c.relname = 'vw_classificacao_staging_preview'
     AND c.relkind = 'v';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'CORE-02B: view vw_classificacao_staging_preview inexistente';
  END IF;
  IF v_owner <> 'postgres' THEN
    RAISE EXCEPTION 'CORE-02B: owner inesperado da view: %', v_owner;
  END IF;
  IF v_opts ~ 'security_invoker=(on|true)' THEN
    RAISE EXCEPTION 'CORE-02B: security_invoker ja esta ligado (%) — nada a fazer', v_opts;
  END IF;

  v_anon := pg_catalog.has_table_privilege('anon','public.vw_classificacao_staging_preview','SELECT');
  v_auth := pg_catalog.has_table_privilege('authenticated','public.vw_classificacao_staging_preview','SELECT');
  IF NOT v_auth THEN
    RAISE EXCEPTION 'CORE-02B: authenticated ja nao tem SELECT — a Mesa quebraria';
  END IF;

  -- congela a definicao para provar, no pos-check, que ALTER VIEW ... SET nao redefine o corpo
  v_def_md5 := md5(pg_catalog.pg_get_viewdef(v_oid, true));
  PERFORM set_config('app.core02b_viewdef_md5', v_def_md5, true);

  RAISE NOTICE 'CORE-02B pre-checks OK: owner=%, invoker=off, anon_select=%, auth_select=%, viewdef md5=%',
               v_owner, v_anon, v_auth, v_def_md5;
END $$;


-- B.1 Ligar security_invoker --------------------------------------------------------------------
ALTER VIEW public.vw_classificacao_staging_preview SET (security_invoker = on);

-- B.2 Reafirmar o padrao do ADR-2026-14: anon sem acesso, authenticated mantido ------------------
-- REVOKE e' DCL idempotente. anon ja' foi revogado pela 20260715180000; repetimos por explicitude,
-- para que o estado alvo esteja declarado nesta migration e nao dependa de historico.
REVOKE ALL ON TABLE public.vw_classificacao_staging_preview FROM anon;


-- B.3 POS-CHECKS FATAIS -------------------------------------------------------------------------
DO $$
DECLARE
  v_oid oid; v_owner text; v_opts text; v_def_md5 text; v_esperado text;
BEGIN
  SELECT c.oid, ow.rolname, coalesce(c.reloptions::text,'')
    INTO v_oid, v_owner, v_opts
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_roles ow ON ow.oid = c.relowner
   WHERE n.nspname = 'public' AND c.relname = 'vw_classificacao_staging_preview';

  IF v_opts !~ 'security_invoker=(on|true)' THEN
    RAISE EXCEPTION 'CORE-02B: security_invoker NAO ficou ligado. reloptions=%', v_opts;
  END IF;
  IF v_owner <> 'postgres' THEN
    RAISE EXCEPTION 'CORE-02B: owner mudou para %', v_owner;
  END IF;
  IF pg_catalog.has_table_privilege('anon','public.vw_classificacao_staging_preview','SELECT') THEN
    RAISE EXCEPTION 'CORE-02B: anon ainda tem SELECT na view';
  END IF;
  IF NOT pg_catalog.has_table_privilege('authenticated','public.vw_classificacao_staging_preview','SELECT') THEN
    RAISE EXCEPTION 'CORE-02B: authenticated perdeu SELECT na view';
  END IF;

  v_def_md5 := md5(pg_catalog.pg_get_viewdef(v_oid, true));
  v_esperado := current_setting('app.core02b_viewdef_md5', true);
  IF v_esperado IS NULL OR v_esperado = '' THEN
    RAISE EXCEPTION 'CORE-02B: md5 da definicao nao foi congelado no pre-check';
  END IF;
  IF v_def_md5 IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'CORE-02B: a definicao da view mudou (% -> %)', v_esperado, v_def_md5;
  END IF;

  RAISE NOTICE 'CORE-02B pos-checks OK: reloptions=%, owner=%, anon sem SELECT, authenticated com SELECT, viewdef inalterada.',
               v_opts, v_owner;
END $$;


-- ==============================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- Reverter REABRE o bypass cross-tenant (22.480 lancamentos alheios pela view).
-- Medida de emergencia com prazo, nunca estado de repouso.
-- ----------------------------------------------------------------------------------------------
-- ALTER VIEW public.vw_classificacao_staging_preview SET (security_invoker = off);
--
-- DO $rb$
-- DECLARE v_opts text;
-- BEGIN
--   SELECT coalesce(c.reloptions::text,'') INTO v_opts
--     FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname='public' AND c.relname='vw_classificacao_staging_preview';
--   IF v_opts ~ 'security_invoker=(on|true)' THEN
--     RAISE EXCEPTION 'rollback CORE-02B: security_invoker continua ligado';
--   END IF;
--   RAISE NOTICE 'rollback CORE-02B OK: security_invoker desligado. BYPASS REABERTO.';
-- END $rb$;
-- ----------------------------------------------------------------------------------------------
-- VERIFICACOES ESPERADAS APOS O ROLLBACK:
--   1) reloptions sem security_invoker=on;
--   2) anon SEGUE sem SELECT (o REVOKE do B.2 nao e' revertido de proposito);
--   3) authenticated segue com SELECT;
--   4) a view volta a devolver linhas de outros tenants para membro nao-admin.
-- ==============================================================================================
