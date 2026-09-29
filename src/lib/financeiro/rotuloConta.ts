/**
 * FIN-V2-SEM-CAIXA-01 (item 6) — NOME DE EXIBICAO de conta do plano. So' rotulo de tela: o plano NAO e' renomeado (decisao do
 * Gabriel, ADR-2026-21). O nome gravado ("Adiantamento de Clientes") e' lido por seis funcoes do banco, que acham a conta por
 * ele (`_oc_vincular_recebimento`, `_oc_vinculo_mapa`, `oc_vincular_lancamento`, `oc_explicar_saldo`, `oc_programar_recebimento`,
 * `_oc_cancelar_conta_corrente`) — renomear no plano pediria patchear as seis.
 * Para o cliente, a conta e' o dinheiro da venda (ou da compra), com ou sem adiantamento.
 */
const ROTULO_POR_CONTA: Readonly<Record<string, string>> = {
  'Adiantamento de Clientes': 'Recebimento de vendas',
  'Adiantamento a Fornecedores': 'Pagamento de compras',
  /* OC-CONTA-CORRENTE-TODOS-01a (decisao 2): a conta 3016, espelho da 5006 — o dinheiro que o fornecedor devolve */
  'Devolução de Adiantamento a Fornecedores': 'Devolução do fornecedor',
};

/** O nome que a tela mostra para a conta; conta fora do mapa aparece como esta' no plano. */
export function rotuloDaConta(conta: string | null | undefined): string | null {
  if (!conta) return null;
  return ROTULO_POR_CONTA[conta] ?? conta;
}
