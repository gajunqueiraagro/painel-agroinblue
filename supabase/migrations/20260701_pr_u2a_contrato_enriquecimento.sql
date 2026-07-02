-- ============================================================================
-- PR-U2a — Backend do contrato de ENRIQUECIMENTO (update_proposto).
--
-- update_proposto vira a PROPOSTA COMPLETA de enriquecimento:
--   valores: plano_conta_id, subcentro, macro/grupo/centro_custo, favorecido_id,
--            fazenda_id (apply grava), produto/safra/categoria (carry-only),
--   _meta:   { tier, origem_resolucao, regra_id, alias_id, motor_version }  (INERTE)
--
-- RETROCOMPAT 100%: update_proposto/estado_anterior antigos (sem _meta/fazenda_id
-- /produto...) continuam funcionando via COALESCE e teste de existência de chave.
-- Sem backfill. _meta jamais é lido por lógica operacional (apply/reverter/órfão).
-- ============================================================================

-- ── 1) motor: expõe motor_version ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_resolver_contexto(p_cliente_id uuid, p_ctx jsonb, p_skip_guard boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_sub text; v_forn text; v_prod text; v_obs text; v_co text; v_cd text;
  v_faz text; v_safra text; v_tipo text; v_data date; v_valor numeric; v_folha text;
  v_regra record; v_alias record; v_plano record;
  v_pc uuid; v_tier text; v_regra_id uuid; v_alias_id uuid;
  c_motor_version constant int := 1;
BEGIN
  IF NOT COALESCE(p_skip_guard, false) THEN
    BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
    IF NOT (public.is_admin_agroinblue(v_user_id)
            OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
      RETURN jsonb_build_object('ok', false, 'tier', NULL, 'motivo', 'sem_permissao', 'motor_version', c_motor_version);
    END IF;
  END IF;

  v_sub   := NULLIF(trim(p_ctx->>'subcentro'), '');
  v_forn  := NULLIF(trim(p_ctx->>'fornecedor'), '');
  v_prod  := NULLIF(trim(p_ctx->>'produto'), '');
  v_obs   := NULLIF(trim(p_ctx->>'observacao'), '');
  v_co    := NULLIF(trim(p_ctx->>'conta_origem'), '');
  v_cd    := NULLIF(trim(p_ctx->>'conta_destino'), '');
  v_faz   := NULLIF(trim(p_ctx->>'fazenda_codigo'), '');
  v_safra := NULLIF(trim(COALESCE(p_ctx->>'safra', p_ctx->>'ano_mes')), '');
  v_tipo  := NULLIF(trim(p_ctx->>'tipo_operacao'), '');
  v_data  := NULLIF(p_ctx->>'data', '')::date;
  v_valor := NULLIF(p_ctx->>'valor', '')::numeric;

  SELECT r.id AS id, r.plano_conta_id AS plano_conta_id INTO v_regra
  FROM public.financeiro_classificacao_regras r
  WHERE r.ativo = true
    AND (r.cliente_id = p_cliente_id OR r.cliente_id IS NULL)
    AND (r.cond_subcentro     IS NULL OR unaccent(lower(trim(r.cond_subcentro)))     = unaccent(lower(COALESCE(v_sub,''))))
    AND (r.cond_fornecedor    IS NULL OR (v_forn IS NOT NULL AND unaccent(lower(v_forn)) LIKE '%'||unaccent(lower(r.cond_fornecedor))||'%'))
    AND (r.cond_produto       IS NULL OR (v_prod IS NOT NULL AND unaccent(lower(v_prod)) LIKE '%'||unaccent(lower(r.cond_produto))||'%'))
    AND (r.cond_observacao    IS NULL OR (v_obs  IS NOT NULL AND unaccent(lower(v_obs))  LIKE '%'||unaccent(lower(r.cond_observacao))||'%'))
    AND (r.cond_conta_origem  IS NULL OR unaccent(lower(trim(r.cond_conta_origem)))  = unaccent(lower(COALESCE(v_co,''))))
    AND (r.cond_conta_destino IS NULL OR unaccent(lower(trim(r.cond_conta_destino))) = unaccent(lower(COALESCE(v_cd,''))))
    AND (r.cond_fazenda       IS NULL OR lower(trim(r.cond_fazenda)) = lower(COALESCE(v_faz,'')))
    AND (r.cond_safra         IS NULL OR unaccent(lower(trim(r.cond_safra))) = unaccent(lower(COALESCE(v_safra,''))))
    AND (r.cond_tipo_operacao IS NULL OR r.cond_tipo_operacao = v_tipo)
    AND (r.cond_data_de       IS NULL OR (v_data  IS NOT NULL AND v_data  >= r.cond_data_de))
    AND (r.cond_data_ate      IS NULL OR (v_data  IS NOT NULL AND v_data  <= r.cond_data_ate))
    AND (r.cond_valor_min     IS NULL OR (v_valor IS NOT NULL AND v_valor >= r.cond_valor_min))
    AND (r.cond_valor_max     IS NULL OR (v_valor IS NOT NULL AND v_valor <= r.cond_valor_max))
  ORDER BY r.prioridade DESC, r.especificidade DESC, r.created_at DESC
  LIMIT 1;
  IF FOUND THEN v_pc := v_regra.plano_conta_id; v_tier := 'regra'; v_regra_id := v_regra.id; END IF;

  IF v_pc IS NULL AND v_sub IS NOT NULL THEN
    SELECT a.id AS id, a.plano_conta_id AS plano_conta_id INTO v_alias
    FROM public.financeiro_subcentro_aliases a
    WHERE a.ativo = true
      AND (a.cliente_id = p_cliente_id OR a.cliente_id IS NULL)
      AND lower(trim(a.alias_text)) = lower(trim(v_sub))
    ORDER BY (a.cliente_id IS NOT NULL) DESC, a.created_at DESC
    LIMIT 1;
    IF FOUND THEN v_pc := v_alias.plano_conta_id; v_tier := 'alias'; v_alias_id := v_alias.id; END IF;
  END IF;

  IF v_pc IS NULL AND v_sub IS NOT NULL THEN
    SELECT id INTO v_pc FROM financeiro_plano_contas
     WHERE ativo AND (cliente_id = p_cliente_id OR cliente_id IS NULL)
       AND lower(trim(subcentro)) = lower(v_sub) LIMIT 1;
    IF v_pc IS NOT NULL THEN v_tier := 'plano_exato'; END IF;
    IF v_pc IS NULL THEN
      SELECT id INTO v_pc FROM financeiro_plano_contas
       WHERE ativo AND (cliente_id = p_cliente_id OR cliente_id IS NULL)
         AND unaccent(lower(trim(subcentro))) = unaccent(lower(v_sub)) LIMIT 1;
      IF v_pc IS NOT NULL THEN v_tier := 'plano_unaccent'; END IF;
    END IF;
    IF v_pc IS NULL THEN
      v_folha := trim(split_part(v_sub, '/', array_length(string_to_array(v_sub, '/'), 1)));
      SELECT id INTO v_pc FROM financeiro_plano_contas
       WHERE ativo AND (cliente_id = p_cliente_id OR cliente_id IS NULL)
         AND unaccent(lower(trim(subcentro))) = unaccent(lower(v_folha)) LIMIT 1;
      IF v_pc IS NOT NULL THEN v_tier := 'plano_folha'; END IF;
    END IF;
  END IF;

  IF v_pc IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'tier', NULL, 'regra_id', NULL, 'alias_id', NULL,
      'plano_conta_id', NULL, 'subcentro', NULL, 'macro_custo', NULL, 'grupo_custo', NULL,
      'centro_custo', NULL, 'confianca', NULL, 'motor_version', c_motor_version);
  END IF;

  SELECT subcentro, macro_custo, grupo_custo, centro_custo INTO v_plano
  FROM financeiro_plano_contas WHERE id = v_pc;

  RETURN jsonb_build_object('ok', true, 'tier', v_tier, 'regra_id', v_regra_id, 'alias_id', v_alias_id,
    'plano_conta_id', v_pc, 'subcentro', v_plano.subcentro, 'macro_custo', v_plano.macro_custo,
    'grupo_custo', v_plano.grupo_custo, 'centro_custo', v_plano.centro_custo,
    'confianca', 'deterministica', 'motor_version', c_motor_version);
END;
$function$;

-- ── helper: monta _meta a partir do retorno do motor ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_meta(p_motor jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'tier',             p_motor->>'tier',
    'origem_resolucao', COALESCE(p_motor->>'tier', 'orfao'),
    'regra_id',         p_motor->>'regra_id',
    'alias_id',         p_motor->>'alias_id',
    'motor_version',    COALESCE((p_motor->>'motor_version')::int, 1)
  ));
