-- PR-OC-CANCEL-GUARD-01 — testes sintéticos da guarda de integridade em public.oc_cancelar.
--   Valida: cancela SÓ sem efeito downstream ATIVO; bloqueia (P0001) com movimentação/título/liquidação
--   ativa SEM alterar nenhuma linha; título ativo INDEPENDE de parte.cancelada (só fl.cancelado inativa);
--   efeitos oficialmente inativados não bloqueiam; tenant/motivo/version-lock/idempotência preservados.
--   Requer aplicadas: 20260805120000 (esta guarda), 20260804120000/…/20260803130000 (writers OC + estrutura),
--   20260722200000 (recebimento). Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + resíduo zero (T10).
SELECT set_config('app.cg_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_fA uuid; v_faz uuid; v_sub_ani text;
  v_op uuid; v_lote uuid; v_ver int; v_res jsonb; v_ok boolean;
  v_comp uuid; v_prog uuid; v_parc uuid; v_tit uuid; v_parte uuid; v_movlink uuid;
BEGIN
  v_tag := current_setting('app.cg_tag');
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

  -- Helpers locais reutilizados por vários T: criar OP compra 'programada'.
  -- (inline via INSERT abaixo; sem função — DO block.)

  -- =========================================================================================
  -- Op A: SEM downstream — T9/T7/T8 (guards) + T1 (cancela) + T6 (idempotência).
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-01','programada',false,7,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;

  v_ok := false;   -- T9 motivo vazio
  BEGIN PERFORM public.oc_cancelar(v_op, v_cli, v_ver, '   ');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T9 FAIL: esperava P0001 (motivo vazio)'; END IF;

  v_ok := false;   -- T7 conflito de versão
  BEGIN PERFORM public.oc_cancelar(v_op, v_cli, v_ver + 99, 'motivo t7');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='40001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T7 FAIL: esperava 40001'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);   -- T8 outro tenant
  v_ok := false;
  BEGIN PERFORM public.oc_cancelar(v_op, v_cli, v_ver, 'motivo t8');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='42501' THEN v_ok := true; END IF; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  IF NOT v_ok THEN RAISE EXCEPTION 'T8 FAIL: esperava 42501'; END IF;

  v_res := public.oc_cancelar(v_op, v_cli, v_ver, 'cancelamento T1');   -- T1 cancela
  IF (v_res->>'status_comercial') <> 'cancelada' OR (v_res->>'versao')::int <> v_ver + 1 THEN RAISE EXCEPTION 'T1 FAIL'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_eventos WHERE operacao_id=v_op AND acao='cancelar') THEN RAISE EXCEPTION 'T1 FAIL: evento'; END IF;

  v_res := public.oc_cancelar(v_op, v_cli, 0, 'motivo t6');   -- T6 idempotência
  IF (v_res->>'idempotente') <> 'true' THEN RAISE EXCEPTION 'T6 FAIL'; END IF;

  -- =========================================================================================
  -- Op B: MOVIMENTAÇÃO ativa — T2 bloqueia (nenhuma linha alterada).
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-05','programada',false,5,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',5,'total',20000,1) RETURNING id INTO v_lote;
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-10', 'garrotes', 5, NULL, NULL, v_tag);
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok := false;
  BEGIN PERFORM public.oc_cancelar(v_op, v_cli, v_ver, 'cancelar B');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T2 FAIL: mov ativa deveria bloquear'; END IF;
  IF (SELECT status_comercial FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> 'programada'
     OR (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> v_ver THEN RAISE EXCEPTION 'T2 FAIL: operacao alterada'; END IF;

  -- =========================================================================================
  -- Op C: TÍTULO materializado — T3 (parte ativa+título ativo) e T3b (parte CANCELADA+título ativo) BLOQUEIAM.
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-08','programada',false,4,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',4,'total',20000,1) RETURNING id INTO v_lote;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_fA,'subcentro',v_sub_ani,'lote_id',v_lote,'valor_total',20000));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',20000))));
  v_prog := (v_res->'programacao'->>'id')::uuid; v_parc := ((v_res->'parcelas')->0->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  v_tit := (v_res->'titulo'->>'id')::uuid; v_parte := (v_res->'parte'->>'id')::uuid;
  IF v_tit IS NULL OR v_parte IS NULL THEN RAISE EXCEPTION 'fixture C: sem titulo/parte'; END IF;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;

  v_ok := false;   -- T3 parte ativa + título ativo -> bloqueia
  BEGIN PERFORM public.oc_cancelar(v_op, v_cli, v_ver, 'cancelar C-T3');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T3 FAIL: titulo ativo (parte ativa) deveria bloquear'; END IF;

  UPDATE public.zoo_operacao_partes SET cancelada=true WHERE id=v_parte;   -- parte CANCELADA, título AINDA ativo
  v_ok := false;   -- T3b parte cancelada + título ativo -> AINDA bloqueia (endurecimento)
  BEGIN PERFORM public.oc_cancelar(v_op, v_cli, v_ver, 'cancelar C-T3b');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T3b FAIL: titulo ativo com parte cancelada deveria bloquear'; END IF;
  IF (SELECT status_comercial FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> 'programada' THEN RAISE EXCEPTION 'T3b FAIL: operacao alterada'; END IF;

  -- =========================================================================================
  -- Op C2: TÍTULO cancelado (parte ativa) — T3c NÃO bloqueia por título -> cancela.
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
  v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  v_tit := (v_res->'titulo'->>'id')::uuid;
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true WHERE id=v_tit;   -- título oficialmente inativo (parte ativa)
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_cancelar(v_op, v_cli, v_ver, 'cancelar C2-T3c');
  IF (v_res->>'status_comercial') <> 'cancelada' THEN RAISE EXCEPTION 'T3c FAIL: titulo cancelado nao deveria bloquear'; END IF;

  -- =========================================================================================
  -- Op C3: parte cancelada + título cancelado — T3d NÃO bloqueia -> cancela.
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
  v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  v_tit := (v_res->'titulo'->>'id')::uuid; v_parte := (v_res->'parte'->>'id')::uuid;
  UPDATE public.zoo_operacao_partes SET cancelada=true WHERE id=v_parte;
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true WHERE id=v_tit;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_cancelar(v_op, v_cli, v_ver, 'cancelar C3-T3d');
  IF (v_res->>'status_comercial') <> 'cancelada' THEN RAISE EXCEPTION 'T3d FAIL: parte+titulo cancelados nao deveriam bloquear'; END IF;

  -- =========================================================================================
  -- Op D: LIQUIDAÇÃO ativa — T4 bloqueia (nenhuma linha alterada).
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-11','programada',false,3,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id, operacao_id, data, natureza, forma, valor)
    VALUES (v_cli, v_op, DATE '2026-07-12', 'pagamento', 'dinheiro', 1000);
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok := false;
  BEGIN PERFORM public.oc_cancelar(v_op, v_cli, v_ver, 'cancelar D');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T4 FAIL: liquidacao ativa deveria bloquear'; END IF;
  IF (SELECT status_comercial FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> 'programada'
     OR (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> v_ver THEN RAISE EXCEPTION 'T4 FAIL: operacao alterada'; END IF;

  -- =========================================================================================
  -- T5a — movimentação com lancamentos.cancelado=true (estorno oficial) NÃO bloqueia -> cancela.
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-13','programada',false,5,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',5,'total',20000,1) RETURNING id INTO v_lote;
  v_res := public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-14', 'garrotes', 5, NULL, NULL, v_tag);
  v_movlink := (v_res->>'movimentacao_id')::uuid;
  PERFORM public.oc_estornar_movimentacao(v_movlink, v_cli, 'estorno teste T5a');   -- lancamentos.cancelado=true
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_cancelar(v_op, v_cli, v_ver, 'cancelar T5a');
  IF (v_res->>'status_comercial') <> 'cancelada' THEN RAISE EXCEPTION 'T5a FAIL: mov estornada nao deveria bloquear'; END IF;

  -- =========================================================================================
  -- T5b — liquidação estornada=true NÃO bloqueia -> cancela.
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-15','programada',false,3,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id, operacao_id, data, natureza, forma, valor, estornado)
    VALUES (v_cli, v_op, DATE '2026-07-15', 'pagamento', 'dinheiro', 500, true);
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_cancelar(v_op, v_cli, v_ver, 'cancelar T5b');
  IF (v_res->>'status_comercial') <> 'cancelada' THEN RAISE EXCEPTION 'T5b FAIL: liquidacao estornada nao deveria bloquear'; END IF;

  RAISE NOTICE 'PR-OC-CANCEL-GUARD-01: T1..T9 (incl. T3/T3b/T3c/T3d, T5a/T5b) PASS';
END $t$;

ROLLBACK;

-- T10 — resíduo zero após ROLLBACK (tag de sessão sobrevive ao rollback).
SELECT count(*) AS residuo_operacoes FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.cg_tag');
