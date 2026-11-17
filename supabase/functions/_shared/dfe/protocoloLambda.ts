/**
 * NOTAS-RECEITA-A1-01 · Lambda mTLS — o PROTOCOLO entre a borda `fiscal-dfe-buscar` (Supabase) e a Lambda `agro-dfe-mtls` (AWS sa-east-1).
 * Desenho aprovado pelo Gabriel 16/11 (relatório 1750): par PEM cifrado com KMS, Function URL + HMAC, DynamoDB só para o nonce.
 * Este arquivo é usado pelos DOIS lados (a Lambda o empacota pelo esbuild); só WebCrypto, sem nada de Node nem de Deno.
 *  · pedido: corpo JSON { v:1, ambiente, envelope, chave, iv, par } — `chave` = a chave AES-256 de uso único embrulhada com a pública
 *    do KMS (RSA-OAEP-SHA-256); `par` = AES-GCM do JSON {cert,key}, com o NONCE como dado adicional (não se reaproveita noutro pedido);
 *  · cabeçalhos x-agro-tempo / x-agro-nonce / x-agro-assinatura = HMAC-SHA-256(segredo, "POST\n/\n<tempo>\n<nonce>\n<sha256 do corpo>");
 *  · resposta assinada: HMAC(segredo, "RESP\n<nonce do pedido>\n<tempo>\n<sha256 do corpo>").
 */
export const VERSAO = 1;
export const JANELA_S = 60;
export const CAB = { tempo: 'x-agro-tempo', nonce: 'x-agro-nonce', assinatura: 'x-agro-assinatura' } as const;
/** os ÚNICOS destinos: a Lambda nunca recebe o endereço no pedido */
export const DESTINOS = {
  producao: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  homologacao: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
} as const;
export type AmbienteLambda = keyof typeof DESTINOS;
export type FalhaLambda = 'nao_autorizado' | 'pedido' | 'envelope' | 'certificado' | 'conexao' | 'tempo' | 'tls' | 'interno';

export interface CorpoDoPedido { v: number; ambiente: AmbienteLambda; envelope: string; chave: string; iv: string; par: string }
export type CorpoDaResposta = { ok: true; http: number; corpo: string } | { ok: false; falha: FalhaLambda };

const enc = new TextEncoder();
export const hex = (b: ArrayBuffer | Uint8Array) => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
export const paraB64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
export const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function sha256Hex(texto: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
}
async function chaveHmac(segredo: string) {
  return crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
export async function hmacHex(segredo: string, texto: string): Promise<string> {
  return hex(await crypto.subtle.sign('HMAC', await chaveHmac(segredo), enc.encode(texto)));
}
export const textoDoPedido = async (tempo: string, nonce: string, corpo: string) => `POST\n/\n${tempo}\n${nonce}\n${await sha256Hex(corpo)}`;
export const textoDaResposta = async (nonce: string, tempo: string, corpo: string) => `RESP\n${nonce}\n${tempo}\n${await sha256Hex(corpo)}`;

/** comparação de hex em tempo constante (mesmo tamanho) */
export function iguaisHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export const NONCE_OK = /^[0-9a-f]{32}$/;
export const TEMPO_OK = /^\d{1,12}$/;
