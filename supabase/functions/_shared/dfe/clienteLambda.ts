/**
 * NOTAS-RECEITA-A1-01 · o lado da BORDA da Lambda mTLS (desenho aprovado 16/11, relatório 1750). A borda do Supabase (Deno, rustls) não
 * renegocia TLS e a Receita cobra o certificado por renegociação: o POST com o certificado sai pela Lambda Node `agro-dfe-mtls`.
 *  · a senha e o .pfx NUNCA saem daqui: vai só o par PEM já conferido, cifrado com uma chave AES de uso único que só o KMS da Lambda abre;
 *  · o pedido vai assinado (HMAC + relógio + nonce) e a resposta só vale se vier assinada com o MESMO nonce;
 *  · qualquer falha LANÇA: a `buscarDfe` fecha o pedido como "sem resposta" e o NSU não anda.
 */
import {
  CAB, type AmbienteLambda, type CorpoDaResposta, type CorpoDoPedido, deB64, hex, hmacHex, iguaisHex, JANELA_S, paraB64, textoDaResposta,
  textoDoPedido, VERSAO,
} from './protocoloLambda.ts';

/** a pública do KMS (GetPublicKey): PEM "PUBLIC KEY" ou o DER SPKI em base64 */
export async function importarPublica(texto: string): Promise<CryptoKey> {
  const b64 = texto.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
  return crypto.subtle.importKey('spki', deB64(b64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

export interface PedidoLambda { corpo: string; headers: Record<string, string>; nonce: string }

export async function montarPedidoLambda(o: {
  ambiente: AmbienteLambda; envelope: string; par: { cert: string; key: string }; segredo: string; publica: CryptoKey; agoraSegundos: number;
}): Promise<PedidoLambda> {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = hex(nonceBytes);
  const aesBruta = crypto.getRandomValues(new Uint8Array(32));
  const aes = await crypto.subtle.importKey('raw', aesBruta, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const claro = new TextEncoder().encode(JSON.stringify({ cert: o.par.cert, key: o.par.key }));
  const par = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(nonce) }, aes, claro));
  const chave = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, o.publica, aesBruta));
  aesBruta.fill(0); claro.fill(0);
  const corpoObj: CorpoDoPedido = { v: VERSAO, ambiente: o.ambiente, envelope: o.envelope, chave: paraB64(chave), iv: paraB64(iv), par: paraB64(par) };
  const corpo = JSON.stringify(corpoObj);
  const tempo = String(o.agoraSegundos);
  const assinatura = await hmacHex(o.segredo, await textoDoPedido(tempo, nonce, corpo));
  return { corpo, nonce, headers: { 'Content-Type': 'application/json', [CAB.tempo]: tempo, [CAB.nonce]: nonce, [CAB.assinatura]: assinatura } };
}

export class FalhaDaLambda extends Error {
  constructor(public falha: string) { super(`lambda: ${falha}`); this.name = 'FalhaDaLambda'; }
}

/** confere a resposta e devolve a da Receita; lança `FalhaDaLambda` em tudo o que não for uma resposta assinada e boa */
export async function lerRespostaLambda(o: {
  status: number; tempo: string | null; assinatura: string | null; corpo: string; nonce: string; segredo: string; agoraSegundos: number;
}): Promise<{ status: number; corpo: string }> {
  if (!o.tempo || !o.assinatura || !/^\d{1,12}$/.test(o.tempo)) throw new FalhaDaLambda(o.status === 401 ? 'nao_autorizado' : `sem_assinatura_${o.status}`);
  const esperada = await hmacHex(o.segredo, await textoDaResposta(o.nonce, o.tempo, o.corpo));
  if (!iguaisHex(esperada, o.assinatura)) throw new FalhaDaLambda('assinatura_da_resposta');
  if (Math.abs(o.agoraSegundos - Number(o.tempo)) > JANELA_S * 2) throw new FalhaDaLambda('relogio_da_resposta');
  let r: CorpoDaResposta;
  try { r = JSON.parse(o.corpo); } catch { throw new FalhaDaLambda('resposta_ilegivel'); }
  if (!r || r.ok !== true) throw new FalhaDaLambda(r && r.ok === false && typeof r.falha === 'string' ? r.falha : 'resposta_ilegivel');
  if (!Number.isInteger(r.http) || typeof r.corpo !== 'string') throw new FalhaDaLambda('resposta_ilegivel');
  return { status: r.http, corpo: new TextDecoder().decode(deB64(r.corpo)) };
}
