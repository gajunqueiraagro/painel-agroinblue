-- pr_cleanup_quarentena_staging_03_test.sql
-- Suite de homologacao das duas migrations desta frente:
--   20260817120000_pr_cleanup_mesa_classificacao_01_quarentena.sql   (BLOCO 1)
--   20260817130000_pr_sec_rls_tenant_staging_03_isolamento.sql       (BLOCO 2)
--
-- COMO RODAR. Somente em banco LOCAL descartavel, DEPOIS de aplicar as duas migrations.
-- O script inteiro roda em UMA transacao e termina em RAISE EXCEPTION proposital: nada e'
-- persistido, residuo zero por construcao (G15).
--
-- ATORES SINTETICOS (criados aqui, nunca persistidos):
--   admin      -> membership perfil='admin_agroinblue' ativa
--   gestor A   -> membership perfil='gestor_cliente' ativa no tenant A
--   campo A    -> membership perfil='campo' ativa no tenant A
--   inativo A  -> membership no tenant A com ativo=false
--   sem_memb   -> nenhuma membership
-- A impersonacao usa SET LOCAL ROLE authenticated + request.jwt.claims, que e' como o
-- PostgREST executa de verdade.

\set ON_ERROR_STOP on

BEGIN;

DO $suite$
BEGIN
  RAISE NOTICE '=== SUITE PR-CLEANUP-MESA-CLASSIFICACAO-01 + PR-SEC-RLS-TENANT-STAGING-03 ===';
END $suite$;

-- Assercoes em blocos independentes para que cada gate reporte sozinho.
-- Estado compartilhado vive em tabelas TEMP (descartadas no ROLLBACK).

CREATE TEMP TABLE _res(gate text primary key, passou boolean, detalhe text) ON COMMIT DROP;
CREATE TEMP TABLE _ctx(k text primary key, v text) ON COMMIT DROP;

