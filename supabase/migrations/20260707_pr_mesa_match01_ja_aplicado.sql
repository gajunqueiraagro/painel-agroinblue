-- ============================================================================
-- PR-MESA-MATCH-01 — Mesa reconhece lançamento que ela própria já criou/aplicou.
--
-- "Não quero corrigir o bug. Quero eliminar a classe." [Princípio 9]
-- Etapa: MESA/ENRIQUECIMENTO (staging de classificação).
--
-- Base do corpo: PR-MATCH-ENTRADAS-1 (20260702_pr_match_entradas_1.sql) — a versão
-- VIGENTE de fn_classificacao_populate_staging no repo. NÃO é a 20260526 citada no
-- briefing (superada por fix posterior; divergência reportada — briefing manda
-- "partir da versão mais recente no repo"). Corpo reproduzido VERBATIM + 3 deltas.
--
-- DELTA 1/2 — PASSO 0: memória de aplicação anterior. Antes do match por atributos,
--   se a MESMA linha (por conteúdo: valor+data+tipo_op+fornecedor) já foi aplicada
--   num populate anterior e gerou um lançamento VIVO, herda esse vínculo. Só herda
--   se o match_lancamento_id for ÚNICO (count(DISTINCT)=1); 2+ ⇒ não chuta. Status
--   herdado = 'ja_aplicado'; o INSERT grava o id herdado.
-- DELTA 3 — transparência do guard: quando o match por atributos é PULADO por falta
--   de conta resolvida (entrada sem destino/origem; saída sem origem), status =
--   'sem_conta_para_match' em vez do genérico 'sem_match' (mantido para "procurou e
--   não achou").
-- DELTA 4 — CHECK de match_status passa a aceitar os 2 status novos.
--
-- Escopo: SÓ fn_classificacao_populate_staging + o CHECK. candidatos_ambiguo,
-- reresolver_match_sessao, apply/apply_row/apply_lote e a política de data: INTOCADOS.
-- financeiro_lancamentos_v2 e cbi/extrato: só leitura / não tocados.
-- ============================================================================

-- ── DELTA 4) CHECK de match_status += 'ja_aplicado','sem_conta_para_match' ────
-- Idioma copiado de 20260701_pr_e3_resolver_ambiguo.sql; preserva os 6 valores
-- vigentes e acrescenta os 2 novos.
ALTER TABLE public.financeiro_classificacao_staging
  DROP CONSTRAINT IF EXISTS financeiro_classificacao_staging_match_status_check;
ALTER TABLE public.financeiro_classificacao_staging
  ADD CONSTRAINT financeiro_classificacao_staging_match_status_check
  CHECK (match_status = ANY (ARRAY['exato','ambiguo','sem_match','ja_classificado','divergente','ambiguo_resolvido','ja_aplicado','sem_conta_para_match']));

