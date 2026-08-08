-- PR-SEC-RLS-TENANT-CORE-02B + CORE-02 — testes de isolamento por tenant no nucleo.
--
--   EXECUCAO REAL COMO ROLE: SET LOCAL ROLE no nivel de statement (authenticated / anon),
--   nunca dentro de um DO rodando como owner. RESET ROLE so' para preparar/inspecionar fixtures.
--
--   Requer aplicadas, NESTA ORDEM:
--     20260816120000_pr_sec_rls_tenant_core_02b_view_invoker
--     20260816130000_pr_sec_rls_tenant_core_02
--
--   2 TENANTS x 5 ATORES. UUIDs sinteticos, prefixo 22222222-0000-4000-8000-:
--     ...a01 admin_agroinblue (global)      ...a02 gestor_cliente de A
--     ...a03 campo de A                     ...a04 gestor de A INATIVO
--     ...a05 sem membership                 ...a06 gestor de B
--     ...c0a cliente A                      ...c0b cliente B
--     ...f0a fazenda A                      ...f0b fazenda B
--     ...b0a conta A                        ...b0b conta B
--
--   BEGIN...ROLLBACK + residuo zero filtrado por sentinela. NAO aplicar no proto.

BEGIN;

-- ==============================================================================================
-- FIXTURES — como postgres
-- ==============================================================================================
INSERT INTO auth.users (id) VALUES
  ('22222222-0000-4000-8000-000000000a01'),('22222222-0000-4000-8000-000000000a02'),
  ('22222222-0000-4000-8000-000000000a03'),('22222222-0000-4000-8000-000000000a04'),
  ('22222222-0000-4000-8000-000000000a05'),('22222222-0000-4000-8000-000000000a06');

INSERT INTO public.clientes (id, nome, slug) VALUES
  ('22222222-0000-4000-8000-000000000c0a','__CORE02_TENANT_A__','__core02_tenant_a__'),
  ('22222222-0000-4000-8000-000000000c0b','__CORE02_TENANT_B__','__core02_tenant_b__');

INSERT INTO public.cliente_membros (cliente_id, user_id, perfil, ativo) VALUES
  ('22222222-0000-4000-8000-000000000c0a','22222222-0000-4000-8000-000000000a01','admin_agroinblue',true),
  ('22222222-0000-4000-8000-000000000c0a','22222222-0000-4000-8000-000000000a02','gestor_cliente',  true),
  ('22222222-0000-4000-8000-000000000c0a','22222222-0000-4000-8000-000000000a03','campo',           true),
  ('22222222-0000-4000-8000-000000000c0a','22222222-0000-4000-8000-000000000a04','gestor_cliente',  false),
  ('22222222-0000-4000-8000-000000000c0b','22222222-0000-4000-8000-000000000a06','gestor_cliente',  true);

INSERT INTO public.fazendas (id, cliente_id, nome, codigo, codigo_importacao, owner_id, tem_pecuaria) VALUES
  ('22222222-0000-4000-8000-000000000f0a','22222222-0000-4000-8000-000000000c0a','__CORE02_FAZ_A__','C2A','C2A','22222222-0000-4000-8000-000000000a02',false),
  ('22222222-0000-4000-8000-000000000f0b','22222222-0000-4000-8000-000000000c0b','__CORE02_FAZ_B__','C2B','C2B','22222222-0000-4000-8000-000000000a06',false);

INSERT INTO public.financeiro_contas_bancarias (id, cliente_id, fazenda_id, nome_conta, nome_exibicao, tipo_conta) VALUES
  ('22222222-0000-4000-8000-000000000b0a','22222222-0000-4000-8000-000000000c0a','22222222-0000-4000-8000-000000000f0a','__CORE02_CONTA_A__','__CORE02_EXIB_A__','cc'),
  ('22222222-0000-4000-8000-000000000b0b','22222222-0000-4000-8000-000000000c0b','22222222-0000-4000-8000-000000000f0b','__CORE02_CONTA_B__','__CORE02_EXIB_B__','cc');

