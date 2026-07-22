-- PR-OC-COMPRA-NEG-01 — oc_salvar_lotes persiste valor_acordado (soma bruta dos lotes).
--   BEGIN...ROLLBACK + sentinela de resíduo (tag de sessão sobrevive ao rollback). NADA persiste.
--   Requer aplicadas: PR-OC-COMPRA-NEG-01 (oc_salvar_lotes v2) + OC2-SALDO (_oc_base_saldo_operacao).
--   Fixture: tenant real admin; operação criada por oc_salvar_rascunho (programada/rascunho).
SELECT set_config('app.ocneg01_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text;
  v_op uuid; v_v int; v_res jsonb;
  v_acordado numeric; v_base numeric; v_orig text;
  v_lotes_kg_cab jsonb;
  v_lotes_semvalor jsonb;
BEGIN
  v_tag := current_setting('app.ocneg01_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  -- Cria a operação (programada/rascunho) via RPC soberana.
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
    'tipo_operacao','compra','data_operacao','2026-08-01','observacoes',v_tag));
  v_op := (v_res->>'operacao_id')::uuid;
  v_v  := (v_res->>'versao')::int;

  -- ── T1: kg (100×400×12=480000) + cabeca (50×3000=150000) → valor_acordado = 630000 ──
  v_lotes_kg_cab := jsonb_build_array(
    jsonb_build_object('ordem',1,'categoria_negociada','boi_magro','qtd_negociada',100,'peso_medio_negociado_kg',400,'criterio_valor','kg','valor_informado',12),
    jsonb_build_object('ordem',2,'categoria_negociada','garrote','qtd_negociada',50,'criterio_valor','cabeca','valor_informado',3000));
  v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, v_lotes_kg_cab);
  v_v := (v_res->>'versao')::int;
  IF (v_res->>'valor_acordado')::numeric <> 630000 THEN RAISE EXCEPTION 'T1 FAIL retorno valor_acordado=%', v_res->>'valor_acordado'; END IF;
  SELECT valor_acordado INTO v_acordado FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  IF v_acordado <> 630000 THEN RAISE EXCEPTION 'T1 FAIL persistido valor_acordado=%', v_acordado; END IF;
  RAISE NOTICE 'T1 PASS (kg+cabeca = 630000)';

  -- ── T2: amarração OC2-SALDO — base_origem='acordado', base=630000 (não base_indefinida) ──
  SELECT base, base_origem INTO v_base, v_orig FROM public._oc_base_saldo_operacao(v_op);
  IF v_base <> 630000 OR v_orig <> 'acordado' THEN RAISE EXCEPTION 'T2 FAIL base=% origem=%', v_base, v_orig; END IF;
  RAISE NOTICE 'T2 PASS (base acordado 630000)';

  -- ── T3: idempotência — re-salvar os mesmos lotes → mesmo valor_acordado, versão coerente ──
  v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, v_lotes_kg_cab);
  IF (v_res->>'versao')::int <> v_v + 1 THEN RAISE EXCEPTION 'T3 FAIL versao=%', v_res->>'versao'; END IF;
  v_v := (v_res->>'versao')::int;
  SELECT valor_acordado INTO v_acordado FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  IF v_acordado <> 630000 THEN RAISE EXCEPTION 'T3 FAIL idempotência valor_acordado=%', v_acordado; END IF;
  RAISE NOTICE 'T3 PASS (idempotente)';

  -- ── T4: lock por versão — versão errada → 40001 ──
  BEGIN
    v_res := public.oc_salvar_lotes(v_op, v_cli, v_v - 1, v_lotes_kg_cab);
    RAISE EXCEPTION 'T4 FAIL versao errada aceita';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> '40001' THEN RAISE EXCEPTION 'T4 SQLSTATE %', SQLSTATE; END IF; END;
  RAISE NOTICE 'T4 PASS (lock 40001)';

  -- ── T5: critério 'total' — valor_acordado = valor informado (90000) ──
  v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
    jsonb_build_object('ordem',1,'categoria_negociada','lote_unico','criterio_valor','total','valor_informado',90000)));
  v_v := (v_res->>'versao')::int;
  SELECT valor_acordado INTO v_acordado FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  IF v_acordado <> 90000 THEN RAISE EXCEPTION 'T5 FAIL total valor_acordado=%', v_acordado; END IF;
  RAISE NOTICE 'T5 PASS (criterio total = 90000)';

  -- ── T6: sem preço válido (Σ=0) → valor_acordado NULL → base_indefinida de volta ──
  v_lotes_semvalor := jsonb_build_array(
    jsonb_build_object('ordem',1,'categoria_negociada','boi_magro','qtd_negociada',100,'peso_medio_negociado_kg',400,'criterio_valor','kg'));
  v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, v_lotes_semvalor);
  IF (v_res->'valor_acordado') IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'T6 FAIL retorno=%', v_res->'valor_acordado'; END IF;
  SELECT valor_acordado INTO v_acordado FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  IF v_acordado IS NOT NULL THEN RAISE EXCEPTION 'T6 FAIL valor_acordado nao-NULL=%', v_acordado; END IF;
  SELECT base, base_origem INTO v_base, v_orig FROM public._oc_base_saldo_operacao(v_op);
  IF v_base IS NOT NULL OR v_orig <> 'indefinida' THEN RAISE EXCEPTION 'T6 FAIL base=% origem=%', v_base, v_orig; END IF;
  RAISE NOTICE 'T6 PASS (sem preço → NULL → indefinida)';

  RAISE NOTICE 'PR-OC-COMPRA-NEG-01: T1..T6 OK';
END $t$;

ROLLBACK;

-- ── Resíduo zero (tag sobrevive ao rollback; nada persistiu) ──
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT
    (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.ocneg01_tag'))
  + (SELECT count(*) FROM public.zoo_operacao_lotes l JOIN public.zoo_operacoes_comerciais o ON o.id=l.operacao_id WHERE o.observacoes = current_setting('app.ocneg01_tag'))
    INTO v_leak;
  IF v_leak <> 0 THEN RAISE EXCEPTION 'POST FAIL: % linhas vazaram (resíduo não-zero)', v_leak; END IF;
  RAISE NOTICE 'POST PASS: resíduo zero';
END $post$;

SELECT set_config('app.ocneg01_tag', '', false) AS run_tag_reset;
