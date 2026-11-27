/**
 * OF-IP-FIXO-01 · Lambda `agro-of-saida` — a REGRA, pura (segredos, DynamoDB, rede e log entram por `PecasSaida`).
 * Um cano estreito, no padrão da `agro-dfe-mtls`: confere a assinatura, o relógio e o uso único do pedido; aceita só GET/POST para um
 * CAMINHO permitido no HOST FIXO; põe as credenciais do provedor (que nunca saem da AWS); faz UMA chamada e devolve a resposta assinada.
 * Não decide nada, não guarda nada além do nonce, NÃO LOGA corpo, cabeçalho, caminho, token nem dado de conta: só o resultado, o status, os
 * bytes e o tempo.
 * Ordem: método/caminho da URL → tamanho → cabeçalhos → ASSINATURA → relógio → nonce único → corpo → caminho permitido → credenciais → chamada.
 */
import {
  baseValida, CAB, caminhoPermitido, deB64, hmacHex, iguaisHex, JANELA_S, type MetodoSaida, NONCE_OK, paraB64, type PedidoSaida,
  prefixosPermitidos, type RespostaSaida, TEMPO_OK, textoDaResposta, textoDoPedido, VERSAO_SAIDA,
} from '../../../supabase/functions/_shared/of/protocoloSaida.ts';

export const MAX_CORPO = 64 * 1024;
export const MAX_RESPOSTA = 4 * 1024 * 1024;

export interface EventoUrl {
  body?: string | null; isBase64Encoded?: boolean; rawPath?: string; headers?: Record<string, string | undefined>;
  requestContext?: { http?: { method?: string }; requestId?: string };
}
export interface RespostaUrl { statusCode: number; headers: Record<string, string>; body: string }
export class FalhaDaChamada extends Error {
  constructor(public falha: 'conexao' | 'tempo' | 'tls') { super(falha); this.name = 'FalhaDaChamada'; }
}
/** as credenciais do provedor, do Secrets Manager: cabeçalhos (ex.: Authorization) e, se ele pedir mTLS, o par PEM */
export interface CredenciaisDoProvedor { cabecalhos: Record<string, string>; cert?: string; key?: string }
export interface PecasSaida {
  /** o segredo HMAC atual (e o anterior, durante a troca) */
  segredos(): Promise<string[]>;
  agoraSegundos(): number;
  /** grava o nonce; false = já visto */
  registrarNonce(nonce: string, expiraEm: number): Promise<boolean>;
  credenciais(): Promise<CredenciaisDoProvedor | null>;
  /** a chamada HTTPS (lança `FalhaDaChamada`); o certificado do servidor é SEMPRE conferido */
  chamar(url: string, metodo: MetodoSaida, cabecalhos: Record<string, string>, corpo: string | null,
    par: { cert: string; key: string } | null): Promise<{ status: number; corpo: Uint8Array }>;
  /** a configuração fixa (variáveis da função, nenhuma é segredo) */
  destinoBase: string | undefined;
  caminhosPermitidos: string | undefined;
  log(linha: Record<string, string | number | null>): void;
}

/** os cabeçalhos do provedor: só nome de cabeçalho válido e valor texto; nada de Host, Content-Length, Connection (quem põe é a rede) */
const PROIBIDOS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'te', 'upgrade', 'proxy-authorization']);
export function lerCredenciais(texto: string | undefined): CredenciaisDoProvedor | null {
  try {
    const o: unknown = JSON.parse(texto ?? '');
    if (!o || typeof o !== 'object') return null;
    const cab = Reflect.get(o, 'cabecalhos');
    const cabecalhos: Record<string, string> = {};
    if (cab && typeof cab === 'object') {
      for (const [k, v] of Object.entries(cab)) {
        if (/^[A-Za-z0-9-]{1,64}$/.test(k) && typeof v === 'string' && v.length <= 8192 && !PROIBIDOS.has(k.toLowerCase())) cabecalhos[k] = v;
      }
    }
    const cert = Reflect.get(o, 'cert'); const key = Reflect.get(o, 'key');
    const par = typeof cert === 'string' && cert.includes('BEGIN') && typeof key === 'string' && key.includes('BEGIN') ? { cert, key } : {};
    if (Object.keys(cabecalhos).length === 0 && !('cert' in par)) return null;
    return { cabecalhos, ...par };
  } catch { return null; }
}

