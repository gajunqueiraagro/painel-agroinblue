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

import type { TipoMovimentacao } from '@/types/cattle';

/** Natureza econômica/biológica da movimentação. */
export type NaturezaMovimentacao =
  | 'operacional'   // abate, venda, consumo
  | 'patrimonial'   // compra, nascimento
  | 'perdas'        // morte
  | 'tecnica';      // transferencia_saida, transferencia_entrada, reclassificacao

export interface MovimentacaoPorTipo {
  tipo:          TipoMovimentacao;
  natureza:      NaturezaMovimentacao;
  ops:           number;             // contagem operações
  cabecas:       number;
  pesoTotalKg:   number;
  /**
   * Valor financeiro absoluto (R$).
   * null quando nenhuma operação do tipo tem valor confiável.
   * Na prática só abate/venda/compra populam este campo.
   */
  valorTotal:    number | null;
}

export interface MovimentacaoPorNatureza {
  natureza:      NaturezaMovimentacao;
  ops:           number;
  cabecas:       number;
  pesoTotalKg:   number;
  /** Soma dos valores não-null dos tipos componentes. null se todos são null. */
  valorTotal:    number | null;
  /** Tipos do enum presentes nesta natureza no recorte. Pode ser []. */
  tiposPresentes: TipoMovimentacao[];
}

export interface Movimentacoes {
  /** Todos os tipos presentes no recorte, ordenado por ops DESC. */
  porTipo:       MovimentacaoPorTipo[];
  /** Sempre 4 naturezas (mesmo se zeradas) na ordem fixa: op, patr, perd, tec. */
  porNatureza:   MovimentacaoPorNatureza[];
  totais: {
    ops:         number;
    cabecas:     number;
    pesoTotalKg: number;
  };
}

export interface PC100_Rebanho {
  composicaoCategoria: ItemComposicaoCategoria[] | null;
  composicaoFazenda:   ItemComposicaoFazenda[] | null;
  movimentacoes:       Movimentacoes | null;
}
