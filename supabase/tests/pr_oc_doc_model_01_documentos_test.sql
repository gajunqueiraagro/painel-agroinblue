-- PR-OC-DOC-MODEL-01 — modelo documental (documentos + componentes + lotes N:N + view).
--   BEGIN...ROLLBACK; NADA persiste. Requer aplicada a migration 20260722230000.
--   Fixture: tenant real admin + fazenda/fornecedor; operação com 2 lotes (via RPCs existentes).
SELECT set_config('app.ocdoc_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_faz uuid; v_forn uuid;
  v_op uuid; v_v int; v_res jsonb; v_l1 uuid; v_l2 uuid;
  v_doc uuid; v_comp uuid; v_situ text; v_liq numeric; v_acr numeric; v_ret numeric; v_desp numeric;
  v_cnt int; v_vdoc int;
BEGIN
  v_tag := current_setting('app.ocdoc_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SELECT id INTO v_faz  FROM public.fazendas WHERE cliente_id=v_cli AND tem_pecuaria IS NOT FALSE ORDER BY id LIMIT 1;
  SELECT id INTO v_forn FROM public.financeiro_fornecedores WHERE cliente_id=v_cli ORDER BY id LIMIT 1;

  -- Fixture: operação + 2 lotes.
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
    'tipo_operacao','compra','data_operacao','2026-08-01','fazenda_id',v_faz::text,'contraparte_id',v_forn::text,'observacoes',v_tag));
  v_op := (v_res->>'operacao_id')::uuid; v_v := (v_res->>'versao')::int;
  v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
    jsonb_build_object('ordem',1,'categoria_negociada','boi_magro','qtd_negociada',100,'criterio_valor','cabeca','valor_informado',3000),
    jsonb_build_object('ordem',2,'categoria_negociada','garrote','qtd_negociada',50,'criterio_valor','cabeca','valor_informado',3000)));
  SELECT id INTO v_l1 FROM public.zoo_operacao_lotes WHERE operacao_id=v_op AND ordem=1;
  SELECT id INTO v_l2 FROM public.zoo_operacao_lotes WHERE operacao_id=v_op AND ordem=2;

  -- ── T1: NF principal com componentes + 2 lotes; valor_liquido derivado; subtotais ──
  v_res := public.oc_documento_registrar(v_op, v_cli, jsonb_build_object(
    'especie','nf_principal','numero','1001','serie','1','data_emissao','2026-08-02','observacoes',v_tag,
    'componentes', jsonb_build_array(
      jsonb_build_object('tipo','valor_bruto','natureza','acrescimo','valor',100000,'ordem',1),
      jsonb_build_object('tipo','desconto','natureza','desconto_comercial','valor',1000,'ordem',2),
      jsonb_build_object('tipo','funrural','natureza','retencao_sem_caixa','valor',2000,'ordem',3),
      jsonb_build_object('tipo','frete','natureza','despesa_desembolso','valor',3000,'ordem',4),
      jsonb_build_object('tipo','peso_ref','natureza','informativo','valor',999,'ordem',5)),
    'lotes', jsonb_build_array(v_l1::text, v_l2::text)));
  v_doc := (v_res->>'documento_id')::uuid;
  SELECT valor_liquido, total_acrescimos, total_retencoes_sem_caixa, total_despesas_desembolso, situacao, qtd_lotes
    INTO v_liq, v_acr, v_ret, v_desp, v_situ, v_cnt FROM public.vw_oc_documentos WHERE documento_id=v_doc;
  IF v_liq <> 94000 THEN RAISE EXCEPTION 'T1 FAIL valor_liquido=% (esperado 94000)', v_liq; END IF;   -- 100000-1000-2000-3000
  IF v_acr <> 100000 OR v_ret <> 2000 OR v_desp <> 3000 THEN RAISE EXCEPTION 'T1 FAIL subtotais %/%/%',v_acr,v_ret,v_desp; END IF;
  IF v_situ <> 'ativo' OR v_cnt <> 2 THEN RAISE EXCEPTION 'T1 FAIL situacao=% lotes=%',v_situ,v_cnt; END IF;
  RAISE NOTICE 'T1 PASS (liquido 94000, informativo ignorado, 2 lotes)';

  -- ── T2: N:N — mesmo lote em outro documento (outro) ──
  v_res := public.oc_documento_registrar(v_op, v_cli, jsonb_build_object(
    'especie','outro','numero','REC-1','observacoes',v_tag,
    'componentes', jsonb_build_array(jsonb_build_object('tipo','outros','natureza','informativo','valor',0,'ordem',1)),
    'lotes', jsonb_build_array(v_l1::text)));   -- L1 já vinculado ao doc anterior => N:N ok
  IF (v_res->>'documento_id') IS NULL THEN RAISE EXCEPTION 'T2 FAIL'; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_documento_lotes WHERE operacao_lote_id=v_l1;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'T2 FAIL L1 em % documentos (esperado 2)',v_cnt; END IF;
  RAISE NOTICE 'T2 PASS (lote em 2 documentos)';

  -- ── T3: complementar aponta origem; não sobrescreve; registra diferença via componentes ──
  v_res := public.oc_documento_registrar(v_op, v_cli, jsonb_build_object(
    'especie','nf_complementar','numero','1001-C','documento_origem_id',v_doc::text,'observacoes',v_tag,
    'componentes', jsonb_build_array(jsonb_build_object('tipo','valor_bruto','natureza','acrescimo','valor',5000,'ordem',1)),
    'lotes', jsonb_build_array(v_l2::text)));
  IF (v_res->>'especie') <> 'nf_complementar' THEN RAISE EXCEPTION 'T3 FAIL especie'; END IF;
  -- origem intacta (ainda 94000, ativa)
  SELECT valor_liquido, situacao INTO v_liq, v_situ FROM public.vw_oc_documentos WHERE documento_id=v_doc;
  IF v_liq <> 94000 OR v_situ <> 'ativo' THEN RAISE EXCEPTION 'T3 FAIL origem alterada %/%',v_liq,v_situ; END IF;
  RAISE NOTICE 'T3 PASS (complementar novo doc, origem intacta)';

  -- ── T4: complementar sem origem => erro; origem em não-complementar => erro; origem cancelada/alheia => erro ──
  BEGIN PERFORM public.oc_documento_registrar(v_op, v_cli, jsonb_build_object('especie','nf_complementar','componentes','[]'::jsonb,'lotes','[]'::jsonb));
    RAISE EXCEPTION 'T4a FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T4a %',SQLSTATE; END IF; END;
  BEGIN PERFORM public.oc_documento_registrar(v_op, v_cli, jsonb_build_object('especie','nf_principal','documento_origem_id',v_doc::text,'componentes','[]'::jsonb,'lotes','[]'::jsonb));
    RAISE EXCEPTION 'T4b FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T4b %',SQLSTATE; END IF; END;
  BEGIN PERFORM public.oc_documento_registrar(v_op, v_cli, jsonb_build_object('especie','nf_complementar','documento_origem_id',gen_random_uuid()::text,'componentes','[]'::jsonb,'lotes','[]'::jsonb));
    RAISE EXCEPTION 'T4c FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0002' THEN RAISE EXCEPTION 'T4c %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T4 PASS (guardas de complementar/origem)';

  -- ── T5: lote alheio => erro; lote duplicado no vinculo => erro ──
  BEGIN PERFORM public.oc_documento_registrar(v_op, v_cli, jsonb_build_object('especie','outro','componentes','[]'::jsonb,'lotes',jsonb_build_array(gen_random_uuid()::text)));
    RAISE EXCEPTION 'T5a FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0002' THEN RAISE EXCEPTION 'T5a %',SQLSTATE; END IF; END;
  BEGIN PERFORM public.oc_documento_registrar(v_op, v_cli, jsonb_build_object('especie','outro','componentes','[]'::jsonb,'lotes',jsonb_build_array(v_l1::text,v_l1::text)));
    RAISE EXCEPTION 'T5b FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T5b %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T5 PASS (guardas de lote)';

  -- ── T6: editar (substituição atômica de componentes) + lock por versão ──
  SELECT versao INTO v_vdoc FROM public.zoo_operacao_documentos WHERE id=v_doc;
  v_res := public.oc_documento_editar(v_doc, v_cli, v_vdoc, jsonb_build_object(
    'numero','1001-ED',
    'componentes', jsonb_build_array(jsonb_build_object('tipo','valor_bruto','natureza','acrescimo','valor',80000,'ordem',1)),
    'lotes', jsonb_build_array(v_l1::text)));
  SELECT valor_liquido, qtd_lotes INTO v_liq, v_cnt FROM public.vw_oc_documentos WHERE documento_id=v_doc;
  IF v_liq <> 80000 OR v_cnt <> 1 THEN RAISE EXCEPTION 'T6 FAIL liquido=% lotes=%',v_liq,v_cnt; END IF;  -- substituiu componentes+lotes
  BEGIN PERFORM public.oc_documento_editar(v_doc, v_cli, v_vdoc, jsonb_build_object('numero','x'));   -- versão velha
    RAISE EXCEPTION 'T6 FAIL versao'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'40001' THEN RAISE EXCEPTION 'T6 %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T6 PASS (edicao atomica + lock versao)';

  -- ── T7: cancelar lógico; preserva componentes/lotes; recancelar e editar cancelado => erro ──
  SELECT versao INTO v_vdoc FROM public.zoo_operacao_documentos WHERE id=v_doc;
  v_res := public.oc_documento_cancelar(v_doc, v_cli, 'motivo '||v_tag);
  SELECT situacao INTO v_situ FROM public.vw_oc_documentos WHERE documento_id=v_doc;
  IF v_situ <> 'cancelado' THEN RAISE EXCEPTION 'T7 FAIL situacao=%',v_situ; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_documento_componentes WHERE documento_id=v_doc;  -- componentes preservados
  IF v_cnt < 1 THEN RAISE EXCEPTION 'T7 FAIL componentes removidos'; END IF;
  BEGIN PERFORM public.oc_documento_cancelar(v_doc, v_cli, 'de novo');
    RAISE EXCEPTION 'T7 FAIL recancelar'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T7b %',SQLSTATE; END IF; END;
  BEGIN PERFORM public.oc_documento_editar(v_doc, v_cli, v_vdoc+1, jsonb_build_object('numero','x'));
    RAISE EXCEPTION 'T7 FAIL editar cancelado'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T7c %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T7 PASS (cancelamento logico preserva; guardas)';

  -- ── T8: nada de FINV2/liquidação criado ──
  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2 WHERE descricao = v_tag;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T8 FAIL: criou FINV2 (%)',v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_op;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T8 FAIL: criou liquidacao'; END IF;
  RAISE NOTICE 'T8 PASS (sem FINV2/liquidacao)';

  RAISE NOTICE 'PR-OC-DOC-MODEL-01: T1..T8 OK';
END $t$;

ROLLBACK;

DO $post$
DECLARE v_leak int;
BEGIN
  SELECT (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes=current_setting('app.ocdoc_tag')) INTO v_leak;
  IF v_leak <> 0 THEN RAISE EXCEPTION 'POST FAIL: % vazaram', v_leak; END IF;
END $post$;

SELECT set_config('app.ocdoc_tag','',false) AS run_tag_reset;
