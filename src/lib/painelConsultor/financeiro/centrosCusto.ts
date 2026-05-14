/**
 * Função pura montarCentrosCusto.
 *
 * Recebe lancFin (mesmo array que agregaCusteioPecSemJuros consome)
 * + ano + mes + viewMode e devolve quebra por centro_custo do recorte
 * conforme viewMode.
 *
 * REGRA INVIOLÁVEL: usa exatamente os MESMOS predicates da camada
 * oficial — importados de classificacao.ts — para garantir que
 * sum(porCentro.valorRealizado) === custeioPecIndicador.valor.
 *
 * viewMode='mes'     → soma lançamentos com datePagtoMes === mes
 * viewMode='periodo' → soma lançamentos com datePagtoMes em [1..mes]
 *
 * centro_custo null/vazio/whitespace → agregado como '(sem centro)'.
 *
 * Sem query, sem efeito colateral, função pura.
 */
import {
  isRealizado,
  isSaida,
  isCusteioProducaoPecuaria,
  datePagtoAno,
  datePagtoMes,
} from '@/lib/financeiro/classificacao';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import type { CentrosCusto, ItemCentroCusto } from './types';

const SEM_CENTRO = '(sem centro)';

interface MontarCentrosCustoArgs {
  lancFin: FinanceiroLancamento[] | null | undefined;
  ano: number;
  mes: number;                       // 1..12
  viewMode: 'mes' | 'periodo';
}

function normalizaCentro(v: string | null | undefined): string {
  if (v == null) return SEM_CENTRO;
  const t = String(v).trim();
  return t.length === 0 ? SEM_CENTRO : t;
}

export function montarCentrosCusto({
  lancFin,
  ano,
  mes,
  viewMode,
}: MontarCentrosCustoArgs): CentrosCusto | null {
  if (!lancFin || lancFin.length === 0) return null;
  if (mes < 1 || mes > 12) return null;

  // 1. Aplicar EXATAMENTE os mesmos filtros do agregaCusteioPecSemJuros:
  //    - passesBase: isRealizado + isSaida + ano(data_pagamento) === ano
  //    - predicate:  isCusteioProducaoPecuaria
  //    - filtro adicional do viewMode: mes (===) ou periodo (1..mes)
  const filtrados = lancFin.filter((l) => {
    if (!isRealizado(l)) return false;
    if (!isSaida(l)) return false;
    if (datePagtoAno(l) !== ano) return false;
    if (!isCusteioProducaoPecuaria(l)) return false;
    const m = datePagtoMes(l);
    if (m == null || m < 1 || m > 12) return false;
    if (viewMode === 'mes') return m === mes;
    // 'periodo': 1..mes inclusivo
    return m >= 1 && m <= mes;
  });

  if (filtrados.length === 0) {
    return {
      totalRealizado: 0,
      totalMeta: null,
      totalAnoAnt: null,
      porCentro: [],
      top5: [],
    };
  }

  // 2. Agregação por centro_custo (com normalização '(sem centro)')
  const mapa = new Map<string, number>();
  let totalRealizado = 0;
  for (const l of filtrados) {
    const centro = normalizaCentro(l.centro_custo);
    const valor = Math.abs(Number(l.valor) || 0);
    mapa.set(centro, (mapa.get(centro) ?? 0) + valor);
    totalRealizado += valor;
  }

  // 3. Constrói itens, ordena DESC, calcula pct
  const porCentro: ItemCentroCusto[] = Array.from(mapa.entries())
    .map(([centroCusto, valorRealizado]) => ({
      centroCusto,
      valorRealizado,
      pctDoTotal: totalRealizado > 0 ? valorRealizado / totalRealizado : 0,
      valorMeta: null,
      valorAnoAnt: null,
      deltaMetaPct: null,
      deltaAnoAntPct: null,
    }))
    .sort((a, b) => b.valorRealizado - a.valorRealizado);

  const top5 = porCentro.slice(0, 5);

  return {
    totalRealizado,
    totalMeta: null,
    totalAnoAnt: null,
    porCentro,
    top5,
  };
}
