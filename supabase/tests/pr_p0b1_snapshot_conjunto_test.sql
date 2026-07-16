-- PR-P1-SNAPSHOT-CONJUNTO-P0B1 — Teste transacional de fn_materializar_conjunto_mes.
-- Executar SOMENTE apos aplicar as migrations 0..5. Roda em BEGIN...ROLLBACK: NADA persiste.
-- Dados de negocio 100% sinteticos; apenas a IDENTIDADE (admin global real) e usada como
--   owner_id/auth.uid(). NAO usa IDs de Santa Rita. Categoria: referencia uma linha real
--   de categorias (FK), sem alterar categorias. Token run-unique em GUC (antes do BEGIN).
-- Triggers permanecem ATIVOS (inclusive A8a).
--
-- Casos: T1 materializar; T2 rematerializar; T3 reabrir card -> invalida; T4 pos-invalidacao
--   -> 1 vigente; T5 membros_count e cache; T6 ENUM rejeita valor invalido.

SELECT set_config('app.p0b1_test_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

BEGIN;

DO $fix$
DECLARE
  v_tag   text := current_setting('app.p0b1_test_tag');
  v_user  uuid;                        -- IDENTIDADE REAL (admin global)
  v_cli   uuid := gen_random_uuid();
  v_faz   uuid := gen_random_uuid();
  v_cat   uuid;
  v_mes   text := '2020-01';
  v_pasto uuid; v_card uuid;
  v_p25   uuid; v_div uuid; v_nc uuid;
  i int;
  r1 jsonb; r2 jsonb; r4 jsonb;
  v_snap1 uuid; v_snap2 uuid; v_snap_now uuid;
  v_mc int; v_real int;
BEGIN
  SELECT cm.user_id INTO v_user
  FROM cliente_membros cm
  WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=cm.user_id)
  ORDER BY cm.user_id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'fixture: nenhum admin global valido encontrado'; END IF;

  SELECT id INTO v_cat FROM public.categorias LIMIT 1;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'fixture: nenhuma categoria disponivel para a FK de itens'; END IF;

  INSERT INTO clientes (id, nome) VALUES (v_cli, 'CLIENTE_TESTE_P0B1_'||v_tag);
  INSERT INTO fazendas (id, cliente_id, nome, owner_id)
    VALUES (v_faz, v_cli, 'FAZENDA_TESTE_P0B1_'||v_tag, v_user);

  -- 64 aplicaveis COM card fechado + 1 item cada (qtd=10, peso_total=3000)
  FOR i IN 1..64 LOOP
    INSERT INTO pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso, area_produtiva_ha)
      VALUES (v_faz, v_cli, 'PASTO_AP_P0B1_'||v_tag||'_'||i, true, true, 'pecuaria', 10) RETURNING id INTO v_pasto;
    INSERT INTO fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status)
      VALUES (v_pasto, v_faz, v_cli, v_mes, 'fechado') RETURNING id INTO v_card;
    INSERT INTO fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_total)
      VALUES (v_card, v_cat, 10, 3000);
  END LOOP;

  -- +1 aplicavel SEM card (cenario P_25): card_fechado=false, fechamento_pasto_id NULL
  INSERT INTO pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso, area_produtiva_ha)
    VALUES (v_faz, v_cli, 'PASTO_P25_P0B1_'||v_tag, true, true, 'pecuaria', 10) RETURNING id INTO v_p25;
  -- +1 divergencia (excluida)
  INSERT INTO pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso)
    VALUES (v_faz, v_cli, 'PASTO_DIV_P0B1_'||v_tag, true, true, 'divergencia') RETURNING id INTO v_div;
  -- +1 entra_conciliacao=false (excluida)
  INSERT INTO pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso)
    VALUES (v_faz, v_cli, 'PASTO_NC_P0B1_'||v_tag, true, false, 'pecuaria') RETURNING id INTO v_nc;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ======================= T1 — materializar =======================
  r1 := public.fn_materializar_conjunto_mes(v_faz, v_mes);
  v_snap1 := (r1->>'snapshot_id')::uuid;
  IF (r1->>'membros') <> '65' THEN RAISE EXCEPTION 'T1 membros=% (esperado 65)', r1->>'membros'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fechamento_p1_snapshot
                 WHERE id=v_snap1 AND status='vigente' AND schema_version=1 AND membros_count=65)
     THEN RAISE EXCEPTION 'T1 snapshot invalido (status/schema_version/membros_count)'; END IF;
  IF (SELECT count(*) FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap1) <> 65
     THEN RAISE EXCEPTION 'T1 membros count <> 65'; END IF;
  IF (SELECT count(*) FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap1 AND fechamento_pasto_id IS NULL) <> 1
     THEN RAISE EXCEPTION 'T1 fechamento_pasto_id NULL <> 1'; END IF;
  IF (SELECT count(*) FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap1 AND card_fechado=true) <> 64
     THEN RAISE EXCEPTION 'T1 card_fechado=true <> 64'; END IF;
  IF (SELECT card_fechado FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap1 AND pasto_id=v_p25) <> false
     THEN RAISE EXCEPTION 'T1 P25 card_fechado != false'; END IF;
  IF (SELECT fechamento_pasto_id FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap1 AND pasto_id=v_p25) IS NOT NULL
     THEN RAISE EXCEPTION 'T1 P25 fechamento_pasto_id nao e NULL'; END IF;
  IF (SELECT count(*) FROM public.fechamento_pastos_membros
      WHERE snapshot_id=v_snap1 AND card_fechado=true AND (quantidade_total<>10 OR peso_total_congelado<>3000)) > 0
     THEN RAISE EXCEPTION 'T1 quantidade/peso nao congelados'; END IF;
  IF (SELECT count(*) FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap1 AND ativo_congelado<>true) > 0
     THEN RAISE EXCEPTION 'T1 ativo_congelado != true'; END IF;
  IF EXISTS (SELECT 1 FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap1 AND pasto_id IN (v_div, v_nc))
     THEN RAISE EXCEPTION 'T1 pasto excluido (divergencia/nc) presente no snapshot'; END IF;
  IF (SELECT count(*) FROM public.fechamento_p1_snapshot s JOIN public.fechamento_p1 p ON p.id=s.fechamento_p1_id
      WHERE p.fazenda_id=v_faz AND p.ano_mes=v_mes AND s.status='vigente') <> 1
     THEN RAISE EXCEPTION 'T1 vigente (por status) <> 1'; END IF;
  RAISE NOTICE 'T1 OK';

  -- ======================= T2 — rematerializar =======================
  r2 := public.fn_materializar_conjunto_mes(v_faz, v_mes);
  v_snap2 := (r2->>'snapshot_id')::uuid;
  IF (r2->>'snapshot_anterior')::uuid <> v_snap1 THEN RAISE EXCEPTION 'T2 snapshot_anterior <> snap1'; END IF;
  IF (SELECT status FROM public.fechamento_p1_snapshot WHERE id=v_snap1) <> 'substituido' THEN RAISE EXCEPTION 'T2 snap1 != substituido'; END IF;
  IF (SELECT substituido_por FROM public.fechamento_p1_snapshot WHERE id=v_snap1) <> v_snap2 THEN RAISE EXCEPTION 'T2 substituido_por != snap2'; END IF;
  IF (SELECT status FROM public.fechamento_p1_snapshot WHERE id=v_snap2) <> 'vigente' THEN RAISE EXCEPTION 'T2 snap2 != vigente'; END IF;
  IF (SELECT substitui_snapshot_id FROM public.fechamento_p1_snapshot WHERE id=v_snap2) <> v_snap1 THEN RAISE EXCEPTION 'T2 substitui_snapshot_id != snap1'; END IF;
  IF (SELECT count(*) FROM public.fechamento_p1_snapshot s JOIN public.fechamento_p1 p ON p.id=s.fechamento_p1_id
      WHERE p.fazenda_id=v_faz AND p.ano_mes=v_mes AND s.status='vigente') <> 1
     THEN RAISE EXCEPTION 'T2 vigente <> 1 (ux_fp1snap_vigente)'; END IF;
  IF (SELECT count(*) FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap1) <> 65
     THEN RAISE EXCEPTION 'T2 membros do snap1 nao preservados'; END IF;
  RAISE NOTICE 'T2 OK';

  -- ======================= T3 — reabrir card -> invalida vigente (trigger A8a) =======================
  UPDATE public.fechamento_pastos SET status='rascunho'
   WHERE id = (SELECT id FROM public.fechamento_pastos
               WHERE fazenda_id=v_faz AND ano_mes=v_mes AND status='fechado' LIMIT 1);
  IF (SELECT status FROM public.fechamento_p1_snapshot WHERE id=v_snap2) <> 'invalidado' THEN RAISE EXCEPTION 'T3 snap2 != invalidado'; END IF;
  IF (SELECT invalidado_em FROM public.fechamento_p1_snapshot WHERE id=v_snap2) IS NULL THEN RAISE EXCEPTION 'T3 invalidado_em NULL'; END IF;
  IF (SELECT motivo_invalidacao FROM public.fechamento_p1_snapshot WHERE id=v_snap2) IS NULL THEN RAISE EXCEPTION 'T3 motivo_invalidacao NULL'; END IF;
  IF (SELECT count(*) FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap2) <> 65 THEN RAISE EXCEPTION 'T3 membros do snap2 nao preservados'; END IF;
  IF (SELECT count(*) FROM public.fechamento_p1_snapshot s JOIN public.fechamento_p1 p ON p.id=s.fechamento_p1_id
      WHERE p.fazenda_id=v_faz AND p.ano_mes=v_mes AND s.status='vigente') <> 0
     THEN RAISE EXCEPTION 'T3 vigente <> 0'; END IF;
  RAISE NOTICE 'T3 OK';

  -- ======================= T4 — rematerializar apos invalidacao -> exatamente 1 vigente =======================
  -- Serializacao real e por fn_lock_p1 (advisory xact lock); ux_fp1snap_vigente garante <=1 vigente.
  r4 := public.fn_materializar_conjunto_mes(v_faz, v_mes);
  v_snap_now := (r4->>'snapshot_id')::uuid;
  IF (SELECT count(*) FROM public.fechamento_p1_snapshot s JOIN public.fechamento_p1 p ON p.id=s.fechamento_p1_id
      WHERE p.fazenda_id=v_faz AND p.ano_mes=v_mes AND s.status='vigente') <> 1
     THEN RAISE EXCEPTION 'T4 vigente <> 1'; END IF;
  RAISE NOTICE 'T4 OK';

  -- ======================= T5 — membros_count e CACHE (recalculavel) =======================
  v_mc := (SELECT membros_count FROM public.fechamento_p1_snapshot WHERE id=v_snap_now);
  DELETE FROM public.fechamento_pastos_membros
   WHERE id = (SELECT id FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap_now LIMIT 1);
  v_real := (SELECT count(*) FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap_now);
  IF v_mc = v_real THEN RAISE EXCEPTION 'T5 cache nao divergiu (membros_count=% count(*)=%)', v_mc, v_real; END IF;
  IF v_real <> v_mc - 1 THEN RAISE EXCEPTION 'T5 recalculo inesperado (membros_count=% count(*)=%)', v_mc, v_real; END IF;
  RAISE NOTICE 'T5 OK (membros_count=% e cache; count(*)=% e o real recalculavel)', v_mc, v_real;

  -- ======================= T6 — ENUM rejeita valor invalido =======================
  BEGIN
    PERFORM 'xxx'::public.snapshot_status;
    RAISE EXCEPTION 'T6 ENUM aceitou valor invalido';
  EXCEPTION
    WHEN SQLSTATE '22P02' THEN NULL;  -- invalid_text_representation esperado
  END;
  RAISE NOTICE 'T6 OK';

  RAISE NOTICE 'FIM: T1..T6 sem falha de assercao neste run';
END $fix$;

ROLLBACK;

-- ============================================================================
-- POS-ROLLBACK — nada sintetico persiste (por token run-unique)
-- ============================================================================
DO $post$
DECLARE v_tag text := current_setting('app.p0b1_test_tag');
BEGIN
  IF EXISTS (SELECT 1 FROM clientes WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: cliente sintetico persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM fazendas WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: fazenda sintetica persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM pastos WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: pasto sintetico persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.fechamento_p1_snapshot s JOIN fazendas f ON f.id=s.fazenda_id WHERE f.nome LIKE '%'||v_tag)
     THEN RAISE EXCEPTION 'POS: snapshot sintetico persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.fechamento_pastos_membros m JOIN fazendas f ON f.id=m.fazenda_id WHERE f.nome LIKE '%'||v_tag)
     THEN RAISE EXCEPTION 'POS: membros sinteticos persistiram'; END IF;
  RAISE NOTICE 'POS-ROLLBACK OK: nenhuma linha sintetica persistiu';
END $post$;

SELECT set_config('app.p0b1_test_tag', '', false) AS run_tag_reset;
