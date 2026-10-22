/**
 * FORN-TROCAR-LOTE-01 — trocar o fornecedor de varios lancamentos (`fn_lancamentos_trocar_favorecido`, com trilha e desfazer).
 * Simular (com ou sem destino: sem destino = so' o resumo de onde saem), aplicar e desfazer; e a leitura do resumo (pura).
 */
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';

export interface ResumoDaTroca {
  ok: boolean;
  recusa: string | null;
  lancamentos: number;
  soma: number;
  origens: { id: string | null; nome: string; lancamentos: number; soma: number }[];
  mesesFechados: { fazenda: string; anoMes: string }[];
  mesesFechadosLancamentos: number;
  conciliados: number;
  ligadosAOc: number;
  jaNoDestino: number;
  cancelados: number;
  operacaoId: string | null;
}

const num = (o: object, k: string) => Number(Reflect.get(o, k)) || 0;
export function lerResumoDaTroca(r: unknown): ResumoDaTroca | null {
  if (!r || typeof r !== 'object') return null;
  const recusa: unknown = Reflect.get(r, 'recusa');
  const frase = recusa && typeof recusa === 'object' ? Reflect.get(recusa, 'frase') : null;
  const lista = (k: string): object[] => { const v: unknown = Reflect.get(r, k); return Array.isArray(v) ? v.filter((x): x is object => !!x && typeof x === 'object') : []; };
  const texto = (o: object, k: string) => { const v: unknown = Reflect.get(o, k); return typeof v === 'string' ? v : null; };
  return {
    ok: Reflect.get(r, 'ok') === true, recusa: typeof frase === 'string' ? frase : null,
    lancamentos: num(r, 'lancamentos'), soma: num(r, 'soma'),
    origens: lista('origens').map((o) => ({ id: texto(o, 'id'), nome: texto(o, 'nome') ?? '—', lancamentos: num(o, 'lancamentos'), soma: num(o, 'soma') })),
    mesesFechados: lista('meses_fechados').map((o) => ({ fazenda: texto(o, 'fazenda') ?? '—', anoMes: texto(o, 'ano_mes') ?? '' })),
    mesesFechadosLancamentos: num(r, 'meses_fechados_lancamentos'), conciliados: num(r, 'conciliados'), ligadosAOc: num(r, 'ligados_a_oc'),
    jaNoDestino: num(r, 'ja_no_destino'), cancelados: num(r, 'cancelados'), operacaoId: texto(r, 'operacao_id'),
  };
}

const frase = (e: { message?: unknown } | null, padrao: string) => (e && typeof e.message === 'string' && e.message ? e.message : padrao);

export async function simularTroca(clienteId: string, ids: readonly string[], destino: string | null): Promise<ResumoDaTroca | { erro: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_lancamentos_trocar_favorecido', {
    p_cliente: clienteId, p_ids: [...ids], p_fornecedor: destino, p_motivo: null, p_simular: true });
  if (error) return { erro: frase(error, 'Não foi possível simular a troca.') };
  return lerResumoDaTroca(data) ?? { erro: 'Resposta da simulação fora do formato.' };
}

export async function aplicarTroca(clienteId: string, ids: readonly string[], destino: string, motivo: string): Promise<ResumoDaTroca | { erro: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_lancamentos_trocar_favorecido', {
    p_cliente: clienteId, p_ids: [...ids], p_fornecedor: destino, p_motivo: motivo, p_simular: false });
  if (error) return { erro: frase(error, 'O fornecedor não foi trocado.') };
  notificarLancamentosMudaram(clienteId);
  return lerResumoDaTroca(data) ?? { erro: 'Resposta fora do formato.' };
}

export async function desfazerTroca(clienteId: string, operacaoId: string, motivo: string): Promise<{ voltaram: number; ficaram: number } | { erro: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_lancamentos_trocar_favorecido_desfazer', { p_operacao_id: operacaoId, p_motivo: motivo, p_simular: false });
  if (error) return { erro: frase(error, 'A troca não foi desfeita.') };
  notificarLancamentosMudaram(clienteId);
  return { voltaram: data && typeof data === 'object' ? num(data, 'voltaram') : 0, ficaram: data && typeof data === 'object' ? num(data, 'ficaram') : 0 };
}
