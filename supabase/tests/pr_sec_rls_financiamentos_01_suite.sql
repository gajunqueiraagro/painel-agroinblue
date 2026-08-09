-- =====================================================================
-- PR-SEC-RLS-FINANCIAMENTOS-01 — SUITE DE TESTES
--
-- Fixtures EXCLUSIVAMENTE sinteticas, dentro de uma unica transacao que
-- termina em ROLLBACK. Nenhum dado real e lido, escrito ou derivado.
-- Executar SOMENTE em stack local efemera.
-- =====================================================================
\set ON_ERROR_STOP on
\timing off

BEGIN;

-- Barreira: recusa rodar fora de stack local efemera
DO $$
BEGIN
  IF pg_catalog.inet_server_port() IS DISTINCT FROM 5432
     AND pg_catalog.inet_server_port() IS DISTINCT FROM 54322 THEN
    RAISE EXCEPTION 'SUITE: porta inesperada (%). Abortando.', pg_catalog.inet_server_port();
  END IF;
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'SUITE: banco inesperado (%). Abortando.', current_database();
  END IF;
END $$;

CREATE TEMP TABLE _res(
  n serial,
  caso text,
  ok boolean,
  detalhe text
) ON COMMIT DROP;

-- SECURITY DEFINER: os casos rodam sob o papel authenticated, que nao tem
-- privilegio sobre a temp table de resultados.
CREATE FUNCTION pg_temp.chk(p_caso text, p_ok boolean, p_det text DEFAULT '') RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$ INSERT INTO _res(caso, ok, detalhe) VALUES (p_caso, p_ok, p_det) $$;

