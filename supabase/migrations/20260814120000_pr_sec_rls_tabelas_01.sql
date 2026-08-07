-- PR-SEC-RLS-TABELAS-01 — fecha exposição das 15 tabelas sem RLS + higiene mínima
-- Inventário-base (proto 07/08/2026): 6 backups com anon+authenticated; 8 com
-- authenticated; fechamento_area_snapshot (authenticated) é OPERACIONAL
-- (front lê via useFechamentoArea/useHistoricoIndicador, SOMENTE SELECT;
-- escrita via RPC SECURITY DEFINER) → recebe RLS tenant, não revoke de leitura.
-- Padrão de policy: fechamento_p1_tenant. Decisões D1-D6 do briefing aprovado.

-- 1) 14 tabelas: REVOKE total de anon e authenticated (service_role/owner e
--    caminhos SECURITY DEFINER preservados — audit/staging seguem operando).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    '_backup_rebanho_auto_escopo_null_20260515','_backup_venda_amendoim_escopo_20260515',
    '_bkp_morte_ident_20260806','_bkp_ofx_dup_20260804',
    'backup_lanc_transferencia_entrada_2020_nj_20260514','chuvas_backup_20260516',
    'conciliacao_audit_log','extrato_bancario_staging','extrato_bancario_staging_itens',
    'mesa_par_backup_pr6_1b_20260524','mesa_par_backup_pr6_1c_20260525',
    'meta_versoes_backup_20260516','planejamento_financeiro_backup_20260516',
    'valor_rebanho_meta_validada_backup_20260516']
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- 2) fechamento_area_snapshot: RLS tenant (padrão fechamento_p1_tenant);
--    leitura de authenticated preservada via policy; anon revogado.
REVOKE ALL ON public.fechamento_area_snapshot FROM anon, authenticated;
GRANT SELECT ON public.fechamento_area_snapshot TO authenticated;
ALTER TABLE public.fechamento_area_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fechamento_area_snapshot_select_tenant ON public.fechamento_area_snapshot;
CREATE POLICY fechamento_area_snapshot_select_tenant
  ON public.fechamento_area_snapshot FOR SELECT TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR cliente_id IN
         (SELECT cliente_id FROM public.cliente_membros
           WHERE user_id = auth.uid()));
-- Sem policy de escrita: escrita legítima é via RPC SECURITY DEFINER
-- (gerar_snapshot_area / fn_gerar_area_de_snapshot); escrita direta nasce negada.

-- 3) search_path das 3 únicas SECDEF auth-executáveis sem fixação:
ALTER FUNCTION public.refresh_zoot_cache(uuid, integer)          SET search_path = pg_catalog, public;
ALTER FUNCTION public.refresh_zoot_cache(uuid, integer, integer) SET search_path = pg_catalog, public;
ALTER FUNCTION public.refresh_zoot_cache(uuid, integer, text)    SET search_path = pg_catalog, public;

-- 4) trigger-fns MORTAS (evidência: auth.users tem ZERO triggers e a Edge
--    Function criar-usuario insere profiles diretamente; o trigger da guard
--    [criado em 20260330184649, era 1] não existe mais). REVOKE defensivo;
--    DROP fica para PR de higiene, junto do descarte dos backups.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_financeiro_mes_fechado() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.handle_new_user() IS
  'MORTA (comprovado 2026-08-07): auth.users sem triggers; profiles criado pela EF criar-usuario. DROP previsto em PR de higiene.';
COMMENT ON FUNCTION public.guard_financeiro_mes_fechado() IS
  'MORTA (comprovado 2026-08-07): trigger de 20260330184649 (era 1, financeiro_fechamentos V1) não existe mais. DROP previsto em PR de higiene.';

