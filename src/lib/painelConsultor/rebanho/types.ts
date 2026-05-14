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

export interface ItemComposicaoFazenda {
  fazendaId:        string;
  fazenda:          string;            // nome resolvido
  cabecas:          number;             // cab
  pesoTotalKg:      number;             // kg
  pesoMedioKg:      number;             // kg/cab (derivado)
  gmd:              number | null;      // kg/dia (ponderado por cabecas)
  pctRebanho:       number;             // 0..1
  pctPeso:          number;             // 0..1
  areaProdutivaHa:  number | null;      // ha — null até existir fonte oficial por fazenda
  uaHa:             number | null;      // UA/ha — idem
  arrobasHa:        number | null;      // @PV/ha — idem
}

export interface PC100_Rebanho {
  composicaoCategoria: ItemComposicaoCategoria[] | null;
  composicaoFazenda:   ItemComposicaoFazenda[] | null;
  // movimentacoes virá no Step 2.5
}