-- ---------------------------------------------------------------------
-- FIXTURES SINTETICAS
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _ids(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
INSERT INTO _ids(k, v) VALUES
  ('cliA', '00000000-0000-4000-8000-0000000000a1'),
  ('cliB', '00000000-0000-4000-8000-0000000000b1'),
  ('fazA', '00000000-0000-4000-8000-0000000000a2'),
  ('fazB', '00000000-0000-4000-8000-0000000000b2'),
  ('usrA', '00000000-0000-4000-8000-0000000000a3'),
  ('usrB', '00000000-0000-4000-8000-0000000000b3'),
  ('usrSem',     '00000000-0000-4000-8000-0000000000c3'),
  ('usrInativo', '00000000-0000-4000-8000-0000000000d3'),
  ('usrAdmin',   '00000000-0000-4000-8000-0000000000e3'),
  ('finA', '00000000-0000-4000-8000-0000000000a4'),
  ('finB', '00000000-0000-4000-8000-0000000000b4'),
  ('parA', '00000000-0000-4000-8000-0000000000a5'),
  ('parB', '00000000-0000-4000-8000-0000000000b5'),
  ('desA', '00000000-0000-4000-8000-0000000000a6'),
  ('desB', '00000000-0000-4000-8000-0000000000b6'),
  ('inex', '00000000-0000-4000-8000-0000000000f9');

-- os casos rodam sob authenticated e precisam ler os ids sinteticos
GRANT SELECT ON _ids TO authenticated;

-- usuarios sinteticos (FK fazendas.owner_id -> auth.users)
INSERT INTO auth.users(id) SELECT v FROM _ids WHERE k IN ('usrA','usrB','usrSem','usrInativo','usrAdmin');

INSERT INTO public.clientes(id, nome) SELECT v, 'SINTETICO-A' FROM _ids WHERE k='cliA';
INSERT INTO public.clientes(id, nome) SELECT v, 'SINTETICO-B' FROM _ids WHERE k='cliB';

-- owner_id obrigatorio: trigger auto_add_owner_as_membro insere em fazenda_membros
INSERT INTO public.fazendas(id, cliente_id, nome, owner_id)
  SELECT (SELECT v FROM _ids WHERE k='fazA'), (SELECT v FROM _ids WHERE k='cliA'), 'FAZ-SINT-A',
         (SELECT v FROM _ids WHERE k='usrA');
INSERT INTO public.fazendas(id, cliente_id, nome, owner_id)
  SELECT (SELECT v FROM _ids WHERE k='fazB'), (SELECT v FROM _ids WHERE k='cliB'), 'FAZ-SINT-B',
         (SELECT v FROM _ids WHERE k='usrB');

INSERT INTO public.cliente_membros(user_id, cliente_id, perfil, ativo) VALUES
  ((SELECT v FROM _ids WHERE k='usrA'),       (SELECT v FROM _ids WHERE k='cliA'), 'gestor_cliente',   true),
  ((SELECT v FROM _ids WHERE k='usrB'),       (SELECT v FROM _ids WHERE k='cliB'), 'gestor_cliente',   true),
  ((SELECT v FROM _ids WHERE k='usrInativo'), (SELECT v FROM _ids WHERE k='cliA'), 'gestor_cliente',   false),
  ((SELECT v FROM _ids WHERE k='usrAdmin'),   (SELECT v FROM _ids WHERE k='cliA'), 'admin_agroinblue', true);

INSERT INTO public.financiamentos(id, cliente_id, fazenda_id, tipo_financiamento, valor_total,
                                  valor_entrada, data_contrato, status)
VALUES
  ((SELECT v FROM _ids WHERE k='finA'), (SELECT v FROM _ids WHERE k='cliA'), (SELECT v FROM _ids WHERE k='fazA'),
   'pecuaria', 1000, 0, DATE '2031-01-10', 'ativo'),
  ((SELECT v FROM _ids WHERE k='finB'), (SELECT v FROM _ids WHERE k='cliB'), (SELECT v FROM _ids WHERE k='fazB'),
   'pecuaria', 2000, 0, DATE '2031-01-10', 'ativo');

INSERT INTO public.financiamento_parcelas(id, financiamento_id, cliente_id, numero_parcela,
                                          data_vencimento, valor_principal, valor_juros, valor_total, status)
VALUES
  ((SELECT v FROM _ids WHERE k='parA'), (SELECT v FROM _ids WHERE k='finA'), (SELECT v FROM _ids WHERE k='cliA'),
   1, DATE '2031-03-10', 100, 10, 110, 'pago'),
  ((SELECT v FROM _ids WHERE k='parB'), (SELECT v FROM _ids WHERE k='finB'), (SELECT v FROM _ids WHERE k='cliB'),
   1, DATE '2031-03-10', 200, 20, 220, 'pago');
UPDATE public.financiamento_parcelas SET data_pagamento = DATE '2031-03-10'
 WHERE id IN (SELECT v FROM _ids WHERE k IN ('parA','parB'));

INSERT INTO public.financiamento_destinacoes(id, financiamento_id, cliente_id, descricao, valor)
VALUES
  ((SELECT v FROM _ids WHERE k='desA'), (SELECT v FROM _ids WHERE k='finA'), (SELECT v FROM _ids WHERE k='cliA'), 'SINT-A', 1),
  ((SELECT v FROM _ids WHERE k='desB'), (SELECT v FROM _ids WHERE k='finB'), (SELECT v FROM _ids WHERE k='cliB'), 'SINT-B', 1);

-- =====================================================================
-- BLOCO 1 — ESTRUTURA (como postgres)
-- =====================================================================
DO $$
DECLARE
  c_pred constant text :=
    '(is_admin_agroinblue(( SELECT auth.uid() AS uid)) OR (cliente_id IN ( SELECT t.cliente_id'
    || E'\n   FROM get_user_cliente_ids(( SELECT auth.uid() AS uid)) t(cliente_id))))';
  c_tab constant text[] := ARRAY['financiamentos','financiamento_parcelas','financiamento_destinacoes'];
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname = ANY(c_tab);
  PERFORM pg_temp.chk('E1 total de policies = 11', v_n = 11, v_n::text);

  SELECT count(*) INTO v_n FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname = ANY(c_tab) AND (p.polcmd='*' OR 0=ANY(p.polroles));
  PERFORM pg_temp.chk('E2 zero policy FOR ALL / PUBLIC', v_n = 0, v_n::text);

  SELECT count(*) INTO v_n FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname = ANY(c_tab)
     AND (coalesce(pg_get_expr(p.polqual,p.polrelid),'')='true'
       OR coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')='true');
  PERFORM pg_temp.chk('E3 zero USING(true)/CHECK(true)', v_n = 0, v_n::text);

  SELECT count(*) INTO v_n FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname = ANY(c_tab)
     AND coalesce(pg_get_expr(p.polqual,p.polrelid), c_pred) = c_pred
     AND coalesce(pg_get_expr(p.polwithcheck,p.polrelid), c_pred) = c_pred;
  PERFORM pg_temp.chk('E4 predicado literal identico nas 11', v_n = 11, v_n::text);

  SELECT count(*) INTO v_n FROM (
    SELECT c.relname, (aclexplode(c.relacl)).* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname = ANY(c_tab)) x
   WHERE pg_get_userbyid(x.grantee) IN ('authenticated','service_role')
     AND x.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');
  PERFORM pg_temp.chk('E5 ACL sem privilegio perigoso (origem)', v_n = 0, v_n::text);

  SELECT count(*) INTO v_n FROM (
    SELECT c.relname, (aclexplode(c.relacl)).* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname = ANY(c_tab)) x
   WHERE coalesce(pg_get_userbyid(x.grantee),'PUBLIC') IN ('anon','PUBLIC');
  PERFORM pg_temp.chk('E6 ACL sem anon nem PUBLIC (origem)', v_n = 0, v_n::text);

  SELECT count(*) INTO v_n FROM (
    SELECT (aclexplode(p.proacl)).* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='fn_endividamento_mensal') x
   WHERE coalesce(pg_get_userbyid(x.grantee),'PUBLIC') IN ('anon','PUBLIC');
  PERFORM pg_temp.chk('E7 RPC sem EXECUTE para anon/PUBLIC', v_n = 0, v_n::text);

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_endividamento_mensal'
     AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
     AND p.proconfig = ARRAY['search_path=public, pg_temp'];
  PERFORM pg_temp.chk('E8 RPC SECDEF owner postgres search_path fixo', v_n = 1, v_n::text);

  SELECT count(*) INTO v_n FROM pg_roles WHERE rolname='service_role' AND rolbypassrls;
  PERFORM pg_temp.chk('E9 service_role opera por BYPASSRLS (medido)', v_n = 1, v_n::text);
END $$;

-- =====================================================================
-- BLOCO 2 — LEITURA POR ATOR
-- =====================================================================
DO $$
DECLARE
  v_fin int; v_par int; v_des int;
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('usrA','R1 tenant A ve so o proprio',1),
      ('usrB','R2 tenant B ve so o proprio',1),
      ('usrSem','R7 sem membership ve zero',0),
      ('usrInativo','R8 membership inativa ve zero',0),
      ('usrAdmin','R10 admin global ve os dois',2)
    ) AS t(chave, caso, esperado)
  LOOP
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', (SELECT v FROM _ids WHERE k = r.chave))::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_fin FROM public.financiamentos;
    SELECT count(*) INTO v_par FROM public.financiamento_parcelas;
    SELECT count(*) INTO v_des FROM public.financiamento_destinacoes;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.chk(r.caso, v_fin = r.esperado AND v_par = r.esperado AND v_des = r.esperado,
      format('fin=%s par=%s des=%s esperado=%s', v_fin, v_par, v_des, r.esperado));
  END LOOP;

  -- UID nulo
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_fin FROM public.financiamentos;
  SELECT count(*) INTO v_par FROM public.financiamento_parcelas;
  SELECT count(*) INTO v_des FROM public.financiamento_destinacoes;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.chk('R9 auth.uid() nulo ve zero', v_fin=0 AND v_par=0 AND v_des=0,
    format('fin=%s par=%s des=%s', v_fin, v_par, v_des));

  -- service_role opera por bypass
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT count(*) INTO v_fin FROM public.financiamentos;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.chk('R12 service_role enxerga tudo por bypass', v_fin = 2, v_fin::text);
END $$;

-- =====================================================================
-- BLOCO 3 — ESCRITA
-- =====================================================================
DO $$
DECLARE
  v_n int; v_err text; v_state text;
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM _ids WHERE k='usrA'))::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- INSERT intra-tenant
  BEGIN
    INSERT INTO public.financiamentos(cliente_id, fazenda_id, tipo_financiamento, valor_total, data_contrato, status)
    VALUES ((SELECT v FROM _ids WHERE k='cliA'), (SELECT v FROM _ids WHERE k='fazA'),
            'pecuaria', 5, DATE '2031-06-01', 'ativo');
    PERFORM pg_temp.chk('W1 INSERT intra-tenant permitido', true, 'ok');
  EXCEPTION WHEN others THEN
    PERFORM pg_temp.chk('W1 INSERT intra-tenant permitido', false, SQLSTATE || ' ' || SQLERRM);
  END;

  -- INSERT cross-tenant
  BEGIN
    INSERT INTO public.financiamentos(cliente_id, fazenda_id, tipo_financiamento, valor_total, data_contrato, status)
    VALUES ((SELECT v FROM _ids WHERE k='cliB'), (SELECT v FROM _ids WHERE k='fazB'),
            'pecuaria', 5, DATE '2031-06-01', 'ativo');
    PERFORM pg_temp.chk('W2 INSERT cross-tenant recusado', false, 'PASSOU — vazamento');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.chk('W2 INSERT cross-tenant recusado', true, SQLSTATE);
  WHEN others THEN
    PERFORM pg_temp.chk('W2 INSERT cross-tenant recusado', false, SQLSTATE || ' ' || SQLERRM);
  END;

  -- UPDATE intra-tenant
  UPDATE public.financiamentos SET observacao = 'x'
   WHERE id = (SELECT v FROM _ids WHERE k='finA');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.chk('W3 UPDATE intra-tenant afeta 1 linha', v_n = 1, v_n::text);

  -- UPDATE cross-tenant: zero linhas, sem erro
  UPDATE public.financiamentos SET observacao = 'x'
   WHERE id = (SELECT v FROM _ids WHERE k='finB');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.chk('W4 UPDATE cross-tenant afeta 0 linhas', v_n = 0, v_n::text);

  -- UPDATE movendo cliente_id A -> B
  BEGIN
    UPDATE public.financiamentos SET cliente_id = (SELECT v FROM _ids WHERE k='cliB')
     WHERE id = (SELECT v FROM _ids WHERE k='finA');
    PERFORM pg_temp.chk('W5 UPDATE movendo cliente_id recusado', false, 'PASSOU — vazamento');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.chk('W5 UPDATE movendo cliente_id recusado', true, SQLSTATE);
  WHEN others THEN
    PERFORM pg_temp.chk('W5 UPDATE movendo cliente_id recusado', false, SQLSTATE || ' ' || SQLERRM);
  END;

  -- DELETE cross-tenant em parcelas: zero linhas
  DELETE FROM public.financiamento_parcelas WHERE id = (SELECT v FROM _ids WHERE k='parB');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.chk('W6 DELETE cross-tenant afeta 0 linhas', v_n = 0, v_n::text);

  -- DELETE intra-tenant: parcela e depois financiamento (ordem do ADR-2026-05)
  DELETE FROM public.financiamento_parcelas WHERE id = (SELECT v FROM _ids WHERE k='parA');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.chk('W7 DELETE intra-tenant de parcela funciona', v_n = 1, v_n::text);

  EXECUTE 'RESET ROLE';
