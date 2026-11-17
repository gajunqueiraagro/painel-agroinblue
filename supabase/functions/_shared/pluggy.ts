/**
 * OPENFINANCE-PILOTO-01 · P2 — a borda da Pluggy (Gabriel 16/11 11:24: as contas reais dependem do webhook não-localhost).
 * As REGRAS moram aqui, puras (a rede e o banco entram como peças: `Busca`, `registrar`, …) e são provadas no vitest
 * (`src/lib/openfinance/pluggyBorda.test.ts`). Os `index.ts` das três funções só ligam as peças reais.
 *
 *  · `openfinance-webhook`   — PÚBLICA (sem JWT do Supabase: a Pluggy não tem). Confere o cabeçalho secreto (comparação de tempo
 *    constante) e o `clientId`; grava SÓ O AVISO, com os campos de uma lista fechada, na fila `openfinance_eventos` (118120) e responde
 *    2XX em < 10 s. NÃO grava transação: quem lê os dados é a busca com a API key, depois.
 *  · `openfinance-conectar`  — o usuário logado (admin AGROinBLUE ou gestor do cliente) pede o connect token de 30 min para o Widget;
 *    `clientUserId` = o id do cliente (o `item/created` volta com ele). A API key (2 h) nasce e morre aqui; nunca vai à tela.
 *  · `openfinance-webhook-registrar` — SÓ o admin AGROinBLUE: cria na Pluggy o webhook `all` com o cabeçalho secreto (a doc: "headers
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
  if (!r.ok) return { ok: false, status: 502, frase: 'A Pluggy recusou as credenciais do AGROinBLUE (confira os secrets do proto).' };
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

/**
 * OPENFINANCE-SEG-01 (a) — SÓ o Open Finance REGULADO: o consentimento é dado no app do banco (OAuth); o AGROinBLUE nunca vê nem pede
 * login/senha. `GET /connectors?isOpenFinance=true` e, por garantia, só o que vem com `isOpenFinance` E `oauth` verdadeiros e SEM campo
 * de senha. O Widget abre preso a esta lista (`connectorIds`); lista vazia = não abre (nunca cai para os conectores diretos).
 */
