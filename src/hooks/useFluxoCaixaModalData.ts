/**
 * useFluxoCaixaModalData — hook do Modal Fluxo de Caixa Realizado.
 *
 * Camada 3 / FASE 1 / Commit 2. Hook isolado: não estende nem reaproveita
 * `useFluxoCaixa` ou `useFinanceiro`.
 *
 * Responsabilidades:
 *   1. Query enxuta paginada em `financeiro_lancamentos_v2` — cenário
 *      'realizado', cancelado=false, sem_movimentacao_caixa=false, no ano.
 *      Sem filtro de fazenda — caixa é cliente-wide (espelha caixaIndicador).
 *      SELECT de 11 colunas (id, ano_mes, valor, sinal, status_transacao,
 *      cenario, tipo_operacao, subcentro, centro_custo, grupo_custo,
 *      macro_custo). `tipo_operacao` é necessário para filtrar transferências
 *      entre contas no builder (macro_custo é inconsistente, ~74% NULL).
 *   2. Compor input do builder (saldos PC-100 + grid Meta + lançamentos).
 *   3. Devolver DTO pronto via `buildFluxoCaixaModalData(...)`.
 *
 * Cache: queryKey só depende de `clienteId` e `ano`. `modo`/`mesAlvo` afetam
 * apenas o builder em memória — toggle de modo não dispara refetch.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/lib/supabase/fetchAllPaginated';
import type { PainelConsultorDataResult } from './usePainelConsultorData';
import type { SubcentroGrid } from './usePlanejamentoFinanceiro';
import { buildFluxoCaixaModalData } from '@/v2/lib/buildFluxoCaixaModalData';
import type {
  FluxoCaixaModalData,
  LancamentoBruto,
  ModoToggle,
} from '@/v2/lib/fluxoCaixaModalTypes';

// ─── Input/Output do hook ────────────────────────────────────────────

export interface UseFluxoCaixaModalDataInput {
  clienteId: string;
  ano: number;
  mesAlvo: number;
  modo: ModoToggle;
  painel: PainelConsultorDataResult | null;
  saldoInicialMeta: number;
  gridMetaConsolidado: SubcentroGrid[] | null;
  /** Flag informativa: true quando consumido em modo Fazenda Individual.
   *  Caixa é cliente-wide; flag dispara warning no DTO. */
  isContextoIndividual?: boolean;
  enabled: boolean;
}

export interface UseFluxoCaixaModalDataResult {
  data: FluxoCaixaModalData | null;
  loading: boolean;
  error: Error | null;
}

// ─── Fetch dos lançamentos brutos do ano (paginado) ──────────────────

interface LancamentoRow {
  id: string;
  ano_mes: string | null;
  valor: number | null;
  sinal: number | null;
  status_transacao: string | null;
  cenario: string | null;
  tipo_operacao: string | null;
  subcentro: string | null;
  centro_custo: string | null;
  grupo_custo: string | null;
  macro_custo: string | null;
}

async function fetchLancamentosDoAno(
  clienteId: string,
  ano: number,
): Promise<LancamentoBruto[]> {
  const inicio = `${ano}-01`;
  const fim = `${ano}-12`;
  const { data } = await fetchAllPaginated<LancamentoRow>({
    // Factory builder — `fetchAllPaginated` aplica `.range()` por página.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: () => (supabase
      .from('financeiro_lancamentos_v2')
      .select(
        'id, ano_mes, valor, sinal, status_transacao, cenario, tipo_operacao, subcentro, centro_custo, grupo_custo, macro_custo',
      ) as any)
      .eq('cliente_id', clienteId)
      .eq('cenario', 'realizado')
      .eq('cancelado', false)
      .eq('sem_movimentacao_caixa', false)
      .gte('ano_mes', inicio)
      .lte('ano_mes', fim)
      .order('ano_mes', { ascending: true })
      .order('id', { ascending: true }),
    pageSize: 1000,
    maxRows: 100000,
    context: 'fluxoCaixaModal/lancamentos',
  });

  // Normaliza para LancamentoBruto — descarta linhas com campos críticos null.
  const out: LancamentoBruto[] = [];
  for (const r of data) {
    if (!r.id || !r.ano_mes || r.valor == null) continue;
    const valorNum = Number(r.valor);
    if (!Number.isFinite(valorNum)) continue;
    out.push({
      id: r.id,
      ano_mes: r.ano_mes,
      valor: valorNum,
      sinal: r.sinal === -1 ? -1 : 1,
      status_transacao: r.status_transacao ?? '',
      cenario: r.cenario ?? '',
      tipo_operacao: r.tipo_operacao ?? null,
      subcentro: r.subcentro,
      centro_custo: r.centro_custo,
      grupo_custo: r.grupo_custo,
      macro_custo: r.macro_custo,
    });
  }
  return out;
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useFluxoCaixaModalData(
  input: UseFluxoCaixaModalDataInput,
): UseFluxoCaixaModalDataResult {
  const {
    clienteId,
    ano,
    mesAlvo,
    modo,
    painel,
    saldoInicialMeta,
    gridMetaConsolidado,
    isContextoIndividual,
    enabled,
  } = input;

  const queryEnabled = enabled && !!clienteId && Number.isFinite(ano);

  const {
    data: lancamentos,
    isLoading,
    error: queryError,
  } = useQuery<LancamentoBruto[], Error>({
    queryKey: ['fluxoCaixaModalLancs', clienteId, ano],
    enabled: queryEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: () => fetchLancamentosDoAno(clienteId, ano),
  });

  const data = useMemo<FluxoCaixaModalData | null>(() => {
    if (!queryEnabled) return null;
    if (!painel) return null;
    if (!gridMetaConsolidado) return null;
    if (!lancamentos) return null;
    return buildFluxoCaixaModalData({
      modo,
      ano,
      mesAlvo,
      serieReal2025Saldo: painel.caixaIndicador?.serieAnoAnt?.slice(1) ?? [],
      serieReal2026SaldoOficial: painel.caixaIndicador?.serieAno?.slice(1) ?? [],
      saldoInicialMeta,
      saldoInicialReal: painel.caixaIndicador?.serieAnoAnt?.[0] ?? 0,
      lancamentos,
      gridMetaConsolidado,
      isContextoIndividual,
    });
  }, [
    queryEnabled,
    painel,
    gridMetaConsolidado,
    lancamentos,
    modo,
    ano,
    mesAlvo,
    saldoInicialMeta,
    isContextoIndividual,
  ]);

  return {
    data,
    loading: isLoading,
    error: queryError ?? null,
  };
}
