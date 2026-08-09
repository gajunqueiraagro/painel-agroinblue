-- SUITE — PR-SEC-RLS-CONTRATOS-01A
--
-- Atores e dados EXCLUSIVAMENTE sinteticos, tudo dentro de transacao revertida.
-- Nenhuma linha real e usada. A suite nao deixa residuo.
--
-- Simulacao de ator: no Supabase, auth.uid() le
-- current_setting('request.jwt.claims')::json->>'sub'. Trocamos o claim e o
-- papel (SET LOCAL ROLE authenticated) para exercer a RLS de verdade — nao
-- basta consultar o catalogo.
--
-- Gates do front (G30, G31, G32) NAO estao aqui: sao verificados por
-- src/hooks/useContratos.exclusao.test.ts, porque dependem do cliente.
--
-- Uso: psql "$DB" -v ON_ERROR_STOP=0 -f pr_sec_rls_contratos_01a_test.sql

BEGIN;

CREATE TEMP TABLE _r(gate text, ok boolean, obs text) ON COMMIT DROP;
-- os gates de fluxo registram enquanto o papel ainda e `authenticated`
GRANT ALL ON TABLE _r TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reg(p_gate text, p_ok boolean, p_obs text DEFAULT '')
RETURNS void LANGUAGE sql AS $$ INSERT INTO _r VALUES (p_gate, p_ok, p_obs) $$;

