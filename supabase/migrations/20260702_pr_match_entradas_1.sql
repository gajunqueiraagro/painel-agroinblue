-- ============================================================================
-- PR-MATCH-ENTRADAS-1 — Corrige falso sem_match em 1-Entradas.
--
-- Convenção: o Excel traz a conta da Entrada na coluna "Conta" (→ conta_origem),
-- deixando conta_destino vazio; o lançamento guarda em conta_destino_id/
-- conta_bancaria_id. Regra nova (SÓ Entradas):
--   - se conta_destino_id do Excel existir → regra ATUAL (conta_destino_id).
--   - senão, se conta_origem_id existir → casar (conta_destino_id = origem OR
--     conta_bancaria_id = origem). cancelado=false sempre.
-- Saídas e Transferências: INALTERADAS. apply/motor/editor/update_proposto: intocados.
-- financeiro_lancamentos_v2: só leitura.
-- ============================================================================

-- ── 1) populate: branch de 1-Entradas estendido ─────────────────────────────
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
    v_linha := (v_row->>'linha')::int;
    v_subcentro := NULLIF(trim(v_row->>'subcentro'), '');
    v_fornecedor_txt := NULLIF(trim(v_row->>'fornecedor'), '');
    v_produto := NULLIF(trim(v_row->>'produto'), '');
    v_conta_origem_txt := NULLIF(trim(v_row->>'conta_origem'), '');
    v_conta_destino_txt := NULLIF(trim(v_row->>'conta_destino'), '');
    v_ano_mes := NULLIF(trim(v_row->>'ano_mes'), '');
    v_data := NULLIF(v_row->>'data', '')::date;
    v_valor := (v_row->>'valor')::numeric;
    v_tipo_op := NULLIF(trim(v_row->>'tipo_operacao'), '');
    v_fazenda_codigo := NULLIF(trim(v_row->>'fazenda_codigo'), '');
    v_observacao := NULLIF(trim(v_row->>'observacao'), '');
    v_documento := NULLIF(trim(v_row->>'documento'), '');
    IF v_tipo_op = (E'3-Transferência') THEN v_tipo_op := (E'3-Transferências'); END IF;

    v_fazenda_id := NULL;
    IF v_fazenda_codigo IS NOT NULL THEN
      SELECT id INTO v_fazenda_id FROM fazendas WHERE cliente_id = p_cliente_id AND codigo_importacao = v_fazenda_codigo LIMIT 1;
    END IF;
    v_conta_origem_id := COALESCE(NULLIF(v_row->>'conta_origem_id','')::uuid, fn_classificacao_resolver_conta(p_cliente_id, v_conta_origem_txt));
    v_conta_destino_id := COALESCE(NULLIF(v_row->>'conta_destino_id','')::uuid, fn_classificacao_resolver_conta(p_cliente_id, v_conta_destino_txt));
    v_favorecido_id := NULL;
    IF v_fornecedor_txt IS NOT NULL THEN
      SELECT id INTO v_favorecido_id FROM financeiro_fornecedores WHERE cliente_id = p_cliente_id AND ativo = true AND lower(trim(nome)) = lower(v_fornecedor_txt) LIMIT 1;
    END IF;
    v_subcentro_raw := v_subcentro;

    v_ctx := jsonb_build_object('subcentro', v_subcentro_raw, 'fornecedor', v_fornecedor_txt, 'produto', v_produto,
      'observacao', v_observacao, 'conta_origem', v_conta_origem_txt, 'conta_destino', v_conta_destino_txt,
      'fazenda_codigo', v_fazenda_codigo, 'ano_mes', v_ano_mes, 'tipo_operacao', v_tipo_op, 'data', v_data, 'valor', v_valor);
    v_motor := public.fn_classificacao_resolver_contexto(p_cliente_id, v_ctx, true);
    v_meta  := public.fn_classificacao_meta(v_motor);

    IF (v_motor->>'ok')::boolean THEN
      v_subcentro := v_motor->>'subcentro'; v_plano_macro := v_motor->>'macro_custo'; v_plano_grupo := v_motor->>'grupo_custo';
      v_plano_centro := v_motor->>'centro_custo'; v_plano_conta_id := NULLIF(v_motor->>'plano_conta_id','')::uuid; v_alias_id_usado := NULLIF(v_motor->>'alias_id','')::uuid;
    ELSE
      v_subcentro := v_subcentro_raw; v_plano_conta_id := NULL; v_plano_macro := NULL; v_plano_grupo := NULL; v_plano_centro := NULL; v_alias_id_usado := NULL;
    END IF;

    v_match_count := 0; v_match_lanc_id := NULL; v_match_subcentro := NULL;
    IF v_data IS NOT NULL AND v_valor IS NOT NULL AND v_tipo_op IS NOT NULL THEN
      -- 1-Entradas (PR-MATCH-ENTRADAS-1): conta de entrada = destino se houver, senão origem.
      IF v_tipo_op = '1-Entradas' AND COALESCE(v_conta_destino_id, v_conta_origem_id) IS NOT NULL THEN
        SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_match_count, v_match_lanc_id FROM financeiro_lancamentos_v2
        WHERE cliente_id = p_cliente_id AND cancelado = false AND ano_mes = COALESCE(v_ano_mes, to_char(v_data,'YYYY-MM')) AND data_pagamento = v_data AND ABS(valor) BETWEEN v_valor-0.005 AND v_valor+0.005 AND tipo_operacao = v_tipo_op
          AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN conta_destino_id = v_conta_destino_id
                    ELSE (conta_destino_id = v_conta_origem_id OR conta_bancaria_id = v_conta_origem_id) END);
      ELSIF v_tipo_op = (E'2-Saídas') AND v_conta_origem_id IS NOT NULL THEN
        SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_match_count, v_match_lanc_id FROM financeiro_lancamentos_v2
        WHERE cliente_id = p_cliente_id AND cancelado = false AND ano_mes = COALESCE(v_ano_mes, to_char(v_data,'YYYY-MM')) AND data_pagamento = v_data AND ABS(valor) BETWEEN v_valor-0.005 AND v_valor+0.005 AND tipo_operacao = v_tipo_op AND conta_bancaria_id = v_conta_origem_id;
      ELSIF v_tipo_op = (E'3-Transferências') AND v_conta_origem_id IS NOT NULL AND v_conta_destino_id IS NOT NULL THEN
        SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_match_count, v_match_lanc_id FROM financeiro_lancamentos_v2
        WHERE cliente_id = p_cliente_id AND cancelado = false AND ano_mes = COALESCE(v_ano_mes, to_char(v_data,'YYYY-MM')) AND data_pagamento = v_data AND ABS(valor) BETWEEN v_valor-0.005 AND v_valor+0.005 AND tipo_operacao = v_tipo_op AND conta_bancaria_id = v_conta_origem_id AND conta_destino_id = v_conta_destino_id;
      END IF;
    END IF;
    IF v_match_count = 1 AND v_match_lanc_id IS NOT NULL THEN SELECT subcentro INTO v_match_subcentro FROM financeiro_lancamentos_v2 WHERE id = v_match_lanc_id; END IF;
    IF v_tipo_op = (E'3-Transferências') THEN v_match_status := CASE WHEN v_match_count=1 THEN 'ja_classificado' WHEN v_match_count>1 THEN 'ambiguo' ELSE 'sem_match' END;
    ELSIF v_match_count = 0 THEN v_match_status := 'sem_match';
    ELSIF v_match_count > 1 THEN v_match_status := 'ambiguo';
    ELSIF v_match_subcentro IS NULL THEN v_match_status := 'exato';
    ELSIF lower(trim(v_match_subcentro)) = lower(v_subcentro) THEN v_match_status := 'ja_classificado';
    ELSE v_match_status := 'divergente'; END IF;

    v_update_proposto := jsonb_strip_nulls(jsonb_build_object('subcentro', v_subcentro, 'macro_custo', v_plano_macro, 'grupo_custo', v_plano_grupo,
      'centro_custo', v_plano_centro, 'plano_conta_id', v_plano_conta_id, 'favorecido_id', v_favorecido_id)) || jsonb_build_object('_meta', v_meta);

    INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_subcentro, excel_fornecedor, excel_produto,
      excel_conta_origem, excel_conta_destino, conta_origem_id, conta_destino_id, excel_ano_mes, excel_data, excel_valor, excel_tipo_operacao,
      excel_fazenda_codigo, excel_observacao, excel_documento, match_lancamento_id, match_status, update_proposto, alias_id_usado
    ) VALUES (p_sessao_id, p_cliente_id, v_linha, v_subcentro_raw, v_fornecedor_txt, v_produto, v_conta_origem_txt, v_conta_destino_txt,
      v_conta_origem_id, v_conta_destino_id, v_ano_mes, v_data, v_valor, v_tipo_op, v_fazenda_codigo, v_observacao, v_documento,
      CASE WHEN v_match_count=1 THEN v_match_lanc_id ELSE NULL END, v_match_status, v_update_proposto, v_alias_id_usado
    ) ON CONFLICT (sessao_id, excel_linha_origem) DO NOTHING;
    v_inseridos := v_inseridos + 1;
  END LOOP;

  SELECT jsonb_object_agg(match_status, qt) INTO v_counts FROM (SELECT match_status, COUNT(*) AS qt FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id GROUP BY match_status) s;
  RETURN jsonb_build_object('sessao_id', p_sessao_id, 'total_linhas', v_total, 'inseridas', v_inseridos, 'counts_por_status', COALESCE(v_counts, '{}'::jsonb));
