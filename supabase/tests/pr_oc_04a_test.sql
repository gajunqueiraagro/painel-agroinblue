-- PR-OC-04A — Testes do endurecimento do motor (catálogo, seq/qtd por componente,
--   resumos derivados, oc_salvar_rascunho upsert, oc_reabrir, invariantes, responsável).
-- Roda em BEGIN...ROLLBACK: NADA persiste. Requer as migrations 04A aplicadas.
-- Contexto de auth simulado (admin real). Requer catálogo já semeado.

SELECT set_config('app.oc04a_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

BEGIN;

DO $fix$
DECLARE
  v_admin uuid;
  v_cli uuid;
  v_mov uuid;
  v_forn uuid;
  v_op uuid;
  v_res jsonb;
  v_v int;
  v_ops_antes bigint;
BEGIN
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
      AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=cm.user_id)
      AND EXISTS (SELECT 1 FROM public.lancamentos l WHERE l.cliente_id=cm.cliente_id)
      AND EXISTS (SELECT 1 FROM public.financeiro_fornecedores f WHERE f.cliente_id=cm.cliente_id)
    ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin com lancamento+fornecedor'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SELECT id INTO v_mov FROM public.lancamentos WHERE cliente_id=v_cli LIMIT 1;
  SELECT id INTO v_forn FROM public.financeiro_fornecedores WHERE cliente_id=v_cli LIMIT 1;
  SELECT count(*) INTO v_ops_antes FROM public.zoo_operacoes_comerciais;

  -- P1: create via oc_salvar_rascunho(NULL) — responsavel_snapshot + resumos
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
    'tipo_operacao','compra','data_operacao','2026-03-01','contraparte_id',v_forn::text,
    'tipo_precificacao','por_arroba','preco_unitario',340,
    'movimentacoes', jsonb_build_array(v_mov::text),
    'partes', jsonb_build_array(
      jsonb_build_object('natureza','principal','componente','principal','valor',1000),
      jsonb_build_object('natureza','deducao','componente','funrural','valor',20),
      jsonb_build_object('natureza','acrescimo','componente','bonificacao','valor',30))));
  v_op := (v_res->>'operacao_id')::uuid; v_v := (v_res->>'versao')::int;
  IF v_v <> 1 THEN RAISE EXCEPTION 'P1 versao=%', v_v; END IF;
  IF (SELECT responsavel_nome_snapshot FROM public.zoo_operacoes_comerciais WHERE id=v_op) IS NULL THEN
    RAISE EXCEPTION 'P1 snapshot de responsavel nao gravado'; END IF;
  IF (SELECT created_by FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> v_admin THEN
    RAISE EXCEPTION 'P1 created_by (ator) <> executor'; END IF;
  -- resumos derivados: bruto 1000, desc 20, acr 30, total 1010
  IF (SELECT valor_total FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> 1010 THEN
    RAISE EXCEPTION 'P1 valor_total derivado incorreto (%)', (SELECT valor_total FROM public.zoo_operacoes_comerciais WHERE id=v_op); END IF;

  -- P2: seq/qtd por componente — principal em 3 parcelas
  v_res := public.oc_salvar_rascunho(v_op, v_cli, v_v, jsonb_build_object('partes', jsonb_build_array(
    jsonb_build_object('natureza','principal','componente','principal','valor',400),
    jsonb_build_object('natureza','principal','componente','principal','valor',300),
    jsonb_build_object('natureza','principal','componente','principal','valor',300))));
  v_v := (v_res->>'versao')::int;
  IF (SELECT max(quantidade_parcelas) FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND componente='principal') <> 3 THEN
    RAISE EXCEPTION 'P2 quantidade_parcelas do principal <> 3'; END IF;
  IF (SELECT count(distinct sequencia_parcela) FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND componente='principal') <> 3 THEN
    RAISE EXCEPTION 'P2 sequencias do principal nao 1..3'; END IF;
  IF (SELECT valor_bruto FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> 1000 THEN
    RAISE EXCEPTION 'P2 valor_bruto <> 1000'; END IF;

  -- N1: componente fora do catálogo -> P0001 (antes da FK)
  BEGIN
    v_res := public.oc_salvar_rascunho(v_op, v_cli, v_v, jsonb_build_object('partes', jsonb_build_array(
      jsonb_build_object('natureza','deducao','componente','inexistente_xyz','valor',5))));
    RAISE EXCEPTION 'N1 componente invalido aceito';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> 'P0001' THEN RAISE EXCEPTION 'N1 SQLSTATE %', SQLSTATE; END IF; END;
  IF (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> v_v THEN RAISE EXCEPTION 'N1 versao mudou apos falha'; END IF;

  -- P3: restaura composição válida e confirma (invariantes ok)
  v_res := public.oc_salvar_rascunho(v_op, v_cli, v_v, jsonb_build_object('partes', jsonb_build_array(
    jsonb_build_object('natureza','principal','componente','principal','valor',1000),
    jsonb_build_object('natureza','deducao','componente','funrural','valor',20))));
  v_v := (v_res->>'versao')::int;
  v_res := public.oc_confirmar(v_op, v_cli, v_v);
  IF (v_res->>'status_comercial') <> 'confirmada' THEN RAISE EXCEPTION 'P3 %', v_res; END IF;
  v_v := (v_res->>'versao')::int;

  -- N5: salvar rascunho em operação confirmada -> P0001
  BEGIN
    v_res := public.oc_salvar_rascunho(v_op, v_cli, v_v, '{"observacoes":"x"}'::jsonb);
    RAISE EXCEPTION 'N5 salvar em confirmada aceito';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> 'P0001' THEN RAISE EXCEPTION 'N5 SQLSTATE %', SQLSTATE; END IF; END;

  -- P6: sincronizar
  v_res := public.oc_sincronizar(v_op, v_cli, v_v);
  IF (v_res->>'status_financeiro') NOT IN ('sincronizado','divergente') THEN RAISE EXCEPTION 'P6 %', v_res; END IF;
  v_v := (v_res->>'versao')::int;

  -- P7: oc_reabrir (títulos programados, não protegidos) -> rascunho + nao_aplicavel + 0 títulos ativos
  v_res := public.oc_reabrir(v_op, v_cli, v_v, 'teste');
  IF (v_res->>'status_comercial') <> 'rascunho' OR (v_res->>'status_financeiro') <> 'nao_aplicavel' THEN RAISE EXCEPTION 'P7 %', v_res; END IF;
  IF (SELECT count(*) FROM public.financeiro_lancamentos_v2 f JOIN public.zoo_operacao_partes pt ON pt.financeiro_lancamento_id=f.id WHERE pt.operacao_id=v_op AND f.cancelado IS NOT TRUE) <> 0 THEN
    RAISE EXCEPTION 'P7 restaram titulos ativos'; END IF;
  v_v := (v_res->>'versao')::int;

  -- N2/N3: confirmar com só dedução (sem principal>0 / total<=0) -> P0001
  v_res := public.oc_salvar_rascunho(v_op, v_cli, v_v, jsonb_build_object('partes', jsonb_build_array(
    jsonb_build_object('natureza','principal','componente','principal','valor',0),
    jsonb_build_object('natureza','deducao','componente','desconto','valor',10))));
  v_v := (v_res->>'versao')::int;
  BEGIN
    v_res := public.oc_confirmar(v_op, v_cli, v_v);
    RAISE EXCEPTION 'N2/N3 confirmou com principal 0 / total<=0';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> 'P0001' THEN RAISE EXCEPTION 'N2/N3 SQLSTATE %', SQLSTATE; END IF; END;

  -- N4: versão stale -> 40001
  BEGIN
    v_res := public.oc_salvar_rascunho(v_op, v_cli, v_v-1, '{"observacoes":"y"}'::jsonb);
    RAISE EXCEPTION 'N4 versao stale aceita';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> '40001' THEN RAISE EXCEPTION 'N4 SQLSTATE %', SQLSTATE; END IF; END;

  -- N6: oc_reabrir de cancelada -> P0001
  v_res := public.oc_cancelar(v_op, v_cli, v_v, 'para testar reabrir');
  v_v := (v_res->>'versao')::int;
  BEGIN
    v_res := public.oc_reabrir(v_op, v_cli, v_v, 'x');
    RAISE EXCEPTION 'N6 reabriu cancelada';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> 'P0001' THEN RAISE EXCEPTION 'N6 SQLSTATE %', SQLSTATE; END IF; END;

  IF (SELECT count(*) FROM public.zoo_operacoes_comerciais) <> v_ops_antes + 1 THEN
    RAISE EXCEPTION 'contagem de operacoes inesperada'; END IF;

  RAISE NOTICE 'PR-OC-04A: P1..P7 + N1..N6 OK';
END $fix$;

ROLLBACK;

DO $post$
BEGIN
  RAISE NOTICE 'POS: rollback aplicado; nada persistiu (teste transacional).';
END $post$;

SELECT set_config('app.oc04a_tag', '', false) AS run_tag_reset;
