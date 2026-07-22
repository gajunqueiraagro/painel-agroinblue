-- PR-OC-RECEB-01 — recebimento por lote (schema + RPCs). BEGIN...ROLLBACK; NADA persiste.
--   Requer aplicada a migration 20260722200000_pr_oc_receb_01_recebimento_por_lote.sql.
--   Fixture: tenant real admin + fazenda/fornecedor existentes do cliente.
SELECT set_config('app.ocreceb_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_faz uuid; v_forn uuid;
  v_op uuid; v_v int; v_res jsonb;
  v_lote1 uuid; v_lote2 uuid; v_link1 uuid;
  v_est text; v_rec int; v_dif int; v_cnt int; v_qneg int; v_ok boolean;
  v_opC uuid; v_vC int; v_loteC uuid;   -- cenário C (recebimentos múltiplos no mesmo lote)
  v_opD uuid; v_vD int;                 -- cenário D (máquina de estados oc_salvar_rascunho multilote)
BEGIN
  v_tag := current_setting('app.ocreceb_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SELECT id INTO v_faz  FROM public.fazendas WHERE cliente_id=v_cli AND tem_pecuaria IS NOT FALSE ORDER BY id LIMIT 1;
  SELECT id INTO v_forn FROM public.financeiro_fornecedores WHERE cliente_id=v_cli ORDER BY id LIMIT 1;
  IF v_faz IS NULL OR v_forn IS NULL THEN RAISE EXCEPTION 'fixture: sem fazenda/fornecedor'; END IF;

  -- Identificação: multilote => permanece rascunho (negociação vem dos lotes).
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
    'tipo_operacao','compra','data_operacao','2026-08-01','fazenda_id',v_faz::text,'contraparte_id',v_forn::text,'observacoes',v_tag));
  v_op := (v_res->>'operacao_id')::uuid; v_v := (v_res->>'versao')::int;
  IF NOT (v_res->>'rascunho')::boolean THEN RAISE EXCEPTION 'SETUP FAIL: identificacao deveria ficar rascunho'; END IF;

  -- Lotes: L1 100 (kg), L2 60 (cabeca). oc_salvar_lotes agrega qtd_negociada=160 + valor_acordado
  --   E recomputa a máquina de estados multilote => rascunho=false (T1b).
  v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
    jsonb_build_object('ordem',1,'categoria_negociada','boi_magro','qtd_negociada',100,'peso_medio_negociado_kg',400,'criterio_valor','kg','valor_informado',12),
    jsonb_build_object('ordem',2,'categoria_negociada','garrote','qtd_negociada',60,'criterio_valor','cabeca','valor_informado',3000)));
  v_v := (v_res->>'versao')::int;
  IF (v_res->>'qtd_negociada')::int <> 160 THEN RAISE EXCEPTION 'T1 FAIL rollup qtd=%', v_res->>'qtd_negociada'; END IF;
  IF (v_res->>'rascunho')::boolean THEN RAISE EXCEPTION 'T1b FAIL: multilote completo nao saiu do rascunho'; END IF;
  SELECT qtd_negociada, rascunho INTO v_qneg, v_ok FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  IF v_qneg <> 160 OR v_ok THEN RAISE EXCEPTION 'T1 FAIL persistido qtd=% rascunho=%',v_qneg,v_ok; END IF;
  SELECT id INTO v_lote1 FROM public.zoo_operacao_lotes WHERE operacao_id=v_op AND ordem=1;
  SELECT id INTO v_lote2 FROM public.zoo_operacao_lotes WHERE operacao_id=v_op AND ordem=2;
  RAISE NOTICE 'T1 PASS (rollup 160 + rascunho=false)';

  -- T2: oc_confirmar aceita multilote (EXISTS lote qtd>0) => fechada.
  v_res := public.oc_confirmar(v_op, v_cli, v_v);
  IF (v_res->>'status_comercial') <> 'fechada' THEN RAISE EXCEPTION 'T2 FAIL confirmar=%', v_res; END IF;
  v_v := (v_res->>'versao')::int;
  RAISE NOTICE 'T2 PASS (confirmar multilote)';

  -- T3: fechada bloqueia oc_salvar_lotes.
  BEGIN
    PERFORM public.oc_salvar_lotes(v_op, v_cli, v_v, '[]'::jsonb);
    RAISE EXCEPTION 'T3 FAIL salvar_lotes aceito em fechada';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T3 SQLSTATE %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T3 PASS';

  -- T4: oc_receber_lotes batch "conforme negociado" (L1=100, L2=60) => 2 movimentações.
  v_res := public.oc_receber_lotes(v_op, v_cli, v_v, jsonb_build_array(
    jsonb_build_object('lote_id',v_lote1::text,'data','2026-08-05','categoria','boi_magro','quantidade',100,'peso_medio_kg',402),
    jsonb_build_object('lote_id',v_lote2::text,'data','2026-08-05','categoria','garrote','quantidade',60)));
  IF (v_res->>'recebidos')::int <> 2 THEN RAISE EXCEPTION 'T4 FAIL recebidos=%', v_res->>'recebidos'; END IF;
  v_v := (v_res->>'versao')::int;
  -- cálculo por lote: ambos completos
  SELECT estado_recebimento, qtd_recebida, diferenca INTO v_est, v_rec, v_dif FROM public.vw_oc_lotes_recebimento WHERE lote_id=v_lote1;
  IF v_est<>'completo' OR v_rec<>100 OR v_dif<>0 THEN RAISE EXCEPTION 'T4 FAIL L1 est=% rec=% dif=%',v_est,v_rec,v_dif; END IF;
  SELECT estado_recebimento INTO v_est FROM public.vw_oc_lotes_recebimento WHERE lote_id=v_lote2;
  IF v_est<>'completo' THEN RAISE EXCEPTION 'T4 FAIL L2 est=%',v_est; END IF;
  RAISE NOTICE 'T4 PASS (batch conforme negociado, completos)';

  -- T5: guarda anti re-negociação — reabre e tenta salvar lotes => P0001 (há movimentação).
  v_res := public.oc_reabrir(v_op, v_cli, v_v, 'teste');
  v_v := (v_res->>'versao')::int;
  BEGIN
    PERFORM public.oc_salvar_lotes(v_op, v_cli, v_v, '[]'::jsonb);
    RAISE EXCEPTION 'T5 FAIL re-negociacao aceita com movimentacao';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T5 SQLSTATE %',SQLSTATE; END IF; END;
  -- confirma de novo para seguir
  v_res := public.oc_confirmar(v_op, v_cli, v_v); v_v := (v_res->>'versao')::int;
  RAISE NOTICE 'T5 PASS (guarda re-negociacao)';

  -- T6: estorno append-only — cancela lançamento; recebida do L1 volta a 0; link mantido.
  SELECT id INTO v_link1 FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op AND operacao_lote_id=v_lote1 LIMIT 1;
  v_res := public.oc_estornar_movimentacao(v_link1, v_cli, 'teste estorno '||v_tag);
  SELECT estado_recebimento, qtd_recebida INTO v_est, v_rec FROM public.vw_oc_lotes_recebimento WHERE lote_id=v_lote1;
  IF v_est<>'nao_iniciado' OR v_rec<>0 THEN RAISE EXCEPTION 'T6 FAIL pos-estorno est=% rec=%',v_est,v_rec; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_movimentacoes WHERE id=v_link1;  -- link preservado
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T6 FAIL link removido'; END IF;
  RAISE NOTICE 'T6 PASS (estorno append-only, link mantido)';

  -- T7: batch atômico — item invalido (lote alheio) aborta TUDO (nenhum insert do batch).
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op;
  BEGIN
    PERFORM public.oc_receber_lotes(v_op, v_cli, v_v, jsonb_build_array(
      jsonb_build_object('lote_id',v_lote2::text,'categoria','garrote','quantidade',10),
      jsonb_build_object('lote_id',gen_random_uuid()::text,'categoria','x','quantidade',5)));  -- lote alheio
    RAISE EXCEPTION 'T7 FAIL batch com item invalido aceito';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0002' THEN RAISE EXCEPTION 'T7 SQLSTATE %',SQLSTATE; END IF; END;
  IF (SELECT count(*) FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op) <> v_cnt THEN
    RAISE EXCEPTION 'T7 FAIL insert parcial (antes=% depois=%)', v_cnt, (SELECT count(*) FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op); END IF;
  RAISE NOTICE 'T7 PASS (batch tudo-ou-nada)';

  -- T8: payload vazio, lote duplicado, versao divergente.
  BEGIN PERFORM public.oc_receber_lotes(v_op, v_cli, v_v, '[]'::jsonb); RAISE EXCEPTION 'T8 FAIL vazio';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T8a SQLSTATE %',SQLSTATE; END IF; END;
  BEGIN PERFORM public.oc_receber_lotes(v_op, v_cli, v_v, jsonb_build_array(
      jsonb_build_object('lote_id',v_lote2::text,'quantidade',5),
      jsonb_build_object('lote_id',v_lote2::text,'quantidade',5)));
    RAISE EXCEPTION 'T8 FAIL dup lote';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T8b SQLSTATE %',SQLSTATE; END IF; END;
  BEGIN PERFORM public.oc_receber_lotes(v_op, v_cli, v_v - 1, jsonb_build_array(
      jsonb_build_object('lote_id',v_lote2::text,'quantidade',5)));
    RAISE EXCEPTION 'T8 FAIL versao';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'40001' THEN RAISE EXCEPTION 'T8c SQLSTATE %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T8 PASS (vazio/dup/versao)';

  -- T9: encerrar entrega e verificar que estorno passa a ser vedado.
  v_res := public.oc_encerrar_entrega(v_op, v_cli, v_v, 'diferenca ok '||v_tag);
  v_v := (v_res->>'versao')::int;
  SELECT id INTO v_link1 FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op AND operacao_lote_id=v_lote2 LIMIT 1;
  BEGIN
    PERFORM public.oc_estornar_movimentacao(v_link1, v_cli, 'tarde demais');
    RAISE EXCEPTION 'T9 FAIL estorno pos-encerramento aceito';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T9 SQLSTATE %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T9 PASS (estorno vedado pos-encerramento)';

  -- ===== Cenário C: recebimentos múltiplos no MESMO lote + "receber todos" usa o saldo pendente =====
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
    'tipo_operacao','compra','data_operacao','2026-08-01','fazenda_id',v_faz::text,'contraparte_id',v_forn::text,'observacoes',v_tag));
  v_opC := (v_res->>'operacao_id')::uuid; v_vC := (v_res->>'versao')::int;
  v_res := public.oc_salvar_lotes(v_opC, v_cli, v_vC, jsonb_build_array(
    jsonb_build_object('ordem',1,'categoria_negociada','boi_magro','qtd_negociada',40,'criterio_valor','cabeca','valor_informado',3000)));
  v_vC := (v_res->>'versao')::int;
  IF (v_res->>'rascunho')::boolean THEN RAISE EXCEPTION 'C FAIL rascunho pos-lotes'; END IF;
  SELECT id INTO v_loteC FROM public.zoo_operacao_lotes WHERE operacao_id=v_opC AND ordem=1;
  v_res := public.oc_confirmar(v_opC, v_cli, v_vC); v_vC := (v_res->>'versao')::int;
  -- 1º e 2º recebimentos parciais de 15 (botão "Receber" por lote)
  PERFORM public.oc_registrar_movimentacao(v_opC, v_cli, v_loteC, current_date, 'boi_magro', 15, NULL, NULL, NULL);
  PERFORM public.oc_registrar_movimentacao(v_opC, v_cli, v_loteC, current_date, 'boi_magro', 15, NULL, NULL, NULL);
  SELECT estado_recebimento, qtd_recebida, diferenca INTO v_est, v_rec, v_dif FROM public.vw_oc_lotes_recebimento WHERE lote_id=v_loteC;
  IF v_est<>'parcial' OR v_rec<>30 OR v_dif<>10 THEN RAISE EXCEPTION 'C FAIL apos 15+15 %/%/%',v_est,v_rec,v_dif; END IF;
  -- "Receber todos conforme negociado" usa o SALDO PENDENTE (diferenca=10), NÃO repete 40.
  v_res := public.oc_receber_lotes(v_opC, v_cli, v_vC, jsonb_build_array(
    jsonb_build_object('lote_id',v_loteC::text,'categoria','boi_magro',
      'quantidade', (SELECT diferenca FROM public.vw_oc_lotes_recebimento WHERE lote_id=v_loteC))));
  v_vC := (v_res->>'versao')::int;
  SELECT estado_recebimento, qtd_recebida, diferenca INTO v_est, v_rec, v_dif FROM public.vw_oc_lotes_recebimento WHERE lote_id=v_loteC;
  IF v_est<>'completo' OR v_rec<>40 OR v_dif<>0 THEN RAISE EXCEPTION 'C FAIL final %/%/%',v_est,v_rec,v_dif; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id=m.movimentacao_id
    WHERE m.operacao_lote_id=v_loteC AND l.cancelado IS NOT TRUE;
  IF v_cnt<>3 THEN RAISE EXCEPTION 'C FAIL movimentacoes=% (esperado 3)',v_cnt; END IF;
  RAISE NOTICE 'CENARIO C PASS (15+15+10=40 completo, 3 movimentacoes no lote)';

  -- ===== Cenário D: máquina de estados de oc_salvar_rascunho no modelo MULTILOTE =====
  -- identificação => rascunho=true
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
    'tipo_operacao','compra','data_operacao','2026-08-01','fazenda_id',v_faz::text,'contraparte_id',v_forn::text,'observacoes',v_tag));
  v_opD := (v_res->>'operacao_id')::uuid; v_vD := (v_res->>'versao')::int;
  IF NOT (v_res->>'rascunho')::boolean THEN RAISE EXCEPTION 'D FAIL: identificacao deveria ficar rascunho'; END IF;
  -- salvar lote válido => rascunho=false
  v_res := public.oc_salvar_lotes(v_opD, v_cli, v_vD, jsonb_build_array(
    jsonb_build_object('ordem',1,'categoria_negociada','boi_magro','qtd_negociada',30,'criterio_valor','cabeca','valor_informado',2500)));
  v_vD := (v_res->>'versao')::int;
  IF (v_res->>'rascunho')::boolean THEN RAISE EXCEPTION 'D FAIL: multilote nao saiu do rascunho'; END IF;
  -- editar campo PERMITIDO (observacoes) via oc_salvar_rascunho => rascunho CONTINUA false
  v_res := public.oc_salvar_rascunho(v_opD, v_cli, v_vD, jsonb_build_object('observacoes', v_tag||'-edit'));
  v_vD := (v_res->>'versao')::int;
  IF (v_res->>'rascunho')::boolean THEN RAISE EXCEPTION 'D FAIL: editar identificacao reverteu rascunho (multilote nao reconhecido)'; END IF;
  -- retirar requisito obrigatório (contraparte_id vazio) => rascunho=true
  v_res := public.oc_salvar_rascunho(v_opD, v_cli, v_vD, jsonb_build_object('contraparte_id',''));
  IF NOT (v_res->>'rascunho')::boolean THEN RAISE EXCEPTION 'D FAIL: sem contraparte deveria virar rascunho'; END IF;
  RAISE NOTICE 'CENARIO D PASS (rascunho estavel na edicao; volta a rascunho ao remover requisito)';

  RAISE NOTICE 'PR-OC-RECEB-01: T1..T9 + Cenario C + Cenario D OK';
END $t$;

ROLLBACK;

-- Resíduo zero (tag sobrevive ao rollback).
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT
    (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.ocreceb_tag'))
  + (SELECT count(*) FROM public.lancamentos WHERE observacao = current_setting('app.ocreceb_tag'))
    INTO v_leak;
  IF v_leak <> 0 THEN RAISE EXCEPTION 'POST FAIL: % linhas vazaram', v_leak; END IF;
END $post$;

SELECT set_config('app.ocreceb_tag', '', false) AS run_tag_reset;
