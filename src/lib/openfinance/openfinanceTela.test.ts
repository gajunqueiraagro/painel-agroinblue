// OPENFINANCE-PILOTO-01 · P3 mínima — as regras dos dois botões do admin (Conectar banco · Registrar webhook).
import { describe, expect, it } from 'vitest';
import {
  carregarWidget, conectoresDaConexao, conexoesDoCliente, type EventoDaFila, FRASE_REGISTRO_FALHOU, fraseDoItem, fraseDoRegistro, lerRespostaDaBorda, PLUGGY_CONNECT_URL, tokenDaConexao,
} from './openfinanceTela';

describe('OPENFINANCE P3 mínima — a resposta da borda', () => {
  it('ok: o corpo da função', async () => {
    const r = await lerRespostaDaBorda({ data: { ok: true, id: 'w1', ja_existia: false }, error: null }, FRASE_REGISTRO_FALHOU);
    expect(r).toEqual({ ok: true, corpo: { ok: true, id: 'w1', ja_existia: false } });
  });
  it('erro HTTP: a FRASE que a função mandou (403 do não admin), nunca o erro cru', async () => {
    const contexto = new Response(JSON.stringify({ ok: false, frase: 'Só a AgroinBlue registra o webhook.' }), { status: 403 });
    const r = await lerRespostaDaBorda({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: contexto } }, FRASE_REGISTRO_FALHOU);
    expect(r).toEqual({ ok: false, frase: 'Só a AgroinBlue registra o webhook.' });
  });
  it('erro sem corpo legível, ou ok ≠ true: a frase padrão', async () => {
    expect(await lerRespostaDaBorda({ data: null, error: { message: 'x' } }, 'PADRÃO')).toEqual({ ok: false, frase: 'PADRÃO' });
    expect(await lerRespostaDaBorda({ data: { ok: false }, error: null }, 'PADRÃO')).toEqual({ ok: false, frase: 'PADRÃO' });
    const html = new Response('<html>', { status: 502 });
    expect(await lerRespostaDaBorda({ data: null, error: { context: html } }, 'PADRÃO')).toEqual({ ok: false, frase: 'PADRÃO' });
  });
});

describe('OPENFINANCE P3 mínima — as frases e o token', () => {
  it('registro: novo × já existia', () => {
    expect(fraseDoRegistro({ ok: true, ja_existia: false })).toMatch(/^Webhook registrado/);
    expect(fraseDoRegistro({ ok: true, ja_existia: true })).toMatch(/já estava registrado/);
  });
  it('o token de 30 min: só texto não vazio abre o Widget', () => {
    expect(tokenDaConexao({ ok: true, accessToken: 'tok' })).toBe('tok');
    expect(tokenDaConexao({ ok: true, accessToken: '' })).toBeNull();
    expect(tokenDaConexao({ ok: true })).toBeNull();
  });
  it('o banco conectado pelo nome do conector; sem ele, a frase genérica', () => {
    expect(fraseDoItem({ item: { id: 'i', connector: { name: 'Banco do Brasil' } } })).toMatch(/^Banco do Brasil conectado/);
    expect(fraseDoItem({})).toMatch(/^Banco conectado/);
  });
});