$function$;

-- ── 2) populate: embute _meta ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_populate_staging(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_row jsonb; v_linha int; v_subcentro text; v_fornecedor_txt text; v_produto text;
  v_conta_origem_txt text; v_conta_destino_txt text; v_ano_mes text; v_data date; v_valor numeric;
  v_tipo_op text; v_fazenda_codigo text; v_observacao text; v_documento text;
  v_conta_origem_id uuid; v_conta_destino_id uuid; v_fazenda_id uuid; v_favorecido_id uuid;
  v_plano_conta_id uuid; v_plano_macro text; v_plano_grupo text; v_plano_centro text;
  v_alias_id_usado uuid; v_subcentro_raw text; v_ctx jsonb; v_motor jsonb; v_meta jsonb;
  v_match_count int; v_match_lanc_id uuid; v_match_subcentro text; v_match_status text; v_update_proposto jsonb;
  v_total int := 0; v_inseridos int := 0; v_counts jsonb := '{}'::jsonb;
BEGIN
  IF p_sessao_id IS NULL OR p_cliente_id IS NULL THEN RAISE EXCEPTION 'p_sessao_id e p_cliente_id obrigatorios'; END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RAISE EXCEPTION 'sem_permissao para cliente %', p_cliente_id;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_total := v_total + 1;
    v_linha            := (v_row->>'linha')::int;
    v_subcentro        := NULLIF(trim(v_row->>'subcentro'), '');
    v_fornecedor_txt   := NULLIF(trim(v_row->>'fornecedor'), '');
    v_produto          := NULLIF(trim(v_row->>'produto'), '');
    v_conta_origem_txt := NULLIF(trim(v_row->>'conta_origem'), '');
    v_conta_destino_txt := NULLIF(trim(v_row->>'conta_destino'), '');
    v_ano_mes          := NULLIF(trim(v_row->>'ano_mes'), '');
    v_data             := NULLIF(v_row->>'data', '')::date;
    v_valor            := (v_row->>'valor')::numeric;
    v_tipo_op          := NULLIF(trim(v_row->>'tipo_operacao'), '');
    v_fazenda_codigo   := NULLIF(trim(v_row->>'fazenda_codigo'), '');
    v_observacao       := NULLIF(trim(v_row->>'observacao'), '');
    v_documento        := NULLIF(trim(v_row->>'documento'), '');

    IF v_tipo_op = (E'3-Transferência') THEN v_tipo_op := (E'3-Transferências'); END IF;

    v_fazenda_id := NULL;
    IF v_fazenda_codigo IS NOT NULL THEN
      SELECT id INTO v_fazenda_id FROM fazendas WHERE cliente_id = p_cliente_id AND codigo_importacao = v_fazenda_codigo LIMIT 1;
    END IF;

    v_conta_origem_id  := COALESCE(NULLIF(v_row->>'conta_origem_id','')::uuid, fn_classificacao_resolver_conta(p_cliente_id, v_conta_origem_txt));
    v_conta_destino_id := COALESCE(NULLIF(v_row->>'conta_destino_id','')::uuid, fn_classificacao_resolver_conta(p_cliente_id, v_conta_destino_txt));

    v_favorecido_id := NULL;
    IF v_fornecedor_txt IS NOT NULL THEN
      SELECT id INTO v_favorecido_id FROM financeiro_fornecedores
      WHERE cliente_id = p_cliente_id AND ativo = true AND lower(trim(nome)) = lower(v_fornecedor_txt) LIMIT 1;
    END IF;

    v_subcentro_raw := v_subcentro;

    v_ctx := jsonb_build_object(
      'subcentro', v_subcentro_raw, 'fornecedor', v_fornecedor_txt, 'produto', v_produto,
      'observacao', v_observacao, 'conta_origem', v_conta_origem_txt, 'conta_destino', v_conta_destino_txt,
      'fazenda_codigo', v_fazenda_codigo, 'ano_mes', v_ano_mes, 'tipo_operacao', v_tipo_op,
      'data', v_data, 'valor', v_valor
    );
    v_motor := public.fn_classificacao_resolver_contexto(p_cliente_id, v_ctx, true);
    v_meta  := public.fn_classificacao_meta(v_motor);

    IF (v_motor->>'ok')::boolean THEN
      v_subcentro      := v_motor->>'subcentro';
      v_plano_macro    := v_motor->>'macro_custo';
      v_plano_grupo    := v_motor->>'grupo_custo';
      v_plano_centro   := v_motor->>'centro_custo';
      v_plano_conta_id := NULLIF(v_motor->>'plano_conta_id','')::uuid;
      v_alias_id_usado := NULLIF(v_motor->>'alias_id','')::uuid;
    ELSE
      v_subcentro      := v_subcentro_raw;
      v_plano_conta_id := NULL; v_plano_macro := NULL; v_plano_grupo := NULL; v_plano_centro := NULL;
      v_alias_id_usado := NULL;
    END IF;

    v_match_count := 0; v_match_lanc_id := NULL; v_match_subcentro := NULL;
    IF v_data IS NOT NULL AND v_valor IS NOT NULL AND v_tipo_op IS NOT NULL THEN
      IF v_tipo_op = '1-Entradas' AND v_conta_destino_id IS NOT NULL THEN
        SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_match_count, v_match_lanc_id
        FROM financeiro_lancamentos_v2
        WHERE cliente_id = p_cliente_id AND cancelado = false AND ano_mes = COALESCE(v_ano_mes, to_char(v_data, 'YYYY-MM'))
          AND data_pagamento = v_data AND ABS(valor) BETWEEN v_valor - 0.005 AND v_valor + 0.005
          AND tipo_operacao = v_tipo_op AND conta_destino_id = v_conta_destino_id;
      ELSIF v_tipo_op = (E'2-Saídas') AND v_conta_origem_id IS NOT NULL THEN
        SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_match_count, v_match_lanc_id
        FROM financeiro_lancamentos_v2
        WHERE cliente_id = p_cliente_id AND cancelado = false AND ano_mes = COALESCE(v_ano_mes, to_char(v_data, 'YYYY-MM'))
          AND data_pagamento = v_data AND ABS(valor) BETWEEN v_valor - 0.005 AND v_valor + 0.005
          AND tipo_operacao = v_tipo_op AND conta_bancaria_id = v_conta_origem_id;
      ELSIF v_tipo_op = (E'3-Transferências') AND v_conta_origem_id IS NOT NULL AND v_conta_destino_id IS NOT NULL THEN
        SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_match_count, v_match_lanc_id
        FROM financeiro_lancamentos_v2
        WHERE cliente_id = p_cliente_id AND cancelado = false AND ano_mes = COALESCE(v_ano_mes, to_char(v_data, 'YYYY-MM'))
          AND data_pagamento = v_data AND ABS(valor) BETWEEN v_valor - 0.005 AND v_valor + 0.005
          AND tipo_operacao = v_tipo_op AND conta_bancaria_id = v_conta_origem_id AND conta_destino_id = v_conta_destino_id;
      END IF;
    END IF;

    IF v_match_count = 1 AND v_match_lanc_id IS NOT NULL THEN
      SELECT subcentro INTO v_match_subcentro FROM financeiro_lancamentos_v2 WHERE id = v_match_lanc_id;
    END IF;

    IF v_tipo_op = (E'3-Transferências') THEN
      v_match_status := CASE WHEN v_match_count = 1 THEN 'ja_classificado' WHEN v_match_count > 1 THEN 'ambiguo' ELSE 'sem_match' END;
    ELSIF v_match_count = 0 THEN v_match_status := 'sem_match';
    ELSIF v_match_count > 1 THEN v_match_status := 'ambiguo';
    ELSIF v_match_subcentro IS NULL THEN v_match_status := 'exato';
    ELSIF lower(trim(v_match_subcentro)) = lower(v_subcentro) THEN v_match_status := 'ja_classificado';
    ELSE v_match_status := 'divergente';
    END IF;

    -- _meta embutido FORA do strip_nulls (namespace inerte)
    v_update_proposto := jsonb_strip_nulls(jsonb_build_object(
      'subcentro', v_subcentro, 'macro_custo', v_plano_macro, 'grupo_custo', v_plano_grupo,
      'centro_custo', v_plano_centro, 'plano_conta_id', v_plano_conta_id, 'favorecido_id', v_favorecido_id
    )) || jsonb_build_object('_meta', v_meta);

    INSERT INTO financeiro_classificacao_staging (
      sessao_id, cliente_id, excel_linha_origem, excel_subcentro, excel_fornecedor, excel_produto,
      excel_conta_origem, excel_conta_destino, conta_origem_id, conta_destino_id,
      excel_ano_mes, excel_data, excel_valor, excel_tipo_operacao, excel_fazenda_codigo,
      excel_observacao, excel_documento, match_lancamento_id, match_status, update_proposto, alias_id_usado
    ) VALUES (
      p_sessao_id, p_cliente_id, v_linha, v_subcentro_raw, v_fornecedor_txt, v_produto,
      v_conta_origem_txt, v_conta_destino_txt, v_conta_origem_id, v_conta_destino_id,
      v_ano_mes, v_data, v_valor, v_tipo_op, v_fazenda_codigo,
      v_observacao, v_documento, CASE WHEN v_match_count = 1 THEN v_match_lanc_id ELSE NULL END,
      v_match_status, v_update_proposto, v_alias_id_usado
    ) ON CONFLICT (sessao_id, excel_linha_origem) DO NOTHING;

    v_inseridos := v_inseridos + 1;
  END LOOP;

  SELECT jsonb_object_agg(match_status, qt) INTO v_counts
  FROM (SELECT match_status, COUNT(*) AS qt FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id GROUP BY match_status) s;

  RETURN jsonb_build_object('sessao_id', p_sessao_id, 'total_linhas', v_total, 'inseridas', v_inseridos, 'counts_por_status', COALESCE(v_counts, '{}'::jsonb));
END;
$function$;

-- ── 3) reresolver: preserva enriquecimento + recomputa _meta ─────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_reresolver_sessao(p_sessao_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid; v_cliente uuid; v_row financeiro_classificacao_staging%ROWTYPE;
  v_ctx jsonb; v_motor jsonb; v_meta jsonb; v_prop jsonb; v_alias uuid;
  v_proc int := 0; v_res int := 0; v_orfa int := 0; v_ap int := 0; v_ed int := 0; v_mud int := 0;
BEGIN
  SELECT cliente_id INTO v_cliente FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cliente IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_vazia_ou_inexistente'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR v_cliente IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  SELECT count(*) FILTER (WHERE aplicado), count(*) FILTER (WHERE NOT aplicado AND proposto_editado_em IS NOT NULL)
    INTO v_ap, v_ed FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id;

  FOR v_row IN
    SELECT * FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id AND aplicado = false AND proposto_editado_em IS NULL
  LOOP
    v_proc := v_proc + 1;
    v_ctx := jsonb_build_object(
      'subcentro', v_row.excel_subcentro, 'fornecedor', v_row.excel_fornecedor, 'produto', v_row.excel_produto,
      'observacao', v_row.excel_observacao, 'conta_origem', v_row.excel_conta_origem, 'conta_destino', v_row.excel_conta_destino,
      'fazenda_codigo', v_row.excel_fazenda_codigo, 'ano_mes', v_row.excel_ano_mes,
      'tipo_operacao', v_row.excel_tipo_operacao, 'data', v_row.excel_data, 'valor', v_row.excel_valor
    );
    v_motor := public.fn_classificacao_resolver_contexto(v_cliente, v_ctx, true);
    v_meta  := public.fn_classificacao_meta(v_motor);

    IF (v_motor->>'ok')::boolean THEN
      v_prop := jsonb_strip_nulls(jsonb_build_object(
        'subcentro', v_motor->>'subcentro', 'macro_custo', v_motor->>'macro_custo',
        'grupo_custo', v_motor->>'grupo_custo', 'centro_custo', v_motor->>'centro_custo',
        'plano_conta_id', v_motor->>'plano_conta_id',
        'favorecido_id', v_row.update_proposto->>'favorecido_id',
        'fazenda_id',    v_row.update_proposto->>'fazenda_id',
        'produto',       v_row.update_proposto->>'produto',
        'safra',         v_row.update_proposto->>'safra',
        'categoria',     v_row.update_proposto->>'categoria'
      )) || jsonb_build_object('_meta', v_meta);
      v_alias := NULLIF(v_motor->>'alias_id','')::uuid; v_res := v_res + 1;
    ELSE
      v_prop := jsonb_strip_nulls(jsonb_build_object(
        'subcentro',     NULLIF(trim(v_row.excel_subcentro), ''),
        'favorecido_id', v_row.update_proposto->>'favorecido_id',
        'fazenda_id',    v_row.update_proposto->>'fazenda_id',
        'produto',       v_row.update_proposto->>'produto',
        'safra',         v_row.update_proposto->>'safra',
        'categoria',     v_row.update_proposto->>'categoria'
      )) || jsonb_build_object('_meta', v_meta);
      v_alias := NULL; v_orfa := v_orfa + 1;
    END IF;

    IF v_prop IS DISTINCT FROM v_row.update_proposto OR v_alias IS DISTINCT FROM v_row.alias_id_usado THEN
      UPDATE financeiro_classificacao_staging
      SET update_proposto = v_prop, alias_id_usado = v_alias, updated_at = now()
      WHERE staging_id = v_row.staging_id;
      v_mud := v_mud + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'sessao_id', p_sessao_id,
    'processadas', v_proc, 'mudadas', v_mud, 'resolvidas', v_res, 'ainda_orfa', v_orfa,
    'preservadas_aplicadas', v_ap, 'preservadas_editadas', v_ed);
