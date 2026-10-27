/**
 * META NUNCA VAI AO FINANCEIRO — P120 (Gabriel 27/10/2026). Puro: sem React e sem rede.
 *
 * Nasce do NJ: o abate META de 66 garrotes (15/02/2026) virou "Abate 66 Garrotes" R$ 451.560,38 + a dedução em
 * `financeiro_lancamentos_v2` (cenario = 'meta'), gravados pelo painel do abate desde o a5fc23f3 (21/04). Em todos os clientes, 52 ativos.
 * ⚠ DUAS TRAVAS: os geradores do rebanho (abate, compra, venda) param na entrada com esta frase, e o banco recusa `cenario = 'meta'` em
 *   `financeiro_lancamentos_v2` (gatilho `trg_00_sem_meta`, 20261028112400). A meta do financeiro é CALCULADA (P109/P110), nunca lançada.
 */
export const FRASE_META_NAO_VAI_AO_FINANCEIRO =
  'Meta não vai ao financeiro: a movimentação META foi salva no rebanho, e nenhum lançamento financeiro foi criado.';

/** O cenário/status da movimentação é META? (`statusOperacional`/`statusOp` dos painéis do rebanho) */
export const ehCenarioMeta = (s: unknown): boolean => s === 'meta';
