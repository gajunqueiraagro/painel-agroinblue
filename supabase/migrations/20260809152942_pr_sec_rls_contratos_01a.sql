-- PR-SEC-RLS-CONTRATOS-01A — isolamento por tenant de public.financeiro_contratos.
--
-- P0. Estado corrente: RLS ligada, porem com UMA policy
--     `financeiro_contratos_all  FOR ALL TO PUBLIC USING(true) WITH CHECK(true)`,
--     e `authenticated` com os OITO privilegios, inclusive TRUNCATE — que ignora
--     RLS. Qualquer autenticado le, cria, altera e exclui contratos de qualquer
--     tenant.
--
-- ESTA MIGRATION FAZ EXATAMENTE ISTO:
--   1. remove a policy permissiva nominal;
--   2. cria tres policies nominais (SELECT, INSERT, UPDATE) para `authenticated`
--      com o predicado canonico ja usado em 22 tabelas do schema;
--   3. reduz privilegios: PUBLIC e anon a zero; `authenticated` a
--      SELECT/INSERT/UPDATE; remove os quatro perigosos tambem de `service_role`.
--
-- NAO FAZ, deliberadamente:
--   - nenhuma policy DELETE (a exclusao segura e o 01B);
--   - nenhuma policy FOR ALL, nenhuma dirigida a PUBLIC/anon;
--   - nada em public.financeiro_lancamentos_v2;
--   - nenhuma alteracao de dados, shape, PK, FK, indice, nulabilidade ou trigger;
--   - nao liga FORCE ROW LEVEL SECURITY (apenas fotografa o estado).
--
-- A ausencia de PRIMARY KEY e de indices nesta tabela e drift conhecido,
-- pertencente ao futuro PR-SEC-SCHEMA-CONTRATOS-02. Aqui ela e apenas CONFERIDA,
-- nunca corrigida.
--
-- IDEMPOTENCIA EM QUATRO ESTADOS
--   permissivo exato  -> converte
--   final exato       -> NO-OP VERDADEIRO, nenhum comando emitido
--   misto/divergente  -> ABORTA preservando tudo
--   objeto ausente    -> ABORTA
-- Nao ha convergencia por sobrescrita cega.

DO $mig$
DECLARE
  c_tab   constant text := 'public.financeiro_contratos';
  c_owner constant name := 'postgres';

  -- Predicado canonico. Literal unico: e o que se cria e o que se compara.
  -- `(SELECT auth.uid())` forca o planejador a materializar o valor uma vez
  -- por consulta (InitPlan), em vez de reavaliar por linha.
  c_pred constant text :=
    '(is_admin_agroinblue(( SELECT auth.uid() AS uid)) OR (cliente_id IN ( SELECT t.cliente_id'||E'\n'||
    '   FROM get_user_cliente_ids(( SELECT auth.uid() AS uid)) t(cliente_id))))';

  v_reg        oid;
  v_n          int;
  v_txt        text;
  v_rls        boolean;
  v_force      boolean;
  v_acl        text;
  v_linhas     bigint;
  v_fp         text;
  v_estado     text;
  v_div        text := '';
