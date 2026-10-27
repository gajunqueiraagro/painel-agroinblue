/**
 * Hook: usePlanejamentoFinanceiro
 *
 * Simplified: load, save (bulk upsert), import realizado anterior, saldo inicial, dividendos.
 */
import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FONTE_POR_PARTE } from '@/lib/financeiro/partesDaClassificacao';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFinanceiro, type FinanceiroLancamento } from '@/hooks/useFinanceiro';
import { gridMetaConsolidado, lerMetaLinhas, mapasDaMeta, type MetaLinha } from '@/lib/financeiro/metaLinhas';

export interface PlanejamentoFinanceiroRow {
  id: string;
  cliente_id: string;
  fazenda_id: string;
  ano: number;
  mes: number;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string;
  subcentro: string | null;
  escopo_negocio: string | null;
  tipo_custo: 'fixo' | 'variavel';
  driver: string | null;
  unidade_driver: string | null;
  valor_base: number;
  quantidade_driver: number;
  valor_planejado: number;
  origem: 'manual' | 'replicado' | 'calculado' | 'importado_realizado' | 'rebanho_auto';
  cenario: string;
  observacao: string | null;
  plano_conta_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Plano de contas row (global, client_id = null) */
export interface PlanoContasRow {
  id: string;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string;
  subcentro: string | null;
  escopo_negocio: string | null;
  ordem_exibicao: number;
}

/** In-memory grid value per subcentro key */
export interface SubcentroGrid {
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string;
  subcentro: string;
  escopo_negocio: string | null;
  ordem_exibicao: number;
  meses: number[]; // [0..11] = Jan..Dez
}

const isValidFazenda = (id?: string) => !!id && id !== '__global__';

/** `comCompetencia`: lê também a meta em regime de COMPETÊNCIA (P109 — as linhas de DRE do PC-100); o padrão é só o caixa. */
export function usePlanejamentoFinanceiro(ano: number, fazendaId?: string, enabled = true, comCompetencia = false) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const qc = useQueryClient();

  const [loading, setLoading] = useState(false);

