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

/**
 * OC-VENDA-FINANCEIRO-COMPLETO-01a — NOME CURTO de conta para as colunas estreitas das tabelas da OC (extrato: Conta de 152px,
 * 144 uteis; despesas: 142px, 134 uteis). O nome inteiro vai no `title`. So' rotulo de tela: o plano NAO e' renomeado, e
 * `rotuloDaConta` (acima) segue devolvendo o nome do plano para os outros leitores.
 * ⚠ MEDIDO, NAO CONTADO (Inter 10px/400, Playwright, 29/09/2026): dos 226 subcentros ativos, 145 passam de 144px — mas so'
 *   15 aparecem de fato em lancamento ligado a OC, e 5 deles nao cabem. Sao esses 5 que estao no mapa. Os outros 221, se um dia
 *   aparecerem, quebram em no maximo 2 linhas nas duas colunas (medido: o pior, "Investimento Equipamentos e Informática
 *   Administrativo", 265,7px, fica em 2) — nunca cortados com reticencia.
 * ⚠ OS DOIS DA PARTIDA NAO CABIAM na coluna de despesas: "Imp. e Desp. Abates e Vendas" pedia 141,7 e "Frete/Comissão Compra
 *   Bov." 137,9 para 134 uteis. Os daqui cabem nas duas colunas.
 */
const ROTULO_CURTO_POR_CONTA: Readonly<Record<string, string>> = {
  'Impostos e Despesas de Abates e Vendas': 'Imp. e Desp. Abate e Venda',        // 198,5 -> 131,2
  'Investimento Frete/Comissão Compra Bovinos': 'Frete/Comiss. Compra Bov.',     // 218,3 -> 129,2
  'Investimento Compra Bovinos Machos': 'Invest. Compra Bov. Machos',            // 181,5 -> 135,1 (so' no extrato, 144 uteis)
  'Investimento Compra Bovinos Fêmeas': 'Invest. Compra Bov. Fêmeas',            // 180,9 -> 134,5 (so' no extrato, 144 uteis)
  'Devolução de Adiantamento de Boitel': 'Devol. Adiantamento Boitel',           // 177,2 -> 127,2
};

/** O nome que cabe na coluna Conta das tabelas da OC; fora do mapa, o mesmo de `rotuloDaConta`. */
export function rotuloCurtoDaConta(conta: string | null | undefined): string | null {
  if (!conta) return null;
  return ROTULO_CURTO_POR_CONTA[conta] ?? rotuloDaConta(conta);
}