END;
$function$;

-- ── 4) editar_proposto: whitelist + fazenda/produto/safra/categoria + _meta manual
CREATE OR REPLACE FUNCTION public.fn_classificacao_editar_proposto(p_staging_id uuid, p_patch jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_staging    financeiro_classificacao_staging%ROWTYPE;
  v_user_id    uuid;
  v_prop       jsonb;
  v_res        jsonb;
  v_fav        uuid;
  v_faz        uuid;
  v_k          text;
  v_aplicados  text[]  := '{}';
  v_rejeitados jsonb   := '{}'::jsonb;
  c_editaveis  constant text[] := ARRAY['subcentro','favorecido_id','fazenda_id','produto','safra','categoria'];
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

  FOR v_k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_k = ANY (c_editaveis)) THEN
      v_rejeitados := v_rejeitados || jsonb_build_object(v_k, 'campo_nao_editavel');
    END IF;
  END LOOP;

  -- SUBCENTRO (resolve via plano; ao editar, marca _meta manual)
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

  -- FAVORECIDO
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

  -- FAZENDA (valida em fazendas do cliente)
  IF p_patch ? 'fazenda_id' THEN
    IF jsonb_typeof(p_patch->'fazenda_id') = 'null' OR NULLIF(trim(p_patch->>'fazenda_id'), '') IS NULL THEN
      v_prop := v_prop - 'fazenda_id';
      v_aplicados := array_append(v_aplicados, 'fazenda_id');
    ELSE
      SELECT id INTO v_faz FROM fazendas WHERE id = NULLIF(p_patch->>'fazenda_id','')::uuid AND cliente_id = v_staging.cliente_id;
      IF FOUND THEN
        v_prop := v_prop || jsonb_build_object('fazenda_id', v_faz::text);
        v_aplicados := array_append(v_aplicados, 'fazenda_id');
      ELSE
        v_rejeitados := v_rejeitados || jsonb_build_object('fazenda_id', 'fazenda_invalida');
      END IF;
    END IF;
  END IF;

  -- PRODUTO / SAFRA / CATEGORIA (carry-only: texto livre; null remove)
  IF p_patch ? 'produto' THEN
    IF NULLIF(trim(p_patch->>'produto'), '') IS NULL THEN v_prop := v_prop - 'produto';
    ELSE v_prop := v_prop || jsonb_build_object('produto', trim(p_patch->>'produto')); END IF;
    v_aplicados := array_append(v_aplicados, 'produto');
  END IF;
  IF p_patch ? 'safra' THEN
    IF NULLIF(trim(p_patch->>'safra'), '') IS NULL THEN v_prop := v_prop - 'safra';
    ELSE v_prop := v_prop || jsonb_build_object('safra', trim(p_patch->>'safra')); END IF;
    v_aplicados := array_append(v_aplicados, 'safra');
  END IF;
  IF p_patch ? 'categoria' THEN
    IF NULLIF(trim(p_patch->>'categoria'), '') IS NULL THEN v_prop := v_prop - 'categoria';
    ELSE v_prop := v_prop || jsonb_build_object('categoria', trim(p_patch->>'categoria')); END IF;
    v_aplicados := array_append(v_aplicados, 'categoria');
  END IF;

  IF array_length(v_aplicados, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nada_aplicado',
      'update_proposto', v_staging.update_proposto, 'campos_aplicados', to_jsonb(v_aplicados), 'campos_rejeitados', v_rejeitados);
  END IF;

  -- _meta: QUALQUER edição do operador marca origem_resolucao='manual' (rastreabilidade p/ aprendizado).
  -- Ao chegar aqui, v_aplicados tem >=1 campo (senão retornou 'nada_aplicado' acima).
  v_prop := v_prop || jsonb_build_object('_meta', jsonb_build_object('origem_resolucao','manual','tier','manual','motor_version',1));

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

