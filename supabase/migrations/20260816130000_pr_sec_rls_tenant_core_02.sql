-- 20260816130000_pr_sec_rls_tenant_core_02.sql
-- PR-SEC-RLS-TENANT-CORE-02 — fecha leitura e escrita cross-tenant no nucleo.
--
-- DEPENDE de 20260816120000 (CORE-02B) ter sido aplicada ANTES. O timestamp garante a
-- ordenacao; o pre-check C.0 aborta se a view ainda estiver como definer.
--
-- ESCOPO. 4 tabelas comprovadamente vulneraveis:
--     clientes, fazendas, cliente_membros, financeiro_contas_bancarias
-- As 3 ja seguras (financeiro_lancamentos_v2, extrato_bancario_v2, conciliacao_bancaria_itens)
-- NAO sao alteradas — entram apenas como controle de nao-regressao, com hash congelado.
--
-- INVENTARIO NOMINAL — 9 policies removidas, 8 criadas (liquido -1: cliente_membros 2->1)
--   ANTES (9, todas PERMISSIVE, todas TO PUBLIC):
--     1 clientes.clientes_select_all              SELECT USING(true)
--     2 fazendas.fazendas_select_all              SELECT USING(true)
--     3 fazendas.fazendas_update_all              UPDATE USING(true) CHECK(true)
--     4 cliente_membros.cliente_membros_select_open SELECT USING(true)
--     5 cliente_membros.usuario_ve_seus_clientes  SELECT USING(auth.uid() = user_id)
--     6 financeiro_contas_bancarias.cb_sel        SELECT USING(true)
--     7 financeiro_contas_bancarias.cb_ins        INSERT CHECK(true)
--     8 financeiro_contas_bancarias.cb_update     UPDATE USING(true) CHECK(true)
--     9 financeiro_contas_bancarias.cb_delete     DELETE USING(true)
--   DEPOIS (8, todas PERMISSIVE, todas TO authenticated): ver secao C.2.
--
-- PREDICADO. Identico ao das 45 policies vivas do schema, com uma unica diferenca de forma:
-- auth.uid() envolto em (select auth.uid()), para forcar avaliacao unica (InitPlan) em vez de
-- por linha. Semanticamente equivalente.
--     (select is_admin_agroinblue((select auth.uid())))
--     OR cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids((select auth.uid())) t(cliente_id))
-- MEDIDO em stack local (10.000 fazendas, 20 tenants, ator enxerga 5%):
--     is_admin_agroinblue((select auth.uid())) ............. 20,5 ms / 10.184 buffers
--     (select is_admin_agroinblue((select auth.uid()))) .... 0,63 ms /    156 buffers
--     policy aberta USING(true), baseline .................. 0,75 ms /    154 buffers
-- Sem a subquery escalar a funcao e' chamada POR LINHA — regressao material de ~32x.
-- Com ela vira InitPlan avaliado UMA vez e o custo iguala o da policy aberta.
-- Em clientes o predicado usa `id`, nao `cliente_id`.
--
-- MEMBERSHIP ATIVA. As duas funcoes exigem ativo = true no corpo; membro inativo nao entra no
-- conjunto e nao e' admin. Em cliente_membros o ramo self (user_id = (select auth.uid())) permite
-- que o usuario veja A PROPRIA LINHA mesmo inativa — diagnostico de vinculo — e nada alem disso.
--
-- SEM RECURSAO. As duas funcoes sao SECURITY DEFINER com owner postgres (rolbypassrls=true),
-- logo nao passam pela RLS de cliente_membros. Por isso o idioma inline usado por extrato_v2 e
-- conc_itens NAO serve nesta tabela.
--
-- NAO AMPLIA CRUD. Continuam SEM policy (portanto negados), exatamente como hoje:
--   clientes        INSERT / UPDATE / DELETE
--   fazendas        INSERT / DELETE
--   cliente_membros INSERT / UPDATE / DELETE
-- Dividas registradas: PR-SEC-RLS-TENANT-FAZENDA-CRUD e PR-SEC-RLS-TENANT-EDIT-CLIENTE-01.
--
-- ESTE PR NAO ENCERRA O DOMINIO FINANCEIRO. financeiro_classificacao_staging segue com policy
-- `financeiro_classificacao_staging_all` ALL USING(true): as 37.390 linhas continuam legiveis
-- cross-tenant PELA TABELA BASE. Divida P0/P1 do DOMINIO-FINANCEIRO. O CORE-02 nao pode ser
-- apresentado como fechamento do dominio.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2)
--   (a) Ja existe? Parcialmente: o isolamento ja opera em 3 das 7 tabelas (migrations 27-28/07).
--       Este PR estende o MESMO isolamento as 4 que ficaram de fora.
--   (b) Reutilizar? Sim: o predicado das 45 policies vivas e as duas funcoes SECDEF existentes.
--   (c) Fonte soberana? public.cliente_membros, lida exclusivamente pelas duas funcoes SECDEF.
--   (d) Segunda forma? Nao. Substitui policies abertas. Sem RESTRICTIVE, sem funcao nova.
--   (e) Tela ou plataforma? Plataforma: fecha o P0 cross-tenant no nucleo.
--   (f) Divida? Reduz 9 policies abertas e 1 policy correta neutralizada; registra 5 dividas.
--
-- Migration PREPARADA — aplicar somente pelo processo autorizado.


