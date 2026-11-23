/**
 * NOTA-PAGA-POR-TERCEIRO-01 · Fatia A (Gabriel 23/11; lote 34) — "Quem paga: Nós · Terceiro" na aba Pagamento.
 * A nota no nome do produtor que o empreiteiro paga e desconta da empreitada: despesa no DRE, nunca saída de banco. A regra e a gravação são
 * do banco (`fn_lancamento_pago_por_terceiro` / `_desfazer`, com `p_simular` = a prévia, trilha `financeiro_pago_por_terceiro`); aqui só a
 * leitura do que volta e a frase da recusa (nunca o erro cru).
 */
import { supabase } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- funções/tabela novas fora dos tipos gerados
const db = () => supabase as any;

export interface EstadoDoPagamento { status: string | null; dataPagamento: string | null; semCaixa: boolean }
export interface PreviaDoTerceiro {
  parceiro: string | null;
  dataPagamento: string | null;
  antes: EstadoDoPagamento;
  depois: EstadoDoPagamento;
  avisos: string[];
  efeitos: string[];
}
export interface PagoPorTerceiroVivo { parceiroId: string; motivo: string; dataPagamento: string; documentoId: string | null; feitoEm: string }
export type RespostaDoTerceiro = { ok: true; previa: PreviaDoTerceiro } | { ok: false; frase: string };

const ehRegistro = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const estado = (v: unknown): EstadoDoPagamento => (ehRegistro(v)
  ? { status: texto(v.status), dataPagamento: texto(v.data_pagamento), semCaixa: v.sem_caixa === true }
  : { status: null, dataPagamento: null, semCaixa: false });

/** a resposta da função (prévia ou gravação) → a prévia; fora do formato = nulo (quem chama trata como falha) */
export function lerPreviaDoTerceiro(d: unknown): PreviaDoTerceiro | null {
  if (!ehRegistro(d) || d.ok !== true) return null;
  return { parceiro: texto(d.parceiro), dataPagamento: texto(d.data_pagamento), antes: estado(d.antes), depois: estado(d.depois),
    avisos: textos(d.avisos), efeitos: textos(d.efeitos) };
}

/** só a SAÍDA ainda não paga escolhe "quem paga" (a paga por nós já saiu do banco) */
export const podeEscolherQuemPaga = (tipoOperacao: string | null | undefined, status: string | null | undefined): boolean =>
  tipoOperacao === '2-Saídas' && status !== 'realizado' && status !== 'conciliado';

const frase = (error: { code?: string; message?: string } | null, padrao: string): string =>
  (error?.code === 'P0001' && error.message ? error.message : padrao);

export async function lerPagoPorTerceiro(lancamentoId: string): Promise<PagoPorTerceiroVivo | null> {
  const { data, error } = await db().from('financeiro_pago_por_terceiro')
    .select('parceiro_id, motivo, data_pagamento, documento_id, feito_em').eq('lancamento_id', lancamentoId).is('desfeito_em', null).maybeSingle();
  if (error || !ehRegistro(data)) return null;
  const parceiroId = texto(data.parceiro_id); const motivo = texto(data.motivo); const dataPagamento = texto(data.data_pagamento); const feitoEm = texto(data.feito_em);
  return parceiroId && motivo && dataPagamento && feitoEm ? { parceiroId, motivo, dataPagamento, documentoId: texto(data.documento_id), feitoEm } : null;
}

export async function marcarPagoPorTerceiro(a: { lancamentoId: string; parceiroId: string; motivo: string; data: string | null; documentoId: string | null },
  simular: boolean): Promise<RespostaDoTerceiro> {
  const { data, error } = await db().rpc('fn_lancamento_pago_por_terceiro', {
    p_lancamento: a.lancamentoId, p_parceiro: a.parceiroId, p_motivo: a.motivo, p_data: a.data || null, p_documento: a.documentoId || null, p_simular: simular,
  });
  if (error) { console.error('[marcarPagoPorTerceiro]', error); return { ok: false, frase: frase(error, 'Não consegui marcar agora. Nada foi gravado; tente de novo.') }; }
  const previa = lerPreviaDoTerceiro(data);
  return previa ? { ok: true, previa } : { ok: false, frase: 'Não consegui ler a resposta. Nada foi gravado; tente de novo.' };
}

export async function desfazerPagoPorTerceiro(lancamentoId: string, motivo: string, simular: boolean): Promise<RespostaDoTerceiro> {
  const { data, error } = await db().rpc('fn_lancamento_pago_por_terceiro_desfazer', { p_lancamento: lancamentoId, p_motivo: motivo, p_simular: simular });
  if (error) { console.error('[desfazerPagoPorTerceiro]', error); return { ok: false, frase: frase(error, 'Não consegui desfazer agora. Nada foi gravado; tente de novo.') }; }
  const previa = lerPreviaDoTerceiro(data);
  return previa ? { ok: true, previa } : { ok: false, frase: 'Não consegui ler a resposta. Nada foi gravado; tente de novo.' };
}
