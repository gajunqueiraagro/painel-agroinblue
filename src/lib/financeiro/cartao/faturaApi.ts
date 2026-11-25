/**
 * CARTAO-FATURA-GRAVAR — a ida ao banco do "Gravar N prontas" e do "Desfazer gravação" (lote 118540: `fn_fatura_cartao_gravar` e
 * `fn_fatura_cartao_desfazer`, ambas com `p_simular`; `fatura_cartao_gravacoes` só leitura por tenant). INJETÁVEL: o teste e a bancada
 * passam a sua; a tela usa a do banco.
 * ⚠ Erro do banco nunca vai cru à tela (OC-ABRIR-LENTO-01): a recusa P0001 da função já é frase pronta ("… Nada foi gravado."); o resto
 *   vira a frase genérica e o texto vai ao console.
 */
import { supabase } from '@/integrations/supabase/client';
import type { ItemDoGravar, PedidoDoGravar } from './gravarDaFatura';

export type Resposta = { ok: true; dados: unknown } | { ok: false; frase: string };
export interface GravacaoViva { id: string; feitaEm: string }

export interface FaturaApi {
  gravar(clienteId: string, contaId: string, fatura: PedidoDoGravar['fatura'], itens: ItemDoGravar[], simular: boolean): Promise<Resposta>;
  desfazer(gravacaoId: string, motivo: string, simular: boolean): Promise<Resposta>;
  /** a gravação VIVA desta fatura (cliente, cartão, md5 do PDF); null = nunca gravada ou desfeita */
  gravacaoViva(clienteId: string, contaId: string, hash: string): Promise<{ ok: true; dados: GravacaoViva | null } | { ok: false; frase: string }>;
}

export const FRASE_NAO_GRAVOU = 'Não consegui falar com o banco. Nada foi gravado.';

function frase(e: { code?: string; message?: string } | null, onde: string): string {
  console.error(`[fatura do cartão] ${onde}`, e);
  return e?.code === 'P0001' && e.message ? e.message : FRASE_NAO_GRAVOU;
}

export const faturaApiDoBanco: FaturaApi = {
  async gravar(clienteId, contaId, fatura, itens, simular) {
    const { data, error } = await (supabase as any).rpc('fn_fatura_cartao_gravar', {
      p_cliente: clienteId, p_conta: contaId, p_fatura: fatura, p_itens: itens, p_simular: simular,
    });
    return error ? { ok: false, frase: frase(error, 'gravar') } : { ok: true, dados: data };
  },
  async desfazer(gravacaoId, motivo, simular) {
    const { data, error } = await (supabase as any).rpc('fn_fatura_cartao_desfazer', { p_gravacao: gravacaoId, p_motivo: motivo, p_simular: simular });
    return error ? { ok: false, frase: frase(error, 'desfazer') } : { ok: true, dados: data };
  },
  async gravacaoViva(clienteId, contaId, hash) {
    const { data, error } = await (supabase as any).from('fatura_cartao_gravacoes').select('id, feita_em')
      .eq('cliente_id', clienteId).eq('conta_bancaria_id', contaId).eq('hash_arquivo', hash).is('desfeita_em', null).limit(1);
    if (error) return { ok: false, frase: frase(error, 'gravação viva') };
    const r: unknown = Array.isArray(data) ? data[0] : null;
    if (r === null || typeof r !== 'object' || !('id' in r) || !('feita_em' in r)) return { ok: true, dados: null };
    const { id, feita_em: feitaEm } = r;
    return typeof id === 'string' && typeof feitaEm === 'string' ? { ok: true, dados: { id, feitaEm } } : { ok: true, dados: null };
  },
};
