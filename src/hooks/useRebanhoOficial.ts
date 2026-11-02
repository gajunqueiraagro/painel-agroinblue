/**
 * useRebanhoOficial — Camada Única de Leitura do Rebanho
 *
 * REGRA ABSOLUTA: toda informação de rebanho (saldos, pesos, arrobas, GMD)
 * DEVE ser consumida exclusivamente por este hook.
 *
 * Fontes oficiais:
 *   - zoot_mensal_cache (detalhamento por categoria — Global e uma fazenda, REBANHO-LEITURA-01 D1)
 *   - a linha do mês (totais da fazenda / do Global) é MONTADA das categorias (`buildFazendaRowsFromCategories`)
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
import { fetchAllPaginated, MAX_ROWS } from '@/lib/supabase/fetchAllPaginated';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import {
  useZootCategoriaMensal,
  groupByMes,
  groupByCategoria,
  totalizarPorMes,
  categoriasUnicas,
  ERRO_LEITURA_REBANHO,
  type ZootCategoriaMensal,
} from '@/hooks/useZootCategoriaMensal';
import { indexByMes, type ZootMensal } from '@/hooks/useZootMensal';
import { useMetaGmd } from '@/hooks/useMetaGmd';
import { usePastos } from '@/hooks/usePastos';
import { areaDosPastosNoMes } from '@/lib/pastos/areaDoMes';
import {
  aplicarOverlayFechamento,
  roundNumber,
  type FechamentoConsolidado,
} from '@/lib/painelConsultor/rebanho/overlayFechamento';

// ---------------------------------------------------------------------------
// Tipos internos — dados consolidados de fechamento oficial
// ---------------------------------------------------------------------------
/* `FechamentoConsolidado` e `roundNumber` mudaram para a lib do overlay
   junto com a regra — importados abaixo, nao redeclarados aqui. */

// ---------------------------------------------------------------------------
// Re-exports — consumers DEVEM importar daqui, nunca dos hooks internos
// ---------------------------------------------------------------------------
export { type ZootCategoriaMensal, groupByMes, groupByCategoria, totalizarPorMes, categoriasUnicas, ERRO_LEITURA_REBANHO };
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

