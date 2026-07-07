-- ============================================================================
-- PR-MESA-DATA-01 — Candidatos próximos por data (±10 dias ∩ ano_mes), decisão sempre humana.
--
-- "Não quero corrigir o bug. Quero eliminar a classe." [Princípio 9]
-- Etapa: MESA/ENRIQUECIMENTO. O matcher exige data_pagamento = excel_data (igualdade
-- estrita); linhas com candidato plausível a 1-3 dias caem em 'sem_match' e ficam
-- invisíveis. Novo conceito: 'candidatos_proximos' = "há candidatos, o operador
-- escolhe" (Princípio 5). DECISÃO DE PRODUTO (Gabriel): janela ±10 dias ∩ mesmo ano_mes; NUNCA
-- escolher sozinho (nem com candidato único).
--
-- Base: fn_classificacao_populate_staging vigente = corpo de
-- 20260707_pr_mesa_match01_ja_aplicado.sql (commit 54db1db9). Reproduzido VERBATIM
-- + delta 1. O fluxo de data exata (exato/ja_classificado/divergente/ambiguo),
-- a herança (ja_aplicado) e o guard (sem_conta_para_match) ficam INTOCADOS.
--
-- DELTA 1 — populate: passo "candidatos próximos" SÓ quando NOT v_herdado AND
--   NOT v_sem_conta AND v_match_count = 0 (data exata zerou, conta resolvida, sem
--   herança). count(±10d ∩ ano_mes, realizado, mesmo ramo de conta) >= 1 ⇒ 'candidatos_proximos'
--   com match_lancamento_id = NULL (nunca auto-escolhe). count=0 ⇒ permanece sem_match.
-- DELTA 2 — CHECK de match_status += 'candidatos_proximos'.
-- DELTA 3 — fn IRMÃ fn_classificacao_candidatos_proximos: mesma janela/filtros do
--   delta 1 + distancia_dias, ordenada por distância. (Irmã, não extensão: a
--   fn_classificacao_candidatos_ambiguo é acoplada à data EXATA — estendê-la
--   regrediria o fluxo ambíguo. Menor cirurgia = função nova.)
--
-- FRONT (deltas 4-6): NÃO entra aqui. A resolução manual de match não existe na
-- Mesa nova (nem, de fato, na antiga: o drawer de candidatos é read-only, "sem ação
-- de vincular"). Por delta 4, PARAR no front; UI vira decisão de escopo. Ver RELATÓRIO.
--
-- Guard-rails: nada de conciliação bancária; sem índice UNIQUE; sem uso de
-- documento/extrato para desempate; sem auto-aplicar (o lote só varre 'exato').
-- financeiro_lancamentos_v2: só leitura.
-- ============================================================================

-- ── DELTA 2) CHECK de match_status += 'candidatos_proximos' ──────────────────
-- Preserva os 8 valores vigentes (pós MATCH-01) e acrescenta o novo.
ALTER TABLE public.financeiro_classificacao_staging
  DROP CONSTRAINT IF EXISTS financeiro_classificacao_staging_match_status_check;
ALTER TABLE public.financeiro_classificacao_staging
  ADD CONSTRAINT financeiro_classificacao_staging_match_status_check
  CHECK (match_status = ANY (ARRAY['exato','ambiguo','sem_match','ja_classificado','divergente','ambiguo_resolvido','ja_aplicado','sem_conta_para_match','candidatos_proximos']));