BEGIN
  -- =========================================================================
  -- PRE-CHECKS FATAIS — fotografia do estado vivo esperado
  -- =========================================================================
  SELECT c.oid, c.relrowsecurity, c.relforcerowsecurity
    INTO v_reg, v_rls, v_force
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'financeiro_contratos' AND c.relkind = 'r';
  IF v_reg IS NULL THEN
    RAISE EXCEPTION '01A P1: tabela % nao encontrada — abortando', c_tab;
  END IF;

  IF pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = v_reg)) <> c_owner THEN
    RAISE EXCEPTION '01A P2: owner inesperado (esperado %)', c_owner;
  END IF;

  IF v_rls IS NOT TRUE THEN
    RAISE EXCEPTION '01A P3: RLS desligada — estado inesperado, abortando';
  END IF;

  -- P4. FORCE RLS: apenas FOTOGRAFIA. Esta frente nao altera este flag.
  RAISE NOTICE '01A P4: FORCE ROW LEVEL SECURITY = % (fotografado, nao alterado)', v_force;

  -- P5. Drift conhecido: ausencia de PK e de indices. Conferido, nunca corrigido.
  SELECT count(*) INTO v_n FROM pg_constraint WHERE conrelid = v_reg AND contype = 'p';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '01A P5: a tabela passou a ter PRIMARY KEY — o drift mudou, abortando para reavaliacao';
  END IF;
  SELECT count(*) INTO v_n FROM pg_index WHERE indrelid = v_reg;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '01A P5: a tabela passou a ter indice(s) — o drift mudou, abortando para reavaliacao';
  END IF;

  -- P6. Predicado canonico presente e com as propriedades esperadas.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_user_cliente_ids'
     AND p.provolatile='s' AND p.prosecdef = true
     AND p.prorettype='pg_catalog.uuid'::regtype AND p.proretset = true
     AND array_to_string(p.proconfig,',') = 'search_path=public';
  IF v_n <> 1 THEN RAISE EXCEPTION '01A P6: get_user_cliente_ids ausente ou com propriedades divergentes'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='is_admin_agroinblue'
     AND p.provolatile='s' AND p.prosecdef = true
     AND p.prorettype='pg_catalog.bool'::regtype
     AND array_to_string(p.proconfig,',') = 'search_path=public';
  IF v_n <> 1 THEN RAISE EXCEPTION '01A P6: is_admin_agroinblue ausente ou com propriedades divergentes'; END IF;

  -- P7. attacl de TODAS as colunas: nenhuma pode ter ACL propria (bypass residual).
  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = v_reg AND attnum > 0 AND NOT attisdropped AND attacl IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '01A P7: % coluna(s) com ACL propria — bypass residual possivel, abortando', v_n;
  END IF;

  -- P8. Volumetria e fingerprint logico. Congelados AQUI e reconferidos no
  --     pos-check: prova de nao-mutacao sem depender de contagem fixa.
  SELECT count(*) INTO v_linhas FROM public.financeiro_contratos;
  SELECT md5(coalesce(string_agg(md5(row(c.*)::text), '|' ORDER BY c.id::text), ''))
    INTO v_fp FROM public.financeiro_contratos c;

  -- =========================================================================
  -- DETECCAO DE ESTADO — quatro estados, mutuamente exclusivos
  -- =========================================================================
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = v_reg;

  IF v_n = 1 AND EXISTS (
       SELECT 1 FROM pg_policy pol
        WHERE pol.polrelid = v_reg
          AND pol.polname = 'financeiro_contratos_all'
          AND pol.polcmd = '*'
          AND pol.polpermissive
          AND pol.polroles = '{0}'::oid[]                      -- 0 = PUBLIC
          AND pg_get_expr(pol.polqual, v_reg) = 'true'
          AND pg_get_expr(pol.polwithcheck, v_reg) = 'true')
  THEN
    v_estado := 'PERMISSIVO';

  ELSIF v_n = 3
    AND (SELECT count(*) FROM pg_policy pol
          WHERE pol.polrelid = v_reg
            AND pol.polname IN ('financeiro_contratos_select',
                                'financeiro_contratos_insert',
                                'financeiro_contratos_update')) = 3
  THEN
    v_estado := 'FINAL';

  ELSE
    RAISE EXCEPTION
      '01A: estado MISTO/DIVERGENTE — % policy(ies) presente(s), nenhuma das duas formas conhecidas. Abortando SEM alterar nada.', v_n;
  END IF;

  -- =========================================================================
  IF v_estado = 'FINAL' THEN
    -- Reaplicacao: conferir integralmente e NAO emitir comando algum.
    FOR v_txt IN
      SELECT pol.polname || '|' || pol.polcmd::text || '|' || pol.polpermissive::text
             || '|' || coalesce((SELECT string_agg(pg_get_userbyid(r), '/' ORDER BY pg_get_userbyid(r))
                                   FROM unnest(pol.polroles) r), 'PUBLIC')
             || '|' || coalesce(pg_get_expr(pol.polqual, v_reg), '(sem)')
             || '|' || coalesce(pg_get_expr(pol.polwithcheck, v_reg), '(sem)')
        FROM pg_policy pol WHERE pol.polrelid = v_reg ORDER BY pol.polname
    LOOP
      IF v_txt NOT IN (
        'financeiro_contratos_insert|a|true|authenticated|(sem)|'   || c_pred,
        'financeiro_contratos_select|r|true|authenticated|'         || c_pred || '|(sem)',
        'financeiro_contratos_update|w|true|authenticated|'         || c_pred || '|' || c_pred
      ) THEN
        v_div := v_div || ' policy[' || v_txt || '];';
      END IF;
    END LOOP;

    SELECT coalesce(string_agg(
             coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') || ':' || a.privilege_type,
             ',' ORDER BY coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC'), a.privilege_type), '(vazia)')
      INTO v_acl
      FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     WHERE c.oid = v_reg;
    IF v_acl <> 'authenticated:INSERT,authenticated:SELECT,authenticated:UPDATE,'
              || 'postgres:DELETE,postgres:INSERT,postgres:MAINTAIN,postgres:REFERENCES,'
              || 'postgres:SELECT,postgres:TRIGGER,postgres:TRUNCATE,postgres:UPDATE,'
              || 'service_role:DELETE,service_role:INSERT,service_role:SELECT,service_role:UPDATE'
    THEN
      v_div := v_div || ' ACL[' || v_acl || '];';
    END IF;

    IF v_div <> '' THEN
      RAISE EXCEPTION '01A: estado FINAL parcial/divergente em:% — abortando SEM alterar nada', v_div;
    END IF;

    RAISE NOTICE '01A: estado ja e o final e e INTEGRALMENTE identico (3 policies + ACL) — NO-OP VERDADEIRO, nenhum comando emitido';

  ELSE
    -- ---------------------------------------------------------------------
    -- ESTADO PERMISSIVO -> converter
    -- ---------------------------------------------------------------------
    -- Snapshot da ACL de partida, para o relatorio e para o rollback.
    SELECT coalesce(string_agg(
             coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') || ':' || a.privilege_type,
             ',' ORDER BY coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC'), a.privilege_type), '(vazia)')
      INTO v_acl
      FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     WHERE c.oid = v_reg;
    RAISE NOTICE '01A: ACL de partida = [%]', v_acl;

    -- 1. Remover a permissiva. Policies permissivas se somam por OR: enquanto
    --    ela existir, nenhuma policy restritiva teria efeito.
    DROP POLICY financeiro_contratos_all ON public.financeiro_contratos;

    -- 2. Tres policies nominais, TO authenticated, com o predicado canonico.
    EXECUTE format(
      'CREATE POLICY financeiro_contratos_select ON public.financeiro_contratos '
      'FOR SELECT TO authenticated USING %s', c_pred);

    EXECUTE format(
      'CREATE POLICY financeiro_contratos_insert ON public.financeiro_contratos '
      'FOR INSERT TO authenticated WITH CHECK %s', c_pred);

    -- USING controla quais linhas sao alcancaveis; WITH CHECK impede que o
    -- UPDATE mova a linha para um tenant nao autorizado.
    EXECUTE format(
      'CREATE POLICY financeiro_contratos_update ON public.financeiro_contratos '
      'FOR UPDATE TO authenticated USING %s WITH CHECK %s', c_pred, c_pred);

    -- 3. Privilegios. TRUNCATE merece destaque: NAO e filtrado por RLS —
    --    enquanto authenticated o tiver, o isolamento e contornavel.
    REVOKE ALL ON TABLE public.financeiro_contratos FROM PUBLIC;
    REVOKE ALL ON TABLE public.financeiro_contratos FROM anon;
    REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
        ON TABLE public.financeiro_contratos FROM authenticated;
    -- service_role: o inventario nao encontrou consumidor vivo desta tabela.
    -- Os quatro perigosos saem tambem dele. SELECT/INSERT/UPDATE/DELETE
    -- permanecem por ser o papel de manutencao server-side do projeto — decisao
    -- declarada no relatorio, nao presuncao de consumidor invisivel.
    REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
        ON TABLE public.financeiro_contratos FROM service_role;

    RAISE NOTICE '01A: convertido — policy permissiva removida, 3 policies criadas, privilegios reduzidos';
  END IF;

  -- =========================================================================
  -- POS-CHECKS FATAIS
  -- =========================================================================
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = v_reg;
  IF v_n <> 3 THEN RAISE EXCEPTION '01A Q1: esperadas exatamente 3 policies, encontrei %', v_n; END IF;

  SELECT count(*) INTO v_n FROM pg_policy pol
   WHERE pol.polrelid = v_reg AND pol.polname = 'financeiro_contratos_all';
  IF v_n <> 0 THEN RAISE EXCEPTION '01A Q2: policy permissiva ainda presente'; END IF;

  SELECT count(*) INTO v_n FROM pg_policy pol
   WHERE pol.polrelid = v_reg
     AND (pg_get_expr(pol.polqual, v_reg) = 'true' OR pg_get_expr(pol.polwithcheck, v_reg) = 'true');
  IF v_n <> 0 THEN RAISE EXCEPTION '01A Q3: % policy(ies) com USING(true) ou WITH CHECK(true)', v_n; END IF;

  SELECT count(*) INTO v_n FROM pg_policy pol
   WHERE pol.polrelid = v_reg AND (pol.polcmd = 'd' OR pol.polcmd = '*');
  IF v_n <> 0 THEN RAISE EXCEPTION '01A Q4: existe policy DELETE ou FOR ALL — nao autorizado no 01A'; END IF;

  SELECT count(*) INTO v_n FROM pg_policy pol
   WHERE pol.polrelid = v_reg
     AND (pol.polroles = '{0}'::oid[]
       OR EXISTS (SELECT 1 FROM unnest(pol.polroles) r WHERE pg_get_userbyid(r) = 'anon'));
  IF v_n <> 0 THEN RAISE EXCEPTION '01A Q5: policy dirigida a PUBLIC ou anon'; END IF;

  -- Q6. Verificacao NOMINAL, literal, das tres policies.
  SELECT count(*) INTO v_n FROM pg_policy pol
   WHERE pol.polrelid = v_reg AND pol.polpermissive
     AND (SELECT string_agg(pg_get_userbyid(r), '/') FROM unnest(pol.polroles) r) = 'authenticated'
     AND ((pol.polname = 'financeiro_contratos_select' AND pol.polcmd = 'r'
           AND pg_get_expr(pol.polqual, v_reg) = c_pred AND pol.polwithcheck IS NULL)
       OR (pol.polname = 'financeiro_contratos_insert' AND pol.polcmd = 'a'
           AND pol.polqual IS NULL AND pg_get_expr(pol.polwithcheck, v_reg) = c_pred)
       OR (pol.polname = 'financeiro_contratos_update' AND pol.polcmd = 'w'
           AND pg_get_expr(pol.polqual, v_reg) = c_pred
           AND pg_get_expr(pol.polwithcheck, v_reg) = c_pred));
  IF v_n <> 3 THEN
    RAISE EXCEPTION '01A Q6: as 3 policies nao conferem nominalmente (nome/comando/role/predicado); conferidas=%', v_n;
  END IF;

  -- Q7. ACL integral por aclexplode(relacl).
  SELECT coalesce(string_agg(
           coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') || ':' || a.privilege_type,
           ',' ORDER BY coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC'), a.privilege_type), '(vazia)')
    INTO v_acl
    FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = v_reg;
  IF v_acl <> 'authenticated:INSERT,authenticated:SELECT,authenticated:UPDATE,'
            || 'postgres:DELETE,postgres:INSERT,postgres:MAINTAIN,postgres:REFERENCES,'
            || 'postgres:SELECT,postgres:TRIGGER,postgres:TRUNCATE,postgres:UPDATE,'
            || 'service_role:DELETE,service_role:INSERT,service_role:SELECT,service_role:UPDATE'
  THEN
    RAISE EXCEPTION '01A Q7: ACL final divergente — obtida [%]', v_acl;
  END IF;

  -- Q8. PUBLIC e anon com zero privilegios, nominal E efetivo.
  SELECT count(*) INTO v_n
    FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = v_reg
     AND coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') IN ('PUBLIC','anon');
  IF v_n <> 0 THEN RAISE EXCEPTION '01A Q8: PUBLIC/anon com % privilegio(s) nominal(is)', v_n; END IF;

  FOREACH v_txt IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF has_table_privilege('anon', v_reg, v_txt) THEN
      RAISE EXCEPTION '01A Q8: anon possui privilegio EFETIVO %', v_txt;
    END IF;
  END LOOP;

  -- Q9. authenticated: exatamente SELECT/INSERT/UPDATE, nominal e efetivo.
  FOREACH v_txt IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
    IF NOT has_table_privilege('authenticated', v_reg, v_txt) THEN
      RAISE EXCEPTION '01A Q9: authenticated PERDEU o privilegio necessario %', v_txt;
    END IF;
  END LOOP;
  FOREACH v_txt IN ARRAY ARRAY['DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF has_table_privilege('authenticated', v_reg, v_txt) THEN
      RAISE EXCEPTION '01A Q9: authenticated ainda possui privilegio EFETIVO %', v_txt;
    END IF;
  END LOOP;

  -- Q10. attacl de todas as colunas continua vazia (nenhum bypass residual).
  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = v_reg AND attnum > 0 AND NOT attisdropped AND attacl IS NOT NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION '01A Q10: % coluna(s) passaram a ter ACL propria', v_n; END IF;

  -- Q11. RLS ligada, FORCE inalterado, owner preservado.
  SELECT c.relrowsecurity, c.relforcerowsecurity INTO v_rls, v_force FROM pg_class c WHERE c.oid = v_reg;
  IF v_rls IS NOT TRUE THEN RAISE EXCEPTION '01A Q11: RLS deixou de estar ligada'; END IF;
  IF v_force IS DISTINCT FROM false THEN RAISE EXCEPTION '01A Q11: FORCE RLS foi alterado — nao autorizado'; END IF;
  IF pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = v_reg)) <> c_owner THEN
    RAISE EXCEPTION '01A Q11: owner alterado';
  END IF;

  -- Q12. Dados intocados: volumetria e fingerprint identicos ao pre-check.
  SELECT count(*) INTO v_n FROM public.financeiro_contratos;
  IF v_n <> v_linhas THEN RAISE EXCEPTION '01A Q12: volumetria mudou (% -> %)', v_linhas, v_n; END IF;
  SELECT md5(coalesce(string_agg(md5(row(c.*)::text), '|' ORDER BY c.id::text), ''))
    INTO v_txt FROM public.financeiro_contratos c;
  IF v_txt <> v_fp THEN RAISE EXCEPTION '01A Q12: fingerprint dos dados mudou'; END IF;

  -- Q13. Shape preservado: continua sem PK e sem indice (drift NAO corrigido aqui).
  SELECT count(*) INTO v_n FROM pg_constraint WHERE conrelid = v_reg;
  IF v_n <> 0 THEN RAISE EXCEPTION '01A Q13: constraint criada — fora do escopo do 01A'; END IF;
  SELECT count(*) INTO v_n FROM pg_index WHERE indrelid = v_reg;
  IF v_n <> 0 THEN RAISE EXCEPTION '01A Q13: indice criado — fora do escopo do 01A'; END IF;
  SELECT count(*) INTO v_n FROM pg_trigger WHERE tgrelid = v_reg AND NOT tgisinternal;
  IF v_n <> 1 THEN RAISE EXCEPTION '01A Q13: conjunto de triggers alterado (esperado 1)'; END IF;
  SELECT count(*) INTO v_n FROM pg_attribute WHERE attrelid = v_reg AND attnum > 0 AND NOT attisdropped;
  IF v_n <> 24 THEN RAISE EXCEPTION '01A Q13: numero de colunas mudou (esperado 24, obtido %)', v_n; END IF;

  -- Q14. Objeto fora do escopo: financeiro_lancamentos_v2 intocada.
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = 'public.financeiro_lancamentos_v2'::regclass;
  IF v_n <> 3 THEN RAISE EXCEPTION '01A Q14: policies de financeiro_lancamentos_v2 mudaram (esperado 3)'; END IF;
  SELECT count(*) INTO v_n FROM pg_policy
   WHERE polrelid = 'public.financeiro_lancamentos_v2'::regclass AND polcmd = 'd';
  IF v_n <> 0 THEN RAISE EXCEPTION '01A Q14: surgiu policy DELETE em financeiro_lancamentos_v2'; END IF;

  RAISE NOTICE '01A pos-checks OK: 3 policies nominais TO authenticated, zero USING(true), zero DELETE/ALL, PUBLIC+anon zerados, authenticated=SELECT/INSERT/UPDATE, ACL=[%], % linha(s) e fingerprint intactos, shape e lancamentos_v2 preservados', v_acl, v_linhas;
END
$mig$;
