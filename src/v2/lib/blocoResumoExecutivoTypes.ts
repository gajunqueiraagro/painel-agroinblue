// blocoResumoExecutivoTypes.ts
// Bloco 1 compara META 2026 contra Real 2025 em base financeira
// (financeiro_lancamentos_v2). Comparativos produtivos/zootécnicos
// ficam para blocos específicos.

export interface LinhaExecutiva {
  label: string;
  meta: number;
  /** Real ano anterior (referência histórica do modo Planejamento). */
  real: number;
  /** Delta (meta − real)/real — comparativo modo Planejamento. */
  delta: number;
  /** Real ano corrente — populado quando buildBlocoResumoExecutivo recebe lancFin2026. */
  realAnoCorrente?: number;
  /** Delta (realAnoCorrente − meta)/meta — comparativo modo Fechamento. */
  deltaAnoCorrente?: number;
}

export interface BlocoResumoExecutivoData {
  receitaPecuaria: LinhaExecutiva;
  receitaAgricultura: LinhaExecutiva;
  outrasReceitas: LinhaExecutiva;
  entradasFinanceiras: LinhaExecutiva;
  totalEntradas: LinhaExecutiva;

  custeioPecuaria: LinhaExecutiva;
  custeioAgricultura: LinhaExecutiva;
  jurosPecuaria: LinhaExecutiva;
  jurosAgricultura: LinhaExecutiva;
  investimentoPecuaria: LinhaExecutiva;
  investimentoAgricultura: LinhaExecutiva;
  reposicaoBovinos: LinhaExecutiva;
  amortizacaoPecuaria: LinhaExecutiva;
  amortizacaoAgricultura: LinhaExecutiva;
  dividendos: LinhaExecutiva;
  deducoesReceita: LinhaExecutiva;
  totalSaidas: LinhaExecutiva;

  serieMeta: number[];
  serieReal: number[];
  serieMetaLinear: number[];
  /** Real ano corrente — acumulado mensal de (entradas − saídas) a partir
   *  de lancFin2026. Não inclui saldoInicial; o consumidor soma se necessário. */
  serieRealAnoCorrente?: number[];

  conciliado: boolean;
  diferencaMeta: number;
}
