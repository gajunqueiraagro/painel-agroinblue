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
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
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
import { usePastos } from '@/hooks/usePastos';

// ---------------------------------------------------------------------------
// Tipos internos — dados consolidados de fechamento oficial
// ---------------------------------------------------------------------------
interface FechamentoConsolidado {
  ano_mes: string;
  fazenda_id: string;
  categoria_id: string;
  qtd: number;
  peso_total: number;
  peso_medio: number | null;
}

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
    const fazendaCmp = (a.fazenda_id ?? '').localeCompare(b.fazenda_id ?? '');
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

/**
 * Synthesize ZootMensal rows from category-level data.
 * Used in Global mode where useZootMensal cannot work (no single fazenda_id).
 */
function buildFazendaRowsFromCategories(rows: ZootCategoriaMensal[]): ZootMensal[] {
  const byMesMap = groupByMes(rows);
  const result: ZootMensal[] = [];

  for (const [mes, cats] of Object.entries(byMesMap)) {
    const mesNum = Number(mes);
    const mesKey = String(mesNum).padStart(2, '0');
    const first = cats[0];
    if (!first) continue;

    const cabecasInicio = cats.reduce((s, c) => s + c.saldo_inicial, 0);
    const cabecasFinal = cats.reduce((s, c) => s + c.saldo_final, 0);
    const pesoInicioKg = roundNumber(cats.reduce((s, c) => s + c.peso_total_inicial, 0), 2);
    const pesoTotalFinalKg = roundNumber(cats.reduce((s, c) => s + c.peso_total_final, 0), 2);
    const pesoEntradasKg = roundNumber(cats.reduce((s, c) => s + c.peso_entradas_externas, 0), 2);
    const pesoSaidasKg = roundNumber(cats.reduce((s, c) => s + c.peso_saidas_externas, 0), 2);
    const entradas = cats.reduce((s, c) => s + c.entradas_externas, 0);
    const saidas = cats.reduce((s, c) => s + c.saidas_externas, 0);
    const producaoBio = roundNumber(cats.reduce((s, c) => s + c.producao_biologica, 0), 2);
    const diasMes = first.dias_mes;
    const cabMedias = (cabecasInicio + cabecasFinal) / 2;
    const pesoMedioFinalKg = cabecasFinal !== 0 ? roundNumber(pesoTotalFinalKg / cabecasFinal, 2) : null;
    const gmdKgCabDia = cabMedias !== 0 && diasMes > 0
      ? roundNumber(producaoBio / cabMedias / diasMes, 4) : null;
    const uaMedia = pesoMedioFinalKg !== null
      ? roundNumber((cabMedias * pesoMedioFinalKg) / 450, 2) : null;

    const fonte = cats.some(c => c.fonte_oficial_mes === 'fechamento') ? 'fechamento'
      : cats.some(c => c.fonte_oficial_mes === 'fallback_movimentacao') ? 'fallback_movimentacao'
      : 'projecao';

    result.push({
      fazenda_id: first.fazenda_id,
      cliente_id: first.cliente_id,
      ano: first.ano,
      mes: mesNum,
      cenario: first.cenario as 'realizado' | 'meta',
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
      gmd_numerador_kg: cabMedias !== 0 ? producaoBio : null,
      ua_media: uaMedia,
      area_produtiva_ha: 0,
      lotacao_ua_ha: null,
      fonte_oficial_mes: fonte as any,
    });
  }

  return result.sort((a, b) => a.mes - b.mes);
}

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------

interface UseRebanhoOficialParams {
  ano: number;
  cenario: 'realizado' | 'meta';
  global?: boolean;
}

