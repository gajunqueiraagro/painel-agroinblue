/**
 * NOTAS-RECEITA-A1-01 · Lambda `agro-dfe-mtls` — a REGRA, pura (KMS, segredo, DynamoDB, rede e log entram por `PecasLambda`).
 * Desenho aprovado 16/11 (relatório 1750). Um cano estreito: confere o pedido, abre o par só na memória, faz UM POST para o destino FIXO e
 * devolve a resposta assinada. Não decide nada, não guarda nada além do nonce, não loga conteúdo.
 * Ordem: método/caminho → tamanho → ASSINATURA → relógio → nonce único (só então o KMS) → corpo → envelope → desembrulha → certificado
 * → POST → resposta assinada.
 */
import { X509Certificate } from 'node:crypto';
import {
  CAB, type AmbienteLambda, type CorpoDaResposta, type CorpoDoPedido, deB64, DESTINOS, DESTINOS_EVENTO, type FalhaLambda, hmacHex, iguaisHex,
  JANELA_S, NONCE_OK, paraB64, type ServicoLambda, TEMPO_OK, textoDaResposta, textoDoPedido, VERSAO,
} from '../../../supabase/functions/_shared/dfe/protocoloLambda.ts';

export const MAX_CORPO = 64 * 1024;
/* Lambda v2: o evento assinado leva o certificado da folha (~2–3 KB em base64) — 4 KB não cabia */
export const MAX_ENVELOPE = 12 * 1024;
export const MAX_RESPOSTA = 4 * 1024 * 1024;

export interface EventoUrl {
  body?: string | null; isBase64Encoded?: boolean; rawPath?: string; headers?: Record<string, string | undefined>;
  requestContext?: { http?: { method?: string }; requestId?: string };
}
export interface RespostaUrl { statusCode: number; headers: Record<string, string>; body: string }
export class FalhaDoPost extends Error {
  constructor(public falha: 'conexao' | 'tempo' | 'tls') { super(falha); this.name = 'FalhaDoPost'; }
}
export interface PecasLambda {
  /** o segredo HMAC atual (e o anterior, durante a troca) */
  segredos(): Promise<string[]>;
  agoraSegundos(): number;
  /** grava o nonce; false = já visto */
  registrarNonce(nonce: string, expiraEm: number): Promise<boolean>;
  /** kms:Decrypt RSAES_OAEP_SHA_256 */
  desembrulhar(chave: Uint8Array): Promise<Uint8Array>;
  /** o POST mTLS (lança `FalhaDoPost`) */
  postar(url: string, par: { cert: string; key: string }, envelope: string, servico: ServicoLambda): Promise<{ status: number; corpo: Uint8Array }>;
  log(linha: Record<string, string | number | null>): void;
}

/** o envelope só pode ser a consulta de Distribuição DF-e 1.01 do próprio titular, no ambiente pedido — a FORMA INTEIRA, ancorada
 *  (a mesma que a `envelopeDistDFe` monta): nada a mais passa */
const ENVELOPE = new RegExp('^' + [
  '<\\?xml version="1\\.0" encoding="utf-8"\\?>',
  '<soap12:Envelope xmlns:xsi="http://www\\.w3\\.org/2001/XMLSchema-instance" xmlns:xsd="http://www\\.w3\\.org/2001/XMLSchema" ',
  'xmlns:soap12="http://www\\.w3\\.org/2003/05/soap-envelope"><soap12:Body>',
  '<nfeDistDFeInteresse xmlns="http://www\\.portalfiscal\\.inf\\.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>',
  '<distDFeInt xmlns="http://www\\.portalfiscal\\.inf\\.br/nfe" versao="1\\.01"><tpAmb>([12])</tpAmb><cUFAutor>(\\d{2})</cUFAutor>',
  '<(CPF|CNPJ)>(\\d{11}|\\d{14})</\\3>',
  '(?:<distNSU><ultNSU>\\d{15}</ultNSU></distNSU>|<consNSU><NSU>\\d{15}</NSU></consNSU>|<consChNFe><chNFe>\\d{44}</chNFe></consChNFe>)',
  '</distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>',
].join('') + '$');
/** Lambda v2 (CIÊNCIA, Gabriel 18/11: "só envEvento 210210, travado na própria Lambda") — o 2º e ÚLTIMO formato: o envEvento 1.00 de UM
 *  evento, Ambiente Nacional (cOrgao 91), tpEvento 210210 e "Ciencia da Operacao" LITERAIS (Confirmação 210200, Desconhecimento 210220 e
 *  Não realizada 210240 não casam), nSeq 1, a mesma chave no Id, no chNFe e na Reference, e a assinatura no padrão da NF-e. A FORMA INTEIRA,
 *  ancorada (a mesma que a `envelopeCiencia` monta): nada a mais passa. Grupos: 1 chave · 2 tpAmb · 3 CPF|CNPJ · 4 documento. */
