-- PR-MESA-TRANSF-01 — Mesa: tipo de operacao e conta destino no proposto
-- Migration aplicada pelo arquiteto no Proto (binbcdfbisgscrifztia) e versionada aqui.
-- Peca 1: fn_classificacao_editar_proposto passa a aceitar tipo_operacao e conta_destino_id.
-- Peca 2: vw_classificacao_staging_preview expoe proposto_tipo_operacao e proposto_conta_destino_id.

CREATE OR REPLACE FUNCTION public.fn_classificacao_editar_proposto(p_staging_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staging financeiro_classificacao_staging%ROWTYPE; v_user_id uuid; v_prop jsonb; v_res jsonb; v_fav uuid; v_faz uuid; v_k text;
  v_aplicados text[] := '{}'; v_rejeitados jsonb := '{}'::jsonb;
  c_editaveis constant text[] := ARRAY['subcentro','favorecido_id','fazenda_id','produto','safra','categoria','numero_documento',
    'safra_id','data_competencia','data_vencimento','data_pagamento','conta_bancaria_id','observacao','tipo_operacao','conta_destino_id'];
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
  IF p_patch ? 'numero_documento' THEN
    IF NULLIF(trim(p_patch->>'numero_documento'), '') IS NULL THEN v_prop := v_prop - 'numero_documento'; ELSE v_prop := v_prop || jsonb_build_object('numero_documento', trim(p_patch->>'numero_documento')); END IF;
    v_aplicados := array_append(v_aplicados, 'numero_documento');
  END IF;

  -- 129c: chaves novas (gravadas pelo apply). NULL/vazio = tira a proposta.
  IF p_patch ? 'safra_id' THEN
    IF NULLIF(trim(p_patch->>'safra_id'), '') IS NULL THEN v_prop := v_prop - 'safra_id';
    ELSIF NOT EXISTS (SELECT 1 FROM financeiro_safras sf WHERE sf.id = (p_patch->>'safra_id')::uuid AND sf.cliente_id = v_staging.cliente_id) THEN
      v_rejeitados := v_rejeitados || jsonb_build_object('safra_id', 'safra_nao_encontrada'); v_prop := v_prop;
    ELSE v_prop := v_prop || jsonb_build_object('safra_id', p_patch->>'safra_id'); END IF;
    v_aplicados := array_append(v_aplicados, 'safra_id');
  END IF;
  IF p_patch ? 'conta_bancaria_id' THEN
    IF NULLIF(trim(p_patch->>'conta_bancaria_id'), '') IS NULL THEN v_prop := v_prop - 'conta_bancaria_id';
    ELSIF NOT EXISTS (SELECT 1 FROM financeiro_contas_bancarias cb WHERE cb.id = (p_patch->>'conta_bancaria_id')::uuid AND cb.cliente_id = v_staging.cliente_id) THEN
      v_rejeitados := v_rejeitados || jsonb_build_object('conta_bancaria_id', 'conta_nao_encontrada');
    ELSE v_prop := v_prop || jsonb_build_object('conta_bancaria_id', p_patch->>'conta_bancaria_id'); END IF;
    v_aplicados := array_append(v_aplicados, 'conta_bancaria_id');
  END IF;
  IF p_patch ? 'tipo_operacao' THEN
    IF NULLIF(trim(p_patch->>'tipo_operacao'), '') IS NULL THEN v_prop := v_prop - 'tipo_operacao';
    ELSIF trim(p_patch->>'tipo_operacao') NOT IN ('1-Entradas','2-Saídas','3-Transferências') THEN
      v_rejeitados := v_rejeitados || jsonb_build_object('tipo_operacao', 'tipo_invalido');
    ELSE v_prop := v_prop || jsonb_build_object('tipo_operacao', trim(p_patch->>'tipo_operacao')); END IF;
    v_aplicados := array_append(v_aplicados, 'tipo_operacao');
  END IF;
  IF p_patch ? 'conta_destino_id' THEN
    IF NULLIF(trim(p_patch->>'conta_destino_id'), '') IS NULL THEN v_prop := v_prop - 'conta_destino_id';
    ELSIF NOT EXISTS (SELECT 1 FROM financeiro_contas_bancarias cb WHERE cb.id = (p_patch->>'conta_destino_id')::uuid AND cb.cliente_id = v_staging.cliente_id) THEN
      v_rejeitados := v_rejeitados || jsonb_build_object('conta_destino_id', 'conta_nao_encontrada');
    ELSE v_prop := v_prop || jsonb_build_object('conta_destino_id', p_patch->>'conta_destino_id'); END IF;
    v_aplicados := array_append(v_aplicados, 'conta_destino_id');
  END IF;
  FOREACH v_k IN ARRAY ARRAY['data_competencia','data_vencimento','data_pagamento'] LOOP
    IF p_patch ? v_k THEN
      IF NULLIF(trim(p_patch->>v_k), '') IS NULL THEN v_prop := v_prop - v_k;
      ELSE
        BEGIN v_prop := v_prop || jsonb_build_object(v_k, (p_patch->>v_k)::date::text);
        EXCEPTION WHEN OTHERS THEN v_rejeitados := v_rejeitados || jsonb_build_object(v_k, 'data_invalida'); END;
      END IF;
      v_aplicados := array_append(v_aplicados, v_k);
    END IF;
  END LOOP;
  IF p_patch ? 'observacao' THEN
    IF NULLIF(trim(p_patch->>'observacao'), '') IS NULL THEN v_prop := v_prop - 'observacao'; ELSE v_prop := v_prop || jsonb_build_object('observacao', trim(p_patch->>'observacao')); END IF;
    v_aplicados := array_append(v_aplicados, 'observacao');
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

CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview AS
 SELECT s.staging_id,
    s.sessao_id,
    s.cliente_id,
    s.match_status,
    s.aplicado,
    s.aplicado_em,
    s.aplicado_por,
    s.erro_apply,
    s.created_at,
    s.updated_at,
    s.excel_linha_origem,
    s.excel_data,
    s.excel_valor,
    s.excel_tipo_operacao,
    s.excel_conta_origem,
    s.excel_conta_destino,
    s.excel_subcentro,
    s.excel_fornecedor,
    s.excel_produto,
    s.excel_fazenda_codigo,
    l.id AS lanc_id,
    l.descricao AS lanc_descricao,
    l.observacao AS lanc_observacao,
    l.data_pagamento AS lanc_data_pagamento,
    l.data_competencia AS lanc_data_competencia,
    l.valor AS lanc_valor,
    l.sinal AS lanc_sinal,
    l.tipo_operacao AS lanc_tipo_operacao,
    l.status_transacao AS lanc_status,
    l.subcentro AS lanc_subcentro_atual,
    l.macro_custo AS lanc_macro_atual,
    l.grupo_custo AS lanc_grupo_atual,
    l.centro_custo AS lanc_centro_atual,
    l.plano_conta_id AS lanc_plano_conta_id_atual,
    l.favorecido_id AS lanc_favorecido_id_atual,
    fa.nome AS lanc_favorecido_nome_atual,
    l.conta_bancaria_id AS lanc_conta_bancaria_id,
    cb.nome_exibicao AS lanc_conta_bancaria_nome,
    l.conta_destino_id AS lanc_conta_destino_id,
    cd.nome_exibicao AS lanc_conta_destino_nome,
    l.fazenda_id AS lanc_fazenda_id,
    s.update_proposto ->> 'subcentro'::text AS proposto_subcentro,
    NULLIF(s.update_proposto ->> 'favorecido_id'::text, ''::text)::uuid AS proposto_favorecido_id,
    fp.nome AS proposto_favorecido_nome,
    l.id IS NOT NULL AND l.subcentro IS NULL AND (s.update_proposto ->> 'subcentro'::text) IS NOT NULL AS will_set_subcentro,
    l.id IS NOT NULL AND l.favorecido_id IS NULL AND NULLIF(s.update_proposto ->> 'favorecido_id'::text, ''::text) IS NOT NULL AS will_set_favorecido,
    l.id IS NOT NULL AND l.subcentro IS NULL AND (s.update_proposto ->> 'subcentro'::text) IS NOT NULL OR l.id IS NOT NULL AND l.favorecido_id IS NULL AND NULLIF(s.update_proposto ->> 'favorecido_id'::text, ''::text) IS NOT NULL AS will_change_anything,
    l.subcentro IS NOT NULL AND (s.update_proposto ->> 'subcentro'::text) IS NOT NULL AND l.subcentro <> (s.update_proposto ->> 'subcentro'::text) AS conflito_subcentro,
    (EXISTS ( SELECT 1
           FROM financeiro_plano_contas pc
          WHERE pc.subcentro = NULLIF(s.update_proposto ->> 'subcentro'::text, ''::text) AND pc.ativo AND (pc.cliente_id IS NULL OR pc.cliente_id = s.cliente_id))) AS proposto_subcentro_existe_no_plano,
    NULLIF(s.update_proposto ->> 'subcentro'::text, ''::text) IS NOT NULL AND NOT (EXISTS ( SELECT 1
           FROM financeiro_plano_contas pc
          WHERE pc.subcentro = NULLIF(s.update_proposto ->> 'subcentro'::text, ''::text) AND pc.ativo AND (pc.cliente_id IS NULL OR pc.cliente_id = s.cliente_id))) AS will_create_subcentro_orfao,
    COALESCE(cb.nome_exibicao, sco.nome_exibicao, scd.nome_exibicao, NULLIF(s.excel_conta_origem, '-'::text)) AS conta_filtro_nome,
    COALESCE(l.conta_bancaria_id, l.conta_destino_id, s.conta_origem_id, s.conta_destino_id) AS conta_filtro_id,
    s.excel_observacao,
    s.excel_documento,
    NULLIF(s.update_proposto ->> 'fazenda_id'::text, ''::text)::uuid AS proposto_fazenda_id,
    fzp.nome AS proposto_fazenda_nome,
    s.update_proposto ->> 'produto'::text AS proposto_produto,
    s.update_proposto ->> 'safra'::text AS proposto_safra,
    s.update_proposto ->> 'categoria'::text AS proposto_categoria,
    l.id IS NOT NULL AND NULLIF(s.update_proposto ->> 'fazenda_id'::text, ''::text)::uuid IS NOT NULL AND NULLIF(s.update_proposto ->> 'fazenda_id'::text, ''::text)::uuid IS DISTINCT FROM l.fazenda_id AS will_set_fazenda,
    (s.update_proposto -> '_meta'::text) ->> 'tier'::text AS proposto_tier,
    (s.update_proposto -> '_meta'::text) ->> 'origem_resolucao'::text AS proposto_origem_resolucao,
    (s.update_proposto -> '_meta'::text) ->> 'regra_id'::text AS proposto_regra_id,
    (s.update_proposto -> '_meta'::text) ->> 'alias_id'::text AS proposto_alias_id,
    NULLIF((s.update_proposto -> '_meta'::text) ->> 'motor_version'::text, ''::text)::integer AS motor_version,
    s.update_proposto ->> 'macro_custo'::text AS proposto_macro,
    fzl.nome AS lanc_fazenda_nome,
    l.numero_documento AS lanc_numero_documento,
    s.update_proposto ->> 'numero_documento'::text AS proposto_numero_documento,
    s.match_status = 'exato'::text AND s.aplicado = false AND l.id IS NOT NULL AND l.subcentro IS NULL AND NOT (NULLIF(s.update_proposto ->> 'subcentro'::text, ''::text) IS NOT NULL AND NOT (EXISTS ( SELECT 1
           FROM financeiro_plano_contas pc
          WHERE pc.subcentro = NULLIF(s.update_proposto ->> 'subcentro'::text, ''::text) AND pc.ativo AND (pc.cliente_id IS NULL OR pc.cliente_id = s.cliente_id)))) AS lote_aplicavel,
    l.data_vencimento AS lanc_data_vencimento,
    l.safra_id AS lanc_safra_id,
    sfl.codigo AS lanc_safra_codigo,
    NULLIF(s.update_proposto ->> 'safra_id'::text, ''::text)::uuid AS proposto_safra_id,
    sfp.codigo AS proposto_safra_codigo,
    NULLIF(s.update_proposto ->> 'data_competencia'::text, ''::text)::date AS proposto_data_competencia,
    NULLIF(s.update_proposto ->> 'data_vencimento'::text, ''::text)::date AS proposto_data_vencimento,
    NULLIF(s.update_proposto ->> 'data_pagamento'::text, ''::text)::date AS proposto_data_pagamento,
    NULLIF(s.update_proposto ->> 'conta_bancaria_id'::text, ''::text)::uuid AS proposto_conta_bancaria_id,
    s.update_proposto ->> 'observacao'::text AS proposto_observacao,
    s.casamento_meta,
    s.excel_data_pagamento,
    s.excel_data_vencimento,
    s.match_lancamento_ids,
    s.revisado_em,
    s.revisado_por,
    s.update_proposto ->> 'tipo_operacao'::text AS proposto_tipo_operacao,
    NULLIF(s.update_proposto ->> 'conta_destino_id'::text, ''::text)::uuid AS proposto_conta_destino_id
   FROM financeiro_classificacao_staging s
     LEFT JOIN financeiro_lancamentos_v2 l ON l.id = s.match_lancamento_id
     LEFT JOIN financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
     LEFT JOIN financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
     LEFT JOIN financeiro_contas_bancarias sco ON sco.id = s.conta_origem_id
     LEFT JOIN financeiro_contas_bancarias scd ON scd.id = s.conta_destino_id
     LEFT JOIN financeiro_fornecedores fa ON fa.id = l.favorecido_id
     LEFT JOIN financeiro_fornecedores fp ON fp.id = NULLIF(s.update_proposto ->> 'favorecido_id'::text, ''::text)::uuid
     LEFT JOIN fazendas fzp ON fzp.id = NULLIF(s.update_proposto ->> 'fazenda_id'::text, ''::text)::uuid
     LEFT JOIN fazendas fzl ON fzl.id = l.fazenda_id
     LEFT JOIN financeiro_safras sfl ON sfl.id = l.safra_id
     LEFT JOIN financeiro_safras sfp ON sfp.id = NULLIF(s.update_proposto ->> 'safra_id'::text, ''::text)::uuid;
