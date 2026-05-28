-- ====================================================================
-- FIX ENCODING - fn_classificacao_populate_staging (28/05/2026)
-- ====================================================================
-- CAUSA RAIZ (provada por instrumentacao plpgsql, RAISE em clone fiel):
--   Literais de tipo_operacao com acento no bloco de match estavam com
--   MOJIBAKE (UTF-8 lido como Latin-1):
--     '2-Saidas'         -> "i" virou c3 83 c2 ad  (correto: c3 ad)
--     '3-Transferencias' -> "e" virou c3 83 c2 aa  (correto: c3 aa)
--   Dados reais (v_tipo_op do staging) tem acento CORRETO, entao
--   v_tipo_op = '2-Sa<mojibake>das' era SEMPRE falso -> ramo de match
--   de Saidas/Transferencias NUNCA executava -> v_match_count=0 ->
--   TODAS viravam sem_match. Sintoma: NJ Abr/2026 311/311 sem_match
--   (todas 2-Saidas); Entradas (sem acento) sempre casaram.
--
-- CORRECAO: literais como Unicode escape ASCII-safe (E'\u00ED'/E'\u00EA'),
--   corpo 100% ASCII, imune a re-mojibake por qualquer toolchain futura.
--
-- ESCOPO: encoding de literais + COALESCE do DePara (PR-DePara-Conta-Fase1).
--   NAO altera matcher, criterios, UI nem staging. O banco JA esta correto;
--   esta migration apenas alinha o git ao banco.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.fn_classificacao_populate_staging(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  v_alias_id_usado   uuid;
  v_subcentro_raw    text;

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

    IF v_tipo_op = (E'3-Transfer\u00EAncia') THEN
      v_tipo_op := (E'3-Transfer\u00EAncias');
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
        (a.cliente_id IS NOT NULL) DESC,
        a.created_at DESC
      LIMIT 1;
    END IF;

    -- PR-Aliases-Core FIX: SELECT INTO de 0 rows zera TODAS as vars
    -- do INTO (incluindo v_subcentro). Sem este restore, subcentros
    -- canonicos que existem no plano mas nao tem alias param de
    -- resolver via lookup direto subsequente.
    IF v_alias_id_usado IS NULL THEN
      v_subcentro := v_subcentro_raw;
    END IF;

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

      ELSIF v_tipo_op = (E'2-Sa\u00EDdas') AND v_conta_origem_id IS NOT NULL THEN
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

      ELSIF v_tipo_op = (E'3-Transfer\u00EAncias')
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

    IF v_tipo_op = (E'3-Transfer\u00EAncias') THEN
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
$function$

