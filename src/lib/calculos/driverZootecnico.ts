/**
 * driverZootecnico.ts
 *
 * Extrai valores mensais de drivers zootécnicos a partir da consolidação META.
 * Fonte única de verdade: MetaCategoriaMes[] (useMetaConsolidacao / vw_zoot_categoria_mensal).
 */
import type { MetaCategoriaMes } from '@/hooks/useMetaConsolidacao';
import type { Categoria } from '@/types/cattle';

/** Categorias que compõem cada driver */
const DRIVER_CATEGORIAS: Record<string, Categoria[]> = {
  cabecas_total: ['mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros', 'mamotes_f', 'desmama_f', 'novilhas', 'vacas'],
  cabecas_engorda: ['garrotes', 'bois'],
  cabecas_recria: ['desmama_m', 'desmama_f', 'novilhas'],
  cabecas_matrizes: ['vacas'],
};

/**
 * Retorna, para cada driver, um array de 12 valores (jan-dez)
 * representando as cabeças médias do mês (cabMedias = (SI + SF) / 2).
 *
 * Se não houver dados para um driver/mês, retorna 0.
 */
export function extrairDriversMensais(
  consolidacao: MetaCategoriaMes[],
): Record<string, number[]> {
  const result: Record<string, number[]> = {};

  for (const [driver, categorias] of Object.entries(DRIVER_CATEGORIAS)) {
    const meses = new Array(12).fill(0);

    for (const row of consolidacao) {
      if (!categorias.includes(row.categoria)) continue;
      const mesIdx = parseInt(row.mes, 10) - 1;
      if (mesIdx >= 0 && mesIdx < 12) {
        meses[mesIdx] += row.cabMedias;
      }
    }

    // Round to integers (cabeças médias)
    result[driver] = meses.map(v => Math.round(v));
  }

  return result;
}

/**
 * Verifica quais drivers possuem dados suficientes (ao menos 1 mês > 0).
 */
export function validarDriversDisponiveis(
  driverValues: Record<string, number[]>,
): { driver: string; temDados: boolean; mesesComDados: number }[] {
  return Object.entries(driverValues).map(([driver, meses]) => {
    const mesesComDados = meses.filter(v => v > 0).length;
    return { driver, temDados: mesesComDados > 0, mesesComDados };
  });
}
