/**
 * useRebanhoOficial — Camada Única de Leitura do Rebanho
 *
 * REGRA ABSOLUTA: toda informação de rebanho (saldos, pesos, arrobas, GMD)
 * DEVE ser consumida exclusivamente por este hook.
 *
 * Fontes oficiais:
 *   - vw_zoot_categoria_mensal  (detalhamento por categoria)
 *   - vw_zoot_fazenda_mensal    (totais fazenda)
 *
 * PROIBIDO:
 *   - Recalcular saldo por movimentações (calcSaldoPorCategoriaLegado)
 *   - Usar resolverPesoOficial / loadPesosPastosPorCategoria
 *   - Qualquer fallback ou view paralela
 *
 * Este hook substitui progressivamente:
 *   - calcSaldoPorCategoriaLegado()
 *   - resolverPesoOficial()
 *   - loadPesosPastosPorCategoria()
 *   - useFechamentoCategoria()
 */

import { useMemo } from 'react';
import {
  useZootCategoriaMensal,
  groupByMes,
  groupByCategoria,
  totalizarPorMes,
  categoriasUnicas,
  type ZootCategoriaMensal,
} from '@/hooks/useZootCategoriaMensal';
import { useZootMensal, indexByMes, type ZootMensal } from '@/hooks/useZootMensal';
import { useMetaGmd } from '@/hooks/useMetaGmd';

// ---------------------------------------------------------------------------
// Re-exports — consumers DEVEM importar daqui, nunca dos hooks internos
// ---------------------------------------------------------------------------
export { type ZootCategoriaMensal, groupByMes, groupByCategoria, totalizarPorMes, categoriasUnicas };
export { type ZootMensal, indexByMes };

// ---------------------------------------------------------------------------
// Tipos de saída compatíveis com os consumers legados
// ---------------------------------------------------------------------------

/** Saldo por categoria para um mês (Map<codigo_categoria, quantidade>) */
export type SaldoMap = Map<string, number>;

/** Peso médio por categoria para um mês (Map<codigo_categoria, peso_kg>) */
export type PesoMap = Map<string, number>;

/** Detalhe completo por categoria para um mês */
export interface CategoriaDetalhe {
  categoriaId: string;
  categoriaCodigo: string;
  categoriaNome: string;
  ordem: number;
  saldoInicial: number;
  saldoFinal: number;
  entradasExternas: number;
  saidasExternas: number;
  evolCatEntrada: number;
  evolCatSaida: number;
  pesoTotalInicial: number;
  pesoTotalFinal: number;
  pesoMedioInicial: number | null;
  pesoMedioFinal: number | null;
  pesoEntradasExternas: number;
  pesoSaidasExternas: number;
  pesoEvolCatEntrada: number;
  pesoEvolCatSaida: number;
  gmd: number | null;
  diasMes: number;
  producaoBiologica: number;
  fonteOficial: string;
}

/** Totais da fazenda para um mês */
export interface FazendaMesDetalhe {
  mes: number;
  anoMes: string;
  cabecasInicio: number;
  cabecasFinal: number;
  pesoInicioKg: number;
  pesoTotalFinalKg: number;
  pesoMedioFinalKg: number | null;
  pesoEntradasKg: number;
  pesoSaidasKg: number;
  entradas: number;
  saidas: number;
  diasMes: number;
  gmdKgCabDia: number | null;
  uaMedia: number | null;
  areaProdutiva: number;
  lotacaoUaHa: number | null;
  fonteOficial: string;
}

