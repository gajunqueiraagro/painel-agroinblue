/**
 * useConciliacaoBancariaItens — CRUD do vínculo N:N entre extrato e lançamentos.
 *
 * Tabela: conciliacao_bancaria_itens (FKs extrato_id, lancamento_id, valor_aplicado).
 *
 * Após cada insert/remoção, recomputa `extrato_bancario_v2.status`:
 *   - Σ valor_aplicado >= |valor| → 'conciliado'
 *   - 0 < Σ < |valor|              → 'parcial'
 *   - Σ = 0                        → 'nao_conciliado'
 *
 * NÃO cria nem altera lançamentos em financeiro_lancamentos_v2.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ConciliacaoItem {
  id: string;
  cliente_id: string;
  extrato_id: string;
  lancamento_id: string;
  valor_aplicado: number;
  criado_por: string | null;
  created_at: string;
}

interface ExtratoMinimo {
  valor: number;
}

async function recomputarStatusExtrato(extratoId: string): Promise<void> {
  const { data: extrato, error: e1 } = await supabase
    .from('extrato_bancario_v2' as any)
    .select('valor')
    .eq('id', extratoId)
    .maybeSingle();
  if (e1 || !extrato) return;
  const valorMov = Math.abs(Number((extrato as unknown as ExtratoMinimo).valor) || 0);

  const { data: itens } = await supabase
    .from('conciliacao_bancaria_itens' as any)
    .select('valor_aplicado')
    .eq('extrato_id', extratoId);
  const soma = (itens as unknown as { valor_aplicado: number }[] ?? [])
    .reduce((s, r) => s + Math.abs(Number(r.valor_aplicado) || 0), 0);

  let novoStatus: 'nao_conciliado' | 'parcial' | 'conciliado';
  if (soma <= 0) novoStatus = 'nao_conciliado';
  else if (soma + 0.005 >= valorMov) novoStatus = 'conciliado';
  else novoStatus = 'parcial';

  await supabase
    .from('extrato_bancario_v2' as any)
    .update({ status: novoStatus })
    .eq('id', extratoId);
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

    await recomputarStatusExtrato(params.extrato_id);
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

    if (extratoId) await recomputarStatusExtrato(extratoId);
  }

  return { insert, listarPorExtrato, remover, recomputarStatusExtrato };
}