-- lancamentos e sessoes de staging: alimentam a prova POSITIVA da view (G8a)
INSERT INTO public.financeiro_lancamentos_v2
  (id, cliente_id, fazenda_id, conta_bancaria_id, descricao, valor, sinal, status_transacao, ano_mes, data_pagamento) VALUES
  ('22222222-0000-4000-8000-0000000010a1','22222222-0000-4000-8000-000000000c0a','22222222-0000-4000-8000-000000000f0a','22222222-0000-4000-8000-000000000b0a','__CORE02_LANC_A__',100.50,'-1','realizado','2026-08','2026-08-01'),
  ('22222222-0000-4000-8000-0000000010b1','22222222-0000-4000-8000-000000000c0b','22222222-0000-4000-8000-000000000f0b','22222222-0000-4000-8000-000000000b0b','__CORE02_LANC_B__',200.75,'-1','realizado','2026-08','2026-08-01');

INSERT INTO public.financeiro_classificacao_staging
  (sessao_id, cliente_id, match_status, match_lancamento_id, conta_origem_id, excel_linha_origem, excel_valor, update_proposto) VALUES
  ('22222222-0000-4000-8000-00000000551a','22222222-0000-4000-8000-000000000c0a','exato','22222222-0000-4000-8000-0000000010a1','22222222-0000-4000-8000-000000000b0a',1,100.50,'{"subcentro":"__CORE02_SUB_A__"}'::jsonb),
  ('22222222-0000-4000-8000-00000000551b','22222222-0000-4000-8000-000000000c0b','exato','22222222-0000-4000-8000-0000000010b1','22222222-0000-4000-8000-000000000b0b',1,200.75,'{"subcentro":"__CORE02_SUB_B__"}'::jsonb);

-- ==============================================================================================
-- G0 — estado estrutural: inventario 9->8, zero RESTRICTIVE, CORE-02B ligado
-- ==============================================================================================
DO $t$
DECLARE v_n int; v_bad text; v_opts text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND c.relname IN ('clientes','fazendas','cliente_membros','financeiro_contas_bancarias');
  IF v_n <> 8 THEN RAISE EXCEPTION 'G0 FALHOU: % policies nas 4, esperado 8', v_n; END IF;

  SELECT count(*) INTO v_n FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT pol.polpermissive
      AND c.relname IN ('clientes','fazendas','cliente_membros','financeiro_contas_bancarias');
  IF v_n <> 0 THEN RAISE EXCEPTION 'G0 FALHOU: % RESTRICTIVE', v_n; END IF;

  SELECT string_agg(c.relname||'.'||pol.polname, ', ') INTO v_bad
    FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND pol.polpermissive
     AND c.relname IN ('clientes','fazendas','cliente_membros','financeiro_contas_bancarias')
     AND (coalesce(pg_get_expr(pol.polqual,pol.polrelid),'')='true'
       OR coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'')='true');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'G0 FALHOU: predicado true em %', v_bad; END IF;

  SELECT coalesce(c.reloptions::text,'') INTO v_opts FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='vw_classificacao_staging_preview';
  IF v_opts !~ 'security_invoker=(on|true)' THEN
    RAISE EXCEPTION 'G0 FALHOU: CORE-02B nao aplicada (reloptions=%)', v_opts;
  END IF;

  -- ordenacao real dos timestamps
  IF '20260816120000' >= '20260816130000' THEN
    RAISE EXCEPTION 'G0 FALHOU: CORE-02B nao ordena antes do CORE-02';
  END IF;

  RAISE NOTICE 'G0 estrutura: 8 policies, 0 RESTRICTIVE, 0 predicado true, invoker on, ordem ok  OK';
END $t$;

-- G0b — hash das 3 tabelas-controle, congelado para comparacao no fim
DO $t$ BEGIN
  PERFORM set_config('app.c02_controle',
    (SELECT md5(string_agg(c.relname||'|'||pol.polname||'|'||pol.polcmd::text||'|'||pol.polpermissive::text
                ||'|'||coalesce(pg_get_expr(pol.polqual,pol.polrelid),'~')
                ||'|'||coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'~'), E'\n'
                ORDER BY c.relname, pol.polname))
       FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
        AND c.relname IN ('financeiro_lancamentos_v2','extrato_bancario_v2','conciliacao_bancaria_itens')), true);
END $t$;