-- ── DELTA 1) populate: corpo MESA-MATCH-01 verbatim + passo candidatos próximos ─
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
  -- PR-MESA-DATA-01: candidatos próximos por data (±10d ∩ ano_mes)
  v_prox_count int;
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

    -- reset por linha (PR-MESA-MATCH-01 / PR-MESA-DATA-01)
    v_match_count := 0; v_match_lanc_id := NULL; v_match_subcentro := NULL;
    v_heranca_count := 0; v_heranca_lanc_id := NULL; v_herdado := false; v_sem_conta := false;
    v_prox_count := 0;

    -- PR-MESA-MATCH-01 · PASSO 0: MEMÓRIA DE APLICAÇÃO ANTERIOR.
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
      -- PR-MESA-MATCH-01 · DELTA 3: distingue "sem conta pra procurar" de "procurou e não achou".
      ELSIF v_match_count = 0 THEN v_match_status := CASE WHEN v_sem_conta THEN 'sem_conta_para_match' ELSE 'sem_match' END;
      ELSIF v_match_count > 1 THEN v_match_status := 'ambiguo';
      ELSIF v_match_subcentro IS NULL THEN v_match_status := 'exato';
      ELSIF lower(trim(v_match_subcentro)) = lower(v_subcentro) THEN v_match_status := 'ja_classificado';
      ELSE v_match_status := 'divergente'; END IF;
    END IF;

    -- PR-MESA-DATA-01 · DELTA 1 — CANDIDATOS PRÓXIMOS (±10 dias ∩ ano_mes). Só quando a data
    -- exata zerou (v_match_count=0), a conta foi resolvida (NOT v_sem_conta) e não
    -- houve herança. count>=1 ⇒ 'candidatos_proximos'; match_lancamento_id fica NULL
    -- (NUNCA auto-escolhe — nem com candidato único). count=0 ⇒ permanece sem_match.
    -- Ramo de conta ESPELHA o match exato vigente (idêntico ao candidatos_ambiguo).
    IF NOT v_herdado AND NOT v_sem_conta AND v_match_count = 0 THEN
      SELECT COUNT(*) INTO v_prox_count FROM financeiro_lancamentos_v2
      WHERE cliente_id = p_cliente_id AND cancelado = false AND status_transacao = 'realizado'
        AND ano_mes = COALESCE(v_ano_mes, to_char(v_data,'YYYY-MM'))
        AND ABS(valor) BETWEEN v_valor-0.005 AND v_valor+0.005
        AND tipo_operacao = v_tipo_op
        AND data_pagamento BETWEEN v_data - 10 AND v_data + 10
        AND (
          (v_tipo_op = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN conta_destino_id = v_conta_destino_id
                                              ELSE (conta_destino_id = v_conta_origem_id OR conta_bancaria_id = v_conta_origem_id) END)) OR
          (v_tipo_op = (E'2-Saídas')         AND conta_bancaria_id = v_conta_origem_id) OR
          (v_tipo_op = (E'3-Transferências') AND conta_bancaria_id = v_conta_origem_id AND conta_destino_id = v_conta_destino_id)
        );
      IF v_prox_count >= 1 THEN
        v_match_status := 'candidatos_proximos';
        v_match_lanc_id := NULL;
      END IF;
    END IF;

    v_update_proposto := jsonb_strip_nulls(jsonb_build_object('subcentro', v_subcentro, 'macro_custo', v_plano_macro, 'grupo_custo', v_plano_grupo,
      'centro_custo', v_plano_centro, 'plano_conta_id', v_plano_conta_id, 'favorecido_id', v_favorecido_id)) || jsonb_build_object('_meta', v_meta);

    INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_subcentro, excel_fornecedor, excel_produto,
      excel_conta_origem, excel_conta_destino, conta_origem_id, conta_destino_id, excel_ano_mes, excel_data, excel_valor, excel_tipo_operacao,
      excel_fazenda_codigo, excel_observacao, excel_documento, match_lancamento_id, match_status, update_proposto, alias_id_usado
    ) VALUES (p_sessao_id, p_cliente_id, v_linha, v_subcentro_raw, v_fornecedor_txt, v_produto, v_conta_origem_txt, v_conta_destino_txt,
      v_conta_origem_id, v_conta_destino_id, v_ano_mes, v_data, v_valor, v_tipo_op, v_fazenda_codigo, v_observacao, v_documento,
      -- PR-MESA-MATCH-01 · DELTA 2: grava o id herdado (v_herdado) OU o do match exato (count=1).
      -- candidatos_proximos: v_herdado=false, v_match_count=0 ⇒ grava NULL (decisão humana).
      CASE WHEN v_herdado OR v_match_count=1 THEN v_match_lanc_id ELSE NULL END, v_match_status, v_update_proposto, v_alias_id_usado
    ) ON CONFLICT (sessao_id, excel_linha_origem) DO NOTHING;
    v_inseridos := v_inseridos + 1;
  END LOOP;

  SELECT jsonb_object_agg(match_status, qt) INTO v_counts FROM (SELECT match_status, COUNT(*) AS qt FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id GROUP BY match_status) s;
  RETURN jsonb_build_object('sessao_id', p_sessao_id, 'total_linhas', v_total, 'inseridas', v_inseridos, 'counts_por_status', COALESCE(v_counts, '{}'::jsonb));
END;
$function$;

-- ── DELTA 3) fn IRMÃ: candidatos próximos (±10d ∩ ano_mes) com distancia_dias ──
-- Corpo de fn_classificacao_candidatos_ambiguo (20260702) VERBATIM, exceto:
--   • data EXATA → janela BETWEEN excel_data-10 AND excel_data+10 (∩ ano_mes mantido);
--   • + AND l.status_transacao = 'realizado' (mesmo filtro do delta 1);
--   • RETURNS/SELECT += numero_documento e distancia_dias = ABS(data_pagamento - excel_data);
--   • ORDER BY distância (mais perto primeiro), depois id.
-- A expressão de conta por ramo é idêntica (espelha o match exato).
CREATE OR REPLACE FUNCTION public.fn_classificacao_candidatos_proximos(p_staging_id uuid)
 RETURNS TABLE(lanc_id uuid, descricao text, observacao text, data_pagamento date, valor numeric, tipo_operacao text, subcentro_atual text, macro_atual text, grupo_atual text, favorecido_id uuid, favorecido_nome text, conta_bancaria_nome text, conta_destino_nome text, documento text, distancia_dias int)
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
    l.favorecido_id, fo.nome, cb.nome_exibicao, cd.nome_exibicao,
    l.numero_documento, ABS(l.data_pagamento - v_s.excel_data)::int
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_fornecedores     fo ON fo.id = l.favorecido_id
  LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
  LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
  WHERE l.cliente_id = v_s.cliente_id
    AND l.cancelado = false
    AND l.status_transacao = 'realizado'
    AND l.ano_mes = v_ano_mes
    AND l.data_pagamento BETWEEN v_s.excel_data - 10 AND v_s.excel_data + 10
    AND ABS(l.valor) BETWEEN v_s.excel_valor - 0.005 AND v_s.excel_valor + 0.005
    AND l.tipo_operacao = v_s.excel_tipo_operacao
    AND (
      (l.tipo_operacao = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN l.conta_destino_id = v_conta_destino_id
                                                ELSE (l.conta_destino_id = v_conta_origem_id OR l.conta_bancaria_id = v_conta_origem_id) END)) OR
      (l.tipo_operacao = '2-Saídas'          AND l.conta_bancaria_id = v_conta_origem_id) OR
      (l.tipo_operacao = '3-Transferências'  AND l.conta_bancaria_id = v_conta_origem_id AND l.conta_destino_id = v_conta_destino_id)
    )
  ORDER BY ABS(l.data_pagamento - v_s.excel_data), l.id
  LIMIT 10;
END;
$function$;
