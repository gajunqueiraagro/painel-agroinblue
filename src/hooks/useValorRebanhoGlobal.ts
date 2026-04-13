/**
 * Hook que agrega dados de Valor do Rebanho de todas as fazendas
 * para a visão Global — mesma estrutura da tela individual.
 *
 * Regras:
 * - Soma: cabeças, peso total, valor total
 * - Recalcula: peso médio, R$/@, R$/cab
 * - Não inventa dado: se fazenda não tem base, exclui
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { CategoriaRebanho } from '@/hooks/usePastos';
import type { SnapshotDetalheCategoria } from '@/hooks/useValorRebanho';
import type { OrigemPeso } from '@/hooks/useFechamentoCategoria';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

const ORDEM_CATEGORIAS_FIXA = [
  'mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros',
  'mamotes_f', 'desmama_f', 'novilhas', 'vacas',
];

export interface GlobalCategoriaRow {
  categoriaId: string;
  codigo: string;
  nome: string;
  saldo: number;
  pesoMedio: number;
  origemPeso: OrigemPeso;
  precoKg: number;
  valorCabeca: number;
  precoArroba: number;
  valorTotal: number;
  isSugerido: boolean;
}

export interface GlobalMetricas {
  valor: number | null;
  cabecas: number | null;
  pesoTotalKg: number | null;
  pesoMedio: number | null;
  totalArrobas: number | null;
  precoArroba: number | null;
  valorCabeca: number | null;
  precoKg: number | null;
}

export type GlobalFonteMes = 'live' | 'snapshot' | 'snapshot_incompleto' | 'misto';

interface HistoricoMesGlobal {
  valor: number;
  pesoKg: number;
}

export interface ValorRebanhoGlobalResult {
  rows: GlobalCategoriaRow[];
  metricas: GlobalMetricas;
  metricasMesAnterior: GlobalMetricas | null;
  metricasInicioAno: GlobalMetricas | null;
  fonteMes: GlobalFonteMes;
  historicoPorMes: Record<string, HistoricoMesGlobal>;
  historicoDetalhado: Record<string, SnapshotDetalheCategoria[]>;
  loading: boolean;
  fazendasFechadas: number;
  fazendasTotal: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMetrics(valor: number | null, cabecas: number | null, pesoTotalKg: number | null): GlobalMetricas {
  const pesoMedio = cabecas != null && pesoTotalKg != null && cabecas > 0 ? pesoTotalKg / cabecas : null;
  const totalArrobas = pesoTotalKg != null ? pesoTotalKg / 30 : null;
  const precoArroba = valor != null && totalArrobas != null && totalArrobas > 0 ? valor / totalArrobas : null;
  const valorCabeca = valor != null && cabecas != null && cabecas > 0 ? valor / cabecas : null;
  const precoKg = valor != null && pesoTotalKg != null && pesoTotalKg > 0 ? valor / pesoTotalKg : null;
  return { valor, cabecas, pesoTotalKg, pesoMedio, totalArrobas, precoArroba, valorCabeca, precoKg };
}

function aggregateSnapshotItems(
  allItems: SnapshotDetalheCategoria[],
  categorias: CategoriaRebanho[],
): GlobalCategoriaRow[] {
  // Aggregate by category code
  const map = new Map<string, { qty: number; pesoTotal: number; valorTotal: number; precoKgWeighted: number }>();

  allItems.forEach(item => {
    const prev = map.get(item.categoria) || { qty: 0, pesoTotal: 0, valorTotal: 0, precoKgWeighted: 0 };
    const qty = Number(item.quantidade) || 0;
    const pesoMedio = Number(item.peso_medio_kg) || 0;
    const precoKg = Number(item.preco_kg) || 0;
    const valor = Number(item.valor_total_categoria) || 0;
    prev.qty += qty;
    prev.pesoTotal += qty * pesoMedio;
    prev.valorTotal += valor;
    prev.precoKgWeighted += qty * pesoMedio * precoKg; // weighted by total kg
    map.set(item.categoria, prev);
  });

  return ORDEM_CATEGORIAS_FIXA.map(codigo => {
    const cat = categorias.find(c => c.codigo === codigo);
    const agg = map.get(codigo);
    if (!agg || agg.qty === 0) {
      return {
        categoriaId: cat?.id || codigo,
        codigo,
        nome: cat?.nome || codigo,
        saldo: 0, pesoMedio: 0, origemPeso: 'sem_base' as OrigemPeso,
        precoKg: 0, valorCabeca: 0, precoArroba: 0, valorTotal: 0, isSugerido: false,
      };
    }
    const pesoMedio = agg.pesoTotal / agg.qty;
    const precoKg = agg.pesoTotal > 0 ? agg.precoKgWeighted / agg.pesoTotal : 0;
    const arrobas = agg.pesoTotal / 30;
    return {
      categoriaId: cat?.id || codigo,
      codigo,
      nome: cat?.nome || codigo,
      saldo: agg.qty,
      pesoMedio,
      origemPeso: 'pastos' as OrigemPeso,
      precoKg,
      valorCabeca: agg.qty > 0 ? agg.valorTotal / agg.qty : 0,
      precoArroba: arrobas > 0 ? agg.valorTotal / arrobas : 0,
      valorTotal: agg.valorTotal,
      isSugerido: false,
    };
  });
}

function metricsFromRows(rows: GlobalCategoriaRow[]): GlobalMetricas {
  const cabecas = rows.reduce((s, r) => s + r.saldo, 0);
  const pesoTotalKg = rows.reduce((s, r) => s + r.saldo * r.pesoMedio, 0);
  const valor = rows.reduce((s, r) => s + r.valorTotal, 0);
  if (cabecas === 0) return buildMetrics(null, null, null);
  return buildMetrics(valor, cabecas, pesoTotalKg);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useValorRebanhoGlobal(
  fazendaIds: string[],
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
  categorias: CategoriaRebanho[],
  anoFiltro: string,
  mesFiltro: string,
): ValorRebanhoGlobalResult {
  const [loading, setLoading] = useState(false);

  // Snapshot data for ALL farms for the year
  const [snapshotHeaders, setSnapshotHeaders] = useState<Record<string, Record<string, { valor: number; pesoKg: number }>>>({});
  const [snapshotItems, setSnapshotItems] = useState<Record<string, Record<string, SnapshotDetalheCategoria[]>>>({});
  const [precosAllFarms, setPrecosAllFarms] = useState<Record<string, Record<string, Record<string, number>>>>({});
  const [pesosPastosPorFazenda, setPesosPastosPorFazenda] = useState<Record<string, Record<string, number>>>({});
  const [zootData, setZootData] = useState<Map<string, Map<number, Array<{ categoria_codigo: string; saldo_final: number; peso_medio_final: number | null }>>>>(new Map());

  const anoMes = `${anoFiltro}-${mesFiltro}`;
  const mesNum = Number(mesFiltro);
  const anoNum = Number(anoFiltro);

  // Load all data for all farms
  const loadAllData = useCallback(async () => {
    if (fazendaIds.length === 0 || categorias.length === 0) {
      setSnapshotHeaders({});
      setSnapshotItems({});
      setPrecosAllFarms({});
      return;
    }

    setLoading(true);
    try {
      const anoMeses = [
        `${Number(anoFiltro) - 1}-12`,
        ...Array.from({ length: 12 }, (_, i) => `${anoFiltro}-${String(i + 1).padStart(2, '0')}`),
      ];

      const [headersRes, itensRes, precosRes, zootViewRes] = await Promise.all([
        supabase
          .from('valor_rebanho_fechamento')
          .select('fazenda_id, ano_mes, valor_total, peso_total_kg, status')
          .in('fazenda_id', fazendaIds)
          .in('ano_mes', anoMeses)
          .eq('status', 'fechado'),
        supabase
          .from('valor_rebanho_fechamento_itens')
          .select('fazenda_id, ano_mes, categoria, quantidade, peso_medio_kg, preco_kg, valor_total_categoria')
          .in('fazenda_id', fazendaIds)
          .in('ano_mes', anoMeses),
        supabase
          .from('valor_rebanho_mensal')
          .select('fazenda_id, ano_mes, categoria, preco_kg')
          .in('fazenda_id', fazendaIds)
          .in('ano_mes', anoMeses),
        // FONTE OFICIAL: vw_zoot_categoria_mensal para dados físicos
        supabase
          .from('vw_zoot_categoria_mensal' as any)
          .select('fazenda_id, mes, categoria_codigo, saldo_final, peso_medio_final')
          .in('fazenda_id', fazendaIds)
          .eq('ano', Number(anoFiltro))
          .eq('cenario', 'realizado'),
      ]);

      // Parse headers: fazendaId -> anoMes -> {valor, pesoKg}
      const hMap: Record<string, Record<string, { valor: number; pesoKg: number }>> = {};
      (headersRes.data || []).forEach((row: any) => {
        if (!hMap[row.fazenda_id]) hMap[row.fazenda_id] = {};
        hMap[row.fazenda_id][row.ano_mes] = {
          valor: Number(row.valor_total) || 0,
          pesoKg: Number(row.peso_total_kg) || 0,
        };
      });
      setSnapshotHeaders(hMap);

      // Parse items: fazendaId -> anoMes -> items[]
      const iMap: Record<string, Record<string, SnapshotDetalheCategoria[]>> = {};
      (itensRes.data || []).forEach((row: any) => {
        if (!iMap[row.fazenda_id]) iMap[row.fazenda_id] = {};
        if (!iMap[row.fazenda_id][row.ano_mes]) iMap[row.fazenda_id][row.ano_mes] = [];
        iMap[row.fazenda_id][row.ano_mes].push({
          categoria: row.categoria,
          quantidade: Number(row.quantidade) || 0,
          peso_medio_kg: Number(row.peso_medio_kg) || 0,
          preco_kg: Number(row.preco_kg) || 0,
          valor_total_categoria: Number(row.valor_total_categoria) || 0,
        });
      });
      setSnapshotItems(iMap);

      // Parse precos: fazendaId -> anoMes -> {codigo: preco_kg}
      const pMap: Record<string, Record<string, Record<string, number>>> = {};
      (precosRes.data || []).forEach((row: any) => {
        if (!pMap[row.fazenda_id]) pMap[row.fazenda_id] = {};
        if (!pMap[row.fazenda_id][row.ano_mes]) pMap[row.fazenda_id][row.ano_mes] = {};
        pMap[row.fazenda_id][row.ano_mes][row.categoria] = Number(row.preco_kg) || 0;
      });
      setPrecosAllFarms(pMap);

      // Build zoot view data per farm per month
      const zootRows = ((zootViewRes.data || []) as unknown as Array<{ fazenda_id: string; mes: number; categoria_codigo: string; saldo_final: number; peso_medio_final: number | null }>);
      const zootByFarmMes = new Map<string, Map<number, Array<{ categoria_codigo: string; saldo_final: number; peso_medio_final: number | null }>>>();
      zootRows.forEach(r => {
        if (!zootByFarmMes.has(r.fazenda_id)) zootByFarmMes.set(r.fazenda_id, new Map());
        const farmMap = zootByFarmMes.get(r.fazenda_id)!;
        if (!farmMap.has(r.mes)) farmMap.set(r.mes, []);
        farmMap.get(r.mes)!.push({ categoria_codigo: r.categoria_codigo, saldo_final: r.saldo_final, peso_medio_final: r.peso_medio_final });
      });

      // Store in state for computeLiveRowsForFarm
      setPesosPastosPorFazenda({}); // Clear old state
      // Store zoot data in a ref-like state
      setZootData(zootByFarmMes);
    } catch (err) {
      console.error('Erro ao carregar dados globais de valor do rebanho:', err);
    } finally {
      setLoading(false);
    }
  }, [fazendaIds.join(','), anoFiltro, anoMes, categorias]);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  // ---------------------------------------------------------------------------
  // Filtro: fazendas com presença real de rebanho no período
  // Fazenda sem rebanho histórico no mês não entra no consolidado.
  // ---------------------------------------------------------------------------
  const getFazendasComRebanho = useCallback((mes: string): string[] => {
    const [keyAno, keyMes] = mes.split('-').map(Number);
    return fazendaIds.filter(fid => {
      // Tem snapshot (header ou items) para esse mês?
      if (snapshotHeaders[fid]?.[mes]) return true;
      if (snapshotItems[fid]?.[mes]?.length > 0) return true;
      // Tem dados zootécnicos (saldo real) para esse mês?
      const farmZoot = zootData.get(fid)?.get(keyMes);
      if (farmZoot && farmZoot.some(r => r.saldo_final > 0)) return true;
      // Tem preços lançados para esse mês?
      if (precosAllFarms[fid]?.[mes] && Object.keys(precosAllFarms[fid][mes]).length > 0) return true;
      return false;
    });
  }, [fazendaIds, snapshotHeaders, snapshotItems, zootData, precosAllFarms]);

  // Determine global fonteMes for a given anoMes
  const getGlobalFonteMes = useCallback((mes: string): GlobalFonteMes => {
    const fazendasAtivas = getFazendasComRebanho(mes);
    if (fazendasAtivas.length === 0) return 'live';

    let fechadas = 0;
    let comDetalhes = 0;

    fazendasAtivas.forEach(fid => {
      const header = snapshotHeaders[fid]?.[mes];
      if (header) {
        fechadas++;
        const items = snapshotItems[fid]?.[mes];
        if (items && items.length > 0) comDetalhes++;
      }
    });

    if (fechadas === 0) return 'live';
    if (fechadas === fazendasAtivas.length && comDetalhes === fazendasAtivas.length) return 'snapshot';
    if (fechadas === fazendasAtivas.length && comDetalhes < fazendasAtivas.length) return 'snapshot_incompleto';
    return 'misto'; // Some farms closed, some open
  }, [getFazendasComRebanho, snapshotHeaders, snapshotItems]);

  // Compute live rows for a farm for a given month — FONTE OFICIAL: zootData
  const computeLiveRowsForFarm = useCallback((
    fid: string,
    ano: number,
    mes: number,
  ): SnapshotDetalheCategoria[] => {
    const farmZoot = zootData.get(fid)?.get(mes) || [];
    const precosMap = precosAllFarms[fid]?.[`${ano}-${String(mes).padStart(2, '0')}`] || {};

    // Build saldo and peso maps from official view
    const saldoMap = new Map<string, number>();
    const pesoMap = new Map<string, number>();
    farmZoot.forEach(r => {
      saldoMap.set(r.categoria_codigo, (saldoMap.get(r.categoria_codigo) || 0) + r.saldo_final);
      if (r.peso_medio_final != null && r.saldo_final > 0) {
        pesoMap.set(r.categoria_codigo, r.peso_medio_final);
      }
    });

    return ORDEM_CATEGORIAS_FIXA.map(codigo => {
      const qty = saldoMap.get(codigo) || 0;
      const peso = pesoMap.get(codigo) || 0;
      const precoKg = precosMap[codigo] || 0;
      const valorTotal = qty * peso * precoKg;
      return {
        categoria: codigo,
        quantidade: qty,
        peso_medio_kg: peso,
        preco_kg: precoKg,
        valor_total_categoria: valorTotal,
      };
    });
  }, [zootData, precosAllFarms]);

  // Aggregate rows for a given month
  const getAggregatedRowsForMonth = useCallback((mes: string, ano: number, mesNum: number): GlobalCategoriaRow[] => {
    const fonte = getGlobalFonteMes(mes);
    const allItems: SnapshotDetalheCategoria[] = [];

    fazendaIds.forEach(fid => {
      const hasSnapshot = snapshotItems[fid]?.[mes]?.length > 0;

      if (fonte === 'snapshot' && hasSnapshot) {
        allItems.push(...snapshotItems[fid][mes]);
      } else if (fonte === 'live' || fonte === 'misto') {
        if (hasSnapshot) {
          allItems.push(...snapshotItems[fid][mes]);
        } else {
          allItems.push(...computeLiveRowsForFarm(fid, ano, mesNum));
        }
      }
      // snapshot_incompleto: don't push anything
    });

    if (fonte === 'snapshot_incompleto') return [];
    return aggregateSnapshotItems(allItems, categorias);
  }, [fazendaIds, snapshotItems, getGlobalFonteMes, computeLiveRowsForFarm, categorias]);

  // Current month data
  const fonteMes = useMemo(() => getGlobalFonteMes(anoMes), [getGlobalFonteMes, anoMes]);
  const rows = useMemo(() => getAggregatedRowsForMonth(anoMes, anoNum, mesNum), [getAggregatedRowsForMonth, anoMes, anoNum, mesNum]);
  const metricas = useMemo(() => fonteMes === 'snapshot_incompleto' ? buildMetrics(null, null, null) : metricsFromRows(rows), [rows, fonteMes]);

  // Previous month
  const mesAnteriorKey = mesNum > 1 ? String(mesNum - 1).padStart(2, '0') : '12';
  const anoMesAnterior = mesNum > 1 ? `${anoFiltro}-${mesAnteriorKey}` : `${Number(anoFiltro) - 1}-12`;
  const metricasMesAnterior = useMemo(() => {
    const fonte = getGlobalFonteMes(anoMesAnterior);
    if (fonte === 'snapshot_incompleto') return null;
    const prevRows = getAggregatedRowsForMonth(anoMesAnterior, mesNum > 1 ? anoNum : anoNum - 1, mesNum > 1 ? mesNum - 1 : 12);
    return metricsFromRows(prevRows);
  }, [getGlobalFonteMes, getAggregatedRowsForMonth, anoMesAnterior, anoNum, mesNum]);

  // Início do ano = valor final de Dez do ano anterior
  const anoMesDezAnterior = `${Number(anoFiltro) - 1}-12`;
  const metricasInicioAno = useMemo(() => {
    const fonte = getGlobalFonteMes(anoMesDezAnterior);
    if (fonte === 'snapshot_incompleto') return null;
    const dezRows = getAggregatedRowsForMonth(anoMesDezAnterior, Number(anoFiltro) - 1, 12);
    return metricsFromRows(dezRows);
  }, [getGlobalFonteMes, getAggregatedRowsForMonth, anoMesDezAnterior, anoFiltro]);

  // Historico for month bar + charts
  const historicoPorMes = useMemo(() => {
    const map: Record<string, HistoricoMesGlobal> = {};
    // Include Dec(ano-1) for chart "I" point
    const allKeys = [
      `${Number(anoFiltro) - 1}-12`,
      ...Array.from({ length: 12 }, (_, i) => `${anoFiltro}-${String(i + 1).padStart(2, '0')}`),
    ];
    for (const key of allKeys) {
      let totalValor = 0;
      let totalPeso = 0;
      let todasFechadas = true;

      fazendaIds.forEach(fid => {
        const header = snapshotHeaders[fid]?.[key];
        if (header) {
          totalValor += header.valor;
          totalPeso += header.pesoKg;
        } else {
          todasFechadas = false;
        }
      });

      if (todasFechadas && fazendaIds.length > 0) {
        map[key] = { valor: totalValor, pesoKg: totalPeso };
      }
    }
    return map;
  }, [anoFiltro, fazendaIds, snapshotHeaders]);

  // Historico detalhado for snapshot rows
  const historicoDetalhado = useMemo(() => {
    const map: Record<string, SnapshotDetalheCategoria[]> = {};
    for (let m = 1; m <= 12; m++) {
      const key = `${anoFiltro}-${String(m).padStart(2, '0')}`;
      const fonte = getGlobalFonteMes(key);
      if (fonte === 'snapshot') {
        const allItems: SnapshotDetalheCategoria[] = [];
        fazendaIds.forEach(fid => {
          const items = snapshotItems[fid]?.[key];
          if (items) allItems.push(...items);
        });
        if (allItems.length > 0) map[key] = allItems;
      }
    }
    return map;
  }, [anoFiltro, fazendaIds, snapshotItems, getGlobalFonteMes]);

  // Count fazendas fechadas for selected month
  const fazendasFechadas = useMemo(() => {
    return fazendaIds.filter(fid => snapshotHeaders[fid]?.[anoMes]).length;
  }, [fazendaIds, snapshotHeaders, anoMes]);

  return {
    rows,
    metricas,
    metricasMesAnterior,
    metricasInicioAno,
    fonteMes,
    historicoPorMes,
    historicoDetalhado,
    loading,
    fazendasFechadas,
    fazendasTotal: fazendaIds.length,
  };
}
