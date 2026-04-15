/**
 * Hook: usePlanejamentoFinanceiro
 *
 * Simplified: load, save (bulk upsert), import realizado anterior.
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

export function usePlanejamentoFinanceiro(ano: number, fazendaId?: string) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const [savedData, setSavedData] = useState<PlanejamentoFinanceiroRow[]>([]);
  const [planoContas, setPlanoContas] = useState<PlanoContasRow[]>([]);
  const [loading, setLoading] = useState(false);

  // ─── Load saved planejamento ──────────────────────────────
  const loadSaved = useCallback(async () => {
    if (!fazendaId || !clienteId) return;
    setLoading(true);
    try {
      const { data: rows, error } = await (supabase
        .from('planejamento_financeiro' as any)
        .select('*')
        .eq('fazenda_id', fazendaId)
        .eq('ano', ano)
        .eq('cenario', 'meta')
        .order('centro_custo')
        .order('subcentro')
        .order('mes') as any);
      if (error) throw error;
      setSavedData((rows || []) as PlanejamentoFinanceiroRow[]);
    } catch (e: any) {
      console.error('Erro ao carregar planejamento:', e);
      toast.error('Erro ao carregar planejamento');
    } finally {
      setLoading(false);
    }
  }, [fazendaId, clienteId, ano]);

  // ─── Load plano de contas (global) ────────────────────────
  const loadPlano = useCallback(async () => {
    try {
      const { data: rows, error } = await (supabase
        .from('financeiro_plano_contas' as any)
        .select('macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio')
        .eq('ativo', true)
        .not('subcentro', 'is', null)
        .order('macro_custo')
        .order('grupo_custo')
        .order('centro_custo')
        .order('subcentro') as any);
      if (error) throw error;
      setPlanoContas((rows || []) as PlanoContasRow[]);
    } catch (e: any) {
      console.error('Erro ao carregar plano de contas:', e);
    }
  }, []);

  useEffect(() => { loadPlano(); }, [loadPlano]);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  // ─── Build grid: plano + saved values ─────────────────────
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
          meses: new Array(12).fill(0),
        });
      }
      const grid = map.get(key)!;
      if (r.mes >= 1 && r.mes <= 12) {
        grid.meses[r.mes - 1] = r.valor_planejado;
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const cmp = (x: string | null, y: string | null) => (x || '').localeCompare(y || '');
      return cmp(a.macro_custo, b.macro_custo)
        || cmp(a.grupo_custo, b.grupo_custo)
        || cmp(a.centro_custo, b.centro_custo)
        || cmp(a.subcentro, b.subcentro);
    });
  }, [planoContas, savedData]);

  // ─── Import realizado from previous year (returns grid, does NOT save) ──
  const importarRealizado = useCallback(async (): Promise<SubcentroGrid[] | null> => {
    if (!fazendaId || !clienteId) return null;
    const anoAnterior = ano - 1;
    try {
      const PAGE_SIZE = 1000;
      let allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data: rows, error } = await (supabase
          .from('financeiro_lancamentos_v2')
          .select('macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ano_mes, valor')
          .eq('fazenda_id', fazendaId)
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

      // Aggregate by subcentro + mes
      const map = new Map<string, SubcentroGrid>();
      for (const l of allRows) {
        if (!l.centro_custo || !l.subcentro) continue;
        const key = `${l.centro_custo}||${l.subcentro}`;
        if (!map.has(key)) {
          map.set(key, {
            macro_custo: l.macro_custo,
            grupo_custo: l.grupo_custo,
            centro_custo: l.centro_custo,
            subcentro: l.subcentro,
            escopo_negocio: l.escopo_negocio,
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
    if (!fazendaId || !clienteId) return;
    // Build rows for months with value > 0
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
      // Delete existing rows for this fazenda+ano+meta first
      await (supabase
        .from('planejamento_financeiro' as any)
        .delete()
        .eq('fazenda_id', fazendaId)
        .eq('ano', ano)
        .eq('cenario', 'meta') as any);

      if (rows.length > 0) {
        // Insert in batches of 500
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
    reload: loadSaved,
  };
}
