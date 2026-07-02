-- ============================================================================
-- P0-5 (FASE 1) — Documento (numero_documento) editável na Mesa + aplicado ao lançamento.
--   editar_proposto: whitelist += 'numero_documento' (guarda em update_proposto).
--   apply_row: numero_documento = COALESCE(NULLIF(proposto,''), atual) [overwrite] /
--              COALESCE(atual, NULLIF(proposto,'')) [conservador]; estado_anterior guarda.
--   reverter_row: restaura numero_documento (guardado).
--   view: += lanc_numero_documento (Sistema Atual).
--   fn_classificacao_apply (lote) NAO muda (delega -> herda).
--   tipo_documento NAO e tocado. NULLIF(...,'') => vazio nao apaga.
-- ============================================================================

-- ── 1) editar_proposto: aceita numero_documento ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_editar_proposto(p_staging_id uuid, p_patch jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_staging financeiro_classificacao_staging%ROWTYPE; v_user_id uuid; v_prop jsonb; v_res jsonb; v_fav uuid; v_faz uuid; v_k text;
  v_aplicados text[] := '{}'; v_rejeitados jsonb := '{}'::jsonb;
  c_editaveis constant text[] := ARRAY['subcentro','favorecido_id','fazenda_id','produto','safra','categoria','numero_documento'];
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao'); END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'patch_invalido'); END IF;

  v_prop := COALESCE(v_staging.update_proposto, '{}'::jsonb);
  FOR v_k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_k = ANY (c_editaveis)) THEN v_rejeitados := v_rejeitados || jsonb_build_object(v_k, 'campo_nao_editavel'); END IF;
  END LOOP;

  IF p_patch ? 'subcentro' THEN
    IF jsonb_typeof(p_patch->'subcentro') = 'null' OR NULLIF(trim(p_patch->>'subcentro'), '') IS NULL THEN
      v_prop := v_prop - 'subcentro' - 'macro_custo' - 'grupo_custo' - 'centro_custo' - 'plano_conta_id';
      v_aplicados := array_append(v_aplicados, 'subcentro');
    ELSE
      v_res := public.fn_classificacao_resolver_subcentro(v_staging.cliente_id, p_patch->>'subcentro');
      IF (v_res->>'ok')::boolean THEN
        v_prop := v_prop || jsonb_build_object('subcentro', v_res->>'subcentro') || jsonb_build_object('macro_custo', v_res->>'macro_custo')
          || jsonb_build_object('grupo_custo', v_res->>'grupo_custo') || jsonb_build_object('centro_custo', v_res->>'centro_custo') || jsonb_build_object('plano_conta_id', v_res->>'plano_conta_id');
        v_aplicados := array_append(v_aplicados, 'subcentro');
      ELSE v_rejeitados := v_rejeitados || jsonb_build_object('subcentro', v_res->>'motivo'); END IF;
    END IF;
  END IF;

  IF p_patch ? 'favorecido_id' THEN
    IF jsonb_typeof(p_patch->'favorecido_id') = 'null' OR NULLIF(trim(p_patch->>'favorecido_id'), '') IS NULL THEN
      v_prop := v_prop - 'favorecido_id'; v_aplicados := array_append(v_aplicados, 'favorecido_id');
    ELSE
      SELECT id INTO v_fav FROM financeiro_fornecedores WHERE id = NULLIF(p_patch->>'favorecido_id', '')::uuid AND cliente_id = v_staging.cliente_id AND ativo = true;
      IF FOUND THEN v_prop := v_prop || jsonb_build_object('favorecido_id', v_fav::text); v_aplicados := array_append(v_aplicados, 'favorecido_id');
      ELSE v_rejeitados := v_rejeitados || jsonb_build_object('favorecido_id', 'fornecedor_invalido'); END IF;
    END IF;
  END IF;

  IF p_patch ? 'fazenda_id' THEN
    IF jsonb_typeof(p_patch->'fazenda_id') = 'null' OR NULLIF(trim(p_patch->>'fazenda_id'), '') IS NULL THEN
      v_prop := v_prop - 'fazenda_id'; v_aplicados := array_append(v_aplicados, 'fazenda_id');
    ELSE
      SELECT id INTO v_faz FROM fazendas WHERE id = NULLIF(p_patch->>'fazenda_id','')::uuid AND cliente_id = v_staging.cliente_id;
      IF FOUND THEN v_prop := v_prop || jsonb_build_object('fazenda_id', v_faz::text); v_aplicados := array_append(v_aplicados, 'fazenda_id');
      ELSE v_rejeitados := v_rejeitados || jsonb_build_object('fazenda_id', 'fazenda_invalida'); END IF;
    END IF;
  END IF;

  IF p_patch ? 'produto' THEN
    IF NULLIF(trim(p_patch->>'produto'), '') IS NULL THEN v_prop := v_prop - 'produto'; ELSE v_prop := v_prop || jsonb_build_object('produto', trim(p_patch->>'produto')); END IF;
    v_aplicados := array_append(v_aplicados, 'produto');
  END IF;
  IF p_patch ? 'safra' THEN
    IF NULLIF(trim(p_patch->>'safra'), '') IS NULL THEN v_prop := v_prop - 'safra'; ELSE v_prop := v_prop || jsonb_build_object('safra', trim(p_patch->>'safra')); END IF;
    v_aplicados := array_append(v_aplicados, 'safra');
  END IF;
  IF p_patch ? 'categoria' THEN
    IF NULLIF(trim(p_patch->>'categoria'), '') IS NULL THEN v_prop := v_prop - 'categoria'; ELSE v_prop := v_prop || jsonb_build_object('categoria', trim(p_patch->>'categoria')); END IF;
    v_aplicados := array_append(v_aplicados, 'categoria');
  END IF;
  -- P0-5
  IF p_patch ? 'numero_documento' THEN
    IF NULLIF(trim(p_patch->>'numero_documento'), '') IS NULL THEN v_prop := v_prop - 'numero_documento'; ELSE v_prop := v_prop || jsonb_build_object('numero_documento', trim(p_patch->>'numero_documento')); END IF;
    v_aplicados := array_append(v_aplicados, 'numero_documento');
  END IF;

  IF array_length(v_aplicados, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nada_aplicado', 'update_proposto', v_staging.update_proposto, 'campos_aplicados', to_jsonb(v_aplicados), 'campos_rejeitados', v_rejeitados);
  END IF;

  v_prop := v_prop || jsonb_build_object('_meta', jsonb_build_object('origem_resolucao','manual','tier','manual','motor_version',1));

  UPDATE financeiro_classificacao_staging
  SET update_proposto = v_prop, update_proposto_original = COALESCE(update_proposto_original, v_staging.update_proposto),
      proposto_editado_em = now(), proposto_editado_por = v_user_id, updated_at = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', CASE WHEN v_rejeitados <> '{}'::jsonb THEN 'aplicado_parcial' ELSE 'aplicado' END,
    'update_proposto', v_prop, 'campos_aplicados', to_jsonb(v_aplicados), 'campos_rejeitados', v_rejeitados);