-- ==============================================================================================
-- G1 — anon: zero acesso nas 4 (policies agora TO authenticated)
-- ==============================================================================================
SET LOCAL ROLE anon;
DO $t$
DECLARE v_n int; falhas int := 0; st text;
BEGIN
  IF current_user <> 'anon' THEN RAISE EXCEPTION 'G1 setup: current_user=%', current_user; END IF;
  FOR st IN SELECT unnest(ARRAY['clientes','fazendas','cliente_membros','financeiro_contas_bancarias'])
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', st) INTO v_n;
      IF v_n <> 0 THEN falhas := falhas+1; RAISE WARNING 'G1 FALHOU: anon leu % linhas de %', v_n, st; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;  -- tambem aceito
    END;
  END LOOP;
  IF falhas > 0 THEN RAISE EXCEPTION 'G1: anon com acesso'; END IF;
  RAISE NOTICE 'G1 anon: zero acesso nas 4 tabelas ..... OK';
END $t$;
RESET ROLE;

-- ==============================================================================================
-- G2 — gestor de A: positivo proprio tenant, negativo contra B
-- ==============================================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-0000-4000-8000-000000000a02","role":"authenticated"}';
SET LOCAL request.jwt.claim.sub = '';
DO $t$
DECLARE cA uuid := '22222222-0000-4000-8000-000000000c0a';
        cB uuid := '22222222-0000-4000-8000-000000000c0b';
        v_n int; falhas int := 0;
BEGIN
  SELECT count(*) INTO v_n FROM public.clientes WHERE id=cA;
  IF v_n<>1 THEN falhas:=falhas+1; RAISE WARNING 'G2 clientes proprio=%', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.clientes WHERE id=cB;
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G2 clientes ALHEIO=%', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.fazendas WHERE cliente_id=cA;
  IF v_n<>1 THEN falhas:=falhas+1; RAISE WARNING 'G2 fazendas proprio=%', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.fazendas WHERE cliente_id=cB;
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G2 fazendas ALHEIO=%', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.financeiro_contas_bancarias WHERE cliente_id=cA;
  IF v_n<>1 THEN falhas:=falhas+1; RAISE WARNING 'G2 contas proprio=%', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.financeiro_contas_bancarias WHERE cliente_id=cB;
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G2 contas ALHEIO=%', v_n; END IF;

  -- UPDATE proprio: 1 linha. UPDATE alheio: 0 linhas.
  UPDATE public.fazendas SET nome='__CORE02_FAZ_A_EDIT__' WHERE cliente_id=cA;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n<>1 THEN falhas:=falhas+1; RAISE WARNING 'G2 update fazenda propria=%', v_n; END IF;
  UPDATE public.fazendas SET nome='__INVASAO__' WHERE cliente_id=cB;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G2 update fazenda ALHEIA=%', v_n; END IF;

  UPDATE public.financeiro_contas_bancarias SET nome_conta='__CORE02_CONTA_A_EDIT__' WHERE cliente_id=cA;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n<>1 THEN falhas:=falhas+1; RAISE WARNING 'G2 update conta propria=%', v_n; END IF;
  UPDATE public.financeiro_contas_bancarias SET nome_conta='__INVASAO__' WHERE cliente_id=cB;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G2 update conta ALHEIA=%', v_n; END IF;

  IF falhas>0 THEN RAISE EXCEPTION 'G2: % falha(s)', falhas; END IF;
  RAISE NOTICE 'G2 gestor A: positivo proprio, zero em B  OK';
END $t$;

-- G3 — troca maliciosa de cliente_id (mesmo ator)
DO $t$
DECLARE cA uuid := '22222222-0000-4000-8000-000000000c0a';
        cB uuid := '22222222-0000-4000-8000-000000000c0b';
        st text; v_n int; falhas int := 0;
BEGIN
  BEGIN
    UPDATE public.fazendas SET cliente_id=cB WHERE cliente_id=cA;
    st := 'SEM ERRO';
  EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
  IF st <> '42501' THEN falhas:=falhas+1; RAISE WARNING 'G3 fazendas: esperado 42501, veio %', st; END IF;
  SELECT count(*) INTO v_n FROM public.fazendas WHERE cliente_id=cA;
  IF v_n<>1 THEN falhas:=falhas+1; RAISE WARNING 'G3 fazendas: alteracao parcial (%)', v_n; END IF;

  BEGIN
    UPDATE public.financeiro_contas_bancarias SET cliente_id=cB WHERE cliente_id=cA;
    st := 'SEM ERRO';
  EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
  IF st <> '42501' THEN falhas:=falhas+1; RAISE WARNING 'G3 contas: esperado 42501, veio %', st; END IF;
  SELECT count(*) INTO v_n FROM public.financeiro_contas_bancarias WHERE cliente_id=cA;
  IF v_n<>1 THEN falhas:=falhas+1; RAISE WARNING 'G3 contas: alteracao parcial (%)', v_n; END IF;

  -- INSERT de conta em tenant alheio
  BEGIN
    INSERT INTO public.financeiro_contas_bancarias (cliente_id, fazenda_id, nome_conta, tipo_conta)
      VALUES (cB,'22222222-0000-4000-8000-000000000f0b','__INVASAO__','cc');
    st := 'SEM ERRO';
  EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
  IF st <> '42501' THEN falhas:=falhas+1; RAISE WARNING 'G3 insert conta em B: esperado 42501, veio %', st; END IF;

  -- DELETE de conta alheia: 0 linhas
  DELETE FROM public.financeiro_contas_bancarias WHERE cliente_id=cB;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G3 delete conta ALHEIA=%', v_n; END IF;

  IF falhas>0 THEN RAISE EXCEPTION 'G3: % falha(s)', falhas; END IF;
  RAISE NOTICE 'G3 troca maliciosa de cliente_id barrada  OK';
