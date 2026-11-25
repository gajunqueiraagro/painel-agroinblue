/**
 * OF-ATUALIZAR-DO-BANCO-01 — o "Atualizar do banco" e a situação do item (`atualizarItem`), com a Pluggy FALSA (nenhuma chamada real):
 * só o admin, só a conta ligada, só o item do cliente; o banco pedindo o titular = Reconectar (sem PATCH); já atualizando = sem PATCH;
 * 1 pedido por hora por item (a trilha diz quando foi o último); o PATCH e a trilha; e o Widget em modo atualização no `conectar`.
 */
import { describe, expect, it, vi } from 'vitest';
import { atualizarItem, conectar, FRASE_RECONECTAR, type Busca, type PecasAtualizar, type PecasConectar } from '../../../supabase/functions/_shared/pluggy';

const CLIENTE = '43f32d07-dba8-4670-900c-bf645440c04a';
const CONTA = '131b8501-caf7-4964-b1b1-3f552ad2b75d';
const ITEM = '8b3d384a-0000-4000-8000-000000000001';
const resposta = (status: number, corpo: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
function pluggy(rotas: Record<string, { status: number; corpo: unknown }>) {
  const pedidos: string[] = [];
  const busca: Busca = async (url, init) => {
    const k = `${init.method} ${url.replace('https://api.pluggy.ai', '')}`;
    pedidos.push(k);
    const r = rotas[k];
    return r ? resposta(r.status, r.corpo) : resposta(404, {});
  };
  return { busca, pedidos };
}
const AGORA = Date.parse('2026-11-17T13:40:00Z');   // 10:40 em Brasília
const ITEM_OK = { id: ITEM, clientUserId: CLIENTE, status: 'UPDATED', executionStatus: 'SUCCESS', lastUpdatedAt: '2026-11-16T20:10:37.000Z', nextAutoSyncAt: '2026-11-17T20:10:00.000Z' };
function pecas(item: unknown = ITEM_OK, over: Partial<PecasAtualizar> = {}, patch: { status: number; corpo: unknown } = { status: 200, corpo: { ...ITEM_OK, status: 'UPDATING' } }) {
  const p = pluggy({ 'POST /auth': { status: 200, corpo: { apiKey: 'k' } }, [`GET /items/${ITEM}`]: { status: 200, corpo: item }, [`PATCH /items/${ITEM}`]: patch });
  const registrar = vi.fn(async () => true);
  const base: PecasAtualizar = {
    autorDoToken: async (t) => (t === 'tok' ? 'autor-1' : null), ehAdmin: async () => true, credenciais: () => ({ clientId: 'c', clientSecret: 's' }),
    busca: p.busca, permitidaDaConta: async (cli, c) => (cli === CLIENTE && c === CONTA ? { item_id: ITEM, account_id: 'acc' } : null),
    ultimoPedido: async () => null, registrar, ...over,
  };
  return { pecas: base, pedidos: p.pedidos, registrar };
}
const pedir = (acao: string, extra: Record<string, unknown> = {}) => ({ token: 'tok', acao, clienteId: CLIENTE, contaBancariaId: CONTA, agora: AGORA, ...extra });

describe('OF-ATUALIZAR-DO-BANCO-01 — atualizarItem', () => {
  it('situação: lê o item do cliente e devolve status, última atualização e o próximo auto-sync — sem PATCH', async () => {
    const { pecas: pc, pedidos } = pecas();
    const r = await atualizarItem(pedir('situacao'), pc);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ ok: true, acao: 'situacao', item: { status: 'UPDATED', lastUpdatedAt: '2026-11-16T20:10:37.000Z', nextAutoSyncAt: '2026-11-17T20:10:00.000Z' } });
    expect(pedidos).toEqual(['POST /auth', `GET /items/${ITEM}`]);
  });
  it('atualizar: PATCH /items/{id} e a trilha com o autor; devolve "UPDATING"', async () => {
    const { pecas: pc, pedidos, registrar } = pecas();
    const r = await atualizarItem(pedir('atualizar'), pc);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ ok: true, item: { status: 'UPDATING' } });
    expect(pedidos).toEqual(['POST /auth', `GET /items/${ITEM}`, `PATCH /items/${ITEM}`]);
    expect(registrar).toHaveBeenCalledWith({ origem: 'agroinblue', evento: 'agroinblue/item_atualizar', item_id: ITEM, client_user_id: CLIENTE, autor: 'autor-1' });
  });
  it('1 por hora: pedido há 30 min = 429 com as horas de Brasília, sem PATCH; há 61 min = pede', async () => {
    const meia = pecas(ITEM_OK, { ultimoPedido: async () => '2026-11-17T13:10:00Z' });
    const r = await atualizarItem(pedir('atualizar'), meia.pecas);
    expect(r.status).toBe(429);
    expect(r.corpo).toMatchObject({ frase: 'Já pedi a atualização às 10:10; a Pluggy aceita um pedido por hora — o próximo a partir das 11:10.' });
    expect(meia.pedidos.some((x) => x.startsWith('PATCH'))).toBe(false);
    const hora = pecas(ITEM_OK, { ultimoPedido: async () => '2026-11-17T12:39:00Z' });
    expect((await atualizarItem(pedir('atualizar'), hora.pecas)).status).toBe(200);
  });
  it('o banco pede o titular (MFA, consentimento) = 409 com a frase do Reconectar, sem PATCH; a Pluggy recusando com 400 também', async () => {
    for (const st of [{ status: 'LOGIN_ERROR' }, { status: 'OUTDATED', executionStatus: 'USER_AUTHORIZATION_PENDING' }, { status: 'WAITING_USER_INPUT' }]) {
      const { pecas: pc, pedidos } = pecas({ ...ITEM_OK, ...st });
      const r = await atualizarItem(pedir('atualizar'), pc);
      expect(r.status).toBe(409);
      expect(r.corpo).toMatchObject({ ok: false, frase: FRASE_RECONECTAR, reconectar: true });
      expect(pedidos.some((x) => x.startsWith('PATCH'))).toBe(false);
    }
    const recusa = pecas(ITEM_OK, {}, { status: 400, corpo: { message: 'mfa' } });
    expect((await atualizarItem(pedir('atualizar'), recusa.pecas)).corpo).toMatchObject({ reconectar: true });
  });
  it('já atualizando: 200 sem novo PATCH nem trilha', async () => {
    const { pecas: pc, pedidos, registrar } = pecas({ ...ITEM_OK, status: 'UPDATING' });
    const r = await atualizarItem(pedir('atualizar'), pc);
    expect(r.corpo).toMatchObject({ ok: true, jaAtualizando: true });
    expect(pedidos.some((x) => x.startsWith('PATCH'))).toBe(false);
    expect(registrar).not.toHaveBeenCalled();
  });
  it('portas: 401, 400, 403 e conta sem ligação 404 sem falar com a Pluggy; item de outro cliente 409 sem PATCH', async () => {
    const { pecas: pc, pedidos } = pecas(ITEM_OK, { ehAdmin: async () => false });
    expect((await atualizarItem(pedir('atualizar', { token: null }), pc)).status).toBe(401);
    expect((await atualizarItem(pedir('apagar'), pc)).status).toBe(400);
    expect((await atualizarItem(pedir('atualizar'), pc)).status).toBe(403);
    expect(pedidos).toEqual([]);
    const sem = pecas(ITEM_OK, { permitidaDaConta: async () => null });
    expect((await atualizarItem(pedir('atualizar'), sem.pecas)).status).toBe(404);
    expect(sem.pedidos).toEqual([]);
    const outro = pecas({ ...ITEM_OK, clientUserId: 'outro' });
    expect((await atualizarItem(pedir('atualizar'), outro.pecas)).status).toBe(409);
    expect(outro.pedidos.some((x) => x.startsWith('PATCH'))).toBe(false);
  });
});