END;
$function$;

-- ── 2) apply_row: incorpora numero_documento (+ descricao do P0-3) ───────────
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
  v_estado := COALESCE(v_staging.estado_anterior, jsonb_build_object('subcentro', v_lanc.subcentro, 'macro_custo', v_lanc.macro_custo, 'grupo_custo', v_lanc.grupo_custo,
    'centro_custo', v_lanc.centro_custo, 'plano_conta_id', v_lanc.plano_conta_id, 'favorecido_id', v_lanc.favorecido_id, 'fazenda_id', v_lanc.fazenda_id,
    'descricao', v_lanc.descricao, 'numero_documento', v_lanc.numero_documento));

  IF p_overwrite THEN
    UPDATE financeiro_lancamentos_v2 SET subcentro = COALESCE(v_proposto->>'subcentro', subcentro), macro_custo = COALESCE(v_proposto->>'macro_custo', macro_custo),
      grupo_custo = COALESCE(v_proposto->>'grupo_custo', grupo_custo), centro_custo = COALESCE(v_proposto->>'centro_custo', centro_custo),
      plano_conta_id = COALESCE(NULLIF(v_proposto->>'plano_conta_id','')::uuid, plano_conta_id), favorecido_id = COALESCE(NULLIF(v_proposto->>'favorecido_id','')::uuid, favorecido_id),
      fazenda_id = COALESCE(NULLIF(v_proposto->>'fazenda_id','')::uuid, fazenda_id),
      descricao = COALESCE(NULLIF(v_proposto->>'produto',''), descricao),
      numero_documento = COALESCE(NULLIF(v_proposto->>'numero_documento',''), numero_documento),
      updated_at = now() WHERE id = v_lanc.id;
  ELSE
    UPDATE financeiro_lancamentos_v2 SET subcentro = COALESCE(subcentro, v_proposto->>'subcentro'), macro_custo = COALESCE(macro_custo, v_proposto->>'macro_custo'),
      grupo_custo = COALESCE(grupo_custo, v_proposto->>'grupo_custo'), centro_custo = COALESCE(centro_custo, v_proposto->>'centro_custo'),
      plano_conta_id = COALESCE(plano_conta_id, NULLIF(v_proposto->>'plano_conta_id','')::uuid), favorecido_id = COALESCE(favorecido_id, NULLIF(v_proposto->>'favorecido_id','')::uuid),
      fazenda_id = COALESCE(fazenda_id, NULLIF(v_proposto->>'fazenda_id','')::uuid),
      descricao = COALESCE(descricao, NULLIF(v_proposto->>'produto','')),
      numero_documento = COALESCE(numero_documento, NULLIF(v_proposto->>'numero_documento','')),
      updated_at = now() WHERE id = v_lanc.id;
  END IF;

  UPDATE financeiro_classificacao_staging SET aplicado = true, aplicado_em = now(), aplicado_por = v_user_id, estado_anterior = v_estado, erro_apply = NULL WHERE staging_id = p_staging_id;
  RETURN jsonb_build_object('ok', true, 'aplicado', true, 'motivo', CASE WHEN p_overwrite THEN 'aplicado_overwrite' ELSE 'aplicado_conservador' END, 'lancamento_id', v_lanc.id, 'estado_anterior', v_estado);
