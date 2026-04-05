/**
 * Hook que produz a fotografia oficial mensal por categoria.
 *
 * Fonte única de verdade para: GMD, Valor do Rebanho, Indicadores.
 *
 * - Quantidade final: saldo conciliado do sistema (saldos_iniciais + lançamentos)
 * - Peso médio final: agregação ponderada dos fechamentos de pasto do mês
 * - Fallbacks de peso: último lançamento com peso → saldo inicial
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { CategoriaRebanho } from '@/hooks/usePastos';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type OrigemPeso = 'pastos' | 'lancamento' | 'saldo_inicial' | 'sem_base';

export interface FechamentoCategoriaRow {
  categoriaId: string;
  categoriaCodigo: string;
  categoriaNome: string;
  ordemExibicao: number;
  quantidadeFinal: number;
  pesoMedioFinalKg: number | null;
  pesoTotalFinalKg: number;
  origemPeso: OrigemPeso;
}

export interface PesosPastosResult {
  porCategoria: Record<string, number>;
  quantidadePorCategoria: Record<string, number>;
  pesoMedioGeralPastos: number | null;
  totalCabecasPastos: number;
}

export interface FechamentoCategoriaResumo {
  rows: FechamentoCategoriaRow[];
  totalCabecas: number;
  pesoMedioGeral: number | null;
  pesoTotalGeral: number;
  pesoMedioGeralPastos: number | null;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Função pura de agregação de pesos dos pastos (exportada para reuso)
// ---------------------------------------------------------------------------

export async function loadPesosPastosPorCategoria(
  fazendaId: string,
  anoMes: string,
  categorias: CategoriaRebanho[],
): Promise<Record<string, number>> {
  const result = await loadPesosPastosCompleto(fazendaId, anoMes, categorias);
  return result.porCategoria;
}

/**
 * Retorna pesos por categoria E peso médio geral calculado
 * exclusivamente a partir de fechamento_pasto_itens (fonte oficial).
 */
export async function loadPesosPastosCompleto(
  fazendaId: string,
  anoMes: string,
  categorias: CategoriaRebanho[],
): Promise<PesosPastosResult> {
  const idToCodigo = new Map(categorias.map(c => [c.id, c.codigo]));

  const { data: fechamentos } = await supabase
    .from('fechamento_pastos')
    .select('id')
    .eq('fazenda_id', fazendaId)
    .eq('ano_mes', anoMes);

  if (!fechamentos?.length) return { porCategoria: {}, pesoMedioGeralPastos: null };

  const { data: itens } = await supabase
    .from('fechamento_pasto_itens')
    .select('categoria_id, quantidade, peso_medio_kg')
    .in('fechamento_id', fechamentos.map(f => f.id));

  if (!itens) return { porCategoria: {}, pesoMedioGeralPastos: null };

  const acum: Record<string, { totalPeso: number; totalQtd: number }> = {};
  let geralPeso = 0;
  let geralQtd = 0;

  itens.forEach(item => {
    if (!item.peso_medio_kg || item.peso_medio_kg <= 0 || item.quantidade <= 0) return;
    const codigo = idToCodigo.get(item.categoria_id);
    if (!codigo) return;
    if (!acum[codigo]) acum[codigo] = { totalPeso: 0, totalQtd: 0 };
    acum[codigo].totalPeso += item.peso_medio_kg * item.quantidade;
    acum[codigo].totalQtd += item.quantidade;
    geralPeso += item.peso_medio_kg * item.quantidade;
    geralQtd += item.quantidade;
  });

  const porCategoria: Record<string, number> = {};
  Object.entries(acum).forEach(([codigo, { totalPeso, totalQtd }]) => {
    if (totalQtd > 0) porCategoria[codigo] = totalPeso / totalQtd;
  });

  const pesoMedioGeralPastos = geralQtd > 0 ? geralPeso / geralQtd : null;

  return { porCategoria, pesoMedioGeralPastos };
}

// ---------------------------------------------------------------------------
// Função pura: resolve peso oficial de uma categoria
// ---------------------------------------------------------------------------

