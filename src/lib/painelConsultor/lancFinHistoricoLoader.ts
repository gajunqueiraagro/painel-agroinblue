/**
 * Loader de financeiro_lancamentos_v2 do ANO FECHADO (ano - 1) — Marco 1.1.E.
 *
 * Carrega uma vez os lançamentos REAIS do ano anterior para o caller (V2 Planejamento
 * Visão Geral). Os agregadores existentes em `agregadosFinanceiros.ts`
 * (`agregaOutrasReceitas`, `agregaInvFazendaPec`, `agregaJurosPec`, ...) recebem
 * esse array + ano-1 e devolvem `number[12]` por linha-base.
 *
 * IMPORTANTE — escopo desta camada:
 * - Camada de compatibilidade histórica REAL ano-1, NUNCA META.
 * - Aplica-se apenas a linhas da DRE onde não existe agregador zoot (Outras
 *   Receitas, Investimento Fazenda Pec, Juros Pec) ou onde a fonte REAL
 *   ano-1 é naturalmente financeira por design no cadastro do cliente.
 * - META 2026+ deve continuar usando padrão correto (zoot para zoot;
 *   `planejamento_financeiro` para linhas financeiras).
 *
 * Filtros SQL idênticos ao padrão oficial usado em
 * `usePainelConsultorData` (L1086-1107 para Custeio ano-1):
 *   cancelado=false
 *   sem_movimentacao_caixa=false
 *   status_transacao='realizado'
 *   cenario='realizado'
 *   data_pagamento ∈ [(ano-1)-01-01, ano-01-01)
 *   escopo: cliente_id (global) ou fazenda_id (individual)
 *
 * Paginação: PAGE=1000 + dedup por id (idêntico ao precedente).
 *
 * Retorno: `FinanceiroLancamento[]` mapeado via `mapV2ToLancamento` para que
 * os agregadores reutilizem o tipo canônico já consumido em produção.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapV2ToLancamento, type FinanceiroLancamento } from '@/hooks/useFinanceiro';

interface CarregarLancFinAnoAntRealParams {
  clienteId: string;
  fazendaId?: string;   // omitido / vazio / '__global__' → escopo global por cliente
  ano: number;          // ANO CORRENTE; a função lê automaticamente (ano - 1)
}

const PAGE = 1000;

function isGlobalScope(fazendaId?: string): boolean {
  return !fazendaId || fazendaId === '__global__';
}

export async function carregarLancFinAnoAntReal(
  params: CarregarLancFinAnoAntRealParams,
  supabase: SupabaseClient,
): Promise<FinanceiroLancamento[]> {
  const { clienteId, fazendaId, ano } = params;
  if (!clienteId) return [];
  const anoAnt = ano - 1;

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
      .gte('data_pagamento', `${anoAnt}-01-01`)
      .lt('data_pagamento', `${ano}-01-01`);

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

  // Dedup defensivo por id — paginação Supabase pode entregar duplicatas
  // entre páginas se a ordenação não for totalmente determinística.
  const seenIds = new Set<string>();
  const dedupRows = allRows.filter((r) => {
    const id = (r as { id?: string })?.id;
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  return dedupRows.map((r) => mapV2ToLancamento(r));
}
