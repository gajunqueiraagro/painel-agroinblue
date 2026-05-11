/**
 * useFechamentoPeriodoData.ts
 *
 * Hook orquestrador do cockpit Fechamento do Período (Marco 2.4).
 *
 * Reúsa hooks existentes (useFinanceiro, useLancamentos, useRebanhoOficial,
 * usePlanejamentoFinanceiro) que lêem cliente/fazenda do FazendaContext/
 * ClienteContext. Para o ano anterior, chama os hooks segunda vez com
 * { ano: anoAnterior }.
 *
 * Queries Supabase diretas (autorizadas no Marco 2.4):
 *  - valor_rebanho_realizado_validado
 *  - financeiro_saldos_bancarios_v2
 *  - fechamento_pastos (status P1)
 *  - valor_rebanho_fechamento (status P2)
 *  - fechamento_area_snapshot (area_pecuaria_ha por fazenda+mês)
 *
 * Quando tudo carregou, chama buildFechamentoPeriodoData e devolve o DTO.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { usePlanejamentoFinanceiro } from '@/hooks/usePlanejamentoFinanceiro';
import { totalizarPorMes } from '@/hooks/useZootCategoriaMensal';
import { buildFechamentoPeriodoData } from '@/v2/lib/buildFechamentoPeriodoData';
import type {
  FechamentoPeriodoDTO,
  RebanhoMensal,
  StatusPilarMensal,
  ValorRebanhoValidado,
  SaldoBancario,
} from '@/v2/types/fechamentoPeriodo';

type Args = {
  periodoInicio: string; // "YYYY-MM"
  periodoFim: string;
};

/**
 * Adapter: converte output de totalizarPorMes (indexado por mes 1-12)
 * em RebanhoMensal[] (com ano_mes "YYYY-MM").
 *
 * Como totalizarPorMes agrega TODAS as fazendas, perde o fazenda_id
 * individual — usa 'global' como placeholder.
 */
function adaptarRebanhoMensal(
  totais: ReturnType<typeof totalizarPorMes>,
  ano: number,
): RebanhoMensal[] {
  const result: RebanhoMensal[] = [];
  for (let m = 1; m <= 12; m++) {
    const t = totais[m];
    if (!t) continue;
    const ano_mes = `${ano}-${String(m).padStart(2, '0')}`;
    const cabecas = t.saldo_final ?? null;
    const pesoTotal = t.peso_total_final ?? null;
    const pesoMedioKg = (cabecas && cabecas > 0 && pesoTotal != null)
      ? pesoTotal / cabecas : null;
    result.push({
      fazenda_id: 'global',
      ano_mes,
      cabecas,
      ua: null,
      pesoMedioKg,
      gmd: null,
      areaProdutivaPec: null,
      producaoBiologicaKg: t.producao_biologica ?? null,
    });
  }
  return result;
}