-- C.0 PRE-CHECKS FATAIS ---------------------------------------------------------------------
DO $$
DECLARE
  c_owner CONSTANT text := 'postgres';
  v_bad text; v_super boolean; v_bypass boolean; v_n int; v_opts text;
BEGIN
  -- dependencia: CORE-02B aplicada
  SELECT coalesce(c.reloptions::text,'') INTO v_opts
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relname='vw_classificacao_staging_preview';
  IF v_opts IS NULL THEN
    RAISE EXCEPTION 'CORE-02: view de preview inexistente — CORE-02B nao foi aplicada';
  END IF;
  IF v_opts !~ 'security_invoker=(on|true)' THEN
    RAISE EXCEPTION 'CORE-02: CORE-02B NAO aplicada (view ainda definer, reloptions=%). '
                    'Aplicar 20260816120000 primeiro — nao pode existir janela com o bypass ativo.',
                    v_opts;
  END IF;

  -- owners iguais e = postgres
  SELECT string_agg(c.relname||'->'||ow.rolname, ', ' ORDER BY c.relname) INTO v_bad
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_roles ow ON ow.oid = c.relowner
   WHERE n.nspname='public'
     AND c.relname IN ('clientes','fazendas','cliente_membros','financeiro_contas_bancarias')
     AND ow.rolname <> c_owner;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'CORE-02: owner inesperado (esperado %): %', c_owner, v_bad;
  END IF;

  -- owner ignora RLS
  SELECT r.rolsuper, r.rolbypassrls INTO v_super, v_bypass
    FROM pg_catalog.pg_roles r WHERE r.rolname = c_owner;
  IF NOT (v_super OR v_bypass) THEN
    RAISE EXCEPTION 'CORE-02: owner % nao ignora RLS (super=%, bypass=%)', c_owner, v_super, v_bypass;
  END IF;

  -- FORCE RLS desligado: invariante conservadora (SUPERUSER/BYPASSRLS ignoram RLS mesmo com
  -- FORCE ligado; a trava protege um fallback futuro sem BYPASSRLS)
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_bad
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public'
     AND c.relname IN ('clientes','fazendas','cliente_membros','financeiro_contas_bancarias')
     AND c.relforcerowsecurity;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'CORE-02: FORCE ROW LEVEL SECURITY ativo em %: invariante conservadora exige desligado', v_bad;
  END IF;

  -- as duas funcoes de tenant existem, sao SECDEF e STABLE
  SELECT count(*) INTO v_n
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('is_admin_agroinblue','get_user_cliente_ids')
     AND p.prosecdef AND p.provolatile = 's';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CORE-02: esperadas 2 funcoes de tenant SECDEF+STABLE, achei %', v_n;
  END IF;

  -- as 9 policies a remover existem com a definicao EXATA de hoje
  SELECT count(*) INTO v_n FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND pol.polpermissive AND (
     (c.relname='clientes'        AND pol.polname='clientes_select_all'          AND pol.polcmd='r' AND pg_get_expr(pol.polqual,pol.polrelid)='true') OR
     (c.relname='fazendas'        AND pol.polname='fazendas_select_all'          AND pol.polcmd='r' AND pg_get_expr(pol.polqual,pol.polrelid)='true') OR
     (c.relname='fazendas'        AND pol.polname='fazendas_update_all'          AND pol.polcmd='w' AND pg_get_expr(pol.polqual,pol.polrelid)='true' AND pg_get_expr(pol.polwithcheck,pol.polrelid)='true') OR
     (c.relname='cliente_membros' AND pol.polname='cliente_membros_select_open'  AND pol.polcmd='r' AND pg_get_expr(pol.polqual,pol.polrelid)='true') OR
     (c.relname='cliente_membros' AND pol.polname='usuario_ve_seus_clientes'     AND pol.polcmd='r' AND pg_get_expr(pol.polqual,pol.polrelid)='(auth.uid() = user_id)') OR
     (c.relname='financeiro_contas_bancarias' AND pol.polname='cb_sel'           AND pol.polcmd='r' AND pg_get_expr(pol.polqual,pol.polrelid)='true') OR
     (c.relname='financeiro_contas_bancarias' AND pol.polname='cb_ins'           AND pol.polcmd='a' AND pg_get_expr(pol.polwithcheck,pol.polrelid)='true') OR
     (c.relname='financeiro_contas_bancarias' AND pol.polname='cb_update'        AND pol.polcmd='w' AND pg_get_expr(pol.polqual,pol.polrelid)='true' AND pg_get_expr(pol.polwithcheck,pol.polrelid)='true') OR
     (c.relname='financeiro_contas_bancarias' AND pol.polname='cb_delete'        AND pol.polcmd='d' AND pg_get_expr(pol.polqual,pol.polrelid)='true'));
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'CORE-02: esperadas 9 policies antigas com definicao exata, achei % — estado divergente', v_n;
  END IF;

  -- congela o hash das policies das 3 tabelas-controle
  PERFORM set_config('app.core02_controle_md5',
    (SELECT md5(string_agg(c.relname||'|'||pol.polname||'|'||pol.polcmd::text||'|'||pol.polpermissive::text
                ||'|'||coalesce(pg_get_expr(pol.polqual,pol.polrelid),'~')
                ||'|'||coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'~')
                ||'|'||coalesce((SELECT string_agg(r.rolname,'+' ORDER BY r.rolname)
                                   FROM pg_roles r WHERE r.oid = ANY(pol.polroles)),'PUBLIC'),
                E'\n' ORDER BY c.relname, pol.polname))
       FROM pg_catalog.pg_policy pol
       JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public'
        AND c.relname IN ('financeiro_lancamentos_v2','extrato_bancario_v2','conciliacao_bancaria_itens')),
    true);

  RAISE NOTICE 'CORE-02 pre-checks OK: CORE-02B aplicada, owner=% (super=%, bypass=%), FORCE RLS off, 2 funcoes SECDEF+STABLE, 9 policies antigas conferidas.',
               c_owner, v_super, v_bypass;