-- ── 5) apply_row: grava fazenda_id (COALESCE) + snapshot fazenda_id ──────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_apply_row(p_staging_id uuid, p_overwrite boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_staging  financeiro_classificacao_staging%ROWTYPE;
  v_lanc     financeiro_lancamentos_v2%ROWTYPE;
  v_proposto jsonb;
  v_estado   jsonb;
  v_user_id  uuid;
BEGIN
  IF p_staging_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'p_staging_id obrigatorio', 'lancamento_id', NULL, 'estado_anterior', NULL);
  END IF;

  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'staging_nao_encontrada', 'lancamento_id', NULL, 'estado_anterior', NULL);
  END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'sem_permissao', 'lancamento_id', v_staging.match_lancamento_id, 'estado_anterior', NULL);
  END IF;

  IF v_staging.match_lancamento_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'sem_lancamento_vinculado', 'lancamento_id', NULL, 'estado_anterior', NULL);
  END IF;

  SELECT * INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = v_staging.match_lancamento_id;
  IF NOT FOUND OR v_lanc.cancelado = true THEN
    UPDATE financeiro_classificacao_staging
      SET erro_apply = 'lancamento nao encontrado ou cancelado', aplicado = false
      WHERE staging_id = p_staging_id;
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'lancamento_inexistente_ou_cancelado', 'lancamento_id', v_staging.match_lancamento_id, 'estado_anterior', NULL);
  END IF;

  IF NOT p_overwrite AND v_lanc.subcentro IS NOT NULL THEN
    UPDATE financeiro_classificacao_staging
      SET erro_apply = 'subcentro ja preenchido no banco (conservador)', aplicado = false, match_status = 'ja_classificado'
      WHERE staging_id = p_staging_id;
    RETURN jsonb_build_object('ok', true, 'aplicado', false, 'motivo', 'pulado_subcentro_preenchido', 'lancamento_id', v_lanc.id, 'estado_anterior', NULL);
  END IF;

  v_proposto := v_staging.update_proposto;

  -- estado_anterior agora inclui fazenda_id (superconjunto do que o apply grava)
  v_estado := COALESCE(v_staging.estado_anterior, jsonb_build_object(
    'subcentro',      v_lanc.subcentro,
    'macro_custo',    v_lanc.macro_custo,
    'grupo_custo',    v_lanc.grupo_custo,
    'centro_custo',   v_lanc.centro_custo,
    'plano_conta_id', v_lanc.plano_conta_id,
    'favorecido_id',  v_lanc.favorecido_id,
    'fazenda_id',     v_lanc.fazenda_id
  ));

  IF p_overwrite THEN
    UPDATE financeiro_lancamentos_v2 SET
      subcentro      = COALESCE(v_proposto->>'subcentro',    subcentro),
      macro_custo    = COALESCE(v_proposto->>'macro_custo',  macro_custo),
      grupo_custo    = COALESCE(v_proposto->>'grupo_custo',  grupo_custo),
      centro_custo   = COALESCE(v_proposto->>'centro_custo', centro_custo),
      plano_conta_id = COALESCE(NULLIF(v_proposto->>'plano_conta_id','')::uuid, plano_conta_id),
      favorecido_id  = COALESCE(NULLIF(v_proposto->>'favorecido_id','')::uuid, favorecido_id),
      fazenda_id     = COALESCE(NULLIF(v_proposto->>'fazenda_id','')::uuid, fazenda_id),
      updated_at     = now()
    WHERE id = v_lanc.id;
  ELSE
    UPDATE financeiro_lancamentos_v2 SET
      subcentro      = COALESCE(subcentro,      v_proposto->>'subcentro'),
      macro_custo    = COALESCE(macro_custo,    v_proposto->>'macro_custo'),
      grupo_custo    = COALESCE(grupo_custo,    v_proposto->>'grupo_custo'),
      centro_custo   = COALESCE(centro_custo,   v_proposto->>'centro_custo'),
      plano_conta_id = COALESCE(plano_conta_id, NULLIF(v_proposto->>'plano_conta_id','')::uuid),
      favorecido_id  = COALESCE(favorecido_id,  NULLIF(v_proposto->>'favorecido_id','')::uuid),
      fazenda_id     = COALESCE(fazenda_id,     NULLIF(v_proposto->>'fazenda_id','')::uuid),
      updated_at     = now()
    WHERE id = v_lanc.id;
  END IF;

  UPDATE financeiro_classificacao_staging
    SET aplicado = true, aplicado_em = now(), aplicado_por = v_user_id, estado_anterior = v_estado, erro_apply = NULL
    WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object(
    'ok', true, 'aplicado', true,
    'motivo', CASE WHEN p_overwrite THEN 'aplicado_overwrite' ELSE 'aplicado_conservador' END,
    'lancamento_id', v_lanc.id, 'estado_anterior', v_estado
  );