const B64 = '[A-Za-z0-9+/]+={0,2}';
const ENVELOPE_EVENTO = new RegExp('^' + [
  '<\\?xml version="1\\.0" encoding="utf-8"\\?>',
  '<soap12:Envelope xmlns:xsi="http://www\\.w3\\.org/2001/XMLSchema-instance" xmlns:xsd="http://www\\.w3\\.org/2001/XMLSchema" ',
  'xmlns:soap12="http://www\\.w3\\.org/2003/05/soap-envelope"><soap12:Body>',
  '<nfeDadosMsg xmlns="http://www\\.portalfiscal\\.inf\\.br/nfe/wsdl/NFeRecepcaoEvento4">',
  '<envEvento xmlns="http://www\\.portalfiscal\\.inf\\.br/nfe" versao="1\\.00"><idLote>\\d{1,15}</idLote>',
  '<evento versao="1\\.00"><infEvento Id="ID210210(\\d{44})01"><cOrgao>91</cOrgao><tpAmb>([12])</tpAmb>',
  '<(CPF|CNPJ)>(\\d{11}|\\d{14})</\\3><chNFe>\\1</chNFe>',
  '<dhEvento>\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}[-+]\\d{2}:\\d{2}</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento>',
  '<verEvento>1\\.00</verEvento><detEvento versao="1\\.00"><descEvento>Ciencia da Operacao</descEvento></detEvento></infEvento>',
  '<Signature xmlns="http://www\\.w3\\.org/2000/09/xmldsig#"><SignedInfo>',
  '<CanonicalizationMethod Algorithm="http://www\\.w3\\.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>',
  '<SignatureMethod Algorithm="http://www\\.w3\\.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>',
  '<Reference URI="#ID210210(?:\\1)01"><Transforms><Transform Algorithm="http://www\\.w3\\.org/2000/09/xmldsig#enveloped-signature"></Transform>',
  '<Transform Algorithm="http://www\\.w3\\.org/TR/2001/REC-xml-c14n-20010315"></Transform></Transforms>',
  '<DigestMethod Algorithm="http://www\\.w3\\.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>[A-Za-z0-9+/]{27}=</DigestValue></Reference>',
  `</SignedInfo><SignatureValue>${B64}</SignatureValue><KeyInfo><X509Data><X509Certificate>${B64}</X509Certificate></X509Data></KeyInfo>`,
  '</Signature></evento></envEvento></nfeDadosMsg></soap12:Body></soap12:Envelope>',
].join('') + '$');

export function conferirEnvelope(envelope: unknown, ambiente: AmbienteLambda):
  { ok: true; documento: string; servico: ServicoLambda } | { ok: false } {
  if (typeof envelope !== 'string' || envelope.length === 0 || envelope.length > MAX_ENVELOPE) return { ok: false };
  const tpAmb = ambiente === 'producao' ? '1' : '2';
  const m = envelope.match(ENVELOPE);
  if (m) {
    if (m[1] !== tpAmb || (m[3] === 'CPF') !== (m[4].length === 11)) return { ok: false };
    return { ok: true, documento: m[4], servico: 'distribuicao' };
  }
  const e = envelope.match(ENVELOPE_EVENTO);
  if (e) {
    if (e[2] !== tpAmb || (e[3] === 'CPF') !== (e[4].length === 11)) return { ok: false };
    return { ok: true, documento: e[4], servico: 'evento' };
  }
  return { ok: false };
}

/** o documento do certificado: o CN "NOME:CPF" (ou ":CNPJ") da folha */
export function documentoDoCertificado(pem: string): string | null {
  try {
    const cn = new X509Certificate(pem).subject.split('\n').find((l) => l.startsWith('CN='));
    const m = cn?.match(/:(\d{11}|\d{14})$/);
    return m ? m[1] : null;
  } catch { return null; }
}

