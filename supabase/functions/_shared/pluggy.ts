/**
 * OPENFINANCE-PILOTO-01 · P2 — a borda da Pluggy (Gabriel 16/11 11:24: as contas reais dependem do webhook não-localhost).
 * As REGRAS moram aqui, puras (a rede e o banco entram como peças: `Busca`, `registrar`, …) e são provadas no vitest
 * (`src/lib/openfinance/pluggyBorda.test.ts`). Os `index.ts` das três funções só ligam as peças reais.
 *
 *  · `openfinance-webhook`   — PÚBLICA (sem JWT do Supabase: a Pluggy não tem). Confere o cabeçalho secreto (comparação de tempo
 *    constante) e o `clientId`; grava SÓ O AVISO, com os campos de uma lista fechada, na fila `openfinance_eventos` (118120) e responde
 *    2XX em < 10 s. NÃO grava transação: quem lê os dados é a busca com a API key, depois.
 *  · `openfinance-conectar`  — o usuário logado (admin AgroinBlue ou gestor do cliente) pede o connect token de 30 min para o Widget;
 *    `clientUserId` = o id do cliente (o `item/created` volta com ele). A API key (2 h) nasce e morre aqui; nunca vai à tela.
 *  · `openfinance-webhook-registrar` — SÓ o admin AgroinBlue: cria na Pluggy o webhook `all` com o cabeçalho secreto (a doc: "headers
 *    só pela API"). Idempotente: se a URL já está lá, não cria outro. A resposta nunca devolve o cabeçalho.
 * ⚠ Segredos (PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_WEBHOOK_SEGREDO) só nos secrets das Edge Functions do proto; nada aqui loga
 *    corpo, cabeçalho, chave nem token.
 */

export const PLUGGY_BASE = 'https://api.pluggy.ai';
/** o cabeçalho que a Pluggy manda em todo aviso (registrado pelo `openfinance-webhook-registrar`) */
export const CABECALHO_SEGREDO = 'x-agroinblue-webhook';

export type Busca = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; status: number; frase: string };

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const objeto = (v: unknown): Record<string, unknown> | null => (ehObjeto(v) ? v : null);
const texto = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);

/** compara sem vazar pelo tempo onde a diferença está (o tamanho diferente já recusa) */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** `POST /auth` → API key. Erro da Pluggy = frase pronta (nunca o corpo dela, que pode ecoar o pedido). */
export async function chaveDaApi(busca: Busca, clientId: string, clientSecret: string): Promise<Resultado<string>> {
  let r;
  try {
    r = await busca(`${PLUGGY_BASE}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret }) });
  } catch { return { ok: false, status: 502, frase: 'Não consegui falar com a Pluggy agora. Tente de novo.' }; }
  if (!r.ok) return { ok: false, status: 502, frase: 'A Pluggy recusou as credenciais do AgroinBlue (confira os secrets do proto).' };
  const apiKey = texto(objeto(await r.json())?.apiKey, 4096);
  return apiKey ? { ok: true, valor: apiKey } : { ok: false, status: 502, frase: 'A Pluggy não devolveu a chave.' };
}

/** `POST /connect_token` (30 min) com o cliente como `clientUserId`; `avoidDuplicates` evita 2 itens do mesmo banco/CPF. */
export async function pedirConnectToken(busca: Busca, apiKey: string, clienteId: string): Promise<Resultado<string>> {
  let r;
  try {
    r = await busca(`${PLUGGY_BASE}/connect_token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({ options: { clientUserId: clienteId, avoidDuplicates: true } }),
    });
  } catch { return { ok: false, status: 502, frase: 'Não consegui falar com a Pluggy agora. Tente de novo.' }; }
  if (!r.ok) return { ok: false, status: 502, frase: 'A Pluggy não abriu a conexão agora. Tente de novo.' };
  const token = texto(objeto(await r.json())?.accessToken, 8192);
  return token ? { ok: true, valor: token } : { ok: false, status: 502, frase: 'A Pluggy não devolveu o token de conexão.' };
}

/** Cria o webhook `all` com o cabeçalho secreto; se já existe um para a MESMA URL, não cria outro. Nunca devolve os headers. */
export async function registrarWebhook(busca: Busca, apiKey: string, url: string, segredo: string):
  Promise<Resultado<{ id: string; jaExistia: boolean }>> {
  const h = { 'Content-Type': 'application/json', 'X-API-KEY': apiKey };
  try {
    const lista = await busca(`${PLUGGY_BASE}/webhooks`, { method: 'GET', headers: h });
    if (!lista.ok) return { ok: false, status: 502, frase: 'Não consegui ler os webhooks da Pluggy.' };
    const resultados = objeto(await lista.json())?.results;
    const achado = Array.isArray(resultados) ? resultados.map(objeto).find((w) => w?.url === url) : null;
    if (achado) return { ok: true, valor: { id: String(achado.id ?? ''), jaExistia: true } };
    const r = await busca(`${PLUGGY_BASE}/webhooks`, {
      method: 'POST', headers: h, body: JSON.stringify({ url, event: 'all', headers: { [CABECALHO_SEGREDO]: segredo } }),
    });
    if (!r.ok) return { ok: false, status: 502, frase: 'A Pluggy recusou o webhook (a URL tem de ser https pública).' };
    const id = texto(objeto(await r.json())?.id, 64);
    return id ? { ok: true, valor: { id, jaExistia: false } } : { ok: false, status: 502, frase: 'A Pluggy não devolveu o id do webhook.' };
  } catch { return { ok: false, status: 502, frase: 'Não consegui falar com a Pluggy agora. Tente de novo.' }; }
}