-- Os gates impersonam authenticated via SET LOCAL ROLE; sem isto o proprio arnes de
-- teste levaria "permission denied" nas tabelas TEMP, mascarando o resultado dos gates.
GRANT SELECT, INSERT, UPDATE ON _res TO authenticated;
GRANT SELECT                 ON _ctx TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.reg(p_gate text, p_cond boolean, p_det text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO _res(gate, passou, detalhe) VALUES (p_gate, p_cond, p_det)
  ON CONFLICT (gate) DO UPDATE SET passou = excluded.passou, detalhe = excluded.detalhe;
  RAISE NOTICE '[%] % %', CASE WHEN p_cond THEN 'PASS' ELSE 'FALHA' END, p_gate, p_det;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql AS
$$ SELECT v FROM _ctx WHERE k = p_k $$;

CREATE OR REPLACE FUNCTION pg_temp.jwt(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
END $$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G0 — ESTADO ANTERIOR DOCUMENTADO (o que existia antes desta frente)
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g0$
DECLARE v_txt text;
BEGIN
  -- Registro historico. Nao e' assercao sobre o estado atual: e' a fotografia do que
  -- a frente encontrou em 2026-08-08 no proto, para o auditor comparar.
  RAISE NOTICE '--- G0 ESTADO ANTERIOR (proto, 2026-08-08, antes das duas migrations) ---';
  RAISE NOTICE 'G0.1 policy unica: financeiro_classificacao_staging_all | ALL | PUBLIC | USING(true) | WITH CHECK(true)';
  RAISE NOTICE 'G0.2 authenticated com 8 privilegios: SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN';
  RAISE NOTICE 'G0.3 nenhuma ACL de coluna (attacl NULL nas 35 colunas)';
  RAISE NOTICE 'G0.4 anon sem qualquer privilegio na staging';
  RAISE NOTICE 'G0.5 volumetria: 37.390 linhas, 141 sessoes, 3 clientes, 0 cliente_id NULL, 0 orfas';
  RAISE NOTICE 'G0.6 4 SECDEF sem guarda: apply, candidatos_ambiguo, candidatos_grupo, candidatos_proximos';
  RAISE NOTICE 'G0.7 fn_classificacao_apply com EXECUTE para postgres, authenticated e service_role';
  RAISE NOTICE 'G0.8 md5(prosrc): apply=b16bf7bc40b6b8ec2c1672889045346f | proximos=79235f4f935335276a1814b17115b4db | grupo=0c40e51d3b3461d1394cc66779169d8e | ambiguo=23c8ce20716b5820369888c6a1f23352';
  RAISE NOTICE 'G0.9 TRUNCATE concedido a authenticated e NAO filtrado por RLS — bloqueador P0 desta frente';

  -- unica assercao de G0: o estado anterior NAO pode mais estar presente
  SELECT string_agg(p, ',' ORDER BY p) INTO v_txt
    FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   WHERE has_table_privilege('authenticated','public.financeiro_classificacao_staging',p);
  PERFORM pg_temp.reg('G0', v_txt IS NULL,
    coalesce('estado anterior ainda presente: '||v_txt, 'estado anterior superado'));
END $g0$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- FIXTURE — dois tenants, cinco atores
-- ══════════════════════════════════════════════════════════════════════════════════
DO $fx$
DECLARE
  v_A uuid := gen_random_uuid(); v_B uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid(); v_gestor uuid := gen_random_uuid();
  v_campo uuid := gen_random_uuid(); v_inativo uuid := gen_random_uuid();
  v_semmemb uuid := gen_random_uuid();
  v_sA uuid := gen_random_uuid(); v_sB uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.clientes(id, nome, slug, ativo) VALUES
    (v_A, 'ZZ Teste Tenant A', 'zz-teste-tenant-a', true),
    (v_B, 'ZZ Teste Tenant B', 'zz-teste-tenant-b', true);

  INSERT INTO auth.users(id, email) VALUES
    (v_admin,  'zz-admin@teste.invalid'),
    (v_gestor, 'zz-gestor@teste.invalid'),
    (v_campo,  'zz-campo@teste.invalid'),
    (v_inativo,'zz-inativo@teste.invalid'),
    (v_semmemb,'zz-semmemb@teste.invalid');

  INSERT INTO public.cliente_membros(id, user_id, cliente_id, perfil, ativo) VALUES
    (gen_random_uuid(), v_admin,  v_A, 'admin_agroinblue', true),
    (gen_random_uuid(), v_gestor, v_A, 'gestor_cliente',   true),
    (gen_random_uuid(), v_campo,  v_A, 'campo',            true),
    (gen_random_uuid(), v_inativo,v_A, 'gestor_cliente',   false);

  INSERT INTO public.financeiro_classificacao_staging
    (staging_id, sessao_id, cliente_id, excel_linha_origem, excel_data, excel_valor,
     excel_tipo_operacao, excel_ano_mes, match_status, aplicado)
  VALUES
    (gen_random_uuid(), v_sA, v_A, 1, DATE '2026-06-10', 100.00, '2-Saídas', '2026-06', 'ambiguo', false),
    (gen_random_uuid(), v_sB, v_B, 1, DATE '2026-06-10', 100.00, '2-Saídas', '2026-06', 'ambiguo', false);

  INSERT INTO _ctx(k,v) VALUES
    ('A', v_A::text), ('B', v_B::text),
    ('admin', v_admin::text), ('gestor', v_gestor::text), ('campo', v_campo::text),
    ('inativo', v_inativo::text), ('semmemb', v_semmemb::text),
    ('sA', v_sA::text), ('sB', v_sB::text),
    ('stgA', (SELECT staging_id::text FROM public.financeiro_classificacao_staging WHERE sessao_id=v_sA)),
    ('stgB', (SELECT staging_id::text FROM public.financeiro_classificacao_staging WHERE sessao_id=v_sB)),
    ('linhas_pre', (SELECT count(*)::text FROM public.financeiro_classificacao_staging));

  RAISE NOTICE 'fixture criada: tenants A/B, 5 atores, 2 linhas de staging';
END $fx$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G1 — ACL NOMINAL DE TABELA via pg_class.relacl + aclexplode
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g1$
DECLARE v_auth text; v_pub int; v_anon int;
BEGIN
  SELECT string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type)
    INTO v_auth
    FROM pg_class c, aclexplode(c.relacl) a
   WHERE c.oid='public.financeiro_classificacao_staging'::regclass
     AND a.grantee = 'authenticated'::regrole::oid;

  SELECT count(*) INTO v_pub
    FROM pg_class c, aclexplode(c.relacl) a
   WHERE c.oid='public.financeiro_classificacao_staging'::regclass AND a.grantee = 0;

  SELECT count(*) INTO v_anon
    FROM pg_class c, aclexplode(c.relacl) a
   WHERE c.oid='public.financeiro_classificacao_staging'::regclass
     AND a.grantee = 'anon'::regrole::oid;

  PERFORM pg_temp.reg('G1.1 authenticated = SELECT nominal', v_auth = 'SELECT', coalesce(v_auth,'(nada)'));
  PERFORM pg_temp.reg('G1.2 PUBLIC(0) = zero', v_pub = 0, v_pub::text);
  PERFORM pg_temp.reg('G1.3 anon = zero',      v_anon = 0, v_anon::text);
END $g1$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G2 — ACL NOMINAL DE COLUNA via pg_attribute.attacl (35 colunas)
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g2$
DECLARE v_com int; v_upd int;
BEGIN
  SELECT count(*) INTO v_com
    FROM pg_attribute a
   WHERE a.attrelid='public.financeiro_classificacao_staging'::regclass
     AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL;
  PERFORM pg_temp.reg('G2.1 nenhuma ACL de coluna (desenho reduzido nao usa grant por coluna)',
                      v_com = 0, v_com::text||' coluna(s) com attacl');

  SELECT count(*) INTO v_upd
    FROM pg_attribute a
   WHERE a.attrelid='public.financeiro_classificacao_staging'::regclass
     AND a.attnum>0 AND NOT a.attisdropped
     AND has_column_privilege('authenticated','public.financeiro_classificacao_staging',a.attname,'UPDATE');
  PERFORM pg_temp.reg('G2.2 authenticated sem UPDATE em NENHUMA das 35 colunas',
                      v_upd = 0, v_upd::text||' coluna(s) atualizaveis');
END $g2$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G3 — postgres e service_role sem delta
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g3$
DECLARE v_pg text; v_sr text; v_esp text := 'DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE';
BEGIN
  SELECT string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type) INTO v_pg
    FROM pg_class c, aclexplode(c.relacl) a
   WHERE c.oid='public.financeiro_classificacao_staging'::regclass AND a.grantee='postgres'::regrole::oid;
  SELECT string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type) INTO v_sr
    FROM pg_class c, aclexplode(c.relacl) a
   WHERE c.oid='public.financeiro_classificacao_staging'::regclass AND a.grantee='service_role'::regrole::oid;
  PERFORM pg_temp.reg('G3.1 postgres inalterado',     v_pg = v_esp, coalesce(v_pg,'(nada)'));
  PERFORM pg_temp.reg('G3.2 service_role inalterado', v_sr = v_esp, coalesce(v_sr,'(nada)'));