END $t$;

-- G4 — INSERT de conta no proprio tenant funciona
DO $t$
DECLARE v_n int;
BEGIN
  INSERT INTO public.financeiro_contas_bancarias (cliente_id, fazenda_id, nome_conta, tipo_conta)
    VALUES ('22222222-0000-4000-8000-000000000c0a','22222222-0000-4000-8000-000000000f0a','__CORE02_CONTA_A2__','cc');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n<>1 THEN RAISE EXCEPTION 'G4 FALHOU: insert proprio tenant afetou % linhas', v_n; END IF;
  DELETE FROM public.financeiro_contas_bancarias WHERE nome_conta='__CORE02_CONTA_A2__';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n<>1 THEN RAISE EXCEPTION 'G4 FALHOU: delete proprio tenant afetou % linhas', v_n; END IF;
  RAISE NOTICE 'G4 insert+delete no proprio tenant ..... OK';
END $t$;
RESET ROLE;

-- ==============================================================================================
-- G5 — campo de A: mesmo contrato do gestor (nao ha distincao de papel neste PR)
-- ==============================================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-0000-4000-8000-000000000a03","role":"authenticated"}';
DO $t$
DECLARE v_n int; falhas int := 0;
BEGIN
  SELECT count(*) INTO v_n FROM public.clientes WHERE id='22222222-0000-4000-8000-000000000c0a';
  IF v_n<>1 THEN falhas:=falhas+1; RAISE WARNING 'G5 campo nao ve proprio cliente'; END IF;
  SELECT count(*) INTO v_n FROM public.clientes WHERE id='22222222-0000-4000-8000-000000000c0b';
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G5 campo ve cliente B'; END IF;
  SELECT count(*) INTO v_n FROM public.financeiro_contas_bancarias WHERE cliente_id='22222222-0000-4000-8000-000000000c0b';
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G5 campo ve conta de B'; END IF;
  IF falhas>0 THEN RAISE EXCEPTION 'G5: % falha(s)', falhas; END IF;
  RAISE NOTICE 'G5 campo A: mesmo contrato do gestor .... OK';
END $t$;
RESET ROLE;

-- ==============================================================================================
-- G6 — cliente_membros: os 5 casos (a..e)
-- ==============================================================================================
-- (a) ATIVO ve vinculos do proprio tenant
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-0000-4000-8000-000000000a02","role":"authenticated"}';
DO $t$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.cliente_membros WHERE cliente_id='22222222-0000-4000-8000-000000000c0a';
  IF v_n<>4 THEN RAISE EXCEPTION 'G6a FALHOU: ativo ve % vinculos de A, esperado 4', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.cliente_membros WHERE cliente_id='22222222-0000-4000-8000-000000000c0b';
  IF v_n<>0 THEN RAISE EXCEPTION 'G6a FALHOU: ativo ve % vinculos de B', v_n; END IF;
  RAISE NOTICE 'G6a ativo ve os 4 vinculos de A, 0 de B  OK';
END $t$;
RESET ROLE;

