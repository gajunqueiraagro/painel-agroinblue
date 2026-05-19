/**
 * buildProducaoRealizadaData.ts
 *
 * Função pura. Sem queries, sem agregadores novos. Mapeia PC-100
 * (em viewMode='periodo') → DTO do Bloco Produção Pecuária Realizada.
 *
 * Convenção de índice (auditada antes de implementar):
 *   - Indicadores PC-100 (cabecas, pesoMedio, gmd, uaHa, arrobas, desfrute,
 *     desfruteArr, valorRebanho, custoArr, precoArr, margemArr, custoCab):
 *     serieAno/serieAnoAnt/serieMeta são length 13, 1-based
 *     ([0]=Dez/N-1, [1..12]=Jan..Dez). `indicador.valor` já vem indexado
 *     pelo PC-100 via mesIdx=mes (acumulado/médio Jan→mesAlvo em 'periodo').
 *   - Áreas (areaPecuariaRealPorMes, areaPecuariaMetaPorMes): length 12,
 *     0-based ([0]=Jan, [11]=Dez). `mediaSerieMensal(arr, mesAlvo)` itera
 *     [0..mesAlvo-1] = Jan..mesAlvo (mesmo helper usado em
 *     buildPlanejamentoVisaoGeralData.ts:1064-1068).
 *   - painel.areaPecuariaRealPorMesAnoAnt NÃO existe → comparativo
 *     vsMesmoPeriodo para área fica null.
 */

import type { PainelConsultorDataResult } from '@/hooks/usePainelConsultorData';
import type {
  ComparativoDuplo,
  FormatoExibicao,
  OrigemMetric,
  TipoSemantica,
} from './planejamentoVisaoGeralTypes';
import type { Bloco2ProducaoRealizada } from './producaoRealizadaTypes';

// ─── Helpers locais (sem dependência do builder Planejamento) ─────────

