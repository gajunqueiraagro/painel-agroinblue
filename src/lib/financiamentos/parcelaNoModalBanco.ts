/**
 * AS IDAS AO BANCO DA PARCELA NO MODAL DO LANÇAMENTO — PARC-CADEIA-01 passo 3. A leitura é a do dono da situação
 * (`fn_financiamento_situacao`); a gravação de valor e vencimento é a da grade do contrato (`fn_parcelamento_editar_parcelas`).
 */
import { supabase } from '@/integrations/supabase/client';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { lerSituacaoDoContrato, type SituacaoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';

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

/**
 * Grava a lista final do contrato (parcela + lançamento + contrato, numa transação). Devolve a frase da recusa, ou nulo.
 * ⚠ FIN-LISTA-SEM-F5-01 (Gabriel 03/11, a "Parafusos 4/4" do NJ): QUEM GRAVA AVISA O CANAL. Esta gravação muda o valor do lançamento (e o
 * das irmãs, e o total do contrato) ANTES do gravador de sempre; o gravador de sempre relê a linha já mudada, vê "nada mudou" (P116) e
 * não avisa — a lista de Lançamentos e os totais ficavam com o valor antigo até o F5. Sem ids: as irmãs também mudam (a página relê inteira).
 */
export async function gravarParcelaDoModal(financiamentoId: string, lista: { id: string; data_vencimento: string | null; valor: number }[], totalCent: number,
  clienteId?: string | null): Promise<string | null> {
  try {
    const { error } = await (supabase as any).rpc('fn_parcelamento_editar_parcelas', {
      p_financiamento_id: financiamentoId, p_parcelas: lista, p_valor_total: totalCent / 100,
    });
    if (!error) { if (clienteId) notificarLancamentosMudaram(clienteId); return null; }
    return typeof error.message === 'string' && error.message ? error.message : 'O banco recusou a alteração da parcela.';
  } catch (e) {
    return e instanceof Error && e.message ? e.message : 'Falha ao falar com o banco.';
  }
}