-- (b)(c) INATIVO ve SOMENTE a propria linha
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-0000-4000-8000-000000000a04","role":"authenticated"}';
DO $t$
DECLARE v_n int; falhas int := 0;
BEGIN
  SELECT count(*) INTO v_n FROM public.cliente_membros;
  IF v_n<>1 THEN falhas:=falhas+1; RAISE WARNING 'G6b FALHOU: inativo ve % linhas no total, esperado 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.cliente_membros WHERE user_id='22222222-0000-4000-8000-000000000a04';
  IF v_n<>1 THEN falhas:=falhas+1; RAISE WARNING 'G6b FALHOU: inativo nao ve a propria linha'; END IF;
  SELECT count(*) INTO v_n FROM public.cliente_membros
   WHERE cliente_id='22222222-0000-4000-8000-000000000c0a' AND user_id<>'22222222-0000-4000-8000-000000000a04';
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G6c FALHOU: inativo ve % colegas', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.cliente_membros WHERE cliente_id='22222222-0000-4000-8000-000000000c0b';
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G6c FALHOU: inativo ve tenant B'; END IF;
  -- e nao ve o cliente nem a fazenda de A (nao e' membro ativo)
  SELECT count(*) INTO v_n FROM public.clientes WHERE id='22222222-0000-4000-8000-000000000c0a';
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G6b FALHOU: inativo ve o cliente A'; END IF;
  IF falhas>0 THEN RAISE EXCEPTION 'G6b/c: % falha(s)', falhas; END IF;
  RAISE NOTICE 'G6b/c inativo ve so a propria linha ..... OK';
END $t$;
RESET ROLE;

-- (d) SEM MEMBERSHIP ve zero
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-0000-4000-8000-000000000a05","role":"authenticated"}';
DO $t$
DECLARE v_n int; falhas int := 0;
BEGIN
  SELECT count(*) INTO v_n FROM public.cliente_membros;              IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G6d membros=%', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.clientes;                     IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G6d clientes=%', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.fazendas;                     IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G6d fazendas=%', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.financeiro_contas_bancarias;  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G6d contas=%', v_n; END IF;
  IF falhas>0 THEN RAISE EXCEPTION 'G6d: % falha(s)', falhas; END IF;
  RAISE NOTICE 'G6d sem membership: zero em tudo ....... OK';
END $t$;
RESET ROLE;

-- (e) ADMIN ve os dois tenants
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-0000-4000-8000-000000000a01","role":"authenticated"}';
DO $t$
DECLARE v_n int; falhas int := 0;
BEGIN
  SELECT count(*) INTO v_n FROM public.clientes
   WHERE id IN ('22222222-0000-4000-8000-000000000c0a','22222222-0000-4000-8000-000000000c0b');
  IF v_n<>2 THEN falhas:=falhas+1; RAISE WARNING 'G6e admin ve % clientes, esperado 2', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.fazendas
   WHERE cliente_id IN ('22222222-0000-4000-8000-000000000c0a','22222222-0000-4000-8000-000000000c0b');
  IF v_n<>2 THEN falhas:=falhas+1; RAISE WARNING 'G6e admin ve % fazendas, esperado 2', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.financeiro_contas_bancarias
   WHERE cliente_id IN ('22222222-0000-4000-8000-000000000c0a','22222222-0000-4000-8000-000000000c0b');
  IF v_n<>2 THEN falhas:=falhas+1; RAISE WARNING 'G6e admin ve % contas, esperado 2', v_n; END IF;
  -- admin altera fazenda do tenant B
  UPDATE public.fazendas SET nome='__CORE02_FAZ_B_ADMIN__' WHERE cliente_id='22222222-0000-4000-8000-000000000c0b';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n<>1 THEN falhas:=falhas+1; RAISE WARNING 'G6e admin update em B afetou %', v_n; END IF;
  IF falhas>0 THEN RAISE EXCEPTION 'G6e: % falha(s)', falhas; END IF;
  RAISE NOTICE 'G6e admin: os dois tenants, leitura e escrita  OK';
END $t$;
RESET ROLE;

-- ==============================================================================================
-- G7 — operacoes que devem CONTINUAR negadas (nao ampliar CRUD)
-- ==============================================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-0000-4000-8000-000000000a02","role":"authenticated"}';
DO $t$
DECLARE st text; v_n int; falhas int := 0;
BEGIN
  BEGIN INSERT INTO public.clientes (nome,slug) VALUES ('__X__','__x_core02__'); st:='SEM ERRO';
  EXCEPTION WHEN OTHERS THEN st:=SQLSTATE; END;
  IF st<>'42501' THEN falhas:=falhas+1; RAISE WARNING 'G7 insert clientes: %', st; END IF;

  UPDATE public.clientes SET nome='__X__' WHERE id='22222222-0000-4000-8000-000000000c0a';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G7 update clientes afetou %', v_n; END IF;

  DELETE FROM public.clientes WHERE id='22222222-0000-4000-8000-000000000c0a';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G7 delete clientes afetou %', v_n; END IF;

  BEGIN INSERT INTO public.fazendas (cliente_id,nome,codigo,owner_id)
        VALUES ('22222222-0000-4000-8000-000000000c0a','__X__','XXX','22222222-0000-4000-8000-000000000a02');
        st:='SEM ERRO';
  EXCEPTION WHEN OTHERS THEN st:=SQLSTATE; END;
  IF st<>'42501' THEN falhas:=falhas+1; RAISE WARNING 'G7 insert fazendas: %', st; END IF;

  DELETE FROM public.fazendas WHERE cliente_id='22222222-0000-4000-8000-000000000c0a';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n<>0 THEN falhas:=falhas+1; RAISE WARNING 'G7 delete fazendas afetou %', v_n; END IF;

  BEGIN INSERT INTO public.cliente_membros (cliente_id,user_id,perfil)
        VALUES ('22222222-0000-4000-8000-000000000c0a','22222222-0000-4000-8000-000000000a05','campo');
        st:='SEM ERRO';
  EXCEPTION WHEN OTHERS THEN st:=SQLSTATE; END;
  IF st<>'42501' THEN falhas:=falhas+1; RAISE WARNING 'G7 insert cliente_membros: %', st; END IF;

  IF falhas>0 THEN RAISE EXCEPTION 'G7: % falha(s)', falhas; END IF;
  RAISE NOTICE 'G7 CRUD nao ampliado (6 operacoes) ..... OK';
END $t$;
RESET ROLE;

-- ==============================================================================================
-- G8 — CORE-02B: a view respeita a RLS do chamador
--   G8a POSITIVO: gestor A recebe INTEGRALMENTE a propria sessao, com os campos derivados
--   G8b NEGATIVO: zero lancamento/conta do tenant B
--   G8c ADMIN:    leitura funcional dos dois tenants
--   G8d CATALOGO: security_invoker on, authenticated com SELECT, anon sem SELECT
-- Sem o G8a, uma view que devolvesse ZERO para todos passaria no negativo.
-- ==============================================================================================

-- G8d — catalogo (como postgres)
DO $t$
DECLARE v_opts text; falhas int := 0;
BEGIN
  SELECT coalesce(c.reloptions::text,'') INTO v_opts FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='vw_classificacao_staging_preview';
  IF v_opts !~ 'security_invoker=(on|true)' THEN
    falhas:=falhas+1; RAISE WARNING 'G8d security_invoker: %', v_opts; END IF;
  IF NOT has_table_privilege('authenticated','public.vw_classificacao_staging_preview','SELECT') THEN
    falhas:=falhas+1; RAISE WARNING 'G8d authenticated SEM SELECT na view'; END IF;
  IF has_table_privilege('anon','public.vw_classificacao_staging_preview','SELECT') THEN
    falhas:=falhas+1; RAISE WARNING 'G8d anon COM SELECT na view'; END IF;
  IF falhas>0 THEN RAISE EXCEPTION 'G8d: % falha(s)', falhas; END IF;
  RAISE NOTICE 'G8d catalogo: invoker=%, auth com SELECT, anon sem  OK', v_opts;
END $t$;

-- G8a + G8b — como gestor de A
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-0000-4000-8000-000000000a02","role":"authenticated"}';
DO $t$
DECLARE
  sA uuid := '22222222-0000-4000-8000-00000000551a';
  cB uuid := '22222222-0000-4000-8000-000000000c0b';
  r record; v_n int; falhas int := 0;
BEGIN
  ------------------------------------------------------------------ G8a POSITIVO
  SELECT count(*) INTO v_n FROM public.vw_classificacao_staging_preview WHERE sessao_id = sA;
  IF v_n <> 1 THEN
    falhas:=falhas+1; RAISE WARNING 'G8a: sessao propria devolveu % linhas, esperado 1', v_n;
  ELSE
    SELECT * INTO r FROM public.vw_classificacao_staging_preview WHERE sessao_id = sA;
    -- campos da propria staging
    IF r.cliente_id <> '22222222-0000-4000-8000-000000000c0a' THEN falhas:=falhas+1; RAISE WARNING 'G8a cliente_id=%', r.cliente_id; END IF;
    IF r.match_status <> 'exato' THEN falhas:=falhas+1; RAISE WARNING 'G8a match_status=%', r.match_status; END IF;
    IF r.excel_valor <> 100.50 THEN falhas:=falhas+1; RAISE WARNING 'G8a excel_valor=%', r.excel_valor; END IF;
    IF r.proposto_subcentro <> '__CORE02_SUB_A__' THEN falhas:=falhas+1; RAISE WARNING 'G8a proposto_subcentro=%', r.proposto_subcentro; END IF;
    -- campos DERIVADOS DE LANCAMENTO (financeiro_lancamentos_v2, tabela protegida)
    IF r.lanc_id IS NULL          THEN falhas:=falhas+1; RAISE WARNING 'G8a lanc_id NULO — join de lancamento perdido'; END IF;
    IF r.lanc_descricao <> '__CORE02_LANC_A__' THEN falhas:=falhas+1; RAISE WARNING 'G8a lanc_descricao=%', r.lanc_descricao; END IF;
    IF r.lanc_valor <> 100.50     THEN falhas:=falhas+1; RAISE WARNING 'G8a lanc_valor=%', r.lanc_valor; END IF;
    IF r.lanc_status <> 'realizado' THEN falhas:=falhas+1; RAISE WARNING 'G8a lanc_status=%', r.lanc_status; END IF;
    -- campo DERIVADO DE CONTA (financeiro_contas_bancarias)
    IF r.lanc_conta_bancaria_nome <> '__CORE02_EXIB_A__' THEN falhas:=falhas+1; RAISE WARNING 'G8a conta=%', r.lanc_conta_bancaria_nome; END IF;
    IF r.conta_filtro_nome IS NULL THEN falhas:=falhas+1; RAISE WARNING 'G8a conta_filtro_nome NULO'; END IF;
    -- campo DERIVADO DE FAZENDA
    -- prefixo, nao igualdade: G2 renomeia a fazenda A para ..._EDIT__ antes deste bloco
    IF r.lanc_fazenda_nome IS NULL OR NOT starts_with(r.lanc_fazenda_nome, '__CORE02_FAZ_A') THEN
      falhas:=falhas+1; RAISE WARNING 'G8a fazenda=%', coalesce(r.lanc_fazenda_nome,'NULO'); END IF;
  END IF;
  IF falhas=0 THEN RAISE NOTICE 'G8a POSITIVO: sessao propria integral (lanc+conta+fazenda)  OK'; END IF;

  ------------------------------------------------------------------ G8b NEGATIVO
  SELECT count(*) INTO v_n FROM public.vw_classificacao_staging_preview
   WHERE cliente_id = cB AND lanc_id IS NOT NULL;
  IF v_n <> 0 THEN falhas:=falhas+1; RAISE WARNING 'G8b: % lancamento(s) do tenant B', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.vw_classificacao_staging_preview
   WHERE cliente_id = cB AND lanc_conta_bancaria_nome IS NOT NULL;
  IF v_n <> 0 THEN falhas:=falhas+1; RAISE WARNING 'G8b: % conta(s) do tenant B', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.vw_classificacao_staging_preview
   WHERE lanc_descricao = '__CORE02_LANC_B__' OR lanc_conta_bancaria_nome = '__CORE02_EXIB_B__';
  IF v_n <> 0 THEN falhas:=falhas+1; RAISE WARNING 'G8b: dado nominal de B vazou (%)', v_n; END IF;

  IF falhas>0 THEN RAISE EXCEPTION 'G8a/G8b: % falha(s)', falhas; END IF;
  RAISE NOTICE 'G8b NEGATIVO: zero lancamento/conta do tenant B ... OK';
END $t$;
RESET ROLE;

-- G8c — admin: leitura funcional dos dois tenants
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-0000-4000-8000-000000000a01","role":"authenticated"}';
DO $t$
DECLARE v_n int; falhas int := 0;
BEGIN
  SELECT count(*) INTO v_n FROM public.vw_classificacao_staging_preview
   WHERE sessao_id IN ('22222222-0000-4000-8000-00000000551a','22222222-0000-4000-8000-00000000551b')
     AND lanc_id IS NOT NULL;
  IF v_n <> 2 THEN falhas:=falhas+1; RAISE WARNING 'G8c admin ve % linhas com lancamento, esperado 2', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.vw_classificacao_staging_preview
   WHERE lanc_descricao IN ('__CORE02_LANC_A__','__CORE02_LANC_B__');
  IF v_n <> 2 THEN falhas:=falhas+1; RAISE WARNING 'G8c admin ve % descricoes, esperado 2', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.vw_classificacao_staging_preview
   WHERE lanc_conta_bancaria_nome IN ('__CORE02_EXIB_A__','__CORE02_EXIB_B__');
  IF v_n <> 2 THEN falhas:=falhas+1; RAISE WARNING 'G8c admin ve % contas, esperado 2', v_n; END IF;
  IF falhas>0 THEN RAISE EXCEPTION 'G8c: % falha(s)', falhas; END IF;
  RAISE NOTICE 'G8c ADMIN: le os dois tenants pela view ....... OK';
END $t$;
RESET ROLE;

-- ==============================================================================================
-- G9 — as 3 tabelas-controle byte a byte inalteradas
-- ==============================================================================================
DO $t$
DECLARE v_md5 text; v_esp text;
BEGIN
  v_md5 := (SELECT md5(string_agg(c.relname||'|'||pol.polname||'|'||pol.polcmd::text||'|'||pol.polpermissive::text
              ||'|'||coalesce(pg_get_expr(pol.polqual,pol.polrelid),'~')
              ||'|'||coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'~'), E'\n'
              ORDER BY c.relname, pol.polname))
     FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND c.relname IN ('financeiro_lancamentos_v2','extrato_bancario_v2','conciliacao_bancaria_itens'));
  v_esp := current_setting('app.c02_controle', true);
  IF v_md5 IS DISTINCT FROM v_esp THEN
    RAISE EXCEPTION 'G9 FALHOU: tabelas-controle mudaram (% -> %)', v_esp, v_md5;
  END IF;
  RAISE NOTICE 'G9 3 tabelas-controle inalteradas (md5 %)  OK', left(v_md5,12);