export async function atender(ev: EventoUrl, p: PecasSaida): Promise<RespostaUrl> {
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
  const segredos = await p.segredos();
  if (segredos.length === 0) return naoAutorizado('sem_segredo');
  const texto = await textoDoPedido(tempo, nonce, corpo);
  let assinou = false;
  for (const s of segredos) if (iguaisHex(await hmacHex(s, texto), assinatura)) assinou = true;
  if (!assinou) return naoAutorizado('assinatura');
  /* 2. relógio e 3. uso único */
  const agora = p.agoraSegundos();
  if (Math.abs(agora - Number(tempo)) > JANELA_S) return naoAutorizado('relogio');
  if (!(await p.registrarNonce(nonce, agora + 600))) return naoAutorizado('nonce');

  const segredo = segredos[0];
  const responder = async (status: number, r: RespostaSaida, extra: Record<string, string | number | null> = {}): Promise<RespostaUrl> => {
    const body = JSON.stringify(r);
    const t = String(p.agoraSegundos());
    p.log({ req, resultado: 'falha' in r ? r.falha : 'ok', ms: Date.now() - inicio, ...extra });
    return { statusCode: status, body,
      headers: { 'Content-Type': 'application/json', [CAB.tempo]: t, [CAB.assinatura]: await hmacHex(segredo, await textoDaResposta(nonce, t, body)) } };
  };

  let pedido: PedidoSaida;
  try { pedido = JSON.parse(corpo); } catch { return responder(400, { ok: false, falha: 'pedido' }); }
  if (!pedido || pedido.v !== VERSAO_SAIDA || (pedido.metodo !== 'GET' && pedido.metodo !== 'POST')
    || (pedido.corpo !== undefined && typeof pedido.corpo !== 'string') || (pedido.metodo === 'GET' && pedido.corpo !== undefined)) {
    return responder(400, { ok: false, falha: 'pedido' });
  }
  /* 4. o destino: o HOST é fixo (variável da função) e o caminho tem de começar por um prefixo permitido */
  const base = baseValida(p.destinoBase);
  if (!base) return responder(500, { ok: false, falha: 'configuracao' });
  if (!caminhoPermitido(pedido.caminho, prefixosPermitidos(p.caminhosPermitidos))) return responder(422, { ok: false, falha: 'caminho' });
  /* 5. as credenciais do provedor (nunca vieram da borda) */
  const cred = await p.credenciais();
  if (!cred) return responder(500, { ok: false, falha: 'configuracao' });
  const cabecalhos: Record<string, string> = { Accept: 'application/json', ...cred.cabecalhos };
  if (pedido.metodo === 'POST') cabecalhos['Content-Type'] = 'application/json';

  /* 6. UMA chamada */
  try {
    const r = await p.chamar(`${base}${pedido.caminho}`, pedido.metodo, cabecalhos, pedido.corpo ?? null,
      cred.cert && cred.key ? { cert: cred.cert, key: cred.key } : null);
    if (r.corpo.length > MAX_RESPOSTA) return responder(502, { ok: false, falha: 'conexao' }, { http: r.status, bytes_volta: r.corpo.length });
    return responder(200, { ok: true, http: r.status, corpo: paraB64(r.corpo) },
      { metodo: pedido.metodo, http: r.status, bytes_ida: (pedido.corpo ?? '').length, bytes_volta: r.corpo.length });
  } catch (e) {
    return responder(502, { ok: false, falha: e instanceof FalhaDaChamada ? e.falha : 'conexao' });
  }
}
