/**
 * OPENFINANCE-PILOTO-01 · P2 — as regras da borda da Pluggy (`supabase/functions/_shared/pluggy.ts`) com a Pluggy FALSA: o webhook só
 * aceita o cabeçalho secreto certo e só guarda os campos da lista; o connect token só para quem pode e nunca devolve a API key; o registro
 * do webhook não duplica e nunca devolve o cabeçalho.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  avisoDoCorpo, CABECALHO_SEGREDO, chaveDaApi, conectar, conectorRegulado, desconectar, iguaisEmTempoConstante, receberAviso,
  registrarWebhook, type Busca, type PecasConectar, type PecasDesconectar,
  contas, finalDaConta, mascararDocumento, mascararTitular, type PecasContas, agenciaDaConta, conexaoDoItem,
} from '../../../supabase/functions/_shared/pluggy';

const SEGREDO = 'segredo-sintetico-0123456789abcdef';
const CLIENT_ID = '11111111-2222-3333-4444-555555555555';
const CLIENTE = '43f32d07-dba8-4670-900c-bf645440c04a';
/** PRONTO-NJ-01 (8): o termo lido que a conexão nova leva (versão + md5 do texto mostrado) */
const TERMO = { versao: 1, md5: '0123456789abcdef0123456789abcdef' };
const resposta = (status: number, corpo: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });

/** a Pluggy falsa: responde por método + caminho e guarda os pedidos */
function pluggyFalsa(rotas: Record<string, { status: number; corpo: unknown }>) {
  const pedidos: Array<{ metodo: string; caminho: string; headers: Record<string, string>; corpo: unknown }> = [];
  const busca: Busca = async (url, init) => {
    const caminho = url.replace('https://api.pluggy.ai', '');
    pedidos.push({ metodo: init.method, caminho, headers: init.headers, corpo: init.body ? JSON.parse(init.body) : null });
    const r = rotas[`${init.method} ${caminho}`];
    return r ? resposta(r.status, r.corpo) : resposta(404, {});
  };
  return { busca, pedidos };
}

/** OPENFINANCE-SEG-01 (a): a lista da Pluggy MISTURA o regulado com o que pediria senha — só o 601 pode passar */
const ROTA_CONECTORES = 'GET /connectors?isOpenFinance=true&countries=BR';
const CONECTORES = { results: [
  { id: 601, name: 'Itaú (Open Finance)', isOpenFinance: true, oauth: true, credentials: [{ name: 'cpf', type: 'number' }] },
  { id: 201, name: 'Itaú (direto)', isOpenFinance: false, oauth: false, credentials: [{ name: 'user', type: 'text' }, { name: 'password', type: 'password' }] },
  { id: 602, name: 'OF com senha?', isOpenFinance: true, oauth: true, credentials: [{ name: 'password', type: 'password' }] },
  { id: 603, name: 'OF sem OAuth', isOpenFinance: true, oauth: false, credentials: [] },
  { id: '604', name: 'id texto', isOpenFinance: true, oauth: true, credentials: [] },
  { id: 605, name: 'OAuth fora do Open Finance', isOpenFinance: false, oauth: true, credentials: [] },
] };

const avisoItem = { event: 'item/created', eventId: 'ev-1', clientId: CLIENT_ID, itemId: 'item-1', clientUserId: CLIENTE, triggeredBy: 'USER' };

