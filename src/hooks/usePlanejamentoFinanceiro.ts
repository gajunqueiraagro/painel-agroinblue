/**
 * Hook: usePlanejamentoFinanceiro
 *
 * Simplified: load, save (bulk upsert), import realizado anterior, saldo inicial, dividendos.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';

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
  origem: 'manual' | 'replicado' | 'calculado' | 'importado_realizado';
  cenario: string;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

/** Plano de contas row (global, client_id = null) */
export interface PlanoContasRow {
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

/** Map tipo+categoria from lancamentos to financial subcentro */
function mapRebanhoSubcentro(tipo: string, categoria: string, hasBoitel: boolean): string | null {
  if (tipo === 'abate') {
    if (['touros','bois','garrotes','machos','bezerros_m','mamotes_m','desmama_m'].includes(categoria)) return 'Abates de Machos';
    if (['vacas','novilhas','bezerras_f','desmama_f','femeas','mamotes_f'].includes(categoria)) return 'Abates de Fêmeas';
  }
  if (tipo === 'venda') {
    if (hasBoitel) return 'Venda em Boitel';
    if (['desmama_m','bezerros_m'].includes(categoria)) return 'Venda de Desmama Machos';
    if (['desmama_f','bezerras_f'].includes(categoria)) return 'Venda de Desmama Fêmeas';
    if (['garrotes','touros','bois','machos_adultos','mamotes_m'].includes(categoria)) return 'Venda de Machos Adultos';
    if (['novilhas','vacas','femeas_adultas','mamotes_f'].includes(categoria)) return 'Venda de Fêmeas Adultas';
  }
  if (tipo === 'compra') {
    if (['garrotes','touros','bois','machos','bezerros_m','mamotes_m','desmama_m'].includes(categoria)) return 'Investimento Compra Bovinos Machos';
    if (['novilhas','vacas','femeas','bezerras_f','mamotes_f','desmama_f'].includes(categoria)) return 'Investimento Compra Bovinos Fêmeas';
  }
  return null;
}

export function usePlanejamentoFinanceiro(ano: number, fazendaId?: string) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const [savedData, setSavedData] = useState<PlanejamentoFinanceiroRow[]>([]);
  const [planoContas, setPlanoContas] = useState<PlanoContasRow[]>([]);
  const [dividendos, setDividendos] = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saldoInicial, setSaldoInicial] = useState<number>(0);
  const [lancamentosRebanho, setLancamentosRebanho] = useState<Map<string, number[]>>(new Map());
  const [lancamentosFinanciamento, setLancamentosFinanciamento] = useState<Map<string, number[]>>(new Map());
  const [lancamentosNutricao, setLancamentosNutricao] = useState<Map<string, number[]>>(new Map());

  // ─── Load saved planejamento ──────────────────────────────
  const loadSaved = useCallback(async () => {
    if (!clienteId) return;
    // Global: load all fazendas; individual: load specific
    setLoading(true);
    try {
      let query = supabase
        .from('planejamento_financeiro' as any)
        .select('*')
        .eq('cliente_id', clienteId)
        .eq('ano', ano)
        .eq('cenario', 'meta')
        .order('centro_custo')
        .order('subcentro')
        .order('mes');

      if (isValidFazenda(fazendaId)) {
        query = query.eq('fazenda_id', fazendaId);
      }

      const { data: rows, error } = await (query as any);
      if (error) throw error;
      setSavedData((rows || []) as PlanejamentoFinanceiroRow[]);
    } catch (e: any) {
      console.error('Erro ao carregar planejamento:', e);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, clienteId, ano]);

  // ─── Load plano de contas (global) ────────────────────────
  const loadPlano = useCallback(async () => {
    try {
      const { data: rows, error } = await (supabase
        .from('financeiro_plano_contas' as any)
        .select('macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ordem_exibicao')
        .eq('ativo', true)
        .not('subcentro', 'is', null)
        .order('ordem_exibicao') as any);
      if (error) throw error;
      setPlanoContas((rows || []) as PlanoContasRow[]);
    } catch (e: any) {
      console.error('Erro ao carregar plano de contas:', e);
    }
  }, []);

  // ─── Load dividendos do cliente ───────────────────────────
  const loadDividendos = useCallback(async () => {
    if (!clienteId) return;
    try {
      const { data: rows, error } = await supabase
        .from('financeiro_dividendos')
        .select('id, nome')
        .eq('cliente_id', clienteId)
        .eq('ativo', true)
        .order('ordem_exibicao');
      if (error) throw error;
      setDividendos((rows || []).map(r => ({ id: r.id, nome: r.nome })));
    } catch (e: any) {
      console.error('Erro ao carregar dividendos:', e);
    }
  }, [clienteId]);

  // ─── Load saldo inicial (saldo bancário dez do ano anterior) ──
  const loadSaldoInicial = useCallback(async () => {
    if (!clienteId) return;
    const anoMesAnterior = `${ano - 1}-12`;
    try {
      let query = supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('saldo_final')
        .eq('cliente_id', clienteId)
        .eq('ano_mes', anoMesAnterior);

      if (isValidFazenda(fazendaId)) {
        query = query.eq('fazenda_id', fazendaId);
      }

      const { data: rows, error } = await query;
      if (error) throw error;
      const total = (rows || []).reduce((s: number, r: any) => s + (r.saldo_final || 0), 0);
      setSaldoInicial(Math.round(total * 100) / 100);
    } catch (e: any) {
      console.error('Erro ao carregar saldo inicial:', e);
      setSaldoInicial(0);
    }
  }, [clienteId, fazendaId, ano]);

  // ─── Load lancamentos rebanho (META) ──────────────────────
  const loadLancamentosRebanho = useCallback(async () => {
    if (!clienteId) { setLancamentosRebanho(new Map()); return; }
    try {
      let query = supabase
        .from('lancamentos')
        .select('tipo, categoria, data, valor_total, boitel_lote_id')
        .eq('cliente_id', clienteId)
        .eq('cenario', 'meta')
        .eq('cancelado', false)
        .gte('data', `${ano}-01-01`)
        .lte('data', `${ano}-12-31`)
        .in('tipo', ['abate', 'venda', 'compra'])
        .not('valor_total', 'is', null);

      if (isValidFazenda(fazendaId)) {
        query = query.eq('fazenda_id', fazendaId);
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      const result = new Map<string, number[]>();
      for (const r of (rows || [])) {
        const subcentro = mapRebanhoSubcentro(r.tipo, r.categoria, !!r.boitel_lote_id);
        if (!subcentro) continue;
        const mes = Number((r.data as string).substring(5, 7));
        if (mes < 1 || mes > 12) continue;
        if (!result.has(subcentro)) result.set(subcentro, new Array(12).fill(0));
        result.get(subcentro)![mes - 1] += Math.abs(r.valor_total || 0);
      }

      // Round to 2 decimals
      for (const [, arr] of result) {
        for (let i = 0; i < 12; i++) arr[i] = Math.round(arr[i] * 100) / 100;
      }

      setLancamentosRebanho(result);
    } catch (e: any) {
      console.error('Erro ao carregar lancamentos rebanho:', e);
      setLancamentosRebanho(new Map());
    }
  }, [clienteId, fazendaId, ano]);

  useEffect(() => { loadPlano(); }, [loadPlano]);
  useEffect(() => { loadSaved(); }, [loadSaved]);
  useEffect(() => { loadSaldoInicial(); }, [loadSaldoInicial]);
  useEffect(() => { loadDividendos(); }, [loadDividendos]);
  useEffect(() => { loadLancamentosRebanho(); }, [loadLancamentosRebanho]);

  // ─── Load parcelas de financiamento (pendentes, ano META) ─
  const loadFinanciamentos = useCallback(async () => {
    if (!clienteId) { setLancamentosFinanciamento(new Map()); return; }
    try {
      let query = supabase
        .from('financiamento_parcelas')
        .select(`
          data_vencimento,
          valor_principal,
          valor_juros,
          financiamentos!inner (
            tipo_financiamento,
            plano_conta_parcela_id,
            cliente_id,
            fazenda_id,
            financeiro_plano_contas_parcela:financeiro_plano_contas!financiamentos_plano_conta_parcela_id_fkey (
              subcentro, grupo_custo, centro_custo, macro_custo
            )
          )
        `)
        .eq('status', 'pendente')
        .eq('financiamentos.cliente_id', clienteId)
        .gte('data_vencimento', `${ano}-01-01`)
        .lte('data_vencimento', `${ano}-12-31`);

      if (isValidFazenda(fazendaId)) {
        query = query.eq('financiamentos.fazenda_id', fazendaId);
      }

      const { data: rows, error } = await (query as any);
      if (error) throw error;

      const result = new Map<string, number[]>();

      const addToMap = (subcentro: string, mes: number, valor: number) => {
        if (!subcentro || valor <= 0) return;
        if (!result.has(subcentro)) result.set(subcentro, new Array(12).fill(0));
        result.get(subcentro)![mes - 1] += valor;
      };

      for (const r of (rows || [])) {
        const fin = (r as any).financiamentos;
        if (!fin) continue;
        const pc = fin.financeiro_plano_contas_parcela;
        const mes = new Date(r.data_vencimento).getMonth() + 1;
        if (mes < 1 || mes > 12) continue;

        // Principal → subcentro do plano_conta_parcela_id
        if (pc?.subcentro) {
          addToMap(pc.subcentro, mes, Math.abs(r.valor_principal || 0));
        }

        // Juros → subcentro de juros conforme tipo_financiamento
        const tipo = fin.tipo_financiamento;
        const subJuros = tipo === 'agricultura'
          ? 'Juros de Financiamento Agricultura'
          : 'Juros de Financiamento Pecuária';
        addToMap(subJuros, mes, Math.abs(r.valor_juros || 0));
      }

      // Round to 2 decimals
      for (const [, arr] of result) {
        for (let i = 0; i < 12; i++) arr[i] = Math.round(arr[i] * 100) / 100;
      }

      setLancamentosFinanciamento(result);
    } catch (e: any) {
      console.error('Erro ao carregar financiamentos para META:', e);
      setLancamentosFinanciamento(new Map());
    }
  }, [clienteId, fazendaId, ano]);

  useEffect(() => { loadFinanciamentos(); }, [loadFinanciamentos]);

  // ─── Load parametros de nutrição + rebanho META → calcular linhas ──
  const loadNutricao = useCallback(async () => {
    if (!clienteId || !isValidFazenda(fazendaId)) { setLancamentosNutricao(new Map()); return; }
    try {
      // 1. Load params
      const { data: params } = await (supabase
        .from('meta_parametros_nutricao' as any)
        .select('*')
        .eq('fazenda_id', fazendaId)
        .eq('ano', ano)
        .maybeSingle() as any);

      if (!params) { setLancamentosNutricao(new Map()); return; }

      const criaCusto = Number(params.cria_custo_cab_mes) || 0;
      const recriaCusto = Number(params.recria_custo_cab_mes) || 0;
      const engordaDias = Number(params.engorda_periodo_dias) || 0;
      const engordaConsumo = Number(params.engorda_consumo_kg_ms) || 0;
      const engordaCustoKg = Number(params.engorda_custo_kg_ms) || 0;
      const custoPorCabEngorda = engordaDias * engordaConsumo * engordaCustoKg;

      // 2. Load rebanho META (saldo_final por categoria/mês)
      const { data: rebanhoRows } = await (supabase
        .from('vw_zoot_categoria_mensal' as any)
        .select('categoria_codigo, mes, saldo_final')
        .eq('fazenda_id', fazendaId)
        .eq('cenario', 'meta')
        .eq('ano', ano)
        .in('categoria_codigo', ['vacas', 'novilhas', 'garrotes', 'desmama_m', 'desmama_f']) as any);

      // Build lookup: Map<categoria, number[12]>
      const sfMap = new Map<string, number[]>();
      for (const r of (rebanhoRows || [])) {
        if (!sfMap.has(r.categoria_codigo)) sfMap.set(r.categoria_codigo, new Array(12).fill(0));
        const m = Number(r.mes);
        if (m >= 1 && m <= 12) sfMap.get(r.categoria_codigo)![m - 1] = Number(r.saldo_final) || 0;
      }

      const result = new Map<string, number[]>();

      // CRIA: vacas × custo
      if (criaCusto > 0) {
        const cria = new Array(12).fill(0);
        const vacas = sfMap.get('vacas') || new Array(12).fill(0);
        for (let i = 0; i < 12; i++) cria[i] = Math.round(vacas[i] * criaCusto * 100) / 100;
        result.set('Nutrição Cria', cria);
      }

      // RECRIA: (novilhas + garrotes + desmama_m + desmama_f) × custo
      if (recriaCusto > 0) {
        const recria = new Array(12).fill(0);
        const cats = ['novilhas', 'garrotes', 'desmama_m', 'desmama_f'];
        for (let i = 0; i < 12; i++) {
          let soma = 0;
          for (const c of cats) soma += (sfMap.get(c)?.[i] || 0);
          recria[i] = Math.round(soma * recriaCusto * 100) / 100;
        }
        result.set('Nutrição Recria', recria);
      }

      // ENGORDA: distribuir custo em 4 meses antes de cada abate
      if (custoPorCabEngorda > 0) {
        // Load abates META
        const { data: abates } = await supabase
          .from('lancamentos')
          .select('data, quantidade')
          .eq('cliente_id', clienteId)
          .eq('fazenda_id', fazendaId!)
          .eq('cenario', 'meta')
          .eq('tipo', 'abate')
          .eq('cancelado', false)
          .gte('data', `${ano}-01-01`)
          .lte('data', `${ano}-12-31`);

        const engorda = new Array(12).fill(0);
        for (const ab of (abates || [])) {
          const mesAbate = Number((ab.data as string).substring(5, 7));
          if (mesAbate < 1 || mesAbate > 12) continue;
          const qtd = Math.abs(Number(ab.quantidade) || 0);
          const custoTotal = qtd * custoPorCabEngorda;
          const custoMensal = custoTotal / 4;
          // Distribute in 4 months BEFORE abate (mes-4 to mes-1)
          for (let offset = 4; offset >= 1; offset--) {
            const m = mesAbate - offset;
            if (m >= 1 && m <= 12) {
              engorda[m - 1] += custoMensal;
            }
          }
        }
        // Round
        for (let i = 0; i < 12; i++) engorda[i] = Math.round(engorda[i] * 100) / 100;
        result.set('Nutrição Engorda', engorda);
      }

      setLancamentosNutricao(result);
    } catch (e: any) {
      console.error('Erro ao calcular nutrição:', e);
      setLancamentosNutricao(new Map());
    }
  }, [clienteId, fazendaId, ano]);

  useEffect(() => { loadNutricao(); }, [loadNutricao]);

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

    // Overlay saved values
    for (const r of savedData) {
      if (!r.subcentro) continue;
      const key = `${r.centro_custo}||${r.subcentro}`;
      if (!map.has(key)) {
        map.set(key, {
          macro_custo: r.macro_custo,
          grupo_custo: r.grupo_custo,
          centro_custo: r.centro_custo,
          subcentro: r.subcentro,
          escopo_negocio: r.escopo_negocio,
          ordem_exibicao: 9999,
          meses: new Array(12).fill(0),
        });
      }
      const grid = map.get(key)!;
      if (r.mes >= 1 && r.mes <= 12) {
        grid.meses[r.mes - 1] = r.valor_planejado;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.ordem_exibicao - b.ordem_exibicao);
  }, [planoContas, savedData, dividendos]);

  // ─── Import realizado from previous year (returns grid, does NOT save) ──
  const importarRealizado = useCallback(async (): Promise<SubcentroGrid[] | null> => {
    if (!isValidFazenda(fazendaId) || !clienteId) return null;
    const anoAnterior = ano - 1;
    try {
      const PAGE_SIZE = 1000;
      let allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data: rows, error } = await (supabase
          .from('financeiro_lancamentos_v2')
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
  const salvarGrid = useCallback(async (grid: SubcentroGrid[]) => {
    if (!isValidFazenda(fazendaId) || !clienteId) return;
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
        .eq('cenario', 'meta') as any);

      if (rows.length > 0) {
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          const { error } = await (supabase
            .from('planejamento_financeiro' as any)
            .insert(batch) as any);
          if (error) throw error;
        }
      }

      toast.success(`Planejamento salvo — ${rows.length} registros`);
      await loadSaved();
    } catch (e: any) {
      console.error('Erro ao salvar planejamento:', e);
      toast.error(e.message || 'Erro ao salvar');
    }
  }, [fazendaId, clienteId, ano, loadSaved]);

  return {
    loading,
    buildGrid,
    importarRealizado,
    salvarGrid,
    saldoInicial,
    lancamentosRebanho,
    lancamentosFinanciamento,
    lancamentosNutricao,
    reloadNutricao: loadNutricao,
    reload: loadSaved,
  };
}
