/**
 * Hook: usePlanejamentoFinanceiro
 *
 * CRUD, replicação, importação do ano anterior, ajuste percentual
 * e recálculo de custos variáveis para a tabela planejamento_financeiro.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
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
  origem: 'manual' | 'replicado' | 'calculado';
  cenario: string;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

export type PlanejamentoInsert = Omit<PlanejamentoFinanceiroRow, 'id' | 'created_at' | 'updated_at'>;

/** Drivers zootécnicos suportados */
export const DRIVERS_DISPONIVEIS = [
  { value: 'cabecas_total', label: 'Cabeças Total' },
  { value: 'cabecas_engorda', label: 'Cabeças Engorda' },
  { value: 'cabecas_recria', label: 'Cabeças Recria' },
  { value: 'cabecas_matrizes', label: 'Cabeças Matrizes' },
] as const;

/**
 * Mapeamento canônico: subcentros do plano de contas que usam driver zootécnico.
 * Regra: nutrição = custo variável por cabeça/mês.
 */
export const DRIVER_POR_SUBCENTRO: Record<string, { driver: string; unidade: string }> = {
  'Nutrição Engorda': { driver: 'cabecas_engorda', unidade: 'cab/mes' },
  'Nutrição Recria': { driver: 'cabecas_recria', unidade: 'cab/mes' },
  'Nutrição Cria': { driver: 'cabecas_matrizes', unidade: 'cab/mes' },
};

