/**
 * FOLHA-NA-CAIXA-01 — o banco da folha na Caixa: a `fn_folha_recibos_aplicar` (prévia e aplicar), a `fn_folha_recibos_desfazer` e o
 * upload de cada pedaço no bucket `folha-documentos`, no caminho que o aplicar devolveu (contrato do Code 6, §A2). Injetável.
 *
 * ⚠ As recusas são FRASES PRONTAS do banco (P0001/22023/42501): vão à faixa da prévia como vieram, nunca em toast.
 * ⚠ "Já aplicado": o banco hoje recusa com P0001 ("já foi aplicado (desfaça antes…)"); a prévia vira `jaAplicado` (a tela oferece o
 *   Desfazer). Se o banco passar a devolver `ja_aplicado: true` (pedido ao Code 6), o `respostaDaFolha` já lê.
 */
import { supabase } from '@/integrations/supabase/client';
import { respostaDaFolha, type DocumentoDoPedido, type ItemDoPedido, type RespostaDaFolha } from './folhaNaCaixa';

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };
export const BUCKET_DA_FOLHA = 'folha-documentos';
export const FRASE_SEM_BANCO = 'Não consegui falar com o banco. Nada foi gravado.';
export interface Desfeito { valores: number; criados: number; documentos: number }

export interface FolhaCaixaApi {
  aplicar: (clienteId: string, entradaId: string | null, documento: DocumentoDoPedido, itens: ItemDoPedido[], simular: boolean) => Promise<Resultado<RespostaDaFolha>>;
  desfazer: (clienteId: string, md5: string, motivo: string, simular: boolean) => Promise<Resultado<Desfeito>>;
  subir: (storagePath: string, pdf: Uint8Array) => Promise<Resultado<true>>;
}

const ERROS_COM_FRASE = new Set(['P0001', '22023', '42501']);
/** A frase do banco (as recusas da regra); fora delas, a genérica COM O CÓDIGO (Gabriel 24/11 14:13: o erro do NJ veio calado —
 *  "não engula"); o texto cru vai ao console e ao title da faixa (`detalheDoErroDaFolha`). */
export function fraseDoErroDaFolha(e: { code?: string; message?: string } | null): string {
  if (e && e.code && ERROS_COM_FRASE.has(e.code) && e.message) return e.message;
  return e?.code ? `O banco não respondeu à prévia (código ${e.code}). Nada foi gravado — tente de novo; se repetir, avise o suporte com o código.` : FRASE_SEM_BANCO;
}
export const ehJaAplicado = (e: { code?: string; message?: string } | null): boolean => !!e && e.code === 'P0001' && /já foi aplicado/i.test(e.message ?? '');

const VAZIA: RespostaDaFolha = { jaAplicado: true, completar: false, automaticos: [], criar: [], pendencias: [], semRecibo: [], semFuncionario: [], soma: null, documentos: [] };
const inteiro = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

export const folhaCaixaApiDoBanco: FolhaCaixaApi = {
  async aplicar(clienteId, entradaId, documento, itens, simular) {
    const { data, error } = await (supabase as any).rpc('fn_folha_recibos_aplicar', {
      p_cliente: clienteId, p_entrada: entradaId, p_documento: documento, p_itens: itens, p_simular: simular,
    });
    if (error) {
      console.error('[folha na caixa] aplicar', error);
      if (simular && ehJaAplicado(error)) return { ok: true, dados: VAZIA };
      return { ok: false, erro: fraseDoErroDaFolha(error) };
    }
    const r = respostaDaFolha(data);
    return r ? { ok: true, dados: r } : { ok: false, erro: 'O banco respondeu algo que eu não entendi. Nada foi gravado.' };
  },
  async desfazer(clienteId, md5, motivo, simular) {
    const { data, error } = await (supabase as any).rpc('fn_folha_recibos_desfazer', { p_cliente: clienteId, p_md5: md5, p_motivo: motivo, p_simular: simular });
    if (error) { console.error('[folha na caixa] desfazer', error); return { ok: false, erro: fraseDoErroDaFolha(error) }; }
    const d = typeof data === 'object' && data !== null ? data : {};
    return { ok: true, dados: { valores: inteiro(d.valores), criados: inteiro(d.criados), documentos: inteiro(d.documentos) } };
  },
  async subir(storagePath, pdf) {
    const { error } = await supabase.storage.from(BUCKET_DA_FOLHA).upload(storagePath, new Blob([pdf], { type: 'application/pdf' }),
      { contentType: 'application/pdf', upsert: false });
    if (error) { console.error('[folha na caixa] upload', error); return { ok: false, erro: 'O PDF não subiu.' }; }
    return { ok: true, dados: true };
  },
};
