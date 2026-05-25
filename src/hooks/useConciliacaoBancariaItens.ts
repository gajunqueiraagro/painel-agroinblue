/**
 * useConciliacaoBancariaItens — CRUD do vínculo N:N entre extrato e lançamentos.
 *
 * Tabela: conciliacao_bancaria_itens (FKs extrato_id, lancamento_id, valor_aplicado).
 *
 * Após cada insert/remoção, recomputa `extrato_bancario_v2.status` via lib
 * soberana (src/lib/financeiro/conciliacaoSync.ts). PR4 moveu a implementação
 * pra lib pra que useFinanceiroV2 também possa chamar a mesma lógica.
 *
 * NÃO cria nem altera lançamentos em financeiro_lancamentos_v2.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  recomputarStatusExtrato as libRecomputarStatusExtrato,
  atualizarValorAplicado as libAtualizarValorAplicado,
  sincronizarVinculosDoLancamento as libSincronizarVinculosDoLancamento,
} from '@/lib/financeiro/conciliacaoSync';

export interface ConciliacaoItem {
  id: string;
  cliente_id: string;
  extrato_id: string;
  lancamento_id: string;
  valor_aplicado: number;
  criado_por: string | null;
  created_at: string;
}

export function useConciliacaoBancariaItens() {
  async function insert(params: {
    extrato_id: string;
    lancamento_id: string;
    valor_aplicado: number;
    cliente_id: string;
  }): Promise<ConciliacaoItem> {
    const { data, error } = await supabase
      .from('conciliacao_bancaria_itens' as any)
      .insert({
        cliente_id: params.cliente_id,
        extrato_id: params.extrato_id,
        lancamento_id: params.lancamento_id,
        valor_aplicado: params.valor_aplicado,
      })
      .select('*')
      .single();
    if (error) throw error;

    await libRecomputarStatusExtrato(params.extrato_id);
    return data as unknown as ConciliacaoItem;
  }

  async function listarPorExtrato(extrato_id: string): Promise<ConciliacaoItem[]> {
    const { data, error } = await supabase
      .from('conciliacao_bancaria_itens' as any)
      .select('*')
      .eq('extrato_id', extrato_id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as unknown as ConciliacaoItem[]) ?? [];
  }

  // PR3 — versão em lote: retorna Map<extrato_id, ConciliacaoItem[]> para
  // que ExtratoListaTab carregue vínculos de todas as linhas do mês em 1 query.
  async function listarPorExtratos(
    extratoIds: string[],
  ): Promise<Map<string, ConciliacaoItem[]>> {
    if (extratoIds.length === 0) return new Map();
    const { data, error } = await supabase
      .from('conciliacao_bancaria_itens' as any)
      .select('*')
      .in('extrato_id', extratoIds)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const items = (data as unknown as ConciliacaoItem[]) ?? [];
    const map = new Map<string, ConciliacaoItem[]>();
    for (const item of items) {
      const arr = map.get(item.extrato_id) ?? [];
      arr.push(item);
      map.set(item.extrato_id, arr);
    }
    return map;
  }

  async function remover(id: string): Promise<void> {
    // Buscar extrato_id antes de deletar para recomputar status depois.
    const { data: row } = await supabase
      .from('conciliacao_bancaria_itens' as any)
      .select('extrato_id')
      .eq('id', id)
      .maybeSingle();
    const extratoId = (row as unknown as { extrato_id: string } | null)?.extrato_id;

    const { error } = await supabase
      .from('conciliacao_bancaria_itens' as any)
      .delete()
      .eq('id', id);
    if (error) throw error;

    if (extratoId) await libRecomputarStatusExtrato(extratoId);
  }

  // PR4 — lista vínculos por lancamento_id (espelho de listarPorExtrato).
  async function listarPorLancamento(lancamentoId: string): Promise<ConciliacaoItem[]> {
    const { data, error } = await supabase
      .from('conciliacao_bancaria_itens' as any)
      .select('*')
      .eq('lancamento_id', lancamentoId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as unknown as ConciliacaoItem[]) ?? [];
  }

  return {
    insert,
    listarPorExtrato,
    listarPorExtratos,
    listarPorLancamento,
    remover,
    recomputarStatusExtrato: libRecomputarStatusExtrato,
    atualizarValorAplicado: libAtualizarValorAplicado,
    sincronizarVinculosDoLancamento: libSincronizarVinculosDoLancamento,
  };
}
