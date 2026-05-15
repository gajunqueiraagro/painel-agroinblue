// blocoResumoExecutivoTypes.ts
// Bloco 1 compara META 2026 contra Real 2025 em base financeira
// (financeiro_lancamentos_v2). Comparativos produtivos/zootécnicos
// ficam para blocos específicos.

export interface LinhaExecutiva {
  label: string;
  meta: number;
  real: number;
  delta: number;
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

  conciliado: boolean;
  diferencaMeta: number;
}
