-- PR-OC-CATALOGO-01 — slugs oficiais presentes, ativos e usáveis nas partes.
-- BEGIN...ROLLBACK: resíduo zero. Requer a migration do catálogo aplicada.
BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_faz uuid; v_forn uuid; v_op uuid; v_res jsonb; v_n int; v_total numeric;
BEGIN
  -- G1: os 7 slugs oficiais existem, ativos, na natureza correta
  SELECT count(*) INTO v_n FROM public.zoo_componentes_financeiros
   WHERE ativo AND (
     (natureza='deducao'   AND codigo IN ('senar_proape','condenacao','quebra','desconto_qualidade')) OR
     (natureza='acrescimo' AND codigo IN ('bonus_precoce','bonus_qualidade','bonus_lista_trace')));
  IF v_n <> 7 THEN RAISE EXCEPTION 'G1 esperava 7 slugs oficiais, achou %', v_n; END IF;

  -- G2: proibição de colapso preservada como identidade — cada slug é único (natureza,codigo)
  IF EXISTS (SELECT natureza, codigo FROM public.zoo_componentes_financeiros
              GROUP BY natureza, codigo HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'G2 identidade (natureza,codigo) duplicada'; END IF;

  -- Fixture para uso funcional
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
      AND EXISTS (SELECT 1 FROM public.fazendas f WHERE f.cliente_id=cm.cliente_id)
      AND EXISTS (SELECT 1 FROM public.financeiro_fornecedores f WHERE f.cliente_id=cm.cliente_id)
    ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin com fazenda+fornecedor'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  SELECT id INTO v_faz  FROM public.fazendas WHERE cliente_id=v_cli LIMIT 1;
  SELECT id INTO v_forn FROM public.financeiro_fornecedores WHERE cliente_id=v_cli LIMIT 1;

  -- P1: slugs oficiais aceitos como componentes de partes (via oc_salvar_rascunho -> _oc_aplicar_partes)
  --      1000 principal + 50 bonus_precoce (acrescimo) - 30 condenacao (deducao) = 1020
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
    'fazenda_id', v_faz::text, 'tipo_operacao','abate', 'data_operacao','2026-08-15', 'contraparte_id', v_forn::text,
    'partes', jsonb_build_array(
      jsonb_build_object('natureza','principal','componente','principal','valor',1000),
      jsonb_build_object('natureza','acrescimo','componente','bonus_precoce','valor',50),
      jsonb_build_object('natureza','deducao','componente','condenacao','valor',30))));
  v_op := (v_res->>'operacao_id')::uuid;
  SELECT valor_total INTO v_total FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  IF v_total <> 1020 THEN RAISE EXCEPTION 'P1 valor_total derivado=% (esperado 1020)', v_total; END IF;
  IF (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND componente IN ('bonus_precoce','condenacao')) <> 2 THEN
    RAISE EXCEPTION 'P1 partes com slugs oficiais nao gravadas'; END IF;

  -- N1: slug fora do catálogo -> P0001 (catálogo continua soberano)
  BEGIN
    v_res := public.oc_salvar_rascunho(v_op, v_cli, (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op),
      jsonb_build_object('partes', jsonb_build_array(
        jsonb_build_object('natureza','deducao','componente','slug_inexistente_zzz','valor',5))));
    RAISE EXCEPTION 'N1 slug invalido aceito';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> 'P0001' THEN RAISE EXCEPTION 'N1 SQLSTATE %', SQLSTATE; END IF; END;

  RAISE NOTICE 'PR-OC-CATALOGO-01: G1/G2 + P1 + N1 OK';
END $t$;

ROLLBACK;
