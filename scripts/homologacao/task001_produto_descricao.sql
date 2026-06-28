-- ============================================================================
-- TASK-001 — Teste READ-ONLY: Produto/Observação no caminho MERGE da promoção.
--
-- Demonstra, sobre uma linha REAL da NJ (staging vinculado a OFX -> caminho
-- MERGE da fn_promover_staging), a diferença ANTES x DEPOIS da correção, SEM
-- escrever nada (apenas SELECT; nenhuma chamada a fn_promover_staging).
--
-- USO (rodar SOMENTE no proto binbcdfbisgscrifztia — NUNCA prod):
--   1) Preencher p_staging_id com uma linha NJ que tenha Produto preenchido e
--      esteja vinculada a OFX (ofx_extrato_id NOT NULL, 1 lancamento nao-cancelado).
--   2) Executar. Comparar as colunas observacao_ANTES x observacao_DEPOIS e
--      descricao_DEPOIS, e as 3 flags de prova no fim.
--
-- ANTES (função viva 20260619_merge): MERGE gravava
--    observacao = concat(Produto · descricao · observacao)   -> Produto na OBSERVAÇÃO.
-- DEPOIS (20260628): MERGE espelha o INSERT
--    descricao  = Produto dobrado;  observacao = apenas v_row.observacao.
-- ============================================================================
WITH parametros AS (
  SELECT '00000000-0000-0000-0000-000000000000'::uuid AS p_staging_id   -- <preencher>
),
linha AS (
  SELECT s.staging_id, s.produto, s.descricao, s.observacao, s.ofx_extrato_id
  FROM mesa_lancamento_staging s, parametros p
  WHERE s.staging_id = p.p_staging_id
),
alvo AS (  -- lancamento existente vinculado: o que o MERGE enriquece
  SELECT l.id AS lancamento_id, l.descricao AS descricao_atual, l.observacao AS observacao_atual
  FROM linha
  JOIN conciliacao_bancaria_itens cbi ON cbi.extrato_id = linha.ofx_extrato_id
  JOIN financeiro_lancamentos_v2 l ON l.id = cbi.lancamento_id AND l.cancelado = false
)
SELECT
  linha.staging_id,
  linha.produto,
  linha.descricao                                AS descricao_excel,
  linha.observacao                               AS observacao_excel,

  -- ANTES: o que ia para observacao (continha o Produto)
  NULLIF(concat_ws(' · ',
    NULLIF(btrim(linha.produto), ''),
    NULLIF(btrim(linha.descricao), ''),
    NULLIF(btrim(linha.observacao), '')
  ), '')                                          AS observacao_ANTES,

  -- DEPOIS: descricao recebe o Produto dobrado (espelha o INSERT)
  CASE
    WHEN NULLIF(btrim(linha.produto), '') IS NOT NULL AND NULLIF(btrim(linha.descricao), '') IS NOT NULL THEN linha.produto || ' — ' || linha.descricao
    WHEN NULLIF(btrim(linha.produto), '') IS NOT NULL THEN linha.produto
    WHEN NULLIF(btrim(linha.descricao), '') IS NOT NULL THEN linha.descricao
    ELSE alvo.descricao_atual
  END                                             AS descricao_DEPOIS,

  -- DEPOIS: observacao recebe apenas a observacao do Excel (sem Produto)
  linha.observacao                                AS observacao_DEPOIS,

  alvo.descricao_atual,
  alvo.observacao_atual,

  -- PROVAS (esperado: true / true / false):
  ( NULLIF(btrim(linha.produto), '') IS NOT NULL
    AND coalesce(NULLIF(concat_ws(' · ',
          NULLIF(btrim(linha.produto), ''),
          NULLIF(btrim(linha.descricao), ''),
          NULLIF(btrim(linha.observacao), '')), '') ILIKE '%' || btrim(linha.produto) || '%', false)
  )                                               AS prova_antes_produto_na_observacao,

  ( NULLIF(btrim(linha.produto), '') IS NOT NULL
    AND (CASE
      WHEN NULLIF(btrim(linha.produto), '') IS NOT NULL AND NULLIF(btrim(linha.descricao), '') IS NOT NULL THEN linha.produto || ' — ' || linha.descricao
      WHEN NULLIF(btrim(linha.produto), '') IS NOT NULL THEN linha.produto
      WHEN NULLIF(btrim(linha.descricao), '') IS NOT NULL THEN linha.descricao
      ELSE alvo.descricao_atual
    END) ILIKE '%' || btrim(linha.produto) || '%'
  )                                               AS prova_depois_produto_na_descricao,

  ( NULLIF(btrim(linha.produto), '') IS NOT NULL
    AND coalesce(linha.observacao ILIKE '%' || btrim(linha.produto) || '%', false)
  )                                               AS prova_depois_produto_ainda_na_observacao
FROM linha
LEFT JOIN alvo ON true;
