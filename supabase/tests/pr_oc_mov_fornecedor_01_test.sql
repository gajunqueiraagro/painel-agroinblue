-- PR-OC-MOV-FORNECEDOR-01 — o fornecedor da operacao chega ao lancamento.
--   Requer aplicada: 20260901120000.
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + residuo zero.
--
--   Fixture 100% SINTETICA. Nenhuma operacao real e' tocada.
SELECT set_config('app.ocmf_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text;
  v_faz uuid; v_forn uuid;
  v_op_com uuid; v_op_sem uuid;
  v_lote_com uuid; v_lote_sem uuid;
  v_env jsonb; v_lanc uuid; v_cnt int;
  v_forn_id uuid; v_snap text; v_nome_esperado text;
  v_lote_json jsonb;
BEGIN
  v_tag := current_setting('app.ocmf_tag');

  /* ⚠ JOIN COM auth.users OBRIGATORIO — `cliente_membros` nao tem FK para `auth.users`
     e ha admin ativo apontando para usuario inexistente (medido no proto). */
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm
    JOIN auth.users u ON u.id = cm.user_id
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
   ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin com usuario valido em auth.users'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

  INSERT INTO public.fazendas (cliente_id, nome, codigo, owner_id)
    VALUES (v_cli, 'ZZ TESTE MOVFORN '||v_tag, 'ZM'||left(v_tag,6), v_admin) RETURNING id INTO v_faz;

  v_nome_esperado := 'ZZ FORNECEDOR '||v_tag;
  INSERT INTO public.financeiro_fornecedores (cliente_id, nome)
    VALUES (v_cli, v_nome_esperado) RETURNING id INTO v_forn;

  v_lote_json := jsonb_build_object(
    'ordem', 1, 'categoria_negociada', 'garrotes', 'qtd_negociada', 10,
    'peso_medio_negociado_kg', 200, 'criterio_valor', 'kg', 'valor_informado', 14.5);

  -- ── operacao COM contraparte ───────────────────────────────────────────
  --   `rascunho=false` de proposito: a RPC recusa movimentacao em rascunho.
  INSERT INTO public.zoo_operacoes_comerciais
    (cliente_id, fazenda_id, tipo_operacao, data_operacao, cenario, contraparte_id, status_comercial, rascunho, versao)
  VALUES (v_cli, v_faz, 'compra', DATE '2026-05-10', 'realizado', v_forn, 'programada', false, 1)
  RETURNING id INTO v_op_com;
  PERFORM public.oc_salvar_lotes(v_op_com, v_cli, 1, jsonb_build_array(v_lote_json));
  SELECT id INTO v_lote_com FROM public.zoo_operacao_lotes WHERE operacao_id = v_op_com AND ordem = 1;
  -- `oc_salvar_lotes` recalcula `rascunho`; devolver a false para liberar a movimentacao.
  UPDATE public.zoo_operacoes_comerciais SET rascunho = false WHERE id = v_op_com;

  -- ===================== T1 — grava fornecedor E snapshot com o NOME =====
  v_env := public.oc_registrar_movimentacao(
    v_op_com, v_cli, v_lote_com, DATE '2026-05-12', 'garrotes', 4, 210, NULL, 'teste T1');
  IF (v_env->>'ok') <> 'true' THEN RAISE EXCEPTION 'T1 FAIL: envelope sem ok: %', v_env; END IF;
  v_lanc := (v_env->>'lancamento_id')::uuid;

  SELECT fornecedor_id, fornecedor_nome_snapshot INTO v_forn_id, v_snap
    FROM public.lancamentos WHERE id = v_lanc;
  IF v_forn_id IS DISTINCT FROM v_forn THEN
    RAISE EXCEPTION 'T1 FAIL: fornecedor_id = % (esperado %)', v_forn_id, v_forn; END IF;
  /* O snapshot precisa do NOME REAL, nao do default. Se vier '[nao informado]' a busca
     em financeiro_fornecedores nao aconteceu — que era exatamente o defeito. */
  IF v_snap IS DISTINCT FROM v_nome_esperado THEN
    RAISE EXCEPTION 'T1 FAIL: snapshot = % (esperado %)', v_snap, v_nome_esperado; END IF;

  -- ===================== T2 — a ligacao NAO mudou =====================
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_movimentacoes
   WHERE operacao_id = v_op_com AND movimentacao_id = v_lanc AND operacao_lote_id = v_lote_com;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T2 FAIL: ligacao operacao-lancamento nao gravou como antes'; END IF;

  -- ===================== T3 — SEM contraparte: nao estoura, cai no default =====
  INSERT INTO public.zoo_operacoes_comerciais
    (cliente_id, fazenda_id, tipo_operacao, data_operacao, cenario, contraparte_id, status_comercial, rascunho, versao)
  VALUES (v_cli, v_faz, 'compra', DATE '2026-05-10', 'realizado', NULL, 'programada', false, 1)
  RETURNING id INTO v_op_sem;
  PERFORM public.oc_salvar_lotes(v_op_sem, v_cli, 1, jsonb_build_array(v_lote_json));
  SELECT id INTO v_lote_sem FROM public.zoo_operacao_lotes WHERE operacao_id = v_op_sem AND ordem = 1;
  UPDATE public.zoo_operacoes_comerciais SET rascunho = false WHERE id = v_op_sem;

  v_env := public.oc_registrar_movimentacao(
    v_op_sem, v_cli, v_lote_sem, DATE '2026-05-12', 'garrotes', 3, 210, NULL, 'teste T3');
  IF (v_env->>'ok') <> 'true' THEN RAISE EXCEPTION 'T3 FAIL: operacao sem contraparte deveria registrar: %', v_env; END IF;
  v_lanc := (v_env->>'lancamento_id')::uuid;

  SELECT fornecedor_id, fornecedor_nome_snapshot INTO v_forn_id, v_snap
    FROM public.lancamentos WHERE id = v_lanc;
  IF v_forn_id IS NOT NULL THEN
    RAISE EXCEPTION 'T3 FAIL: sem contraparte, fornecedor_id deveria ser NULL, veio %', v_forn_id; END IF;
  IF v_snap <> '[nao informado]' THEN
    RAISE EXCEPTION 'T3 FAIL: snapshot deveria cair no default, veio %', v_snap; END IF;

  -- ===================== T4 — o resto do contrato intacto =====================
  --   A ponte de valor (PR-OC-VALOR-02) nao pode ter sido afetada pela mudanca.
  SELECT count(*) INTO v_cnt FROM public.lancamentos
   WHERE id = v_lanc AND valor_total IS NOT NULL AND origem_registro = 'operacao_comercial';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T4 FAIL: valor_total/origem_registro do lancamento mudaram'; END IF;

  RAISE NOTICE 'PR-OC-MOV-FORNECEDOR-01: T1..T4 PASS';
END $t$;

ROLLBACK;