END $g3$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G4 — policies: exatamente 1, SELECT, PERMISSIVE, TO authenticated
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g4$
DECLARE v_n int; v_cmd "char"; v_perm boolean; v_pub boolean;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid='public.financeiro_classificacao_staging'::regclass;
  PERFORM pg_temp.reg('G4.1 exatamente 1 policy', v_n = 1, v_n::text);

  SELECT polcmd, polpermissive, (polroles='{0}'::oid[]) INTO v_cmd, v_perm, v_pub
    FROM pg_policy WHERE polrelid='public.financeiro_classificacao_staging'::regclass
      AND polname='financeiro_classificacao_staging_select_tenant';
  PERFORM pg_temp.reg('G4.2 e SELECT',              v_cmd = 'r',  coalesce(v_cmd::text,'(ausente)'));
  PERFORM pg_temp.reg('G4.3 e PERMISSIVE',          v_perm,       coalesce(v_perm::text,'?'));
  PERFORM pg_temp.reg('G4.4 nao aponta para PUBLIC', NOT v_pub,   coalesce(v_pub::text,'?'));
  PERFORM pg_temp.reg('G4.5 policy _all removida',
    NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.financeiro_classificacao_staging'::regclass
                 AND polname='financeiro_classificacao_staging_all'));
END $g4$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G5..G8 — LEITURA por ator
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g5$
DECLARE v_A uuid := pg_temp.ctx('A')::uuid; v_B uuid := pg_temp.ctx('B')::uuid;
        v_pA bigint; v_pB bigint;
