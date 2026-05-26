-- ====================================================================
-- PR-M5-A2 (26/05/2026) — Proteção anti-órfão de subcentro
-- ====================================================================
-- Adiciona 2 colunas ao final da view vw_classificacao_staging_preview:
--   - proposto_subcentro_existe_no_plano (bool): EXISTS no plano oficial
--   - will_create_subcentro_orfao (bool): proposto não-vazio E NÃO EXISTS
--
-- Regra: subcentro é válido se existir em financeiro_plano_contas com
-- (cliente_id IS NULL [plano global] OR cliente_id = sessão atual)
-- AND ativo = true.
--
-- Front usa will_create_subcentro_orfao para bloquear Apply e marcar
-- cell vermelho.
--
-- IMPORTANTE: CREATE OR REPLACE VIEW só aceita ADICIONAR colunas no
-- fim. As 40+ colunas existentes ficam exatamente iguais; apenas as
-- 2 novas no final.
--
-- SEGURANÇA: usar NULLIF(...,'') em TODAS as referências ao subcentro
-- proposto. JSON com "" passaria em IS NOT NULL mas é vazio semântico.
-- ====================================================================

CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview
WITH (security_invoker = true) AS
SELECT
  s.staging_id,
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

  l.id                    AS lanc_id,
  l.descricao             AS lanc_descricao,
  l.observacao            AS lanc_observacao,
  l.data_pagamento        AS lanc_data_pagamento,
  l.data_competencia      AS lanc_data_competencia,
  l.valor                 AS lanc_valor,
  l.sinal                 AS lanc_sinal,
  l.tipo_operacao         AS lanc_tipo_operacao,
  l.status_transacao      AS lanc_status,
  l.subcentro             AS lanc_subcentro_atual,
  l.macro_custo           AS lanc_macro_atual,
  l.grupo_custo           AS lanc_grupo_atual,
  l.centro_custo          AS lanc_centro_atual,
  l.plano_conta_id        AS lanc_plano_conta_id_atual,
  l.favorecido_id         AS lanc_favorecido_id_atual,
  fa.nome                 AS lanc_favorecido_nome_atual,
  l.conta_bancaria_id     AS lanc_conta_bancaria_id,
  cb.nome_exibicao        AS lanc_conta_bancaria_nome,
  l.conta_destino_id      AS lanc_conta_destino_id,
  cd.nome_exibicao        AS lanc_conta_destino_nome,
  l.fazenda_id            AS lanc_fazenda_id,

  s.update_proposto->>'subcentro'                                   AS proposto_subcentro,
  NULLIF(s.update_proposto->>'favorecido_id','')::uuid              AS proposto_favorecido_id,
  fp.nome                                                            AS proposto_favorecido_nome,

  (l.id IS NOT NULL
    AND l.subcentro IS NULL
    AND s.update_proposto->>'subcentro' IS NOT NULL)                AS will_set_subcentro,
  (l.id IS NOT NULL
    AND l.favorecido_id IS NULL
    AND NULLIF(s.update_proposto->>'favorecido_id','') IS NOT NULL) AS will_set_favorecido,
  (
    (l.id IS NOT NULL
      AND l.subcentro IS NULL
      AND s.update_proposto->>'subcentro' IS NOT NULL)
    OR
    (l.id IS NOT NULL
      AND l.favorecido_id IS NULL
      AND NULLIF(s.update_proposto->>'favorecido_id','') IS NOT NULL)
  )                                                                  AS will_change_anything,
  (l.subcentro IS NOT NULL
    AND s.update_proposto->>'subcentro' IS NOT NULL
    AND l.subcentro <> (s.update_proposto->>'subcentro'))            AS conflito_subcentro,

  -- ============================================================
  -- PR-M5-A2: 2 colunas novas no final (preservar ordem acima)
  -- ============================================================
  -- Usa NULLIF para tratar "" como NULL (JSON com string vazia).
  EXISTS (
    SELECT 1 FROM public.financeiro_plano_contas pc
    WHERE pc.subcentro = NULLIF(s.update_proposto->>'subcentro','')
      AND pc.ativo = true
      AND (pc.cliente_id IS NULL OR pc.cliente_id = s.cliente_id)
  )                                                                  AS proposto_subcentro_existe_no_plano,

  (
    NULLIF(s.update_proposto->>'subcentro','') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.financeiro_plano_contas pc
      WHERE pc.subcentro = NULLIF(s.update_proposto->>'subcentro','')
        AND pc.ativo = true
        AND (pc.cliente_id IS NULL OR pc.cliente_id = s.cliente_id)
    )
  )                                                                  AS will_create_subcentro_orfao

FROM public.financeiro_classificacao_staging s
LEFT JOIN public.financeiro_lancamentos_v2     l  ON l.id = s.match_lancamento_id
LEFT JOIN public.financeiro_contas_bancarias   cb ON cb.id = l.conta_bancaria_id
LEFT JOIN public.financeiro_contas_bancarias   cd ON cd.id = l.conta_destino_id
LEFT JOIN public.financeiro_fornecedores       fa ON fa.id = l.favorecido_id
LEFT JOIN public.financeiro_fornecedores       fp ON fp.id = NULLIF(s.update_proposto->>'favorecido_id','')::uuid;

COMMENT ON VIEW public.vw_classificacao_staging_preview IS
'PR-M5-A2: enriquecimento Excel+Sistema+Proposta + proteção anti-órfão de subcentro. SECURITY INVOKER (herda RLS da staging).';
