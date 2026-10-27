/**
 * "VOLTAR PARA À VISTA" — P74b (Gabriel 24/10/2026: todo gesto tem volta). A compra parcelada volta a ser UM lançamento à vista pela
 * `fn_parcelamento_voltar_a_vista` (uma transação; simular = o mesmo caminho, desfeito): a 1/N vira o lançamento (valor = a soma das N,
 * vencimento/descrição originais), as N−1 ficam canceladas com "voltou para à vista", o cadastro cancelado.
 * ⚠ Parcela paga/realizada ou conciliada: a recusa vem pronta do banco ("A parcela k/N já foi paga em dd/mm/aaaa: desfaça o pagamento
 *   antes.") e o botão fica apagado com ela.
 */
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';

export interface ParcelaDaVolta { numero: number; vencimento: string | null; valorCent: number }
export type VoltaAVista =
  | { ok: true; lancamentoId: string; valorCent: number; vencimento: string | null; descricao: string; canceladas: number; antes: ParcelaDaVolta[] }
  | { ok: false; frase: string; antes: ParcelaDaVolta[]; /** P96a — 'juncao': a compra veio da junção de soltas (a volta é desfazê-la) */ motivo: string | null };

const g = (o: unknown, k: string): unknown => (o && typeof o === 'object' ? Reflect.get(o, k) : undefined);
const cent = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) : 0);
const texto = (v: unknown) => (typeof v === 'string' ? v : null);

/** Lê a resposta da função (simulada ou gravada). Torta = nulo. */
export function lerVoltaAVista(r: unknown): VoltaAVista | null {
  if (!r || typeof r !== 'object') return null;
  const lista = g(r, 'antes');
  const antes: ParcelaDaVolta[] = Array.isArray(lista)
    ? lista.map((x) => ({ numero: Number(g(x, 'numero')) || 0, vencimento: texto(g(x, 'vencimento')), valorCent: cent(g(x, 'valor')) }))
    : [];
  if (g(r, 'ok') === true) {
    const id = texto(g(r, 'lancamento_id'));
    if (!id) return null;
    return { ok: true, lancamentoId: id, valorCent: cent(g(r, 'valor')), vencimento: texto(g(r, 'vencimento')), descricao: texto(g(r, 'descricao')) ?? '',
      canceladas: Number(g(r, 'canceladas')) || 0, antes };
  }
  const frase = texto(g(g(r, 'recusa'), 'frase'));
  return frase ? { ok: false, frase, antes, motivo: texto(g(g(r, 'recusa'), 'motivo')) } : null;
}

export interface GravadoresDaVolta {
  chamar: (financiamentoId: string, simular: boolean) => Promise<unknown>;
  /** P96a — `fn_parcelamento_desfazer_juncao` (padrão: o banco) */
  desfazer?: (financiamentoId: string, simular: boolean) => Promise<unknown>;
}

async function chamarNoBanco(financiamentoId: string, simular: boolean): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_parcelamento_voltar_a_vista', { p_financiamento_id: financiamentoId, p_simular: simular });
  if (error) throw error;
  return data;
}
async function desfazerNoBanco(financiamentoId: string, simular: boolean): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_parcelamento_desfazer_juncao', { p_financiamento_id: financiamentoId, p_simular: simular });
  if (error) throw error;
  return data;
}
export const GRAVADORES_DA_VOLTA: GravadoresDaVolta = { chamar: chamarNoBanco, desfazer: desfazerNoBanco };

const erroDe = (e: unknown, padrao: string) => (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message ? e.message : padrao);

/** A prévia (simulada). Erro do banco (não é compra parcelada, já cancelada) = nulo: o botão não se oferece. */
export async function simularVoltaAVista(financiamentoId: string, gv: GravadoresDaVolta = GRAVADORES_DA_VOLTA): Promise<VoltaAVista | null> {
  try { return lerVoltaAVista(await gv.chamar(financiamentoId, true)); } catch { return null; }
}

export async function voltarParaAVista(clienteId: string, financiamentoId: string, gv: GravadoresDaVolta = GRAVADORES_DA_VOLTA): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const r = lerVoltaAVista(await gv.chamar(financiamentoId, false));
    if (!r || r.ok === false) return { ok: false, erro: r && r.ok === false ? r.frase : 'A compra não voltou para à vista.' };
    notificarLancamentosMudaram(clienteId);
    return { ok: true };
  } catch (x) {
    return { ok: false, erro: erroDe(x, 'A compra não voltou para à vista.') };
  }
}

/** P96a — DESFAZER A JUNÇÃO: os N lançamentos voltam a ser soltos (nenhum cancelado; a competência volta à de antes onde a junção a mudou). */
export type DesfazerJuncao = { ok: true; lancamentos: number; competenciaVolta: number; competenciaMantida: number } | { ok: false; frase: string };
export function lerDesfazerJuncao(r: unknown): DesfazerJuncao | null {
  if (!r || typeof r !== 'object') return null;
  if (g(r, 'ok') === true) {
    return { ok: true, lancamentos: Number(g(r, 'lancamentos')) || 0, competenciaVolta: Number(g(r, 'competencia_volta')) || 0, competenciaMantida: Number(g(r, 'competencia_mantida')) || 0 };
  }
  const frase = texto(g(g(r, 'recusa'), 'frase'));
  return frase ? { ok: false, frase } : null;
}
export async function simularDesfazerJuncao(financiamentoId: string, gv: GravadoresDaVolta = GRAVADORES_DA_VOLTA): Promise<DesfazerJuncao | null> {
  try { return lerDesfazerJuncao(await (gv.desfazer ?? desfazerNoBanco)(financiamentoId, true)); } catch { return null; }
}
export async function desfazerJuncao(clienteId: string, financiamentoId: string, gv: GravadoresDaVolta = GRAVADORES_DA_VOLTA): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const r = lerDesfazerJuncao(await (gv.desfazer ?? desfazerNoBanco)(financiamentoId, false));
    if (!r || r.ok === false) return { ok: false, erro: r && r.ok === false ? r.frase : 'A junção não foi desfeita.' };
    notificarLancamentosMudaram(clienteId);
    return { ok: true };
  } catch (x) {
    return { ok: false, erro: erroDe(x, 'A junção não foi desfeita.') };
  }
}