export function usePlanejamentoFinanceiro(ano: number) {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const fazendaId = fazendaAtual?.id;
  const clienteId = clienteAtual?.id;

  const [data, setData] = useState<PlanejamentoFinanceiroRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
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
      setData((rows || []) as PlanejamentoFinanceiroRow[]);
    } catch (e: any) {
      console.error('Erro ao carregar planejamento financeiro:', e);
      toast.error('Erro ao carregar planejamento');
    } finally {
      setLoading(false);
    }
  }, [fazendaId, clienteId, ano]);

  useEffect(() => { load(); }, [load]);

  // ─── CRUD ──────────────────────────────────────────────────

  const upsertRow = useCallback(async (row: Partial<PlanejamentoInsert> & { id?: string }) => {
    if (!fazendaId || !clienteId) return;
    const payload = {
      ...row,
      fazenda_id: fazendaId,
      cliente_id: clienteId,
      cenario: 'meta',
    };
    try {
      if (row.id) {
        const { error } = await (supabase
          .from('planejamento_financeiro' as any)
          .update(payload)
          .eq('id', row.id) as any);
        if (error) throw error;
      } else {
        const { error } = await (supabase
          .from('planejamento_financeiro' as any)
          .insert(payload) as any);
        if (error) throw error;
      }
      await load();
    } catch (e: any) {
      console.error('Erro ao salvar planejamento:', e);
      toast.error(e.message || 'Erro ao salvar');
      throw e;
    }
  }, [fazendaId, clienteId, load]);

  const deleteRow = useCallback(async (id: string) => {
    try {
      const { error } = await (supabase
        .from('planejamento_financeiro' as any)
        .delete()
        .eq('id', id) as any);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error('Erro ao excluir:', e);
      toast.error('Erro ao excluir');
    }
  }, [load]);

  // ─── Replicar valor_base para todos os meses (Jan–Dez) ────

  const replicarParaMeses = useCallback(async (params: {
    centro_custo: string;
    subcentro: string | null;
    macro_custo: string | null;
    grupo_custo: string | null;
    escopo_negocio: string | null;
    tipo_custo: 'fixo' | 'variavel';
    driver: string | null;
    unidade_driver: string | null;
    valor_base: number;
  }) => {
    if (!fazendaId || !clienteId) return;
    const rows = Array.from({ length: 12 }, (_, i) => ({
      cliente_id: clienteId,
      fazenda_id: fazendaId,
      ano,
      mes: i + 1,
      centro_custo: params.centro_custo,
      subcentro: params.subcentro,
      macro_custo: params.macro_custo,
      grupo_custo: params.grupo_custo,
      escopo_negocio: params.escopo_negocio,
      tipo_custo: params.tipo_custo,
      driver: params.driver,
      unidade_driver: params.unidade_driver,
      valor_base: params.valor_base,
      quantidade_driver: 0,
      valor_planejado: params.tipo_custo === 'fixo' ? params.valor_base : 0,
      origem: 'replicado' as const,
      cenario: 'meta',
      observacao: null,
    }));
    try {
      const { error } = await (supabase
        .from('planejamento_financeiro' as any)
        .upsert(rows, { onConflict: 'fazenda_id,ano,mes,centro_custo,subcentro,cenario' }) as any);
      if (error) throw error;
      toast.success('Replicado para 12 meses');
      await load();
    } catch (e: any) {
      console.error('Erro ao replicar:', e);
      toast.error(e.message || 'Erro ao replicar');
    }
  }, [fazendaId, clienteId, ano, load]);

  // ─── Importar base do ano anterior ────────────────────────

  const importarAnoAnterior = useCallback(async () => {
    if (!fazendaId || !clienteId) return;
    const anoAnterior = ano - 1;
    try {
      const { data: prev, error: readErr } = await (supabase
        .from('planejamento_financeiro' as any)
        .select('*')
        .eq('fazenda_id', fazendaId)
        .eq('ano', anoAnterior)
        .eq('cenario', 'meta') as any);
      if (readErr) throw readErr;
      if (!prev || prev.length === 0) {
        toast.info(`Nenhum planejamento encontrado em ${anoAnterior}`);
        return;
      }
      const rows = (prev as PlanejamentoFinanceiroRow[]).map(r => ({
        cliente_id: clienteId,
        fazenda_id: fazendaId,
        ano,
        mes: r.mes,
        centro_custo: r.centro_custo,
        subcentro: r.subcentro,
        macro_custo: r.macro_custo,
        grupo_custo: r.grupo_custo,
        escopo_negocio: r.escopo_negocio,
        tipo_custo: r.tipo_custo,
        driver: r.driver,
        unidade_driver: r.unidade_driver,
        valor_base: r.valor_base,
        quantidade_driver: 0,
        valor_planejado: r.tipo_custo === 'fixo' ? r.valor_base : 0,
        origem: 'replicado' as const,
        cenario: 'meta',
        observacao: `Importado de ${anoAnterior}`,
      }));
      const { error } = await (supabase
        .from('planejamento_financeiro' as any)
        .upsert(rows, { onConflict: 'fazenda_id,ano,mes,centro_custo,subcentro,cenario' }) as any);
      if (error) throw error;
      toast.success(`${rows.length} linhas importadas de ${anoAnterior}`);
      await load();
    } catch (e: any) {
      console.error('Erro ao importar ano anterior:', e);
      toast.error(e.message || 'Erro ao importar');
    }
  }, [fazendaId, clienteId, ano, load]);

  // ─── Ajuste percentual em todas as linhas do ano ──────────

  const aplicarAjustePercentual = useCallback(async (percentual: number) => {
    if (!fazendaId) return;
    if (data.length === 0) {
      toast.info('Nenhuma linha para ajustar');
      return;
    }
    const fator = 1 + percentual / 100;
    const updates = data.map(r => ({
      ...r,
      valor_base: Math.round(r.valor_base * fator * 100) / 100,
      valor_planejado: Math.round(r.valor_planejado * fator * 100) / 100,
      origem: 'calculado' as const,
    }));
    const payloads = updates.map(({ id, created_at, updated_at, ...rest }) => rest);
    try {
      const { error } = await (supabase
        .from('planejamento_financeiro' as any)
        .upsert(payloads, { onConflict: 'fazenda_id,ano,mes,centro_custo,subcentro,cenario' }) as any);
      if (error) throw error;
      toast.success(`Ajuste de ${percentual > 0 ? '+' : ''}${percentual}% aplicado`);
      await load();
    } catch (e: any) {
      console.error('Erro ao ajustar:', e);
      toast.error(e.message || 'Erro ao ajustar');
    }
  }, [fazendaId, data, load]);

  // ─── Recalcular variáveis com drivers zootécnicos ─────────

  const recalcularVariaveis = useCallback(async (
    driverValues: Record<string, number[]>,
  ) => {
    if (!fazendaId) return;
    const variaveis = data.filter(r => r.tipo_custo === 'variavel' && r.driver);
    if (variaveis.length === 0) {
      toast.info('Nenhuma linha variável para recalcular');
      return;
    }
    const updates: any[] = [];
    for (const r of variaveis) {
      const driverArr = driverValues[r.driver!];
      const qtd = driverArr ? driverArr[r.mes - 1] ?? 0 : 0;
      updates.push({
        cliente_id: r.cliente_id,
        fazenda_id: r.fazenda_id,
        ano: r.ano,
        mes: r.mes,
        centro_custo: r.centro_custo,
        subcentro: r.subcentro,
        macro_custo: r.macro_custo,
        grupo_custo: r.grupo_custo,
        escopo_negocio: r.escopo_negocio,
        tipo_custo: r.tipo_custo,
        driver: r.driver,
        unidade_driver: r.unidade_driver,
        valor_base: r.valor_base,
        quantidade_driver: qtd,
        valor_planejado: Math.round(r.valor_base * qtd * 100) / 100,
        origem: 'calculado' as const,
        cenario: 'meta',
        observacao: r.observacao,
      });
    }
    try {
      const { error } = await (supabase
        .from('planejamento_financeiro' as any)
        .upsert(updates, { onConflict: 'fazenda_id,ano,mes,centro_custo,subcentro,cenario' }) as any);
      if (error) throw error;
      toast.success(`${updates.length} linhas variáveis recalculadas`);
      await load();
    } catch (e: any) {
      console.error('Erro ao recalcular:', e);
      toast.error(e.message || 'Erro ao recalcular');
    }
  }, [fazendaId, data, load]);

  // ─── Helpers de agregação ─────────────────────────────────

  const getLinhasAgrupadas = useCallback(() => {
    const map = new Map<string, {
      centro_custo: string;
      subcentro: string | null;
      macro_custo: string | null;
      grupo_custo: string | null;
      tipo_custo: 'fixo' | 'variavel';
      driver: string | null;
      unidade_driver: string | null;
      valor_base: number;
      meses: number[];
      total: number;
      ids: (string | null)[];
    }>();

    for (const r of data) {
      const key = `${r.centro_custo}||${r.subcentro || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          centro_custo: r.centro_custo,
          subcentro: r.subcentro,
          macro_custo: r.macro_custo,
          grupo_custo: r.grupo_custo,
          tipo_custo: r.tipo_custo,
          driver: r.driver,
          unidade_driver: r.unidade_driver,
          valor_base: r.valor_base,
          meses: new Array(12).fill(0),
          total: 0,
          ids: new Array(12).fill(null),
        });
      }
      const group = map.get(key)!;
      group.meses[r.mes - 1] = r.valor_planejado;
      group.ids[r.mes - 1] = r.id;
      group.total += r.valor_planejado;
      group.valor_base = r.valor_base;
      group.tipo_custo = r.tipo_custo;
      group.driver = r.driver;
    }

    return Array.from(map.values());
  }, [data]);

  const totalAnual = data.reduce((s, r) => s + r.valor_planejado, 0);

  return {
    data,
    loading,
    reload: load,
    upsertRow,
    deleteRow,
    replicarParaMeses,
    importarAnoAnterior,
    aplicarAjustePercentual,
    recalcularVariaveis,
    getLinhasAgrupadas,
    totalAnual,
  };
}
