// OPENFINANCE-PILOTO-01 · P3 mínima — as regras dos dois botões do admin (Conectar banco · Registrar webhook).
import { describe, expect, it } from 'vitest';
import {
  carregarWidget, conectoresDaConexao, conexoesDoCliente, type EventoDaFila, FRASE_REGISTRO_FALHOU, fraseDoItem, fraseDoRegistro, lerRespostaDaBorda, PLUGGY_CONNECT_URL, tokenDaConexao,
  contasDaResposta, escolhaMudou, fraseDoPermitir, frasePrevia, itemDoSucesso, marcadasDePartida,
  conexoesDaResposta, fraseDasLigacoes, lendoDaResposta, planoDaGravacao, podeVerOpenFinance, podeConectarOpenFinance, MOTIVO_SO_PROPRIETARIO, type ContaDaConexao,
} from './openfinanceTela';

describe('OPENFINANCE P3 mínima — a resposta da borda', () => {
  it('ok: o corpo da função', async () => {
    const r = await lerRespostaDaBorda({ data: { ok: true, id: 'w1', ja_existia: false }, error: null }, FRASE_REGISTRO_FALHOU);
    expect(r).toEqual({ ok: true, corpo: { ok: true, id: 'w1', ja_existia: false } });
  });
  it('erro HTTP: a FRASE que a função mandou (403 do não admin), nunca o erro cru', async () => {
    const contexto = new Response(JSON.stringify({ ok: false, frase: 'Só a AGROinBLUE registra o webhook.' }), { status: 403 });
    const r = await lerRespostaDaBorda({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: contexto } }, FRASE_REGISTRO_FALHOU);
    expect(r).toEqual({ ok: false, frase: 'Só a AGROinBLUE registra o webhook.' });
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

describe('OPENFINANCE-P3a — Escolher contas (regras da tela)', () => {
  const bruto = { contas: [
    { account_id: 'a', tipo_legivel: 'Conta corrente', banco: 'Itaú', final4: '1234', titular: 'Fulano T.', documento: '***.1', permitida: true },
    { account_id: 'b', tipo_legivel: 'Cartão de crédito', banco: 'Itaú', final4: null, titular: null, documento: null, permitida: false },
    { tipo_legivel: 'sem id' },
  ] };
  it('a lista só com conta que tem id; de partida, SÓ a já permitida vem marcada', () => {
    const l = contasDaResposta(bruto);
    expect(l.map(c => c.accountId)).toEqual(['a', 'b']);
    expect([...marcadasDePartida(l)]).toEqual(['a']);
    expect(contasDaResposta({})).toEqual([]);
  });
  it('mudou = a escolha difere do permitido (mesmo tamanho, outra conta, também)', () => {
    const l = contasDaResposta(bruto);
    expect(escolhaMudou(l, new Set(['a']))).toBe(false);
    expect(escolhaMudou(l, new Set(['b']))).toBe(true);
    expect(escolhaMudou(l, new Set())).toBe(true);
    expect(escolhaMudou(l, new Set(['a', 'b']))).toBe(true);
  });
  it('frases: prévia e gravado; o item do Widget', () => {
    expect(frasePrevia({ ligar: 1, manter: 2, desligar: 3 })).toMatch(/^Entram 1 · continuam 2 · saem 3\./);
    expect(fraseDoPermitir({ ligar: 0, manter: 0 })).toMatch(/^Nenhuma conta/);
    expect(fraseDoPermitir({ ligar: 1, manter: 1 })).toMatch(/^Escolha gravada: 2 contas entram/);
    expect(itemDoSucesso({ item: { id: 'i-1' } })).toBe('i-1');
    expect(itemDoSucesso({})).toBeNull();
  });
});

describe('OPENFINANCE-PRONTO-NJ-01 — as regras da tela', () => {
  it('(8) VÊ: o admin, o proprietário e o gestor; o financeiro e o campo não', () => {
    expect(podeVerOpenFinance(true, 'financeiro')).toBe(true);
    expect(podeVerOpenFinance(false, 'proprietario')).toBe(true);
    expect(podeVerOpenFinance(false, 'gestor_cliente')).toBe(true);
    expect(podeVerOpenFinance(false, 'financeiro')).toBe(false);
    expect(podeVerOpenFinance(false, 'campo')).toBe(false);
    expect(podeVerOpenFinance(false, null)).toBe(false);
  });
  it('(8) CONECTA: só o admin e o proprietário; o gestor só vê (Gabriel 15:36)', () => {
    expect(podeConectarOpenFinance(true, 'gestor_cliente')).toBe(true);
    expect(podeConectarOpenFinance(false, 'proprietario')).toBe(true);
    expect(podeConectarOpenFinance(false, 'gestor_cliente')).toBe(false);
    expect(podeConectarOpenFinance(false, 'financeiro')).toBe(false);
    expect(podeConectarOpenFinance(false, null)).toBe(false);
    expect(MOTIVO_SO_PROPRIETARIO).toBe('Só o proprietário conecta os bancos.');
  });
  it('(1)+(7) as conexões da função: situação desconhecida ou sem id fica de fora; sem banco = "Banco"', () => {
    expect(conexoesDaResposta({ conexoes: [
      { item_id: 'i1', banco: 'Sicredi', empresa: false, situacao: 'conectado', frase: null, criado_em: '2026-11-25T13:47:35Z' },
      { item_id: 'i2', situacao: 'erro', frase: 'O banco esperou a confirmação no app e o tempo acabou. Tente de novo com o celular em mãos.' },
      { item_id: 'i3', situacao: 'inventada' }, { situacao: 'conectado' }, 'lixo',
    ] })).toEqual([
      { itemId: 'i1', banco: 'Sicredi', empresa: false, situacao: 'conectado', frase: null, criadoEm: '2026-11-25T13:47:35Z' },
      { itemId: 'i2', banco: 'Banco', empresa: false, situacao: 'erro', frase: 'O banco esperou a confirmação no app e o tempo acabou. Tente de novo com o celular em mãos.', criadoEm: null },
    ]);
    expect(conexoesDaResposta({})).toEqual([]);
    expect(lendoDaResposta({ lendo: true })).toBe(true);
    expect(lendoDaResposta({ lendo: 'sim' })).toBe(false);
  });
  it('(1) a conta da Pluggy traz o tipo e a agência (para a sugestão)', () => {
    const [cc, cartao] = contasDaResposta({ contas: [
      { account_id: 'a', tipo: 'BANK', agencia: '0748', final4: '9823' }, { account_id: 'b', tipo: 'CREDIT', agencia: null }] });
    expect(cc).toMatchObject({ tipo: 'BANK', agencia: '0748' });
    expect(cartao).toMatchObject({ tipo: 'CREDIT', agencia: null });
  });
  it('(1) o plano da gravação: entra o marcado; liga só a conta corrente marcada cuja escolha MUDOU; o cartão nunca liga; a mesma conta do sistema 2× bloqueia', () => {
    const conta = (accountId: string, tipo: 'BANK' | 'CREDIT', final4: string): ContaDaConexao => ({ accountId, tipo, final4, tipoLegivel: tipo === 'BANK' ? 'Conta corrente' : 'Cartão de crédito',
      banco: 'Sicredi', titular: null, documento: null, permitida: false, agencia: null });
    const contas = [conta('cc1', 'BANK', '9823'), conta('cc2', 'BANK', '4956'), conta('car', 'CREDIT', '9876')];
    const p = planoDaGravacao(contas, new Set(['cc1', 'car']), { cc1: 'k-lav', cc2: 'k-pes' }, {});
    expect(p).toEqual({ accountIds: ['cc1', 'car'], ligacoes: [{ accountId: 'cc1', contaId: 'k-lav' }], repetida: null });
    expect(fraseDasLigacoes(p)).toBe('Liga 1 conta corrente à conta escolhida.');
    expect(planoDaGravacao(contas, new Set(['cc1']), { cc1: 'k-lav' }, { cc1: 'k-lav' }).ligacoes).toEqual([]);   // já está assim
    expect(planoDaGravacao(contas, new Set(['cc1']), { cc1: '' }, { cc1: 'k-lav' }).ligacoes).toEqual([{ accountId: 'cc1', contaId: null }]); // desliga
    expect(planoDaGravacao(contas, new Set(['cc1', 'cc2']), { cc1: 'k-lav', cc2: 'k-lav' }, {}).repetida).toBe('k-lav');
    expect(fraseDasLigacoes(planoDaGravacao(contas, new Set(['cc1', 'cc2']), { cc1: 'a', cc2: 'b' }, {}))).toBe('Liga 2 contas correntes às contas escolhidas.');
    expect(fraseDasLigacoes(planoDaGravacao(contas, new Set(), {}, {}))).toBe('');
  });
});