END;
$function$;

-- ── 3) reverter_row: restaura numero_documento (+ descricao) ─────────────────
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
    descricao = CASE WHEN v_estado ? 'descricao' THEN v_estado->>'descricao' ELSE descricao END,
    numero_documento = CASE WHEN v_estado ? 'numero_documento' THEN v_estado->>'numero_documento' ELSE numero_documento END,
    updated_at = now() WHERE id = v_staging.match_lancamento_id;

  UPDATE financeiro_classificacao_staging SET aplicado = false, aplicado_em = NULL, aplicado_por = NULL, estado_anterior = NULL, erro_apply = NULL WHERE staging_id = p_staging_id;
  RETURN jsonb_build_object('ok', true, 'motivo', 'revertido', 'lancamento_id', v_staging.match_lancamento_id, 'estado_restaurado', v_estado);
END;
$function$;

-- ── 4) view: += lanc_numero_documento (Sistema Atual) ────────────────────────
CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview AS
 SELECT s.staging_id, s.sessao_id, s.cliente_id, s.match_status, s.aplicado, s.aplicado_em, s.aplicado_por, s.erro_apply, s.created_at, s.updated_at,
   s.excel_linha_origem, s.excel_data, s.excel_valor, s.excel_tipo_operacao, s.excel_conta_origem, s.excel_conta_destino, s.excel_subcentro, s.excel_fornecedor, s.excel_produto, s.excel_fazenda_codigo,
   l.id AS lanc_id, l.descricao AS lanc_descricao, l.observacao AS lanc_observacao, l.data_pagamento AS lanc_data_pagamento, l.data_competencia AS lanc_data_competencia, l.valor AS lanc_valor, l.sinal AS lanc_sinal, l.tipo_operacao AS lanc_tipo_operacao, l.status_transacao AS lanc_status, l.subcentro AS lanc_subcentro_atual, l.macro_custo AS lanc_macro_atual, l.grupo_custo AS lanc_grupo_atual, l.centro_custo AS lanc_centro_atual, l.plano_conta_id AS lanc_plano_conta_id_atual, l.favorecido_id AS lanc_favorecido_id_atual, fa.nome AS lanc_favorecido_nome_atual, l.conta_bancaria_id AS lanc_conta_bancaria_id, cb.nome_exibicao AS lanc_conta_bancaria_nome, l.conta_destino_id AS lanc_conta_destino_id, cd.nome_exibicao AS lanc_conta_destino_nome, l.fazenda_id AS lanc_fazenda_id,
   s.update_proposto ->> 'subcentro' AS proposto_subcentro, NULLIF(s.update_proposto ->> 'favorecido_id','')::uuid AS proposto_favorecido_id, fp.nome AS proposto_favorecido_nome,
   l.id IS NOT NULL AND l.subcentro IS NULL AND (s.update_proposto ->> 'subcentro') IS NOT NULL AS will_set_subcentro,
   l.id IS NOT NULL AND l.favorecido_id IS NULL AND NULLIF(s.update_proposto ->> 'favorecido_id','') IS NOT NULL AS will_set_favorecido,
   l.id IS NOT NULL AND l.subcentro IS NULL AND (s.update_proposto ->> 'subcentro') IS NOT NULL OR l.id IS NOT NULL AND l.favorecido_id IS NULL AND NULLIF(s.update_proposto ->> 'favorecido_id','') IS NOT NULL AS will_change_anything,
   l.subcentro IS NOT NULL AND (s.update_proposto ->> 'subcentro') IS NOT NULL AND l.subcentro <> (s.update_proposto ->> 'subcentro') AS conflito_subcentro,
   (EXISTS (SELECT 1 FROM financeiro_plano_contas pc WHERE pc.subcentro = NULLIF(s.update_proposto ->> 'subcentro','') AND pc.ativo AND (pc.cliente_id IS NULL OR pc.cliente_id=s.cliente_id))) AS proposto_subcentro_existe_no_plano,
   NULLIF(s.update_proposto ->> 'subcentro','') IS NOT NULL AND NOT (EXISTS (SELECT 1 FROM financeiro_plano_contas pc WHERE pc.subcentro = NULLIF(s.update_proposto ->> 'subcentro','') AND pc.ativo AND (pc.cliente_id IS NULL OR pc.cliente_id=s.cliente_id))) AS will_create_subcentro_orfao,
   COALESCE(cb.nome_exibicao, sco.nome_exibicao, scd.nome_exibicao, NULLIF(s.excel_conta_origem,'-')) AS conta_filtro_nome,
   COALESCE(l.conta_bancaria_id, s.conta_origem_id, s.conta_destino_id) AS conta_filtro_id,
   s.excel_observacao, s.excel_documento,
   NULLIF(s.update_proposto ->> 'fazenda_id','')::uuid AS proposto_fazenda_id, fzp.nome AS proposto_fazenda_nome,
   s.update_proposto ->> 'produto' AS proposto_produto, s.update_proposto ->> 'safra' AS proposto_safra, s.update_proposto ->> 'categoria' AS proposto_categoria,
   (l.id IS NOT NULL AND NULLIF(s.update_proposto ->> 'fazenda_id','')::uuid IS NOT NULL AND NULLIF(s.update_proposto ->> 'fazenda_id','')::uuid IS DISTINCT FROM l.fazenda_id) AS will_set_fazenda,
   s.update_proposto -> '_meta' ->> 'tier' AS proposto_tier, s.update_proposto -> '_meta' ->> 'origem_resolucao' AS proposto_origem_resolucao, s.update_proposto -> '_meta' ->> 'regra_id' AS proposto_regra_id, s.update_proposto -> '_meta' ->> 'alias_id' AS proposto_alias_id,
   NULLIF(s.update_proposto -> '_meta' ->> 'motor_version','')::int AS motor_version,
   s.update_proposto ->> 'macro_custo' AS proposto_macro,
   fzl.nome AS lanc_fazenda_nome,
   -- P0-5
   l.numero_documento AS lanc_numero_documento,
   s.update_proposto ->> 'numero_documento' AS proposto_numero_documento
 FROM financeiro_classificacao_staging s
   LEFT JOIN financeiro_lancamentos_v2 l ON l.id=s.match_lancamento_id
   LEFT JOIN financeiro_contas_bancarias cb ON cb.id=l.conta_bancaria_id
   LEFT JOIN financeiro_contas_bancarias cd ON cd.id=l.conta_destino_id
   LEFT JOIN financeiro_contas_bancarias sco ON sco.id=s.conta_origem_id
   LEFT JOIN financeiro_contas_bancarias scd ON scd.id=s.conta_destino_id
   LEFT JOIN financeiro_fornecedores fa ON fa.id=l.favorecido_id
   LEFT JOIN financeiro_fornecedores fp ON fp.id=NULLIF(s.update_proposto ->> 'favorecido_id','')::uuid
   LEFT JOIN fazendas fzp ON fzp.id=NULLIF(s.update_proposto ->> 'fazenda_id','')::uuid
   LEFT JOIN fazendas fzl ON fzl.id=l.fazenda_id;
