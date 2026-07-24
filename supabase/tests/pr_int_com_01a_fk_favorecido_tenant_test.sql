-- PR-INT-COM-01A — Teste da FK composta por tenant FINV2.favorecido_id -> financeiro_fornecedores.
-- Roda em BEGIN...ROLLBACK: NADA persiste. Fixture sintetica; IDENTIDADE real (admin) como owner.
-- Catalogo (C1-C9) por conkey/confkey/confdeltype (nao por nome). Enforcement (E1-E6) captura
--   foreign_key_violation com BEGIN...EXCEPTION. Requer a migration 01A aplicada (homolog FASE runtime).

SELECT set_config('app.int01a_test_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

BEGIN;

DO $fix$
DECLARE
  v_tag  text := current_setting('app.int01a_test_tag');
  v_user uuid;
  v_cliA uuid := gen_random_uuid();
  v_cliB uuid := gen_random_uuid();
  v_forn uuid := gen_random_uuid();
  v_cols text; v_ncols int;
  v_deltype "char"; v_matchtype "char"; v_updtype "char"; v_confrel regclass;
  v_real_antes bigint; v_real_depois bigint;
BEGIN
  -- ===== C1-C9 — catalogo do shape da FK (por catalogo, nao por nome de coluna solto) =====
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_flv2_favorecido_tenant'
                  AND conrelid='public.financeiro_lancamentos_v2'::regclass) THEN
    RAISE EXCEPTION 'C1 FK fk_flv2_favorecido_tenant ausente (aplicar a migration antes)'; END IF;

  SELECT confdeltype, confmatchtype, confupdtype, confrelid::regclass
    INTO v_deltype, v_matchtype, v_updtype, v_confrel
    FROM pg_constraint WHERE conname='fk_flv2_favorecido_tenant';
  IF v_deltype  <> 'r' THEN RAISE EXCEPTION 'C2 ON DELETE nao e RESTRICT (%)', v_deltype; END IF;
  IF v_matchtype <> 's' THEN RAISE EXCEPTION 'C3 MATCH nao e SIMPLE (%)', v_matchtype; END IF;
  IF v_updtype  <> 'a' THEN RAISE EXCEPTION 'C4 ON UPDATE nao e NO ACTION (%)', v_updtype; END IF;
  IF v_confrel  <> 'public.financeiro_fornecedores'::regclass THEN
    RAISE EXCEPTION 'C5 tabela-alvo errada (%)', v_confrel; END IF;

  -- C6: colunas de origem na ordem (favorecido_id, cliente_id)
  SELECT string_agg(a.attname, ',' ORDER BY x.ord), count(*)
    INTO v_cols, v_ncols
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS x(attnum, ord)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=x.attnum
   WHERE c.conname='fk_flv2_favorecido_tenant';
  IF v_cols <> 'favorecido_id,cliente_id' OR v_ncols <> 2 THEN
    RAISE EXCEPTION 'C6 colunas de origem=% (esperado favorecido_id,cliente_id)', v_cols; END IF;

  -- C7: FK validada
  IF NOT (SELECT convalidated FROM pg_constraint WHERE conname='fk_flv2_favorecido_tenant') THEN
    RAISE EXCEPTION 'C7 FK nao validada (convalidated=false)'; END IF;
  -- C8: UNIQUE-alvo composta presente
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='uq_financeiro_fornecedores_id_cliente' AND contype='u'
                    AND conrelid='public.financeiro_fornecedores'::regclass) THEN
    RAISE EXCEPTION 'C8 UNIQUE-alvo (id, cliente_id) ausente'; END IF;
  -- C9: indice parcial do lado filho presente
  IF NOT EXISTS (SELECT 1 FROM pg_class
                  WHERE relname='idx_flv2_favorecido_cliente' AND relkind='i'
                    AND relnamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'C9 indice parcial idx_flv2_favorecido_cliente ausente'; END IF;

  SELECT count(*) INTO v_real_antes FROM public.financeiro_lancamentos_v2;

  -- ===== fixture =====
  SELECT cm.user_id INTO v_user FROM public.cliente_membros cm
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=cm.user_id) ORDER BY cm.user_id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'fixture: sem admin global'; END IF;
  INSERT INTO public.clientes (id, nome) VALUES
    (v_cliA, 'CLI_A_INT01A_'||v_tag), (v_cliB, 'CLI_B_INT01A_'||v_tag);
  INSERT INTO public.financeiro_fornecedores (id, cliente_id, nome) VALUES
    (v_forn, v_cliA, 'FORN_INT01A_'||v_tag);

  -- E1: favorecido do MESMO cliente -> OK. valor distinto evita colisao no trigger unique_hash.
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, favorecido_id, valor, tipo_operacao)
    VALUES (v_cliA, v_forn, -11.11, '2-Saídas');

  -- E2: favorecido NULO -> OK (MATCH SIMPLE nao verifica linha com coluna de origem nula).
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, favorecido_id, valor, tipo_operacao)
    VALUES (v_cliA, NULL, -22.22, '2-Saídas');

  -- E3: cross-tenant (favorecido de A, cliente B) -> deve FALHAR.
  BEGIN
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, favorecido_id, valor, tipo_operacao)
      VALUES (v_cliB, v_forn, -33.33, '2-Saídas');
    RAISE EXCEPTION 'E3 cross-tenant aceito (FK nao bloqueou)';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  -- E4: favorecido inexistente -> deve FALHAR.
  BEGIN
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, favorecido_id, valor, tipo_operacao)
      VALUES (v_cliA, gen_random_uuid(), -44.44, '2-Saídas');
    RAISE EXCEPTION 'E4 favorecido orfao aceito (FK nao bloqueou)';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  -- E5: RESTRICT — apagar contraparte referenciada por E1 -> deve FALHAR.
  BEGIN
    DELETE FROM public.financeiro_fornecedores WHERE id = v_forn;
    RAISE EXCEPTION 'E5 delete de contraparte referenciada aceito (RESTRICT nao bloqueou)';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  -- E6: apenas E1 e E2 inseriram (E3/E4/E5 falharam e foram desfeitas ao savepoint).
  SELECT count(*) INTO v_real_depois FROM public.financeiro_lancamentos_v2;
  IF v_real_depois <> v_real_antes + 2 THEN
    RAISE EXCEPTION 'E6 contagem inesperada (antes=%, depois=%; esperado +2)', v_real_antes, v_real_depois; END IF;

  RAISE NOTICE 'INT01A: C1..C9 + E1..E6 OK (FK composta enforca tenant; orfao e RESTRICT bloqueiam)';
END $fix$;

ROLLBACK;

-- pos-rollback: zero residuo sintetico
DO $post$
DECLARE v_tag text := current_setting('app.int01a_test_tag');
BEGIN
  IF EXISTS (SELECT 1 FROM public.clientes WHERE nome LIKE '%'||v_tag) THEN
    RAISE EXCEPTION 'POS cliente sintetico persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_fornecedores WHERE nome LIKE '%'||v_tag) THEN
    RAISE EXCEPTION 'POS fornecedor sintetico persistiu'; END IF;
  RAISE NOTICE 'POS OK: nada sintetico persistiu';
END $post$;

SELECT set_config('app.int01a_test_tag', '', false) AS run_tag_reset;