END $t$;

-- ==============================================================================================
-- G10 — divida registrada: staging segue aberta (o CORE-02 nao fecha o dominio)
-- ==============================================================================================
DO $t$
DECLARE v_open boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
                   JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='public' AND c.relname='financeiro_classificacao_staging'
                    AND pol.polpermissive AND coalesce(pg_get_expr(pol.polqual,pol.polrelid),'')='true')
    INTO v_open;
  IF NOT v_open THEN
    RAISE NOTICE 'G10: financeiro_classificacao_staging JA foi fechada — atualizar a divida.';
  ELSE
    RAISE NOTICE 'G10 DIVIDA CONFIRMADA: financeiro_classificacao_staging segue ALL USING(true). '
                 'O CORE-02 NAO encerra o dominio financeiro — P0/P1 do DOMINIO-FINANCEIRO.';
  END IF;
END $t$;

DO $t$ BEGIN RAISE NOTICE '=== CORE-02B + CORE-02: TODOS OS TESTES PASSARAM ==='; END $t$;

ROLLBACK;

-- Residuo (fora da transacao) — filtrado apenas pelos sentinelas sinteticos deste teste.
SELECT '__CORE02_ clientes' AS alvo, count(*) AS n FROM public.clientes WHERE nome LIKE '\_\_CORE02\_%'
UNION ALL SELECT 'slug __core02_',    count(*) FROM public.clientes WHERE slug LIKE '\_\_core02\_%'
UNION ALL SELECT '__CORE02_ fazendas',count(*) FROM public.fazendas WHERE nome LIKE '\_\_CORE02\_%'
UNION ALL SELECT '__CORE02_ contas',  count(*) FROM public.financeiro_contas_bancarias WHERE nome_conta LIKE '\_\_CORE02\_%'
UNION ALL SELECT '__INVASAO__',       count(*) FROM public.fazendas WHERE nome = '__INVASAO__'
UNION ALL SELECT 'auth.users 22222222-', count(*) FROM auth.users WHERE id::text LIKE '22222222-0000-4000-8000-%'
UNION ALL SELECT 'cliente_membros sint.', count(*) FROM public.cliente_membros WHERE user_id::text LIKE '22222222-0000-4000-8000-%'
UNION ALL SELECT '__CORE02_ lancamentos', count(*) FROM public.financeiro_lancamentos_v2 WHERE descricao LIKE '\_\_CORE02\_%'
UNION ALL SELECT '__CORE02_ staging',     count(*) FROM public.financeiro_classificacao_staging WHERE sessao_id::text LIKE '22222222-0000-4000-8000-%';
