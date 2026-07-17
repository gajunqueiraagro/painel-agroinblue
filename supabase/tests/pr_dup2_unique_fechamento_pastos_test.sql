-- PR-DUP-2 — Teste da constraint UNIQUE (fazenda_id, pasto_id, ano_mes) em fechamento_pastos.
-- Roda em BEGIN...ROLLBACK: NADA persiste. Fixture sintetica; IDENTIDADE real (admin) como owner.
-- Catalogo (T1-T3) por CONKEY (nao por nome). Captura 23505 com BEGIN...EXCEPTION.
-- Requer a constraint DUP-2 aplicada (homologacao na FASE 2C).

SELECT set_config('app.dup2_test_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

BEGIN;

DO $fix$
DECLARE
  v_tag  text := current_setting('app.dup2_test_tag');
  v_user uuid;
  v_cli  uuid := gen_random_uuid();
  v_f1   uuid := gen_random_uuid();
  v_f2   uuid := gen_random_uuid();
  v_p1 uuid; v_p1b uuid; v_p2 uuid;
  v_mes text := '2020-03'; v_mes2 text := '2020-04';
  v_cols text; v_ncols int; v_isuniq boolean;
  v_fp_antes text; v_fp_depois text; v_dup int; v_dgeral int;
BEGIN
  -- ===== T1/T2/T3 — catalogo (por conkey) =====
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fechamento_pastos'::regclass
                  AND conname='fechamento_pastos_fazenda_pasto_ano_mes_key') THEN
    RAISE EXCEPTION 'T1 constraint DUP-2 ausente (aplicar a migration antes)'; END IF;
  SELECT (c.contype='u') INTO v_isuniq FROM pg_constraint c WHERE c.conrelid='public.fechamento_pastos'::regclass AND c.conname='fechamento_pastos_fazenda_pasto_ano_mes_key';
  IF v_isuniq IS DISTINCT FROM true THEN RAISE EXCEPTION 'T2 constraint nao e UNIQUE'; END IF;
  -- T3: cobre EXATAMENTE fazenda_id, pasto_id, ano_mes NA ORDEM (por posicao no conkey)
  SELECT string_agg(a.attname, ',' ORDER BY x.ord), count(*)
    INTO v_cols, v_ncols
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS x(attnum, ord)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=x.attnum
   WHERE c.conrelid='public.fechamento_pastos'::regclass AND c.conname='fechamento_pastos_fazenda_pasto_ano_mes_key';
  IF v_cols <> 'fazenda_id,pasto_id,ano_mes' OR v_ncols <> 3 THEN
    RAISE EXCEPTION 'T3 colunas/ordem=% (esperado fazenda_id,pasto_id,ano_mes)', v_cols; END IF;

  -- fingerprint de dados REAIS (exclui a fixture) — antes
  SELECT md5(coalesce((SELECT string_agg(fp.id::text||'|'||fp.status, ',' ORDER BY fp.id) FROM public.fechamento_pastos fp WHERE fp.cliente_id<>v_cli),''))
    INTO v_fp_antes;
  SELECT count(*) INTO v_dup FROM (SELECT 1 FROM public.fechamento_pastos GROUP BY fazenda_id,pasto_id,ano_mes HAVING count(*)>1) d;
  SELECT count(*) INTO v_dgeral FROM public.fechamento_pastos fp JOIN public.pastos p ON p.id=fp.pasto_id WHERE fp.fazenda_id<>p.fazenda_id;

  -- ===== fixture =====
  SELECT cm.user_id INTO v_user FROM public.cliente_membros cm
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=cm.user_id) ORDER BY cm.user_id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'fixture: sem admin global'; END IF;
  INSERT INTO public.clientes (id, nome) VALUES (v_cli, 'CLIENTE_TESTE_DUP2_'||v_tag);
  INSERT INTO public.fazendas (id, cliente_id, nome, owner_id) VALUES
    (v_f1, v_cli, 'FAZ1_DUP2_'||v_tag, v_user), (v_f2, v_cli, 'FAZ2_DUP2_'||v_tag, v_user);
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_f1, v_cli, 'P1_DUP2_'||v_tag, true, true, 'recria') RETURNING id INTO v_p1;
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_f1, v_cli, 'P1B_DUP2_'||v_tag, true, true, 'recria') RETURNING id INTO v_p1b;
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_f2, v_cli, 'P2_DUP2_'||v_tag, true, true, 'recria') RETURNING id INTO v_p2;   -- pasto pertence a F2

  -- T4: primeiro card insere normalmente
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES (v_p1, v_f1, v_cli, v_mes, 'rascunho');
  -- T5: segundo card com a MESMA chave -> 23505
  BEGIN
    INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES (v_p1, v_f1, v_cli, v_mes, 'aberto');
    RAISE EXCEPTION 'T5 duplicidade aceita (constraint nao bloqueou)';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- T6: mesmo pasto em OUTRO mes -> OK
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES (v_p1, v_f1, v_cli, v_mes2, 'rascunho');
  -- T7: OUTRO pasto da mesma fazenda/mes -> OK
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES (v_p1b, v_f1, v_cli, v_mes, 'rascunho');
  -- T8: OUTRA fazenda com SEU proprio pasto no mesmo mes -> OK (nao fabrica DUP-GERAL)
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES (v_p2, v_f2, v_cli, v_mes, 'rascunho');
  RAISE NOTICE 'T4..T8 OK';

  -- ===== T10-T13 — invariantes de dados reais (fixture nao os altera) =====
  SELECT md5(coalesce((SELECT string_agg(fp.id::text||'|'||fp.status, ',' ORDER BY fp.id) FROM public.fechamento_pastos fp WHERE fp.cliente_id<>v_cli),''))
    INTO v_fp_depois;
  IF v_fp_depois <> v_fp_antes THEN RAISE EXCEPTION 'T10 fingerprint de dados reais mudou'; END IF;                 -- T10/T13
  IF (SELECT count(*) FROM (SELECT 1 FROM public.fechamento_pastos WHERE cliente_id<>v_cli GROUP BY fazenda_id,pasto_id,ano_mes HAVING count(*)>1) d) <> 0
     THEN RAISE EXCEPTION 'T11 duplicidades reais <> 0'; END IF;                                                   -- T11
  IF (SELECT count(*) FROM public.fechamento_pastos fp JOIN public.pastos p ON p.id=fp.pasto_id WHERE fp.fazenda_id<>p.fazenda_id AND fp.cliente_id<>v_cli) <> v_dgeral
     THEN RAISE EXCEPTION 'T12 DUP-GERAL real mudou (esperado %)', v_dgeral; END IF;                               -- T12

  RAISE NOTICE 'FIM: T1..T13 sem falha (23505 na duplicata; fazenda_id na chave; dados reais intactos)';
END $fix$;

ROLLBACK;

-- T9: pos-rollback — zero residuo sintetico
DO $post$
DECLARE v_tag text := current_setting('app.dup2_test_tag');
BEGIN
  IF EXISTS (SELECT 1 FROM public.clientes WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'T9 cliente persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.fazendas WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'T9 fazenda persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.pastos WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'T9 pasto persistiu'; END IF;
  RAISE NOTICE 'T9 OK: nada sintetico persistiu';
END $post$;

SELECT set_config('app.dup2_test_tag', '', false) AS run_tag_reset;
