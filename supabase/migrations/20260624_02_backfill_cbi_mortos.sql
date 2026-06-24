-- ============================================================================
-- P0-CLEANUP-LINKS — Migration 2/3 (backfill)
-- Desfaz os vínculos MORTOS já existentes: cbi vivo (desfeito_em IS NULL) cujo
-- lançamento já está cancelado. Preenche desfeito_em/por/motivo a partir do
-- lançamento. NÃO apaga nenhum cbi. Aplicar DEPOIS da Migration 1 (trigger) e
-- ANTES da Migration 3 (RPC 01.8). Esperado: 363 linhas afetadas (mortos -> 0).
-- ============================================================================
UPDATE conciliacao_bancaria_itens cbi
   SET desfeito_em     = l.cancelado_em,
       desfeito_por    = l.cancelado_por,
       desfeito_motivo = 'backfill_lancamento_cancelado'
  FROM financeiro_lancamentos_v2 l
 WHERE cbi.lancamento_id = l.id
   AND l.cancelado = true
   AND cbi.desfeito_em IS NULL;