BEGIN
  SET LOCAL ROLE authenticated;

  PERFORM pg_temp.jwt(pg_temp.ctx('gestor')::uuid);
  SELECT count(*) FILTER (WHERE cliente_id=v_A), count(*) FILTER (WHERE cliente_id=v_B)
    INTO v_pA, v_pB FROM public.financeiro_classificacao_staging;
  PERFORM pg_temp.reg('G5 gestor A le as proprias e nenhuma de B', v_pA >= 1 AND v_pB = 0,
                      format('proprias=%s alheias=%s', v_pA, v_pB));

  PERFORM pg_temp.jwt(pg_temp.ctx('campo')::uuid);
  SELECT count(*) FILTER (WHERE cliente_id=v_A), count(*) FILTER (WHERE cliente_id=v_B)
    INTO v_pA, v_pB FROM public.financeiro_classificacao_staging;
  PERFORM pg_temp.reg('G6 campo A identico a gestor A (sem distincao de perfil)',
                      v_pA >= 1 AND v_pB = 0, format('proprias=%s alheias=%s', v_pA, v_pB));

  PERFORM pg_temp.jwt(pg_temp.ctx('inativo')::uuid);
  SELECT count(*) INTO v_pA FROM public.financeiro_classificacao_staging;
  PERFORM pg_temp.reg('G7.1 membro inativo nao le nada', v_pA = 0, v_pA::text);

  PERFORM pg_temp.jwt(pg_temp.ctx('semmemb')::uuid);
  SELECT count(*) INTO v_pA FROM public.financeiro_classificacao_staging;
  PERFORM pg_temp.reg('G7.2 sem membership nao le nada', v_pA = 0, v_pA::text);

  PERFORM pg_temp.jwt(pg_temp.ctx('admin')::uuid);
  SELECT count(*) FILTER (WHERE cliente_id=v_A), count(*) FILTER (WHERE cliente_id=v_B)
    INTO v_pA, v_pB FROM public.financeiro_classificacao_staging;
  PERFORM pg_temp.reg('G8 admin le A e B', v_pA >= 1 AND v_pB >= 1,
                      format('A=%s B=%s', v_pA, v_pB));

  RESET ROLE;
