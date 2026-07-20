-- PR-OC-MODEL-02B — abate estruturado (datas, modalidade, tipo de peso, carcaça canônica).
--   BEGIN...ROLLBACK + sentinela de resíduo (tag de sessão sobrevive ao rollback).
--   Requer as migrations 02B-1 (colunas/CHECKs) e 02B-2 (RPC) aplicadas.
--   Sentinelas de erro esperadas: P0001 = aplicabilidade (RPC); 23514 = CHECK (coerência/domínio).
SELECT set_config('app.oc02b_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text;
  v_op1 uuid; v_op2 uuid; v_op3 uuid;
  v_res jsonb; v_v int; v_txt text;
  r public.zoo_operacoes_comerciais;
BEGIN
  v_tag := current_setting('app.oc02b_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
    ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  -- ── T1: criar ABATE com os 7 campos e conferir persistência ──────────────
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
    'tipo_operacao','abate','data_operacao','2026-08-01','observacoes',v_tag,
    'data_embarque','2026-08-01','data_abate','2026-08-05','modalidade_comercial','escala',
    'tipo_peso','morto','rendimento_carcaca',55.5,'peso_carcaca_kg_total',280,'peso_carcaca_fonte','kg_total'));
  v_op1 := (v_res->>'operacao_id')::uuid;
  SELECT * INTO r FROM public.zoo_operacoes_comerciais WHERE id=v_op1;
  IF r.data_embarque <> DATE '2026-08-01' OR r.data_abate <> DATE '2026-08-05'
     OR r.modalidade_comercial <> 'escala' OR r.tipo_peso <> 'morto'
     OR r.rendimento_carcaca <> 55.5 OR r.peso_carcaca_kg_total <> 280 OR r.peso_carcaca_fonte <> 'kg_total' THEN
    RAISE EXCEPTION 'T1 FAIL: 7 campos nao persistidos corretamente' USING ERRCODE='22000'; END IF;
  RAISE NOTICE 'T1 PASS: abate com 7 campos persistido';

  -- ── T2: update parcial de 1 campo; demais preservados ────────────────────
  SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_op1;
  v_res := public.oc_salvar_rascunho(v_op1, v_cli, v_v, jsonb_build_object('rendimento_carcaca',52));
  SELECT * INTO r FROM public.zoo_operacoes_comerciais WHERE id=v_op1;
  IF r.rendimento_carcaca <> 52 THEN RAISE EXCEPTION 'T2 FAIL: campo alvo nao atualizado' USING ERRCODE='22000'; END IF;
  IF r.data_embarque <> DATE '2026-08-01' OR r.data_abate <> DATE '2026-08-05'
     OR r.modalidade_comercial <> 'escala' OR r.tipo_peso <> 'morto'
     OR r.peso_carcaca_kg_total <> 280 OR r.peso_carcaca_fonte <> 'kg_total' THEN
    RAISE EXCEPTION 'T2 FAIL: demais campos nao preservados' USING ERRCODE='22000'; END IF;
  RAISE NOTICE 'T2 PASS: update parcial preserva os demais';

  -- ── T3: update sem as novas chaves; todos preservados ────────────────────
  SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_op1;
  v_res := public.oc_salvar_rascunho(v_op1, v_cli, v_v, jsonb_build_object('observacoes', v_tag||'-t3'));
  SELECT * INTO r FROM public.zoo_operacoes_comerciais WHERE id=v_op1;
  IF r.data_embarque <> DATE '2026-08-01' OR r.data_abate <> DATE '2026-08-05'
     OR r.modalidade_comercial <> 'escala' OR r.tipo_peso <> 'morto'
     OR r.rendimento_carcaca <> 52 OR r.peso_carcaca_kg_total <> 280 OR r.peso_carcaca_fonte <> 'kg_total' THEN
    RAISE EXCEPTION 'T3 FAIL: campos nao preservados sem as chaves' USING ERRCODE='22000'; END IF;
  RAISE NOTICE 'T3 PASS: update sem as chaves preserva tudo';

  -- ── T4: modalidade_comercial inválida recusada (CHECK 23514) ─────────────
  SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_op1;
  BEGIN
    v_res := public.oc_salvar_rascunho(v_op1, v_cli, v_v, jsonb_build_object('modalidade_comercial','xxx'));
    RAISE EXCEPTION 'T4 FAIL: modalidade invalida aceita' USING ERRCODE='22000';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23514' THEN RAISE EXCEPTION 'T4 SQLSTATE %', SQLSTATE; END IF; END;
  RAISE NOTICE 'T4 PASS: modalidade invalida recusada (23514)';

  -- ── T5: rendimento_carcaca 0/100/150 recusados; 55.5 aceito ──────────────
  SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_op1;
  BEGIN v_res := public.oc_salvar_rascunho(v_op1, v_cli, v_v, jsonb_build_object('rendimento_carcaca',0));
    RAISE EXCEPTION 'T5 FAIL: rendimento 0 aceito' USING ERRCODE='22000';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23514' THEN RAISE EXCEPTION 'T5(0) SQLSTATE %', SQLSTATE; END IF; END;
  BEGIN v_res := public.oc_salvar_rascunho(v_op1, v_cli, v_v, jsonb_build_object('rendimento_carcaca',100));
    RAISE EXCEPTION 'T5 FAIL: rendimento 100 aceito' USING ERRCODE='22000';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23514' THEN RAISE EXCEPTION 'T5(100) SQLSTATE %', SQLSTATE; END IF; END;
  BEGIN v_res := public.oc_salvar_rascunho(v_op1, v_cli, v_v, jsonb_build_object('rendimento_carcaca',150));
    RAISE EXCEPTION 'T5 FAIL: rendimento 150 aceito' USING ERRCODE='22000';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23514' THEN RAISE EXCEPTION 'T5(150) SQLSTATE %', SQLSTATE; END IF; END;
  v_res := public.oc_salvar_rascunho(v_op1, v_cli, v_v, jsonb_build_object('rendimento_carcaca',55.5));
  SELECT rendimento_carcaca INTO r.rendimento_carcaca FROM public.zoo_operacoes_comerciais WHERE id=v_op1;
  IF r.rendimento_carcaca <> 55.5 THEN RAISE EXCEPTION 'T5 FAIL: 55.5 nao aceito' USING ERRCODE='22000'; END IF;
  RAISE NOTICE 'T5 PASS: 0/100/150 recusados, 55.5 aceito';

  -- ── T6: coerência kg_total <-> fonte (CHECK 23514) via create ────────────
  BEGIN v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
      'tipo_operacao','abate','data_operacao','2026-08-01','peso_carcaca_kg_total',280));
    RAISE EXCEPTION 'T6 FAIL: kg_total sem fonte aceito' USING ERRCODE='22000';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23514' THEN RAISE EXCEPTION 'T6(a) SQLSTATE %', SQLSTATE; END IF; END;
  BEGIN v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
      'tipo_operacao','abate','data_operacao','2026-08-01','peso_carcaca_fonte','kg_total'));
    RAISE EXCEPTION 'T6 FAIL: fonte sem kg_total aceito' USING ERRCODE='22000';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23514' THEN RAISE EXCEPTION 'T6(b) SQLSTATE %', SQLSTATE; END IF; END;
  RAISE NOTICE 'T6 PASS: coerência carcaça imposta (23514)';

  -- ── T7: data_embarque > data_abate recusado (CHECK 23514) ────────────────
  BEGIN v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
      'tipo_operacao','abate','data_operacao','2026-08-01','data_embarque','2026-08-10','data_abate','2026-08-05'));
    RAISE EXCEPTION 'T7 FAIL: data_embarque>data_abate aceito' USING ERRCODE='22000';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23514' THEN RAISE EXCEPTION 'T7 SQLSTATE %', SQLSTATE; END IF; END;
  RAISE NOTICE 'T7 PASS: data_embarque<=data_abate imposta (23514)';

  -- ── T8: aplicabilidade por tipo_operacao (P0001 na RPC) ──────────────────
  BEGIN v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
      'tipo_operacao','compra','data_operacao','2026-08-01','tipo_peso','vivo'));
    RAISE EXCEPTION 'T8 FAIL: compra+tipo_peso aceito' USING ERRCODE='22000';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T8(a) SQLSTATE %', SQLSTATE; END IF; END;
  BEGIN v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
      'tipo_operacao','venda','data_operacao','2026-08-01','rendimento_carcaca',55));
    RAISE EXCEPTION 'T8 FAIL: venda+rendimento_carcaca aceito' USING ERRCODE='22000';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T8(b) SQLSTATE %', SQLSTATE; END IF; END;
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
      'tipo_operacao','venda','data_operacao','2026-08-01','observacoes',v_tag,'modalidade_comercial','a_termo'));
  v_op2 := (v_res->>'operacao_id')::uuid;
  SELECT modalidade_comercial INTO v_txt FROM public.zoo_operacoes_comerciais WHERE id=v_op2;
  IF v_txt <> 'a_termo' THEN RAISE EXCEPTION 'T8(c) FAIL: venda+modalidade nao persistiu (%)', v_txt USING ERRCODE='22000'; END IF;
  BEGIN v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
      'tipo_operacao','compra','data_operacao','2026-08-01','modalidade_comercial','spot'));
    RAISE EXCEPTION 'T8 FAIL: compra+modalidade aceito' USING ERRCODE='22000';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T8(d) SQLSTATE %', SQLSTATE; END IF; END;
  RAISE NOTICE 'T8 PASS: aplicabilidade (compra/venda/abate) correta';

  -- ── T9: regressões (numero_documento; parte com componente desativado) ───
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
      'tipo_operacao','compra','data_operacao','2026-08-01','observacoes',v_tag,'numero_documento','NF-02B'));
  v_op3 := (v_res->>'operacao_id')::uuid;
  SELECT numero_documento INTO v_txt FROM public.zoo_operacoes_comerciais WHERE id=v_op3;
  IF v_txt <> 'NF-02B' THEN RAISE EXCEPTION 'T9(a) FAIL: numero_documento=%', v_txt USING ERRCODE='22000'; END IF;
  BEGIN v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
      'tipo_operacao','compra','data_operacao','2026-08-01',
      'partes', jsonb_build_array(
        jsonb_build_object('natureza','principal','componente','principal','valor',1000),
        jsonb_build_object('natureza','acrescimo','componente','bonificacao','valor',30))));
    RAISE EXCEPTION 'T9 FAIL: parte com bonificacao desativada aceita' USING ERRCODE='22000';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T9(b) SQLSTATE %', SQLSTATE; END IF; END;
  RAISE NOTICE 'T9 PASS: numero_documento persiste; bonificacao desativada recusada';

  RAISE NOTICE 'PR-OC-MODEL-02B: T1..T9 OK';
END $t$;

ROLLBACK;

-- ── T10: resíduo zero (tag de sessão sobrevive ao rollback) ────────────────
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT count(*) INTO v_leak FROM public.zoo_operacoes_comerciais
   WHERE observacoes LIKE current_setting('app.oc02b_tag')||'%';
  IF v_leak <> 0 THEN RAISE EXCEPTION 'T10 FAIL: % operacoes vazaram (residuo nao-zero)', v_leak; END IF;
  RAISE NOTICE 'T10 PASS: residuo zero (rollback aplicado, nada persistiu)';
END $post$;

SELECT set_config('app.oc02b_tag', '', false) AS run_tag_reset;