-- 5) PÓS-CHECK FATAL (qualquer falha → EXCEPTION → rollback integral)
DO $$
DECLARE v_bad text; v_n int;
BEGIN
  -- (a) RLS ativa no snapshot
  PERFORM 1 FROM pg_tables WHERE schemaname='public'
    AND tablename='fechamento_area_snapshot' AND rowsecurity;
  IF NOT FOUND THEN RAISE EXCEPTION 'pos-check a: RLS inativa no snapshot'; END IF;
  -- (a2) authenticated: SELECT=true e os 6 nao-SELECT=false (menor privilegio)
  IF NOT has_table_privilege('authenticated','public.fechamento_area_snapshot','SELECT') THEN
    RAISE EXCEPTION 'pos-check a2: authenticated perdeu SELECT do snapshot';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) pr
             WHERE has_table_privilege('authenticated','public.fechamento_area_snapshot',pr)) THEN
    RAISE EXCEPTION 'pos-check a2b: authenticated com privilegio de escrita no snapshot';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) pr
             WHERE has_table_privilege('anon','public.fechamento_area_snapshot',pr)) THEN
    RAISE EXCEPTION 'pos-check a3: anon ainda acessa snapshot';
  END IF;
  -- (a4) policy EXATA e UNICA: nome, cmd SELECT, role authenticated, USING aprovada
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = 'public.fechamento_area_snapshot'::regclass;
  IF v_n <> 1 THEN RAISE EXCEPTION 'pos-check a4: % policies na tabela (esperado exatamente 1)', v_n; END IF;
  PERFORM 1 FROM pg_policy p
   WHERE p.polrelid = 'public.fechamento_area_snapshot'::regclass
     AND p.polname = 'fechamento_area_snapshot_select_tenant'
     AND p.polcmd = 'r'
     AND p.polpermissive
     AND p.polroles = ARRAY['authenticated'::regrole]::oid[]
     AND pg_get_expr(p.polqual, p.polrelid) LIKE '%is_admin_agroinblue(auth.uid())%'
     AND pg_get_expr(p.polqual, p.polrelid) LIKE '%cliente_membros%'
     AND pg_get_expr(p.polqual, p.polrelid) LIKE '%user_id = auth.uid()%'
     AND p.polwithcheck IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'pos-check a4: policy divergente da aprovada'; END IF;
  -- (b) zero privilégio de anon/authenticated nas 14
  SELECT string_agg(t,',') INTO v_bad FROM unnest(ARRAY[
    '_backup_rebanho_auto_escopo_null_20260515','_backup_venda_amendoim_escopo_20260515',
    '_bkp_morte_ident_20260806','_bkp_ofx_dup_20260804',
    'backup_lanc_transferencia_entrada_2020_nj_20260514','chuvas_backup_20260516',
    'conciliacao_audit_log','extrato_bancario_staging','extrato_bancario_staging_itens',
    'mesa_par_backup_pr6_1b_20260524','mesa_par_backup_pr6_1c_20260525',
    'meta_versoes_backup_20260516','planejamento_financeiro_backup_20260516',
    'valor_rebanho_meta_validada_backup_20260516']) w(t)
  WHERE EXISTS (SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) pr
                WHERE has_table_privilege('anon','public.'||t,pr)
                   OR has_table_privilege('authenticated','public.'||t,pr));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'pos-check b: privilegio residual em %', v_bad; END IF;
  -- (c) search_path com VALOR EXATO por assinatura (nao por contagem)
  PERFORM 1 FROM pg_proc WHERE oid = 'public.refresh_zoot_cache(uuid,integer)'::regprocedure
    AND proconfig = ARRAY['search_path=pg_catalog, public'];
  IF NOT FOUND THEN RAISE EXCEPTION 'pos-check c1: refresh_zoot_cache(uuid,integer) sem search_path exato'; END IF;
  PERFORM 1 FROM pg_proc WHERE oid = 'public.refresh_zoot_cache(uuid,integer,integer)'::regprocedure
    AND proconfig = ARRAY['search_path=pg_catalog, public'];
  IF NOT FOUND THEN RAISE EXCEPTION 'pos-check c2: refresh_zoot_cache(uuid,integer,integer) sem search_path exato'; END IF;
  PERFORM 1 FROM pg_proc WHERE oid = 'public.refresh_zoot_cache(uuid,integer,text)'::regprocedure
    AND proconfig = ARRAY['search_path=pg_catalog, public'];
  IF NOT FOUND THEN RAISE EXCEPTION 'pos-check c3: refresh_zoot_cache(uuid,integer,text) sem search_path exato'; END IF;
  -- (c4) PUBLIC/anon/authenticated sem CREATE no schema public.
  --      PUBLIC via ACL canonica (aclexplode grantee=0), nao por nome de role.
  IF has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN
    RAISE EXCEPTION 'pos-check c4: CREATE no schema public para anon/authenticated'; END IF;
  PERFORM 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
   WHERE n.nspname = 'public' AND a.grantee = 0 AND a.privilege_type = 'CREATE';
  IF FOUND THEN RAISE EXCEPTION 'pos-check c4b: CREATE no schema public para PUBLIC'; END IF;
  -- (d) órfãs sem EXECUTE de PUBLIC, anon e authenticated
  IF has_function_privilege('anon','public.handle_new_user()','EXECUTE')
     OR has_function_privilege('authenticated','public.handle_new_user()','EXECUTE')
     OR has_function_privilege('anon','public.guard_financeiro_mes_fechado()','EXECUTE')
     OR has_function_privilege('authenticated','public.guard_financeiro_mes_fechado()','EXECUTE') THEN
    RAISE EXCEPTION 'pos-check d: orfa ainda executavel por anon/authenticated';
  END IF;
  PERFORM 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid IN ('public.handle_new_user()'::regprocedure,'public.guard_financeiro_mes_fechado()'::regprocedure)
     AND a.grantee = 0 AND a.privilege_type = 'EXECUTE';
  IF FOUND THEN RAISE EXCEPTION 'pos-check d2: orfa ainda executavel por PUBLIC'; END IF;
  PERFORM 1 FROM pg_proc WHERE oid IN ('public.handle_new_user()'::regprocedure,'public.guard_financeiro_mes_fechado()'::regprocedure) AND proacl IS NULL;
  IF FOUND THEN RAISE EXCEPTION 'pos-check d3: proacl NULL (default devolve EXECUTE a PUBLIC)'; END IF;
  RAISE NOTICE 'PR-SEC-RLS-TABELAS-01: pos-checks a-d OK.';
END $$;
