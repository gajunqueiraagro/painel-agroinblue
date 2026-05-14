/**
 * Tipos do domínio financeiro do PC-100.
 * Step 2.4 da Fase 0. Primeira estrutura: centrosCusto.
 *
 * Convenção de unidades (informal):
 *   valor*       → R$ (centavos com decimal 2)
 *   pct*         → decimal 0..1
 *   delta*Pct    → decimal (-1..+inf), null quando ausente fonte
 */

export interface ItemCentroCusto {
  centroCusto:     string;          // '(sem centro)' quando null/vazio
  valorRealizado:  number;          // R$
  pctDoTotal:      number;          // 0..1
  // Gaps reservados — populados quando META e Ano Anterior tiverem fonte oficial:
  valorMeta:       number | null;
  valorAnoAnt:     number | null;
  deltaMetaPct:    number | null;
  deltaAnoAntPct:  number | null;
}

export interface CentrosCusto {
  totalRealizado:  number;          // R$ — cross-validation com custeioPecIndicador
  totalMeta:       number | null;   // gap futuro
  totalAnoAnt:     number | null;   // gap futuro
  porCentro:       ItemCentroCusto[];    // ordenado valorRealizado DESC
  top5:            ItemCentroCusto[];    // mesmos itens — primeiros 5 de porCentro
}

export interface PC100_Financeiro {
  centrosCusto: CentrosCusto | null;
  // gaps futuros: receitas, juros, investimentos, etc.
}