  // ── Fase 1.6.A: 4 loaders triviais migrados para TanStack Query ──
  // Mantém API pública intacta — variáveis derivadas com fallback idêntico ao state anterior.
  const planoContasQuery = useQuery<PlanoContasRow[]>({
    queryKey: ['ppf:plano'],
    queryFn: async () => {
      const { data: rows, error } = await (supabase
        .from('financeiro_plano_contas' as any)
        .select('id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ordem_exibicao')
        .eq('ativo', true)
        .not('subcentro', 'is', null)
        .neq('macro_custo', 'Dividendos')
        .order('ordem_exibicao') as any);
      if (error) throw error;
      return ((rows || []) as PlanoContasRow[]);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const planoContas = planoContasQuery.data ?? [];

  const dividendosQuery = useQuery<{ id: string; nome: string }[]>({
    queryKey: ['ppf:dividendos', clienteId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('financeiro_dividendos')
        .select('id, nome')
        .eq('cliente_id', clienteId!)
        .eq('ativo', true)
        .order('ordem_exibicao');
      if (error) throw error;
      return (rows || []).map(r => ({ id: r.id, nome: r.nome }));
    },
    enabled: enabled && !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const dividendos = dividendosQuery.data ?? [];

  const saldoInicialQuery = useQuery<number>({
    queryKey: ['ppf:saldo-inicial', clienteId, fazendaId, ano],
    queryFn: async () => {
      const anoMesAnterior = `${ano - 1}-12`;
      let query = supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('saldo_final')
        .eq('cliente_id', clienteId!)
        .eq('ano_mes', anoMesAnterior);
      if (isValidFazenda(fazendaId)) {
        query = query.eq('fazenda_id', fazendaId!);
      }
      const { data: rows, error } = await query;
      if (error) throw error;
      const total = (rows || []).reduce((s: number, r: any) => s + (r.saldo_final || 0), 0);
      return Math.round(total * 100) / 100;
    },
    enabled: enabled && !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const saldoInicial = saldoInicialQuery.data ?? 0;

  /* P109 (FIN-META-01) — TODA a meta auto vem do DONO ÚNICO no banco, `fn_meta_linhas(cliente, ano, 'caixa')`: receita e reposição
     do rebanho (pelo recebimento/pagamento), adiantamento de boitel, nutrição/frete/comercial, parcelas de financiamento e consórcio
     (a compra parcelada NÃO é meta) e projetos de investimento — a dedução é só a calculada (nunca um lançamento META gravado no
     financeiro, P120). Aqui só se lê e se põe no subcentro da CONTA DO PLANO; o cálculo do front (nutrição por fazenda, parcelas do
     snapshot, financiamento pela data local) morreu. */
  const metaLinhasQuery = useQuery<MetaLinha[]>({
    queryKey: ['ppf:meta-linhas', clienteId, ano],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any).rpc('fn_meta_linhas', { p_cliente: clienteId, p_ano: ano, p_regime: 'caixa' });
      if (error) throw error;
      return lerMetaLinhas(rows);
    },
    enabled: enabled && !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const mapasMeta = useMemo(() => {
    const subcentroDaConta = new Map<string, string>();
    for (const p of planoContas) if (p.subcentro) subcentroDaConta.set(p.id, p.subcentro);
    const r = mapasDaMeta(metaLinhasQuery.data ?? [], subcentroDaConta, isValidFazenda(fazendaId) ? fazendaId! : null);
    if (r.semConta.length > 0) console.warn('[usePlanejamentoFinanceiro] linhas de meta sem conta no plano carregado', r.semConta);
    return r;
  }, [metaLinhasQuery.data, planoContas, fazendaId]);
  const metaLinhasCompetenciaQuery = useQuery<MetaLinha[]>({
    queryKey: ['ppf:meta-linhas-competencia', clienteId, ano],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any).rpc('fn_meta_linhas', { p_cliente: clienteId, p_ano: ano, p_regime: 'competencia' });
      if (error) throw error;
      return lerMetaLinhas(rows);
    },
    enabled: enabled && comCompetencia && !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const mapasMetaCompetencia = useMemo(() => {
    const subcentroDaConta = new Map<string, string>();
    for (const p of planoContas) if (p.subcentro) subcentroDaConta.set(p.id, p.subcentro);
    return mapasDaMeta(metaLinhasCompetenciaQuery.data ?? [], subcentroDaConta, isValidFazenda(fazendaId) ? fazendaId! : null);
  }, [metaLinhasCompetenciaQuery.data, planoContas, fazendaId]);
  const lancamentosProjetos = mapasMeta.projetos;
  const lancamentosRebanho = mapasMeta.rebanho;
  const lancamentosFinanciamento = mapasMeta.financiamento;
  const lancamentosNutricao = mapasMeta.nutricao;
  const recarregarMeta = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['ppf:meta-linhas'] }),
      qc.invalidateQueries({ queryKey: ['ppf:meta-linhas-competencia'] }),
    ]);
  }, [qc]);

  // ── Fase 1.6.B: loadSaved + loadLancamentosRebanho migrados ──
  const savedDataQuery = useQuery<PlanejamentoFinanceiroRow[]>({
    queryKey: ['ppf:saved', clienteId, fazendaId, ano],
    queryFn: async () => {
      let query = supabase
        .from('planejamento_financeiro' as any)
        .select('*')
        .eq('cliente_id', clienteId!)
        .eq('ano', ano)
        .eq('cenario', 'meta')
        .eq('origem', 'manual')
        .order('centro_custo')
        .order('subcentro')
        .order('mes');
      if (isValidFazenda(fazendaId)) {
        query = query.eq('fazenda_id', fazendaId!);
      }
      const { data: rows, error } = await (query as any);
      if (error) throw error;
      const savedRows = (rows || []) as PlanejamentoFinanceiroRow[];
      console.info(
        `[usePlanejamentoFinanceiro] loadSaved — fazendaId=${fazendaId || 'GLOBAL'}, ano=${ano}, rows=${savedRows.length}`,
        savedRows.length > 0
          ? { firstRow: savedRows[0], fazendasDistintas: new Set(savedRows.map(r => r.fazenda_id)).size }
          : null,
      );
      return savedRows;
    },
    enabled: enabled && !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const savedData = savedDataQuery.data ?? [];

  // Real 2025 — consumido via useFinanceiro (single filtering source).
  // O hook já aplica os filtros de caixa puro: cancelado=false,
  // sem_movimentacao_caixa=false, status_transacao='realizado',
  // cenario='realizado'. Datas via data_pagamento (range Jan→Dez).
  const real2025 = useFinanceiro({ ano: 2025 });
  const lancFin2025: FinanceiroLancamento[] = real2025.lancamentos ?? [];
  const lancFin2025Loading = real2025.loading;

  // ─── Load saved planejamento ──────────────────────────────
  const loadSaved = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);
    try {
      await qc.invalidateQueries({ queryKey: ['ppf:saved', clienteId, fazendaId, ano] });
    } finally {
      setLoading(false);
    }
  }, [qc, clienteId, fazendaId, ano]);