describe('OF-ATUALIZAR-DO-BANCO-01 — Reconectar (o Widget em modo atualização)', () => {
  const pc = (item: unknown) => {
    const corpos: unknown[] = [];
    const busca: Busca = async (url, init) => {
      const k = `${init.method} ${url.replace('https://api.pluggy.ai', '')}`;
      if (k === 'POST /auth') return resposta(200, { apiKey: 'k' });
      if (k.startsWith('GET /connectors')) return resposta(200, { results: [{ id: 601, isOpenFinance: true, oauth: true, credentials: [] }] });
      if (k === `GET /items/${ITEM}`) return resposta(200, item);
      if (k === 'POST /connect_token') { corpos.push(JSON.parse(init.body ?? '{}')); return resposta(200, { accessToken: 'ct' }); }
      return resposta(404, {});
    };
    const p: PecasConectar = { autorDoToken: async () => 'autor-1', podeConectar: async () => true, credenciais: () => ({ clientId: 'c', clientSecret: 's' }), busca, registrar: async () => true,
      aceitarTermo: async () => 'ok' };
    return { p, corpos };
  };
  it('com o item do cliente, o connect token leva o itemId; sem item, o de sempre (avoidDuplicates)', async () => {
    const a = pc(ITEM_OK);
    expect((await conectar({ token: 't', clienteId: CLIENTE, itemId: ITEM }, a.p)).status).toBe(200);
    expect(a.corpos[0]).toEqual({ itemId: ITEM, options: { clientUserId: CLIENTE } });
    const b = pc(ITEM_OK);
    await conectar({ token: 't', clienteId: CLIENTE, termo: { versao: 1, md5: '0123456789abcdef0123456789abcdef' } }, b.p);
    expect(b.corpos[0]).toEqual({ options: { clientUserId: CLIENTE, avoidDuplicates: true } });
  });
  it('item de outro cliente = 409 sem token; item inválido = 400', async () => {
    const a = pc({ ...ITEM_OK, clientUserId: 'outro' });
    expect((await conectar({ token: 't', clienteId: CLIENTE, itemId: ITEM }, a.p)).status).toBe(409);
    expect(a.corpos).toEqual([]);
    expect((await conectar({ token: 't', clienteId: CLIENTE, itemId: '../x' }, pc(ITEM_OK).p)).status).toBe(400);
  });
});