END $$;


-- C.1 REMOCAO — as 9 policies abertas ---------------------------------------------------------
DROP POLICY "clientes_select_all"           ON public.clientes;
DROP POLICY "fazendas_select_all"           ON public.fazendas;
DROP POLICY "fazendas_update_all"           ON public.fazendas;
DROP POLICY "cliente_membros_select_open"   ON public.cliente_membros;
DROP POLICY "usuario_ve_seus_clientes"      ON public.cliente_membros;
DROP POLICY "cb_sel"                        ON public.financeiro_contas_bancarias;
DROP POLICY "cb_ins"                        ON public.financeiro_contas_bancarias;
DROP POLICY "cb_update"                     ON public.financeiro_contas_bancarias;
DROP POLICY "cb_delete"                     ON public.financeiro_contas_bancarias;


-- C.2 CRIACAO — as 8 policies tenant-aware ----------------------------------------------------

-- clientes: predicado por `id` (a propria linha e' o tenant)
CREATE POLICY "clientes_select_tenant" ON public.clientes
  FOR SELECT TO authenticated
  USING (
    (select is_admin_agroinblue((select auth.uid())))
    OR id IN (SELECT t.cliente_id FROM get_user_cliente_ids((select auth.uid())) t(cliente_id))
  );

-- fazendas
CREATE POLICY "fazendas_select_tenant" ON public.fazendas
  FOR SELECT TO authenticated
  USING (
    (select is_admin_agroinblue((select auth.uid())))
    OR cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids((select auth.uid())) t(cliente_id))
  );