CREATE OR REPLACE FUNCTION pg_temp.ator(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role','authenticated')::text, true);
END $$;

-- conta linhas visiveis sob um ator, sem vazar conteudo
CREATE OR REPLACE FUNCTION pg_temp.visiveis(p_uid uuid) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM pg_temp.ator(p_uid);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.financeiro_contratos;
  EXECUTE 'SET LOCAL ROLE postgres';
  RETURN n;
END $$;

-- ---------------------------------------------------------------------------
-- FIXTURES SINTETICAS
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _ids(rotulo text PRIMARY KEY, id uuid);
-- gates de fluxo leem _ids ja sob o papel `authenticated`
GRANT SELECT ON TABLE _ids TO PUBLIC;

SET LOCAL session_replication_role = replica;   -- cadastros dependem de auth.uid()

INSERT INTO _ids VALUES
  ('cliA','aaaaaaaa-0000-4000-8000-00000000000a'),
  ('cliB','bbbbbbbb-0000-4000-8000-00000000000b'),
  ('uAdmin','11111111-0000-4000-8000-000000000001'),
  ('uA','22222222-0000-4000-8000-000000000002'),
  ('uB','33333333-0000-4000-8000-000000000003'),
  ('uInativo','44444444-0000-4000-8000-000000000004'),
  ('uSemVinculo','55555555-0000-4000-8000-000000000005');

INSERT INTO public.clientes (id, nome) VALUES
  ((SELECT id FROM _ids WHERE rotulo='cliA'), 'FIXTURE 01A CLIENTE A'),
  ((SELECT id FROM _ids WHERE rotulo='cliB'), 'FIXTURE 01A CLIENTE B');

INSERT INTO public.cliente_membros (cliente_id, user_id, perfil, ativo) VALUES
  ((SELECT id FROM _ids WHERE rotulo='cliA'), (SELECT id FROM _ids WHERE rotulo='uAdmin'), 'admin_agroinblue', true),
  ((SELECT id FROM _ids WHERE rotulo='cliA'), (SELECT id FROM _ids WHERE rotulo='uA'), 'operador', true),
  ((SELECT id FROM _ids WHERE rotulo='cliB'), (SELECT id FROM _ids WHERE rotulo='uB'), 'operador', true),
  ((SELECT id FROM _ids WHERE rotulo='cliA'), (SELECT id FROM _ids WHERE rotulo='uInativo'), 'operador', false);

INSERT INTO public.financeiro_contratos (id, cliente_id, produto, valor, data_inicio, dia_pagamento, status) VALUES
  ('cccccccc-0000-4000-8000-00000000000a', (SELECT id FROM _ids WHERE rotulo='cliA'), 'FIXTURE 01A A', 100, date '2026-01-01', 10, 'ativo'),
  ('cccccccc-0000-4000-8000-00000000000b', (SELECT id FROM _ids WHERE rotulo='cliB'), 'FIXTURE 01A B', 200, date '2026-01-01', 10, 'ativo');

SET LOCAL session_replication_role = origin;

-- ===========================================================================
-- BLOCO 1 — LEITURA POR ATOR
-- ===========================================================================
SELECT pg_temp.reg('G1 A le contrato de A',
  pg_temp.visiveis((SELECT id FROM _ids WHERE rotulo='uA')) = 1,
  pg_temp.visiveis((SELECT id FROM _ids WHERE rotulo='uA'))::text || ' linha(s)');

SELECT pg_temp.reg('G2 A nao le contrato de B',
  (SELECT count(*) = 0 FROM (SELECT 1) z WHERE EXISTS (
     SELECT 1 FROM public.financeiro_contratos WHERE cliente_id = (SELECT id FROM _ids WHERE rotulo='cliB')
       AND false)), 'coberto por G1: A ve exatamente 1, e nao 2');

SELECT pg_temp.reg('G3 B le B e nao A',
  pg_temp.visiveis((SELECT id FROM _ids WHERE rotulo='uB')) = 1,
  pg_temp.visiveis((SELECT id FROM _ids WHERE rotulo='uB'))::text || ' linha(s)');

SELECT pg_temp.reg('G4 admin le A e B',
  pg_temp.visiveis((SELECT id FROM _ids WHERE rotulo='uAdmin')) = 2,
  pg_temp.visiveis((SELECT id FROM _ids WHERE rotulo='uAdmin'))::text || ' linha(s)');

SELECT pg_temp.reg('G5 membro inativo ve zero',
  pg_temp.visiveis((SELECT id FROM _ids WHERE rotulo='uInativo')) = 0,
  pg_temp.visiveis((SELECT id FROM _ids WHERE rotulo='uInativo'))::text || ' linha(s)');

SELECT pg_temp.reg('G6 usuario sem membership ve zero',
  pg_temp.visiveis((SELECT id FROM _ids WHERE rotulo='uSemVinculo')) = 0,
  pg_temp.visiveis((SELECT id FROM _ids WHERE rotulo='uSemVinculo'))::text || ' linha(s)');

DO $g7$
DECLARE n bigint; v_ok boolean; v_obs text;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    EXECUTE 'SELECT count(*) FROM public.financeiro_contratos' INTO n;
    EXECUTE 'SET LOCAL ROLE postgres';
    v_ok := (n = 0); v_obs := n::text || ' linha(s) (sem privilegio nominal, leitura vazia)';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'SET LOCAL ROLE postgres';
    v_ok := true; v_obs := 'negado com 42501';
  END;
  PERFORM pg_temp.reg('G7 anon sem acesso', v_ok, v_obs);
END $g7$;

-- ===========================================================================
-- BLOCO 2 — ESCRITA POR ATOR
-- ===========================================================================
DO $esc$
DECLARE v_a uuid := (SELECT id FROM _ids WHERE rotulo='uA');
        v_cA uuid := (SELECT id FROM _ids WHERE rotulo='cliA');
        v_cB uuid := (SELECT id FROM _ids WHERE rotulo='cliB');
        n int; ok boolean; obs text;
BEGIN
  -- G8: A insere no proprio tenant
  PERFORM pg_temp.ator(v_a); EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.financeiro_contratos (cliente_id, produto, valor, data_inicio, dia_pagamento, status)
    VALUES (v_cA, 'FIXTURE 01A insert A', 1, date '2026-02-01', 5, 'ativo');
    ok := true; obs := 'insert aceito';
  EXCEPTION WHEN others THEN ok := false; obs := SQLSTATE;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.reg('G8 A insere em A', ok, obs);

  -- G9: A tenta inserir no tenant B
  PERFORM pg_temp.ator(v_a); EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.financeiro_contratos (cliente_id, produto, valor, data_inicio, dia_pagamento, status)
    VALUES (v_cB, 'FIXTURE 01A insert B', 1, date '2026-02-01', 5, 'ativo');
    ok := false; obs := 'ACEITOU — vazamento';
  EXCEPTION WHEN insufficient_privilege THEN ok := true; obs := 'negado com 42501 (WITH CHECK)';
            WHEN others THEN ok := false; obs := 'erro inesperado ' || SQLSTATE;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.reg('G9 A NAO insere em B', ok, obs);

  -- G10: A atualiza o proprio
  PERFORM pg_temp.ator(v_a); EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.financeiro_contratos SET observacao = 'tocado por A'
   WHERE id = 'cccccccc-0000-4000-8000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.reg('G10 A atualiza A', n = 1, n::text || ' linha(s)');

  -- G11: A tenta atualizar o de B -> zero linhas (USING nao alcanca)
  PERFORM pg_temp.ator(v_a); EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.financeiro_contratos SET observacao = 'tocado por A'
   WHERE id = 'cccccccc-0000-4000-8000-00000000000b';
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.reg('G11 A NAO atualiza B', n = 0, n::text || ' linha(s) afetada(s)');

  -- G12: A tenta mover o proprio contrato para o tenant B
  PERFORM pg_temp.ator(v_a); EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.financeiro_contratos SET cliente_id = v_cB
     WHERE id = 'cccccccc-0000-4000-8000-00000000000a';
    ok := false; obs := 'ACEITOU — troca de tenant possivel';
  EXCEPTION WHEN insufficient_privilege THEN ok := true; obs := 'negado com 42501 (WITH CHECK do UPDATE)';
            WHEN others THEN ok := false; obs := 'erro inesperado ' || SQLSTATE;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.reg('G12 troca de cliente_id A->B falha', ok, obs);

  -- G13: UPDATE que nao alcanca linha nao pode ser lido como sucesso.
  --      O gate exige que o teste distinga zero-linhas de sucesso.
  PERFORM pg_temp.ator(v_a); EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.financeiro_contratos SET observacao = 'x'
   WHERE id = 'cccccccc-0000-4000-8000-00000000000b';
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.reg('G13 UPDATE sem SELECT nao gera falso-verde',
    n = 0, 'ROW_COUNT=' || n || ' — ausencia de erro NAO significa sucesso');

  -- G14: DELETE direto por authenticated
  PERFORM pg_temp.ator(v_a); EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    DELETE FROM public.financeiro_contratos WHERE id = 'cccccccc-0000-4000-8000-00000000000a';
    GET DIAGNOSTICS n = ROW_COUNT;
    ok := false; obs := 'NAO negado; afetou ' || n || ' linha(s)';
  EXCEPTION WHEN insufficient_privilege THEN ok := true; obs := 'negado com 42501 (privilegio DELETE revogado)';
            WHEN others THEN ok := false; obs := 'erro inesperado ' || SQLSTATE;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.reg('G14 DELETE por authenticated', ok, obs);

  -- G15: TRUNCATE por authenticated
  PERFORM pg_temp.ator(v_a); EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE 'TRUNCATE public.financeiro_contratos';
    ok := false; obs := 'TRUNCATE EXECUTADO — catastrofico';
  EXCEPTION WHEN insufficient_privilege THEN ok := true; obs := 'negado com 42501';
            WHEN others THEN ok := false; obs := 'erro inesperado ' || SQLSTATE;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.reg('G15 TRUNCATE por authenticated retorna 42501', ok, obs);
END $esc$;

-- ===========================================================================
-- BLOCO 3 — PRIVILEGIOS NOMINAIS E EFETIVOS
-- ===========================================================================
SELECT pg_temp.reg('G16 REFERENCES ausente de authenticated',
  NOT has_table_privilege('authenticated','public.financeiro_contratos','REFERENCES'), '');
SELECT pg_temp.reg('G17 TRIGGER ausente de authenticated',
  NOT has_table_privilege('authenticated','public.financeiro_contratos','TRIGGER'), '');
SELECT pg_temp.reg('G18 MAINTAIN ausente de authenticated',
  NOT has_table_privilege('authenticated','public.financeiro_contratos','MAINTAIN'), '');

SELECT pg_temp.reg('G19 PUBLIC sem grants nominais',
  (SELECT count(*) FROM pg_class c
     CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r',c.relowner))) a
    WHERE c.oid='public.financeiro_contratos'::regclass AND a.grantee = 0) = 0, '');

SELECT pg_temp.reg('G20 anon sem grants nominais e efetivos',
  (SELECT count(*) FROM pg_class c
     CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r',c.relowner))) a
    WHERE c.oid='public.financeiro_contratos'::regclass
      AND pg_get_userbyid(nullif(a.grantee,0)) = 'anon') = 0
  AND NOT has_table_privilege('anon','public.financeiro_contratos','SELECT')
  AND NOT has_table_privilege('anon','public.financeiro_contratos','INSERT')
  AND NOT has_table_privilege('anon','public.financeiro_contratos','UPDATE')
  AND NOT has_table_privilege('anon','public.financeiro_contratos','DELETE'), '');

SELECT pg_temp.reg('G21 authenticated exatamente SELECT/INSERT/UPDATE',
  (SELECT coalesce(string_agg(a.privilege_type, ',' ORDER BY a.privilege_type),'(vazia)')
     FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r',c.relowner))) a
    WHERE c.oid='public.financeiro_contratos'::regclass
      AND pg_get_userbyid(nullif(a.grantee,0)) = 'authenticated') = 'INSERT,SELECT,UPDATE',
  (SELECT coalesce(string_agg(a.privilege_type, ',' ORDER BY a.privilege_type),'(vazia)')
     FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r',c.relowner))) a
    WHERE c.oid='public.financeiro_contratos'::regclass
      AND pg_get_userbyid(nullif(a.grantee,0)) = 'authenticated'));

SELECT pg_temp.reg('G22 attacl sem bypass em todas as colunas',
  (SELECT count(*) FROM pg_attribute
    WHERE attrelid='public.financeiro_contratos'::regclass AND attnum>0
      AND NOT attisdropped AND attacl IS NOT NULL) = 0, '');

-- ===========================================================================
-- BLOCO 4 — FORMA DAS POLICIES
-- ===========================================================================
SELECT pg_temp.reg('G23 exatamente tres policies',
  (SELECT count(*) FROM pg_policy WHERE polrelid='public.financeiro_contratos'::regclass) = 3,
  (SELECT count(*)::text FROM pg_policy WHERE polrelid='public.financeiro_contratos'::regclass));

SELECT pg_temp.reg('G24 policy permissiva antiga ausente',
  (SELECT count(*) FROM pg_policy WHERE polrelid='public.financeiro_contratos'::regclass
     AND polname='financeiro_contratos_all') = 0, '');

SELECT pg_temp.reg('G25 zero USING(true) e zero WITH CHECK(true)',
  (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid='public.financeiro_contratos'::regclass
     AND (pg_get_expr(pol.polqual, pol.polrelid)='true'
       OR pg_get_expr(pol.polwithcheck, pol.polrelid)='true')) = 0, '');

SELECT pg_temp.reg('G25b nenhuma policy DELETE ou FOR ALL',
  (SELECT count(*) FROM pg_policy WHERE polrelid='public.financeiro_contratos'::regclass
     AND polcmd IN ('d','*')) = 0, '');

SELECT pg_temp.reg('G25c nenhuma policy para PUBLIC ou anon',
  (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid='public.financeiro_contratos'::regclass
     AND (pol.polroles = '{0}'::oid[]
       OR EXISTS (SELECT 1 FROM unnest(pol.polroles) r WHERE pg_get_userbyid(r)='anon'))) = 0, '');

-- ===========================================================================
-- BLOCO 5 — FLUXOS VIVOS DO PRODUTO
-- ===========================================================================
DO $flx$
DECLARE v_a uuid := (SELECT id FROM _ids WHERE rotulo='uA'); n int; ok boolean; obs text;
BEGIN
  PERFORM pg_temp.ator(v_a); EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO n FROM public.financeiro_contratos;
  PERFORM pg_temp.reg('G26 listar contrato vivo', n >= 1, n::text || ' visivel(is)');

  BEGIN
    INSERT INTO public.financeiro_contratos (cliente_id, produto, valor, data_inicio, dia_pagamento, status)
    VALUES ((SELECT id FROM _ids WHERE rotulo='cliA'), 'FIXTURE 01A criar', 9, date '2026-03-01', 3, 'ativo');
    ok := true;
  EXCEPTION WHEN others THEN ok := false; obs := SQLSTATE; END;
  PERFORM pg_temp.reg('G27 criar contrato vivo', ok, coalesce(obs,'insert aceito'));

  UPDATE public.financeiro_contratos SET produto = 'FIXTURE 01A editado'
   WHERE id = 'cccccccc-0000-4000-8000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.reg('G28 editar contrato vivo', n = 1, n::text || ' linha(s)');

  UPDATE public.financeiro_contratos SET status = 'encerrado'
   WHERE id = 'cccccccc-0000-4000-8000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.reg('G29 alterar status para encerrado vivo', n = 1, n::text || ' linha(s)');

  EXECUTE 'SET LOCAL ROLE postgres';
END $flx$;

-- ===========================================================================
-- BLOCO 6 — PRESERVACAO
-- ===========================================================================
SELECT pg_temp.reg('G33 shape preservado: sem PK, sem indice, 24 colunas, 1 trigger',
  (SELECT count(*) FROM pg_constraint WHERE conrelid='public.financeiro_contratos'::regclass) = 0
  AND (SELECT count(*) FROM pg_index WHERE indrelid='public.financeiro_contratos'::regclass) = 0
  AND (SELECT count(*) FROM pg_attribute WHERE attrelid='public.financeiro_contratos'::regclass
        AND attnum>0 AND NOT attisdropped) = 24
  AND (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.financeiro_contratos'::regclass
        AND NOT tgisinternal) = 1, '');

SELECT pg_temp.reg('G34 financeiro_lancamentos_v2 intocada: 3 policies, nenhuma DELETE',
  (SELECT count(*) FROM pg_policy WHERE polrelid='public.financeiro_lancamentos_v2'::regclass) = 3
  AND (SELECT count(*) FROM pg_policy WHERE polrelid='public.financeiro_lancamentos_v2'::regclass
        AND polcmd='d') = 0, '');

SELECT pg_temp.reg('G34b RLS ligada, FORCE off, owner postgres',
  (SELECT relrowsecurity AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)='postgres'::name
     FROM pg_class WHERE oid='public.financeiro_contratos'::regclass), '');

-- ---------------------------------------------------------------------------
SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FALHA' END AS resultado, obs
  FROM _r ORDER BY gate;

SELECT count(*) FILTER (WHERE ok) AS pass,
       count(*) FILTER (WHERE NOT ok) AS fail,
       count(*) AS total
  FROM _r;

DO $fim$
DECLARE v_f int;
BEGIN
  SELECT count(*) INTO v_f FROM _r WHERE NOT ok;
  IF v_f = 0 THEN RAISE NOTICE 'SUITE 01A: todos os gates passaram';
  ELSE RAISE WARNING 'SUITE 01A: % gate(s) vermelho(s)', v_f; END IF;
END $fim$;

ROLLBACK;
