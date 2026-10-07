/**
 * AS IDAS AO BANCO DO CANCELAMENTO DE PARCELA — PARC-CADEIA-01 passo 2. Simulação e gravação são a MESMA função
 * (`fn_parcelamento_cancelar_parcela`, com `p_simular`); o texto e a decisão do que oferecer moram no dono puro
 * (`cancelarParcela.ts`).
 */
import { supabase } from '@/integrations/supabase/client';
import { lerPreviaCancelarParcela, type EscopoDoCancelamento, type PreviaCancelarParcela } from '@/lib/financiamentos/cancelarParcela';

export interface AlvoDoCancelamento { lancamentoId?: string | null; parcelaId?: string | null }

const mensagem = (e: unknown): string =>
  (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string' && e.message) || 'Falha ao falar com o banco.';

async function chamar(alvo: AlvoDoCancelamento, escopo: EscopoDoCancelamento, motivo: string, simular: boolean) {
  return (supabase as any).rpc('fn_parcelamento_cancelar_parcela', {
    p_lancamento_id: alvo.lancamentoId ?? null, p_escopo: escopo, p_motivo: motivo, p_simular: simular,
    p_parcela_id: alvo.parcelaId ?? null,
  });
}

/**
 * "Este lançamento é parcela viva de compra parcelada?" — quem responde é o banco, pela simulação de "só esta".
 * `null` = não é (ou o banco não respondeu): a porta segue o cancelamento de sempre, e a trava do banco continua valendo.
 */
export async function consultarParcelaDoLancamento(lancamentoId: string): Promise<PreviaCancelarParcela | null> {
  try {
    const { data, error } = await chamar({ lancamentoId }, 'so_esta', '', true);
    if (error) return null;
    return lerPreviaCancelarParcela(data);
  } catch {
    return null;
  }
}

/** A simulação de um escopo. Devolve a prévia, ou a frase do erro. */
export async function simularCancelarParcela(alvo: AlvoDoCancelamento, escopo: EscopoDoCancelamento):
  Promise<{ previa: PreviaCancelarParcela; erro: null } | { previa: null; erro: string }> {
  try {
    const { data, error } = await chamar(alvo, escopo, '', true);
    if (error) return { previa: null, erro: mensagem(error) };
    const previa = lerPreviaCancelarParcela(data);
    return previa ? { previa, erro: null } : { previa: null, erro: 'O banco devolveu uma resposta que a tela não soube ler.' };
  } catch (e) {
    return { previa: null, erro: mensagem(e) };
  }
}

/** A gravação. Devolve a frase da recusa, ou nulo quando gravou. */
export async function gravarCancelarParcela(alvo: AlvoDoCancelamento, escopo: EscopoDoCancelamento, motivo: string): Promise<string | null> {
  try {
    const { error } = await chamar(alvo, escopo, motivo, false);
    return error ? mensagem(error) : null;
  } catch (e) {
    return mensagem(e);
  }
}