  // ─── Build grid: plano + saved values + dividendos ────────
  const buildGrid = useCallback((): SubcentroGrid[] => {
    const map = new Map<string, SubcentroGrid>();

    // Seed from plano de contas (all subcentros, zeroed)
    for (const p of planoContas) {
      if (!p.subcentro) continue;
      const key = `${p.centro_custo}||${p.subcentro}`;
      if (!map.has(key)) {
        map.set(key, {
          macro_custo: p.macro_custo,
          grupo_custo: p.grupo_custo,
          centro_custo: p.centro_custo,
          subcentro: p.subcentro,
          escopo_negocio: p.escopo_negocio,
          ordem_exibicao: p.ordem_exibicao,
          meses: new Array(12).fill(0),
        });
      }
    }

    // Inject dividendos as subcentros
    for (let i = 0; i < dividendos.length; i++) {
      const d = dividendos[i];
      const subcentro = `Dividendos ${d.nome}`;
      const key = `Dividendos||${subcentro}`;
      if (!map.has(key)) {
        map.set(key, {
          macro_custo: 'Dividendos',
          grupo_custo: 'Dividendos',
          centro_custo: 'Dividendos',
          subcentro,
          escopo_negocio: 'pecuaria',
          ordem_exibicao: 9000 + i,
          meses: new Array(12).fill(0),
        });
      }
    }

    // Index por subcentro para fallback quando centro_custo divergir (ex.: agregação multi-fazenda em Global)
    const keysBySubcentro = new Map<string, string>();
    for (const [key, entry] of map.entries()) {
      if (!keysBySubcentro.has(entry.subcentro)) {
        keysBySubcentro.set(entry.subcentro, key);
      }
    }

    // Overlay saved values — agrega independente de fazenda_id. P109: a chave é a CONTA DO PLANO (`plano_conta_id` → a linha dela);
    // só a linha cuja conta não está no plano carregado cai no texto (centro_custo||subcentro, e o fallback por subcentro).
    const keyDaConta = new Map<string, string>();
    for (const p of planoContas) if (p.subcentro) keyDaConta.set(p.id, `${p.centro_custo}||${p.subcentro}`);
    for (const r of savedData) {
      if (!r.subcentro) continue;
      let key = (r.plano_conta_id ? keyDaConta.get(r.plano_conta_id) : undefined) ?? `${r.centro_custo}||${r.subcentro}`;
      if (!map.has(key)) {
        const fallbackKey = keysBySubcentro.get(r.subcentro);
        if (fallbackKey) {
          key = fallbackKey;
        } else {
          map.set(key, {
            macro_custo: r.macro_custo,
            grupo_custo: r.grupo_custo,
            centro_custo: r.centro_custo,
            subcentro: r.subcentro,
            escopo_negocio: r.escopo_negocio,
            ordem_exibicao: 9999,
            meses: new Array(12).fill(0),
          });
          keysBySubcentro.set(r.subcentro, key);
        }
      }
      const grid = map.get(key)!;
      if (r.mes >= 1 && r.mes <= 12) {
        grid.meses[r.mes - 1] += r.valor_planejado;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.ordem_exibicao - b.ordem_exibicao);
  }, [planoContas, savedData, dividendos]);

  // Grid META já materializado — consumido pelo Bloco 1 e demais blocos
  // que dependem do shape SubcentroGrid[]. Reflete o ano passado ao hook.
  const gridMeta2026 = useMemo(() => buildGrid(), [buildGrid]);

  /* P109 — o grid de meta CONSOLIDADO (auto do banco + digitado, a regra única de juntar). Subcentro com auto fora do plano semeado
     ganha a linha da conta do plano (a mesma da fn_meta_linhas), nunca some. */
  const orfaoDoPlano = useCallback((sub: string, meses: number[]): SubcentroGrid => {
    const p = planoContas.find((c) => c.subcentro === sub);
    return {
      macro_custo: p?.macro_custo ?? null, grupo_custo: p?.grupo_custo ?? null, centro_custo: p?.centro_custo ?? '(Sem centro)',
      subcentro: sub, escopo_negocio: p?.escopo_negocio ?? null, ordem_exibicao: p?.ordem_exibicao ?? 9999, meses: [...meses],
    };
  }, [planoContas]);
  const buildGridConsolidado = useCallback(
    (): SubcentroGrid[] => gridMetaConsolidado(buildGrid(), mapasMeta, orfaoDoPlano),
    [buildGrid, mapasMeta, orfaoDoPlano],
  );
  const gridMetaConsolidado2026 = useMemo(() => buildGridConsolidado(), [buildGridConsolidado]);
  /** O mesmo grid em COMPETÊNCIA (só com `comCompetencia`): o digitado + o auto em competência (sem caixa puro: financiamento,
   *  adiantamento de boitel e projetos não entram — a fn_meta_linhas não os devolve nesse regime). */
  const buildGridConsolidadoCompetencia = useCallback(
    (): SubcentroGrid[] => gridMetaConsolidado(buildGrid(), mapasMetaCompetencia, orfaoDoPlano),
    [buildGrid, mapasMetaCompetencia, orfaoDoPlano],
  );

  // ─── Import realizado from previous year (returns grid, does NOT save) ──
  const importarRealizado = useCallback(async (): Promise<SubcentroGrid[] | null> => {
    if (!isValidFazenda(fazendaId) || !clienteId) return null;
    const anoAnterior = ano - 1;
    try {
      const PAGE_SIZE = 1000;
      let allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data: rows, error } = await ((supabase as any)
          .from(FONTE_POR_PARTE)
          .select('macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ano_mes, valor')
          .eq('fazenda_id', fazendaId!)
          .eq('cancelado', false)
          .eq('status_transacao', 'realizado')
          .gte('ano_mes', `${anoAnterior}-01`)
          .lte('ano_mes', `${anoAnterior}-12`)
          .range(from, from + PAGE_SIZE - 1) as any);
        if (error) throw error;
        if (!rows || rows.length === 0) break;
        allRows = allRows.concat(rows);
        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      if (allRows.length === 0) {
        toast.info(`Nenhum lançamento realizado encontrado em ${anoAnterior}`);
        return null;
      }

      const SUBCENTROS_REBANHO_EXCLUIR = [
        'Abates de Machos', 'Abates de Fêmeas',
        'Venda de Desmama Machos', 'Venda de Desmama Fêmeas',
        'Venda de Machos Adultos', 'Venda de Fêmeas Adultas',
        'Venda em Boitel',
        'Investimento Compra Bovinos Machos', 'Investimento Compra Bovinos Fêmeas',
        'Amortização Financiamento Pecuária', 'Amortização Financiamento Agricultura',
        'Juros de Financiamento Pecuária', 'Juros de Financiamento Agricultura',
      ];

      const map = new Map<string, SubcentroGrid>();
      for (const l of allRows) {
        if (!l.centro_custo || !l.subcentro) continue;
        if (SUBCENTROS_REBANHO_EXCLUIR.includes(l.subcentro)) continue;
        const key = `${l.centro_custo}||${l.subcentro}`;
        if (!map.has(key)) {
          map.set(key, {
            macro_custo: l.macro_custo,
            grupo_custo: l.grupo_custo,
            centro_custo: l.centro_custo,
            subcentro: l.subcentro,
            escopo_negocio: l.escopo_negocio,
            ordem_exibicao: 9999,
            meses: new Array(12).fill(0),
          });
        }
        const m = parseInt((l.ano_mes || '').split('-')[1], 10);
        if (m >= 1 && m <= 12) {
          map.get(key)!.meses[m - 1] += Math.abs(l.valor || 0);
        }
      }

      return Array.from(map.values());
    } catch (e: any) {
      console.error('Erro ao importar realizado:', e);
      toast.error(e.message || 'Erro ao importar');
      return null;
    }
  }, [fazendaId, clienteId, ano]);