export function resolverPesoOficial(
  catCodigo: string,
  pesosPastos: Record<string, number>,
  saldosIniciais: SaldoInicial[],
  lancamentos: Lancamento[],
  ano: number,
  mes: number,
): { valor: number | null; origem: OrigemPeso } {
  // 1. Fechamento de pasto
  if (pesosPastos[catCodigo] && pesosPastos[catCodigo] > 0) {
    return { valor: pesosPastos[catCodigo], origem: 'pastos' };
  }
  // 2. Último lançamento com peso
  const endDate = `${ano}-${String(mes).padStart(2, '0')}-31`;
  const lancsComPeso = lancamentos.filter(
    l => l.categoria === catCodigo && l.data <= endDate && l.pesoMedioKg && l.pesoMedioKg > 0,
  );
  if (lancsComPeso.length > 0) {
    const sorted = [...lancsComPeso].sort((a, b) => b.data.localeCompare(a.data));
    return { valor: sorted[0].pesoMedioKg!, origem: 'lancamento' };
  }
  // 3. Saldo inicial
  const si = saldosIniciais.find(s => s.ano === ano && s.categoria === catCodigo);
  if (si?.pesoMedioKg && si.pesoMedioKg > 0) {
    return { valor: si.pesoMedioKg, origem: 'saldo_inicial' };
  }
  return { valor: null, origem: 'sem_base' };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFechamentoCategoria(
  fazendaId: string | undefined,
  ano: number,
  mes: number,
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
  categorias: CategoriaRebanho[],
): FechamentoCategoriaResumo {
  const [pesosPastos, setPesosPastos] = useState<Record<string, number>>({});
  const [pesoMedioGeralPastosState, setPesoMedioGeralPastosState] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  const loadPesos = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__' || !categorias.length) {
      setPesosPastos({});
      setPesoMedioGeralPastosState(null);
      return;
    }
    setLoading(true);
    try {
      const { porCategoria, pesoMedioGeralPastos } = await loadPesosPastosCompleto(fazendaId, anoMes, categorias);
      setPesosPastos(porCategoria);
      setPesoMedioGeralPastosState(pesoMedioGeralPastos);
    } catch {
      setPesosPastos({});
      setPesoMedioGeralPastosState(null);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, anoMes, categorias]);

  useEffect(() => { loadPesos(); }, [loadPesos]);

  const result = useMemo((): FechamentoCategoriaResumo => {
    const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);

    const rows: FechamentoCategoriaRow[] = categorias
      .sort((a, b) => a.ordem_exibicao - b.ordem_exibicao)
      .map(cat => {
        const qtd = saldoMap.get(cat.codigo) || 0;
        const { valor: pesoMedio, origem } = resolverPesoOficial(
          cat.codigo, pesosPastos, saldosIniciais, lancamentos, ano, mes,
        );
        const pesoTotal = qtd * (pesoMedio || 0);
        return {
          categoriaId: cat.id,
          categoriaCodigo: cat.codigo,
          categoriaNome: cat.nome,
          ordemExibicao: cat.ordem_exibicao,
          quantidadeFinal: qtd,
          pesoMedioFinalKg: pesoMedio,
          pesoTotalFinalKg: pesoTotal,
          origemPeso: origem,
        };
      });

    const totalCabecas = rows.reduce((s, r) => s + r.quantidadeFinal, 0);
    const pesoTotalGeral = rows.reduce((s, r) => s + r.pesoTotalFinalKg, 0);
    // pesoMedioGeral agora usa a fonte oficial dos pastos quando disponível
    const pesoMedioGeral = pesoMedioGeralPastosState ?? (totalCabecas > 0 ? pesoTotalGeral / totalCabecas : null);

    return { rows, totalCabecas, pesoMedioGeral, pesoTotalGeral, pesoMedioGeralPastos: pesoMedioGeralPastosState, loading };
  }, [categorias, saldosIniciais, lancamentos, ano, mes, pesosPastos, pesoMedioGeralPastosState, loading]);

  return result;
}
