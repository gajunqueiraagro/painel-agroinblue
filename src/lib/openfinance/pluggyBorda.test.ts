/**
 * OPENFINANCE-PILOTO-01 · P2 — as regras da borda da Pluggy (`supabase/functions/_shared/pluggy.ts`) com a Pluggy FALSA: o webhook só
 * aceita o cabeçalho secreto certo e só guarda os campos da lista; o connect token só para quem pode e nunca devolve a API key; o registro
 * do webhook não duplica e nunca devolve o cabeçalho.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  avisoDoCorpo, CABECALHO_SEGREDO, chaveDaApi, conectar, iguaisEmTempoConstante, receberAviso, registrarWebhook,
  type Busca, type PecasConectar,
} from '../../../supabase/functions/_shared/pluggy';

const SEGREDO = 'segredo-sintetico-0123456789abcdef';
const CLIENT_ID = '11111111-2222-3333-4444-555555555555';
const CLIENTE = '43f32d07-dba8-4670-900c-bf645440c04a';
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
    'POST /connect_token': { status: 200, corpo: { accessToken: 'connect-token-sintetico' } },
  }) => {
    const falsa = pluggyFalsa(rotas);
    const registrar = vi.fn(async () => true);
    return {
      falsa, registrar,
      pecas: {
        autorDoToken: async (t: string) => (t === 'jwt-bom' ? 'autor-1' : null), podeConectar: async () => true,
        credenciais: () => ({ clientId: CLIENT_ID, clientSecret: 'secret-sintetico' }), busca: falsa.busca, registrar, ...p,
      },
    };
  };

  it('quem pode: o token de 30 min com o cliente no clientUserId (avoidDuplicates) e a trilha; a API key nunca sai', async () => {
    const { falsa, registrar, pecas: pc } = pecas();
    const r = await conectar({ token: 'jwt-bom', clienteId: CLIENTE }, pc);
    expect(r).toEqual({ status: 200, corpo: { ok: true, accessToken: 'connect-token-sintetico' } });
    expect(JSON.stringify(r)).not.toContain('api-key-sintetica');
    expect(falsa.pedidos[1]).toEqual({ metodo: 'POST', caminho: '/connect_token', headers: { 'Content-Type': 'application/json', 'X-API-KEY': 'api-key-sintetica' },
      corpo: { options: { clientUserId: CLIENTE, avoidDuplicates: true } } });
    expect(registrar).toHaveBeenCalledWith({ origem: 'agroinblue', evento: 'agroinblue/connect_token', client_user_id: CLIENTE, autor: 'autor-1' });
  });

  it('sem login 401 · cliente inválido 400 · sem permissão 403 · sem secrets 503 — e a Pluggy nem é chamada', async () => {
    const casos: Array<[{ token: string | null; clienteId: string }, Partial<PecasConectar>, number]> = [
      [{ token: null, clienteId: CLIENTE }, {}, 401],
      [{ token: 'jwt-ruim', clienteId: CLIENTE }, {}, 401],
      [{ token: 'jwt-bom', clienteId: 'nao-e-uuid' }, {}, 400],
      [{ token: 'jwt-bom', clienteId: CLIENTE }, { podeConectar: async () => false }, 403],
      [{ token: 'jwt-bom', clienteId: CLIENTE }, { credenciais: () => null }, 503],
    ];
    for (const [pedido, extra, status] of casos) {
      const { falsa, pecas: pc } = pecas(extra);
      expect((await conectar(pedido, pc)).status).toBe(status);
      expect(falsa.pedidos).toHaveLength(0);
    }
  });

  it('a Pluggy recusa as credenciais ou o token: 502 com frase pronta, sem o corpo dela', async () => {
    const recusa = pecas({}, { 'POST /auth': { status: 401, corpo: { message: 'eco do clientSecret' } }, 'POST /connect_token': { status: 200, corpo: {} } });
    const r = await conectar({ token: 'jwt-bom', clienteId: CLIENTE }, recusa.pecas);
    expect(r.status).toBe(502);
    expect(JSON.stringify(r)).not.toContain('eco');
    const semToken = pecas({}, { 'POST /auth': { status: 200, corpo: { apiKey: 'k' } }, 'POST /connect_token': { status: 500, corpo: {} } });
    expect((await conectar({ token: 'jwt-bom', clienteId: CLIENTE }, semToken.pecas)).status).toBe(502);
    expect(semToken.registrar).not.toHaveBeenCalled();
  });

  it('a trilha que não grava = 500 e o token NÃO vai à tela', async () => {
    const { pecas: pc } = pecas({ registrar: async () => false });
    const r = await conectar({ token: 'jwt-bom', clienteId: CLIENTE }, pc);
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
