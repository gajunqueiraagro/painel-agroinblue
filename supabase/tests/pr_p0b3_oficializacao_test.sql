-- PR-P1-OFICIALIZACAO-P0B3 — Teste transacional de fn_oficializar_p1, fn_rebaixar_p1_oficial,
--   e das evolucoes de fn_reabrir_p1_operacional (RPC) e do A8A (fn_invalidar_snapshot_conjunto).
-- Roda em BEGIN...ROLLBACK: NADA persiste. Dados de negocio sinteticos; IDENTIDADE real
--   (admin global) como owner_id/auth.uid(). NAO usa IDs de Santa Rita. Token run-unique.
--   Triggers ATIVOS (inclusive A8A). Helpers pg_temp reduzem duplicacao (rolled back junto).
--
-- Separacao de logs (T8/T10/T18): o log de rebaixamento (fn_rebaixar) e o(s) log(s) de
--   invalidacao de P2 (bloco afetados de fn_reabrir) tem, no mes-alvo, conteudo identico
--   (mesmo pilar/ano_mes/motivo). A contagem robusta de rebaixamentos e:
--     rebaixamentos = total_logs - p2_afetados   (linhas validado->invalidado/cadeia_quebrada),
--   corroborada por versao++ (cada rebaixamento REAL incrementa versao exatamente 1 vez).

SELECT set_config('app.p0b3_test_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

BEGIN;

-- ============================ HELPERS (pg_temp, descartados no ROLLBACK) ============================
CREATE FUNCTION pg_temp.mk_faz(p_cli uuid, p_user uuid, p_tag text, p_label text)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_faz uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.fazendas (id, cliente_id, nome, owner_id)
    VALUES (v_faz, p_cli, 'FAZENDA_'||p_label||'_P0B3_'||p_tag, p_user);
  INSERT INTO public.fazenda_cadastros
    (fazenda_id, cliente_id, area_produtiva_ha, area_pecuaria_ha, area_agricultura_ha, area_total_ha, area_reserva_ha, area_benfeitorias_ha, area_outras_ha)
    VALUES (v_faz, p_cli, 1000, 800, 200, 1050, 30, 15, 5);
  RETURN v_faz;
END $f$;

CREATE FUNCTION pg_temp.add_cards(p_faz uuid, p_cli uuid, p_tag text, p_label text, p_mes text, p_n int, p_cat uuid)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE i int; v_pasto uuid; v_card uuid;
BEGIN
  FOR i IN 1..p_n LOOP
    INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso, area_produtiva_ha)
      VALUES (p_faz, p_cli, 'PASTO_'||p_label||'_P0B3_'||p_tag||'_'||i, true, true, 'pecuaria', 10) RETURNING id INTO v_pasto;
    INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status)
      VALUES (v_pasto, p_faz, p_cli, p_mes, 'fechado') RETURNING id INTO v_card;
    INSERT INTO public.fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_total)
      VALUES (v_card, p_cat, 10, 3000);
  END LOOP;
END $f$;

CREATE FUNCTION pg_temp.add_p25(p_faz uuid, p_cli uuid, p_tag text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  -- aplicavel SEM card fechado (P_25): entra no conjunto como membro_sem_card
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso, area_produtiva_ha)
    VALUES (p_faz, p_cli, 'PASTO_P25_'||p_label||'_P0B3_'||p_tag, true, true, 'pecuaria', 10);
END $f$;

CREATE FUNCTION pg_temp.set_p2(p_faz uuid, p_cli uuid, p_mes text, p_fech boolean, p_val boolean)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_fech THEN INSERT INTO public.valor_rebanho_fechamento (fazenda_id, cliente_id, ano_mes, status) VALUES (p_faz, p_cli, p_mes, 'fechado'); END IF;
  IF p_val  THEN INSERT INTO public.valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status) VALUES (p_faz, p_cli, p_mes, 'validado'); END IF;
END $f$;

