-- ===================================================================
-- PR-K — Backfill conta_*_id para fluxos divergentes
-- ===================================================================
-- NÃO É MIGRATION. Não é aplicado automaticamente em deploy.
-- Roda manualmente no Supabase Dashboard (SQL Editor) APÓS validação
-- do PR-K em proto.
--
-- Convenção oficial (cravada em src/lib/financeiro/contaPayload.ts):
--   1-Entradas        → conta_destino_id  (onde dinheiro chega)
--   2-Saídas          → conta_bancaria_id (de onde dinheiro sai)
--   3-Transferências  → AMBOS preenchidos
--
-- Audit tag: [pr_k_conta_backfill_2026-05-26] em observacao para
-- permitir rollback cirúrgico se necessário.
-- ===================================================================

BEGIN;

-- ------------------------------------------------------------------
-- 1. OFX entrada: 37 registros gravados em conta_bancaria_id por engano
-- ------------------------------------------------------------------
-- Origem: ExtratoListaTab.handleCriarLote (PR-D) chamava
-- criarLancamentoComId com origem='ofx' passando conta_bancaria_id
-- sem bifurcar por tipo_operacao. PR-K corrigiu o front via helper.
UPDATE financeiro_lancamentos_v2
SET conta_destino_id = conta_bancaria_id,
    conta_bancaria_id = NULL,
    observacao = COALESCE(observacao || ' | ', '')
                 || '[pr_k_conta_backfill_2026-05-26]'
WHERE origem_lancamento = 'ofx'
  AND tipo_operacao = '1-Entradas'
  AND cancelado = false
  AND status_transacao = 'realizado'
  AND conta_bancaria_id IS NOT NULL
  AND conta_destino_id IS NULL;

-- ------------------------------------------------------------------
-- 2. Financiamento captação: 60 registros, mesmo padrão de bug
-- ------------------------------------------------------------------
-- Origem: useFinanciamentoCadastro.salvar (ramo "3 – Lançamento de
-- captação") inseria conta_bancaria_id em entrada. PR-K corrigiu via
-- helper.
UPDATE financeiro_lancamentos_v2
SET conta_destino_id = conta_bancaria_id,
    conta_bancaria_id = NULL,
    observacao = COALESCE(observacao || ' | ', '')
                 || '[pr_k_conta_backfill_2026-05-26]'
WHERE origem_lancamento = 'financiamento'
  AND origem_tipo = 'financiamento_captacao'
  AND tipo_operacao = '1-Entradas'
  AND cancelado = false
  AND status_transacao = 'realizado'
  AND conta_bancaria_id IS NOT NULL
  AND conta_destino_id IS NULL;

-- ------------------------------------------------------------------
-- 3. Parcela financiamento REALIZADO sem conta nenhuma: NÃO FAZER
--    UPDATE CEGO. Apenas listar para revisão manual.
-- ------------------------------------------------------------------
-- Bug está na RPC SQL fn_reconciliar_parcela_financiamento (banco),
-- fora do escopo PR-K. Vira PR-K-bis. Lista abaixo para inspeção:
--
--   SELECT id, ano_mes, valor, descricao, financiamento_id,
--          origem_tipo, status_transacao
--   FROM financeiro_lancamentos_v2
--   WHERE origem_lancamento = 'parcela_financiamento'
--     AND tipo_operacao = '2-Saídas'
--     AND cancelado = false
--     AND status_transacao = 'realizado'
--     AND conta_bancaria_id IS NULL
--     AND conta_destino_id IS NULL;
--
-- Esperado: ~32 linhas (auditoria pré-PR-K).
-- Decisão por linha: operador identifica qual conta de pagamento
-- usar e roda UPDATE individual com audit tag.

-- ------------------------------------------------------------------
-- VALIDAÇÃO antes de commitar a transação:
-- ------------------------------------------------------------------
--   SELECT origem_lancamento, COUNT(*) AS qt
--   FROM financeiro_lancamentos_v2
--   WHERE origem_lancamento IN ('ofx','financiamento')
--     AND tipo_operacao = '1-Entradas'
--     AND cancelado = false
--     AND status_transacao = 'realizado'
--     AND conta_bancaria_id IS NOT NULL
--     AND conta_destino_id IS NULL
--   GROUP BY origem_lancamento;
--
-- Esperado: 0 linhas (todos migrados para conta_destino_id).
--
-- Verificar audit tag aplicada:
--   SELECT COUNT(*) FROM financeiro_lancamentos_v2
--   WHERE observacao LIKE '%[pr_k_conta_backfill_2026-05-26]%';
-- Esperado: 37 + 60 = 97 linhas.

-- ------------------------------------------------------------------
-- COMMIT ou ROLLBACK manual após inspeção das contagens acima.
-- ------------------------------------------------------------------
-- COMMIT;
-- ROLLBACK;