END;
$function$;

-- ── 6) reverter_row: restaura fazenda_id só se a chave existir (retrocompat) ─
CREATE OR REPLACE FUNCTION public.fn_classificacao_reverter_row(p_staging_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_staging financeiro_classificacao_staging%ROWTYPE;
  v_estado  jsonb;
  v_user_id uuid;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  IF v_staging.aplicado = false OR v_staging.estado_anterior IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nada_a_reverter');
  END IF;
  IF v_staging.match_lancamento_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_lancamento_vinculado');
  END IF;

  v_estado := v_staging.estado_anterior;
  UPDATE financeiro_lancamentos_v2 SET
    subcentro      = v_estado->>'subcentro',
    macro_custo    = v_estado->>'macro_custo',
    grupo_custo    = v_estado->>'grupo_custo',
    centro_custo   = v_estado->>'centro_custo',
    plano_conta_id = NULLIF(v_estado->>'plano_conta_id','')::uuid,
    favorecido_id  = NULLIF(v_estado->>'favorecido_id','')::uuid,
    fazenda_id     = CASE WHEN v_estado ? 'fazenda_id' THEN NULLIF(v_estado->>'fazenda_id','')::uuid ELSE fazenda_id END,
    updated_at     = now()
  WHERE id = v_staging.match_lancamento_id;

  UPDATE financeiro_classificacao_staging
    SET aplicado = false, aplicado_em = NULL, aplicado_por = NULL, estado_anterior = NULL, erro_apply = NULL
    WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'revertido', 'lancamento_id', v_staging.match_lancamento_id, 'estado_restaurado', v_estado);
END;
$function$;
