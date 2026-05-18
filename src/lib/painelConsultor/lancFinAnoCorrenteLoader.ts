/**
 * Loader de financeiro_lancamentos_v2 do ANO CORRENTE — Marco F2.1.
 *
 * Ponte temporária controlada até Marco 2.5: carrega lançamentos REAIS do
 * ano em curso para alimentar a 3ª coluna comparativa do DRE
 * (Real ano-corrente) na tela de Fechamento de Período. Espelha o loader
 * histórico (`lancFinHistoricoLoader.ts`) mudando apenas o range temporal:
 *
 *   data_pagamento ∈ [ano-01-01, (ano + 1)-01-01)
 *
 * Demais filtros base oficiais idênticos:
 *   cancelado=false
 *   sem_movimentacao_caixa=false
 *   status_transacao='realizado'
 *   cenario='realizado'
 *   escopo: cliente_id (global) ou fazenda_id (individual)
 *
 * Os mesmos agregadores oficiais (agregaReceitaPec, agregaOutrasReceitas,
 * agregaDeducoes, agregaCustoVariavelPec, agregaCustoFixoPec,
 * agregaInvFazendaPec, agregaJurosPec, ...) classificam esse array em
 * number[12] por linha-base.
 *
 * Paginação: PAGE=1000 + dedup por id (idêntico ao precedente). Retorna
 * `FinanceiroLancamento[]` via `mapV2ToLancamento`.
 *
 * IMPORTANTE — escopo desta camada:
 * - Camada de compatibilidade temporária Marco F2.1 → F2.3 (Fechamento).
 * - META 2026+ NÃO é tocada; este loader serve apenas a coluna Real ano.
 * - Não substitui zoot competence onde aplicável (Receita Pec, Reposição
 *   Bovinos, Deduções continuam zoot puro como fonte primária na META).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapV2ToLancamento, type FinanceiroLancamento } from '@/hooks/useFinanceiro';

interface CarregarLancFinAnoCorrenteRealParams {
  clienteId: string;
  fazendaId?: string;   // omitido / vazio / '__global__' → escopo global por cliente
  ano: number;          // ano corrente; range [ano-01-01, (ano + 1)-01-01)
}

const PAGE = 1000;

function isGlobalScope(fazendaId?: string): boolean {
  return !fazendaId || fazendaId === '__global__';
}

export async function carregarLancFinAnoCorrenteReal(
  params: CarregarLancFinAnoCorrenteRealParams,
  supabase: SupabaseClient,
): Promise<FinanceiroLancamento[]> {
  const { clienteId, fazendaId, ano } = params;
  if (!clienteId) return [];
  const anoSeguinte = ano + 1;

  const allRows: unknown[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = (supabase
      .from('financeiro_lancamentos_v2')
      .select('*') as unknown as {
        eq: (k: string, v: unknown) => typeof q;
        gte: (k: string, v: unknown) => typeof q;
        lt: (k: string, v: unknown) => typeof q;
        order: (k: string, opts?: unknown) => typeof q;
        range: (a: number, b: number) => Promise<{ data: unknown[] | null; error: unknown }>;
      })
      .eq('cancelado', false)
      .eq('sem_movimentacao_caixa', false)
      .eq('status_transacao', 'realizado')
      .eq('cenario', 'realizado')
      .gte('data_pagamento', `${ano}-01-01`)
      .lt('data_pagamento', `${anoSeguinte}-01-01`);

    if (isGlobalScope(fazendaId)) {
      q = q.eq('cliente_id', clienteId);
    } else {
      q = q.eq('fazenda_id', fazendaId);
    }

    const { data, error } = await q
      .order('data_pagamento', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const seenIds = new Set<string>();
  const dedupRows = allRows.filter((r) => {
    const id = (r as { id?: string })?.id;
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  return dedupRows.map((r) => mapV2ToLancamento(r));
}