export function useFechamentoPeriodoData({ periodoInicio, periodoFim }: Args) {
  const { clienteAtual } = useCliente();
  const { fazendaAtual, isGlobal } = useFazenda();

  const clienteId = clienteAtual?.id;
  const fazendaId = isGlobal ? undefined : fazendaAtual?.id;
  const enabled = !!clienteId && !!periodoInicio && !!periodoFim;

  const anoCorrente = periodoFim ? parseInt(periodoFim.split('-')[0], 10) : new Date().getFullYear();
  const anoAnterior = anoCorrente - 1;

  // Financeiro (lancamentos): hook lê cliente/fazenda do context, filtra por ano
  const finCorr = useFinanceiro({ ano: anoCorrente, enabled });
  const finAnt  = useFinanceiro({ ano: anoAnterior, enabled });

  // META — usePlanejamentoFinanceiro tem assinatura posicional (ano, fazendaId?)
  const planFin = usePlanejamentoFinanceiro(anoCorrente, fazendaId);
  const metaGrid = useMemo(
    () => (enabled ? planFin.buildGrid() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planFin.buildGrid, planFin.loading, enabled],
  );

  // Rebanho (zoot categoria mensal agregado)
  const rebCorr = useRebanhoOficial({ ano: anoCorrente, cenario: 'realizado', global: isGlobal, enabled });
  const rebAnt  = useRebanhoOficial({ ano: anoAnterior, cenario: 'realizado', global: isGlobal, enabled });
  const rebMeta = useRebanhoOficial({ ano: anoCorrente, cenario: 'meta',       global: isGlobal, enabled });

  // Lançamentos zoot (cattle moves)
  const lancCorr = useLancamentos({ cenario: 'realizado', ano: anoCorrente, enabled });
  const lancAnt  = useLancamentos({ cenario: 'realizado', ano: anoAnterior, enabled });

  // valor_rebanho_realizado_validado — período corrente
  const valorReb = useQuery<ValorRebanhoValidado[]>({
    queryKey: ['vrv', clienteId, isGlobal ? 'global' : fazendaId, periodoInicio, periodoFim],
    enabled,
    queryFn: async () => {
      let q = (supabase
        .from('valor_rebanho_realizado_validado' as any)
        .select('*') as any)
        .eq('cliente_id', clienteId!)
        .gte('ano_mes', periodoInicio)
        .lte('ano_mes', periodoFim);
      if (!isGlobal && fazendaId) q = q.eq('fazenda_id', fazendaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ValorRebanhoValidado[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const valorRebAnt = useQuery<ValorRebanhoValidado[]>({
    queryKey: ['vrv-ant', clienteId, isGlobal ? 'global' : fazendaId, anoAnterior],
    enabled,
    queryFn: async () => {
      let q = (supabase
        .from('valor_rebanho_realizado_validado' as any)
        .select('*') as any)
        .eq('cliente_id', clienteId!)
        .gte('ano_mes', `${anoAnterior}-01`)
        .lte('ano_mes', `${anoAnterior}-12`);
      if (!isGlobal && fazendaId) q = q.eq('fazenda_id', fazendaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ValorRebanhoValidado[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // financeiro_saldos_bancarios_v2
  const saldosBan = useQuery<SaldoBancario[]>({
    queryKey: ['fsb', clienteId, isGlobal ? 'global' : fazendaId, periodoInicio, periodoFim],
    enabled,
    queryFn: async () => {
      let q = (supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('ano_mes, saldo_final, conta_bancaria_id, fazenda_id') as any)
        .eq('cliente_id', clienteId!)
        .gte('ano_mes', periodoInicio)
        .lte('ano_mes', periodoFim);
      if (!isGlobal && fazendaId) q = q.eq('fazenda_id', fazendaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SaldoBancario[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const saldosBanAnt = useQuery<SaldoBancario[]>({
    queryKey: ['fsb-ant', clienteId, isGlobal ? 'global' : fazendaId, anoAnterior],
    enabled,
    queryFn: async () => {
      let q = (supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('ano_mes, saldo_final, conta_bancaria_id, fazenda_id') as any)
        .eq('cliente_id', clienteId!)
        .gte('ano_mes', `${anoAnterior}-01`)
        .lte('ano_mes', `${anoAnterior}-12`);
      if (!isGlobal && fazendaId) q = q.eq('fazenda_id', fazendaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SaldoBancario[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Área Produtiva Pec — fechamento_area_snapshot (1 linha por fazenda+mês).
  // Paginada para segurança (cliente com muitas fazendas × ano inteiro).
  type AreaRow = { fazenda_id: string; ano_mes: string; area_pecuaria_ha: number | null };

  // Helper: converte 'YYYY-MM' em par de bordas {dataInicio: 'YYYY-MM-01', dataFim: 'YYYY-MM-(ult.dia)'}.
  // fechamento_area_snapshot.ano_mes é column DATE — filtros por string '2026-01'
  // dependeriam de cast implícito do Postgres. Bordas full date evitam ambiguidade.
  const bordasDoMes = (anoMes: string): { dataInicio: string; dataFim: string } => {
    const [ano, mes] = anoMes.split('-').map(Number);
    const ultimoDia = new Date(ano, mes, 0).getDate();
    return {
      dataInicio: `${anoMes}-01`,
      dataFim: `${anoMes}-${String(ultimoDia).padStart(2, '0')}`,
    };
  };

  const areaSnap = useQuery<AreaRow[]>({
    queryKey: ['area-snap', clienteId, isGlobal ? 'global' : fazendaId, periodoInicio, periodoFim],
    enabled,
    queryFn: async () => {
      const acc: AreaRow[] = [];
      let offset = 0;
      const PAGE = 1000;
      const { dataInicio } = bordasDoMes(periodoInicio);
      const { dataFim } = bordasDoMes(periodoFim);
      while (true) {
        let q = (supabase
          .from('fechamento_area_snapshot' as any)
          .select('fazenda_id, ano_mes, area_pecuaria_ha') as any)
          .eq('cliente_id', clienteId!)
          .gte('ano_mes', dataInicio)
          .lte('ano_mes', dataFim)
          .order('ano_mes', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (!isGlobal && fazendaId) q = q.eq('fazenda_id', fazendaId);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        acc.push(...(data as AreaRow[]));
        if (data.length < PAGE) break;
        offset += PAGE;
        if (offset > 50000) break;
      }
      return acc;
    },
    staleTime: 5 * 60 * 1000,
  });

  const areaSnapAnt = useQuery<AreaRow[]>({
    queryKey: ['area-snap-ant', clienteId, isGlobal ? 'global' : fazendaId, anoAnterior],
    enabled,
    queryFn: async () => {
      const acc: AreaRow[] = [];
      let offset = 0;
      const PAGE = 1000;
      const dataInicio = `${anoAnterior}-01-01`;
      const dataFim = `${anoAnterior}-12-31`;
      while (true) {
        let q = (supabase
          .from('fechamento_area_snapshot' as any)
          .select('fazenda_id, ano_mes, area_pecuaria_ha') as any)
          .eq('cliente_id', clienteId!)
          .gte('ano_mes', dataInicio)
          .lte('ano_mes', dataFim)
          .order('ano_mes', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (!isGlobal && fazendaId) q = q.eq('fazenda_id', fazendaId);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        acc.push(...(data as AreaRow[]));
        if (data.length < PAGE) break;
        offset += PAGE;
        if (offset > 50000) break;
      }
      return acc;
    },
    staleTime: 5 * 60 * 1000,
  });

  // statusPilares: combinar P1 (fechamento_pastos) + P2 (valor_rebanho_fechamento).
  // Paginação obrigatória nas duas tabelas (Supabase REST 1000-row limit).
  const statusPil = useQuery<StatusPilarMensal[]>({
    queryKey: ['statpil', clienteId, isGlobal ? 'global' : fazendaId, periodoInicio, periodoFim],
    enabled,
    queryFn: async () => {
      type Row = { fazenda_id: string; ano_mes: string; status: string };
      const PAGE = 1000;

      const fetchPaginado = async (
        tabela: 'fechamento_pastos' | 'valor_rebanho_fechamento',
      ): Promise<Row[]> => {
        const acc: Row[] = [];
        let offset = 0;
        while (true) {
          let q = (supabase
            .from(tabela)
            .select('fazenda_id, ano_mes, status') as any)
            .eq('cliente_id', clienteId!)
            .gte('ano_mes', periodoInicio)
            .lte('ano_mes', periodoFim)
            .order('ano_mes', { ascending: true })
            .range(offset, offset + PAGE - 1);
          if (!isGlobal && fazendaId) q = q.eq('fazenda_id', fazendaId);
          const { data, error } = await q;
          if (error) throw error;
          if (!data || data.length === 0) break;
          acc.push(...(data as Row[]));
          if (data.length < PAGE) break;
          offset += PAGE;
          if (offset > 50000) break; // safeguard contra loop infinito
        }
        return acc;
      };

      const [p1, p2] = await Promise.all([
        fetchPaginado('fechamento_pastos'),
        fetchPaginado('valor_rebanho_fechamento'),
      ]);

      const map = new Map<string, StatusPilarMensal>();
      const k = (f: string, m: string) => `${f}|${m}`;
      for (const r of p1) {
        const key = k(r.fazenda_id, r.ano_mes);
        const cur = map.get(key) ?? {
          fazenda_id: r.fazenda_id,
          ano_mes: r.ano_mes,
          p1_oficial: false,
          p2_oficial: false,
        };
        if (r.status === 'fechado') cur.p1_oficial = true;
        map.set(key, cur);
      }
      for (const r of p2) {
        const key = k(r.fazenda_id, r.ano_mes);
        const cur = map.get(key) ?? {
          fazenda_id: r.fazenda_id,
          ano_mes: r.ano_mes,
          p1_oficial: false,
          p2_oficial: false,
        };
        if (r.status === 'fechado') cur.p2_oficial = true;
        map.set(key, cur);
      }
      return Array.from(map.values());
    },
    staleTime: 5 * 60 * 1000,
  });

  // Loading agregado
  const loading =
    (finCorr as any)?.loading || (finAnt as any)?.loading ||
    (rebCorr as any)?.loading || (rebAnt as any)?.loading || (rebMeta as any)?.loading ||
    (lancCorr as any)?.loading || (lancAnt as any)?.loading ||
    planFin.loading ||
    valorReb.isLoading || valorRebAnt.isLoading ||
    saldosBan.isLoading || saldosBanAnt.isLoading ||
    statusPil.isLoading ||
    areaSnap.isLoading || areaSnapAnt.isLoading;

  const error: Error | null =
    (valorReb.error as Error | null) ??
    (valorRebAnt.error as Error | null) ??
    (saldosBan.error as Error | null) ??
    (saldosBanAnt.error as Error | null) ??
    (statusPil.error as Error | null) ??
    (areaSnap.error as Error | null) ??
    (areaSnapAnt.error as Error | null) ??
    null;

  // DTO
  const dto = useMemo<FechamentoPeriodoDTO | null>(() => {
    if (loading || error) return null;
    if (!clienteId || !periodoInicio || !periodoFim) return null;

    const rebanhoMensal = adaptarRebanhoMensal((rebCorr as any)?.totaisPorMes ?? {}, anoCorrente);
    const rebanhoMensalAnt = adaptarRebanhoMensal((rebAnt as any)?.totaisPorMes ?? {}, anoAnterior);
    const rebanhoMensalMeta = adaptarRebanhoMensal((rebMeta as any)?.totaisPorMes ?? {}, anoCorrente);

    // Enriquecimento: areaProdutivaPec por mês a partir de fechamento_area_snapshot.
    // Normalização: fechamento_area_snapshot.ano_mes é column DATE — vem
    // '2026-04-01' do banco. rebanhoMensal.ano_mes é text 'YYYY-MM'. Chave
    // do índice usa slice(0,7) para casar os dois formatos.
    // Quando isGlobal, soma a área pecuária de todas as fazendas que reportaram
    // snapshot naquele mês. Quando fazenda específica, sobrescreve (cada
    // (fazenda, mês) deve ter linha única — last-one-wins é defensivo).
    const indexarAreaPorMes = (rows: AreaRow[], somar: boolean): Map<string, number> => {
      const map = new Map<string, number>();
      for (const r of rows) {
        if (r.area_pecuaria_ha == null || !Number.isFinite(r.area_pecuaria_ha)) continue;
        const chave = String(r.ano_mes).slice(0, 7);
        if (somar) {
          map.set(chave, (map.get(chave) ?? 0) + Number(r.area_pecuaria_ha));
        } else {
          map.set(chave, Number(r.area_pecuaria_ha));
        }
      }
      return map;
    };
    const areaPorMesCorr = indexarAreaPorMes(areaSnap.data ?? [], isGlobal);
    const areaPorMesAnt = indexarAreaPorMes(areaSnapAnt.data ?? [], isGlobal);
    for (const r of rebanhoMensal) {
      const a = areaPorMesCorr.get(r.ano_mes);
      if (a != null) r.areaProdutivaPec = a;
    }
    for (const r of rebanhoMensalAnt) {
      const a = areaPorMesAnt.get(r.ano_mes);
      if (a != null) r.areaProdutivaPec = a;
    }

    return buildFechamentoPeriodoData({
      clienteId,
      fazendaId: isGlobal ? null : (fazendaId ?? null),
      periodoInicio,
      periodoFim,
      lancamentosRealizados: (finCorr as any)?.lancamentos ?? [],
      lancamentosAnoAnterior: (finAnt as any)?.lancamentos ?? [],
      metaGrid: (metaGrid as any) ?? [],
      rebanhoMensal,
      rebanhoMensalAnoAnterior: rebanhoMensalAnt,
      rebanhoMensalMeta,
      lancamentosZoot: (lancCorr as any)?.lancamentos ?? [],
      lancamentosZootAnoAnterior: (lancAnt as any)?.lancamentos ?? [],
      valorRebanho: valorReb.data ?? [],
      valorRebanhoAnoAnterior: valorRebAnt.data ?? [],
      saldosBancarios: saldosBan.data ?? [],
      saldosBancariosAnoAnterior: saldosBanAnt.data ?? [],
      statusPilares: statusPil.data ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loading, error, clienteId, fazendaId, isGlobal, periodoInicio, periodoFim, anoCorrente, anoAnterior,
    (finCorr as any)?.lancamentos, (finAnt as any)?.lancamentos,
    metaGrid,
    (rebCorr as any)?.totaisPorMes, (rebAnt as any)?.totaisPorMes, (rebMeta as any)?.totaisPorMes,
    (lancCorr as any)?.lancamentos, (lancAnt as any)?.lancamentos,
    valorReb.data, valorRebAnt.data, saldosBan.data, saldosBanAnt.data, statusPil.data,
    areaSnap.data, areaSnapAnt.data,
  ]);

  return { dto, loading, error };
}
