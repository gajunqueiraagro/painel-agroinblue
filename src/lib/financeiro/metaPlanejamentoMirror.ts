import { supabase } from '@/integrations/supabase/client';

interface FinanceiroInsertShape {
  cliente_id: string;
  fazenda_id: string;
  movimentacao_rebanho_id?: string | null;
  cenario?: string;
  macro_custo?: string | null;
  grupo_custo?: string | null;
  centro_custo?: string | null;
  subcentro?: string | null;
  escopo_negocio?: string | null;
  valor: number;
  sinal?: number;
  data_pagamento?: string | null;
  ano_mes?: string | null;
}

/**
 * Espelha lançamentos financeiros com cenario='meta' em planejamento_financeiro
 * com origem='rebanho_auto'. Usa observacao do planejamento para guardar
 * movimentacao_rebanho_id (chave de associação para delete posterior).
 */
export async function mirrorMetaToPlanejamento(
  inserts: FinanceiroInsertShape[],
): Promise<void> {
  const metaRows = inserts.filter(r => r.cenario === 'meta' && r.movimentacao_rebanho_id);
  if (metaRows.length === 0) return;

  const mirrorRows = metaRows.map(r => {
    const anoMes = r.ano_mes || (r.data_pagamento || '').slice(0, 7);
    const [anoStr, mesStr] = anoMes.split('-');
    return {
      cliente_id: r.cliente_id,
      fazenda_id: r.fazenda_id,
      ano: Number(anoStr),
      mes: Number(mesStr),
      macro_custo: r.macro_custo ?? null,
      grupo_custo: r.grupo_custo ?? null,
      centro_custo: r.centro_custo ?? '',
      subcentro: r.subcentro ?? null,
      escopo_negocio: r.escopo_negocio ?? null,
      valor_planejado: Math.abs(r.valor),
      valor_base: Math.abs(r.valor),
      origem: 'rebanho_auto',
      cenario: 'meta',
      observacao: r.movimentacao_rebanho_id!,
    };
  });

  const { error } = await (supabase
    .from('planejamento_financeiro' as any)
    .insert(mirrorRows as any) as any);
  if (error) {
    console.error('[metaPlanejamentoMirror] insert error:', error);
  }
}

/**
 * Remove espelhos de planejamento_financeiro (origem='rebanho_auto') associados
 * a um movimentacao_rebanho_id específico. Usado quando o lançamento meta é
 * cancelado/recalculado no zootécnico.
 */
export async function deleteMetaPlanejamentoByMovimentacao(
  movimentacaoRebanhoId: string,
  clienteId: string,
): Promise<void> {
  const { error } = await (supabase
    .from('planejamento_financeiro' as any)
    .delete()
    .eq('cliente_id', clienteId)
    .eq('origem', 'rebanho_auto')
    .eq('observacao', movimentacaoRebanhoId) as any);
  if (error) {
    console.error('[metaPlanejamentoMirror] delete error:', error);
  }
}
