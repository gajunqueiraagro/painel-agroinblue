-- ====================================================================
-- PR-M4 (26/05/2026) — vw_classificacao_staging_preview
-- ====================================================================
-- View de preview "Antes → Depois" para Classificação Excel. Enriquece
-- staging com estado atual do lançamento (vivo, sem cache), dados de
-- lookup (contas, fornecedores) e FLAGS calculadas que indicam o que
-- apply tocará.
--
-- IMPORTANTE — apply atual só preenche subcentro + favorecido_id.
-- macro/grupo/centro/plano_conta_id NÃO são preenchidos pelo apply
-- (gap conhecido, backlog futuro). As flags refletem isso.
--
-- SECURITY INVOKER (default em VIEW) — herda RLS da staging.
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

  -- EXCEL
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

  -- SISTEMA (estado atual do lançamento, vivo)
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

  -- PROPOSTA (apenas o que apply realmente toca)
  s.update_proposto->>'subcentro'                                   AS proposto_subcentro,
  NULLIF(s.update_proposto->>'favorecido_id','')::uuid              AS proposto_favorecido_id,
  fp.nome                                                            AS proposto_favorecido_nome,

  -- FLAGS (calculadas pelo DB — espelham EXATAMENTE o COALESCE do apply)
  (l.id IS NOT NULL
    AND l.subcentro IS NULL
    AND s.update_proposto->>'subcentro' IS NOT NULL)                AS will_set_subcentro,
  (l.id IS NOT NULL
    AND l.favorecido_id IS NULL
    AND NULLIF(s.update_proposto->>'favorecido_id','') IS NOT NULL) AS will_set_favorecido,
  -- A1: flag-mãe — true se QUALQUER campo será gravado.
  -- Útil pra renderizar badge "Nada será alterado" quando false em row exato.
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
    AND l.subcentro <> (s.update_proposto->>'subcentro'))            AS conflito_subcentro

FROM public.financeiro_classificacao_staging s
LEFT JOIN public.financeiro_lancamentos_v2     l  ON l.id = s.match_lancamento_id
LEFT JOIN public.financeiro_contas_bancarias   cb ON cb.id = l.conta_bancaria_id
LEFT JOIN public.financeiro_contas_bancarias   cd ON cd.id = l.conta_destino_id
LEFT JOIN public.financeiro_fornecedores       fa ON fa.id = l.favorecido_id
LEFT JOIN public.financeiro_fornecedores       fp ON fp.id = NULLIF(s.update_proposto->>'favorecido_id','')::uuid;

COMMENT ON VIEW public.vw_classificacao_staging_preview IS
'PR-M4: enriquecimento Excel+Sistema+Proposta para revisão humana antes do apply. SECURITY INVOKER (herda RLS da staging).';