export async function atender(ev: EventoUrl, p: PecasLambda): Promise<RespostaUrl> {
  const inicio = Date.now();
  const req = ev.requestContext?.requestId ?? null;
  const naoAutorizado = (motivo: string): RespostaUrl => {
    p.log({ req, resultado: 'nao_autorizado', motivo });
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, falha: 'nao_autorizado' }) };
  };
  if (ev.requestContext?.http?.method !== 'POST' || (ev.rawPath ?? '/') !== '/') return naoAutorizado('metodo');
  const bruto = typeof ev.body === 'string' ? ev.body : '';
  if (bruto.length === 0 || bruto.length > MAX_CORPO * 2) return naoAutorizado('tamanho');
  const corpo = ev.isBase64Encoded ? new TextDecoder().decode(deB64(bruto)) : bruto;
  if (corpo.length > MAX_CORPO) return naoAutorizado('tamanho');
  const h = ev.headers ?? {};
  const tempo = h[CAB.tempo] ?? ''; const nonce = h[CAB.nonce] ?? ''; const assinatura = h[CAB.assinatura] ?? '';
  if (!TEMPO_OK.test(tempo) || !NONCE_OK.test(nonce) || !/^[0-9a-f]{64}$/.test(assinatura)) return naoAutorizado('cabecalho');

  /* 1. assinatura (antes de qualquer outra coisa) */
  const texto = await textoDoPedido(tempo, nonce, corpo);
  let assinou = false;
  for (const s of await p.segredos()) if (iguaisHex(await hmacHex(s, texto), assinatura)) assinou = true;
  if (!assinou) return naoAutorizado('assinatura');
  /* 2. relógio e 3. uso único — só então o KMS */
  const agora = p.agoraSegundos();
  if (Math.abs(agora - Number(tempo)) > JANELA_S) return naoAutorizado('relogio');
  if (!(await p.registrarNonce(nonce, agora + 600))) return naoAutorizado('nonce');

  const segredo = (await p.segredos())[0];
  let ambiente: AmbienteLambda | null = null;
  const responder = async (status: number, r: CorpoDaResposta, extra: Record<string, string | number | null> = {}): Promise<RespostaUrl> => {
    const body = JSON.stringify(r);
    const t = String(p.agoraSegundos());
    p.log({ req, ambiente, resultado: 'falha' in r ? r.falha : 'ok', ms: Date.now() - inicio, ...extra });
    return { statusCode: status, body,
      headers: { 'Content-Type': 'application/json', [CAB.tempo]: t, [CAB.assinatura]: await hmacHex(segredo, await textoDaResposta(nonce, t, body)) } };
  };

  let pedido: CorpoDoPedido;
  try { pedido = JSON.parse(corpo); } catch { return responder(400, { ok: false, falha: 'pedido' }); }
  if (!pedido || pedido.v !== VERSAO || (pedido.ambiente !== 'producao' && pedido.ambiente !== 'homologacao')
    || typeof pedido.chave !== 'string' || typeof pedido.iv !== 'string' || typeof pedido.par !== 'string') {
    return responder(400, { ok: false, falha: 'pedido' });
  }
  ambiente = pedido.ambiente;
  const env = conferirEnvelope(pedido.envelope, pedido.ambiente);
  if (env.ok === false) return responder(422, { ok: false, falha: 'envelope' });

  /* 4. o par, só na memória */
  let par: { cert: string; key: string };
  let aesBruta: Uint8Array | null = null;
  try {
    aesBruta = await p.desembrulhar(deB64(pedido.chave));
    const aes = await crypto.subtle.importKey('raw', aesBruta, 'AES-GCM', false, ['decrypt']);
    const claro = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: deB64(pedido.iv), additionalData: new TextEncoder().encode(nonce) }, aes, deB64(pedido.par)));
    const lido: unknown = JSON.parse(new TextDecoder().decode(claro));
    claro.fill(0);
    const cert = lido && typeof lido === 'object' ? Reflect.get(lido, 'cert') : null;
    const key = lido && typeof lido === 'object' ? Reflect.get(lido, 'key') : null;
    if (typeof cert !== 'string' || typeof key !== 'string') throw new Error('par');
    par = { cert, key };
  } catch {
    return responder(422, { ok: false, falha: 'certificado' });
  } finally { aesBruta?.fill(0); }
  if (documentoDoCertificado(par.cert) !== env.documento) return responder(422, { ok: false, falha: 'certificado' });

  /* 5. UM POST, destino fixo */
  try {
    /* Lambda v2: o destino segue FIXO — o da Distribuição ou o da Recepção de Evento, pelo formato que a regra reconheceu */
    const destino = env.servico === 'evento' ? DESTINOS_EVENTO[pedido.ambiente] : DESTINOS[pedido.ambiente];
    const r = await p.postar(destino, par, pedido.envelope, env.servico);
    if (r.corpo.length > MAX_RESPOSTA) return responder(502, { ok: false, falha: 'conexao' }, { http: r.status, bytes_volta: r.corpo.length });
    return responder(200, { ok: true, http: r.status, corpo: paraB64(r.corpo) },
      { servico: env.servico, http: r.status, bytes_ida: pedido.envelope.length, bytes_volta: r.corpo.length });
  } catch (e) {
    return responder(502, { ok: false, falha: e instanceof FalhaDoPost ? e.falha : 'conexao' });
  } finally { par = { cert: '', key: '' }; }
}

export type { FalhaLambda };