END $g5$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G9 — TRUNCATE / INSERT / DELETE / UPDATE diretos negados (quarentena)
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g9$
DECLARE v_s text; v_m text; v_A uuid := pg_temp.ctx('A')::uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.jwt(pg_temp.ctx('gestor')::uuid);

  BEGIN
    TRUNCATE public.financeiro_classificacao_staging;
    PERFORM pg_temp.reg('G9.1 TRUNCATE negado', false, 'TRUNCOU — FALHA GRAVE');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.reg('G9.1 TRUNCATE negado', true, 'SQLSTATE 42501');
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_s = RETURNED_SQLSTATE;
    PERFORM pg_temp.reg('G9.1 TRUNCATE negado', false, 'SQLSTATE inesperado '||v_s);
  END;

  BEGIN
    INSERT INTO public.financeiro_classificacao_staging
      (sessao_id, cliente_id, excel_linha_origem, match_status)
    VALUES (gen_random_uuid(), v_A, 999, 'ambiguo');
    PERFORM pg_temp.reg('G9.2 INSERT proprio negado', false, 'INSERIU — FALHA');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.reg('G9.2 INSERT proprio negado', true, 'SQLSTATE 42501');
  END;

  BEGIN
    UPDATE public.financeiro_classificacao_staging SET aplicado = true
     WHERE staging_id = pg_temp.ctx('stgA')::uuid;
    PERFORM pg_temp.reg('G9.3 UPDATE direto proprio negado (payload real da tela legada)',
                        false, 'ATUALIZOU — FALHA');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.reg('G9.3 UPDATE direto proprio negado (payload real da tela legada)',
                        true, 'SQLSTATE 42501');
  END;

  BEGIN
    DELETE FROM public.financeiro_classificacao_staging WHERE staging_id = pg_temp.ctx('stgA')::uuid;
    PERFORM pg_temp.reg('G9.4 DELETE proprio negado', false, 'APAGOU — FALHA');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.reg('G9.4 DELETE proprio negado', true, 'SQLSTATE 42501');
  END;

  RESET ROLE;
END $g9$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G10 — ANTI-ORACULO nas candidatas: alheio == inexistente, byte a byte
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g10$
DECLARE
  v_inexist uuid := '00000000-0000-0000-0000-000000000000';
  v_alheio  uuid := pg_temp.ctx('stgB')::uuid;
  a_txt text; b_txt text; a_st text; b_st text; a_msg text; b_msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.jwt(pg_temp.ctx('gestor')::uuid);   -- gestor de A perguntando por linha de B

  -- candidatos_proximos
  a_st := ''; b_st := ''; a_msg := ''; b_msg := '';
  BEGIN SELECT coalesce(string_agg(t::text,'|' ORDER BY t::text),'<vazio>') INTO a_txt
          FROM public.fn_classificacao_candidatos_proximos(v_inexist) t;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS a_st=RETURNED_SQLSTATE, a_msg=MESSAGE_TEXT; a_txt:='<excecao>'; END;
  BEGIN SELECT coalesce(string_agg(t::text,'|' ORDER BY t::text),'<vazio>') INTO b_txt
          FROM public.fn_classificacao_candidatos_proximos(v_alheio) t;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS b_st=RETURNED_SQLSTATE, b_msg=MESSAGE_TEXT; b_txt:='<excecao>'; END;
  PERFORM pg_temp.reg('G10.1 proximos: inexistente == alheio',
    a_txt = b_txt AND a_st = b_st AND a_msg = b_msg AND a_txt = '<vazio>' AND a_st = '',
    format('inex=%s/%s alheio=%s/%s', a_txt, coalesce(nullif(a_st,''),'sem SQLSTATE'), b_txt, coalesce(nullif(b_st,''),'sem SQLSTATE')));

  -- candidatos_grupo
  a_st := ''; b_st := ''; a_msg := ''; b_msg := '';
  BEGIN SELECT coalesce(string_agg(t::text,'|' ORDER BY t::text),'<vazio>') INTO a_txt
          FROM public.fn_classificacao_candidatos_grupo(v_inexist) t;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS a_st=RETURNED_SQLSTATE, a_msg=MESSAGE_TEXT; a_txt:='<excecao>'; END;
  BEGIN SELECT coalesce(string_agg(t::text,'|' ORDER BY t::text),'<vazio>') INTO b_txt
          FROM public.fn_classificacao_candidatos_grupo(v_alheio) t;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS b_st=RETURNED_SQLSTATE, b_msg=MESSAGE_TEXT; b_txt:='<excecao>'; END;
  PERFORM pg_temp.reg('G10.2 grupo: inexistente == alheio',
    a_txt = b_txt AND a_st = b_st AND a_msg = b_msg AND a_txt = '<vazio>' AND a_st = '',
    format('inex=%s alheio=%s', a_txt, b_txt));

  RESET ROLE;
