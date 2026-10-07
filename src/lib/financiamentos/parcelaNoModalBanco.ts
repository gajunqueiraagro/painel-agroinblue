/**
 * AS IDAS AO BANCO DA PARCELA NO MODAL DO LANÇAMENTO — PARC-CADEIA-01 passo 3. A leitura é a do dono da situação
 * (`fn_financiamento_situacao`); a gravação de valor e vencimento é a da grade do contrato (`fn_parcelamento_editar_parcelas`).
 */
import { supabase } from '@/integrations/supabase/client';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { lerSituacaoDoContrato, type SituacaoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';

export interface ContratoDaParcela { financiamentoId: string; situacao: SituacaoDoContrato }

/** O contrato de PARCELAMENTO vivo de que este lançamento é parcela viva; `null` = não é (ou o banco não respondeu). */
export async function lerContratoDaParcela(lancamentoId: string): Promise<ContratoDaParcela | null> {
  try {
    const { data: parcela } = await supabase.from('financiamento_parcelas')
      .select('financiamento_id, status').eq('lancamento_id', lancamentoId).neq('status', 'cancelado').limit(1).maybeSingle();
    if (!parcela?.financiamento_id) return null;
    const { data: contrato } = await supabase.from('financiamentos')
      .select('natureza, status').eq('id', parcela.financiamento_id).maybeSingle();
    if (!contrato || contrato.natureza !== 'parcelamento' || contrato.status === 'cancelado') return null;
    const { data, error } = await (supabase as any).rpc('fn_financiamento_situacao', {
      p_financiamento_id: parcela.financiamento_id, p_hoje: hojeLocal(),
    });
    if (error) return null;
    const situacao = lerSituacaoDoContrato(data);
    return situacao ? { financiamentoId: parcela.financiamento_id, situacao } : null;
  } catch {
    return null;
  }
}

/** Grava a lista final do contrato (parcela + lançamento + contrato, numa transação). Devolve a frase da recusa, ou nulo. */
export async function gravarParcelaDoModal(financiamentoId: string, lista: { id: string; data_vencimento: string | null; valor: number }[], totalCent: number): Promise<string | null> {
  try {
    const { error } = await (supabase as any).rpc('fn_parcelamento_editar_parcelas', {
      p_financiamento_id: financiamentoId, p_parcelas: lista, p_valor_total: totalCent / 100,
    });
    if (!error) return null;
    return typeof error.message === 'string' && error.message ? error.message : 'O banco recusou a alteração da parcela.';
  } catch (e) {
    return e instanceof Error && e.message ? e.message : 'Falha ao falar com o banco.';
  }
}