CREATE POLICY "fazendas_update_tenant" ON public.fazendas
  FOR UPDATE TO authenticated
  USING (
    (select is_admin_agroinblue((select auth.uid())))
    OR cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids((select auth.uid())) t(cliente_id))
  )
  WITH CHECK (
    (select is_admin_agroinblue((select auth.uid())))
    OR cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids((select auth.uid())) t(cliente_id))
  );

-- cliente_membros: tenant + ramo self (ve a propria linha, inclusive inativa)
CREATE POLICY "cliente_membros_select_tenant" ON public.cliente_membros
  FOR SELECT TO authenticated
  USING (
    (select is_admin_agroinblue((select auth.uid())))
    OR user_id = (select auth.uid())
    OR cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids((select auth.uid())) t(cliente_id))
  );

-- financeiro_contas_bancarias: CRUD completo, tenant-aware
CREATE POLICY "cb_select_tenant" ON public.financeiro_contas_bancarias
  FOR SELECT TO authenticated
  USING (
    (select is_admin_agroinblue((select auth.uid())))
    OR cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids((select auth.uid())) t(cliente_id))
  );

CREATE POLICY "cb_insert_tenant" ON public.financeiro_contas_bancarias
  FOR INSERT TO authenticated
  WITH CHECK (
    (select is_admin_agroinblue((select auth.uid())))
    OR cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids((select auth.uid())) t(cliente_id))
  );

CREATE POLICY "cb_update_tenant" ON public.financeiro_contas_bancarias
  FOR UPDATE TO authenticated
  USING (
    (select is_admin_agroinblue((select auth.uid())))
    OR cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids((select auth.uid())) t(cliente_id))
  )
  WITH CHECK (
    (select is_admin_agroinblue((select auth.uid())))
    OR cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids((select auth.uid())) t(cliente_id))
  );

CREATE POLICY "cb_delete_tenant" ON public.financeiro_contas_bancarias
  FOR DELETE TO authenticated
  USING (
    (select is_admin_agroinblue((select auth.uid())))
    OR cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids((select auth.uid())) t(cliente_id))
  );


-- C.3 POS-CHECKS FATAIS -------------------------------------------------------------------------
DO $$
DECLARE
  v_n int; v_bad text; v_md5 text; v_esperado text;
