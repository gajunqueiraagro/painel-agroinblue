-- ============================================================================
-- PR-MAP-0 — Captura de contexto no import: OBS e Documento.
--
-- Só CAPTURA/armazenamento (NÃO usa OBS para classificar ainda — isso é o motor,
-- PR-MAP-1/2). Adiciona colunas no staging, faz o populate lê-las do p_rows e
-- gravá-las, e expõe na view para diagnóstico/comparativo.
--
-- Front (fora desta migration): parserClassificacao lê Obs/Documento (com
-- fallbacks de cabeçalho) para ClassificacaoExcelRow; as rows já viajam ao
-- populate via spread (useImportarClassificacao). Documento é TEXT (preserva
-- zeros à esquerda). Sem backfill: stagings antigas ficam sem OBS/Documento.
-- ============================================================================

ALTER TABLE public.financeiro_classificacao_staging
  ADD COLUMN IF NOT EXISTS excel_observacao text,
  ADD COLUMN IF NOT EXISTS excel_documento  text;

-- ── populate passa a ler v_row->>'observacao'/'documento' e gravar ──────────
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
  v_observacao       text;   -- PR-MAP-0
  v_documento        text;   -- PR-MAP-0

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
    v_observacao       := NULLIF(trim(v_row->>'observacao'), '');   -- PR-MAP-0
    v_documento        := NULLIF(trim(v_row->>'documento'), '');    -- PR-MAP-0

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

-- ── view expõe excel_observacao / excel_documento (ao final, p/ CREATE OR REPLACE) ──
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
          WHERE pc.subcentro = NULLIF(s.update_proposto ->> 'subcentro'::text, ''::text) AND pc.ativo = true AND (pc.cliente_id IS NULL OR pc.cliente_id = s.cliente_id))) AS proposto_subcentro_existe_no_plano,
    NULLIF(s.update_proposto ->> 'subcentro'::text, ''::text) IS NOT NULL AND NOT (EXISTS ( SELECT 1
           FROM financeiro_plano_contas pc
          WHERE pc.subcentro = NULLIF(s.update_proposto ->> 'subcentro'::text, ''::text) AND pc.ativo = true AND (pc.cliente_id IS NULL OR pc.cliente_id = s.cliente_id))) AS will_create_subcentro_orfao,
    COALESCE(cb.nome_exibicao, sco.nome_exibicao, scd.nome_exibicao, NULLIF(s.excel_conta_origem, '-'::text)) AS conta_filtro_nome,
    COALESCE(l.conta_bancaria_id, s.conta_origem_id, s.conta_destino_id) AS conta_filtro_id,
    s.excel_observacao,
    s.excel_documento
   FROM financeiro_classificacao_staging s
     LEFT JOIN financeiro_lancamentos_v2 l ON l.id = s.match_lancamento_id
     LEFT JOIN financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
     LEFT JOIN financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
     LEFT JOIN financeiro_contas_bancarias sco ON sco.id = s.conta_origem_id
     LEFT JOIN financeiro_contas_bancarias scd ON scd.id = s.conta_destino_id
     LEFT JOIN financeiro_fornecedores fa ON fa.id = l.favorecido_id
     LEFT JOIN financeiro_fornecedores fp ON fp.id = NULLIF(s.update_proposto ->> 'favorecido_id'::text, ''::text)::uuid;
