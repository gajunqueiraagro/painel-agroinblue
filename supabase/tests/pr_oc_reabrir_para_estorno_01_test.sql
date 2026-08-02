-- PR-OC-REABRIR-PARA-ESTORNO-01 — testes sintéticos de public.oc_reabrir_para_estorno (T1..T15).
--   Valida: recupera OC cancelada COM efeito ativo restaurando o status soberano do último evento 'cancelar';
--   admin-only; version-lock; exige status='cancelada' + efeito ativo; nada downstream é tocado; metadados de
--   cancelamento limpos do estado vivo e preservados no evento; estorno_id gerado; guards completos.
--   Como o guard bloqueia oc_cancelar com efeitos ativos, o fixture SIMULA o cancelamento legado (evento
--   'cancelar' com dados_anteriores + UPDATE direto para 'cancelada').
--   Requer aplicadas: 20260806120000 (este writer), 20260805120000 (guard), 20260803180000/…/130000, 20260722200000.
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + resíduo zero (T15).
SELECT set_config('app.rpe_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_fA uuid; v_faz uuid; v_sub_ani text;
  v_op uuid; v_lote uuid; v_ver int; v_res jsonb; v_ok boolean;
  v_comp uuid; v_prog uuid; v_parc uuid; v_tit uuid; v_parte uuid;
  v_npart int; v_ntit int; v_titval numeric; v_estorno_id text; v_ev jsonb;
BEGIN
  v_tag := current_setting('app.rpe_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  SELECT id INTO v_fA  FROM public.financeiro_fornecedores WHERE cliente_id=v_cli ORDER BY nome LIMIT 1;
  SELECT id INTO v_faz FROM public.fazendas WHERE cliente_id=v_cli ORDER BY id LIMIT 1;
  IF v_fA IS NULL OR v_faz IS NULL THEN RAISE EXCEPTION 'fixture: fornecedor/fazenda ausente'; END IF;
  SELECT pc.subcentro INTO v_sub_ani FROM public.financeiro_plano_contas pc
   WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id=v_cli) AND pc.subcentro ILIKE '%Compra Bovinos Machos%'
     AND 1=(SELECT count(*) FROM public.financeiro_plano_contas p2 WHERE p2.ativo IS TRUE AND (p2.cliente_id IS NULL OR p2.cliente_id=v_cli) AND p2.subcentro IS NOT DISTINCT FROM pc.subcentro) LIMIT 1;
  IF v_sub_ani IS NULL THEN RAISE EXCEPTION 'fixture: subcentro animais único ausente'; END IF;

  -- =========================================================================================
  -- T1 — cancelada com MOVIMENTAÇÃO ativa -> restaura status anterior (programada).
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-01','programada',false,5,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',5,'total',20000,1) RETURNING id INTO v_lote;
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-05', 'garrotes', 5, NULL, NULL, v_tag);
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
    SELECT v_cli, v_op, 'cancelar', to_jsonb(o), jsonb_build_object('motivo','cancel legado T1'), v_admin, 'rpc' FROM public.zoo_operacoes_comerciais o WHERE o.id=v_op;
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), cancelado_por=v_admin, cancelado_motivo='cancel legado T1', versao=versao+1 WHERE id=v_op;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_reabrir_para_estorno(v_op, v_cli, v_ver, 'reabrir para estorno T1');
  IF (v_res->>'status_comercial') <> 'programada' THEN RAISE EXCEPTION 'T1 FAIL: nao restaurou programada'; END IF;

  -- =========================================================================================
  -- T2 — cancelada com TÍTULO ativo (status anterior FECHADA) -> restaura fechada.
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-02','programada',false,4,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',4,'total',20000,1) RETURNING id INTO v_lote;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_fA,'subcentro',v_sub_ani,'lote_id',v_lote,'valor_total',20000));
  v_comp := (v_res->'compromisso'->>'id')::uuid; SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',20000))));
  v_prog := (v_res->'programacao'->>'id')::uuid; v_parc := ((v_res->'parcelas')->0->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  v_tit := (v_res->'titulo'->>'id')::uuid;
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='fechada' WHERE id=v_op;   -- pré-cancel = fechada
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
    SELECT v_cli, v_op, 'cancelar', to_jsonb(o), jsonb_build_object('motivo','cancel legado T2'), v_admin, 'rpc' FROM public.zoo_operacoes_comerciais o WHERE o.id=v_op;
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), cancelado_por=v_admin, cancelado_motivo='cancel legado T2', versao=versao+1 WHERE id=v_op;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_reabrir_para_estorno(v_op, v_cli, v_ver, 'reabrir T2');
  IF (v_res->>'status_comercial') <> 'fechada' THEN RAISE EXCEPTION 'T2 FAIL: nao restaurou fechada'; END IF;

  -- =========================================================================================
  -- T3 — cancelada com LIQUIDAÇÃO ativa -> restaura programada.
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-03','programada',false,3,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id, operacao_id, data, natureza, forma, valor)
    VALUES (v_cli, v_op, DATE '2026-07-04', 'pagamento', 'dinheiro', 1000);
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
    SELECT v_cli, v_op, 'cancelar', to_jsonb(o), jsonb_build_object('motivo','cancel legado T3'), v_admin, 'rpc' FROM public.zoo_operacoes_comerciais o WHERE o.id=v_op;
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), cancelado_por=v_admin, cancelado_motivo='cancel legado T3', versao=versao+1 WHERE id=v_op;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_reabrir_para_estorno(v_op, v_cli, v_ver, 'reabrir T3');
  IF (v_res->>'status_comercial') <> 'programada' THEN RAISE EXCEPTION 'T3 FAIL'; END IF;

  -- =========================================================================================
  -- Op X (título, cancelada) — T4 preserva downstream, T5 metadados, T6 versão+1, T7 evento/estorno_id.
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-06','programada',false,4,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',4,'total',20000,1) RETURNING id INTO v_lote;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_fA,'subcentro',v_sub_ani,'lote_id',v_lote,'valor_total',20000));
  v_comp := (v_res->'compromisso'->>'id')::uuid; SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',20000))));
  v_prog := (v_res->'programacao'->>'id')::uuid; v_parc := ((v_res->'parcelas')->0->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  v_tit := (v_res->'titulo'->>'id')::uuid; v_parte := (v_res->'parte'->>'id')::uuid;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
    SELECT v_cli, v_op, 'cancelar', to_jsonb(o), jsonb_build_object('motivo','cancel legado X'), v_admin, 'rpc' FROM public.zoo_operacoes_comerciais o WHERE o.id=v_op;
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), cancelado_por=v_admin, cancelado_motivo='cancel legado X', versao=versao+1 WHERE id=v_op;
  SELECT count(*) INTO v_npart FROM public.zoo_operacao_partes WHERE operacao_id=v_op;
  SELECT count(*) INTO v_ntit  FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND financeiro_lancamento_id IS NOT NULL;
  SELECT valor INTO v_titval FROM public.financeiro_lancamentos_v2 WHERE id=v_tit;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_reabrir_para_estorno(v_op, v_cli, v_ver, 'reabrir X');
  -- T4 downstream preservado
  IF (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id=v_op) <> v_npart
     OR (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND financeiro_lancamento_id IS NOT NULL) <> v_ntit
     OR (SELECT valor FROM public.financeiro_lancamentos_v2 WHERE id=v_tit) IS DISTINCT FROM v_titval THEN
    RAISE EXCEPTION 'T4 FAIL: downstream alterado'; END IF;
  IF (SELECT cancelado IS NOT TRUE FROM public.financeiro_lancamentos_v2 WHERE id=v_tit) IS NOT TRUE THEN RAISE EXCEPTION 'T4 FAIL: titulo mexido'; END IF;
  -- T5 metadados vivos limpos + preservados no evento
  IF (SELECT coalesce(cancelado_em::text,'')||coalesce(cancelado_por::text,'')||coalesce(cancelado_motivo,'') FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> '' THEN RAISE EXCEPTION 'T5 FAIL: metadados vivos nao limpos'; END IF;
  SELECT detalhes INTO v_ev FROM public.zoo_operacao_eventos WHERE operacao_id=v_op AND acao='reabrir_para_estorno' ORDER BY created_at DESC LIMIT 1;
  IF v_ev->'cancelamento_desfeito'->>'cancelado_motivo' <> 'cancel legado X' THEN RAISE EXCEPTION 'T5 FAIL: motivo do cancelamento nao preservado'; END IF;
  -- T6 versão +1
  IF (v_res->>'operacao_versao')::int <> v_ver + 1 OR (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> v_ver + 1 THEN RAISE EXCEPTION 'T6 FAIL: versao'; END IF;
  -- T7 evento + estorno_id coerentes
  v_estorno_id := v_res->>'estorno_id';
  IF v_estorno_id IS NULL OR v_ev->>'estorno_id' <> v_estorno_id THEN RAISE EXCEPTION 'T7 FAIL: estorno_id'; END IF;

  -- =========================================================================================
  -- T8 — operação NÃO cancelada -> P0001.
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-07','programada',false,3,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok := false;
  BEGIN PERFORM public.oc_reabrir_para_estorno(v_op, v_cli, v_ver, 'reabrir T8');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T8 FAIL: nao-cancelada deveria dar P0001'; END IF;

  -- =========================================================================================
  -- T9 — cancelada SEM efeitos ativos -> P0001.
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-08','programada',false,3,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
    SELECT v_cli, v_op, 'cancelar', to_jsonb(o), jsonb_build_object('motivo','cancel legado T9'), v_admin, 'rpc' FROM public.zoo_operacoes_comerciais o WHERE o.id=v_op;
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), cancelado_por=v_admin, cancelado_motivo='cancel legado T9', versao=versao+1 WHERE id=v_op;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok := false;
  BEGIN PERFORM public.oc_reabrir_para_estorno(v_op, v_cli, v_ver, 'reabrir T9');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T9 FAIL: cancelada sem efeitos deveria dar P0001'; END IF;

  -- =========================================================================================
  -- T10 — cancelada com título ativo mas SEM evento 'cancelar' -> P0001 (sem inferir status).
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-09','programada',false,4,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',4,'total',20000,1) RETURNING id INTO v_lote;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_fA,'subcentro',v_sub_ani,'lote_id',v_lote,'valor_total',20000));
  v_comp := (v_res->'compromisso'->>'id')::uuid; SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',20000))));
  v_prog := (v_res->'programacao'->>'id')::uuid; v_parc := ((v_res->'parcelas')->0->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  PERFORM public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), cancelado_por=v_admin, cancelado_motivo='sem evento T10', versao=versao+1 WHERE id=v_op;  -- SEM evento 'cancelar'
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok := false;
  BEGIN PERFORM public.oc_reabrir_para_estorno(v_op, v_cli, v_ver, 'reabrir T10');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T10 FAIL: sem evento cancelar deveria dar P0001'; END IF;

  -- =========================================================================================
  -- Op Y (título, cancelada com evento) — T11 motivo, T12 versão, T13 tenant, T14 dupla execução.
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-10','programada',false,4,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',4,'total',20000,1) RETURNING id INTO v_lote;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_fA,'subcentro',v_sub_ani,'lote_id',v_lote,'valor_total',20000));
  v_comp := (v_res->'compromisso'->>'id')::uuid; SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',20000))));
  v_prog := (v_res->'programacao'->>'id')::uuid; v_parc := ((v_res->'parcelas')->0->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  PERFORM public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
    SELECT v_cli, v_op, 'cancelar', to_jsonb(o), jsonb_build_object('motivo','cancel legado Y'), v_admin, 'rpc' FROM public.zoo_operacoes_comerciais o WHERE o.id=v_op;
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), cancelado_por=v_admin, cancelado_motivo='cancel legado Y', versao=versao+1 WHERE id=v_op;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;

  v_ok := false;   -- T11 motivo vazio
  BEGIN PERFORM public.oc_reabrir_para_estorno(v_op, v_cli, v_ver, '   ');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T11 FAIL'; END IF;

  v_ok := false;   -- T12 conflito de versão
  BEGIN PERFORM public.oc_reabrir_para_estorno(v_op, v_cli, v_ver + 99, 'motivo t12');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='40001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T12 FAIL'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);   -- T13 não-admin
  v_ok := false;
  BEGIN PERFORM public.oc_reabrir_para_estorno(v_op, v_cli, v_ver, 'motivo t13');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='42501' THEN v_ok := true; END IF; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  IF NOT v_ok THEN RAISE EXCEPTION 'T13 FAIL: nao-admin deveria dar 42501'; END IF;

  -- T14 dupla execução: 1ª OK -> status restaurado; 2ª -> P0001 (não mais cancelada)
  v_res := public.oc_reabrir_para_estorno(v_op, v_cli, v_ver, 'reabrir Y 1a');
  IF (v_res->>'status_comercial') NOT IN ('programada','fechada') THEN RAISE EXCEPTION 'T14 FAIL: 1a execucao'; END IF;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok := false;
  BEGIN PERFORM public.oc_reabrir_para_estorno(v_op, v_cli, v_ver, 'reabrir Y 2a');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T14 FAIL: dupla execucao deveria dar P0001'; END IF;

  RAISE NOTICE 'PR-OC-REABRIR-PARA-ESTORNO-01: T1..T14 PASS';
END $t$;

ROLLBACK;

-- T15 — resíduo zero após ROLLBACK (tag de sessão sobrevive ao rollback).
SELECT count(*) AS residuo_operacoes FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.rpe_tag');