END $g10$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G11 — ANTI-ORACULO no apply + erro_apply intocado em linha alheia
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g11$
DECLARE
  v_inexist uuid := gen_random_uuid();
  v_sB uuid := pg_temp.ctx('sB')::uuid;
  a_j jsonb; b_j jsonb; a_st text := ''; b_st text := ''; a_msg text := ''; b_msg text := '';
  v_err_antes text; v_err_depois text;
BEGIN
  SELECT erro_apply INTO v_err_antes FROM public.financeiro_classificacao_staging
   WHERE staging_id = pg_temp.ctx('stgB')::uuid;

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.jwt(pg_temp.ctx('gestor')::uuid);

  BEGIN a_j := public.fn_classificacao_apply(v_inexist);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS a_st=RETURNED_SQLSTATE, a_msg=MESSAGE_TEXT; END;
  BEGIN b_j := public.fn_classificacao_apply(v_sB);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS b_st=RETURNED_SQLSTATE, b_msg=MESSAGE_TEXT; END;

  RESET ROLE;

  PERFORM pg_temp.reg('G11.1 apply: sem excecao nos dois caminhos',
    a_st = '' AND b_st = '', format('inex=%s alheio=%s', coalesce(nullif(a_st,''),'ok'), coalesce(nullif(b_st,''),'ok')));

  PERFORM pg_temp.reg('G11.2 apply: contadores zerados e iguais',
    (a_j - 'sessao_id') = (b_j - 'sessao_id')
    AND (a_j->>'aplicados')::int = 0
    AND (a_j->>'pulados_subcentro_preenchido')::int = 0
    AND (a_j->>'erros')::int = 0,
    format('inex=%s alheio=%s', a_j::text, b_j::text));

  PERFORM pg_temp.reg('G11.3 apply: chave sessao_id preservada e ecoa o argumento',
    a_j ? 'sessao_id' AND (a_j->>'sessao_id')::uuid = v_inexist
    AND b_j ? 'sessao_id' AND (b_j->>'sessao_id')::uuid = v_sB);

  SELECT erro_apply INTO v_err_depois FROM public.financeiro_classificacao_staging
   WHERE staging_id = pg_temp.ctx('stgB')::uuid;
  PERFORM pg_temp.reg('G11.4 erro_apply de linha alheia NAO foi escrito',
    v_err_depois IS NOT DISTINCT FROM v_err_antes,
    format('antes=%s depois=%s', coalesce(v_err_antes,'NULL'), coalesce(v_err_depois,'NULL')));