describe('OPENFINANCE P2 — o webhook (receberAviso)', () => {
  const base = { segredo: SEGREDO, clientIdEsperado: CLIENT_ID, ip: '52.67.145.81' };

  it('cabeçalho certo + corpo bom = 200 e grava SÓ os campos da lista', async () => {
    const registrar = vi.fn(async () => true);
    const corpo = { ...avisoItem, createdTransactionsLink: 'https://api.pluggy.ai/x', nome: 'Fulano', documento: '123' };
    const r = await receberAviso({ ...base, segredoRecebido: SEGREDO, corpo, registrar });
    expect(r.status).toBe(200);
    expect(registrar).toHaveBeenCalledWith({
      origem: 'pluggy_webhook', evento: 'item/created', event_id: 'ev-1', item_id: 'item-1', account_id: null, client_user_id: CLIENTE,
      connector_id: null, triggered_by: 'USER', n_transacoes: null, erro_codigo: null, ip: '52.67.145.81',
    });
  });

  it('sem cabeçalho ou com o errado = 401 e NADA gravado (a Pluggy não tenta de novo um 401)', async () => {
    for (const recebido of [null, '', 'segredo-errado', `${SEGREDO}x`, SEGREDO.slice(0, -1)]) {
      const registrar = vi.fn(async () => true);
      const r = await receberAviso({ ...base, segredoRecebido: recebido, corpo: avisoItem, registrar });
      expect(r.status).toBe(401);
      expect(registrar).not.toHaveBeenCalled();
    }
  });

  it('sem os secrets configurados = 503 (a Pluggy tenta de novo), nunca aceita', async () => {
    const registrar = vi.fn(async () => true);
    expect((await receberAviso({ ...base, segredo: undefined, segredoRecebido: SEGREDO, corpo: avisoItem, registrar })).status).toBe(503);
    expect((await receberAviso({ ...base, clientIdEsperado: '', segredoRecebido: SEGREDO, corpo: avisoItem, registrar })).status).toBe(503);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('corpo inválido = 400; clientId de OUTRO app = 200 sem gravar; fila que falha = 500 (a Pluggy tenta de novo)', async () => {
    const registrar = vi.fn(async () => true);
    expect((await receberAviso({ ...base, segredoRecebido: SEGREDO, corpo: { event: 'DROP TABLE' }, registrar })).status).toBe(400);
    expect((await receberAviso({ ...base, segredoRecebido: SEGREDO, corpo: null, registrar })).status).toBe(400);
    const outro = await receberAviso({ ...base, segredoRecebido: SEGREDO, corpo: { ...avisoItem, clientId: 'outro' }, registrar });
    expect(outro).toEqual({ status: 200, corpo: { ok: true, motivo: 'outro_app' } });
    expect(registrar).not.toHaveBeenCalled();
    expect((await receberAviso({ ...base, segredoRecebido: SEGREDO, corpo: avisoItem, registrar: async () => false })).status).toBe(500);
    expect((await receberAviso({ ...base, segredoRecebido: SEGREDO, corpo: avisoItem, registrar: async () => { throw new Error('x'); } })).status).toBe(500);
  });

  it('transactions/created: a contagem vem do transactionsCount (ou do tamanho da lista); os ids não são guardados', () => {
    const a = avisoDoCorpo({ event: 'transactions/created', eventId: 'e', itemId: 'i', accountId: 'c', transactionsCount: 7, transactionIds: ['a', 'b'] }, null);
    expect(a?.n_transacoes).toBe(7);
    expect(JSON.stringify(a)).not.toContain('"a"');
    expect(avisoDoCorpo({ event: 'transactions/deleted', transactionIds: ['a', 'b', 'c'] }, null)?.n_transacoes).toBe(3);
    expect(avisoDoCorpo({ event: 'item/error', error: { code: 'INVALID_CREDENTIALS', message: 'senha errada do Fulano' } }, null)?.erro_codigo).toBe('INVALID_CREDENTIALS');
    expect(JSON.stringify(avisoDoCorpo({ event: 'item/error', error: { code: 'X', message: 'senha errada do Fulano' } }, null))).not.toContain('Fulano');
  });

  it('a comparação do segredo: igual só se tudo igual', () => {
    expect(iguaisEmTempoConstante(SEGREDO, SEGREDO)).toBe(true);
    expect(iguaisEmTempoConstante(SEGREDO, SEGREDO.replace(/.$/, 'x'))).toBe(false);
    expect(iguaisEmTempoConstante('abc', 'abcd')).toBe(false);
  });
});

describe('OPENFINANCE P2 — o connect token (conectar)', () => {
  const pecas = (p: Partial<PecasConectar> = {}, rotas: Record<string, { status: number; corpo: unknown }> = {
    'POST /auth': { status: 200, corpo: { apiKey: 'api-key-sintetica' } },
    [ROTA_CONECTORES]: { status: 200, corpo: CONECTORES },
    'POST /connect_token': { status: 200, corpo: { accessToken: 'connect-token-sintetico' } },
  }) => {
    const falsa = pluggyFalsa(rotas);
    const registrar = vi.fn(async () => true);
    const aceitarTermo = vi.fn<PecasConectar['aceitarTermo']>(async () => 'ok');
    return {
      falsa, registrar, aceitarTermo,
      pecas: {
        autorDoToken: async (t: string) => (t === 'jwt-bom' ? 'autor-1' : null), podeConectar: async () => true,
        credenciais: () => ({ clientId: CLIENT_ID, clientSecret: 'secret-sintetico' }), busca: falsa.busca, registrar, aceitarTermo, ...p,
      },
    };
  };

  it('quem pode: o token de 30 min com o cliente no clientUserId (avoidDuplicates) e a trilha; a API key nunca sai', async () => {
    const { falsa, registrar, pecas: pc } = pecas();
    const r = await conectar({ token: 'jwt-bom', clienteId: CLIENTE, termo: TERMO }, pc);
    expect(r).toEqual({ status: 200, corpo: { ok: true, accessToken: 'connect-token-sintetico', connectorIds: [601] } });
    expect(JSON.stringify(r)).not.toContain('api-key-sintetica');
    expect(falsa.pedidos[1]).toMatchObject({ metodo: 'GET', caminho: '/connectors?isOpenFinance=true&countries=BR' });
    expect(falsa.pedidos[2]).toEqual({ metodo: 'POST', caminho: '/connect_token', headers: { 'Content-Type': 'application/json', 'X-API-KEY': 'api-key-sintetica' },
      corpo: { options: { clientUserId: CLIENTE, avoidDuplicates: true } } });
    expect(registrar).toHaveBeenCalledWith({ origem: 'agroinblue', evento: 'agroinblue/connect_token', client_user_id: CLIENTE, autor: 'autor-1' });
  });

  it('sem login 401 · cliente inválido 400 · sem permissão 403 · sem secrets 503 — e a Pluggy nem é chamada', async () => {
    const casos: Array<[{ token: string | null; clienteId: string; termo?: unknown }, Partial<PecasConectar>, number]> = [
      [{ token: null, clienteId: CLIENTE, termo: TERMO }, {}, 401],
      [{ token: 'jwt-ruim', clienteId: CLIENTE, termo: TERMO }, {}, 401],
      [{ token: 'jwt-bom', clienteId: 'nao-e-uuid', termo: TERMO }, {}, 400],
      [{ token: 'jwt-bom', clienteId: CLIENTE, termo: TERMO }, { podeConectar: async () => false }, 403],
      [{ token: 'jwt-bom', clienteId: CLIENTE, termo: TERMO }, { credenciais: () => null }, 503],
      /* PRONTO-NJ-01 (8): a conexão NOVA sem o termo lido (ou com md5 que não é md5) = 400, antes de falar com a Pluggy */
      [{ token: 'jwt-bom', clienteId: CLIENTE }, {}, 400],
      [{ token: 'jwt-bom', clienteId: CLIENTE, termo: { versao: 1, md5: 'x' } }, {}, 400],
      [{ token: 'jwt-bom', clienteId: CLIENTE, termo: { versao: 0, md5: TERMO.md5 } }, {}, 400],
    ];
    for (const [pedido, extra, status] of casos) {
      const { falsa, pecas: pc } = pecas(extra);
      expect((await conectar(pedido, pc)).status).toBe(status);
      expect(falsa.pedidos).toHaveLength(0);
    }
  });

  it('a Pluggy recusa as credenciais ou o token: 502 com frase pronta, sem o corpo dela', async () => {
    const recusa = pecas({}, { 'POST /auth': { status: 401, corpo: { message: 'eco do clientSecret' } }, 'POST /connect_token': { status: 200, corpo: {} } });
    const r = await conectar({ token: 'jwt-bom', clienteId: CLIENTE, termo: TERMO }, recusa.pecas);
    expect(r.status).toBe(502);
    expect(JSON.stringify(r)).not.toContain('eco');
    const semToken = pecas({}, { 'POST /auth': { status: 200, corpo: { apiKey: 'k' } }, [ROTA_CONECTORES]: { status: 200, corpo: CONECTORES },
      'POST /connect_token': { status: 500, corpo: {} } });
    expect((await conectar({ token: 'jwt-bom', clienteId: CLIENTE, termo: TERMO }, semToken.pecas)).status).toBe(502);
    expect(semToken.registrar).not.toHaveBeenCalled();
  });

  it('PRONTO-NJ-01 (8): o aceite do termo é gravado ANTES do token, com o autor; termo que mudou = 409 e nada aberto; falhou = 500', async () => {
    const ok = pecas();
    expect((await conectar({ token: 'jwt-bom', clienteId: CLIENTE, termo: TERMO }, ok.pecas)).status).toBe(200);
    expect(ok.aceitarTermo).toHaveBeenCalledWith({ p_cliente: CLIENTE, p_versao: 1, p_md5: TERMO.md5, p_autor: 'autor-1' });
    const casos: Array<['mudou' | 'erro', number]> = [['mudou', 409], ['erro', 500]];
    for (const [aceite, status] of casos) {
      const x = pecas({ aceitarTermo: async () => aceite });
      const r = await conectar({ token: 'jwt-bom', clienteId: CLIENTE, termo: TERMO }, x.pecas);
      expect(r.status).toBe(status);
      expect(r.corpo.accessToken).toBeUndefined();
      expect(x.falsa.pedidos.some((p) => p.caminho === '/connect_token')).toBe(false);
    }
  });
  it('PRONTO-NJ-01 (8): o Reconectar de um item já consentido não pede o termo de novo', async () => {
    const ITEM_R = 'item-reconectar-1';
    const x = pecas({}, { 'POST /auth': { status: 200, corpo: { apiKey: 'k' } }, [ROTA_CONECTORES]: { status: 200, corpo: CONECTORES },
      [`GET /items/${ITEM_R}`]: { status: 200, corpo: { clientUserId: CLIENTE } }, 'POST /connect_token': { status: 200, corpo: { accessToken: 't' } } });
    expect((await conectar({ token: 'jwt-bom', clienteId: CLIENTE, itemId: ITEM_R }, x.pecas)).status).toBe(200);
    expect(x.aceitarTermo).not.toHaveBeenCalled();
  });

  it('a trilha que não grava = 500 e o token NÃO vai à tela', async () => {
    const { pecas: pc } = pecas({ registrar: async () => false });
    const r = await conectar({ token: 'jwt-bom', clienteId: CLIENTE, termo: TERMO }, pc);
    expect(r.status).toBe(500);
    expect(r.corpo.accessToken).toBeUndefined();
  });
});

describe('OPENFINANCE P2 — o registro do webhook', () => {
  const URL_WEBHOOK = 'https://binbcdfbisgscrifztia.supabase.co/functions/v1/openfinance-webhook';

  it('cria o webhook "all" com o cabeçalho secreto quando a URL não está lá', async () => {
    const falsa = pluggyFalsa({ 'GET /webhooks': { status: 200, corpo: { results: [{ id: 'w0', url: 'https://outra' }] } }, 'POST /webhooks': { status: 201, corpo: { id: 'w1', headers: { [CABECALHO_SEGREDO]: SEGREDO } } } });
    const r = await registrarWebhook(falsa.busca, 'k', URL_WEBHOOK, SEGREDO);
    expect(r).toEqual({ ok: true, valor: { id: 'w1', jaExistia: false } });
    expect(JSON.stringify(r)).not.toContain(SEGREDO);
    expect(falsa.pedidos[1].corpo).toEqual({ url: URL_WEBHOOK, event: 'all', headers: { [CABECALHO_SEGREDO]: SEGREDO } });
  });

  it('a URL já registrada: não cria outro', async () => {
    const falsa = pluggyFalsa({ 'GET /webhooks': { status: 200, corpo: { results: [{ id: 'w9', url: URL_WEBHOOK }] } } });
    expect(await registrarWebhook(falsa.busca, 'k', URL_WEBHOOK, SEGREDO)).toEqual({ ok: true, valor: { id: 'w9', jaExistia: true } });
    expect(falsa.pedidos.map((p) => p.metodo)).toEqual(['GET']);
  });

  it('a Pluggy recusa: 502 com a frase; a chave da API pela /auth', async () => {
    const falsa = pluggyFalsa({ 'GET /webhooks': { status: 200, corpo: { results: [] } }, 'POST /webhooks': { status: 400, corpo: {} } });
    expect((await registrarWebhook(falsa.busca, 'k', URL_WEBHOOK, SEGREDO)).ok).toBe(false);
    const auth = pluggyFalsa({ 'POST /auth': { status: 200, corpo: { apiKey: 'k2' } } });
    expect(await chaveDaApi(auth.busca, CLIENT_ID, 's')).toEqual({ ok: true, valor: 'k2' });
    expect(auth.pedidos[0].corpo).toEqual({ clientId: CLIENT_ID, clientSecret: 's' });
  });
});

describe('OPENFINANCE-SEG-01 (a) — só o Open Finance regulado (nunca senha do banco)', () => {
  it('passa só isOpenFinance + oauth + sem campo de senha + id numérico', () => {
    expect(CONECTORES.results.map(conectorRegulado)).toEqual([601, null, null, null, null, null]);
  });
  it('nenhum regulado na lista = 502 e o token NEM é pedido (nunca cai para os diretos)', async () => {
    const falsa = pluggyFalsa({ 'POST /auth': { status: 200, corpo: { apiKey: 'k' } },
      [ROTA_CONECTORES]: { status: 200, corpo: { results: [CONECTORES.results[1]] } }, 'POST /connect_token': { status: 200, corpo: { accessToken: 't' } } });
    const registrar = vi.fn(async () => true);
    const r = await conectar({ token: 'jwt-bom', clienteId: CLIENTE, termo: TERMO }, { autorDoToken: async () => 'a', podeConectar: async () => true,
      credenciais: () => ({ clientId: CLIENT_ID, clientSecret: 's' }), busca: falsa.busca, registrar, aceitarTermo: async () => 'ok' });
    expect(r.status).toBe(502);
    expect(r.corpo.accessToken).toBeUndefined();
    expect(falsa.pedidos.map(p => p.caminho)).not.toContain('/connect_token');
    expect(registrar).not.toHaveBeenCalled();
  });
});

describe('OPENFINANCE-SEG-01 (b)+(c) — desconectar, preso ao cliente', () => {
  const ITEM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const OUTRO = '99999999-8888-7777-6666-555555555555';
  const montar = (rotas: Record<string, { status: number; corpo: unknown }>, p: Partial<PecasDesconectar> = {}) => {
    const falsa = pluggyFalsa({ 'POST /auth': { status: 200, corpo: { apiKey: 'k' } }, ...rotas });
    const registrar = vi.fn(async () => true);
    const desligarContas = vi.fn(async () => true);
    const pecas: PecasDesconectar = { autorDoToken: async (t) => (t === 'jwt-bom' ? 'admin-1' : null), ehAdmin: async () => true,
      credenciais: () => ({ clientId: CLIENT_ID, clientSecret: 's' }), busca: falsa.busca, registrar, desligarContas, ...p };
    return { falsa, registrar, desligarContas, pecas };
  };
  it('o item é deste cliente: DELETE na Pluggy e o registro do desligamento', async () => {
    const { falsa, registrar, pecas } = montar({ [`GET /items/${ITEM}`]: { status: 200, corpo: { id: ITEM, clientUserId: CLIENTE } },
      [`DELETE /items/${ITEM}`]: { status: 200, corpo: {} } });
    expect(await desconectar({ token: 'jwt-bom', clienteId: CLIENTE, itemId: ITEM }, pecas)).toEqual({ status: 200, corpo: { ok: true, ja_nao_existia: false } });
    expect(falsa.pedidos.map(p => `${p.metodo} ${p.caminho}`)).toContain(`DELETE /items/${ITEM}`);
    expect(registrar).toHaveBeenCalledWith({ origem: 'agroinblue', evento: 'agroinblue/item_desconectado', item_id: ITEM, client_user_id: CLIENTE, autor: 'admin-1' });
  });
  it('P3a: as contas permitidas do item saem junto; se não saírem, 500 com "Clique de novo"', async () => {
    const ok = montar({ [`GET /items/${ITEM}`]: { status: 200, corpo: { clientUserId: CLIENTE } }, [`DELETE /items/${ITEM}`]: { status: 204, corpo: {} } });
    await desconectar({ token: 'jwt-bom', clienteId: CLIENTE, itemId: ITEM }, ok.pecas);
    expect(ok.desligarContas).toHaveBeenCalledWith({ clienteId: CLIENTE, itemId: ITEM, autor: 'admin-1' });
    const falha = montar({ [`GET /items/${ITEM}`]: { status: 200, corpo: { clientUserId: CLIENTE } }, [`DELETE /items/${ITEM}`]: { status: 204, corpo: {} } },
      { desligarContas: async () => false });
    const r = await desconectar({ token: 'jwt-bom', clienteId: CLIENTE, itemId: ITEM }, falha.pecas);
    expect(r.status).toBe(500);
    expect(r.corpo.frase).toMatch(/contas permitidas.*Clique de novo/);
  });
  it('(c) item de OUTRO cliente ou sem cliente: 409, nada apagado, nada registrado', async () => {
    for (const dono of [OUTRO, undefined]) {
      const { falsa, registrar, pecas } = montar({ [`GET /items/${ITEM}`]: { status: 200, corpo: { id: ITEM, clientUserId: dono } },
        [`DELETE /items/${ITEM}`]: { status: 200, corpo: {} } });
      expect((await desconectar({ token: 'jwt-bom', clienteId: CLIENTE, itemId: ITEM }, pecas)).status).toBe(409);
      expect(falsa.pedidos.some(p => p.metodo === 'DELETE')).toBe(false);
      expect(registrar).not.toHaveBeenCalled();
    }
  });
  it('o item já não existe na Pluggy: só registra (repetir é seguro)', async () => {
    const { falsa, registrar, pecas } = montar({});
    expect(await desconectar({ token: 'jwt-bom', clienteId: CLIENTE, itemId: ITEM }, pecas)).toEqual({ status: 200, corpo: { ok: true, ja_nao_existia: true } });
    expect(falsa.pedidos.some(p => p.metodo === 'DELETE')).toBe(false);
    expect(registrar).toHaveBeenCalled();
  });
  it('sem login 401 · ids inválidos 400 · não admin 403 · sem secrets 503 — e a Pluggy nem é chamada', async () => {
    const casos: Array<[{ token: string | null; clienteId: string; itemId: string }, Partial<PecasDesconectar>, number]> = [
      [{ token: null, clienteId: CLIENTE, itemId: ITEM }, {}, 401],
      [{ token: 'jwt-bom', clienteId: CLIENTE, itemId: 'item-1' }, {}, 400],
      [{ token: 'jwt-bom', clienteId: 'x', itemId: ITEM }, {}, 400],
      [{ token: 'jwt-bom', clienteId: CLIENTE, itemId: ITEM }, { ehAdmin: async () => false }, 403],
      [{ token: 'jwt-bom', clienteId: CLIENTE, itemId: ITEM }, { credenciais: () => null }, 503],
    ];
    for (const [pedido, extra, status] of casos) {
      const { falsa, pecas } = montar({}, extra);
      expect((await desconectar(pedido, pecas)).status).toBe(status);
      expect(falsa.pedidos).toHaveLength(0);
    }
  });
  it('a Pluggy não apaga: 502 e NADA registrado; o registro que falha depois do DELETE: 500 com a frase de tentar de novo', async () => {
    const a = montar({ [`GET /items/${ITEM}`]: { status: 200, corpo: { clientUserId: CLIENTE } }, [`DELETE /items/${ITEM}`]: { status: 500, corpo: {} } });
    expect((await desconectar({ token: 'jwt-bom', clienteId: CLIENTE, itemId: ITEM }, a.pecas)).status).toBe(502);
    expect(a.registrar).not.toHaveBeenCalled();
    const b = montar({ [`GET /items/${ITEM}`]: { status: 200, corpo: { clientUserId: CLIENTE } }, [`DELETE /items/${ITEM}`]: { status: 204, corpo: {} } },
      { registrar: async () => false });
    const r = await desconectar({ token: 'jwt-bom', clienteId: CLIENTE, itemId: ITEM }, b.pecas);
    expect(r.status).toBe(500);
    expect(r.corpo.frase).toMatch(/Clique de novo/);
  });
});

describe('OPENFINANCE-P3a — as contas da conexão (só as marcadas entram; o resto nunca é lido nem gravado)', () => {
  const ITEM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const OUTRO = '99999999-8888-7777-6666-555555555555';
  // dados SINTÉTICOS: uma conta corrente, um cartão, uma poupança; saldo/limite vêm na Pluggy e NÃO podem sair
  const CONTAS = { results: [
    { id: 'acc-cc', type: 'BANK', subtype: 'CHECKING_ACCOUNT', number: '12345-6', owner: 'FULANO DE TAL SILVA', taxNumber: '123.456.789-01', balance: 999.99,
      bankData: { transferNumber: '0748/12345-6', closingBalance: 999.99 } },
    { id: 'acc-cartao', type: 'CREDIT', subtype: 'CREDIT_CARD', number: 'XXXX XXXX XXXX 9876', owner: 'BELTRANA SOUZA', creditData: { availableCreditLimit: 5000 } },
    { id: 'acc-poup', type: 'BANK', subtype: 'SAVINGS_ACCOUNT', number: '77', owner: '', balance: 1 },
    { id: 'acc-estranha', type: 'INVESTMENT' },
  ] };
  const montar = (p: Partial<PecasContas> = {}, rotas: Record<string, { status: number; corpo: unknown }> = {}) => {
    const falsa = pluggyFalsa({ 'POST /auth': { status: 200, corpo: { apiKey: 'k' } },
      [`GET /items/${ITEM}`]: { status: 200, corpo: { id: ITEM, clientUserId: CLIENTE, connector: { name: 'Itaú' } } },
      [`GET /accounts?itemId=${ITEM}`]: { status: 200, corpo: CONTAS }, ...rotas });
    const gravar = vi.fn<PecasContas['gravar']>(async () => ({ ok: true, corpo: { ok: true, simulado: true, ligar: 1, manter: 0, desligar: 0 } }));
    const pecas: PecasContas = { autorDoToken: async (t) => (t === 'jwt-bom' ? 'admin-1' : null), podeConectar: async () => true, podeVer: async () => true,
      credenciais: () => ({ clientId: CLIENT_ID, clientSecret: 's' }), busca: falsa.busca, permitidasDoItem: async () => ['acc-cartao'],
      itensDoCliente: async () => [ITEM], gravar, ...p };
    return { falsa, gravar, pecas };
  };
  const base = { token: 'jwt-bom', clienteId: CLIENTE, itemId: ITEM };

  it('máscaras: 1º nome + iniciais; CPF/CNPJ no meio; os 4 últimos algarismos', () => {
    expect(mascararTitular('GABRIEL JUNQUEIRA DE MILANI')).toBe('Gabriel J. M.');
    expect(mascararTitular('  ')).toBeNull();
    expect(mascararDocumento('123.914.048-01')).toBe('***.914.048-**');
    expect(mascararDocumento('12.345.678/0001-90')).toBe('**.345.678/****-**');
    expect(mascararDocumento('123')).toBeNull();
    expect(finalDaConta('XXXX XXXX XXXX 9876')).toBe('9876');
    expect(finalDaConta('12')).toBeNull();
  });
  it('listar: só tipo · banco · final · titular/documento mascarados · permitida — nunca saldo nem limite; nunca /transactions', async () => {
    const { falsa, gravar, pecas } = montar();
    const r = await contas({ ...base, acao: 'listar' }, pecas);
    expect(r.status).toBe(200);
    expect(r.corpo.banco).toBe('Itaú');
    expect(r.corpo.lendo).toBe(false);
    expect(r.corpo.contas).toEqual([
      { account_id: 'acc-cc', tipo: 'BANK', subtipo: 'CHECKING_ACCOUNT', tipo_legivel: 'Conta corrente', banco: 'Itaú', final4: '3456',
        titular: 'Fulano T. S.', documento: '***.456.789-**', permitida: false, agencia: '0748' },
      { account_id: 'acc-cartao', tipo: 'CREDIT', subtipo: 'CREDIT_CARD', tipo_legivel: 'Cartão de crédito', banco: 'Itaú', final4: '9876',
        titular: 'Beltrana S.', documento: null, permitida: true, agencia: null },
      { account_id: 'acc-poup', tipo: 'BANK', subtipo: 'SAVINGS_ACCOUNT', tipo_legivel: 'Poupança', banco: 'Itaú', final4: null,
        titular: null, documento: null, permitida: false, agencia: null },
    ]);
    const texto = JSON.stringify(r.corpo);
    expect(texto).not.toMatch(/999|5000|balance|creditData|availableCreditLimit|FULANO|SILVA|123\.456/);
    expect(falsa.pedidos.some(p => p.caminho.includes('transactions'))).toBe(false);
    expect(gravar).not.toHaveBeenCalled();
  });
  it('PRONTO-NJ-01 (1): logo depois do consentimento (item UPDATING) a resposta diz "lendo" — a tela relê, nunca "não há contas"', async () => {
    const { pecas } = montar({}, { [`GET /items/${ITEM}`]: { status: 200, corpo: { id: ITEM, clientUserId: CLIENTE, status: 'UPDATING', connector: { name: 'Sicredi' } } },
      [`GET /accounts?itemId=${ITEM}`]: { status: 200, corpo: { results: [] } } });
    const r = await contas({ ...base, acao: 'listar' }, pecas);
    expect(r.corpo).toMatchObject({ ok: true, banco: 'Sicredi', lendo: true, contas: [] });
  });
  it('PRONTO-NJ-01 (8): VER (listar/conexoes) pergunta o podeVer COM o cliente; ESCOLHER (permitir) pergunta o podeConectar', async () => {
    const podeConectar = vi.fn(async () => true); const podeVer = vi.fn(async () => true);
    const { pecas } = montar({ podeConectar, podeVer });
    await contas({ ...base, acao: 'listar' }, pecas);
    expect(podeVer).toHaveBeenCalledWith('admin-1', CLIENTE);
    expect(podeConectar).not.toHaveBeenCalled();
    await contas({ ...base, acao: 'permitir', accountIds: ['acc-cc'], simular: true }, pecas);
    expect(podeConectar).toHaveBeenCalledWith('admin-1', CLIENTE);
  });
  it('PRONTO-NJ-01 (8, 15:36): o GESTOR (vê, não conecta) lista e vê as conexões, mas o permitir dá 403 e nada é gravado', async () => {
    const { gravar, pecas } = montar({ podeConectar: async () => false, podeVer: async () => true });
    expect((await contas({ ...base, acao: 'listar' }, pecas)).status).toBe(200);
    const r = await contas({ ...base, acao: 'permitir', accountIds: ['acc-cc'] }, pecas);
    expect(r.status).toBe(403);
    expect(r.corpo.frase).toBe('Só o proprietário do cliente ou a AGROinBLUE escolhe as contas do banco.');
    expect(gravar).not.toHaveBeenCalled();
  });
  it('item de OUTRO cliente: 409 e as contas NEM são lidas', async () => {
    const { falsa, pecas } = montar({}, { [`GET /items/${ITEM}`]: { status: 200, corpo: { clientUserId: OUTRO } } });
    expect((await contas({ ...base, acao: 'listar' }, pecas)).status).toBe(409);
    expect(falsa.pedidos.some(p => p.caminho.startsWith('/accounts'))).toBe(false);
  });
  it('sem login 401 · pedido inválido 400 · não admin 403 · sem secrets 503 — a Pluggy nem é chamada', async () => {
    const casos: Array<[Record<string, unknown>, Partial<PecasContas>, number]> = [
      [{ ...base, token: null, acao: 'listar' }, {}, 401],
      [{ ...base, acao: 'apagar' }, {}, 400],
      [{ ...base, itemId: 'x', acao: 'listar' }, {}, 400],
      [{ ...base, acao: 'permitir', accountIds: ['a', 'a'] }, {}, 400],
      [{ ...base, acao: 'permitir', accountIds: 'acc-cc' }, {}, 400],
      [{ ...base, acao: 'listar' }, { podeVer: async () => false }, 403],
      [{ ...base, acao: 'conexoes' }, { podeVer: async () => false }, 403],
      [{ ...base, acao: 'listar' }, { credenciais: () => null }, 503],
    ];
    for (const [pedido, extra, status] of casos) {
      const { falsa, pecas } = montar(extra);
      expect((await contas({ token: null, acao: null, clienteId: null, itemId: null, ...pedido }, pecas)).status).toBe(status);
      expect(falsa.pedidos).toHaveLength(0);
    }
  });
  it('permitir: grava SÓ as marcadas, com tipo/final/rótulo do que a PLUGGY disse, autor = o admin; simular passa', async () => {
    const { gravar, pecas } = montar();
    const r = await contas({ ...base, acao: 'permitir', accountIds: ['acc-cc'], simular: true }, pecas);
    expect(r).toEqual({ status: 200, corpo: { ok: true, simulado: true, ligar: 1, manter: 0, desligar: 0 } });
    expect(gravar).toHaveBeenCalledWith({ p_cliente: CLIENTE, p_item: ITEM, p_autor: 'admin-1', p_simular: true,
      p_contas: [{ account_id: 'acc-cc', tipo: 'BANK', subtipo: 'CHECKING_ACCOUNT', final4: '3456', rotulo: 'Itaú · Conta corrente · 3456' }] });
  });
  it('permitir: conta que não é da conexão = 400 e NADA gravado; recusa do banco vira a frase', async () => {
    const a = montar();
    expect((await contas({ ...base, acao: 'permitir', accountIds: ['acc-cc', 'acc-de-fora'] }, a.pecas)).status).toBe(400);
    expect(a.gravar).not.toHaveBeenCalled();
    const b = montar({ gravar: async () => ({ ok: false, codigo: '23505' }) });
    const r = await contas({ ...base, acao: 'permitir', accountIds: ['acc-cc'] }, b.pecas);
    expect(r.status).toBe(409);
    expect(r.corpo.frase).toMatch(/outra conexão/);
  });
});

describe('OPENFINANCE-PRONTO-NJ-01 (1)+(7) — as conexões como a Pluggy vê (o webhook não traz o conector)', () => {
  const I1 = 'aaaaaaaa-0000-0000-0000-000000000001';
  const I2 = 'aaaaaaaa-0000-0000-0000-000000000002';
  const I3 = 'aaaaaaaa-0000-0000-0000-000000000003';
  const I4 = 'aaaaaaaa-0000-0000-0000-000000000004';
  const I5 = 'aaaaaaaa-0000-0000-0000-000000000005';
  const OUTRO = '99999999-8888-7777-6666-555555555555';
  const rotas = {
    'POST /auth': { status: 200, corpo: { apiKey: 'k' } },
    [`GET /items/${I1}`]: { status: 200, corpo: { id: I1, clientUserId: CLIENTE, status: 'UPDATED', executionStatus: 'SUCCESS', createdAt: '2026-11-25T13:47:35Z',
      connector: { id: 612, name: 'Sicredi', type: 'PERSONAL_BANK' }, parameter: { cpf: '12345678901' } } },
    [`GET /items/${I2}`]: { status: 200, corpo: { id: I2, clientUserId: CLIENTE, status: 'OUTDATED', executionStatus: 'USER_INPUT_TIMEOUT',
      error: { code: 'USER_INPUT_TIMEOUT', message: 'mensagem crua da Pluggy com dado' }, connector: { name: 'Banco do Brasil', type: 'PERSONAL_BANK' } } },
    [`GET /items/${I3}`]: { status: 200, corpo: { id: I3, clientUserId: CLIENTE, status: 'WAITING_USER_INPUT', connector: { name: 'Sicredi', type: 'BUSINESS_BANK' } } },
    [`GET /items/${I4}`]: { status: 200, corpo: { id: I4, clientUserId: OUTRO, status: 'UPDATED', connector: { name: 'Banco de outro cliente' } } },
    // I5: já não existe na Pluggy (404) — fica de fora
  };
  const pecasDe = (over: Partial<PecasContas> = {}) => {
    const falsa = pluggyFalsa(rotas);
    const pecas: PecasContas = { autorDoToken: async (t) => (t === 'jwt-bom' ? 'gestor-1' : null), podeConectar: async () => false, podeVer: async () => true,
      credenciais: () => ({ clientId: CLIENT_ID, clientSecret: 's' }), busca: falsa.busca, permitidasDoItem: async () => [],
      itensDoCliente: async () => [I1, I2, I3, I4, I5], gravar: async () => ({ ok: false, codigo: null }), ...over };
    return { falsa, pecas };
  };
  it('o NOME do banco, Pessoal/Empresa, a situação e a FRASE pronta das que não completaram; outro cliente e o que sumiu ficam de fora', async () => {
    const { falsa, pecas } = pecasDe();
    const r = await contas({ token: 'jwt-bom', acao: 'conexoes', clienteId: CLIENTE }, pecas);
    expect(r.status).toBe(200);
    expect(r.corpo.conexoes).toEqual([
      { item_id: I1, banco: 'Sicredi', empresa: false, situacao: 'conectado', codigo: null, frase: null, criado_em: '2026-11-25T13:47:35Z', atualizado_em: null },
      { item_id: I2, banco: 'Banco do Brasil', empresa: false, situacao: 'erro', codigo: 'USER_INPUT_TIMEOUT',
        frase: 'O banco esperou a confirmação no app e o tempo acabou. Tente de novo com o celular em mãos.', criado_em: null, atualizado_em: null },
      { item_id: I3, banco: 'Sicredi', empresa: true, situacao: 'esperando', codigo: null,
        frase: 'Esperando o titular aprovar no app do banco (o prazo é de 20 minutos).', criado_em: null, atualizado_em: null },
    ]);
    const texto = JSON.stringify(r.corpo);
    expect(texto).not.toMatch(/mensagem crua|12345678901|outro cliente/);   // nunca o corpo da Pluggy nem dado do titular
    expect(falsa.pedidos.every((p) => p.metodo === 'GET' || p.caminho === '/auth')).toBe(true);
    expect(falsa.pedidos.some((p) => p.caminho.startsWith('/accounts') || p.caminho.includes('transactions'))).toBe(false);
  });
  it('a trilha que não lê = 500; a Pluggy que falha = 502 (nunca "nenhum banco")', async () => {
    expect((await contas({ token: 'jwt-bom', acao: 'conexoes', clienteId: CLIENTE }, pecasDe({ itensDoCliente: async () => null }).pecas)).status).toBe(500);
    const falha = pluggyFalsa({ 'POST /auth': { status: 200, corpo: { apiKey: 'k' } }, [`GET /items/${I1}`]: { status: 500, corpo: {} } });
    const r = await contas({ token: 'jwt-bom', acao: 'conexoes', clienteId: CLIENTE }, pecasDe({ busca: falha.busca }).pecas);
    expect(r.status).toBe(502);
    expect(r.corpo.conexoes).toBeUndefined();
  });
  it('as regras puras: o item sem id é nulo; código sem frase cai na frase da situação; a agência do transferNumber', () => {
    expect(conexaoDoItem({ status: 'UPDATED' })).toBeNull();
    expect(conexaoDoItem({ id: 'x', status: 'LOGIN_ERROR', error: { code: 'ALGO_NOVO' } })).toMatchObject({ situacao: 'erro', codigo: 'ALGO_NOVO',
      frase: 'A conexão não terminou. Tente de novo.', banco: 'Banco' });
    expect(conexaoDoItem({ id: 'x', status: 'UPDATING' })).toMatchObject({ situacao: 'lendo', frase: expect.stringMatching(/lendo as contas/) });
    expect(agenciaDaConta({ transferNumber: '0748/95982-3' })).toBe('0748');
    expect(agenciaDaConta({ transferNumber: '748/0748/95982-3' })).toBe('0748');
    expect(agenciaDaConta({ transferNumber: '95982-3' })).toBeNull();
    expect(agenciaDaConta(null)).toBeNull();
  });
});