END $$;

DO $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM _ids WHERE k='usrA'))::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM public.financiamento_destinacoes WHERE financiamento_id = (SELECT v FROM _ids WHERE k='finA');
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.chk('W8 DELETE em destinacoes recusado por ACL', false, 'PASSOU — grant indevido');
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM pg_temp.chk('W8 DELETE em destinacoes recusado por ACL', true, SQLSTATE);
END $$;

DO $$
DECLARE v_n int;
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM _ids WHERE k='usrA'))::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM public.financiamentos WHERE id = (SELECT v FROM _ids WHERE k='finA');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.chk('W9 DELETE intra-tenant de financiamento funciona', v_n = 1, v_n::text);
EXCEPTION WHEN others THEN
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.chk('W9 DELETE intra-tenant de financiamento funciona', false, SQLSTATE || ' ' || SQLERRM);
END $$;

-- TRUNCATE recusado nas tres tabelas
DO $$
DECLARE r record; v_ok boolean;
BEGIN
  FOR r IN SELECT unnest(ARRAY['financiamentos','financiamento_parcelas','financiamento_destinacoes']) AS t
  LOOP
    v_ok := false;
    BEGIN
      EXECUTE 'RESET ROLE';
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub',(SELECT v FROM _ids WHERE k='usrA'))::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      EXECUTE format('TRUNCATE TABLE public.%I', r.t);
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
    WHEN others THEN
      v_ok := false;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.chk('W10 TRUNCATE recusado (42501) em ' || r.t, v_ok, '');
  END LOOP;
