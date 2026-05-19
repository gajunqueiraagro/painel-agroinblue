// producaoRealizadaTypes.ts
//
// DTO do Bloco Produção Pecuária Realizada — exibido no Fechamento do Período.
//
// Semântica do shim em ComparativoDuplo (decisão arquitetural Opção A):
//   - valor              = Realizado Jan→mesAlvo (PC-100 indicador.valor em viewMode='periodo')
//   - vsAnoFechado.valor = Meta Jan→mesAlvo (PC-100 indicador.serieMeta[mesAlvo])
//   - vsAnoFechado.delta = ((Real - Meta) / Meta) × 100  → render "X% vs meta"
//   - vsMesmoPeriodo.valor = Realizado ano-1 Jan→mesAlvo (PC-100 indicador.serieAnoAnt[mesAlvo])
//   - vsMesmoPeriodo.delta = ((Real - Ano-1) / Ano-1) × 100
//
// CardComparativo atual só renderiza vsAnoFechado. vsMesmoPeriodo fica no DTO
// disponível para evolução futura sem refactor.

import type { ComparativoDuplo } from './planejamentoVisaoGeralTypes';

export interface Bloco2ProducaoRealizada {
  // Estoque / Patrimônio (3)
  rebanhoMedio: ComparativoDuplo;
  pesoMedioPeriodo: ComparativoDuplo;
  valorRebanho: ComparativoDuplo;

  // Produção (3)
  arrobasProduzidas: ComparativoDuplo;
  arrobasDesfrutadas: ComparativoDuplo;
  desfrutePct: ComparativoDuplo;

  // Médias / Taxas (3)
  uaHaMedio: ComparativoDuplo;
  areaProdutivaMedia: ComparativoDuplo;
  gmdMedio: ComparativoDuplo;

  // Econômicos (4)
  custoArr: ComparativoDuplo;
  precoArr: ComparativoDuplo;
  margemArr: ComparativoDuplo;
  custoCab: ComparativoDuplo;
}