END;
$function$;

-- ── 2) candidatos_ambiguo: mesma regra de Entrada ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_candidatos_ambiguo(p_staging_id uuid)
 RETURNS TABLE(lanc_id uuid, descricao text, observacao text, data_pagamento date, valor numeric, tipo_operacao text, subcentro_atual text, macro_atual text, grupo_atual text, favorecido_id uuid, favorecido_nome text, conta_bancaria_nome text, conta_destino_nome text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_s RECORD; v_conta_origem_id uuid; v_conta_destino_id uuid; v_ano_mes text;
BEGIN
  SELECT * INTO v_s FROM public.financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_conta_origem_id  := COALESCE(v_s.conta_origem_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_origem));
  v_conta_destino_id := COALESCE(v_s.conta_destino_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_destino));
  v_ano_mes := COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM'));

  RETURN QUERY
  SELECT
    l.id, l.descricao, l.observacao, l.data_pagamento, l.valor,
    l.tipo_operacao, l.subcentro, l.macro_custo, l.grupo_custo,
    l.favorecido_id, fo.nome, cb.nome_exibicao, cd.nome_exibicao
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_fornecedores     fo ON fo.id = l.favorecido_id
  LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
  LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
  WHERE l.cliente_id = v_s.cliente_id
    AND l.cancelado = false
    AND l.ano_mes = v_ano_mes
    AND l.data_pagamento = v_s.excel_data
    AND ABS(l.valor) BETWEEN v_s.excel_valor - 0.005 AND v_s.excel_valor + 0.005
    AND l.tipo_operacao = v_s.excel_tipo_operacao
    AND (
      (l.tipo_operacao = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN l.conta_destino_id = v_conta_destino_id
                                                ELSE (l.conta_destino_id = v_conta_origem_id OR l.conta_bancaria_id = v_conta_origem_id) END)) OR
      (l.tipo_operacao = '2-Saídas'          AND l.conta_bancaria_id = v_conta_origem_id) OR
      (l.tipo_operacao = '3-Transferências'  AND l.conta_bancaria_id = v_conta_origem_id AND l.conta_destino_id = v_conta_destino_id)
    )
  ORDER BY l.data_pagamento, l.id
  LIMIT 10;