END $$;

-- anon nao le
DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM count(*) FROM public.financiamentos;
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := true;
  WHEN others THEN
    v_ok := false;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.chk('W11 anon recusado por ausencia de grant', v_ok, '');
END $$;

-- O bloco de escrita alterou os dados sinteticos. A expectativa do calculo
-- e recomputada AQUI, imediatamente antes da comparacao, com o SQL ORIGINAL.
CREATE TEMP TABLE _esperado_rpc ON COMMIT DROP AS
  WITH
    meses AS (SELECT generate_series(1, 12) AS mes),
    fin AS (
      SELECT id, tipo_financiamento, data_contrato, valor_total, valor_entrada, status
      FROM public.financiamentos
      WHERE cliente_id = (SELECT v FROM _ids WHERE k='cliA')
        AND status <> 'cancelado'
    ),
    parc AS (
      SELECT p.financiamento_id, p.valor_principal, p.valor_juros,
             p.data_pagamento, p.status, f.tipo_financiamento, f.data_contrato
      FROM public.financiamento_parcelas p
      JOIN fin f ON f.id = p.financiamento_id
      WHERE p.cliente_id = (SELECT v FROM _ids WHERE k='cliA')
    ),
    cortes AS (
      SELECT m.mes,
        (date_trunc('month', ('2031-' || lpad(m.mes::text,2,'0') || '-01')::date)
          + interval '1 month - 1 day')::date AS ultimo_dia,
        (date_trunc('month', ('2031-' || lpad(m.mes::text,2,'0') || '-01')::date)
          - interval '1 day')::date AS dia_anterior
      FROM meses m
    ),
    divida_inicial AS (
      SELECT c.mes, p.tipo_financiamento, SUM(p.valor_principal) AS v
      FROM cortes c JOIN parc p
        ON p.data_contrato <= c.dia_anterior
       AND (p.data_pagamento IS NULL OR p.data_pagamento > c.dia_anterior)
      GROUP BY 1,2
    ),
    divida_final AS (
      SELECT c.mes, p.tipo_financiamento, SUM(p.valor_principal) AS v
      FROM cortes c JOIN parc p
        ON p.data_contrato <= c.ultimo_dia
       AND (p.data_pagamento IS NULL OR p.data_pagamento > c.ultimo_dia)
      GROUP BY 1,2
    ),
    captacao AS (
      SELECT EXTRACT(MONTH FROM f.data_contrato)::int AS mes, f.tipo_financiamento,
             SUM(f.valor_total - COALESCE(f.valor_entrada,0)) AS v
      FROM fin f WHERE EXTRACT(YEAR FROM f.data_contrato) = 2031 GROUP BY 1,2
    ),
    amortizacao AS (
      SELECT EXTRACT(MONTH FROM p.data_pagamento)::int AS mes, p.tipo_financiamento,
             SUM(p.valor_principal) AS v
      FROM parc p WHERE p.status='pago' AND EXTRACT(YEAR FROM p.data_pagamento)=2031 GROUP BY 1,2
    ),
    juros AS (
      SELECT EXTRACT(MONTH FROM p.data_pagamento)::int AS mes, p.tipo_financiamento,
             SUM(p.valor_juros) AS v
      FROM parc p WHERE p.status='pago' AND EXTRACT(YEAR FROM p.data_pagamento)=2031 GROUP BY 1,2
    )
  SELECT m.mes,
    COALESCE(di_p.v,0)::numeric AS divida_inicial_pec, COALESCE(c_p.v,0)::numeric AS captacao_pec,
    COALESCE(a_p.v,0)::numeric AS amortizacao_pec,     COALESCE(j_p.v,0)::numeric AS juros_pec,
    COALESCE(df_p.v,0)::numeric AS divida_final_pec,
    COALESCE(di_a.v,0)::numeric AS divida_inicial_agri, COALESCE(c_a.v,0)::numeric AS captacao_agri,
    COALESCE(a_a.v,0)::numeric AS amortizacao_agri,     COALESCE(j_a.v,0)::numeric AS juros_agri,
    COALESCE(df_a.v,0)::numeric AS divida_final_agri
  FROM meses m
  LEFT JOIN divida_inicial di_p ON di_p.mes=m.mes AND di_p.tipo_financiamento='pecuaria'
  LEFT JOIN divida_inicial di_a ON di_a.mes=m.mes AND di_a.tipo_financiamento='agricultura'
  LEFT JOIN captacao c_p ON c_p.mes=m.mes AND c_p.tipo_financiamento='pecuaria'
  LEFT JOIN captacao c_a ON c_a.mes=m.mes AND c_a.tipo_financiamento='agricultura'
  LEFT JOIN amortizacao a_p ON a_p.mes=m.mes AND a_p.tipo_financiamento='pecuaria'
  LEFT JOIN amortizacao a_a ON a_a.mes=m.mes AND a_a.tipo_financiamento='agricultura'
  LEFT JOIN juros j_p ON j_p.mes=m.mes AND j_p.tipo_financiamento='pecuaria'
  LEFT JOIN juros j_a ON j_a.mes=m.mes AND j_a.tipo_financiamento='agricultura'
  LEFT JOIN divida_final df_p ON df_p.mes=m.mes AND df_p.tipo_financiamento='pecuaria'
  LEFT JOIN divida_final df_a ON df_a.mes=m.mes AND df_a.tipo_financiamento='agricultura'
  ORDER BY m.mes;