/**
 * Synthesize ZootMensal rows from category-level data.
 * Global e uma fazenda (REBANHO-LEITURA-01 D1: a view `vw_zoot_fazenda_mensal` saiu do hook).
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

    const totalCats = cats.length;
    const fechadas = cats.filter(c => c.fonte_oficial_mes === 'fechamento').length;
    const fonte = fechadas === totalCats ? 'fechamento'
      : fechadas > 0 ? 'parcial'
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
  enabled?: boolean;
}

export function useRebanhoOficial({ ano, cenario, global, enabled = true }: UseRebanhoOficialParams) {
  const { fazendaAtual, isGlobal: isGlobalContext } = useFazenda();
  const { clienteAtual } = useCliente();
  const resolvedGlobal = global ?? isGlobalContext;
  const fazendaId = fazendaAtual?.id === '__global__' ? undefined : fazendaAtual?.id;
  const clienteId = clienteAtual?.id;
  const { rows: metaGmdRows } = useMetaGmd(String(ano), enabled);
  const { pastos } = usePastos({ enabled });

  const {
    data: categoriasData,
    isLoading: loadingCategorias,
    error: errorCategorias,
    refetch: refetchCategorias,
  } = useZootCategoriaMensal({ ano, cenario, global: resolvedGlobal, enabled });

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

      // Query única: itens com join no fechamento_pastos (evita .in() massivo).
      // Paginada: sem .range() o PostgREST corta em 1.000 linhas sem erro, e a
      // janela é de 13 meses x todo o cliente. `id` entra no select apenas para
      // dar ordem total à paginação e detectar chave repetida — não é consumido.
      // Factory: o builder do supabase-js é mutável, cada página remonta a query.
      const { data: itens } = await fetchAllPaginated<{
        id: string;
        categoria_id: string;
        quantidade: number;
        peso_medio_kg: number | null;
        fechamento_pastos: unknown;
      }>({
        query: () => {
          let q = supabase
            .from('fechamento_pasto_itens')
            .select('id, categoria_id, quantidade, peso_medio_kg, fechamento_pastos!inner(ano_mes, status, fazenda_id, cliente_id)')
            .eq('fechamento_pastos.status', 'fechado')
            .gte('fechamento_pastos.ano_mes', `${ano - 1}-12`)
            .lte('fechamento_pastos.ano_mes', `${ano}-12`);

          if (resolvedGlobal) {
            q = q.eq('fechamento_pastos.cliente_id', clienteId);
          } else {
            q = q.eq('fechamento_pastos.fazenda_id', fazendaId);
          }

          return q.order('id', { ascending: true });
        },
        getKey: (r) => r.id,
        maxRows: MAX_ROWS,
        context: 'useRebanhoOficial/fechamento-overlay',
      });
      if (!itens.length) return [];

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
    enabled: enabled && cenario === 'realizado' && (resolvedGlobal ? !!clienteId : !!fazendaId),
    staleTime: 30_000,
    gcTime: 60_000,
    // Mantém overlay anterior visível enquanto nova query resolve — sem piscar.
    placeholderData: keepPreviousData,
  });

  /* REBANHO-LEITURA-01 D1 (Gabriel 01/11/2026) — a view `vw_zoot_fazenda_mensal` (o `useZootMensal`) SAIU: numa fazenda ela estourava
     o tempo do papel `authenticated` (8,1 s, 57014) para todo cliente, e todo número da linha do mês saía "—". A linha do mês agora é
     montada das categorias, a mesma regra do Global (abaixo, `rawFazenda`). */
  const loading = loadingCategorias || loadingFechamento;
  const error = errorCategorias;

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

    /* A regra vive em lib/painelConsultor/rebanho/overlayFechamento.ts desde
       o PR-34. Este hook deixou de ser DONO dela e virou consumidor: o
       historico multi-ano precisa do mesmo numero e nao tinha como pedir a um
       useMemo de um ano so. Nao ha segunda implementacao — a que existia
       estava encapsulada aqui. */
    return aplicarOverlayFechamento(rows, overlayMap, mesesFechados, ano, cenario);
  }, [baseCategorias, cenario, resolvedGlobal, metaGmdRows, overlayMap, mesesFechados, ano]);

  // ── rawFazenda: a linha do mês, SEMPRE montada de rawCategorias (Global e uma fazenda, realizado e meta) ──
  const rawFazenda = useMemo(() => {
    const rows = buildFazendaRowsFromCategories(rawCategorias);
    /* A área do mês (SM-ARRENDAMENTO-ENCERRAR-01, Gabriel 30/10/2026): os pastos ativos e vigentes naquele mês (`areaDosPastosNoMes`).
       - Global: só das fazendas presentes nas categorias (saldo_final > 0 em algum mês do período) — fazenda com pasto e sem rebanho
         não entra no denominador da lotação.
       - Uma fazenda (REBANHO-LEITURA-01 D1): os pastos DELA, a mesma soma que a view fazia (`entra_conciliacao` + vigência; nenhum
         pasto do proto está fora da conciliação). Prova de 01/11 em todos os meses de todas as fazendas, realizado e meta: área 0
         diferença; lotação 0 diferença fora da Bom Retiro (onde a view dobrava o rebanho, fev–jun/23). */
    let pastosDaArea = pastos;
    if (resolvedGlobal) {
      const fazendasComRebanho = new Set<string>();
      for (const c of baseCategorias) {
        if (c.saldo_final > 0 && c.fazenda_id) fazendasComRebanho.add(c.fazenda_id);
      }
      pastosDaArea = pastos.filter(p => fazendasComRebanho.has(p.fazenda_id));
    } else if (fazendaId) {
      pastosDaArea = pastos.filter(p => p.fazenda_id === fazendaId);
    }
    return rows.map(r => {
      const areaDoMes = areaDosPastosNoMes(pastosDaArea, r.ano_mes);
      return {
        ...r,
        area_produtiva_ha: areaDoMes,
        lotacao_ua_ha: areaDoMes > 0 && r.ua_media !== null
          ? roundNumber(r.ua_media / areaDoMes, 2)
          : null,
      };
    });
  }, [resolvedGlobal, fazendaId, rawCategorias, baseCategorias, pastos]);

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
    /** D4 (REBANHO-LEITURA-01) — o "Tentar de novo" da tela: relê as categorias (o erro nunca vira lista vazia). */
    tentarDeNovo: refetchCategorias,

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