END $g11$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G12 — candidatos_ambiguo: REVOKE em vez de guarda
-- Justificativa provada em FASE 0:
--   front  -> unico chamador era useClassificacaoCandidatos.ts:39, consumido apenas por
--             MesaClassificacaoCandidatosDrawer.tsx, exclusivo da tela legada.
--   banco  -> unico chamador interno e' fn_classificacao_resolver_ambiguo, que ja tem
--             guarda propria de tenant e cujo EXECUTE e' somente de postgres.
-- Como o chamador interno e' SECDEF owner=postgres, o EXECUTE e' avaliado contra postgres
-- e NAO contra authenticated: revogar de authenticated fecha o acesso direto sem quebrar
-- o caminho interno. Por isso ACL basta e nova guarda seria codigo morto.
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g12$
DECLARE v_s text := '';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.jwt(pg_temp.ctx('gestor')::uuid);
  BEGIN
    PERFORM * FROM public.fn_classificacao_candidatos_ambiguo(pg_temp.ctx('stgA')::uuid);
    PERFORM pg_temp.reg('G12.1 chamada direta por authenticated negada', false, 'EXECUTOU — FALHA');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.reg('G12.1 chamada direta por authenticated negada', true, 'SQLSTATE 42501');
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_s = RETURNED_SQLSTATE;
    PERFORM pg_temp.reg('G12.1 chamada direta por authenticated negada', false, 'SQLSTATE '||v_s);
  END;
  RESET ROLE;

  PERFORM pg_temp.reg('G12.2 ACL: authenticated sem EXECUTE',
    NOT has_function_privilege('authenticated','public.fn_classificacao_candidatos_ambiguo(uuid)','EXECUTE'));
  PERFORM pg_temp.reg('G12.3 ACL: postgres mantem EXECUTE (caminho interno vivo)',
    has_function_privilege('postgres','public.fn_classificacao_candidatos_ambiguo(uuid)','EXECUTE'));
  PERFORM pg_temp.reg('G12.4 corpo de candidatos_ambiguo inalterado',
    (SELECT md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='fn_classificacao_candidatos_ambiguo')
    = '23c8ce20716b5820369888c6a1f23352');
END $g12$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G13 — resolver_ambiguo (chamador interno) segue funcionando para o dono
-- Roda como postgres: e' o unico papel com EXECUTE nesta funcao, entao esta e' a
-- condicao real de uso. O JWT continua sendo o do dono, que e' o que a guarda le.
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g13$
DECLARE v_s text := ''; v_m text := '';
BEGIN
  PERFORM pg_temp.jwt(pg_temp.ctx('gestor')::uuid);
  BEGIN
    PERFORM public.fn_classificacao_resolver_ambiguo(pg_temp.ctx('stgA')::uuid, NULL::uuid);
    PERFORM pg_temp.reg('G13.1 resolver_ambiguo executa para o dono (sem 42501)', true, 'sem excecao');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.reg('G13.1 resolver_ambiguo executa para o dono (sem 42501)', false,
                        '42501 — o REVOKE quebrou o caminho interno');
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_s=RETURNED_SQLSTATE, v_m=MESSAGE_TEXT;
    -- excecao de regra de negocio e' aceitavel; 42501 nao e'.
    PERFORM pg_temp.reg('G13.1 resolver_ambiguo executa para o dono (sem 42501)',
                        v_s <> '42501', format('SQLSTATE %s: %s', v_s, left(v_m,80)));
  END;
