/**
 * FIN-V2-SEM-CAIXA-01 (item 6) — NOME DE EXIBICAO de conta do plano. So' rotulo de tela: o plano NAO e' renomeado.
 *
 * OC-CC-CLASSIFICACAO-01 (decisao 6): o mapa ficou VAZIO. "Recebimento de vendas", "Pagamento de compras" e "Devolução do
 * fornecedor" existiam para disfarcar as contas de adiantamento (3015, 5005) e a 3016, e elas sairam de uso: o recebimento e o
 * pagamento da OC conta corrente ficam no subcentro da operacao ("Venda de Desmama Machos", "Investimento Compra Bovinos
 * Machos"), fora do DRE pela parte da OC (ADR-2026-21, adendo). A conta aparece como esta' no plano.
 * A funcao fica como o unico ponto de nome de exibicao — os leitores (aba da OC, cancelar, previa do criar-do-legado, secao sem
 * caixa) nao precisam saber que o mapa esvaziou.
 */
const ROTULO_POR_CONTA: Readonly<Record<string, string>> = {};

/** O nome que a tela mostra para a conta; conta fora do mapa aparece como esta' no plano. */
export function rotuloDaConta(conta: string | null | undefined): string | null {
  if (!conta) return null;
  return ROTULO_POR_CONTA[conta] ?? conta;
}