export function useRebanhoOficial({ ano, cenario, global }: UseRebanhoOficialParams) {
  const { fazendaAtual, isGlobal: isGlobalContext } = useFazenda();
  const { clienteAtual } = useCliente();
  const resolvedGlobal = global ?? isGlobalContext;
  const fazendaId = fazendaAtual?.id === '__global__' ? undefined : fazendaAtual?.id;
  const clienteId = clienteAtual?.id;
  const { rows: metaGmdRows } = useMetaGmd(String(ano));
  const { pastos } = usePastos();

  const {
    data: categoriasData,
    isLoading: loadingCategorias,
    error: errorCategorias,
  } = useZootCategoriaMensal({ ano, cenario, global: resolvedGlobal });

  // ── Fechamento oficial: dados consolidados por categoria para meses fechados ──
  // Busca itens via join direto (evita .in() com centenas de IDs que estoura URL do PostgREST)
  const {
    data: fechamentoOverlay,
    isLoading: loadingFechamento,
  } = useQuery({
    queryKey: ['fechamento-overlay', resolvedGlobal ? `global-${clienteId}` : fazendaId, ano],
    queryFn: async (): Promise<FechamentoConsolidado[]> => {
      if (!resolvedGlobal && !fazendaId) return [];
      if (resolvedGlobal && !clienteId) return [];

      // Query única: itens com join no fechamento_pastos (evita .in() massivo)
      let query = supabase
        .from('fechamento_pasto_itens')
        .select('categoria_id, quantidade, peso_medio_kg, fechamento_pastos!inner(ano_mes, status, fazenda_id, cliente_id)')
        .eq('fechamento_pastos.status', 'fechado')
        .gte('fechamento_pastos.ano_mes', `${ano - 1}-12`)
        .lte('fechamento_pastos.ano_mes', `${ano}-12`);

      if (resolvedGlobal) {
        query = query.eq('fechamento_pastos.cliente_id', clienteId);
      } else {
        query = query.eq('fechamento_pastos.fazenda_id', fazendaId);
      }

      const { data: itens, error: itensError } = await query;
      if (itensError || !itens?.length) return [];

      // Consolidar por fazenda_id + ano_mes + categoria_id
      const agg = new Map<string, { qtd: number; pesoTotal: number }>();
      for (const item of itens) {
        const fp = item.fechamento_pastos as any;
        const fpObj = Array.isArray(fp) ? fp[0] : fp;
        const anoMes: string = fpObj?.ano_mes;
        const fazId: string = fpObj?.fazenda_id;
        if (!anoMes || !fazId) continue;
        const key = `${anoMes}|${fazId}|${item.categoria_id}`;
        const cur = agg.get(key) || { qtd: 0, pesoTotal: 0 };
        cur.qtd += item.quantidade;
        cur.pesoTotal += item.quantidade * (item.peso_medio_kg ?? 0);
        agg.set(key, cur);
      }

      const result: FechamentoConsolidado[] = [];
      for (const [key, val] of agg) {
        const [anoMes, fazId, categoriaId] = key.split('|');
        result.push({
          ano_mes: anoMes,
          fazenda_id: fazId,
          categoria_id: categoriaId,
          qtd: val.qtd,
          peso_total: val.pesoTotal,
          peso_medio: val.qtd > 0 ? val.pesoTotal / val.qtd : null,
        });
      }
      return result;
    },
    enabled: cenario === 'realizado' && (resolvedGlobal ? !!clienteId : !!fazendaId),
    staleTime: 30_000,
    gcTime: 60_000,
    // Mantém overlay anterior visível enquanto nova query resolve — sem piscar.
    placeholderData: keepPreviousData,
  });

  // useZootMensal only works for single-fazenda (NOT global).
  const {
    data: fazendaData,
    isLoading: loadingFazenda,
    error: errorFazenda,
  } = useZootMensal({ ano, cenario });

  const loading = loadingCategorias || loadingFechamento || (resolvedGlobal ? false : loadingFazenda);
  const error = errorCategorias || (resolvedGlobal ? null : errorFazenda);

  // ── Raw data with fechamento overlay ──
  const baseCategorias = categoriasData ?? [];

  // Build overlay lookup: Map<"YYYY-MM|fazenda_id|categoria_id", FechamentoConsolidado>
  const overlayMap = useMemo(() => {
    const m = new Map<string, FechamentoConsolidado>();
    for (const fc of (fechamentoOverlay ?? [])) {
      m.set(`${fc.ano_mes}|${fc.fazenda_id}|${fc.categoria_id}`, fc);
    }
    return m;
  }, [fechamentoOverlay]);

  // Set of fazenda+month combos that have fechamento data
  const mesesFechados = useMemo(() => {
    const s = new Set<string>();
    for (const fc of (fechamentoOverlay ?? [])) {
      s.add(`${fc.ano_mes}|${fc.fazenda_id}`);
    }
    return s;
  }, [fechamentoOverlay]);


  const rawCategorias = useMemo(() => {
    let rows = baseCategorias;
    if (cenario !== 'meta') {
      // noop — use baseCategorias as-is before fechamento replacement
    } else {
      rows = normalizeMetaCategorias(baseCategorias, metaGmdRows);
    }

    // ── REGRA ABSOLUTA: mês fechado = fonte exclusiva do fechamento de pastos ──
    // Substitui saldo_final, peso_total_final, peso_medio_final, producao_biologica, gmd
    // Categoria ausente no fechamento → zerada (saldo=0, peso=0)
    // ENCADEAMENTO: peso_total_final oficial do mês N → peso_total_inicial do mês N+1
    if (cenario === 'realizado' && mesesFechados.size > 0) {
      // Agrupar por categoria para processamento sequencial
      const byCat = new Map<string, { indices: number[]; rows: ZootCategoriaMensal[] }>();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const key = `${row.fazenda_id}|${row.categoria_id}`;
        if (!byCat.has(key)) byCat.set(key, { indices: [], rows: [] });
        const entry = byCat.get(key)!;
        entry.indices.push(i);
        entry.rows.push(row);
      }

      const result = [...rows];

      for (const [catKey, { indices, rows: catRows }] of byCat.entries()) {
        // Ordenar por mês para garantir sequência
        const sorted = catRows.map((r, idx) => ({ row: r, origIdx: indices[idx] }))
          .sort((a, b) => {
            if (a.row.ano !== b.row.ano) return a.row.ano - b.row.ano;
            return a.row.mes - b.row.mes;
          });

        // Seed: peso oficial de dez do ano anterior para esta categoria+fazenda
        const [seedFazId, seedCatId] = catKey.split('|');
        const seedKey = `${ano - 1}-12|${seedFazId}|${seedCatId}`;
        const seedFc = overlayMap.get(seedKey);
        let prevPesoTotalFinalOficial: number | null =
          seedFc ? (seedFc.peso_total ?? null) : null;

        for (const { row, origIdx } of sorted) {
          const anoMes = `${row.ano}-${String(row.mes).padStart(2, '0')}`;
          const isMesFechado = mesesFechados.has(`${anoMes}|${row.fazenda_id}`);

          // Propagar peso_total_final oficial do mês anterior como peso_total_inicial
          let pesoTotalInicialCorrigido = row.peso_total_inicial;
          if (prevPesoTotalFinalOficial !== null) {
            pesoTotalInicialCorrigido = prevPesoTotalFinalOficial;
          }

          if (!isMesFechado) {
            // Mês aberto: apenas propagar peso_total_inicial se houve fechamento anterior
            if (prevPesoTotalFinalOficial !== null) {
              const producaoBioCorrigida = roundNumber(
                row.peso_total_final
                - pesoTotalInicialCorrigido
                - row.peso_entradas_externas
                + row.peso_saidas_externas
                - row.peso_evol_cat_entrada
                + row.peso_evol_cat_saida,
                2,
              );
              const cabMedias = (row.saldo_inicial + row.saldo_final) / 2;
              const gmdCorrigido = cabMedias > 0 && row.dias_mes > 0
                ? roundNumber(producaoBioCorrigida / cabMedias / row.dias_mes, 4)
                : null;

              result[origIdx] = {
                ...row,
                peso_total_inicial: pesoTotalInicialCorrigido,
                peso_medio_inicial: row.saldo_inicial > 0
                  ? roundNumber(pesoTotalInicialCorrigido / row.saldo_inicial, 2)
                  : null,
                producao_biologica: producaoBioCorrigida,
                gmd: gmdCorrigido,
              };
            }
            // Para meses abertos, não atualizar prevPesoTotalFinalOficial
            // (a cadeia oficial para ao encontrar mês aberto)
            prevPesoTotalFinalOficial = null;
            continue;
          }

          // Mês fechado: buscar dados oficiais do fechamento
          const fc = overlayMap.get(`${anoMes}|${row.fazenda_id}|${row.categoria_id}`);

          // Categoria ausente no fechamento → zero oficial
          const saldoFinalOficial = fc?.qtd ?? 0;
          const pesoTotalFinalOficial = fc?.peso_total ?? 0;
          const pesoMedioFinalOficial = saldoFinalOficial > 0
            ? roundNumber(pesoTotalFinalOficial / saldoFinalOficial, 2)
            : null;

          // Recalcular produção biológica com peso oficial + peso inicial corrigido
          const producaoBiologicaOficial = roundNumber(
            pesoTotalFinalOficial
            - pesoTotalInicialCorrigido
            - row.peso_entradas_externas
            + row.peso_saidas_externas
            - row.peso_evol_cat_entrada
            + row.peso_evol_cat_saida,
            2,
          );

          // GMD oficial recalculado
          const cabecasMedias = (row.saldo_inicial + saldoFinalOficial) / 2;
          const gmdOficial = cabecasMedias > 0 && row.dias_mes > 0
            ? roundNumber(producaoBiologicaOficial / cabecasMedias / row.dias_mes, 4)
            : null;

          result[origIdx] = {
            ...row,
            saldo_final: saldoFinalOficial,
            peso_total_inicial: pesoTotalInicialCorrigido,
            peso_medio_inicial: row.saldo_inicial > 0
              ? roundNumber(pesoTotalInicialCorrigido / row.saldo_inicial, 2)
              : null,
            peso_total_final: pesoTotalFinalOficial,
            peso_medio_final: pesoMedioFinalOficial,
            producao_biologica: producaoBiologicaOficial,
            gmd: gmdOficial,
            fonte_oficial_mes: 'fechamento' as const,
          };

          // Propagar para o mês seguinte
          prevPesoTotalFinalOficial = pesoTotalFinalOficial;
        }
      }

      rows = result;
    }

    return rows;
  }, [baseCategorias, cenario, resolvedGlobal, metaGmdRows, overlayMap, mesesFechados]);

  const baseFazenda = fazendaData ?? [];

  // ── rawFazenda: SEMPRE recalculado a partir de rawCategorias para meses fechados ──
  const rawFazenda = useMemo(() => {
    if (resolvedGlobal) {
      const rows = buildFazendaRowsFromCategories(rawCategorias);
      // Area produtiva Global: soma apenas das fazendas presentes em categoriasData
      // (saldo_final > 0 em pelo menos um mês do período). Fazendas com pastos
      // cadastrados mas sem rebanho no período NÃO entram no denominador da lotação.
      const fazendasComRebanho = new Set<string>();
      for (const c of baseCategorias) {
        if (c.saldo_final > 0 && c.fazenda_id) fazendasComRebanho.add(c.fazenda_id);
      }
      const areaTotal = pastos
        .filter(p => fazendasComRebanho.has(p.fazenda_id))
        .reduce((sum, p) => sum + (p.area_produtiva_ha ?? 0), 0);
      return rows.map(r => ({
        ...r,
        area_produtiva_ha: areaTotal,
        lotacao_ua_ha: areaTotal > 0 && r.ua_media !== null
          ? roundNumber(r.ua_media / areaTotal, 2)
          : null,
      }));
    }

    if (cenario === 'meta') {
      return buildMetaFazendaRows(rawCategorias, baseFazenda);
    }

    // Realizado: se há meses fechados, reconstruir rawFazenda inteiramente
    // a partir de rawCategorias (já corrigido com dados oficiais)
    if (mesesFechados.size > 0) {
      // Build from rawCategorias for closed months, keep baseFazenda for open months
      const fromCats = buildFazendaRowsFromCategories(rawCategorias);
      const catByMes = new Map<string, ZootMensal>();
      for (const r of fromCats) catByMes.set(r.mes_key, r);

      const baseByMesMap = indexByMes(baseFazenda);

      // Merge: closed months from categories, open months from base
      const allMeses = new Set<string>();
      for (const r of baseFazenda) allMeses.add(r.mes_key);
      for (const r of fromCats) allMeses.add(r.mes_key);

      const result: ZootMensal[] = [];
      for (const mesKey of Array.from(allMeses).sort()) {
        const anoMes = `${ano}-${mesKey}`;
        const fazendaIdLocal = resolvedGlobal ? undefined : fazendaId;
        const mesesFechadoKey = fazendaIdLocal ? `${anoMes}|${fazendaIdLocal}` : anoMes;
        if (mesesFechados.has(mesesFechadoKey) || (resolvedGlobal && Array.from(mesesFechados).some(k => k.startsWith(anoMes + '|')))) {
          // Mês fechado: usar dados recalculados a partir de rawCategorias
          const catRow = catByMes.get(mesKey);
          if (catRow) {
            // Preserve area_produtiva from base
            const baseRow = baseByMesMap[mesKey];
            result.push({
              ...catRow,
              area_produtiva_ha: baseRow?.area_produtiva_ha ?? catRow.area_produtiva_ha,
              lotacao_ua_ha: baseRow?.area_produtiva_ha && catRow.ua_media
                ? roundNumber(catRow.ua_media / baseRow.area_produtiva_ha, 2)
                : catRow.lotacao_ua_ha,
            });
          }
        } else {
          // Mês aberto: usar view diretamente
          const baseRow = baseByMesMap[mesKey];
          if (baseRow) result.push(baseRow);
        }
      }
      return result;
    }

    return baseFazenda;
  }, [baseFazenda, cenario, resolvedGlobal, rawCategorias, baseCategorias, mesesFechados, ano, pastos]);

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
