-- ====================================================================
-- PR-M2.2 hotfix retroativo (26/05/2026)
-- ====================================================================
-- Fix: substituir 3 MIN(id) por (array_agg(id ORDER BY id))[1] em
-- fn_classificacao_populate_staging.
--
-- Causa: Postgres NÃO tem agregador min(uuid). A versão original da
-- função (commit 307cd5eb, migration 20260526_pr_m_02_*) usava
-- MIN(id) para capturar o primeiro id quando match_count > 1.
-- Resultado: ERROR 42883 "function min(uuid) does not exist" na
-- primeira chamada real (validação operacional do PR-M2.1).
--
-- Aplicado via Chrome MCP no banco proto em 26/05/2026 ANTES desta
-- migration ser commitada. Esta migration apenas VERSIONA o estado
-- atual do banco para evitar drift entre repo e proto.
--
-- Idempotência: CREATE OR REPLACE com a MESMA assinatura
-- (p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb) substitui o
-- body sem criar overload.
--
-- Não toca em:
--   - fn_classificacao_apply (sem MIN(id))
--   - fn_classificacao_resolver_conta (sem MIN(id))
--   - schema da tabela financeiro_classificacao_staging
-- ====================================================================

CREATE OR REPLACE FUNCTION public.fn_classificacao_populate_staging(
  p_sessao_id  uuid,
  p_cliente_id uuid,
  p_rows       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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

  v_conta_origem_id  uuid;
  v_conta_destino_id uuid;
  v_fazenda_id       uuid;
  v_favorecido_id    uuid;
  v_plano_conta_id   uuid;
  v_plano_macro      text;
  v_plano_grupo      text;
  v_plano_centro     text;
  v_plano_count      int;

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
    RAISE EXCEPTION 'p_sessao_id e p_cliente_id obrigatórios';
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

    -- Normalização: '3-Transferência' (singular) → '3-Transferências'
    IF v_tipo_op = '3-Transferência' THEN
      v_tipo_op := '3-Transferências';
    END IF;

    -- ── Resolver fazenda_id (via codigo_importacao) ─────────────────
    v_fazenda_id := NULL;
    IF v_fazenda_codigo IS NOT NULL THEN
      SELECT id INTO v_fazenda_id
      FROM fazendas
      WHERE cliente_id = p_cliente_id
        AND codigo_importacao = v_fazenda_codigo
      LIMIT 1;
    END IF;

    -- ── Resolver contas (origem e destino) ──────────────────────────
    v_conta_origem_id  := fn_classificacao_resolver_conta(p_cliente_id, v_conta_origem_txt);
    v_conta_destino_id := fn_classificacao_resolver_conta(p_cliente_id, v_conta_destino_txt);

    -- ── Resolver fornecedor por nome exato (case-insensitive trim) ──
    v_favorecido_id := NULL;
    IF v_fornecedor_txt IS NOT NULL THEN
      SELECT id INTO v_favorecido_id
      FROM financeiro_fornecedores
      WHERE cliente_id = p_cliente_id
        AND ativo = true
        AND lower(trim(nome)) = lower(v_fornecedor_txt)
      LIMIT 1;
    END IF;

    -- ── Resolver plano_conta_id por subcentro exato ─────────────────
    v_plano_conta_id := NULL;
    v_plano_macro    := NULL;
    v_plano_grupo    := NULL;
    v_plano_centro   := NULL;
    IF v_subcentro IS NOT NULL THEN
      SELECT COUNT(*) INTO v_plano_count
      FROM financeiro_plano_contas
      WHERE (cliente_id = p_cliente_id OR cliente_id IS NULL)
        AND ativo = true
        AND lower(trim(subcentro)) = lower(v_subcentro);

      IF v_plano_count = 1 THEN
        SELECT id, macro_custo, grupo_custo, centro_custo
          INTO v_plano_conta_id, v_plano_macro, v_plano_grupo, v_plano_centro
        FROM financeiro_plano_contas
        WHERE (cliente_id = p_cliente_id OR cliente_id IS NULL)
          AND ativo = true
          AND lower(trim(subcentro)) = lower(v_subcentro)
        LIMIT 1;
      END IF;
      -- v_plano_count > 1 (ambíguo) ou 0 (sem match) → v_plano_conta_id permanece NULL
    END IF;

    -- ── Matching contra financeiro_lancamentos_v2 ──────────────────
    -- Convenção PR-K:
    --   1-Entradas → conta_destino_id
    --   2-Saídas   → conta_bancaria_id
    --   3-Transferências → ambas
    --
    -- PR-M2.2: (array_agg(id ORDER BY id))[1] substituiu MIN(id) —
    -- Postgres não tem agregador min(uuid). Semântica preservada:
    -- captura o "primeiro" id quando match_count > 1 (ordem por uuid
    -- é determinística mas arbitrária; serve só pra detectar caso).
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

      ELSIF v_tipo_op = '2-Saídas' AND v_conta_origem_id IS NOT NULL THEN
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

      ELSIF v_tipo_op = '3-Transferências'
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

    -- Carrega subcentro atual do lanc casado (para detectar divergência)
    IF v_match_count = 1 AND v_match_lanc_id IS NOT NULL THEN
      SELECT subcentro INTO v_match_subcentro
      FROM financeiro_lancamentos_v2
      WHERE id = v_match_lanc_id;
    END IF;

    -- ── Determina match_status ──────────────────────────────────────
    -- Transferências NUNCA viram 'exato' aqui — convenção: transferência
    -- sem subcentro é estado correto. Mantém como 'sem_match' (fora do
    -- universo de UPDATE).
    IF v_tipo_op = '3-Transferências' THEN
      v_match_status := CASE
        WHEN v_match_count = 1 THEN 'ja_classificado'  -- só relatório
        WHEN v_match_count > 1 THEN 'ambiguo'
        ELSE 'sem_match'
      END;
    ELSIF v_match_count = 0 THEN
      v_match_status := 'sem_match';
    ELSIF v_match_count > 1 THEN
      v_match_status := 'ambiguo';
    ELSIF v_match_subcentro IS NULL THEN
      v_match_status := 'exato';  -- candidato UPDATE
    ELSIF lower(trim(v_match_subcentro)) = lower(v_subcentro) THEN
      v_match_status := 'ja_classificado';
    ELSE
      v_match_status := 'divergente';  -- relatório, NÃO atualiza
    END IF;

    -- ── Monta update_proposto (jsonb) ───────────────────────────────
    -- Apply usa COALESCE — campos NULL aqui não sobrescrevem o banco.
    v_update_proposto := jsonb_strip_nulls(jsonb_build_object(
      'subcentro',      v_subcentro,
      'macro_custo',    v_plano_macro,
      'grupo_custo',    v_plano_grupo,
      'centro_custo',   v_plano_centro,
      'plano_conta_id', v_plano_conta_id,
      'favorecido_id',  v_favorecido_id
    ));

    -- ── INSERT na staging ───────────────────────────────────────────
    INSERT INTO financeiro_classificacao_staging (
      sessao_id, cliente_id,
      excel_linha_origem, excel_subcentro, excel_fornecedor, excel_produto,
      excel_conta_origem, excel_conta_destino,
      excel_ano_mes, excel_data, excel_valor, excel_tipo_operacao,
      excel_fazenda_codigo,
      match_lancamento_id, match_status, update_proposto
    ) VALUES (
      p_sessao_id, p_cliente_id,
      v_linha, v_subcentro, v_fornecedor_txt, v_produto,
      v_conta_origem_txt, v_conta_destino_txt,
      v_ano_mes, v_data, v_valor, v_tipo_op,
      v_fazenda_codigo,
      CASE WHEN v_match_count = 1 THEN v_match_lanc_id ELSE NULL END,
      v_match_status, v_update_proposto
    )
    ON CONFLICT (sessao_id, excel_linha_origem) DO NOTHING;

    v_inseridos := v_inseridos + 1;
  END LOOP;

  -- Counts por status (para retorno)
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
$$;

COMMENT ON FUNCTION fn_classificacao_populate_staging IS
  'PR-M2.2 (26/05/2026): popula financeiro_classificacao_staging. (array_agg(id ORDER BY id))[1] em vez de MIN(id) (Postgres não tem min(uuid)). NAO aplica UPDATE. Consultar staging antes de chamar fn_classificacao_apply.';