BEGIN
  -- contagem total nas 4
  SELECT count(*) INTO v_n FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public'
     AND c.relname IN ('clientes','fazendas','cliente_membros','financeiro_contas_bancarias');
  IF v_n <> 8 THEN RAISE EXCEPTION 'CORE-02: esperadas 8 policies nas 4 tabelas, achei %', v_n; END IF;

  -- contagem por tabela: 1 / 2 / 1 / 4
  SELECT string_agg(x.relname||'='||x.n, ', ' ORDER BY x.relname) INTO v_bad FROM (
    SELECT c.relname, count(*) n FROM pg_catalog.pg_policy pol
      JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public'
       AND c.relname IN ('clientes','fazendas','cliente_membros','financeiro_contas_bancarias')
     GROUP BY c.relname) x
   WHERE NOT ((x.relname='clientes' AND x.n=1) OR (x.relname='fazendas' AND x.n=2)
           OR (x.relname='cliente_membros' AND x.n=1) OR (x.relname='financeiro_contas_bancarias' AND x.n=4));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'CORE-02: contagem por tabela inesperada: %', v_bad; END IF;

  -- zero USING(true)/CHECK(true) permissiva nas 4
  SELECT string_agg(c.relname||'.'||pol.polname, ', ') INTO v_bad
    FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND pol.polpermissive
     AND c.relname IN ('clientes','fazendas','cliente_membros','financeiro_contas_bancarias')
     AND (coalesce(pg_get_expr(pol.polqual,pol.polrelid),'') = 'true'
       OR coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'') = 'true');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'CORE-02: sobrou predicado true em %', v_bad; END IF;

  -- todas TO authenticated (e nenhuma TO PUBLIC)
  SELECT string_agg(c.relname||'.'||pol.polname, ', ') INTO v_bad
    FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public'
     AND c.relname IN ('clientes','fazendas','cliente_membros','financeiro_contas_bancarias')
     AND NOT EXISTS (SELECT 1 FROM pg_roles r
                      WHERE r.oid = ANY(pol.polroles) AND r.rolname='authenticated');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'CORE-02: policy nao restrita a authenticated: %', v_bad; END IF;

  -- zero RESTRICTIVE criada
  SELECT count(*) INTO v_n FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND NOT pol.polpermissive
     AND c.relname IN ('clientes','fazendas','cliente_membros','financeiro_contas_bancarias');
  IF v_n <> 0 THEN RAISE EXCEPTION 'CORE-02: % policy RESTRICTIVE criada — proibido neste lote', v_n; END IF;

  -- operacoes que devem seguir SEM policy (negadas)
  SELECT string_agg(c.relname||'['||pol.polcmd::text||']', ', ') INTO v_bad
    FROM pg_catalog.pg_policy pol
    JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND (
     (c.relname='clientes'        AND pol.polcmd IN ('a','w','d')) OR
     (c.relname='fazendas'        AND pol.polcmd IN ('a','d'))     OR
     (c.relname='cliente_membros' AND pol.polcmd IN ('a','w','d')));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'CORE-02: este PR nao deve ampliar CRUD; achei %', v_bad;
  END IF;

  -- anon segue sem privilegio de tabela nas 4
  SELECT string_agg(t.n, ', ') INTO v_bad FROM (
    SELECT unnest(ARRAY['clientes','fazendas','cliente_membros','financeiro_contas_bancarias']) n) t
   WHERE has_table_privilege('anon','public.'||t.n,'SELECT')
      OR has_table_privilege('anon','public.'||t.n,'INSERT')
      OR has_table_privilege('anon','public.'||t.n,'UPDATE')
      OR has_table_privilege('anon','public.'||t.n,'DELETE');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'CORE-02: anon tem privilegio em %', v_bad; END IF;

  -- as 3 tabelas-controle inalteradas
  v_md5 := (SELECT md5(string_agg(c.relname||'|'||pol.polname||'|'||pol.polcmd::text||'|'||pol.polpermissive::text
              ||'|'||coalesce(pg_get_expr(pol.polqual,pol.polrelid),'~')
              ||'|'||coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'~')
              ||'|'||coalesce((SELECT string_agg(r.rolname,'+' ORDER BY r.rolname)
                                 FROM pg_roles r WHERE r.oid = ANY(pol.polroles)),'PUBLIC'),
              E'\n' ORDER BY c.relname, pol.polname))
     FROM pg_catalog.pg_policy pol
     JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public'
      AND c.relname IN ('financeiro_lancamentos_v2','extrato_bancario_v2','conciliacao_bancaria_itens'));
  v_esperado := current_setting('app.core02_controle_md5', true);
  IF v_esperado IS NULL OR v_esperado = '' THEN
    RAISE EXCEPTION 'CORE-02: hash das tabelas-controle nao foi congelado no pre-check';
  END IF;
  IF v_md5 IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'CORE-02: policies das 3 tabelas-controle mudaram (% -> %)', v_esperado, v_md5;
  END IF;

  RAISE NOTICE 'CORE-02 pos-checks OK: 8 policies (1/2/1/4), zero predicado true, todas TO authenticated, zero RESTRICTIVE, CRUD nao ampliado, anon sem privilegio, 3 tabelas-controle inalteradas.';
