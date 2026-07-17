-- PR-DUP-3A — Teste transacional das RPCs idempotentes de criacao de cards.
-- Roda em BEGIN...ROLLBACK: NADA persiste. Fixture sintetica; IDENTIDADE real (admin) como caller/owner.
-- Requer as RPCs DUP-3A aplicadas (homologacao na FASE 2C). Negativos capturam SQLSTATE por bloco.
-- T15 (max 2 tentativas + 40001 + zero DO UPDATE) e gate ESTATICO (grep no corpo) — ver revisao estatica.

SELECT set_config('app.dup3a_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

BEGIN;

DO $fix$
DECLARE
  v_tag   text := current_setting('app.dup3a_tag');
  v_user  uuid;
  v_cli   uuid := gen_random_uuid();
  v_f1    uuid := gen_random_uuid();
  v_f2    uuid := gen_random_uuid();
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_card  public.fechamento_pastos;
  v_id    uuid; v_upd timestamptz; v_upd2 timestamptz;
  v_n int; v_before int; v_after int;
  v_ids uuid[];
BEGIN
  -- ===== fixture =====
  SELECT cm.user_id INTO v_user FROM public.cliente_membros cm
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=cm.user_id)
   ORDER BY cm.user_id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'fixture: sem admin global'; END IF;

  INSERT INTO public.clientes (id, nome) VALUES (v_cli, 'CLIENTE_DUP3A_'||v_tag);
  INSERT INTO public.fazendas (id, cliente_id, nome, owner_id) VALUES
    (v_f1, v_cli, 'FAZ1_DUP3A_'||v_tag, v_user),
    (v_f2, v_cli, 'FAZ2_DUP3A_'||v_tag, v_user);
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_f1, v_cli, 'P1_DUP3A_'||v_tag, true, true, 'recria')    RETURNING id INTO v_p1;
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_f1, v_cli, 'P2_DUP3A_'||v_tag, true, true, 'pecuaria')  RETURNING id INTO v_p2;
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_f2, v_cli, 'P3_DUP3A_'||v_tag, true, true, 'recria')    RETURNING id INTO v_p3;

  -- caller = admin (is_admin_agroinblue => bypassa tenant)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role','authenticated')::text, true);

  -- ===== SINGLE =====
  -- T1: criacao nova
  SELECT * INTO v_card FROM public.fn_obter_ou_criar_fechamento_pasto(v_f1, v_p1, '2020-05', 'rascunho', 'recria', 'RESP_A');
  IF v_card.id IS NULL                         THEN RAISE EXCEPTION 'T1 card sem id'; END IF;
  IF v_card.status <> 'rascunho'               THEN RAISE EXCEPTION 'T1 status=%', v_card.status; END IF;
  IF v_card.tipo_uso_mes <> 'recria'           THEN RAISE EXCEPTION 'T1 tipo_uso_mes=%', v_card.tipo_uso_mes; END IF;
  IF v_card.responsavel_nome <> 'RESP_A'       THEN RAISE EXCEPTION 'T1 responsavel=%', v_card.responsavel_nome; END IF;
  IF v_card.cliente_id <> v_cli                THEN RAISE EXCEPTION 'T1 cliente_id nao derivado'; END IF;
  IF v_card.ano_mes <> '2020-05'               THEN RAISE EXCEPTION 'T1 ano_mes=%', v_card.ano_mes; END IF;
  v_id := v_card.id; v_upd := v_card.updated_at;

  -- T2: repeticao => MESMO id; card INALTERADO (zero UPDATE), mesmo com args diferentes
  SELECT * INTO v_card FROM public.fn_obter_ou_criar_fechamento_pasto(v_f1, v_p1, '2020-05', 'fechado', 'lavoura', 'RESP_B');
  IF v_card.id <> v_id                         THEN RAISE EXCEPTION 'T2 id diferente'; END IF;
  IF v_card.status <> 'rascunho'               THEN RAISE EXCEPTION 'T2 status sobrescrito=%', v_card.status; END IF;
  IF v_card.tipo_uso_mes <> 'recria'           THEN RAISE EXCEPTION 'T2 tipo_uso_mes sobrescrito'; END IF;
  IF v_card.responsavel_nome <> 'RESP_A'       THEN RAISE EXCEPTION 'T2 responsavel sobrescrito'; END IF;
  IF v_card.updated_at IS DISTINCT FROM v_upd  THEN RAISE EXCEPTION 'T2 updated_at mudou (houve UPDATE)'; END IF;

  -- T3: status invalido -> 22023
  BEGIN
    PERFORM public.fn_obter_ou_criar_fechamento_pasto(v_f1, v_p1, '2020-05', 'xxx');
    RAISE EXCEPTION 'T3 status invalido aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- T4: ano_mes invalido e NULL -> 22007
  BEGIN
    PERFORM public.fn_obter_ou_criar_fechamento_pasto(v_f1, v_p1, '2020-13');
    RAISE EXCEPTION 'T4 ano_mes 2020-13 aceito';
  EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  BEGIN
    PERFORM public.fn_obter_ou_criar_fechamento_pasto(v_f1, v_p1, NULL);
    RAISE EXCEPTION 'T4 ano_mes NULL aceito';
  EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;

  -- T5: fazenda inexistente -> P0002; pasto de outra fazenda -> P0002
  BEGIN
    PERFORM public.fn_obter_ou_criar_fechamento_pasto(gen_random_uuid(), v_p1, '2020-05');
    RAISE EXCEPTION 'T5 fazenda inexistente aceita';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
  BEGIN
    PERFORM public.fn_obter_ou_criar_fechamento_pasto(v_f1, v_p3, '2020-05');  -- P3 e de F2
    RAISE EXCEPTION 'T5 pasto de outra fazenda aceito';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;

  -- T6: tenant alheio -> 42501; e anon/PUBLIC sem EXECUTE (catalogo)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.fn_obter_ou_criar_fechamento_pasto(v_f1, v_p1, '2020-05');
    RAISE EXCEPTION 'T6 tenant alheio aceito';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role','authenticated')::text, true);
  IF has_function_privilege('anon', 'public.fn_obter_ou_criar_fechamento_pasto(uuid,uuid,text,text,text,text)', 'EXECUTE')
     THEN RAISE EXCEPTION 'T6 anon tem EXECUTE na single'; END IF;
  IF has_function_privilege('anon', 'public.fn_obter_ou_criar_fechamentos_lote(uuid,uuid[],text,text,text)', 'EXECUTE')
     THEN RAISE EXCEPTION 'T6 anon tem EXECUTE no lote'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_obter_ou_criar_fechamento_pasto(uuid,uuid,text,text,text,text)', 'EXECUTE')
     THEN RAISE EXCEPTION 'T6 authenticated SEM EXECUTE na single'; END IF;

  -- ===== LOTE =====
  -- T7: array NULL / vazio / com elemento NULL -> 22023
  BEGIN
    PERFORM public.fn_obter_ou_criar_fechamentos_lote(v_f1, NULL::uuid[], '2020-06');
    RAISE EXCEPTION 'T7 array NULL aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.fn_obter_ou_criar_fechamentos_lote(v_f1, '{}'::uuid[], '2020-06');
    RAISE EXCEPTION 'T7 array vazio aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.fn_obter_ou_criar_fechamentos_lote(v_f1, ARRAY[v_p1, NULL]::uuid[], '2020-06');
    RAISE EXCEPTION 'T7 elemento NULL aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;

  -- T8/T11/T12/T14: [P1,P1,P2] deduplica -> EXATAMENTE 2 cards; tipo_uso_mes=pastos.tipo_uso; conjunto {P1,P2}
  SELECT count(*), array_agg(t.pasto_id ORDER BY t.pasto_id)
    INTO v_n, v_ids
    FROM public.fn_obter_ou_criar_fechamentos_lote(v_f1, ARRAY[v_p1, v_p1, v_p2], '2020-06') AS t;
  IF v_n <> 2 THEN RAISE EXCEPTION 'T8/T14 cardinalidade=% (esperado 2)', v_n; END IF;                 -- T8+T14
  IF v_ids <> ARRAY[LEAST(v_p1,v_p2), GREATEST(v_p1,v_p2)] THEN RAISE EXCEPTION 'T12 conjunto <> {P1,P2}'; END IF; -- T12
  IF (SELECT fp.tipo_uso_mes FROM public.fechamento_pastos fp WHERE fp.pasto_id=v_p1 AND fp.ano_mes='2020-06') <> 'recria'
     THEN RAISE EXCEPTION 'T11 tipo_uso_mes P1 <> recria'; END IF;                                     -- T11
  IF (SELECT fp.tipo_uso_mes FROM public.fechamento_pastos fp WHERE fp.pasto_id=v_p2 AND fp.ano_mes='2020-06') <> 'pecuaria'
     THEN RAISE EXCEPTION 'T11 tipo_uso_mes P2 <> pecuaria'; END IF;

  -- T9: P1 valido + P3 de outra fazenda -> P0002 e NADA inserido (sem sucesso parcial)
  SELECT count(*) INTO v_before FROM public.fechamento_pastos WHERE cliente_id=v_cli;
  BEGIN
    PERFORM public.fn_obter_ou_criar_fechamentos_lote(v_f1, ARRAY[v_p1, v_p3], '2020-07');
    RAISE EXCEPTION 'T9 lote com pasto alheio aceito';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
  SELECT count(*) INTO v_after FROM public.fechamento_pastos WHERE cliente_id=v_cli;
  IF v_after <> v_before THEN RAISE EXCEPTION 'T9 sucesso parcial: % -> %', v_before, v_after; END IF;

  -- T10: mistura novos+existentes. P1 ja tem card em 2020-08 (single); lote[P1,P2] -> 2 cards; P1 INALTERADO; P2 criado
  SELECT * INTO v_card FROM public.fn_obter_ou_criar_fechamento_pasto(v_f1, v_p1, '2020-08', 'aberto');
  v_id := v_card.id; v_upd2 := v_card.updated_at;
  SELECT count(*) INTO v_n FROM public.fn_obter_ou_criar_fechamentos_lote(v_f1, ARRAY[v_p1, v_p2], '2020-08') AS t;
  IF v_n <> 2 THEN RAISE EXCEPTION 'T10 cardinalidade=% (esperado 2)', v_n; END IF;
  SELECT * INTO v_card FROM public.fechamento_pastos WHERE pasto_id=v_p1 AND ano_mes='2020-08';
  IF v_card.id <> v_id OR v_card.updated_at IS DISTINCT FROM v_upd2
     THEN RAISE EXCEPTION 'T10 P1 alterado no lote'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fechamento_pastos WHERE pasto_id=v_p2 AND ano_mes='2020-08')
     THEN RAISE EXCEPTION 'T10 P2 nao criado'; END IF;

  RAISE NOTICE 'T1..T14 OK (single idempotente; lote sem sucesso parcial; dedup/cardinalidade; zero UPDATE)';
END $fix$;

ROLLBACK;

-- T13: pos-rollback — zero residuo sintetico
DO $post$
DECLARE v_tag text := current_setting('app.dup3a_tag');
BEGIN
  IF EXISTS (SELECT 1 FROM public.clientes WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'T13 cliente persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.fazendas WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'T13 fazenda persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.pastos   WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'T13 pasto persistiu'; END IF;
  RAISE NOTICE 'T13 OK: nada sintetico persistiu';
END $post$;

SELECT set_config('app.dup3a_tag', '', false) AS run_tag_reset;