END $g13$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G14 — as 3 SECDEF: search_path, SECDEF, owner, ACL e contrato de saida
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g14$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('fn_classificacao_apply','fn_classificacao_candidatos_proximos','fn_classificacao_candidatos_grupo')
     AND coalesce(array_to_string(p.proconfig,','),'') = 'search_path=pg_catalog, public'
     AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres';
  PERFORM pg_temp.reg('G14.1 3 funcoes: search_path fixo + SECDEF + owner postgres', v_n = 3, v_n::text||'/3');

  PERFORM pg_temp.reg('G14.2 service_role SEM EXECUTE em apply',
    NOT has_function_privilege('service_role','public.fn_classificacao_apply(uuid)','EXECUTE'));
  PERFORM pg_temp.reg('G14.3 authenticated COM EXECUTE nas 3',
    has_function_privilege('authenticated','public.fn_classificacao_apply(uuid)','EXECUTE')
    AND has_function_privilege('authenticated','public.fn_classificacao_candidatos_proximos(uuid)','EXECUTE')
    AND has_function_privilege('authenticated','public.fn_classificacao_candidatos_grupo(uuid)','EXECUTE'));
  PERFORM pg_temp.reg('G14.4 anon e PUBLIC sem EXECUTE nas 3',
    NOT has_function_privilege('anon','public.fn_classificacao_apply(uuid)','EXECUTE')
    AND NOT has_function_privilege('anon','public.fn_classificacao_candidatos_proximos(uuid)','EXECUTE')
    AND NOT has_function_privilege('anon','public.fn_classificacao_candidatos_grupo(uuid)','EXECUTE'));

  -- contrato de saida: 15 colunas nas candidatas, jsonb no apply
  PERFORM pg_temp.reg('G14.5 contrato: proximos e grupo com 15 colunas de retorno',
    (SELECT count(*) FROM unnest((SELECT proargnames FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='fn_classificacao_candidatos_proximos'))) = 16   -- 1 IN + 15 OUT
    AND (SELECT count(*) FROM unnest((SELECT proargnames FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='fn_classificacao_candidatos_grupo'))) = 16);
  PERFORM pg_temp.reg('G14.6 contrato: apply retorna jsonb',
    (SELECT pg_get_function_result(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='fn_classificacao_apply') = 'jsonb');
END $g14$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G15 — view do Enriquecimento intacta + leitura tenant-safe pela view
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g15$
DECLARE v_opts text; v_pB bigint;
BEGIN
  SELECT coalesce(c.reloptions::text,'') INTO v_opts FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='vw_classificacao_staging_preview';
  PERFORM pg_temp.reg('G15.1 view com security_invoker=on', v_opts ~ 'security_invoker=(on|true)', v_opts);
  PERFORM pg_temp.reg('G15.2 view: anon sem SELECT, authenticated com SELECT',
    NOT has_table_privilege('anon','public.vw_classificacao_staging_preview','SELECT')
    AND has_table_privilege('authenticated','public.vw_classificacao_staging_preview','SELECT'));

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.jwt(pg_temp.ctx('gestor')::uuid);
  SELECT count(*) INTO v_pB FROM public.vw_classificacao_staging_preview
   WHERE sessao_id = pg_temp.ctx('sB')::uuid;
  RESET ROLE;
  PERFORM pg_temp.reg('G15.3 Mesa/Enriquecer: sessao de B invisivel para gestor de A pela view',
                      v_pB = 0, v_pB::text);
END $g15$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- G16 — o Enriquecer continua escrevendo: RPC SECDEF autorizada funciona
-- ══════════════════════════════════════════════════════════════════════════════════
DO $g16$
DECLARE v_s text := ''; v_m text := ''; v_j jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.jwt(pg_temp.ctx('gestor')::uuid);
  BEGIN
    v_j := public.fn_classificacao_apply(pg_temp.ctx('sA')::uuid);
    PERFORM pg_temp.reg('G16.1 apply na sessao PROPRIA executa sem 42501', true, v_j::text);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_s=RETURNED_SQLSTATE, v_m=MESSAGE_TEXT;
    PERFORM pg_temp.reg('G16.1 apply na sessao PROPRIA executa sem 42501', v_s <> '42501',
                        format('SQLSTATE %s: %s', v_s, left(v_m,80)));
  END;
  RESET ROLE;
END $g16$;


-- ══════════════════════════════════════════════════════════════════════════════════
-- RESULTADO
-- ══════════════════════════════════════════════════════════════════════════════════
DO $fim$
DECLARE v_tot int; v_ok int; v_bad text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE passou) INTO v_tot, v_ok FROM _res;
  SELECT string_agg(gate||' ('||detalhe||')', E'\n  ' ORDER BY gate) INTO v_bad FROM _res WHERE NOT passou;
  RAISE NOTICE '';
  RAISE NOTICE '════════ RESULTADO: %/% gates ════════', v_ok, v_tot;
  IF v_bad IS NOT NULL THEN RAISE NOTICE 'FALHARAM:%s', E'\n  '||v_bad; END IF;
  IF v_ok <> v_tot THEN
    RAISE EXCEPTION 'SUITE VERMELHA: %/% gates', v_ok, v_tot;
  END IF;
  RAISE EXCEPTION 'SUITE VERDE (%/%). Rollback proposital — residuo zero.', v_ok, v_tot;
END $fim$;

ROLLBACK;