END;
$function$;

-- ── 3) reresolver_match_sessao: recalcula SÓ match_status/match_lancamento_id ─
-- ESCOPO ESTRITO: apenas 1-Entradas com match_status='sem_match' (o alvo do falso
-- sem_match) -> NUNCA toca linhas já casadas (exato/divergente/ja_classificado/
-- ambiguo/ambiguo_resolvido), nem Saídas/Transferências. Só promove sem_match ->
-- casado. Mantém aplicado=false; NUNCA toca update_proposto. Casa só cancelado=false.
--
-- ############################################################################
-- ## NAO AMPLIAR O ESCOPO DESTE LOOP - REGRA PERMANENTE                      ##
-- ## O filtro `match_status = 'sem_match'` no FOR abaixo e OBRIGATORIO.      ##
-- ## Troca-lo por `match_status <> 'ambiguo_resolvido'` (ou qualquer filtro  ##
-- ## mais amplo) faz a funcao recomputar Entradas JA CASADAS e derruba-las   ##
-- ## para sem_match. Foi exatamente o incidente de 02/07/2026 (463 linhas    ##
-- ## alteradas, recuperadas via backup diario). Esta funcao SO PROMOVE       ##
-- ## sem_match -> casado; jamais rebaixa uma linha ja casada.                ##
-- ############################################################################
CREATE OR REPLACE FUNCTION public.fn_classificacao_reresolver_match_sessao(p_sessao_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid; v_cliente uuid; v_row financeiro_classificacao_staging%ROWTYPE;
  v_ano_mes text; v_prop_sub text; v_mc int; v_ml uuid; v_msub text; v_status text; v_ml_final uuid;
  v_proc int:=0; v_mud int:=0; v_ex int:=0; v_amb int:=0; v_sm int:=0; v_ap int:=0; v_ar int:=0;
BEGIN
  SELECT cliente_id INTO v_cliente FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cliente IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_vazia_ou_inexistente'); END IF;
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR v_cliente IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  SELECT count(*) FILTER (WHERE aplicado), count(*) FILTER (WHERE match_status = 'ambiguo_resolvido')
    INTO v_ap, v_ar FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id;

  FOR v_row IN SELECT * FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id AND aplicado = false AND match_status = 'sem_match'
      AND excel_tipo_operacao = '1-Entradas'
  LOOP
    v_proc := v_proc + 1;
    v_ano_mes := COALESCE(v_row.excel_ano_mes, to_char(v_row.excel_data, 'YYYY-MM'));
    v_prop_sub := v_row.update_proposto ->> 'subcentro';
    v_mc := 0; v_ml := NULL; v_msub := NULL;

    IF v_row.excel_data IS NOT NULL AND v_row.excel_valor IS NOT NULL AND v_row.excel_tipo_operacao IS NOT NULL THEN
      IF v_row.excel_tipo_operacao = '1-Entradas' AND COALESCE(v_row.conta_destino_id, v_row.conta_origem_id) IS NOT NULL THEN
        SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_mc, v_ml FROM financeiro_lancamentos_v2
        WHERE cliente_id = v_cliente AND cancelado = false AND ano_mes = v_ano_mes AND data_pagamento = v_row.excel_data
          AND ABS(valor) BETWEEN v_row.excel_valor-0.005 AND v_row.excel_valor+0.005 AND tipo_operacao = '1-Entradas'
          AND (CASE WHEN v_row.conta_destino_id IS NOT NULL THEN conta_destino_id = v_row.conta_destino_id
                    ELSE (conta_destino_id = v_row.conta_origem_id OR conta_bancaria_id = v_row.conta_origem_id) END);
      ELSIF v_row.excel_tipo_operacao = (E'2-Saídas') AND v_row.conta_origem_id IS NOT NULL THEN
        SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_mc, v_ml FROM financeiro_lancamentos_v2
        WHERE cliente_id = v_cliente AND cancelado = false AND ano_mes = v_ano_mes AND data_pagamento = v_row.excel_data
          AND ABS(valor) BETWEEN v_row.excel_valor-0.005 AND v_row.excel_valor+0.005 AND tipo_operacao = (E'2-Saídas') AND conta_bancaria_id = v_row.conta_origem_id;
      ELSIF v_row.excel_tipo_operacao = (E'3-Transferências') AND v_row.conta_origem_id IS NOT NULL AND v_row.conta_destino_id IS NOT NULL THEN
        SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_mc, v_ml FROM financeiro_lancamentos_v2
        WHERE cliente_id = v_cliente AND cancelado = false AND ano_mes = v_ano_mes AND data_pagamento = v_row.excel_data
          AND ABS(valor) BETWEEN v_row.excel_valor-0.005 AND v_row.excel_valor+0.005 AND tipo_operacao = (E'3-Transferências') AND conta_bancaria_id = v_row.conta_origem_id AND conta_destino_id = v_row.conta_destino_id;
      END IF;
    END IF;

    IF v_mc = 1 AND v_ml IS NOT NULL THEN SELECT subcentro INTO v_msub FROM financeiro_lancamentos_v2 WHERE id = v_ml; END IF;
    IF v_row.excel_tipo_operacao = (E'3-Transferências') THEN v_status := CASE WHEN v_mc=1 THEN 'ja_classificado' WHEN v_mc>1 THEN 'ambiguo' ELSE 'sem_match' END;
    ELSIF v_mc = 0 THEN v_status := 'sem_match';
    ELSIF v_mc > 1 THEN v_status := 'ambiguo';
    ELSIF v_msub IS NULL THEN v_status := 'exato';
    ELSIF lower(trim(v_msub)) = lower(COALESCE(v_prop_sub,'')) THEN v_status := 'ja_classificado';
    ELSE v_status := 'divergente'; END IF;
    v_ml_final := CASE WHEN v_mc = 1 THEN v_ml ELSE NULL END;

    -- grava só se mudou; NÃO toca update_proposto
    IF v_row.match_status IS DISTINCT FROM v_status OR v_row.match_lancamento_id IS DISTINCT FROM v_ml_final THEN
      UPDATE financeiro_classificacao_staging
        SET match_status = v_status, match_lancamento_id = v_ml_final, updated_at = now()
        WHERE staging_id = v_row.staging_id;
      v_mud := v_mud + 1;
    END IF;
    IF v_status = 'exato' THEN v_ex := v_ex + 1; ELSIF v_status = 'ambiguo' THEN v_amb := v_amb + 1; ELSIF v_status = 'sem_match' THEN v_sm := v_sm + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'sessao_id', p_sessao_id,
    'processadas', v_proc, 'mudadas', v_mud, 'exato', v_ex, 'ambiguo', v_amb, 'sem_match', v_sm,
    'preservadas_aplicadas', v_ap, 'preservadas_ambiguo_resolvido', v_ar);
END;
$function$;
