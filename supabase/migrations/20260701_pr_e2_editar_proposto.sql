-- ============================================================================
-- PR-E2 — Persistir a edição do operador em update_proposto (por linha).
--
-- Decisões (aprovadas):
--  1. subcentro fora do plano → REJEITADO (só canônicos; sem órfão manual).
--  2. reset incluído (fn_classificacao_resetar_proposto).
--  3. auditoria mínima: colunas update_proposto_original / proposto_editado_em/por.
--  4. whitelist editável AGORA: subcentro, favorecido_id (fazenda depois; produto nunca).
--  5. helper novo só para o edit (populate INTOCADO).
--  6. retornos { ok, motivo, update_proposto, campos_aplicados, campos_rejeitados }.
--
-- Escrita: SOMENTE na staging (update_proposto + auditoria do edit). NUNCA toca
-- financeiro_lancamentos_v2 (isso é o apply). Não muda match_status/match_lancamento_id.
-- A view vw_classificacao_staging_preview deriva proposto_*/will_set_* de
-- update_proposto → a edição reflete na hora.
-- ============================================================================

-- ── Auditoria/snapshot do edit da proposta ───────────────────────────────────
ALTER TABLE public.financeiro_classificacao_staging
  ADD COLUMN IF NOT EXISTS update_proposto_original jsonb,
  ADD COLUMN IF NOT EXISTS proposto_editado_em      timestamptz,
  ADD COLUMN IF NOT EXISTS proposto_editado_por     uuid;

-- ── Helper: resolve subcentro CANÔNICO → cadeia do plano (só para o edit) ────
-- Populate permanece intocado (usa sua própria resolução com aliases).
CREATE OR REPLACE FUNCTION public.fn_classificacao_resolver_subcentro(p_cliente_id uuid, p_subcentro text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_n int; v jsonb;
BEGIN
  IF p_subcentro IS NULL OR trim(p_subcentro) = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'subcentro_vazio');
  END IF;
  SELECT count(*) INTO v_n
  FROM financeiro_plano_contas
  WHERE (cliente_id = p_cliente_id OR cliente_id IS NULL) AND ativo = true
    AND lower(trim(subcentro)) = lower(trim(p_subcentro));
  IF v_n <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo',
      CASE WHEN v_n = 0 THEN 'subcentro_inexistente_no_plano' ELSE 'subcentro_ambiguo_no_plano' END);
  END IF;
  SELECT jsonb_build_object('ok', true, 'subcentro', subcentro, 'macro_custo', macro_custo,
                            'grupo_custo', grupo_custo, 'centro_custo', centro_custo, 'plano_conta_id', id)
    INTO v
  FROM financeiro_plano_contas
  WHERE (cliente_id = p_cliente_id OR cliente_id IS NULL) AND ativo = true
    AND lower(trim(subcentro)) = lower(trim(p_subcentro))
  LIMIT 1;
  RETURN v;
END;
$function$;