describe('OPENFINANCE P3 mínima — o Widget oficial', () => {
  it('versão FIXA no CDN da Pluggy (nunca "latest")', () => {
    expect(PLUGGY_CONNECT_URL).toMatch(/^https:\/\/cdn\.pluggy\.ai\/pluggy-connect\/v\d+\.\d+\.\d+\/pluggy-connect\.js$/);
  });
  it('já carregado: devolve o construtor sem pôr outro script', async () => {
    function PluggyConnect() { /* falso */ }
    const antes = document.head.querySelectorAll('script').length;
    Reflect.set(window, 'PluggyConnect', PluggyConnect);
    try {
      expect(await carregarWidget(window)).toBe(PluggyConnect);
      expect(document.head.querySelectorAll('script').length).toBe(antes);
    } finally { Reflect.deleteProperty(window, 'PluggyConnect'); }
  });
  it('script que falha: recusa (a tela diz a frase) e o próximo clique tenta de novo', async () => {
    const p = carregarWidget(window);
    const s = [...document.head.querySelectorAll('script')].find(x => x.src === PLUGGY_CONNECT_URL);
    expect(s).toBeTruthy();
    s?.dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow('widget');
    const p2 = carregarWidget(window);
    expect(p2).not.toBe(p);
    const s2 = [...document.head.querySelectorAll('script')].find(x => x.src === PLUGGY_CONNECT_URL);
    function PluggyConnect() { /* falso */ }
    Reflect.set(window, 'PluggyConnect', PluggyConnect);
    s2?.dispatchEvent(new Event('load'));
    try { expect(await p2).toBe(PluggyConnect); } finally { Reflect.deleteProperty(window, 'PluggyConnect'); }
  });
});

describe('OPENFINANCE-SEG-01 — os regulados e o vínculo com o cliente', () => {
  it('(a) só ids inteiros positivos; sem a lista = vazio (a tela não abre)', () => {
    expect(conectoresDaConexao({ connectorIds: [601, '602', 0, 1.5, -3, 603] })).toEqual([601, 603]);
    expect(conectoresDaConexao({})).toEqual([]);
  });
  const A = 'cli-a'; const B = 'cli-b';
  const ev = (evento: string, item: string, cliente: string | null, cu: string | null, t: string, conector: string | null = '601'): EventoDaFila =>
    ({ evento, item_id: item, cliente_id: cliente, client_user_id: cu, connector_id: conector, recebido_em: t });
  it('(c) o vínculo nasce SÓ do item/created com cliente; item sem cliente (outro app, painel) é ignorado', () => {
    const fila = [ev('item/created', 'i1', A, A, '2026-11-16T10:00'), ev('item/created', 'i2', null, 'qualquer', '2026-11-16T10:01'),
      ev('item/updated', 'i3', A, A, '2026-11-16T10:02'), ev('transactions/created', 'i1', null, null, '2026-11-16T10:03')];
    expect(conexoesDoCliente(fila, A)).toEqual([{ itemId: 'i1', connectorId: '601', desde: '2026-11-16T10:00' }]);
  });
  it('(c) preso a UM cliente: o item de A nunca aparece para B, nem um 2º item/created muda o dono', () => {
    const fila = [ev('item/created', 'i1', A, A, '2026-11-16T10:00'), ev('item/created', 'i1', B, B, '2026-11-16T10:05')];
    expect(conexoesDoCliente(fila, B)).toEqual([]);
    expect(conexoesDoCliente(fila, A).map(c => c.itemId)).toEqual(['i1']);
  });
  it('(b) o desconectado do MESMO cliente some; o de outro cliente não desliga', () => {
    const fila = [ev('item/created', 'i1', A, A, '2026-11-16T10:00'), ev('agroinblue/item_desconectado', 'i1', null, B, '2026-11-16T10:01')];
    expect(conexoesDoCliente(fila, A)).toHaveLength(1);
    expect(conexoesDoCliente([...fila, ev('agroinblue/item_desconectado', 'i1', null, A, '2026-11-16T10:02')], A)).toEqual([]);
  });
  it('(c) um item/created SEM cliente não toma o item: o que vem depois com o cliente (a reentrega com o clientUserId) liga', () => {
    const fila = [ev('item/created', 'i2', null, 'x', '2026-11-16T10:00'), ev('item/created', 'i2', A, A, '2026-11-16T10:01')];
    expect(conexoesDoCliente(fila, A).map(c => c.itemId)).toEqual(['i2']);
  });
  it('a ordem vem do recebido_em, não da posição na lista', () => {
    const fila = [ev('agroinblue/item_desconectado', 'i1', null, A, '2026-11-16T10:05'), ev('item/created', 'i1', A, A, '2026-11-16T10:00')];
    expect(conexoesDoCliente(fila, A)).toEqual([]);
  });
});