END $$;


-- ==============================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- Restaura as 9 policies originais byte a byte. REABRE o vazamento cross-tenant.
-- Medida de emergencia com prazo, nunca estado de repouso.
-- ----------------------------------------------------------------------------------------------
-- DROP POLICY "clientes_select_tenant"        ON public.clientes;
-- DROP POLICY "fazendas_select_tenant"        ON public.fazendas;
-- DROP POLICY "fazendas_update_tenant"        ON public.fazendas;
-- DROP POLICY "cliente_membros_select_tenant" ON public.cliente_membros;
-- DROP POLICY "cb_select_tenant"              ON public.financeiro_contas_bancarias;
-- DROP POLICY "cb_insert_tenant"              ON public.financeiro_contas_bancarias;
-- DROP POLICY "cb_update_tenant"              ON public.financeiro_contas_bancarias;
-- DROP POLICY "cb_delete_tenant"              ON public.financeiro_contas_bancarias;
--
-- CREATE POLICY "clientes_select_all"         ON public.clientes        FOR SELECT USING (true);
-- CREATE POLICY "fazendas_select_all"         ON public.fazendas        FOR SELECT USING (true);
-- CREATE POLICY "fazendas_update_all"         ON public.fazendas        FOR UPDATE USING (true) WITH CHECK (true);
-- CREATE POLICY "cliente_membros_select_open" ON public.cliente_membros FOR SELECT USING (true);
-- CREATE POLICY "usuario_ve_seus_clientes"    ON public.cliente_membros FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "cb_sel"    ON public.financeiro_contas_bancarias FOR SELECT USING (true);
-- CREATE POLICY "cb_ins"    ON public.financeiro_contas_bancarias FOR INSERT WITH CHECK (true);
-- CREATE POLICY "cb_update" ON public.financeiro_contas_bancarias FOR UPDATE USING (true) WITH CHECK (true);
-- CREATE POLICY "cb_delete" ON public.financeiro_contas_bancarias FOR DELETE USING (true);
--
-- DO $rb$
-- DECLARE v_n int;
-- BEGIN
--   SELECT count(*) INTO v_n FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
--     JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public'
--      AND c.relname IN ('clientes','fazendas','cliente_membros','financeiro_contas_bancarias');
--   IF v_n <> 9 THEN RAISE EXCEPTION 'rollback CORE-02: % policies, esperado 9', v_n; END IF;
--   RAISE NOTICE 'rollback CORE-02 OK: 9 policies originais restauradas. VAZAMENTO REABERTO.';
-- END $rb$;
-- ----------------------------------------------------------------------------------------------
-- VERIFICACOES ESPERADAS APOS O ROLLBACK:
--   1) 9 policies nas 4 tabelas, todas PERMISSIVE, todas TO PUBLIC;
--   2) as 3 tabelas-controle seguem inalteradas;
--   3) membro nao-admin volta a enxergar clientes/fazendas/contas de outros tenants;
--   4) o CORE-02B (view) NAO e' revertido por este bloco — tem rollback proprio.
-- ==============================================================================================
