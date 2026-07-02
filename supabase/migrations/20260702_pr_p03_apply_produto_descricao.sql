-- ============================================================================
-- P0-3 (FASE 1) — apply incorpora update_proposto.produto na descricao do lançamento.
--
-- Regra: produto proposto -> financeiro_lancamentos_v2.descricao.
--   overwrite:   descricao = COALESCE(NULLIF(produto,''), descricao)
--   conservador: descricao = COALESCE(descricao, NULLIF(produto,''))
--   NULLIF(...,'') => produto vazio NAO apaga a descricao.
-- estado_anterior passa a guardar 'descricao'; reverter restaura (guardado: aplicados
-- antigos sem 'descricao' no estado nao mexem na descricao).
--
-- fn_classificacao_apply (lote) NAO muda: apenas delega para fn_classificacao_apply_row,
-- entao herda a regra automaticamente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_classificacao_apply_row(p_staging_id uuid, p_overwrite boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_staging financeiro_classificacao_staging%ROWTYPE; v_lanc financeiro_lancamentos_v2%ROWTYPE; v_proposto jsonb; v_estado jsonb; v_user_id uuid;
BEGIN
  IF p_staging_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'p_staging_id obrigatorio', 'lancamento_id', NULL, 'estado_anterior', NULL); END IF;
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'staging_nao_encontrada', 'lancamento_id', NULL, 'estado_anterior', NULL); END IF;
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'sem_permissao', 'lancamento_id', v_staging.match_lancamento_id, 'estado_anterior', NULL); END IF;
  IF v_staging.match_lancamento_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'sem_lancamento_vinculado', 'lancamento_id', NULL, 'estado_anterior', NULL); END IF;
  SELECT * INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = v_staging.match_lancamento_id;
  IF NOT FOUND OR v_lanc.cancelado = true THEN
    UPDATE financeiro_classificacao_staging SET erro_apply = 'lancamento nao encontrado ou cancelado', aplicado = false WHERE staging_id = p_staging_id;
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'lancamento_inexistente_ou_cancelado', 'lancamento_id', v_staging.match_lancamento_id, 'estado_anterior', NULL); END IF;
  IF NOT p_overwrite AND v_lanc.subcentro IS NOT NULL THEN
    UPDATE financeiro_classificacao_staging SET erro_apply = 'subcentro ja preenchido no banco (conservador)', aplicado = false, match_status = 'ja_classificado' WHERE staging_id = p_staging_id;
    RETURN jsonb_build_object('ok', true, 'aplicado', false, 'motivo', 'pulado_subcentro_preenchido', 'lancamento_id', v_lanc.id, 'estado_anterior', NULL); END IF;

  v_proposto := v_staging.update_proposto;
  -- P0-3: estado_anterior passa a guardar descricao (para reverter).
  v_estado := COALESCE(v_staging.estado_anterior, jsonb_build_object('subcentro', v_lanc.subcentro, 'macro_custo', v_lanc.macro_custo, 'grupo_custo', v_lanc.grupo_custo,
    'centro_custo', v_lanc.centro_custo, 'plano_conta_id', v_lanc.plano_conta_id, 'favorecido_id', v_lanc.favorecido_id, 'fazenda_id', v_lanc.fazenda_id,
    'descricao', v_lanc.descricao));

  IF p_overwrite THEN
    UPDATE financeiro_lancamentos_v2 SET subcentro = COALESCE(v_proposto->>'subcentro', subcentro), macro_custo = COALESCE(v_proposto->>'macro_custo', macro_custo),
      grupo_custo = COALESCE(v_proposto->>'grupo_custo', grupo_custo), centro_custo = COALESCE(v_proposto->>'centro_custo', centro_custo),
      plano_conta_id = COALESCE(NULLIF(v_proposto->>'plano_conta_id','')::uuid, plano_conta_id), favorecido_id = COALESCE(NULLIF(v_proposto->>'favorecido_id','')::uuid, favorecido_id),
      fazenda_id = COALESCE(NULLIF(v_proposto->>'fazenda_id','')::uuid, fazenda_id),
      descricao = COALESCE(NULLIF(v_proposto->>'produto',''), descricao),   -- P0-3
      updated_at = now() WHERE id = v_lanc.id;
  ELSE
    UPDATE financeiro_lancamentos_v2 SET subcentro = COALESCE(subcentro, v_proposto->>'subcentro'), macro_custo = COALESCE(macro_custo, v_proposto->>'macro_custo'),
      grupo_custo = COALESCE(grupo_custo, v_proposto->>'grupo_custo'), centro_custo = COALESCE(centro_custo, v_proposto->>'centro_custo'),
      plano_conta_id = COALESCE(plano_conta_id, NULLIF(v_proposto->>'plano_conta_id','')::uuid), favorecido_id = COALESCE(favorecido_id, NULLIF(v_proposto->>'favorecido_id','')::uuid),
      fazenda_id = COALESCE(fazenda_id, NULLIF(v_proposto->>'fazenda_id','')::uuid),
      descricao = COALESCE(descricao, NULLIF(v_proposto->>'produto','')),   -- P0-3
      updated_at = now() WHERE id = v_lanc.id;
  END IF;

  UPDATE financeiro_classificacao_staging SET aplicado = true, aplicado_em = now(), aplicado_por = v_user_id, estado_anterior = v_estado, erro_apply = NULL WHERE staging_id = p_staging_id;
  RETURN jsonb_build_object('ok', true, 'aplicado', true, 'motivo', CASE WHEN p_overwrite THEN 'aplicado_overwrite' ELSE 'aplicado_conservador' END, 'lancamento_id', v_lanc.id, 'estado_anterior', v_estado);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_classificacao_reverter_row(p_staging_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_staging financeiro_classificacao_staging%ROWTYPE; v_estado jsonb; v_user_id uuid;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao'); END IF;
  IF v_staging.aplicado = false OR v_staging.estado_anterior IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'nada_a_reverter'); END IF;
  IF v_staging.match_lancamento_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_lancamento_vinculado'); END IF;

  v_estado := v_staging.estado_anterior;
  UPDATE financeiro_lancamentos_v2 SET subcentro = v_estado->>'subcentro', macro_custo = v_estado->>'macro_custo', grupo_custo = v_estado->>'grupo_custo',
    centro_custo = v_estado->>'centro_custo', plano_conta_id = NULLIF(v_estado->>'plano_conta_id','')::uuid, favorecido_id = NULLIF(v_estado->>'favorecido_id','')::uuid,
    fazenda_id = CASE WHEN v_estado ? 'fazenda_id' THEN NULLIF(v_estado->>'fazenda_id','')::uuid ELSE fazenda_id END,
    descricao = CASE WHEN v_estado ? 'descricao' THEN v_estado->>'descricao' ELSE descricao END,   -- P0-3 (guardado)
    updated_at = now() WHERE id = v_staging.match_lancamento_id;

  UPDATE financeiro_classificacao_staging SET aplicado = false, aplicado_em = NULL, aplicado_por = NULL, estado_anterior = NULL, erro_apply = NULL WHERE staging_id = p_staging_id;
  RETURN jsonb_build_object('ok', true, 'motivo', 'revertido', 'lancamento_id', v_staging.match_lancamento_id, 'estado_restaurado', v_estado);
END;
$function$;