export function conectorRegulado(c: unknown): number | null {
  const o = objeto(c);
  if (!o || o.isOpenFinance !== true || o.oauth !== true || typeof o.id !== 'number') return null;
  const creds = Array.isArray(o.credentials) ? o.credentials.map(objeto) : [];
  if (creds.some((k) => k?.type === 'password')) return null;
  return o.id;
}
export async function conectoresOpenFinance(busca: Busca, apiKey: string): Promise<Resultado<number[]>> {
  let r;
  try {
    r = await busca(`${PLUGGY_BASE}/connectors?isOpenFinance=true&countries=BR`, { method: 'GET', headers: { 'X-API-KEY': apiKey } });
  } catch { return { ok: false, status: 502, frase: 'Não consegui falar com a Pluggy agora. Tente de novo.' }; }
  if (!r.ok) return { ok: false, status: 502, frase: 'Não consegui ler os bancos do Open Finance agora. Tente de novo.' };
  const lista = objeto(await r.json())?.results;
  const ids = (Array.isArray(lista) ? lista : []).map(conectorRegulado).filter((n): n is number => n !== null);
  return ids.length > 0 ? { ok: true, valor: ids }
    : { ok: false, status: 502, frase: 'A Pluggy não devolveu nenhum banco do Open Finance; nada foi aberto.' };
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
  Promise<{ status: number; corpo: { ok: boolean; accessToken?: string; connectorIds?: number[]; frase?: string } }> {
  const autor = pedido.token ? await pecas.autorDoToken(pedido.token) : null;
  if (!autor) return { status: 401, corpo: { ok: false, frase: 'Entre de novo no sistema.' } };
  const clienteId = typeof pedido.clienteId === 'string' && UUID.test(pedido.clienteId) ? pedido.clienteId : null;
  if (!clienteId) return { status: 400, corpo: { ok: false, frase: 'Escolha o cliente.' } };
  if (!(await pecas.podeConectar(autor, clienteId))) return { status: 403, corpo: { ok: false, frase: 'Só o gestor do cliente ou a AGROinBLUE conecta um banco.' } };
  const cred = pecas.credenciais();
  if (!cred) return { status: 503, corpo: { ok: false, frase: 'O Open Finance ainda não está configurado neste ambiente.' } };
  const chave = await chaveDaApi(pecas.busca, cred.clientId, cred.clientSecret);
  if (chave.ok === false) return { status: chave.status, corpo: { ok: false, frase: chave.frase } };
  const regulados = await conectoresOpenFinance(pecas.busca, chave.valor);
  if (regulados.ok === false) return { status: regulados.status, corpo: { ok: false, frase: regulados.frase } };
  const t = await pedirConnectToken(pecas.busca, chave.valor, clienteId);
  if (t.ok === false) return { status: t.status, corpo: { ok: false, frase: t.frase } };
  if (!(await pecas.registrar({ origem: 'agroinblue', evento: 'agroinblue/connect_token', client_user_id: clienteId, autor }))) {
    return { status: 500, corpo: { ok: false, frase: 'Não consegui registrar o pedido; nada foi aberto.' } };
  }
  return { status: 200, corpo: { ok: true, accessToken: t.valor, connectorIds: regulados.valor } };
}

/**
 * OPENFINANCE-SEG-01 (b)+(c) — DESCONECTAR: só o admin AGROinBLUE. A conexão é PRESA A UM CLIENTE: o item tem o `clientUserId` que o NOSSO
 * connect token gravou; item de outro cliente (ou sem cliente) = 409, nada apagado. Apaga o item na Pluggy (`DELETE /items/{id}`; o
 * consentimento cai) e registra `agroinblue/item_desconectado` na fila (o vínculo some da tela). Extratos já importados ficam.
 * Repetir é seguro: o item que já não existe na Pluggy só registra.
 */
export interface PecasDesconectar {
  autorDoToken: (token: string) => Promise<string | null>;
  ehAdmin: (autor: string) => Promise<boolean>;
  credenciais: () => { clientId: string; clientSecret: string } | null;
  busca: Busca;
  registrar: (a: { origem: 'agroinblue'; evento: 'agroinblue/item_desconectado'; item_id: string; client_user_id: string; autor: string }) => Promise<boolean>;
  /** P3a: as contas permitidas do item saem junto (desligadas, nunca apagadas); repetir é seguro */
  desligarContas: (a: { clienteId: string; itemId: string; autor: string }) => Promise<boolean>;
}
export async function desconectar(pedido: { token: string | null; clienteId: unknown; itemId: unknown }, pecas: PecasDesconectar):
  Promise<{ status: number; corpo: { ok: boolean; ja_nao_existia?: boolean; frase?: string } }> {
  const autor = pedido.token ? await pecas.autorDoToken(pedido.token) : null;
  if (!autor) return { status: 401, corpo: { ok: false, frase: 'Entre de novo no sistema.' } };
  const clienteId = typeof pedido.clienteId === 'string' && UUID.test(pedido.clienteId) ? pedido.clienteId : null;
  const itemId = typeof pedido.itemId === 'string' && UUID.test(pedido.itemId) ? pedido.itemId : null;
  if (!clienteId || !itemId) return { status: 400, corpo: { ok: false, frase: 'Escolha o cliente e o banco.' } };
  if (!(await pecas.ehAdmin(autor))) return { status: 403, corpo: { ok: false, frase: 'Só a AGROinBLUE desconecta um banco.' } };
  const cred = pecas.credenciais();
  if (!cred) return { status: 503, corpo: { ok: false, frase: 'O Open Finance ainda não está configurado neste ambiente.' } };
  const chave = await chaveDaApi(pecas.busca, cred.clientId, cred.clientSecret);
  if (chave.ok === false) return { status: chave.status, corpo: { ok: false, frase: chave.frase } };
  const h = { 'Content-Type': 'application/json', 'X-API-KEY': chave.valor };
  let jaNaoExistia = false;
  try {
    const item = await pecas.busca(`${PLUGGY_BASE}/items/${itemId}`, { method: 'GET', headers: h });
    if (item.status === 404) jaNaoExistia = true;
    else if (!item.ok) return { status: 502, corpo: { ok: false, frase: 'Não consegui ler a conexão na Pluggy. Nada foi apagado.' } };
    else {
      const dono = objeto(await item.json())?.clientUserId;
      if (dono !== clienteId) return { status: 409, corpo: { ok: false, frase: 'Esta conexão não é deste cliente. Nada foi apagado.' } };
      const apagou = await pecas.busca(`${PLUGGY_BASE}/items/${itemId}`, { method: 'DELETE', headers: h });
      if (!apagou.ok && apagou.status !== 404) return { status: 502, corpo: { ok: false, frase: 'A Pluggy não apagou a conexão agora. Tente de novo.' } };
    }
  } catch { return { status: 502, corpo: { ok: false, frase: 'Não consegui falar com a Pluggy agora. Tente de novo.' } }; }
  if (!(await pecas.registrar({ origem: 'agroinblue', evento: 'agroinblue/item_desconectado', item_id: itemId, client_user_id: clienteId, autor }))) {
    return { status: 500, corpo: { ok: false, frase: 'A conexão saiu da Pluggy, mas não consegui registrar aqui. Clique de novo para registrar.' } };
  }
  if (!(await pecas.desligarContas({ clienteId, itemId, autor }))) {
    return { status: 500, corpo: { ok: false, frase: 'A conexão saiu da Pluggy, mas não desliguei as contas permitidas aqui. Clique de novo.' } };
  }
  return { status: 200, corpo: { ok: true, ja_nao_existia: jaNaoExistia } };
}

/**
 * OPENFINANCE-P3a — CONTAS PERMITIDAS (Gabriel 16/11, saída A: o consentimento do Itaú da Vera pegou o CPF inteiro do Gabriel).
 * `openfinance-contas`, só o admin AGROinBLUE:
 *  · 'listar'   → confere na Pluggy que o item é deste cliente e devolve, por conta, SÓ tipo · banco · 4 últimos dígitos · titular e
 *                 documento MASCARADOS · se já é permitida. Nunca saldo, limite nem transação; nunca chama /transactions.
 *  · 'permitir' → relê as contas na Pluggy, recusa accountId que não é do item e grava (`_fn_openfinance_contas_gravar`, 118130) a lista
 *                 marcada com tipo/final/rótulo do que a PLUGGY disse (nunca do que a tela mandou). `simular` = a prévia.
 */
export interface ContaParaEscolher {
  account_id: string; tipo: 'BANK' | 'CREDIT'; subtipo: string | null; tipo_legivel: string; banco: string;
  final4: string | null; titular: string | null; documento: string | null; permitida: boolean;
}
const TIPO_LEGIVEL: Record<string, string> = {
  CHECKING_ACCOUNT: 'Conta corrente', SAVINGS_ACCOUNT: 'Poupança', CREDIT_CARD: 'Cartão de crédito',
};
/** "GABRIEL JUNQUEIRA MILANI" → "Gabriel J. M." (o 1º nome e as iniciais; sem nome = nulo) */
export function mascararTitular(nome: unknown): string | null {
  const partes = typeof nome === 'string' ? nome.trim().split(/\s+/).filter(Boolean) : [];
  if (partes.length === 0) return null;
  const cap = (p: string) => p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR');
  const iniciais = partes.slice(1).filter((p) => !/^(d[aeo]s?|e)$/i.test(p)).map((p) => `${p.charAt(0).toLocaleUpperCase('pt-BR')}.`);
  return [cap(partes[0]), ...iniciais].join(' ').slice(0, 60);
}
/** CPF → ***.914.048-** (a régua do sistema); CNPJ → **.123.456/****-**; outro = nulo (nunca o número inteiro) */
export function mascararDocumento(doc: unknown): string | null {
  const d = typeof doc === 'string' ? doc.replace(/\D/g, '') : '';
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`;
  return null;
}
/** os 4 últimos ALGARISMOS do número da conta/cartão ("XXXX1234", "12345-6"); menos de 4 = nulo */
export function finalDaConta(numero: unknown): string | null {
  const d = typeof numero === 'string' ? numero.replace(/\D/g, '') : '';
  return d.length >= 4 ? d.slice(-4) : null;
}
export function contaDaPluggy(a: unknown, banco: string, permitidas: ReadonlySet<string>): ContaParaEscolher | null {
  const o = objeto(a);
  const id = texto(o?.id, 128);
  const tipo = o?.type === 'BANK' || o?.type === 'CREDIT' ? o.type : null;
  if (!o || !id || !tipo) return null;
  const subtipo = texto(o.subtype, 32);
  return {
    account_id: id, tipo, subtipo, tipo_legivel: (subtipo && TIPO_LEGIVEL[subtipo]) || (tipo === 'CREDIT' ? 'Crédito' : 'Conta'),
    banco, final4: finalDaConta(o.number), titular: mascararTitular(o.owner), documento: mascararDocumento(o.taxNumber),
    permitida: permitidas.has(id),
  };
}
export function rotuloDaConta(c: ContaParaEscolher): string {
  return [c.banco, c.tipo_legivel, c.final4].filter(Boolean).join(' · ').slice(0, 80);
}

export interface PecasContas {
  autorDoToken: (token: string) => Promise<string | null>;
  ehAdmin: (autor: string) => Promise<boolean>;
  credenciais: () => { clientId: string; clientSecret: string } | null;
  busca: Busca;
  permitidasDoItem: (itemId: string) => Promise<string[] | null>;
  gravar: (p: { p_cliente: string; p_item: string; p_contas: unknown[]; p_autor: string; p_simular: boolean }) =>
    Promise<{ ok: true; corpo: Record<string, unknown> } | { ok: false; codigo: string | null }>;
}
type RespostaContas = { status: number; corpo: { ok: boolean; frase?: string; contas?: ContaParaEscolher[]; [k: string]: unknown } };
export async function contas(pedido: { token: string | null; acao: unknown; clienteId: unknown; itemId: unknown; accountIds?: unknown; simular?: unknown },
  pecas: PecasContas): Promise<RespostaContas> {
  const autor = pedido.token ? await pecas.autorDoToken(pedido.token) : null;
  if (!autor) return { status: 401, corpo: { ok: false, frase: 'Entre de novo no sistema.' } };
  const acao = pedido.acao === 'listar' || pedido.acao === 'permitir' ? pedido.acao : null;
  const clienteId = typeof pedido.clienteId === 'string' && UUID.test(pedido.clienteId) ? pedido.clienteId : null;
  const itemId = typeof pedido.itemId === 'string' && UUID.test(pedido.itemId) ? pedido.itemId : null;
  if (!acao || !clienteId || !itemId) return { status: 400, corpo: { ok: false, frase: 'Escolha o cliente e o banco.' } };
  let marcadas: string[] = [];
  if (acao === 'permitir') {
    const v = pedido.accountIds;
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x) || new Set(v).size !== v.length || v.length > 50) {
      return { status: 400, corpo: { ok: false, frase: 'A lista de contas veio inválida. Nada foi gravado.' } };
    }
    marcadas = v;
  }
  if (!(await pecas.ehAdmin(autor))) return { status: 403, corpo: { ok: false, frase: 'Só a AGROinBLUE escolhe as contas do banco.' } };
  const cred = pecas.credenciais();
  if (!cred) return { status: 503, corpo: { ok: false, frase: 'O Open Finance ainda não está configurado neste ambiente.' } };
  const chave = await chaveDaApi(pecas.busca, cred.clientId, cred.clientSecret);
  if (chave.ok === false) return { status: chave.status, corpo: { ok: false, frase: chave.frase } };
  const h = { 'Content-Type': 'application/json', 'X-API-KEY': chave.valor };
  let lidas: ContaParaEscolher[];
  try {
    const item = await pecas.busca(`${PLUGGY_BASE}/items/${itemId}`, { method: 'GET', headers: h });
    if (item.status === 404) return { status: 404, corpo: { ok: false, frase: 'Esta conexão não existe mais na Pluggy.' } };
    if (!item.ok) return { status: 502, corpo: { ok: false, frase: 'Não consegui ler a conexão na Pluggy. Tente de novo.' } };
    const it = objeto(await item.json());
    if (it?.clientUserId !== clienteId) return { status: 409, corpo: { ok: false, frase: 'Esta conexão não é deste cliente. Nada foi lido.' } };
    const banco = texto(objeto(it.connector)?.name, 40) ?? 'Banco';
    const permitidas = await pecas.permitidasDoItem(itemId);
    if (!permitidas) return { status: 500, corpo: { ok: false, frase: 'Não consegui ler as contas já escolhidas. Tente de novo.' } };
    const r = await pecas.busca(`${PLUGGY_BASE}/accounts?itemId=${itemId}`, { method: 'GET', headers: h });
    if (!r.ok) return { status: 502, corpo: { ok: false, frase: 'Não consegui ler as contas na Pluggy. Tente de novo.' } };
    const lista = objeto(await r.json())?.results;
    const set = new Set(permitidas);
    lidas = (Array.isArray(lista) ? lista : []).map((a) => contaDaPluggy(a, banco, set)).filter((c): c is ContaParaEscolher => c !== null);
  } catch { return { status: 502, corpo: { ok: false, frase: 'Não consegui falar com a Pluggy agora. Tente de novo.' } }; }
  if (acao === 'listar') return { status: 200, corpo: { ok: true, contas: lidas } };

  const porId = new Map(lidas.map((c) => [c.account_id, c]));
  if (marcadas.some((id) => !porId.has(id))) {
    return { status: 400, corpo: { ok: false, frase: 'Uma das contas não é desta conexão. Nada foi gravado.' } };
  }
  const p_contas = marcadas.flatMap((id) => {
    const c = porId.get(id);
    return c ? [{ account_id: c.account_id, tipo: c.tipo, subtipo: c.subtipo, final4: c.final4, rotulo: rotuloDaConta(c) }] : [];
  });
  const g = await pecas.gravar({ p_cliente: clienteId, p_item: itemId, p_contas, p_autor: autor, p_simular: pedido.simular === true });
  if (g.ok === false) {
    if (g.codigo === '42501') return { status: 409, corpo: { ok: false, frase: 'Esta conexão não está ligada a este cliente. Nada foi gravado.' } };
    if (g.codigo === '23505') return { status: 409, corpo: { ok: false, frase: 'Uma das contas já está ligada a outra conexão. Nada foi gravado.' } };
    return { status: 500, corpo: { ok: false, frase: 'Não consegui gravar a escolha agora. Nada foi gravado; tente de novo.' } };
  }
  return { status: 200, corpo: { ...g.corpo, ok: true } };
}

/**
 * OPENFINANCE-P3b — LIGAR a conta permitida à conta do SISTEMA (onde o extrato cai). Só o admin AGROinBLUE; quem confere cliente, tipo
 * e "uma conta do sistema recebe de UMA conta do banco" é a interna `_fn_openfinance_conta_ligar_sistema` (118140). Não fala com a
 * Pluggy: a conta permitida já foi conferida lá quando o admin a marcou. `contaBancariaId` nulo = desliga. `simular` = a prévia.
 */
export interface PecasLigar {
  autorDoToken: (token: string) => Promise<string | null>;
  ehAdmin: (autor: string) => Promise<boolean>;
  ligar: (p: { p_cliente: string; p_permitida: string; p_conta: string | null; p_autor: string; p_simular: boolean }) =>
    Promise<{ ok: true; corpo: Record<string, unknown> } | { ok: false; codigo: string | null }>;
}
export async function ligarConta(pedido: { token: string | null; clienteId: unknown; permitidaId: unknown; contaBancariaId: unknown; simular?: unknown },
  pecas: PecasLigar): Promise<{ status: number; corpo: { ok: boolean; frase?: string; [k: string]: unknown } }> {
  const autor = pedido.token ? await pecas.autorDoToken(pedido.token) : null;
  if (!autor) return { status: 401, corpo: { ok: false, frase: 'Entre de novo no sistema.' } };
  const clienteId = typeof pedido.clienteId === 'string' && UUID.test(pedido.clienteId) ? pedido.clienteId : null;
  const permitidaId = typeof pedido.permitidaId === 'string' && UUID.test(pedido.permitidaId) ? pedido.permitidaId : null;
  const conta = pedido.contaBancariaId === null ? null
    : typeof pedido.contaBancariaId === 'string' && UUID.test(pedido.contaBancariaId) ? pedido.contaBancariaId : undefined;
  if (!clienteId || !permitidaId || conta === undefined) return { status: 400, corpo: { ok: false, frase: 'Escolha a conta do banco e a conta do sistema.' } };
  if (!(await pecas.ehAdmin(autor))) return { status: 403, corpo: { ok: false, frase: 'Só a AGROinBLUE liga a conta do banco à conta do sistema.' } };
  const g = await pecas.ligar({ p_cliente: clienteId, p_permitida: permitidaId, p_conta: conta, p_autor: autor, p_simular: pedido.simular === true });
  if (g.ok === false) {
    if (g.codigo === '42501') return { status: 409, corpo: { ok: false, frase: 'Esta conta não é deste cliente. Nada foi gravado.' } };
    if (g.codigo === '23505') return { status: 409, corpo: { ok: false, frase: 'Esta conta do sistema já recebe de outra conta do banco. Nada foi gravado.' } };
    if (g.codigo === '22023') return { status: 400, corpo: { ok: false, frase: 'Só conta corrente ativa recebe o extrato do banco (cartão não). Nada foi gravado.' } };
    return { status: 500, corpo: { ok: false, frase: 'Não consegui gravar a ligação agora. Nada foi gravado; tente de novo.' } };
  }
  return { status: 200, corpo: { ...g.corpo, ok: true } };
}

/**
 * OPENFINANCE-P3b — o EXTRATO da conta permitida (desenho aprovado 16/11). `openfinance-extrato`, só o admin AGROinBLUE (piloto):
 *  · 'buscar'   → desde o CORTE (o dia seguinte à última linha viva do extrato da conta; sem extrato, os últimos 90 dias) até hoje;
 *                 grava o SALDO que o banco informou (`_fn_openfinance_saldo_registrar`, 118140) — a falha dele não derruba a busca.
 *  · 'conferir' → SÓ LEITURA, um período JÁ coberto pelo extrato (até a última linha; no máximo 62 dias): a tela compara com o que
 *                 já está no sistema. Não grava nada, nem o saldo.
 * Lê SÓ a conta permitida, viva e ligada a ESTA conta do sistema, e confere na Pluggy que a conexão é deste cliente. Devolve à tela só
 * os campos que a prévia usa; a gravação do extrato é a porta de sempre (`fn_extrato_importar_arquivo`), pela tela, com a prévia.
 * ⚠ Nunca loga transação, descrição, valor nem saldo.
 */
export interface TransacaoDaBorda {
  id: string; accountId: string | null; description: string | null; amount: number; date: string;
  status: string | null; type: string | null; providerId: string | null; currencyCode: string | null;
}
export interface ContaDaBorda {
  id: string; type: string; subtype: string | null; number: string | null; balance: number | null; currencyCode: string | null;
  /** quando o BANCO atualizou o saldo (`updatedAt` da Pluggy); nulo = não disse */
  saldoEm: string | null;
}
export interface PecasExtrato {
  autorDoToken: (token: string) => Promise<string | null>;
  ehAdmin: (autor: string) => Promise<boolean>;
  credenciais: () => { clientId: string; clientSecret: string } | null;
  busca: Busca;
  /** a conta permitida VIVA ligada a esta conta do sistema, deste cliente; nulo = nenhuma; 'erro' = não consegui ler */
  permitidaDaConta: (clienteId: string, contaBancariaId: string) => Promise<{ item_id: string; account_id: string } | null | 'erro'>;
  /** a data ('AAAA-MM-DD') da última linha VIVA do extrato da conta; nulo = sem extrato; 'erro' = não consegui ler */
  ultimoDiaDoExtrato: (contaBancariaId: string) => Promise<string | null | 'erro'>;
  registrarSaldo: (p: { p_item: string; p_account: string; p_saldo: number; p_saldo_em: string | null; p_autor: string }) => Promise<boolean>;
  /** a Pluggy recusou as transações: 1 linha 'agroinblue/extrato_falhou' na fila de eventos (só status e código da Pluggy) */
  registrarFalha?: (p: { item_id: string; account_id: string; erro_codigo: string }) => Promise<boolean>;
  /** o resumo da leitura (contagens por dia de Brasília e por status), 1 linha 'agroinblue/extrato_lido' na fila */
  registrarLeitura?: (p: { item_id: string; account_id: string; resumo: string }) => Promise<boolean>;
}
export interface RespostaExtrato {
  ok: true; acao: 'buscar' | 'conferir'; de: string; ate: string; hoje: string;
  /** o dia seguinte à última linha do extrato (nulo = conta sem extrato) e a própria última linha */
  corte: string | null; ultimoDia: string | null;
  conta: ContaDaBorda; transacoes: TransacaoDaBorda[]; saldoGravado: boolean | null;
}
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const diaValido = (v: unknown): string | null => {
  if (typeof v !== 'string' || !DIA.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
};
const DIA_EM_BRASILIA_DA_BORDA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
/** o dia ('AAAA-MM-DD') em Brasília de um ISO da Pluggy; só a data = ela mesma; ilegível = nulo */
export function diaEmBrasiliaDaBorda(iso: string | null): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : DIA_EM_BRASILIA_DA_BORDA.format(d);
}
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diasEntre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000);
/** sem extrato na conta, a 1ª busca olha 90 dias para trás */
export const JANELA_SEM_EXTRATO = 90;
/** a conferência cobre no máximo 62 dias (dois meses) */
export const JANELA_CONFERENCIA = 62;
const PAGINAS_NO_MAXIMO = 20;

export function transacaoDaPluggy(t: unknown): TransacaoDaBorda | null {
  const o = objeto(t);
  const id = texto(o?.id, 128);
  const date = texto(o?.date, 40);
  if (!o || !id || !date || typeof o.amount !== 'number' || !Number.isFinite(o.amount)) return null;
  return {
    id, accountId: texto(o.accountId, 128), description: texto(o.description, 200), amount: o.amount, date,
    status: texto(o.status, 16), type: texto(o.type, 16), providerId: texto(o.providerId, 128), currencyCode: texto(o.currencyCode, 8),
  };
}

export async function extrato(pedido: { token: string | null; acao: unknown; clienteId: unknown; contaBancariaId: unknown; de?: unknown; ate?: unknown; hoje: string },
  pecas: PecasExtrato): Promise<{ status: number; corpo: RespostaExtrato | { ok: false; frase: string } }> {
  const falha = (status: number, frase: string) => ({ status, corpo: { ok: false as const, frase } });
  const autor = pedido.token ? await pecas.autorDoToken(pedido.token) : null;
  if (!autor) return falha(401, 'Entre de novo no sistema.');
  const acao = pedido.acao === 'buscar' || pedido.acao === 'conferir' ? pedido.acao : null;
  const clienteId = typeof pedido.clienteId === 'string' && UUID.test(pedido.clienteId) ? pedido.clienteId : null;
  const contaId = typeof pedido.contaBancariaId === 'string' && UUID.test(pedido.contaBancariaId) ? pedido.contaBancariaId : null;
  if (!acao || !clienteId || !contaId) return falha(400, 'Escolha o cliente e a conta.');
  if (!(await pecas.ehAdmin(autor))) return falha(403, 'No piloto, só a AGROinBLUE busca o extrato no banco.');

  const permitida = await pecas.permitidaDaConta(clienteId, contaId);
  if (permitida === 'erro') return falha(500, 'Não consegui ler a ligação com o banco. Tente de novo.');
  if (!permitida) return falha(404, 'Esta conta do sistema não está ligada a uma conta do banco (Bancos conectados › Escolher contas).');
  const ultimo = await pecas.ultimoDiaDoExtrato(contaId);
  if (ultimo === 'erro') return falha(500, 'Não consegui ler o extrato desta conta. Nada foi lido no banco.');
  const hoje = pedido.hoje;
  const corte = ultimo ? somarDias(ultimo, 1) : null;

  let de: string; let ate: string;
  if (acao === 'buscar') {
    de = corte ?? somarDias(hoje, -JANELA_SEM_EXTRATO);
    ate = hoje;
  } else {
    const d = diaValido(pedido.de); const a = diaValido(pedido.ate);
    if (!d || !a || d > a) return falha(400, 'Escolha o período da conferência (de ≤ até).');
    if (!ultimo || a > ultimo) return falha(400, 'A conferência é só do período que já está no extrato (até a última linha importada).');
    if (diasEntre(d, a) + 1 > JANELA_CONFERENCIA) return falha(400, `A conferência cobre no máximo ${JANELA_CONFERENCIA} dias.`);
    de = d; ate = a;
  }

  const cred = pecas.credenciais();
  if (!cred) return falha(503, 'O Open Finance ainda não está configurado neste ambiente.');
  const chave = await chaveDaApi(pecas.busca, cred.clientId, cred.clientSecret);
  if (chave.ok === false) return falha(chave.status, chave.frase);
  const h = { 'Content-Type': 'application/json', 'X-API-KEY': chave.valor };

  let conta: ContaDaBorda;
  const transacoes: TransacaoDaBorda[] = [];
  try {
    const item = await pecas.busca(`${PLUGGY_BASE}/items/${permitida.item_id}`, { method: 'GET', headers: h });
    if (item.status === 404) return falha(404, 'A conexão com o banco não existe mais na Pluggy. Nada foi lido.');
    if (!item.ok) return falha(502, 'Não consegui ler a conexão na Pluggy. Tente de novo.');
    if (objeto(await item.json())?.clientUserId !== clienteId) return falha(409, 'Esta conexão não é deste cliente. Nada foi lido.');

    const rc = await pecas.busca(`${PLUGGY_BASE}/accounts/${permitida.account_id}`, { method: 'GET', headers: h });
    if (!rc.ok) return falha(502, 'Não consegui ler a conta no banco. Tente de novo.');
    const c = objeto(await rc.json());
    const id = texto(c?.id, 128);
    if (!c || id !== permitida.account_id || typeof c.type !== 'string') return falha(502, 'O banco devolveu outra conta. Nada foi lido.');
    if (c.type !== 'BANK') return falha(400, 'Esta conta do banco é um cartão: a fatura ainda não se importa por aqui. Nada foi lido.');
    conta = {
      id, type: c.type, subtype: texto(c.subtype, 32), number: texto(c.number, 40),
      balance: typeof c.balance === 'number' && Number.isFinite(c.balance) ? c.balance : null,
      currencyCode: texto(c.currencyCode, 8), saldoEm: texto(c.updatedAt, 40),
    };

    if (de <= ate) {
      /* OF-IMPORTAR-BANCO-QUEBROU-01 (17/11): conta criada depois de jun/2026 não lê mais o GET /transactions (page/pageSize; changelog
         2026.06 da Pluggy, legado só até 31/12/2026) → GET /v2/transactions com cursor: o `after` sai do `next` e o pedido seguinte
         repete a conta e o período (o `next` de exemplo da Pluggy não os traz). 500 por página; teto de 20 páginas. */
      let after: string | null = null;
      for (let pagina = 1; pagina <= PAGINAS_NO_MAXIMO; pagina++) {
        /* OF-CONFERIR-CASAMENTO-01 (17/11): o 13/11 do OFX não veio — o filtro da Pluggy não é pelo dia de Brasília (o fim do dia já é
           o dia seguinte em UTC). Pede 1 dia a mais de cada lado; quem corta no dia de BRASÍLIA é a fonte da prévia (`foraDoPeriodo`). */
        const q = `accountId=${encodeURIComponent(permitida.account_id)}&dateFrom=${somarDias(de, -1)}&dateTo=${somarDias(ate, 1)}`
          + (after ? `&after=${encodeURIComponent(after)}` : '');
        const rt = await pecas.busca(`${PLUGGY_BASE}/v2/transactions?${q}`, { method: 'GET', headers: h });
        if (!rt.ok) {
          let erro: Record<string, unknown> | null = null;
          try { erro = objeto(await rt.json()); } catch { erro = null; }
          const codigo = [String(rt.status), texto(erro?.code, 24), texto(erro?.codeDescription, 32)].filter(Boolean).join(' ');
          if (pecas.registrarFalha) {
            try { await pecas.registrarFalha({ item_id: permitida.item_id, account_id: permitida.account_id, erro_codigo: codigo.slice(0, 64) }); } catch { /* a trilha não derruba a resposta */ }
          }
          return falha(502, `Não consegui ler o extrato no banco (Pluggy ${rt.status}). Nada foi lido; tente de novo.`);
        }
        const corpo = objeto(await rt.json());
        const lista = Array.isArray(corpo?.results) ? corpo.results : [];
        for (const t of lista) { const x = transacaoDaPluggy(t); if (x) transacoes.push(x); }
        const proximo = texto(corpo?.next, 2048);
        after = proximo ? new URLSearchParams(proximo.replace(/^\?/, '')).get('after') : null;
        if (!after) break;
        if (pagina === PAGINAS_NO_MAXIMO) return falha(502, 'O extrato veio grande demais de uma vez. Nada foi lido; fale com a AGROinBLUE.');
      }
    }
  } catch { return falha(502, 'Não consegui falar com a Pluggy agora. Tente de novo.'); }

  /* o resumo da leitura na fila de eventos (só contagens: por dia de Brasília e por status; nenhum valor, nome ou descrição) — o
     próximo "veio a menos" se explica sem pedir o bruto */
  if (pecas.registrarLeitura) {
    const porDia = new Map<string, number>(); const porStatus = new Map<string, number>();
    for (const t of transacoes) {
      const d = diaEmBrasiliaDaBorda(t.date) ?? 'sem-data';
      porDia.set(d, (porDia.get(d) ?? 0) + 1);
      porStatus.set(t.status ?? 'sem-status', (porStatus.get(t.status ?? 'sem-status') ?? 0) + 1);
    }
    const dias = [...porDia.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, n]) => `${d.slice(8, 10)}/${d.slice(5, 7)}:${n}`).join(' ');
    const st = [...porStatus.entries()].map(([k, n]) => `${k} ${n}`).join(' · ');
    const resumo = `${acao} ${de}..${ate} (pedido ${somarDias(de, -1)}..${somarDias(ate, 1)}) · ${transacoes.length} recebidas · ${st} · por dia: ${dias}`;
    try { await pecas.registrarLeitura({ item_id: permitida.item_id, account_id: permitida.account_id, resumo: resumo.slice(0, 1500) }); } catch { /* não derruba */ }
  }

  let saldoGravado: boolean | null = null;
  if (acao === 'buscar' && conta.balance !== null) {
    try {
      saldoGravado = await pecas.registrarSaldo({ p_item: permitida.item_id, p_account: permitida.account_id, p_saldo: conta.balance, p_saldo_em: conta.saldoEm, p_autor: autor });
    } catch { saldoGravado = false; }
  }
  return { status: 200, corpo: { ok: true, acao, de, ate, hoje, corte, ultimoDia: ultimo, conta, transacoes, saldoGravado } };
}
