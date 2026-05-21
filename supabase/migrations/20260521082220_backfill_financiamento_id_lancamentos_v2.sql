-- ============================================
-- PR F5: Backfill financiamento_id (idempotente)
-- ============================================
-- Causa raiz: importação histórica Excel sem coluna financiamento_id.
-- Total esperado a atualizar: ~612 lançamentos.
-- Validações pré-execução (V1-V4) passaram em 21/05/2026.
-- ============================================

-- MEDIÇÃO ANTES (comentário — rodar manualmente via Management API):
-- SELECT 'principal' AS m, COUNT(*) FROM financeiro_lancamentos_v2 lv
-- WHERE lv.cancelado=false AND lv.financiamento_id IS NULL
--   AND EXISTS (SELECT 1 FROM financiamento_parcelas fp
--               WHERE fp.lancamento_id = lv.id)
-- UNION ALL
-- SELECT 'juros', COUNT(*) FROM financeiro_lancamentos_v2 lv
-- WHERE lv.cancelado=false AND lv.financiamento_id IS NULL
--   AND EXISTS (SELECT 1 FROM financiamento_parcelas fp
--               WHERE fp.lancamento_juros_id = lv.id);
-- Esperado: 373 + 250

BEGIN;

-- Backfill 1: via parcela.lancamento_id (amortizações principal)
UPDATE financeiro_lancamentos_v2 lv
SET financiamento_id = fp.financiamento_id
FROM financiamento_parcelas fp
WHERE fp.lancamento_id = lv.id
  AND lv.financiamento_id IS NULL
  AND lv.cancelado = false
  AND fp.financiamento_id IS NOT NULL;

-- Backfill 2: via parcela.lancamento_juros_id (juros)
UPDATE financeiro_lancamentos_v2 lv
SET financiamento_id = fp.financiamento_id
FROM financiamento_parcelas fp
WHERE fp.lancamento_juros_id = lv.id
  AND lv.financiamento_id IS NULL
  AND lv.cancelado = false
  AND fp.financiamento_id IS NOT NULL;

COMMIT;

-- MEDIÇÃO DEPOIS (comentário — rodar manualmente via Management API):
-- Esperado: 0 em ambas as métricas
-- SELECT 'principal_residual' AS m, COUNT(*) FROM financeiro_lancamentos_v2 lv
-- WHERE lv.cancelado=false AND lv.financiamento_id IS NULL
--   AND EXISTS (SELECT 1 FROM financiamento_parcelas fp
--               WHERE fp.lancamento_id = lv.id)
-- UNION ALL
-- SELECT 'juros_residual', COUNT(*) FROM financeiro_lancamentos_v2 lv
-- WHERE lv.cancelado=false AND lv.financiamento_id IS NULL
--   AND EXISTS (SELECT 1 FROM financiamento_parcelas fp
--               WHERE fp.lancamento_juros_id = lv.id);