function mediaSerieMensal(
  serie: (number | null)[] | number[] | undefined,
  ate?: number,
): number | null {
  if (!serie) return null;
  const lim = ate ?? serie.length;
  const vals: number[] = [];
  for (let i = 0; i < Math.min(lim, serie.length); i++) {
    const v = serie[i];
    if (v != null && Number.isFinite(v as number)) vals.push(v as number);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

function pctDelta(curr: number | null, base: number | null): number | null {
  if (curr == null || base == null || base === 0 || !Number.isFinite(curr) || !Number.isFinite(base)) {
    return null;
  }
  return ((curr - base) / base) * 100;
}

function emptyComparativo(
  origem: OrigemMetric,
  tipoSemantica: TipoSemantica,
  formato: FormatoExibicao,
): ComparativoDuplo {
  return {
    valor: null,
    origem,
    tipoSemantica,
    formato,
    vsAnoFechado: { valor: null, delta: null },
    vsMesmoPeriodo: { valor: null, delta: null },
  };
}

/**
 * Extrai um indicador PC-100 (length 13, 1-based) para ComparativoDuplo
 * com shim semântico — valor=Real, vsAnoFechado=vs Meta, vsMesmoPeriodo=vs Ano-1.
 */
function extrairIndicador(
  indicador:
    | { valor: number | null; serieMeta?: number[]; serieAnoAnt?: number[] }
    | null
    | undefined,
  mesAlvo: number,
  origem: OrigemMetric,
  tipoSemantica: TipoSemantica,
  formato: FormatoExibicao,
): ComparativoDuplo {
  const real = indicador?.valor ?? null;
  // serieMeta/serieAnoAnt são 1-based: [mesAlvo] = acum/médio Jan→mesAlvo
  const metaRaw = indicador?.serieMeta?.[mesAlvo];
  const anoAntRaw = indicador?.serieAnoAnt?.[mesAlvo];
  const meta = metaRaw != null && Number.isFinite(metaRaw) ? metaRaw : null;
  const anoAnt = anoAntRaw != null && Number.isFinite(anoAntRaw) ? anoAntRaw : null;
  return {
    valor: real,
    origem,
    tipoSemantica,
    formato,
    vsAnoFechado: { valor: meta, delta: pctDelta(real, meta) },
    vsMesmoPeriodo: { valor: anoAnt, delta: pctDelta(real, anoAnt) },
  };
}

// ─── Builder ──────────────────────────────────────────────────────────

export function buildProducaoRealizadaData(
  painel: PainelConsultorDataResult | null,
  mesAlvo: number,
): Bloco2ProducaoRealizada {
  if (!painel) {
    return {
      rebanhoMedio:       emptyComparativo('pc100', 'media',     'cabecas'),
      pesoMedioPeriodo:   emptyComparativo('pc100', 'media',     'kg'),
      valorRebanho:       emptyComparativo('pc100', 'estoque',   'moeda'),
      arrobasProduzidas:  emptyComparativo('pc100', 'acumulado', 'arrobas'),
      arrobasDesfrutadas: emptyComparativo('pc100', 'acumulado', 'arrobas'),
      desfrutePct:        emptyComparativo('pc100', 'acumulado', 'cabecas'),
      uaHaMedio:          emptyComparativo('pc100', 'media',     'ua_ha'),
      areaProdutivaMedia: emptyComparativo('pc100', 'media',     'hectares'),
      gmdMedio:           emptyComparativo('pc100', 'media',     'gmd'),
      custoArr:           emptyComparativo('pc100', 'taxa',      'moeda'),
      precoArr:           emptyComparativo('pc100', 'taxa',      'moeda'),
      margemArr:          emptyComparativo('pc100', 'taxa',      'moeda'),
      custoCab:           emptyComparativo('pc100', 'taxa',      'moeda'),
    };
  }

  // Indicadores 1-based — `valor` já vem indexado pelo PC-100 para mesAlvo.
  // serieMetaIndicador é o campo correto em cabecasIndicador (não serieMeta).
  const cabecas = painel.cabecasIndicador
    ? {
        valor: painel.cabecasIndicador.valor,
        serieMeta: painel.cabecasIndicador.serieMetaIndicador,
        serieAnoAnt: painel.cabecasIndicador.serieAnoAnt,
      }
    : null;

  // Área Produtiva Média — derivação local (sem indicator pronto no PC-100).
  // Espelha o pattern de buildPlanejamentoVisaoGeralData.ts:1064-1077.
  // Arrays length 12, 0-based; mediaSerieMensal(arr, mesAlvo) = Jan..mesAlvo.
  const areaRealPeriodo = mediaSerieMensal(painel.areaPecuariaRealPorMes, mesAlvo);
  const areaMetaPeriodo = mediaSerieMensal(painel.areaPecuariaMetaPorMes, mesAlvo);
  const areaProdutivaMedia: ComparativoDuplo = {
    valor: areaRealPeriodo,
    origem: 'pc100',
    tipoSemantica: 'media',
    formato: 'hectares',
    vsAnoFechado: { valor: areaMetaPeriodo, delta: pctDelta(areaRealPeriodo, areaMetaPeriodo) },
    // painel.areaPecuariaRealPorMesAnoAnt NÃO existe — sem comparativo ano-1.
    vsMesmoPeriodo: { valor: null, delta: null },
  };

  return {
    rebanhoMedio:       extrairIndicador(cabecas,                       mesAlvo, 'pc100', 'media',     'cabecas'),
    pesoMedioPeriodo:   extrairIndicador(painel.pesoMedioIndicador,     mesAlvo, 'pc100', 'media',     'kg'),
    valorRebanho:       extrairIndicador(painel.valorRebanhoIndicador,  mesAlvo, 'pc100', 'estoque',   'moeda'),
    arrobasProduzidas:  extrairIndicador(painel.arrobasIndicador,       mesAlvo, 'pc100', 'acumulado', 'arrobas'),
    arrobasDesfrutadas: extrairIndicador(painel.desfruteArrIndicador,   mesAlvo, 'pc100', 'acumulado', 'arrobas'),
    desfrutePct:        extrairIndicador(painel.desfruteIndicador,      mesAlvo, 'pc100', 'acumulado', 'cabecas'),
    uaHaMedio:          extrairIndicador(painel.uaHaIndicador,          mesAlvo, 'pc100', 'media',     'ua_ha'),
    areaProdutivaMedia,
    gmdMedio:           extrairIndicador(painel.gmdIndicador,           mesAlvo, 'pc100', 'media',     'gmd'),
    custoArr:           extrairIndicador(painel.custoArrIndicador,      mesAlvo, 'pc100', 'taxa',      'moeda'),
    precoArr:           extrairIndicador(painel.precoArrIndicador,      mesAlvo, 'pc100', 'taxa',      'moeda'),
    margemArr:          extrairIndicador(painel.margemArrIndicador,     mesAlvo, 'pc100', 'taxa',      'moeda'),
    custoCab:           extrairIndicador(painel.custoCabIndicador,      mesAlvo, 'pc100', 'taxa',      'moeda'),
  };
}