-- fazenda 100% oficializavel: 64 cards fechado + conjunto materializado + area vinculada + P2 fechado/validado.
-- ASSUME request.jwt.claims ja setado para p_user (gerar_snapshot_area valida autoria/tenant).
CREATE FUNCTION pg_temp.oficializavel(p_cli uuid, p_user uuid, p_tag text, p_label text, p_mes text, p_mes_date date, p_cat uuid)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_faz uuid;
BEGIN
  v_faz := pg_temp.mk_faz(p_cli, p_user, p_tag, p_label);
  PERFORM pg_temp.add_cards(v_faz, p_cli, p_tag, p_label, p_mes, 64, p_cat);
  PERFORM public.gerar_snapshot_area(v_faz, p_mes_date, p_user);  -- materializa conjunto vigente + gera/vincula area
  PERFORM pg_temp.set_p2(v_faz, p_cli, p_mes, true, true);
  RETURN v_faz;
END $f$;

-- ================================= FIXTURE + ASSERCOES =================================
DO $fix$
DECLARE
  v_tag  text := current_setting('app.p0b3_test_tag');
  v_user uuid;
  v_stranger uuid := gen_random_uuid();
  v_cli  uuid := gen_random_uuid();
  v_cat  uuid;
  v_mes      text := '2020-03';
  v_mes_date date := DATE '2020-03-01';
  v_fut      text := '2020-04';
  v_faz_h uuid; v_faz_p25 uuid; v_faz3 uuid; v_faz4 uuid; v_faz5 uuid;
  v_faz8 uuid; v_faz9 uuid; v_faz11 uuid; v_faz13 uuid; v_faz18 uuid;
  v_res jsonb; v_reb jsonb;
  v_p1id uuid; v_ver int; v_ver0 int; v_status text; v_snap uuid;
  v_payload jsonb;
  v_total int; v_motivo text;