-- ── populate: corpo PR-MATCH-ENTRADAS-1 verbatim + DELTAS 1/2/3 ──────────────
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
  -- PR-MESA-MATCH-01: memória de aplicação anterior + transparência do guard
  v_heranca_count int; v_heranca_lanc_id uuid; v_herdado boolean; v_sem_conta boolean;
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

    -- reset por linha (PR-MESA-MATCH-01)
    v_match_count := 0; v_match_lanc_id := NULL; v_match_subcentro := NULL;
    v_heranca_count := 0; v_heranca_lanc_id := NULL; v_herdado := false; v_sem_conta := false;

    -- PR-MESA-MATCH-01 · DELTA 1/2 — PASSO 0: MEMÓRIA DE APLICAÇÃO ANTERIOR.
    -- Se a MESMA linha (por conteúdo) já foi aplicada num populate anterior e gerou
    -- um lançamento VIVO (cancelado=false), herda esse vínculo. REGRA DE SEGURANÇA:
    -- só herda com match_lancamento_id ÚNICO (count(DISTINCT)=1); conteúdo ambíguo
    -- (2+ lançamentos distintos) ⇒ NÃO herda, segue o fluxo normal (o sistema não chuta).
    IF v_valor IS NOT NULL AND v_data IS NOT NULL AND v_tipo_op IS NOT NULL THEN
      SELECT COUNT(DISTINCT s.match_lancamento_id), (array_agg(DISTINCT s.match_lancamento_id))[1]
        INTO v_heranca_count, v_heranca_lanc_id
        FROM financeiro_classificacao_staging s
        JOIN financeiro_lancamentos_v2 l ON l.id = s.match_lancamento_id
       WHERE s.cliente_id = p_cliente_id
         AND s.aplicado = true
         AND s.match_lancamento_id IS NOT NULL
         AND s.excel_valor = v_valor
         AND s.excel_data = v_data
         AND s.excel_tipo_operacao = v_tipo_op
         AND COALESCE(s.excel_fornecedor,'') = COALESCE(v_fornecedor_txt,'')
         AND l.cancelado = false;
    END IF;

    IF v_heranca_count = 1 AND v_heranca_lanc_id IS NOT NULL THEN
      -- herdou: a Mesa reconhece o próprio filho; NÃO roda o match por atributos.
      v_herdado := true;
      v_match_lanc_id := v_heranca_lanc_id;
      v_match_status := 'ja_aplicado';
    ELSE
      -- ── match por atributos (corpo PR-MATCH-ENTRADAS-1 verbatim) ──
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
        -- PR-MESA-MATCH-01 · DELTA 3 — o match por atributos foi PULADO por falta de
        -- conta resolvida (entrada sem destino/origem; saída sem origem). Marca sem_conta.
        ELSIF v_tipo_op = '1-Entradas' AND COALESCE(v_conta_destino_id, v_conta_origem_id) IS NULL THEN
          v_sem_conta := true;
        ELSIF v_tipo_op = (E'2-Saídas') AND v_conta_origem_id IS NULL THEN
          v_sem_conta := true;
        END IF;
      END IF;
      IF v_match_count = 1 AND v_match_lanc_id IS NOT NULL THEN SELECT subcentro INTO v_match_subcentro FROM financeiro_lancamentos_v2 WHERE id = v_match_lanc_id; END IF;
      IF v_tipo_op = (E'3-Transferências') THEN v_match_status := CASE WHEN v_match_count=1 THEN 'ja_classificado' WHEN v_match_count>1 THEN 'ambiguo' ELSE 'sem_match' END;
      -- DELTA 3: distingue "sem conta pra procurar" de "procurou e não achou".
      ELSIF v_match_count = 0 THEN v_match_status := CASE WHEN v_sem_conta THEN 'sem_conta_para_match' ELSE 'sem_match' END;
      ELSIF v_match_count > 1 THEN v_match_status := 'ambiguo';
      ELSIF v_match_subcentro IS NULL THEN v_match_status := 'exato';
      ELSIF lower(trim(v_match_subcentro)) = lower(v_subcentro) THEN v_match_status := 'ja_classificado';
      ELSE v_match_status := 'divergente'; END IF;
    END IF;

    v_update_proposto := jsonb_strip_nulls(jsonb_build_object('subcentro', v_subcentro, 'macro_custo', v_plano_macro, 'grupo_custo', v_plano_grupo,
      'centro_custo', v_plano_centro, 'plano_conta_id', v_plano_conta_id, 'favorecido_id', v_favorecido_id)) || jsonb_build_object('_meta', v_meta);

    INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_subcentro, excel_fornecedor, excel_produto,
      excel_conta_origem, excel_conta_destino, conta_origem_id, conta_destino_id, excel_ano_mes, excel_data, excel_valor, excel_tipo_operacao,
      excel_fazenda_codigo, excel_observacao, excel_documento, match_lancamento_id, match_status, update_proposto, alias_id_usado
    ) VALUES (p_sessao_id, p_cliente_id, v_linha, v_subcentro_raw, v_fornecedor_txt, v_produto, v_conta_origem_txt, v_conta_destino_txt,
      v_conta_origem_id, v_conta_destino_id, v_ano_mes, v_data, v_valor, v_tipo_op, v_fazenda_codigo, v_observacao, v_documento,
      -- DELTA 2: grava o id herdado (v_herdado) OU o do match por atributos (count=1).
      CASE WHEN v_herdado OR v_match_count=1 THEN v_match_lanc_id ELSE NULL END, v_match_status, v_update_proposto, v_alias_id_usado
    ) ON CONFLICT (sessao_id, excel_linha_origem) DO NOTHING;
    v_inseridos := v_inseridos + 1;
  END LOOP;

  SELECT jsonb_object_agg(match_status, qt) INTO v_counts FROM (SELECT match_status, COUNT(*) AS qt FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id GROUP BY match_status) s;
  RETURN jsonb_build_object('sessao_id', p_sessao_id, 'total_linhas', v_total, 'inseridas', v_inseridos, 'counts_por_status', COALESCE(v_counts, '{}'::jsonb));
END;
$function$;