/** O aviso que se guarda: só estes campos (lista fechada); o resto do corpo — links, ids de transação — não entra. */
export interface AvisoPluggy {
  origem: 'pluggy_webhook';
  evento: string; event_id: string | null; item_id: string | null; account_id: string | null; client_user_id: string | null;
  connector_id: string | null; triggered_by: string | null; n_transacoes: number | null; erro_codigo: string | null; ip: string | null;
}
export function avisoDoCorpo(corpo: unknown, ip: string | null): AvisoPluggy | null {
  const c = objeto(corpo);
  const evento = texto(c?.event, 80);
  if (!c || !evento || !/^[a-z_]+\/[a-z_]+$/.test(evento)) return null;
  const ids = Array.isArray(c.transactionIds) ? c.transactionIds.length : null;
  return {
    origem: 'pluggy_webhook', evento,
    event_id: texto(c.eventId, 128), item_id: texto(c.itemId, 128), account_id: texto(c.accountId, 128),
    client_user_id: texto(c.clientUserId, 128), connector_id: c.connectorId == null ? null : String(c.connectorId).slice(0, 32),
    triggered_by: texto(c.triggeredBy, 32), n_transacoes: numero(c.transactionsCount) ?? ids,
    erro_codigo: texto(objeto(c.error)?.code, 64), ip: ip ? ip.slice(0, 64) : null,
  };
}

/**
 * O aviso da Pluggy, na ordem: configuração → cabeçalho secreto (401: a Pluggy não tenta de novo) → corpo (400) → `clientId` de outro
 * app (200 ignorado, sem gravar: a doc manda ignorar) → grava (falhou = 500: a Pluggy tenta de novo em 15 min e 2 h).
 */
export async function receberAviso(p: {
  segredo: string | null | undefined; segredoRecebido: string | null; clientIdEsperado: string | null | undefined;
  corpo: unknown; ip: string | null; registrar: (a: AvisoPluggy) => Promise<boolean>;
}): Promise<{ status: number; corpo: { ok: boolean; motivo?: string } }> {
  if (!p.segredo || !p.clientIdEsperado) return { status: 503, corpo: { ok: false, motivo: 'configuracao' } };
  if (!p.segredoRecebido || !iguaisEmTempoConstante(p.segredoRecebido, p.segredo)) return { status: 401, corpo: { ok: false, motivo: 'segredo' } };
  const aviso = avisoDoCorpo(p.corpo, p.ip);
  if (!aviso) return { status: 400, corpo: { ok: false, motivo: 'corpo' } };
  const clientId = objeto(p.corpo)?.clientId;
  if (clientId != null && clientId !== p.clientIdEsperado) return { status: 200, corpo: { ok: true, motivo: 'outro_app' } };
  let gravou = false;
  try { gravou = await p.registrar(aviso); } catch { gravou = false; }
  return gravou ? { status: 200, corpo: { ok: true } } : { status: 500, corpo: { ok: false, motivo: 'fila' } };
}

/** O connect token, na ordem: quem é (401) → o cliente (400) → pode (403: admin ou gestor do cliente) → configuração → Pluggy → trilha. */
export interface PecasConectar {
  autorDoToken: (token: string) => Promise<string | null>;
  podeConectar: (autor: string, clienteId: string) => Promise<boolean>;
  credenciais: () => { clientId: string; clientSecret: string } | null;
  busca: Busca;
  registrar: (a: { origem: 'agroinblue'; evento: 'agroinblue/connect_token'; client_user_id: string; autor: string }) => Promise<boolean>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function conectar(pedido: { token: string | null; clienteId: unknown }, pecas: PecasConectar):
  Promise<{ status: number; corpo: { ok: boolean; accessToken?: string; frase?: string } }> {
  const autor = pedido.token ? await pecas.autorDoToken(pedido.token) : null;
  if (!autor) return { status: 401, corpo: { ok: false, frase: 'Entre de novo no sistema.' } };
  const clienteId = typeof pedido.clienteId === 'string' && UUID.test(pedido.clienteId) ? pedido.clienteId : null;
  if (!clienteId) return { status: 400, corpo: { ok: false, frase: 'Escolha o cliente.' } };
  if (!(await pecas.podeConectar(autor, clienteId))) return { status: 403, corpo: { ok: false, frase: 'Só o gestor do cliente ou a AgroinBlue conecta um banco.' } };
  const cred = pecas.credenciais();
  if (!cred) return { status: 503, corpo: { ok: false, frase: 'O Open Finance ainda não está configurado neste ambiente.' } };
  const chave = await chaveDaApi(pecas.busca, cred.clientId, cred.clientSecret);
  if (chave.ok === false) return { status: chave.status, corpo: { ok: false, frase: chave.frase } };
  const t = await pedirConnectToken(pecas.busca, chave.valor, clienteId);
  if (t.ok === false) return { status: t.status, corpo: { ok: false, frase: t.frase } };
  if (!(await pecas.registrar({ origem: 'agroinblue', evento: 'agroinblue/connect_token', client_user_id: clienteId, autor }))) {
    return { status: 500, corpo: { ok: false, frase: 'Não consegui registrar o pedido; nada foi aberto.' } };
  }
  return { status: 200, corpo: { ok: true, accessToken: t.valor } };
}