  // ─── Save grid to database (bulk upsert) ──────────────────
  const salvarGrid = useCallback(async (grid: SubcentroGrid[]): Promise<boolean> => {
    if (!isValidFazenda(fazendaId) || !clienteId) return false;
    const rows: any[] = [];
    for (const g of grid) {
      for (let m = 0; m < 12; m++) {
        if (g.meses[m] <= 0) continue;
        rows.push({
          cliente_id: clienteId,
          fazenda_id: fazendaId,
          ano,
          mes: m + 1,
          centro_custo: g.centro_custo,
          subcentro: g.subcentro,
          macro_custo: g.macro_custo,
          grupo_custo: g.grupo_custo,
          escopo_negocio: g.escopo_negocio,
          tipo_custo: 'fixo',
          driver: null,
          unidade_driver: null,
          valor_base: Math.round(g.meses[m] * 100) / 100,
          quantidade_driver: 0,
          valor_planejado: Math.round(g.meses[m] * 100) / 100,
          origem: 'manual',
          cenario: 'meta',
          observacao: null,
        });
      }
    }

    try {
      await (supabase
        .from('planejamento_financeiro' as any)
        .delete()
        .eq('fazenda_id', fazendaId!)
        .eq('ano', ano)
        .eq('cenario', 'meta')
        .eq('origem', 'manual') as any);

      if (rows.length > 0) {
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          const { error } = await (supabase
            .from('planejamento_financeiro' as any)
            .upsert(batch, { onConflict: 'fazenda_id,ano,mes,centro_custo,subcentro,cenario' }) as any);
          if (error) throw error;
        }
      }

      toast.success(`Planejamento salvo — ${rows.length} registros`);

      await loadSaved();
      // Snapshot automático: cria versão a cada save bem-sucedido.
      try { await salvarVersao(); } catch (e) { console.error('Erro auto-snapshot:', e); }

      return true;
    } catch (e: any) {
      console.error('Erro ao salvar planejamento:', e);
      toast.error(e.message || 'Erro ao salvar');
      return false;
    }
  }, [fazendaId, clienteId, ano, loadSaved]);

  /** Import realizado (ano-1) for a single subcentro */
  const importarSubcentro = useCallback(async (subcentro: string, centro_custo: string): Promise<number[]> => {
    if (!clienteId || !isValidFazenda(fazendaId)) return new Array(12).fill(0);
    const anoAnterior = ano - 1;
    const meses = new Array(12).fill(0);
    try {
      let allRows: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await ((supabase as any)
          .from(FONTE_POR_PARTE)
          .select('ano_mes, valor')
          .eq('cliente_id', clienteId)
          .eq('fazenda_id', fazendaId)
          .eq('subcentro', subcentro)
          .eq('centro_custo', centro_custo)
          .eq('cancelado', false)
          .eq('status_transacao', 'realizado')
          .like('ano_mes', `${anoAnterior}-%`)
          .range(from, from + PAGE - 1) as any);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      for (const r of allRows) {
        const mesStr = (r as any).ano_mes?.split('-')[1];
        const mesIdx = parseInt(mesStr, 10) - 1;
        if (mesIdx >= 0 && mesIdx < 12) {
          meses[mesIdx] += Math.abs(Number((r as any).valor) || 0);
        }
      }
      for (let i = 0; i < 12; i++) meses[i] = Math.round(meses[i] * 100) / 100;
    } catch (e: any) {
      console.error('Erro ao importar subcentro:', e);
      toast.error('Erro ao importar realizado');
    }
    return meses;
  }, [fazendaId, clienteId, ano]);

  // ─── Autosave: salvar célula individual ──────────────────
  const salvarCelula = useCallback(async (
    subcentro: string,
    centro_custo: string,
    grupo_custo: string,
    macro_custo: string,
    escopo_negocio: string | null,
    mes: number,
    valor: number,
  ) => {
    if (!isValidFazenda(fazendaId) || !clienteId) return;
    try {
      if (valor === 0) {
        await (supabase
          .from('planejamento_financeiro' as any)
          .delete()
          .eq('cliente_id', clienteId)
          .eq('fazenda_id', fazendaId!)
          .eq('ano', ano)
          .eq('mes', mes)
          .eq('subcentro', subcentro)
          .eq('cenario', 'meta')
          .eq('origem', 'manual') as any);
      } else {
        const row = {
          cliente_id: clienteId,
          fazenda_id: fazendaId!,
          ano,
          mes,
          centro_custo,
          subcentro,
          macro_custo,
          grupo_custo,
          escopo_negocio,
          tipo_custo: 'fixo',
          driver: null,
          unidade_driver: null,
          valor_base: Math.round(valor * 100) / 100,
          quantidade_driver: 0,
          valor_planejado: Math.round(valor * 100) / 100,
          origem: 'manual',
          cenario: 'meta',
          observacao: null,
        };
        const { error } = await (supabase
          .from('planejamento_financeiro' as any)
          .upsert(row, { onConflict: 'fazenda_id,ano,mes,centro_custo,subcentro,cenario' }) as any);
        if (error) throw error;
      }
    } catch (e: any) {
      console.error('Erro ao salvar célula:', e);
    }
  }, [fazendaId, clienteId, ano]);

  // ─── Salvar versão (snapshot automático com user/data) ────
  const salvarVersao = useCallback(async () => {
    if (!clienteId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const nome = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      let allRows: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await (supabase
          .from('planejamento_financeiro' as any)
          .select('*')
          .eq('cliente_id', clienteId)
          .eq('ano', ano)
          .eq('cenario', 'meta')
          .eq('origem', 'manual')
          .range(from, from + PAGE - 1) as any);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const { error } = await (supabase
        .from('meta_versoes' as any)
        .insert({
          cliente_id: clienteId,
          ano,
          nome,
          dados: allRows,
          user_id: user?.id ?? null,
          usuario_email: user?.email ?? null,
          fazenda_id: isValidFazenda(fazendaId) ? fazendaId : null,
        }) as any);
      if (error) throw error;
    } catch (e: any) {
      console.error('Erro ao salvar versão:', e);
    }
  }, [clienteId, ano, fazendaId]);

  // ─── Listar versões ───────────────────────────────────────
  const listarVersoes = useCallback(async () => {
    if (!clienteId) return [];
    try {
      const { data, error } = await (supabase
        .from('meta_versoes' as any)
        .select('id, nome, created_at, usuario_email, fazenda_id')
        .eq('cliente_id', clienteId)
        .eq('ano', ano)
        .order('created_at', { ascending: false }) as any);
      if (error) throw error;
      return (data || []) as { id: string; nome: string; created_at: string; usuario_email: string | null; fazenda_id: string | null }[];
    } catch (e: any) {
      console.error('Erro ao listar versões:', e);
      return [];
    }
  }, [clienteId, ano]);

  // ─── Restaurar versão ─────────────────────────────────────
  const restaurarVersao = useCallback(async (versaoId: string) => {
    if (!clienteId) return;
    try {
      const { data: versao, error: fetchErr } = await (supabase
        .from('meta_versoes' as any)
        .select('dados')
        .eq('id', versaoId)
        .single() as any);
      if (fetchErr) throw fetchErr;
      const rows = (versao?.dados || []) as any[];

      // Delete current meta data for this client+ano (só manual — preserva espelhos rebanho_auto)
      await (supabase
        .from('planejamento_financeiro' as any)
        .delete()
        .eq('cliente_id', clienteId)
        .eq('ano', ano)
        .eq('cenario', 'meta')
        .eq('origem', 'manual') as any);

      // Insert snapshot rows in batches
      if (rows.length > 0) {
        // Strip ids so new ones are generated.
        // Defesa Opção A: snapshots antigos podem conter rebanho_auto/parcela_auto;
        // filtramos para garantir que apenas linhas manual sejam reinseridas.
        const clean = rows
          .filter((r: any) => r.origem === 'manual')
          .map(({ id, created_at, updated_at, ...rest }: any) => rest);
        for (let i = 0; i < clean.length; i += 500) {
          const batch = clean.slice(i, i + 500);
          const { error } = await (supabase
            .from('planejamento_financeiro' as any)
            .insert(batch) as any);
          if (error) throw error;
        }
      }

      await loadSaved();
      toast.success('Versão restaurada');
    } catch (e: any) {
      console.error('Erro ao restaurar versão:', e);
      toast.error('Erro ao restaurar versão');
    }
  }, [clienteId, ano, loadSaved]);

  return {
    loading,
    buildGrid,
    dividendos,
    importarRealizado,
    importarSubcentro,
    salvarGrid,
    salvarCelula,
    salvarVersao,
    listarVersoes,
    restaurarVersao,
    saldoInicial,
    lancamentosRebanho,
    lancamentosFinanciamento,
    lancamentosNutricao,
    lancamentosProjetos,
    gridMeta2026,
    mapasMeta,
    buildGridConsolidado,
    gridMetaConsolidado2026,
    buildGridConsolidadoCompetencia,
    lancFin2025,
    lancFin2025Loading,
    reloadNutricao: recarregarMeta,
    reloadProjetos: recarregarMeta,
    reload: loadSaved,
  };
}
