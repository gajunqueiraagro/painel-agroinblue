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
      .is('desfeito_em', null)   // PR-CBI-READ-01: só vínculos ativos (desfeito = memória)
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
      .is('desfeito_em', null)   // PR-CBI-READ-01: só vínculos ativos (desfeito = memória)
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

  /* AUDIT-DELETE-01a: o vínculo NÃO se apaga — desfaz pelo gesto do banco (desfeito_em/por/motivo + trilha), motivo obrigatório. */
  async function remover(id: string, motivo: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_conciliacao_item_desfazer', {
      p_item_id: id, p_motivo: motivo, p_simular: false,
    });
    if (error) throw error;
    const r = (data ?? {}) as { ok?: boolean; extrato_id?: string; recusa?: { frase?: string } };
    if (r.ok === false) throw new Error(r.recusa?.frase ?? 'Não foi possível desfazer o vínculo.');
    if (r.extrato_id) await libRecomputarStatusExtrato(r.extrato_id);
  }

  // PR4 — lista vínculos por lancamento_id (espelho de listarPorExtrato).
  async function listarPorLancamento(lancamentoId: string): Promise<ConciliacaoItem[]> {
    const { data, error } = await supabase
      .from('conciliacao_bancaria_itens' as any)
      .select('*')
      .eq('lancamento_id', lancamentoId)
      .is('desfeito_em', null)   // PR-CBI-READ-01: só vínculos ativos (desfeito = memória)
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