BEGIN
  -- identidade real (admin global) para satisfazer FK owner_id -> auth.users e o trigger auto_add_owner
  SELECT cm.user_id INTO v_user FROM public.cliente_membros cm
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=cm.user_id)
   ORDER BY cm.user_id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'fixture: sem admin global'; END IF;
  SELECT id INTO v_cat FROM public.categorias LIMIT 1;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'fixture: sem categoria'; END IF;

  INSERT INTO public.clientes (id, nome) VALUES (v_cli, 'CLIENTE_TESTE_P0B3_'||v_tag);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ============================ T1 — oficializacao feliz ============================
  v_faz_h := pg_temp.oficializavel(v_cli, v_user, v_tag, 'H', v_mes, v_mes_date, v_cat);
  v_res := public.fn_oficializar_p1(v_faz_h, v_mes);
  IF (v_res->>'oficializado') <> 'true' THEN RAISE EXCEPTION 'T1 nao oficializou: %', v_res; END IF;
  SELECT id, versao, status, area_oficializada_payload, conjunto_oficializado_snapshot_id
    INTO v_p1id, v_ver, v_status, v_payload, v_snap
    FROM public.fechamento_p1 WHERE fazenda_id=v_faz_h AND ano_mes=v_mes;
  IF v_status <> 'oficial' THEN RAISE EXCEPTION 'T1 status=%', v_status; END IF;
  IF v_ver <> 1 THEN RAISE EXCEPTION 'T1 versao=% (esperado 1)', v_ver; END IF;
  IF v_snap IS NULL THEN RAISE EXCEPTION 'T1 conjunto_oficializado_snapshot_id NULL'; END IF;
  IF NOT (v_payload ? 'area_total_ha' AND v_payload ? 'area_produtiva_ha' AND v_payload ? 'area_pecuaria_ha'
      AND v_payload ? 'area_agricultura_ha' AND v_payload ? 'area_reserva_ha' AND v_payload ? 'area_benfeitorias_ha'
      AND v_payload ? 'area_outras_ha' AND v_payload ? 'origem_area' AND v_payload ? 'area_versao'
      AND v_payload ? 'fechamento_p1_snapshot_id')
     THEN RAISE EXCEPTION 'T1 payload nao tem todas as categorias/metadados: %', v_payload; END IF;
  IF (v_payload->>'area_total_ha')::numeric <> 1050 THEN RAISE EXCEPTION 'T1 area_total_ha=%', v_payload->>'area_total_ha'; END IF;
  IF (SELECT count(*) FROM public.fechamento_reaberturas_log WHERE fazenda_id=v_faz_h) <> 0 THEN RAISE EXCEPTION 'T1 gerou log (nao deveria)'; END IF;
  RAISE NOTICE 'T1 OK';

  -- ============================ T6 — idempotencia estrita (no-op identico) ============================
  v_res := public.fn_oficializar_p1(v_faz_h, v_mes);
  IF (v_res->>'ja_oficial') <> 'true' OR (v_res->>'nenhuma_alteracao') <> 'true' THEN RAISE EXCEPTION 'T6 nao foi no-op: %', v_res; END IF;
  IF (SELECT versao FROM public.fechamento_p1 WHERE id=v_p1id) <> 1 THEN RAISE EXCEPTION 'T6 versao mudou'; END IF;
  IF (SELECT count(*) FROM public.fechamento_reaberturas_log WHERE fazenda_id=v_faz_h) <> 0 THEN RAISE EXCEPTION 'T6 gerou log'; END IF;
  RAISE NOTICE 'T6 OK';

  -- ============================ T7 — divergencia (selo != estado atual) ============================
  UPDATE public.fechamento_p1 SET area_oficializada_payload = area_oficializada_payload || jsonb_build_object('area_total_ha', 99999)
   WHERE id=v_p1id;
  BEGIN
    PERFORM public.fn_oficializar_p1(v_faz_h, v_mes);
    RAISE EXCEPTION 'T7 aceitou reoficializar mes divergente';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE '%divergencia_oficial%' THEN RAISE EXCEPTION 'T7 P0001 errado: %', SQLERRM; END IF;
  END;
  IF (SELECT (area_oficializada_payload->>'area_total_ha')::numeric FROM public.fechamento_p1 WHERE id=v_p1id) <> 99999
     THEN RAISE EXCEPTION 'T7 selo foi sobrescrito (nao deveria)'; END IF;
  RAISE NOTICE 'T7 OK';

  -- ============================ T2 — BLOQUEIO P_25 (membro sem card) ============================
  v_faz_p25 := pg_temp.mk_faz(v_cli, v_user, v_tag, 'P25');
  PERFORM pg_temp.add_cards(v_faz_p25, v_cli, v_tag, 'P25', v_mes, 63, v_cat);
  PERFORM pg_temp.add_p25(v_faz_p25, v_cli, v_tag, 'P25');
  PERFORM public.gerar_snapshot_area(v_faz_p25, v_mes_date, v_user);   -- 64 membros: 63 fechados + 1 sem card
  PERFORM pg_temp.set_p2(v_faz_p25, v_cli, v_mes, true, true);
  BEGIN
    PERFORM public.fn_oficializar_p1(v_faz_p25, v_mes);
    RAISE EXCEPTION 'T2 oficializou conjunto incompleto';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE '%conjunto_incompleto: membros_sem_card=1%' THEN RAISE EXCEPTION 'T2 msg errada: %', SQLERRM; END IF;
  END;
  IF (SELECT status FROM public.fechamento_p1 WHERE fazenda_id=v_faz_p25 AND ano_mes=v_mes) = 'oficial' THEN RAISE EXCEPTION 'T2 virou oficial'; END IF;
  RAISE NOTICE 'T2 OK';

  -- ============================ T3 — sem area vinculada ============================
  v_faz3 := pg_temp.mk_faz(v_cli, v_user, v_tag, 'A3');
  PERFORM pg_temp.add_cards(v_faz3, v_cli, v_tag, 'A3', v_mes, 64, v_cat);
  PERFORM public.fn_materializar_conjunto_mes(v_faz3, v_mes);   -- conjunto vigente SEM gerar area
  PERFORM pg_temp.set_p2(v_faz3, v_cli, v_mes, true, true);
  BEGIN
    PERFORM public.fn_oficializar_p1(v_faz3, v_mes);
    RAISE EXCEPTION 'T3 oficializou sem area';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE '%area_nao_vinculada%' THEN RAISE EXCEPTION 'T3 msg errada: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'T3 OK';

  -- ============================ T4 — P2 incompleto ============================
  v_faz4 := pg_temp.mk_faz(v_cli, v_user, v_tag, 'A4');
  PERFORM pg_temp.add_cards(v_faz4, v_cli, v_tag, 'A4', v_mes, 64, v_cat);
  PERFORM public.gerar_snapshot_area(v_faz4, v_mes_date, v_user);   -- conjunto + area, SEM P2
  BEGIN
    PERFORM public.fn_oficializar_p1(v_faz4, v_mes);
    RAISE EXCEPTION 'T4 oficializou sem P2';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE '%p2_incompleto%' THEN RAISE EXCEPTION 'T4 msg errada: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'T4 OK';

  -- ============================ T5 — conjunto nao vigente ============================
  v_faz5 := pg_temp.mk_faz(v_cli, v_user, v_tag, 'A5');
  PERFORM pg_temp.add_cards(v_faz5, v_cli, v_tag, 'A5', v_mes, 64, v_cat);
  PERFORM public.fn_materializar_conjunto_mes(v_faz5, v_mes);
  UPDATE public.fechamento_p1_snapshot s SET status='invalidado'::public.snapshot_status, invalidado_em=now()
    FROM public.fechamento_p1 p WHERE p.id=s.fechamento_p1_id AND p.fazenda_id=v_faz5 AND p.ano_mes=v_mes
      AND s.status='vigente'::public.snapshot_status;
  BEGIN
    PERFORM public.fn_oficializar_p1(v_faz5, v_mes);
    RAISE EXCEPTION 'T5 oficializou sem conjunto vigente';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE '%conjunto_nao_vigente%' THEN RAISE EXCEPTION 'T5 msg errada: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'T5 OK';

  -- ============================ T8/T10 — RPC reabre mes oficial v1 (rebaixa ANTES dos cards) ============================
  v_faz8 := pg_temp.oficializavel(v_cli, v_user, v_tag, 'R8', v_mes, v_mes_date, v_cat);
  PERFORM public.fn_oficializar_p1(v_faz8, v_mes);
  SELECT id, versao INTO v_p1id, v_ver0 FROM public.fechamento_p1 WHERE fazenda_id=v_faz8 AND ano_mes=v_mes;   -- oficial v1
  IF v_ver0 <> 1 THEN RAISE EXCEPTION 'T8 pre versao=% (esperado 1)', v_ver0; END IF;
  v_res := public.fn_reabrir_p1_operacional(v_faz8, v_mes, 'T8_reabertura_'||v_tag);
  SELECT versao, status, conjunto_oficializado_snapshot_id INTO v_ver, v_status, v_snap
    FROM public.fechamento_p1 WHERE id=v_p1id;
  IF v_status <> 'reaberto' THEN RAISE EXCEPTION 'T8 status=%', v_status; END IF;
  IF v_ver <> 2 THEN RAISE EXCEPTION 'T8 versao=% (esperado 2 -> exatamente 1 rebaixamento; 64 A8A no-op)', v_ver; END IF;
  IF v_snap IS NULL THEN RAISE EXCEPTION 'T8 selo (conjunto_oficializado_snapshot_id) foi apagado'; END IF;
  IF (SELECT area_oficializada_snapshot_id FROM public.fechamento_p1 WHERE id=v_p1id) IS NULL THEN RAISE EXCEPTION 'T8 selo area apagado'; END IF;
  -- log de rebaixamento identificado DIRETAMENTE pelo motivo proprio (distinto do motivo de invalidacao de P2); sem subtracao
  IF (SELECT count(*) FROM public.fechamento_reaberturas_log
        WHERE fazenda_id=v_faz8
          AND motivo = 'Rebaixamento oficial por reabertura operacional P1: T8_reabertura_'||v_tag) <> 1
     THEN RAISE EXCEPTION 'T8/T10 log de rebaixamento (por motivo proprio) <> 1'; END IF;
  RAISE NOTICE 'T8/T10 OK (1 log de rebaixamento por motivo proprio; versao=2; 64 A8A no-op)';

  -- ============================ T14 — reoficializar apos reabertura ============================
  -- refazer conjunto/area/P2 sobre v_faz8 (reaberto v2) -> oficial (v2), novo payload
  UPDATE public.fechamento_pastos SET status='fechado' WHERE fazenda_id=v_faz8 AND ano_mes=v_mes;   -- A8A dispara mas status=reaberto -> residual no-op
  PERFORM public.gerar_snapshot_area(v_faz8, v_mes_date, v_user);   -- novo vigente + nova area
  UPDATE public.valor_rebanho_fechamento SET status='fechado' WHERE fazenda_id=v_faz8 AND ano_mes=v_mes;
  UPDATE public.valor_rebanho_realizado_validado SET status='validado' WHERE fazenda_id=v_faz8 AND ano_mes=v_mes;
  v_res := public.fn_oficializar_p1(v_faz8, v_mes);
  IF (v_res->>'oficializado') <> 'true' THEN RAISE EXCEPTION 'T14 nao reoficializou: %', v_res; END IF;
  SELECT versao, status, area_oficializada_payload INTO v_ver, v_status, v_payload FROM public.fechamento_p1 WHERE id=v_p1id;
  IF v_status <> 'oficial' THEN RAISE EXCEPTION 'T14 status=%', v_status; END IF;
  IF v_ver <> 2 THEN RAISE EXCEPTION 'T14 versao=% (esperado 2; oficializar nao incrementa)', v_ver; END IF;
  IF NOT (v_payload ? 'area_total_ha' AND v_payload ? 'fechamento_p1_snapshot_id') THEN RAISE EXCEPTION 'T14 payload incompleto'; END IF;
  RAISE NOTICE 'T14 OK (oficial v2)';

  -- ============================ T9 — A8A residual (alteracao direta de card em mes oficial v1) ============================
  v_faz9 := pg_temp.oficializavel(v_cli, v_user, v_tag, 'R9', v_mes, v_mes_date, v_cat);
  PERFORM public.fn_oficializar_p1(v_faz9, v_mes);
  SELECT id INTO v_p1id FROM public.fechamento_p1 WHERE fazenda_id=v_faz9 AND ano_mes=v_mes;
  UPDATE public.fechamento_pastos SET status='rascunho'
   WHERE id=(SELECT id FROM public.fechamento_pastos WHERE fazenda_id=v_faz9 AND ano_mes=v_mes AND status='fechado' LIMIT 1);
  SELECT versao, status INTO v_ver, v_status FROM public.fechamento_p1 WHERE id=v_p1id;
  IF v_status <> 'reaberto' THEN RAISE EXCEPTION 'T9 status=% (esperado reaberto residual)', v_status; END IF;
  IF v_ver <> 2 THEN RAISE EXCEPTION 'T9 versao=% (esperado 2)', v_ver; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fechamento_p1_snapshot s WHERE s.fechamento_p1_id=v_p1id AND s.status='invalidado'::public.snapshot_status)
     THEN RAISE EXCEPTION 'T9 snapshot nao invalidado'; END IF;
  SELECT count(*) INTO v_total FROM public.fechamento_reaberturas_log WHERE fazenda_id=v_faz9;
  IF v_total <> 1 THEN RAISE EXCEPTION 'T9 logs=% (esperado 1 residual)', v_total; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fechamento_reaberturas_log WHERE fazenda_id=v_faz9 AND motivo LIKE 'Rebaixamento residual:%')
     THEN RAISE EXCEPTION 'T9 log residual com motivo errado'; END IF;
  RAISE NOTICE 'T9 OK';

  -- ============================ T11/T12 — fn_rebaixar 2x (no-op na 2a) + motivo literal ============================
  v_faz11 := pg_temp.oficializavel(v_cli, v_user, v_tag, 'RB', v_mes, v_mes_date, v_cat);
  PERFORM public.fn_oficializar_p1(v_faz11, v_mes);
  SELECT id INTO v_p1id FROM public.fechamento_p1 WHERE fazenda_id=v_faz11 AND ano_mes=v_mes;
  v_motivo := 'MOTIVO_LITERAL_'||v_tag;
  v_reb := public.fn_rebaixar_p1_oficial(v_p1id, v_motivo);
  IF (v_reb->>'houve_transicao') <> 'true' OR (v_reb->>'log_gravado') <> 'true' THEN RAISE EXCEPTION 'T11 1a chamada nao transicionou: %', v_reb; END IF;
  IF (v_reb->>'versao_nova') <> '2' THEN RAISE EXCEPTION 'T11 versao_nova=% (esperado 2)', v_reb->>'versao_nova'; END IF;
  IF (SELECT count(*) FROM public.fechamento_reaberturas_log WHERE fazenda_id=v_faz11 AND motivo = v_motivo) <> 1
     THEN RAISE EXCEPTION 'T12 motivo nao persistido literalmente'; END IF;
  v_reb := public.fn_rebaixar_p1_oficial(v_p1id, v_motivo);   -- 2a: header ja reaberto -> no-op
  IF (v_reb->>'houve_transicao') <> 'false' OR (v_reb->>'log_gravado') <> 'false' THEN RAISE EXCEPTION 'T11 2a nao foi no-op: %', v_reb; END IF;
  IF (SELECT versao FROM public.fechamento_p1 WHERE id=v_p1id) <> 2 THEN RAISE EXCEPTION 'T11 versao mudou na 2a'; END IF;
  IF (SELECT count(*) FROM public.fechamento_reaberturas_log WHERE fazenda_id=v_faz11) <> 1 THEN RAISE EXCEPTION 'T11 log adicional na 2a'; END IF;
  RAISE NOTICE 'T11/T12 OK';

  -- ============================ T13 — contexto residual sem auth.uid() -> reaberto_por NULL ============================
  v_faz13 := pg_temp.oficializavel(v_cli, v_user, v_tag, 'NU', v_mes, v_mes_date, v_cat);
  PERFORM public.fn_oficializar_p1(v_faz13, v_mes);
  SELECT id INTO v_p1id FROM public.fechamento_p1 WHERE fazenda_id=v_faz13 AND ano_mes=v_mes;
  PERFORM set_config('request.jwt.claims', '{}', true);   -- limpa identidade: auth.uid() = NULL
  UPDATE public.fechamento_pastos SET status='rascunho'
   WHERE id=(SELECT id FROM public.fechamento_pastos WHERE fazenda_id=v_faz13 AND ano_mes=v_mes AND status='fechado' LIMIT 1);
  SELECT versao, status, reaberto_por INTO v_ver, v_status, v_snap FROM public.fechamento_p1 WHERE id=v_p1id;
  IF v_status <> 'reaberto' OR v_ver <> 2 THEN RAISE EXCEPTION 'T13 nao rebaixou (status=%, versao=%)', v_status, v_ver; END IF;
  IF v_snap IS NOT NULL THEN RAISE EXCEPTION 'T13 reaberto_por do cabecalho nao e NULL'; END IF;
  IF EXISTS (SELECT 1 FROM public.fechamento_reaberturas_log WHERE fazenda_id=v_faz13 AND reaberto_por IS NOT NULL)
     THEN RAISE EXCEPTION 'T13 log com reaberto_por nao-NULL'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fechamento_reaberturas_log WHERE fazenda_id=v_faz13 AND reaberto_por IS NULL)
     THEN RAISE EXCEPTION 'T13 sem log residual'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);  -- restaura admin
  RAISE NOTICE 'T13 OK';

  -- ============================ T18 — independencia de logs (rebaixamento vs invalidacao P2) ============================
  v_faz18 := pg_temp.oficializavel(v_cli, v_user, v_tag, 'IN', v_mes, v_mes_date, v_cat);
  PERFORM pg_temp.set_p2(v_faz18, v_cli, v_fut, false, true);   -- mes futuro validado -> vira log de CADEIA na reabertura
  PERFORM public.fn_oficializar_p1(v_faz18, v_mes);
  SELECT id INTO v_p1id FROM public.fechamento_p1 WHERE fazenda_id=v_faz18 AND ano_mes=v_mes;
  v_res := public.fn_reabrir_p1_operacional(v_faz18, v_mes, 'T18_reabertura_'||v_tag);
  IF (SELECT versao FROM public.fechamento_p1 WHERE id=v_p1id) <> 2 THEN RAISE EXCEPTION 'T18 versao<>2 (rebaixamento nao unico)'; END IF;
  -- (a) rebaixamento: EXATAMENTE 1, identificado pelo motivo proprio (sem subtracao de contagens)
  IF (SELECT count(*) FROM public.fechamento_reaberturas_log
        WHERE fazenda_id=v_faz18
          AND motivo = 'Rebaixamento oficial por reabertura operacional P1: T18_reabertura_'||v_tag) <> 1
     THEN RAISE EXCEPTION 'T18 log de rebaixamento (por motivo proprio) <> 1'; END IF;
  -- (b) invalidacao de P2: 2 (alvo + cadeia), motivo proprio distinto do rebaixamento
  IF (SELECT count(*) FROM public.fechamento_reaberturas_log
        WHERE fazenda_id=v_faz18 AND motivo LIKE 'Reabertura operacional P1:%') <> 2
     THEN RAISE EXCEPTION 'T18 logs de invalidacao de P2 <> 2'; END IF;
  -- (c) exatamente 1 desses e o de cadeia (mes futuro)
  IF (SELECT count(*) FROM public.fechamento_reaberturas_log
        WHERE fazenda_id=v_faz18 AND motivo LIKE '%[cadeia a partir de '||v_mes||']%') <> 1
     THEN RAISE EXCEPTION 'T18 log de cadeia (futuro) ausente/duplicado'; END IF;
  -- (d) total = 3, apenas como coerencia (nao usado para inferir origem)
  IF (SELECT count(*) FROM public.fechamento_reaberturas_log WHERE fazenda_id=v_faz18) <> 3
     THEN RAISE EXCEPTION 'T18 total_logs <> 3'; END IF;
  RAISE NOTICE 'T18 OK (1 rebaixamento + 2 P2 [1 alvo + 1 cadeia], identificados por motivo; versao=2)';

  -- ============================ T15 — autorizacao: outro tenant negado (42501) ============================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.fn_oficializar_p1(v_faz4, v_mes);
    RAISE EXCEPTION 'T15 outro tenant oficializou';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  RAISE NOTICE 'T15 OK';

  -- ============================ T16 — grants ============================
  IF has_function_privilege('authenticated', 'public.fn_rebaixar_p1_oficial(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_rebaixar_p1_oficial(uuid, text)', 'EXECUTE')
     OR has_function_privilege('public', 'public.fn_rebaixar_p1_oficial(uuid, text)', 'EXECUTE')
     THEN RAISE EXCEPTION 'T16 fn_rebaixar_p1_oficial tem grant externo'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_oficializar_p1(uuid, text)', 'EXECUTE')
     THEN RAISE EXCEPTION 'T16 fn_oficializar_p1 sem grant authenticated'; END IF;
  IF has_function_privilege('anon', 'public.fn_oficializar_p1(uuid, text)', 'EXECUTE')
     OR has_function_privilege('public', 'public.fn_oficializar_p1(uuid, text)', 'EXECUTE')
     THEN RAISE EXCEPTION 'T16 fn_oficializar_p1 exposto a anon/public'; END IF;
  RAISE NOTICE 'T16 OK';

  -- ============================ T17 — ano_mes invalido / NULL (22007) ============================
  BEGIN PERFORM public.fn_oficializar_p1(v_faz_h, '2020-13'); RAISE EXCEPTION 'T17 aceitou mes 13'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  BEGIN PERFORM public.fn_oficializar_p1(v_faz_h, NULL);      RAISE EXCEPTION 'T17 aceitou NULL'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  RAISE NOTICE 'T17 OK';

  RAISE NOTICE 'FIM: T1..T18 sem falha de assercao neste run';
END $fix$;

ROLLBACK;

-- ============================ POS-ROLLBACK — nada sintetico persiste (por token) ============================
DO $post$
DECLARE v_tag text := current_setting('app.p0b3_test_tag');
BEGIN
  IF EXISTS (SELECT 1 FROM public.clientes WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: cliente persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.fazendas WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: fazenda persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.pastos WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: pasto persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.fechamento_reaberturas_log l JOIN public.fazendas f ON f.id=l.fazenda_id WHERE f.nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: log persistiu'; END IF;
  RAISE NOTICE 'POS-ROLLBACK OK: nada sintetico persistiu';
END $post$;

SELECT set_config('app.p0b3_test_tag', '', false) AS run_tag_reset;