function roundNumber(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeMetaCategorias(
  rows: ZootCategoriaMensal[],
  gmdRows: Array<{ categoria: string; meses: Record<string, number> }>,
): ZootCategoriaMensal[] {
  if (rows.length === 0) return rows;

  const gmdMap = new Map<string, Record<string, number>>();
  for (const row of gmdRows) {
    gmdMap.set(row.categoria, row.meses);
  }

  const grouped = new Map<string, ZootCategoriaMensal[]>();
  for (const row of rows) {
    const key = `${row.fazenda_id}|${row.ano}|${row.categoria_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const normalized: ZootCategoriaMensal[] = [];

  for (const catRows of grouped.values()) {
    const ordered = [...catRows].sort((a, b) => a.mes - b.mes);
    let prevPesoTotalFinal: number | null = null;

    for (const row of ordered) {
      const mesKey = String(row.mes).padStart(2, '0');
      const gmdInput = gmdMap.get(row.categoria_codigo)?.[mesKey] ?? row.gmd ?? null;
      const saldoInicial = row.saldo_inicial;
      const saldoFinal = row.saldo_final;
      const cabecasMedias = (saldoInicial + saldoFinal) / 2;
      const diasMes = row.dias_mes;
      const pesoTotalInicial = prevPesoTotalFinal ?? row.peso_total_inicial;

      const producaoBiologica =
        gmdInput !== null && diasMes > 0 && cabecasMedias !== 0
          ? roundNumber(gmdInput * cabecasMedias * diasMes, 2)
          : row.producao_biologica;

      const pesoTotalFinal = roundNumber(
        pesoTotalInicial
          + row.peso_entradas_externas
          + row.peso_evol_cat_entrada
          - row.peso_saidas_externas
          - row.peso_evol_cat_saida
          + producaoBiologica,
        2,
      );

      const pesoMedioInicial = saldoInicial !== 0 ? roundNumber(pesoTotalInicial / saldoInicial, 2) : null;
      const pesoMedioFinal = saldoFinal !== 0 ? roundNumber(pesoTotalFinal / saldoFinal, 2) : null;
      const gmdConferido = cabecasMedias !== 0 && diasMes > 0
        ? roundNumber(producaoBiologica / cabecasMedias / diasMes, 4)
        : gmdInput;

      normalized.push({
        ...row,
        gmd: gmdConferido,
        producao_biologica: producaoBiologica,
        peso_total_inicial: pesoTotalInicial,
        peso_total_final: pesoTotalFinal,
        peso_medio_inicial: pesoMedioInicial,
        peso_medio_final: pesoMedioFinal,
      });

      prevPesoTotalFinal = pesoTotalFinal;
    }
  }

  return normalized.sort((a, b) => {
    const fazendaCmp = a.fazenda_id.localeCompare(b.fazenda_id);
    if (fazendaCmp !== 0) return fazendaCmp;
    const categoriaCmp = a.ordem_exibicao - b.ordem_exibicao;
    if (categoriaCmp !== 0) return categoriaCmp;
    return a.mes - b.mes;
  });
}

function buildMetaFazendaRows(rows: ZootCategoriaMensal[], baseRows: ZootMensal[]): ZootMensal[] {
  if (rows.length === 0) return baseRows;

  const groupedByMes = groupByMes(rows);
  const baseByMes = indexByMes(baseRows);
  const meses = Array.from(new Set([
    ...baseRows.map(row => row.mes),
    ...rows.map(row => row.mes),
  ])).sort((a, b) => a - b);

  return meses.map((mes) => {
    const mesKey = String(mes).padStart(2, '0');
    const baseRow = baseByMes[mesKey];
    const cats = groupedByMes[mes] || [];

    if (cats.length === 0 && baseRow) return baseRow;
    if (cats.length === 0) {
      throw new Error(`Meta sem categorias para o mês ${mesKey}`);
    }

    const first = cats[0];
    const cabecasInicio = cats.reduce((sum, row) => sum + row.saldo_inicial, 0);
    const cabecasFinal = cats.reduce((sum, row) => sum + row.saldo_final, 0);
    const pesoInicioKg = roundNumber(cats.reduce((sum, row) => sum + row.peso_total_inicial, 0), 2);
    const pesoTotalFinalKg = roundNumber(cats.reduce((sum, row) => sum + row.peso_total_final, 0), 2);
    const pesoEntradasKg = roundNumber(cats.reduce((sum, row) => sum + row.peso_entradas_externas, 0), 2);
    const pesoSaidasKg = roundNumber(cats.reduce((sum, row) => sum + row.peso_saidas_externas, 0), 2);
    const entradas = cats.reduce((sum, row) => sum + row.entradas_externas, 0);
    const saidas = cats.reduce((sum, row) => sum + row.saidas_externas, 0);
    const gmdNumeradorKg = roundNumber(cats.reduce((sum, row) => sum + row.producao_biologica, 0), 2);
    const diasMes = baseRow?.dias_mes ?? first.dias_mes;
    const cabecasMedias = (cabecasInicio + cabecasFinal) / 2;
    const pesoMedioFinalKg = cabecasFinal !== 0 ? roundNumber(pesoTotalFinalKg / cabecasFinal, 2) : null;
    const gmdKgCabDia = cabecasMedias !== 0 && diasMes > 0
      ? roundNumber(gmdNumeradorKg / cabecasMedias / diasMes, 4)
      : null;
    const uaMedia = pesoMedioFinalKg !== null
      ? roundNumber((cabecasMedias * pesoMedioFinalKg) / 450, 2)
      : null;
    const areaProdutivaHa = baseRow?.area_produtiva_ha ?? 0;
    const lotacaoUaHa = uaMedia !== null && areaProdutivaHa > 0
      ? roundNumber(uaMedia / areaProdutivaHa, 2)
      : null;

    return {
      fazenda_id: first.fazenda_id,
      cliente_id: first.cliente_id,
      ano: first.ano,
      mes,
      cenario: 'meta',
      mes_key: mesKey,
      ano_mes: `${first.ano}-${mesKey}`,
      cabecas_inicio: cabecasInicio,
      cabecas_final: cabecasFinal,
      peso_inicio_kg: pesoInicioKg,
      peso_total_final_kg: pesoTotalFinalKg,
      peso_medio_final_kg: pesoMedioFinalKg,
      peso_entradas_kg: pesoEntradasKg,
      peso_saidas_kg: pesoSaidasKg,
      entradas,
      saidas,
      dias_mes: diasMes,
      gmd_kg_cab_dia: gmdKgCabDia,
      gmd_numerador_kg: cabecasMedias !== 0 ? gmdNumeradorKg : null,
      ua_media: uaMedia,
      area_produtiva_ha: areaProdutivaHa,
      lotacao_ua_ha: lotacaoUaHa,
      fonte_oficial_mes: baseRow?.fonte_oficial_mes ?? 'projecao',
    };
  });
}

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------

interface UseRebanhoOficialParams {
  ano: number;
  cenario: 'realizado' | 'meta';
  global?: boolean;
}

export function useRebanhoOficial({ ano, cenario, global = false }: UseRebanhoOficialParams) {
  const { rows: metaGmdRows } = useMetaGmd(String(ano));

  const {
    data: categoriasData,
    isLoading: loadingCategorias,
    error: errorCategorias,
  } = useZootCategoriaMensal({ ano, cenario, global });

  const {
    data: fazendaData,
    isLoading: loadingFazenda,
    error: errorFazenda,
  } = useZootMensal({ ano, cenario });

  const loading = loadingCategorias || loadingFazenda;
  const error = errorCategorias || errorFazenda;

  // ── Raw data accessors ──
  const baseCategorias = categoriasData ?? [];
  const baseFazenda = fazendaData ?? [];

  const rawCategorias = useMemo(() => {
    if (global || cenario !== 'meta') return baseCategorias;
    return normalizeMetaCategorias(baseCategorias, metaGmdRows);
  }, [baseCategorias, cenario, global, metaGmdRows]);

  const rawFazenda = useMemo(() => {
    if (global || cenario !== 'meta') return baseFazenda;
    return buildMetaFazendaRows(rawCategorias, baseFazenda);
  }, [baseFazenda, cenario, global, rawCategorias]);

  // ── Grouped data ──
  const byMes = useMemo(() => groupByMes(rawCategorias), [rawCategorias]);
  const byCategoria = useMemo(() => groupByCategoria(rawCategorias), [rawCategorias]);
  const totaisPorMes = useMemo(() => totalizarPorMes(rawCategorias), [rawCategorias]);
  const categorias = useMemo(() => categoriasUnicas(rawCategorias), [rawCategorias]);
  const fazendaByMes = useMemo(() => indexByMes(rawFazenda), [rawFazenda]);

  // ── Compatibilidade com API legada ──

  /**
   * Retorna o saldo final por categoria para um mês específico.
   * DROP-IN replacement for calcSaldoPorCategoriaLegado(saldos, lancs, ano, mes)
   */
  const getSaldoMap = useMemo(() => {
    return (mes: number): SaldoMap => {
      const map = new Map<string, number>();
      const cats = byMes[mes] || [];
      for (const c of cats) {
        map.set(c.categoria_codigo, (map.get(c.categoria_codigo) || 0) + c.saldo_final);
      }
      return map;
    };
  }, [byMes]);

  /**
   * Retorna o saldo inicial por categoria para um mês específico.
   */
  const getSaldoInicialMap = useMemo(() => {
    return (mes: number): SaldoMap => {
      const map = new Map<string, number>();
      const cats = byMes[mes] || [];
      for (const c of cats) {
        map.set(c.categoria_codigo, (map.get(c.categoria_codigo) || 0) + c.saldo_inicial);
      }
      return map;
    };
  }, [byMes]);

  /**
   * Retorna peso médio final por categoria para um mês.
   * DROP-IN replacement for resolverPesoOficial / pesoFechamentoMap
   */
  const getPesoMedioMap = useMemo(() => {
    return (mes: number): PesoMap => {
      const map = new Map<string, number>();
      const cats = byMes[mes] || [];
      for (const c of cats) {
        if (c.peso_medio_final != null && c.saldo_final > 0) {
          map.set(c.categoria_codigo, c.peso_medio_final);
        }
      }
      return map;
    };
  }, [byMes]);

  /**
   * Retorna peso médio inicial por categoria para um mês.
   */
  const getPesoMedioInicialMap = useMemo(() => {
    return (mes: number): PesoMap => {
      const map = new Map<string, number>();
      const cats = byMes[mes] || [];
      for (const c of cats) {
        if (c.peso_medio_inicial != null && c.saldo_inicial > 0) {
          map.set(c.categoria_codigo, c.peso_medio_inicial);
        }
      }
      return map;
    };
  }, [byMes]);

  /**
   * Retorna detalhe completo de cada categoria em um mês.
   */
  const getCategoriasDetalhe = useMemo(() => {
    return (mes: number): CategoriaDetalhe[] => {
      const cats = byMes[mes] || [];
      return cats.map(c => ({
        categoriaId: c.categoria_id,
        categoriaCodigo: c.categoria_codigo,
        categoriaNome: c.categoria_nome,
        ordem: c.ordem_exibicao,
        saldoInicial: c.saldo_inicial,
        saldoFinal: c.saldo_final,
        entradasExternas: c.entradas_externas,
        saidasExternas: c.saidas_externas,
        evolCatEntrada: c.evol_cat_entrada,
        evolCatSaida: c.evol_cat_saida,
        pesoTotalInicial: c.peso_total_inicial,
        pesoTotalFinal: c.peso_total_final,
        pesoMedioInicial: c.peso_medio_inicial,
        pesoMedioFinal: c.peso_medio_final,
        pesoEntradasExternas: c.peso_entradas_externas,
        pesoSaidasExternas: c.peso_saidas_externas,
        pesoEvolCatEntrada: c.peso_evol_cat_entrada,
        pesoEvolCatSaida: c.peso_evol_cat_saida,
        gmd: c.gmd,
        diasMes: c.dias_mes,
        producaoBiologica: c.producao_biologica,
        fonteOficial: c.fonte_oficial_mes,
      }));
    };
  }, [byMes]);

  /**
   * Retorna totais da fazenda para um mês.
   */
  const getFazendaMes = useMemo(() => {
    return (mes: number): FazendaMesDetalhe | null => {
      const key = String(mes).padStart(2, '0');
      const row = fazendaByMes[key];
      if (!row) return null;
      return {
        mes: row.mes,
        anoMes: row.ano_mes,
        cabecasInicio: row.cabecas_inicio,
        cabecasFinal: row.cabecas_final,
        pesoInicioKg: row.peso_inicio_kg,
        pesoTotalFinalKg: row.peso_total_final_kg,
        pesoMedioFinalKg: row.peso_medio_final_kg,
        pesoEntradasKg: row.peso_entradas_kg,
        pesoSaidasKg: row.peso_saidas_kg,
        entradas: row.entradas,
        saidas: row.saidas,
        diasMes: row.dias_mes,
        gmdKgCabDia: row.gmd_kg_cab_dia,
        uaMedia: row.ua_media,
        areaProdutiva: row.area_produtiva_ha,
        lotacaoUaHa: row.lotacao_ua_ha,
        fonteOficial: row.fonte_oficial_mes,
      };
    };
  }, [fazendaByMes]);

  /**
   * Saldo final total da fazenda em um mês.
   */
  const getSaldoFinalTotal = useMemo(() => {
    return (mes: number): number => {
      const key = String(mes).padStart(2, '0');
      const row = fazendaByMes[key];
      return row?.cabecas_final ?? 0;
    };
  }, [fazendaByMes]);

  /**
   * Peso médio ponderado do rebanho em um mês.
   */
  const getPesoMedioRebanho = useMemo(() => {
    return (mes: number): number | null => {
      const key = String(mes).padStart(2, '0');
      const row = fazendaByMes[key];
      return row?.peso_medio_final_kg ?? null;
    };
  }, [fazendaByMes]);

  /**
   * Peso total do rebanho em um mês.
   */
  const getPesoTotalRebanho = useMemo(() => {
    return (mes: number): number => {
      const key = String(mes).padStart(2, '0');
      const row = fazendaByMes[key];
      return row?.peso_total_final_kg ?? 0;
    };
  }, [fazendaByMes]);

  /**
   * Arrobas totais do rebanho em um mês (peso total / 30).
   */
  const getArrobasRebanho = useMemo(() => {
    return (mes: number): number => {
      return getPesoTotalRebanho(mes) / 30;
    };
  }, [getPesoTotalRebanho]);

  /**
   * UA total do rebanho em um mês (peso total / 450).
   */
  const getUATotal = useMemo(() => {
    return (mes: number): number => {
      return getPesoTotalRebanho(mes) / 450;
    };
  }, [getPesoTotalRebanho]);

  /**
   * UA/ha do rebanho em um mês.
   */
  const getUAHa = useMemo(() => {
    return (mes: number): number | null => {
      const key = String(mes).padStart(2, '0');
      const row = fazendaByMes[key];
      return row?.lotacao_ua_ha ?? null;
    };
  }, [fazendaByMes]);

  /**
   * GMD oficial do mês.
   */
  const getGMD = useMemo(() => {
    return (mes: number): number | null => {
      const key = String(mes).padStart(2, '0');
      const row = fazendaByMes[key];
      return row?.gmd_kg_cab_dia ?? null;
    };
  }, [fazendaByMes]);

  return {
    // Status
    loading,
    error,

    // Raw data (for advanced consumers)
    rawCategorias,
    rawFazenda,
    byMes,
    byCategoria,
    totaisPorMes,
    categorias,
    fazendaByMes,

    // API compatível com consumers legados
    getSaldoMap,
    getSaldoInicialMap,
    getPesoMedioMap,
    getPesoMedioInicialMap,
    getCategoriasDetalhe,
    getFazendaMes,
    getSaldoFinalTotal,
    getPesoMedioRebanho,
    getPesoTotalRebanho,
    getArrobasRebanho,
    getUATotal,
    getUAHa,
    getGMD,
  };
}

// ---------------------------------------------------------------------------
// Helpers estáticos (para uso fora de componentes React)
// ---------------------------------------------------------------------------

/**
 * Converte array de ZootCategoriaMensal em SaldoMap para um mês.
 * Útil quando já se tem os dados carregados fora do hook.
 */
export function buildSaldoMapFromView(rows: ZootCategoriaMensal[], mes: number): SaldoMap {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.mes === mes) {
      map.set(r.categoria_codigo, (map.get(r.categoria_codigo) || 0) + r.saldo_final);
    }
  }
  return map;
}

/**
 * Converte array de ZootCategoriaMensal em PesoMap para um mês.
 */
export function buildPesoMapFromView(rows: ZootCategoriaMensal[], mes: number): PesoMap {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.mes === mes && r.peso_medio_final != null && r.saldo_final > 0) {
      map.set(r.categoria_codigo, r.peso_medio_final);
    }
  }
  return map;
}

/**
 * Calcula peso total ponderado do rebanho a partir de ZootCategoriaMensal.
 */
export function calcPesoTotalFromView(rows: ZootCategoriaMensal[], mes: number): number {
  return rows
    .filter(r => r.mes === mes)
    .reduce((sum, r) => sum + r.peso_total_final, 0);
}
