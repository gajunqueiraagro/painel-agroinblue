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

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------

interface UseRebanhoOficialParams {
  ano: number;
  cenario: 'realizado' | 'meta';
  global?: boolean;
}

export function useRebanhoOficial({ ano, cenario, global = false }: UseRebanhoOficialParams) {
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
  const rawCategorias = categoriasData ?? [];
  const rawFazenda = fazendaData ?? [];

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