-- =====================================================================
-- BLOCO 4 — RPC fn_endividamento_mensal
-- =====================================================================
DO $$
DECLARE
  v_n int;
  v_msg text[] := ARRAY[]::text[];
  v_state text[] := ARRAY[]::text[];
  r record;
  v_m text; v_s text;
BEGIN
  -- tenant proprio: funciona e devolve 12 meses
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM _ids WHERE k='usrA'))::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.fn_endividamento_mensal((SELECT v FROM _ids WHERE k='cliA'), 2031);
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.chk('G1 RPC no tenant proprio devolve 12 meses', v_n = 12, v_n::text);

  -- calculo preservado
  -- comparacao feita como postgres: a temp table nao e legivel por authenticated.
  -- A guarda depende de auth.uid(), nao do papel, entao o teste continua valido.
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM _ids WHERE k='usrA'))::text, true);
  SELECT count(*) INTO v_n FROM (
    (SELECT * FROM public.fn_endividamento_mensal((SELECT v FROM _ids WHERE k='cliA'), 2031)
     EXCEPT ALL SELECT * FROM _esperado_rpc)
    UNION ALL
    (SELECT * FROM _esperado_rpc
     EXCEPT ALL SELECT * FROM public.fn_endividamento_mensal((SELECT v FROM _ids WHERE k='cliA'), 2031))
  ) d;
  PERFORM pg_temp.chk('G2 calculo identico ao original (diferenca simetrica = 0)', v_n = 0, v_n::text);

  -- quatro recusas indistinguiveis
  FOR r IN SELECT * FROM (VALUES
      ('usrA','cliB','alheio'),
      ('usrA','inex','inexistente'),
      ('usrSem','cliA','sem membership'),
      ('NULO','cliA','uid nulo')
    ) AS t(usr, alvo, rotulo)
  LOOP
    v_m := NULL; v_s := NULL;
    BEGIN
      EXECUTE 'RESET ROLE';
      IF r.usr = 'NULO' THEN
        PERFORM set_config('request.jwt.claims','',true);
        PERFORM set_config('request.jwt.claim.sub','',true);
      ELSE
        PERFORM set_config('request.jwt.claims',
          json_build_object('sub',(SELECT v FROM _ids WHERE k = r.usr))::text, true);
      END IF;
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM count(*) FROM public.fn_endividamento_mensal((SELECT v FROM _ids WHERE k = r.alvo), 2031);
      v_m := '<<SEM ERRO>>'; v_s := '<<SEM ERRO>>';
    EXCEPTION WHEN others THEN
      v_m := SQLERRM; v_s := SQLSTATE;
    END;
    EXECUTE 'RESET ROLE';
    v_msg := v_msg || v_m; v_state := v_state || v_s;
    PERFORM pg_temp.chk('G3 recusa ' || r.rotulo || ' com P0002', v_s = 'P0002', coalesce(v_s,'-'));
  END LOOP;

  PERFORM pg_temp.chk('G4 as quatro recusas tem mensagem byte-identica',
    (SELECT count(DISTINCT m) FROM unnest(v_msg) m) = 1, array_to_string(v_msg, ' | '));
  PERFORM pg_temp.chk('G5 as quatro recusas tem o mesmo SQLSTATE',
    (SELECT count(DISTINCT s) FROM unnest(v_state) s) = 1, array_to_string(v_state, ' | '));
  PERFORM pg_temp.chk('G6 zero enumeracao: mensagem nao cita tenant',
    v_msg[1] NOT LIKE '%0000%' AND v_msg[1] NOT LIKE '%cliente_id%', v_msg[1]);

  -- admin: autorizado nos dois tenants
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',(SELECT v FROM _ids WHERE k='usrAdmin'))::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.fn_endividamento_mensal((SELECT v FROM _ids WHERE k='cliB'), 2031);
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.chk('G7 admin autorizado em tenant alheio', v_n = 12, v_n::text);

  -- admin com tenant inexistente: mesma recusa
  v_s := NULL;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',(SELECT v FROM _ids WHERE k='usrAdmin'))::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM count(*) FROM public.fn_endividamento_mensal((SELECT v FROM _ids WHERE k='inex'), 2031);
  EXCEPTION WHEN others THEN v_s := SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.chk('G8 admin com tenant inexistente tambem recebe P0002', v_s = 'P0002', coalesce(v_s,'<<sem erro>>'));
