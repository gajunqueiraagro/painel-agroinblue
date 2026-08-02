-- PR-OC-ESTORNO-RECEBIMENTO-01 — testes de public.oc_estornar_recebimento (T1..T18).
--   Valida: estorna todas as movimentações ativas atomicamente (idempotente c/ já estornadas); reabre entrega
--   se encerrada; versão +1 DETERMINÍSTICO (nunca +2); preserva movimentações/dados/financeiro; view recebido=0;
--   eventos granular+consolidado com mesmo estorno_id; retorno c/ cache_rebuild_necessario; trigger P1 soberano
--   (mês oficial → rollback integral); helpers internos sem grants.
--   Requer aplicadas: 20260807120000 (este), 20260806120000/…/130000, 20260722200000. SOMENTE no PROTO.
--   BEGIN...ROLLBACK + resíduo zero (T18).
SELECT set_config('app.er_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_fA uuid; v_faz uuid;
  v_faz_syn uuid; v_pasto_syn uuid;                         -- fixture P1 sintética (T14/T15), determinística
  v_op uuid; v_lote uuid; v_ver int; v_res jsonb; v_ok boolean;
  v_link1 uuid; v_link2 uuid; v_nmov_before int; v_eid text; v_eid_g text;
  v_ent_before boolean; v_ver_before int; v_ev_before int; v_auth text;  -- estado pré-estorno (T14/T15)
  v_owner uuid;                                            -- owner_id válido (FK users) p/ a fazenda sintética
BEGIN
  v_tag := current_setting('app.er_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  SELECT id INTO v_fA  FROM public.financeiro_fornecedores WHERE cliente_id=v_cli ORDER BY nome LIMIT 1;
  SELECT id, owner_id INTO v_faz, v_owner FROM public.fazendas WHERE cliente_id=v_cli AND owner_id IS NOT NULL ORDER BY id LIMIT 1;
  IF v_fA IS NULL OR v_faz IS NULL OR v_owner IS NULL THEN RAISE EXCEPTION 'fixture: fornecedor/fazenda/owner'; END IF;

  -- ===== T1 — 1 mov + entrega ABERTA -> estorna; versão +1 =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-01','programada',false,5,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',5,'total',20000,1) RETURNING id INTO v_lote;
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-05', 'garrotes', 5, NULL, NULL, v_tag);
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_estornar_recebimento(v_op, v_cli, v_ver, 'estorno T1');
  IF (v_res->>'movimentacoes_estornadas')::int <> 1 OR (v_res->>'operacao_versao')::int <> v_ver + 1 THEN RAISE EXCEPTION 'T1 FAIL'; END IF;
  IF (SELECT count(*) FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id=m.movimentacao_id WHERE m.operacao_id=v_op AND l.cancelado IS NOT TRUE) <> 0 THEN RAISE EXCEPTION 'T1 FAIL: mov ainda ativa'; END IF;

  -- ===== T2 — 1 mov + entrega ENCERRADA -> reabre e estorna; versão +1 (não +2) =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-02','programada',false,5,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',5,'total',20000,1) RETURNING id INTO v_lote;
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-06', 'garrotes', 5, NULL, NULL, v_tag);
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  PERFORM public.oc_encerrar_entrega(v_op, v_cli, v_ver, 'encerra T2');
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_estornar_recebimento(v_op, v_cli, v_ver, 'estorno T2');
  IF (v_res->>'operacao_versao')::int <> v_ver + 1 THEN RAISE EXCEPTION 'T2 FAIL: versao deveria ser +1'; END IF;
  IF (SELECT entrega_encerrada FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> false THEN RAISE EXCEPTION 'T2 FAIL: entrega nao reabriu'; END IF;

  -- ===== T3 — múltiplas movs -> todas estornadas atômicas =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-03','programada',false,8,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',8,'total',20000,1) RETURNING id INTO v_lote;
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-07', 'garrotes', 3, NULL, NULL, v_tag);
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-08', 'garrotes', 5, NULL, NULL, v_tag);
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_estornar_recebimento(v_op, v_cli, v_ver, 'estorno T3');
  IF (v_res->>'movimentacoes_estornadas')::int <> 2 OR (v_res->>'quantidade_estornada')::numeric <> 8 THEN RAISE EXCEPTION 'T3 FAIL'; END IF;

  -- ===== T4 — mistura já estornada + ativa -> estorna só a ativa =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-04','programada',false,8,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',8,'total',20000,1) RETURNING id INTO v_lote;
  v_res := public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-09', 'garrotes', 3, NULL, NULL, v_tag);
  v_link1 := (v_res->>'movimentacao_id')::uuid;
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-10', 'garrotes', 5, NULL, NULL, v_tag);
  PERFORM public.oc_estornar_movimentacao(v_link1, v_cli, 'estorno oficial previo');   -- mov1 já estornada
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_estornar_recebimento(v_op, v_cli, v_ver, 'estorno T4');
  IF (v_res->>'movimentacoes_estornadas')::int <> 1 OR (v_res->>'quantidade_estornada')::numeric <> 5 THEN RAISE EXCEPTION 'T4 FAIL: deveria estornar so a ativa'; END IF;

  -- ===== T5 — nenhuma mov ativa -> P0001 =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-05','programada',false,3,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok := false; BEGIN PERFORM public.oc_estornar_recebimento(v_op, v_cli, v_ver, 'T5'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T5 FAIL'; END IF;

  -- ===== T6 — operação cancelada -> P0001 =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-06','programada',false,3,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',3,'total',20000,1) RETURNING id INTO v_lote;
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-11', 'garrotes', 3, NULL, NULL, v_tag);
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', versao=versao+1 WHERE id=v_op;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok := false; BEGIN PERFORM public.oc_estornar_recebimento(v_op, v_cli, v_ver, 'T6'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T6 FAIL'; END IF;

  -- ===== T7/T8/T9 usando uma op com mov ativa =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-07','programada',false,4,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',4,'total',20000,1) RETURNING id INTO v_lote;
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-12', 'garrotes', 4, NULL, NULL, v_tag);
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok := false; BEGIN PERFORM public.oc_estornar_recebimento(v_op, v_cli, v_ver + 99, 'T7'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='40001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T7 FAIL'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);
  v_ok := false; BEGIN PERFORM public.oc_estornar_recebimento(v_op, v_cli, v_ver, 'T8'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='42501' THEN v_ok := true; END IF; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  IF NOT v_ok THEN RAISE EXCEPTION 'T8 FAIL'; END IF;
  v_ok := false; BEGIN PERFORM public.oc_estornar_recebimento(v_op, v_cli, v_ver, '   '); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T9 FAIL'; END IF;

  -- T10/T11/T12/T13 — estorno válido sobre a op de T7 (ainda ativa, versão v_ver)
  SELECT count(*) INTO v_nmov_before FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op;
  v_res := public.oc_estornar_recebimento(v_op, v_cli, v_ver, 'estorno T10-13');
  -- T10 preservação
  IF (SELECT count(*) FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op) <> v_nmov_before
     OR (SELECT qtd_negociada FROM public.zoo_operacao_lotes WHERE id=v_lote) <> 4 THEN RAISE EXCEPTION 'T10 FAIL'; END IF;
  -- T11 view recebido=0/pendente=negociado
  IF (SELECT qtd_recebida FROM public.vw_oc_lotes_recebimento WHERE operacao_id=v_op AND lote_id=v_lote) <> 0
     OR (SELECT diferenca FROM public.vw_oc_lotes_recebimento WHERE operacao_id=v_op AND lote_id=v_lote) <> 4 THEN RAISE EXCEPTION 'T11 FAIL'; END IF;
  -- T12 estorno_id compartilhado
  v_eid := v_res->>'estorno_id';
  SELECT detalhes->>'estorno_id' INTO v_eid_g FROM public.zoo_operacao_eventos WHERE operacao_id=v_op AND acao='estornar_movimentacao' ORDER BY created_at DESC LIMIT 1;
  IF v_eid IS NULL OR v_eid_g <> v_eid
     OR (SELECT detalhes->>'estorno_id' FROM public.zoo_operacao_eventos WHERE operacao_id=v_op AND acao='estornar_recebimento' ORDER BY created_at DESC LIMIT 1) <> v_eid THEN RAISE EXCEPTION 'T12 FAIL'; END IF;
  -- T13 retorno
  IF (v_res->>'cache_rebuild_necessario') <> 'true' OR (v_res->>'quantidade_estornada')::numeric <> 4
     OR jsonb_array_length(v_res->'fazendas_afetadas') < 1 OR jsonb_array_length(v_res->'anos_afetados') < 1 THEN RAISE EXCEPTION 'T13 FAIL'; END IF;

  -- ===== T14/T15 — P1 OFICIAL bloqueia + rollback integral (SEMPRE executa; fixture sintética determinística)
  --   Autoridade real = get_status_pilares_fechamento (lê SOMENTE fechamento_pastos por fazenda+ano_mes;
  --   'oficial' sse total>0 e todos 'fechado'). Fazenda+pasto sintéticos criados na própria tx: a ÚNICA linha
  --   de fechamento_pastos para (v_faz_syn,'2026-06') é 'fechado' -> oficial garantido, sem depender de dados.
  INSERT INTO public.fazendas (cliente_id, nome, codigo, owner_id) VALUES (v_cli, v_tag, v_tag, v_owner) RETURNING id INTO v_faz_syn;  -- owner_id válido (FK users): trigger auto_add_owner_as_membro
  INSERT INTO public.pastos (fazenda_id, nome) VALUES (v_faz_syn, v_tag) RETURNING id INTO v_pasto_syn;
  -- op em v_faz_syn; mov1 mês pendente (2026-05) + mov2 mês que ficará oficial (2026-06); entrega ENCERRADA
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-05-01','programada',false,8,'garrotes',100000,0,v_fA,v_faz_syn,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',8,'total',20000,1) RETURNING id INTO v_lote;
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-05-15', 'garrotes', 3, NULL, NULL, v_tag);   -- 2026-05 pendente
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-06-15', 'garrotes', 5, NULL, NULL, v_tag);   -- 2026-06 (ainda pendente)
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  PERFORM public.oc_encerrar_entrega(v_op, v_cli, v_ver, 'encerra T14');   -- p/ provar que a reabertura também é revertida
  -- torna 2026-06 OFICIAL (única linha de fechamento p/ a fazenda+mês)
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, status, ano_mes) VALUES (v_pasto_syn, v_faz_syn, 'fechado', '2026-06');
  -- (c) PROVA na própria suíte: a autoridade lida pelo trigger retorna 'oficial' p/ a fixture (e 'pendente' em 2026-05)
  SELECT public.get_status_pilares_fechamento(v_faz_syn, '2026-06') #>> '{p1_mapa_pastos,status}' INTO v_auth;
  IF v_auth IS DISTINCT FROM 'oficial' THEN RAISE EXCEPTION 'T14 FIXTURE FAIL: autoridade P1 nao ficou oficial (=%)', coalesce(v_auth,'null'); END IF;
  IF (public.get_status_pilares_fechamento(v_faz_syn, '2026-05') #>> '{p1_mapa_pastos,status}') <> 'pendente' THEN
    RAISE EXCEPTION 'T15 FIXTURE FAIL: 2026-05 deveria ser pendente'; END IF;
  -- estado ANTES do estorno (para provar reversão integral)
  SELECT versao, entrega_encerrada INTO v_ver_before, v_ent_before FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  SELECT count(*) INTO v_ev_before FROM public.zoo_operacao_eventos WHERE operacao_id=v_op;
  -- (d)(e) executa e EXIGE falha pelo guard P1
  v_ok := false;
  BEGIN PERFORM public.oc_estornar_recebimento(v_op, v_cli, v_ver_before, 'T14/T15');
  EXCEPTION WHEN OTHERS THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T14 FAIL: P1 oficial deveria bloquear o estorno'; END IF;
  -- (f) prova de reversão integral:
  IF (SELECT count(*) FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id=m.movimentacao_id
        WHERE m.operacao_id=v_op AND l.cancelado IS TRUE) <> 0 THEN RAISE EXCEPTION 'T14 FAIL: algum lancamento ficou cancelado'; END IF;
  IF (SELECT count(*) FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id=m.movimentacao_id
        WHERE m.operacao_id=v_op AND l.cancelado IS NOT TRUE) <> 2 THEN RAISE EXCEPTION 'T15 FAIL: as 2 movs deveriam seguir ativas'; END IF;
  IF (SELECT entrega_encerrada FROM public.zoo_operacoes_comerciais WHERE id=v_op) IS DISTINCT FROM v_ent_before THEN
    RAISE EXCEPTION 'T14 FAIL: entrega_encerrada nao voltou ao estado anterior'; END IF;
  IF (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> v_ver_before THEN
    RAISE EXCEPTION 'T14 FAIL: versao foi alterada'; END IF;
  IF (SELECT count(*) FROM public.zoo_operacao_eventos WHERE operacao_id=v_op) <> v_ev_before THEN
    RAISE EXCEPTION 'T14 FAIL: evento granular/consolidado persistiu apos rollback'; END IF;

  -- ===== T16 — caso Carlinhos sintético =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-20','programada',false,7,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',7,'total',27000,1) RETURNING id INTO v_lote;
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-21', 'garrotes', 7, NULL, NULL, v_tag);
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  PERFORM public.oc_encerrar_entrega(v_op, v_cli, v_ver, 'encerra carlinhos');
  SELECT count(*) INTO v_nmov_before FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_estornar_recebimento(v_op, v_cli, v_ver, 'estorno carlinhos');
  IF (v_res->>'movimentacoes_estornadas')::int <> 1 OR (v_res->>'quantidade_estornada')::numeric <> 7 THEN RAISE EXCEPTION 'T16 FAIL: qtd'; END IF;
  IF (SELECT qtd_recebida FROM public.vw_oc_lotes_recebimento WHERE operacao_id=v_op AND lote_id=v_lote) <> 0
     OR (SELECT diferenca FROM public.vw_oc_lotes_recebimento WHERE operacao_id=v_op AND lote_id=v_lote) <> 7 THEN RAISE EXCEPTION 'T16 FAIL: view'; END IF;
  IF (SELECT count(*) FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op) <> v_nmov_before THEN RAISE EXCEPTION 'T16 FAIL: link deletado'; END IF;

  -- ===== T17 — helpers internos SEM EXECUTE p/ PUBLIC/anon/authenticated/service_role (só owner/definer) =====
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
                    unnest(coalesce(p.proacl, ARRAY[]::aclitem[])) a
              WHERE n.nspname='public' AND p.proname IN ('_oc_estorno_mov','_oc_estorno_reabrir_entrega')
                AND (a::text LIKE 'authenticated=%' OR a::text LIKE 'anon=%'
                     OR a::text LIKE 'service_role=%' OR a::text LIKE '=%')) THEN   -- '=%' = grant a PUBLIC
    RAISE EXCEPTION 'T17 FAIL: helper interno com grant indevido (PUBLIC/anon/authenticated/service_role)';
  END IF;

  RAISE NOTICE 'PR-OC-ESTORNO-RECEBIMENTO-01: PASS';
END $t$;

ROLLBACK;

-- T18 — resíduo zero após ROLLBACK (operações + fazenda/pasto sintéticos da fixture P1).
SELECT (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.er_tag'))
     + (SELECT count(*) FROM public.fazendas WHERE nome = current_setting('app.er_tag'))
     + (SELECT count(*) FROM public.pastos  WHERE nome = current_setting('app.er_tag')) AS residuo_total;
