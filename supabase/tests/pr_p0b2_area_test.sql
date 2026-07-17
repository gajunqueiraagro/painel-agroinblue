-- PR-P1-SNAPSHOT-AREA-P0B2 — Teste transacional de gerar_snapshot_area (fachada
--   auto-materializadora), fn_gerar_area_de_snapshot, fn_area_vigente_mes, A8a-lock.
-- Roda em BEGIN...ROLLBACK: NADA persiste. Dados de negocio sinteticos; IDENTIDADE real
--   (admin global) como owner_id/auth.uid(). NAO usa IDs de Santa Rita. Token run-unique.
--   Triggers ATIVOS (inclusive A8a).

SELECT set_config('app.p0b2_test_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

BEGIN;

DO $fix$
DECLARE
  v_tag   text := current_setting('app.p0b2_test_tag');
  v_user  uuid;
  v_cli   uuid := gen_random_uuid();
  v_faz   uuid := gen_random_uuid();
  v_faz2  uuid := gen_random_uuid();   -- fallback legado (T8)
  v_cat   uuid;
  v_member  uuid := gen_random_uuid(); -- membro nao-admin sintetico (T12)
  v_stranger uuid := gen_random_uuid();-- sem tenant (T10/T11)
  v_mes      text := '2020-01';
  v_mes_date date := DATE '2020-01-01';
  v_pasto uuid; v_card uuid;
  i int;
  v_area uuid; v_snap1 uuid; v_snap_new uuid; v_diag jsonb;
  v_ver1 int; v_ver_b int; v_ver5 int;
BEGIN
  SELECT cm.user_id INTO v_user FROM cliente_membros cm
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=cm.user_id)
   ORDER BY cm.user_id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'fixture: sem admin global'; END IF;
  SELECT id INTO v_cat FROM public.categorias LIMIT 1;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'fixture: sem categoria'; END IF;

  INSERT INTO clientes (id, nome) VALUES (v_cli, 'CLIENTE_TESTE_P0B2_'||v_tag);
  INSERT INTO fazendas (id, cliente_id, nome, owner_id) VALUES
    (v_faz,  v_cli, 'FAZENDA_TESTE_P0B2_'||v_tag, v_user),
    (v_faz2, v_cli, 'FAZENDA_TESTE_P0B2_LEG_'||v_tag, v_user);
  INSERT INTO fazenda_cadastros (fazenda_id, cliente_id, area_produtiva_ha, area_pecuaria_ha, area_agricultura_ha, area_total_ha, area_reserva_ha, area_benfeitorias_ha, area_outras_ha)
    VALUES (v_faz, v_cli, 1000, 800, 200, 1050, 30, 15, 5);
  -- membro nao-admin do cliente (T12): user_id sem FK
  INSERT INTO cliente_membros (user_id, cliente_id, perfil, ativo) VALUES (v_member, v_cli, 'gestor_cliente', true);

  -- 64 aplicaveis com card fechado + item
  FOR i IN 1..64 LOOP
    INSERT INTO pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso, area_produtiva_ha)
      VALUES (v_faz, v_cli, 'PASTO_AP_P0B2_'||v_tag||'_'||i, true, true, 'pecuaria', 10) RETURNING id INTO v_pasto;
    INSERT INTO fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status)
      VALUES (v_pasto, v_faz, v_cli, v_mes, 'fechado') RETURNING id INTO v_card;
    INSERT INTO fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_total)
      VALUES (v_card, v_cat, 10, 3000);
  END LOOP;
  -- +1 aplicavel SEM card (P_25)
  INSERT INTO pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso, area_produtiva_ha)
    VALUES (v_faz, v_cli, 'PASTO_P25_P0B2_'||v_tag, true, true, 'pecuaria', 10);
  -- excluidos
  INSERT INTO pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso)
    VALUES (v_faz, v_cli, 'PASTO_DIV_P0B2_'||v_tag, true, true, 'divergencia');
  INSERT INTO pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso)
    VALUES (v_faz, v_cli, 'PASTO_NC_P0B2_'||v_tag, true, false, 'pecuaria');

  -- fixture legado (T8): area antiga SEM vinculo e SEM fechamento_p1
  INSERT INTO fechamento_area_snapshot (cliente_id, fazenda_id, ano_mes, area_total_ha, area_produtiva_ha, area_pecuaria_ha, area_agricultura_ha, origem_area)
    VALUES (v_cli, v_faz2, DATE '2019-06-01', 500, 500, 500, 0, 'fechamento_p1');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ======================= T1 — fluxo FechamentoTab (sem materializacao previa) =======================
  IF EXISTS (SELECT 1 FROM public.fechamento_p1_snapshot s JOIN public.fechamento_p1 p ON p.id=s.fechamento_p1_id WHERE p.fazenda_id=v_faz AND p.ano_mes=v_mes AND s.status='vigente'::public.snapshot_status)
     THEN RAISE EXCEPTION 'T1 pre: ja existe vigente'; END IF;
  v_area := public.gerar_snapshot_area(v_faz, v_mes_date, v_user);
  IF v_area IS NULL THEN RAISE EXCEPTION 'T1 area retornada NULL'; END IF;
  SELECT s.id INTO v_snap1 FROM public.fechamento_p1_snapshot s JOIN public.fechamento_p1 p ON p.id=s.fechamento_p1_id
    WHERE p.fazenda_id=v_faz AND p.ano_mes=v_mes AND s.status='vigente'::public.snapshot_status;
  IF v_snap1 IS NULL THEN RAISE EXCEPTION 'T1 sem vigente pos-fachada'; END IF;
  IF (SELECT count(*) FROM public.fechamento_p1_snapshot s JOIN public.fechamento_p1 p ON p.id=s.fechamento_p1_id WHERE p.fazenda_id=v_faz AND p.ano_mes=v_mes AND s.status='vigente'::public.snapshot_status) <> 1 THEN RAISE EXCEPTION 'T1 vigente<>1'; END IF;
  IF (SELECT count(*) FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap1) <> 65 THEN RAISE EXCEPTION 'T1 membros<>65'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fechamento_area_snapshot WHERE id=v_area AND fechamento_p1_snapshot_id=v_snap1 AND versao=1 AND schema_version=1 AND fechado_por=v_user AND origem_area='fechamento_p1'
                   AND area_total_ha=1050 AND area_produtiva_ha=1000 AND area_pecuaria_ha=800 AND area_agricultura_ha=200 AND area_reserva_ha=30 AND area_benfeitorias_ha=15 AND area_outras_ha=5 AND ano_mes=v_mes_date)
     THEN RAISE EXCEPTION 'T1 area invalida (vinculo/versao/valores/fechado_por)'; END IF;
  SELECT versao INTO v_ver1 FROM public.fechamento_area_snapshot WHERE id=v_area;
  RAISE NOTICE 'T1 OK';

  -- ======================= T1b — reexecucao com snapshot vigente reutilizado -> area PRESERVADA (PR1) =======================
  -- PR1 (20260717150000): fn_gerar_area_de_snapshot passou a PRESERVAR area existente.
  -- Contrato antigo (versao++) foi substituido por decisao de negocio: reexecucao
  -- do fechamento nao pode reescrever a fotografia historica.
  v_area := public.gerar_snapshot_area(v_faz, v_mes_date, v_user);
  IF (SELECT count(*) FROM public.fechamento_p1_snapshot s JOIN public.fechamento_p1 p ON p.id=s.fechamento_p1_id WHERE p.fazenda_id=v_faz AND p.ano_mes=v_mes) <> 1 THEN RAISE EXCEPTION 'T1b criou novo snapshot (deveria reutilizar)'; END IF;
  IF (SELECT fechamento_p1_snapshot_id FROM public.fechamento_area_snapshot WHERE id=v_area) <> v_snap1 THEN RAISE EXCEPTION 'T1b area nao vinculada ao vigente reutilizado'; END IF;
  SELECT versao INTO v_ver_b FROM public.fechamento_area_snapshot WHERE id=v_area;
  IF v_ver_b <> v_ver1 THEN RAISE EXCEPTION 'T1b PR1: versao deveria PRESERVAR, nao mudar (%->%)', v_ver1, v_ver_b; END IF;
  RAISE NOTICE 'T1b OK (area preservada, versao inalterada)';

  -- ======================= T2 — diagnostico (pendencia P_25) =======================
  v_diag := public.fn_gerar_area_de_snapshot(v_snap1);
  IF (v_diag->>'membros_count') <> '65' THEN RAISE EXCEPTION 'T2 membros_count=%', v_diag->>'membros_count'; END IF;
  IF (v_diag->>'membros_sem_card') <> '1' THEN RAISE EXCEPTION 'T2 sem_card=%', v_diag->>'membros_sem_card'; END IF;
  IF (v_diag->>'membros_nao_fechados') <> '1' THEN RAISE EXCEPTION 'T2 nao_fechados=%', v_diag->>'membros_nao_fechados'; END IF;
  IF (v_diag->>'apto_para_oficializacao') <> 'false' THEN RAISE EXCEPTION 'T2 apto=%', v_diag->>'apto_para_oficializacao'; END IF;
  RAISE NOTICE 'T2 OK';

  -- ======================= T3 — fn_area_vigente_mes -> 1 linha =======================
  IF (SELECT count(*) FROM public.fn_area_vigente_mes(v_faz, v_mes_date)) <> 1 THEN RAISE EXCEPTION 'T3 vigente_mes<>1'; END IF;
  RAISE NOTICE 'T3 OK';

  -- ======================= T4 — invalidacao (precedencia rigida) =======================
  UPDATE public.fechamento_pastos SET status='rascunho'
   WHERE id=(SELECT id FROM public.fechamento_pastos WHERE fazenda_id=v_faz AND ano_mes=v_mes AND status='fechado' LIMIT 1);
  IF (SELECT status FROM public.fechamento_p1_snapshot WHERE id=v_snap1) <> 'invalidado' THEN RAISE EXCEPTION 'T4 snap1 nao invalidado'; END IF;
  IF (SELECT count(*) FROM public.fn_area_vigente_mes(v_faz, v_mes_date)) <> 0 THEN RAISE EXCEPTION 'T4 vigente_mes<>0 (voltou ao legado?)'; END IF;
  RAISE NOTICE 'T4 OK';

  -- ======================= T5 — apos invalidacao, refechar -> novo vigente de CONJUNTO, area PRESERVADA (PR1) =======================
  -- CONTRATO (aprovado): a area preservada mantem sua origem historica ORIGINAL,
  -- mesmo que o conjunto P1 seja posteriormente rematerializado. A rematerializacao
  -- do conjunto NAO atualiza a area, NAO incrementa versao, NAO altera fechado_em e
  -- NAO revincula a area ao novo snapshot. A area pertence a fotografia em que foi
  -- capturada, nao ao ultimo conjunto — revincular seria enganoso.
  --
  -- IMPLICACAO PARA O FUTURO: um redesenho de get_status_pilares_fechamento NAO
  -- podera exigir que fechamento_area_snapshot.fechamento_p1_snapshot_id seja igual
  -- ao snapshot vigente mais recente do conjunto. Devera verificar EXISTENCIA e
  -- VALIDADE dos artefatos por mes, nao identidade absoluta entre suas versoes.
  --
  -- Aqui: conjunto rematerializado (novo vigente v_snap_new) mas area vinculada
  -- ao ORIGINAL (v_snap1), versao preservada.
  v_area := public.gerar_snapshot_area(v_faz, v_mes_date, v_user);
  SELECT s.id INTO v_snap_new FROM public.fechamento_p1_snapshot s JOIN public.fechamento_p1 p ON p.id=s.fechamento_p1_id
    WHERE p.fazenda_id=v_faz AND p.ano_mes=v_mes AND s.status='vigente'::public.snapshot_status;
  IF v_snap_new IS NULL OR v_snap_new = v_snap1 THEN RAISE EXCEPTION 'T5 nao criou novo vigente de conjunto'; END IF;
  IF (SELECT count(*) FROM public.fechamento_p1_snapshot s JOIN public.fechamento_p1 p ON p.id=s.fechamento_p1_id WHERE p.fazenda_id=v_faz AND p.ano_mes=v_mes AND s.status='vigente'::public.snapshot_status) <> 1 THEN RAISE EXCEPTION 'T5 vigente<>1'; END IF;
  IF (SELECT fechamento_p1_snapshot_id FROM public.fechamento_area_snapshot WHERE id=v_area) <> v_snap1 THEN RAISE EXCEPTION 'T5 PR1: area preservada deveria permanecer vinculada ao snapshot ORIGINAL (v_snap1)'; END IF;
  SELECT versao INTO v_ver5 FROM public.fechamento_area_snapshot WHERE id=v_area;
  IF v_ver5 <> v_ver_b THEN RAISE EXCEPTION 'T5 PR1: versao deveria PRESERVAR, nao mudar'; END IF;
  RAISE NOTICE 'T5 OK (conjunto novo, area preservada e vinculada ao original)';

  -- ======================= T6 — autoria invalida (42501) =======================
  BEGIN
    PERFORM public.gerar_snapshot_area(v_faz, v_mes_date, gen_random_uuid());
    RAISE EXCEPTION 'T6 aceitou autoria de terceiro';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  RAISE NOTICE 'T6 OK';

  -- ======================= T8 — fallback legado (sem fechamento_p1) =======================
  IF (SELECT count(*) FROM public.fn_area_vigente_mes(v_faz2, DATE '2019-06-01')) <> 1 THEN RAISE EXCEPTION 'T8 legado<>1'; END IF;
  RAISE NOTICE 'T8 OK';

  -- ======================= T9 — fn_gerar_area_de_snapshot sem grant externo =======================
  IF has_function_privilege('authenticated', 'public.fn_gerar_area_de_snapshot(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_gerar_area_de_snapshot(uuid)', 'EXECUTE')
     OR has_function_privilege('public', 'public.fn_gerar_area_de_snapshot(uuid)', 'EXECUTE')
     THEN RAISE EXCEPTION 'T9 fn_gerar_area_de_snapshot tem grant externo'; END IF;
  RAISE NOTICE 'T9 OK';

  -- ======================= T10/T11 — outro tenant negado (42501) =======================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM count(*) FROM public.fn_area_vigente_mes(v_faz, v_mes_date);
    RAISE EXCEPTION 'T10 leitura outro tenant nao negada';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    PERFORM public.gerar_snapshot_area(v_faz, v_mes_date, NULL);
    RAISE EXCEPTION 'T11 geracao outro tenant nao negada';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  RAISE NOTICE 'T10/T11 OK';

  -- ======================= T12 — membro nao-admin do cliente passa =======================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role', 'authenticated')::text, true);
  IF (SELECT count(*) FROM public.fn_area_vigente_mes(v_faz, v_mes_date)) <> 1 THEN RAISE EXCEPTION 'T12 membro nao leu area vigente'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);  -- restaura admin
  RAISE NOTICE 'T12 OK';

  -- ======================= T13 — mesma fn_lock_p1 (invalidacao x geracao) =======================
  IF NOT ((SELECT prosrc ~ 'fn_lock_p1' FROM pg_proc WHERE oid='public.fn_invalidar_snapshot_conjunto()'::regprocedure)
      AND (SELECT prosrc ~ 'fn_lock_p1' FROM pg_proc WHERE oid='public.fn_gerar_area_de_snapshot(uuid)'::regprocedure)
      AND (SELECT prosrc ~ 'fn_lock_p1' FROM pg_proc WHERE oid='public.gerar_snapshot_area(uuid, date, uuid)'::regprocedure))
     THEN RAISE EXCEPTION 'T13 alguma funcao nao usa fn_lock_p1'; END IF;
  RAISE NOTICE 'T13 OK';

  -- ======================= T14 — corrida: snapshot invalidado nunca tratado como vigente =======================
  -- Simula invalidacao concorrente do vigente e prova que a geracao rele sob lock e aborta.
  UPDATE public.fechamento_p1_snapshot SET status='invalidado'::public.snapshot_status, invalidado_em=now() WHERE id=v_snap_new;
  BEGIN
    PERFORM public.fn_gerar_area_de_snapshot(v_snap_new);
    RAISE EXCEPTION 'T14 gerou area de snapshot nao vigente';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
  RAISE NOTICE 'T14 OK';

  -- ======================= T15 — competencia invalida (22007) nas duas funcoes =======================
  BEGIN PERFORM count(*) FROM public.fn_area_vigente_mes(v_faz, DATE '2020-01-15'); RAISE EXCEPTION 'T15 area_vigente aceitou nao-dia1'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.fn_area_vigente_mes(v_faz, NULL); RAISE EXCEPTION 'T15 area_vigente aceitou NULL'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  BEGIN PERFORM public.gerar_snapshot_area(v_faz, DATE '2020-01-15', NULL); RAISE EXCEPTION 'T15 fachada aceitou nao-dia1'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  BEGIN PERFORM public.gerar_snapshot_area(v_faz, NULL, NULL); RAISE EXCEPTION 'T15 fachada aceitou NULL'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  RAISE NOTICE 'T15 OK';

  RAISE NOTICE 'FIM: T1..T15 sem falha de assercao neste run';
END $fix$;

ROLLBACK;

-- POS-ROLLBACK — nada sintetico persiste (por token)
DO $post$
DECLARE v_tag text := current_setting('app.p0b2_test_tag');
BEGIN
  IF EXISTS (SELECT 1 FROM clientes WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: cliente persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM fazendas WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: fazenda persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM pastos WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: pasto persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.fechamento_p1_snapshot s JOIN fazendas f ON f.id=s.fazenda_id WHERE f.nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: snapshot persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.fechamento_area_snapshot a JOIN fazendas f ON f.id=a.fazenda_id WHERE f.nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: area snapshot persistiu'; END IF;
  RAISE NOTICE 'POS-ROLLBACK OK: nada sintetico persistiu';
END $post$;

SELECT set_config('app.p0b2_test_tag', '', false) AS run_tag_reset;