-- ── Editar a proposta (patch por linha) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_editar_proposto(p_staging_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staging    financeiro_classificacao_staging%ROWTYPE;
  v_user_id    uuid;
  v_prop       jsonb;
  v_res        jsonb;
  v_fav        uuid;
  v_k          text;
  v_aplicados  text[]  := '{}';
  v_rejeitados jsonb   := '{}'::jsonb;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'patch_invalido');
  END IF;

  v_prop := COALESCE(v_staging.update_proposto, '{}'::jsonb);

  -- Chaves fora da whitelist → ignoradas (registradas em rejeitados).
  FOR v_k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF v_k NOT IN ('subcentro', 'favorecido_id') THEN
      v_rejeitados := v_rejeitados || jsonb_build_object(v_k, 'campo_nao_editavel');
    END IF;
  END LOOP;

  -- SUBCENTRO (re-deriva a cadeia; rejeita fora do plano).
  IF p_patch ? 'subcentro' THEN
    IF jsonb_typeof(p_patch->'subcentro') = 'null' OR NULLIF(trim(p_patch->>'subcentro'), '') IS NULL THEN
      v_prop := v_prop - 'subcentro' - 'macro_custo' - 'grupo_custo' - 'centro_custo' - 'plano_conta_id';
      v_aplicados := array_append(v_aplicados, 'subcentro');
    ELSE
      v_res := public.fn_classificacao_resolver_subcentro(v_staging.cliente_id, p_patch->>'subcentro');
      IF (v_res->>'ok')::boolean THEN
        v_prop := v_prop
          || jsonb_build_object('subcentro',      v_res->>'subcentro')
          || jsonb_build_object('macro_custo',    v_res->>'macro_custo')
          || jsonb_build_object('grupo_custo',    v_res->>'grupo_custo')
          || jsonb_build_object('centro_custo',   v_res->>'centro_custo')
          || jsonb_build_object('plano_conta_id', v_res->>'plano_conta_id');
        v_aplicados := array_append(v_aplicados, 'subcentro');
      ELSE
        v_rejeitados := v_rejeitados || jsonb_build_object('subcentro', v_res->>'motivo');
      END IF;
    END IF;
  END IF;

  -- FAVORECIDO (valida existência/ativo no cliente).
  IF p_patch ? 'favorecido_id' THEN
    IF jsonb_typeof(p_patch->'favorecido_id') = 'null' OR NULLIF(trim(p_patch->>'favorecido_id'), '') IS NULL THEN
      v_prop := v_prop - 'favorecido_id';
      v_aplicados := array_append(v_aplicados, 'favorecido_id');
    ELSE
      SELECT id INTO v_fav FROM financeiro_fornecedores
      WHERE id = NULLIF(p_patch->>'favorecido_id', '')::uuid AND cliente_id = v_staging.cliente_id AND ativo = true;
      IF FOUND THEN
        v_prop := v_prop || jsonb_build_object('favorecido_id', v_fav::text);
        v_aplicados := array_append(v_aplicados, 'favorecido_id');
      ELSE
        v_rejeitados := v_rejeitados || jsonb_build_object('favorecido_id', 'fornecedor_invalido');
      END IF;
    END IF;
  END IF;

  -- Nada aplicado → não persiste.
  IF array_length(v_aplicados, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nada_aplicado',
      'update_proposto', v_staging.update_proposto, 'campos_aplicados', to_jsonb(v_aplicados), 'campos_rejeitados', v_rejeitados);
  END IF;

  v_prop := jsonb_strip_nulls(v_prop);

  UPDATE financeiro_classificacao_staging
  SET update_proposto          = v_prop,
      update_proposto_original = COALESCE(update_proposto_original, v_staging.update_proposto),
      proposto_editado_em      = now(),
      proposto_editado_por     = v_user_id,
      updated_at               = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object(
    'ok', true,
    'motivo', CASE WHEN v_rejeitados <> '{}'::jsonb THEN 'aplicado_parcial' ELSE 'aplicado' END,
    'update_proposto', v_prop,
    'campos_aplicados', to_jsonb(v_aplicados),
    'campos_rejeitados', v_rejeitados
  );
END;
$function$;

-- ── Resetar a proposta para a AUTO original (desfaz a edição) ────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_resetar_proposto(p_staging_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_staging financeiro_classificacao_staging%ROWTYPE; v_user_id uuid;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  IF v_staging.update_proposto_original IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_edicao_para_resetar', 'update_proposto', v_staging.update_proposto);
  END IF;

  UPDATE financeiro_classificacao_staging
  SET update_proposto          = v_staging.update_proposto_original,
      update_proposto_original = NULL,
      proposto_editado_em      = NULL,
      proposto_editado_por     = NULL,
      updated_at               = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'resetado', 'update_proposto', v_staging.update_proposto_original);
END;
$function$;
