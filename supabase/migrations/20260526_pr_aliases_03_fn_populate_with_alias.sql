-- ====================================================================
-- PR-Aliases-Core (26/05/2026) — fn_classificacao_populate_staging
-- com resolução automática de aliases
-- ====================================================================
-- CONTRATO ARQUITETURAL:
-- Esta função resolve subcentros do Excel em 2 camadas, nessa ordem:
--   1. Alias específico do cliente (financeiro_subcentro_aliases
--      WHERE cliente_id = p_cliente_id)
--   2. Alias global (financeiro_subcentro_aliases WHERE cliente_id IS NULL)
--   3. Lookup direto em financeiro_plano_contas (match exato com lower/trim)
--
-- Se nenhuma camada resolver, v_subcentro mantém a string Excel original
-- e a view vw_classificacao_staging_preview marca como órfão (vermelho,
-- bloqueia Apply via M5-A2).
--
-- PROIBIDO: fuzzy, LIKE, ILIKE, inferência por descrição/observação.
-- PERMITIDO: lower(trim()) como tolerância segura, igual ao lookup
-- direto que já existe em financeiro_plano_contas.
--
-- Esta migration consolida:
--   - Base original (pr_m_02_fn_classificacao_populate)
--   - Hotfix MIN(uuid) → array_agg (pr_m2_2_fix_min_uuid_...)
--   - Novo bloco de resolução de alias (este PR)
--
-- Idempotência: CREATE OR REPLACE com a MESMA assinatura substitui o
-- body sem criar overload.
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

  v_alias_id_usado   uuid;  -- PR-Aliases-Core: audit trail do alias usado
  v_subcentro_raw    text;  -- PR-Aliases-Core: preserva string Excel literal (audit excel_subcentro)

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

    -- PR-Aliases-Core: preservar string Excel raw ANTES de qualquer
    -- mutação por alias. Essa cópia é o que vai pra coluna
    -- excel_subcentro (audit literal). v_subcentro segue como
    -- "buffer de trabalho" e vira canônico se alias resolver.
    v_subcentro_raw := v_subcentro;

    -- =====================================================
    -- PR-Aliases-Core: resolução de alias ANTES do lookup
    -- direto. Se alias resolve, v_subcentro vira canônico
    -- (sobrescreve string Excel) e v_alias_id_usado guarda
    -- audit. Prioridade: alias específico do cliente >
    -- alias global > lookup direto subsequente.
    -- =====================================================
    v_alias_id_usado := NULL;

    IF v_subcentro IS NOT NULL THEN
      SELECT a.id, pc.subcentro, pc.id, pc.macro_custo, pc.grupo_custo, pc.centro_custo
        INTO v_alias_id_usado, v_subcentro, v_plano_conta_id, v_plano_macro, v_plano_grupo, v_plano_centro
      FROM public.financeiro_subcentro_aliases a
      JOIN public.financeiro_plano_contas pc ON pc.id = a.plano_conta_id
      WHERE lower(trim(a.alias_text)) = lower(trim(v_subcentro))
        AND a.ativo = true
        AND pc.ativo = true
        AND (a.cliente_id = p_cliente_id OR a.cliente_id IS NULL)
        AND (pc.cliente_id = p_cliente_id OR pc.cliente_id IS NULL)
      ORDER BY
        (a.cliente_id IS NOT NULL) DESC,  -- alias específico do cliente primeiro
        a.created_at DESC                 -- mais recente em caso de empate
      LIMIT 1;
    END IF;

    -- PR-Aliases-Core FIX: SELECT INTO de 0 rows zera TODAS as vars
    -- do INTO (incluindo v_subcentro). Sem este restore, subcentros
    -- canônicos que existem no plano mas não têm alias param de
    -- resolver via lookup direto subsequente.
    IF v_alias_id_usado IS NULL THEN
      v_subcentro := v_subcentro_raw;
    END IF;

    -- Se alias NÃO resolveu, o bloco "centro exato" abaixo (já existente)
    -- continua executando normalmente. Se alias resolveu, o bloco abaixo
    -- vai re-buscar e retornar o MESMO resultado (idempotente) — não
    -- gera divergência.

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
    -- PR-Aliases-Core: nova coluna alias_id_usado (audit trail).
    INSERT INTO financeiro_classificacao_staging (
      sessao_id, cliente_id,
      excel_linha_origem, excel_subcentro, excel_fornecedor, excel_produto,
      excel_conta_origem, excel_conta_destino,
      excel_ano_mes, excel_data, excel_valor, excel_tipo_operacao,
      excel_fazenda_codigo,
      match_lancamento_id, match_status, update_proposto,
      alias_id_usado
    ) VALUES (
      p_sessao_id, p_cliente_id,
      v_linha, v_subcentro_raw, v_fornecedor_txt, v_produto,
      v_conta_origem_txt, v_conta_destino_txt,
      v_ano_mes, v_data, v_valor, v_tipo_op,
      v_fazenda_codigo,
      CASE WHEN v_match_count = 1 THEN v_match_lanc_id ELSE NULL END,
      v_match_status, v_update_proposto,
      v_alias_id_usado
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
  'PR-Aliases-Core (26/05/2026): popula financeiro_classificacao_staging com resolução de alias (financeiro_subcentro_aliases) ANTES do lookup direto em plano_contas. (array_agg(id ORDER BY id))[1] em vez de MIN(id) (preservado de PR-M2.2). Audit trail via alias_id_usado. NAO aplica UPDATE.';
