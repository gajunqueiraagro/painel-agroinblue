/**
 * Tipos do domínio rebanho do PC-100.
 * Step 2.2 da Fase 0. Estruturas executivas (não-indicadores).
 *
 * Convenção de unidades (referência informal por agora):
 *   cabecas      → cab
 *   pesoTotalKg  → kg
 *   pesoMedioKg  → kg/cab
 *   gmd          → kg/dia
 *   pctRebanho   → decimal 0..1
 *   pctPeso      → decimal 0..1
 */

export interface ItemComposicaoCategoria {
  categoriaId:    string;
  categoriaCodigo: string;
  categoria:      string;          // categoriaNome
  ordem:          number;
  cabecas:        number;
  pesoTotalKg:    number;
  pesoMedioKg:    number;
  gmd:            number | null;
  pctRebanho:     number;          // 0..1
  pctPeso:        number;          // 0..1
}

export interface PC100_Rebanho {
  composicaoCategoria: ItemComposicaoCategoria[] | null;
  // composicaoFazenda e movimentacoes virão nos Steps 2.3 e 2.5
}
