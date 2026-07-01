-- ============================================================================
-- PR-MAP-2 — populate passa a usar o Motor de Classificação Financeira.
--
-- 1) Motor ganha p_skip_guard (guard único no chamador → sem N lookups por linha).
-- 2) fn_classificacao_populate_staging: guard único de ownership + chama o motor
--    para montar update_proposto (canônico quando ok:true; cru/órfão quando
--    ok:false — comportamento atual preservado). alias_id_usado vem de tier=alias.
-- 3) fn_classificacao_reresolver_sessao: reaplica o motor a uma sessão existente,
--    atualizando SOMENTE update_proposto/alias_id_usado (preserva aplicadas e
--    editadas manualmente; nunca toca financeiro_lancamentos_v2 nem match_status).
-- Sem front. Não toca lançamentos.
-- ============================================================================

-- ── 1) Motor com p_skip_guard (recria assinatura: 2→3 args) ──────────────────
DROP FUNCTION IF EXISTS public.fn_classificacao_resolver_contexto(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.fn_classificacao_resolver_contexto(p_cliente_id uuid, p_ctx jsonb, p_skip_guard boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_sub text; v_forn text; v_prod text; v_obs text; v_co text; v_cd text;
  v_faz text; v_safra text; v_tipo text; v_data date; v_valor numeric; v_folha text;
  v_regra record; v_alias record; v_plano record;
  v_pc uuid; v_tier text; v_regra_id uuid; v_alias_id uuid;
BEGIN
  IF NOT COALESCE(p_skip_guard, false) THEN
    BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
    IF NOT (public.is_admin_agroinblue(v_user_id)
            OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
      RETURN jsonb_build_object('ok', false, 'tier', NULL, 'motivo', 'sem_permissao');
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
      'centro_custo', NULL, 'confianca', NULL);
  END IF;

  SELECT subcentro, macro_custo, grupo_custo, centro_custo INTO v_plano
  FROM financeiro_plano_contas WHERE id = v_pc;

  RETURN jsonb_build_object('ok', true, 'tier', v_tier, 'regra_id', v_regra_id, 'alias_id', v_alias_id,
    'plano_conta_id', v_pc, 'subcentro', v_plano.subcentro, 'macro_custo', v_plano.macro_custo,
    'grupo_custo', v_plano.grupo_custo, 'centro_custo', v_plano.centro_custo, 'confianca', 'deterministica');
END;
$function$;

-- ── 2) populate usa o motor ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_populate_staging(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id          uuid;
  v_row              jsonb;
  v_linha            int;
  v_subcentro        text;
  v_fornecedor_txt   text;
  v_produto          text;
  v_conta_origem_txt text;
  v_conta_destino_txt text;
  v_ano_mes          text;
  v_data             date;
  v_valor            numeric;
  v_tipo_op          text;
  v_fazenda_codigo   text;
  v_observacao       text;
  v_documento        text;

  v_conta_origem_id  uuid;
  v_conta_destino_id uuid;
  v_fazenda_id       uuid;
  v_favorecido_id    uuid;
  v_plano_conta_id   uuid;
  v_plano_macro      text;
  v_plano_grupo      text;
  v_plano_centro     text;

  v_alias_id_usado   uuid;
  v_subcentro_raw    text;
  v_ctx              jsonb;
  v_motor            jsonb;

  v_match_count      int;
  v_match_lanc_id    uuid;
  v_match_subcentro  text;
  v_match_status     text;
  v_update_proposto  jsonb;

  v_total            int := 0;
  v_inseridos        int := 0;
  v_counts           jsonb := '{}'::jsonb;
BEGIN
  IF p_sessao_id IS NULL OR p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'p_sessao_id e p_cliente_id obrigatorios';
  END IF;

  -- Guard único de ownership (PR-MAP-2): fecha lacuna + permite chamar o motor com skip_guard.
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
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

    IF v_tipo_op = (E'3-Transferência') THEN
      v_tipo_op := (E'3-Transferências');
    END IF;

    v_fazenda_id := NULL;
    IF v_fazenda_codigo IS NOT NULL THEN
      SELECT id INTO v_fazenda_id
      FROM fazendas
      WHERE cliente_id = p_cliente_id
        AND codigo_importacao = v_fazenda_codigo
      LIMIT 1;
    END IF;

    v_conta_origem_id  := COALESCE(NULLIF(v_row->>'conta_origem_id','')::uuid, fn_classificacao_resolver_conta(p_cliente_id, v_conta_origem_txt));
    v_conta_destino_id := COALESCE(NULLIF(v_row->>'conta_destino_id','')::uuid, fn_classificacao_resolver_conta(p_cliente_id, v_conta_destino_txt));

    v_favorecido_id := NULL;
    IF v_fornecedor_txt IS NOT NULL THEN
      SELECT id INTO v_favorecido_id
      FROM financeiro_fornecedores
      WHERE cliente_id = p_cliente_id
        AND ativo = true
        AND lower(trim(nome)) = lower(v_fornecedor_txt)
      LIMIT 1;
    END IF;

    v_subcentro_raw := v_subcentro;

    -- MOTOR (PR-MAP-2): resolve subcentro/plano por regra → alias → plano exato/unaccent/folha.
    v_ctx := jsonb_build_object(
      'subcentro',      v_subcentro_raw,
      'fornecedor',     v_fornecedor_txt,
      'produto',        v_produto,
      'observacao',     v_observacao,
      'conta_origem',   v_conta_origem_txt,
      'conta_destino',  v_conta_destino_txt,
      'fazenda_codigo', v_fazenda_codigo,
      'ano_mes',        v_ano_mes,
      'tipo_operacao',  v_tipo_op,
      'data',           v_data,
      'valor',          v_valor
    );
    v_motor := public.fn_classificacao_resolver_contexto(p_cliente_id, v_ctx, true);

    IF (v_motor->>'ok')::boolean THEN
      v_subcentro      := v_motor->>'subcentro';
      v_plano_macro    := v_motor->>'macro_custo';
      v_plano_grupo    := v_motor->>'grupo_custo';
      v_plano_centro   := v_motor->>'centro_custo';
      v_plano_conta_id := NULLIF(v_motor->>'plano_conta_id','')::uuid;
      v_alias_id_usado := NULLIF(v_motor->>'alias_id','')::uuid;
    ELSE
      v_subcentro      := v_subcentro_raw;   -- texto cru → linha órfã (comportamento atual)
      v_plano_conta_id := NULL;
      v_plano_macro    := NULL;
      v_plano_grupo    := NULL;
      v_plano_centro   := NULL;
      v_alias_id_usado := NULL;
    END IF;

    v_match_count := 0;
    v_match_lanc_id := NULL;
    v_match_subcentro := NULL;

    IF v_data IS NOT NULL AND v_valor IS NOT NULL AND v_tipo_op IS NOT NULL THEN
      IF v_tipo_op = '1-Entradas' AND v_conta_destino_id IS NOT NULL THEN
        SELECT COUNT(*), (array_agg(id ORDER BY id))[1]
          INTO v_match_count, v_match_lanc_id
        FROM financeiro_lancamentos_v2
        WHERE cliente_id = p_cliente_id
          AND cancelado = false
          AND ano_mes = COALESCE(v_ano_mes, to_char(v_data, 'YYYY-MM'))
          AND data_pagamento = v_data
          AND ABS(valor) BETWEEN v_valor - 0.005 AND v_valor + 0.005
          AND tipo_operacao = v_tipo_op
          AND conta_destino_id = v_conta_destino_id;

      ELSIF v_tipo_op = (E'2-Saídas') AND v_conta_origem_id IS NOT NULL THEN
        SELECT COUNT(*), (array_agg(id ORDER BY id))[1]
          INTO v_match_count, v_match_lanc_id
        FROM financeiro_lancamentos_v2
        WHERE cliente_id = p_cliente_id
          AND cancelado = false
          AND ano_mes = COALESCE(v_ano_mes, to_char(v_data, 'YYYY-MM'))
          AND data_pagamento = v_data
          AND ABS(valor) BETWEEN v_valor - 0.005 AND v_valor + 0.005
          AND tipo_operacao = v_tipo_op
          AND conta_bancaria_id = v_conta_origem_id;

      ELSIF v_tipo_op = (E'3-Transferências')
            AND v_conta_origem_id IS NOT NULL
            AND v_conta_destino_id IS NOT NULL THEN
        SELECT COUNT(*), (array_agg(id ORDER BY id))[1]
          INTO v_match_count, v_match_lanc_id
        FROM financeiro_lancamentos_v2
        WHERE cliente_id = p_cliente_id
          AND cancelado = false
          AND ano_mes = COALESCE(v_ano_mes, to_char(v_data, 'YYYY-MM'))
          AND data_pagamento = v_data
          AND ABS(valor) BETWEEN v_valor - 0.005 AND v_valor + 0.005
          AND tipo_operacao = v_tipo_op
          AND conta_bancaria_id = v_conta_origem_id
          AND conta_destino_id = v_conta_destino_id;
      END IF;
    END IF;

    IF v_match_count = 1 AND v_match_lanc_id IS NOT NULL THEN
      SELECT subcentro INTO v_match_subcentro
      FROM financeiro_lancamentos_v2
      WHERE id = v_match_lanc_id;
    END IF;

    IF v_tipo_op = (E'3-Transferências') THEN
      v_match_status := CASE
        WHEN v_match_count = 1 THEN 'ja_classificado'
        WHEN v_match_count > 1 THEN 'ambiguo'
        ELSE 'sem_match'
      END;
    ELSIF v_match_count = 0 THEN
      v_match_status := 'sem_match';
    ELSIF v_match_count > 1 THEN
      v_match_status := 'ambiguo';
    ELSIF v_match_subcentro IS NULL THEN
      v_match_status := 'exato';
    ELSIF lower(trim(v_match_subcentro)) = lower(v_subcentro) THEN
      v_match_status := 'ja_classificado';
    ELSE
      v_match_status := 'divergente';
    END IF;

    v_update_proposto := jsonb_strip_nulls(jsonb_build_object(
      'subcentro',      v_subcentro,
      'macro_custo',    v_plano_macro,
      'grupo_custo',    v_plano_grupo,
      'centro_custo',   v_plano_centro,
      'plano_conta_id', v_plano_conta_id,
      'favorecido_id',  v_favorecido_id
    ));

    INSERT INTO financeiro_classificacao_staging (
      sessao_id, cliente_id,
      excel_linha_origem, excel_subcentro, excel_fornecedor, excel_produto,
      excel_conta_origem, excel_conta_destino,
      conta_origem_id, conta_destino_id,
      excel_ano_mes, excel_data, excel_valor, excel_tipo_operacao,
      excel_fazenda_codigo,
      excel_observacao, excel_documento,
      match_lancamento_id, match_status, update_proposto,
      alias_id_usado
    ) VALUES (
      p_sessao_id, p_cliente_id,
      v_linha, v_subcentro_raw, v_fornecedor_txt, v_produto,
      v_conta_origem_txt, v_conta_destino_txt,
      v_conta_origem_id, v_conta_destino_id,
      v_ano_mes, v_data, v_valor, v_tipo_op,
      v_fazenda_codigo,
      v_observacao, v_documento,
      CASE WHEN v_match_count = 1 THEN v_match_lanc_id ELSE NULL END,
      v_match_status, v_update_proposto,
      v_alias_id_usado
    )
    ON CONFLICT (sessao_id, excel_linha_origem) DO NOTHING;

    v_inseridos := v_inseridos + 1;
  END LOOP;

  SELECT jsonb_object_agg(match_status, qt) INTO v_counts
  FROM (
    SELECT match_status, COUNT(*) AS qt
    FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id
    GROUP BY match_status
  ) s;

  RETURN jsonb_build_object(
    'sessao_id', p_sessao_id,
    'total_linhas', v_total,
    'inseridas', v_inseridos,
    'counts_por_status', COALESCE(v_counts, '{}'::jsonb)
  );
END;
$function$;

-- ── 3) re-resolver sessão (só update_proposto/alias_id) ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_reresolver_sessao(p_sessao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_cliente uuid;
  v_row     financeiro_classificacao_staging%ROWTYPE;
  v_ctx     jsonb;
  v_motor   jsonb;
  v_prop    jsonb;
  v_alias   uuid;
  v_proc int := 0; v_res int := 0; v_orfa int := 0; v_ap int := 0; v_ed int := 0; v_mud int := 0;
BEGIN
  SELECT cliente_id INTO v_cliente FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cliente IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_vazia_ou_inexistente');
  END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_cliente IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  SELECT count(*) FILTER (WHERE aplicado),
         count(*) FILTER (WHERE NOT aplicado AND proposto_editado_em IS NOT NULL)
    INTO v_ap, v_ed
  FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id;

  FOR v_row IN
    SELECT * FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id AND aplicado = false AND proposto_editado_em IS NULL
  LOOP
    v_proc := v_proc + 1;

    v_ctx := jsonb_build_object(
      'subcentro',      v_row.excel_subcentro,
      'fornecedor',     v_row.excel_fornecedor,
      'produto',        v_row.excel_produto,
      'observacao',     v_row.excel_observacao,
      'conta_origem',   v_row.excel_conta_origem,
      'conta_destino',  v_row.excel_conta_destino,
      'fazenda_codigo', v_row.excel_fazenda_codigo,
      'ano_mes',        v_row.excel_ano_mes,
      'tipo_operacao',  v_row.excel_tipo_operacao,
      'data',           v_row.excel_data,
      'valor',          v_row.excel_valor
    );
    v_motor := public.fn_classificacao_resolver_contexto(v_cliente, v_ctx, true);

    IF (v_motor->>'ok')::boolean THEN
      v_prop := jsonb_strip_nulls(jsonb_build_object(
        'subcentro',      v_motor->>'subcentro',
        'macro_custo',    v_motor->>'macro_custo',
        'grupo_custo',    v_motor->>'grupo_custo',
        'centro_custo',   v_motor->>'centro_custo',
        'plano_conta_id', v_motor->>'plano_conta_id',
        'favorecido_id',  v_row.update_proposto->>'favorecido_id'   -- preserva favorecido existente
      ));
      v_alias := NULLIF(v_motor->>'alias_id','')::uuid;
      v_res := v_res + 1;
    ELSE
      v_prop := jsonb_strip_nulls(jsonb_build_object(
        'subcentro',     NULLIF(trim(v_row.excel_subcentro), ''),   -- cru → órfão
        'favorecido_id', v_row.update_proposto->>'favorecido_id'
      ));
      v_alias := NULL;
      v_orfa := v_orfa + 1;
    END IF;

    -- Idempotência: só grava quando o resultado do motor difere do atual.
    -- Sem isso, linhas não-afetadas teriam updated_at bumpado a cada execução.
    IF v_prop IS DISTINCT FROM v_row.update_proposto
       OR v_alias IS DISTINCT FROM v_row.alias_id_usado THEN
      UPDATE financeiro_classificacao_staging
      SET update_proposto = v_prop,
          alias_id_usado  = v_alias,
          updated_at      = now()
      WHERE staging_id = v_row.staging_id;
      v_mud := v_mud + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'sessao_id', p_sessao_id,
    'processadas', v_proc, 'mudadas', v_mud, 'resolvidas', v_res, 'ainda_orfa', v_orfa,
    'preservadas_aplicadas', v_ap, 'preservadas_editadas', v_ed
  );
END;
$function$;
