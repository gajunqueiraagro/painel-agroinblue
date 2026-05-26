-- ====================================================================
-- PR-M (26/05/2026) — fn_classificacao_populate_staging
-- ====================================================================
-- Popula financeiro_classificacao_staging a partir de linhas do Excel
-- referência (formato EXPORT_APP_UNICO). NÃO aplica UPDATE em
-- financeiro_lancamentos_v2 — apenas registra propostas para revisão.
--
-- Operacional:
--   1. Operador parseia o Excel localmente para JSON com este shape
--      (1 row por linha do Excel):
--        {
--          "linha": 2,                              -- 1-based, número da linha no XLSX
--          "subcentro": "Pec/ADM/Despesas Financeiras",
--          "fornecedor": "Sicredi",                 -- nome textual
--          "produto": "IOF ADICIONAL PF",
--          "conta_origem": "cc-004 | sicredi pecuária",
--          "conta_destino": "terceiros | . .",
--          "ano_mes": "2026-04",
--          "data": "2026-04-01",
--          "valor": 685.71,
--          "tipo_operacao": "2-Saídas",             -- já normalizado (singular vira plural)
--          "fazenda_codigo": "ADM"                  -- ADM / SR / BR (codigo_importacao)
--        }
--   2. Chama: SELECT fn_classificacao_populate_staging('<uuid-sessao>'::uuid,
--                                                       '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'::uuid,
--                                                       '[ ...rows... ]'::jsonb);
--   3. Consulta a staging populada (counts por match_status) ANTES de aplicar.
--
-- Regras de matching (estritas, sem fuzzy):
--   - Conta: split('|')[0].trim() → split('-') → (tipo, parseInt(codigo))
--     ('cc',N) → financeiro_contas_bancarias WHERE tipo_conta='cc' AND
--     parseInt(codigo_conta)=N (case 'c.credito' → tipo_conta='cartao')
--     'terceiros' → NULL (sentinela)
--   - Fornecedor: lower(trim()) exato vs financeiro_fornecedores.nome
--   - Plano: subcentro exato vs financeiro_plano_contas.subcentro
--   - Fazenda: codigo_importacao exato
--   - Match lanc: cliente_id + ano_mes + data_pagamento + ABS(valor) +
--                 tipo_operacao + (conta_bancaria_id OU conta_destino_id
--                 conforme convenção PR-K)
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
    v_match_count := 0;
    v_match_lanc_id := NULL;
    v_match_subcentro := NULL;

    IF v_data IS NOT NULL AND v_valor IS NOT NULL AND v_tipo_op IS NOT NULL THEN
      IF v_tipo_op = '1-Entradas' AND v_conta_destino_id IS NOT NULL THEN
        SELECT COUNT(*), MIN(id) INTO v_match_count, v_match_lanc_id
        FROM financeiro_lancamentos_v2
        WHERE cliente_id = p_cliente_id
          AND cancelado = false
          AND ano_mes = COALESCE(v_ano_mes, to_char(v_data, 'YYYY-MM'))
          AND data_pagamento = v_data
          AND ABS(valor) BETWEEN v_valor - 0.005 AND v_valor + 0.005
          AND tipo_operacao = v_tipo_op
          AND conta_destino_id = v_conta_destino_id;

      ELSIF v_tipo_op = '2-Saídas' AND v_conta_origem_id IS NOT NULL THEN
        SELECT COUNT(*), MIN(id) INTO v_match_count, v_match_lanc_id
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
        SELECT COUNT(*), MIN(id) INTO v_match_count, v_match_lanc_id
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
  'PR-M: popula financeiro_classificacao_staging. NAO aplica UPDATE. Consultar staging antes de chamar fn_classificacao_apply.';

-- ====================================================================
-- Helper: fn_classificacao_resolver_conta
-- ====================================================================
-- Resolve string Excel "cc-001 | banco do brasil pecuária" para uuid
-- de financeiro_contas_bancarias. Regra determinística:
--   1. Split por '|' → primeiro pedaço trim ("cc-001")
--   2. Split por '-' → [tipo='cc', codigo='001']
--   3. Mapeia tipo: cc→cc, inv→inv, c.credito→cartao
--      'terceiros' → NULL (sentinela)
--   4. parseInt(codigo) e WHERE tipo_conta=$2 AND parseInt(codigo_conta)=$3
-- ====================================================================

CREATE OR REPLACE FUNCTION public.fn_classificacao_resolver_conta(
  p_cliente_id uuid,
  p_texto      text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pre       text;
  v_partes    text[];
  v_prefixo   text;
  v_codigo_n  int;
  v_tipo_db   text;
  v_id        uuid;
BEGIN
  IF p_texto IS NULL OR trim(p_texto) = '' THEN
    RETURN NULL;
  END IF;

  -- "cc-001 | banco do brasil pecuária" → "cc-001"
  v_pre := lower(trim(split_part(p_texto, '|', 1)));

  -- "cc-001" → ['cc', '001']
  v_partes := string_to_array(v_pre, '-');
  IF array_length(v_partes, 1) < 2 THEN
    RETURN NULL;
  END IF;

  v_prefixo := v_partes[1];

  -- Sentinela 'terceiros | . .' → não tenta match
  IF v_prefixo = 'terceiros' THEN
    RETURN NULL;
  END IF;

  -- Mapeia prefixo → tipo_conta oficial (PR-H1)
  v_tipo_db := CASE v_prefixo
    WHEN 'cc'        THEN 'cc'
    WHEN 'inv'       THEN 'inv'
    WHEN 'c.credito' THEN 'cartao'
    ELSE NULL
  END;

  IF v_tipo_db IS NULL THEN
    RETURN NULL;
  END IF;

  -- "001" → 1
  BEGIN
    v_codigo_n := (regexp_replace(v_partes[2], '^0+', '', 'g'))::int;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  -- Match no banco: tipo + parseInt(codigo)
  SELECT id INTO v_id
  FROM financeiro_contas_bancarias
  WHERE cliente_id = p_cliente_id
    AND ativa = true
    AND tipo_conta = v_tipo_db
    AND COALESCE((regexp_replace(codigo_conta, '^0+', '', 'g'))::int, -1) = v_codigo_n
  LIMIT 1;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION fn_classificacao_resolver_conta IS
  'PR-M: resolve "cc-001 | xxx" → conta_bancaria_id via tipo+parseInt(codigo). NULL se sentinela ou sem match. Determinístico, sem fuzzy.';