END $$;

-- =====================================================================
-- RESULTADO
-- =====================================================================
RESET ROLE;
SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FALHA' END AS status, caso, detalhe
FROM _res ORDER BY n;

SELECT count(*) FILTER (WHERE ok) AS passaram,
       count(*) FILTER (WHERE NOT ok) AS falharam,
       count(*) AS total
FROM _res;

DO $$
DECLARE v_f int;
BEGIN
  SELECT count(*) INTO v_f FROM _res WHERE NOT ok;
  IF v_f > 0 THEN
    RAISE EXCEPTION 'SUITE: % casos falharam', v_f;
  END IF;
  RAISE NOTICE 'SUITE: todos os casos passaram.';
END $$;

ROLLBACK;

-- Prova de zero residuo apos o ROLLBACK
SELECT 'residuo' AS verificacao,
       (SELECT count(*) FROM public.financiamentos) AS financiamentos,
       (SELECT count(*) FROM public.financiamento_parcelas) AS parcelas,
       (SELECT count(*) FROM public.financiamento_destinacoes) AS destinacoes,
       (SELECT count(*) FROM public.clientes WHERE nome LIKE 'SINTETICO-%') AS clientes_sinteticos,
       (SELECT count(*) FROM public.fazendas WHERE nome LIKE 'FAZ-SINT-%') AS fazendas_sinteticas,
       (SELECT count(*) FROM auth.users WHERE id::text LIKE '00000000-0000-4000-8000-%') AS users_sinteticos,
       (SELECT count(*) FROM public.cliente_membros WHERE user_id::text LIKE '00000000-0000-4000-8000-%') AS membros_sinteticos;
