/**
 * OPENFINANCE-P3b — a borda do EXTRATO (`extrato`) e da LIGAÇÃO (`ligarConta`) de `supabase/functions/_shared/pluggy.ts`, com a Pluggy
 * FALSA (fixture sintética; nenhuma chamada real): lê SÓ a conta permitida ligada a esta conta do sistema, desde o corte; a conferência
 * é só leitura e só do período já coberto; o saldo do banco se grava na busca e a falha dele não derruba a busca.
 */
import { describe, expect, it, vi } from 'vitest';
import { extrato, ligarConta, somarDias, transacaoDaPluggy, type Busca, type PecasExtrato, type PecasLigar } from '../../../supabase/functions/_shared/pluggy';

const CLIENTE = '43f32d07-dba8-4670-900c-bf645440c04a';
const CONTA = '131b8501-caf7-4964-b1b1-3f552ad2b75d';
const ITEM = '8b3d384a-0000-4000-8000-000000000001';
const ACC = 'acc-sintetica-7225';
const PERMITIDA = '9a9a9a9a-0000-4000-8000-000000000002';
const resposta = (status: number, corpo: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });

function pluggyFalsa(rotas: Record<string, { status: number; corpo: unknown }>) {
  const pedidos: string[] = [];
  const busca: Busca = async (url, init) => {
    const caminho = url.replace('https://api.pluggy.ai', '');
    pedidos.push(`${init.method} ${caminho}`);
    const r = rotas[`${init.method} ${caminho}`];
    return r ? resposta(r.status, r.corpo) : resposta(404, {});
  };
  return { busca, pedidos };
}
const tx = (id: string, date: string, amount: number, extra: Record<string, unknown> = {}) =>
  ({ id, accountId: ACC, description: `MOV ${id}`, amount, date, status: 'POSTED', type: amount < 0 ? 'DEBIT' : 'CREDIT', providerId: `p-${id}`, currencyCode: 'BRL', ...extra });
/* OF-IMPORTAR-BANCO-QUEBROU-01: o v2 com cursor (o `after` do `next` da página anterior) */
/* OF-CONFERIR-CASAMENTO-01: o pedido à Pluggy leva 1 dia a mais de cada lado do período (`de`/`ate` da resposta não mudam) */
const q = (de: string, ate: string, after?: string) =>
  `GET /v2/transactions?accountId=${ACC}&dateFrom=${somarDias(de, -1)}&dateTo=${somarDias(ate, 1)}` + (after ? `&after=${encodeURIComponent(after)}` : '');
const ROTAS_BASE = {
  'POST /auth': { status: 200, corpo: { apiKey: 'chave-sintetica' } },
  [`GET /items/${ITEM}`]: { status: 200, corpo: { id: ITEM, clientUserId: CLIENTE, connector: { name: 'Itaú' } } },
  [`GET /accounts/${ACC}`]: { status: 200, corpo: { id: ACC, type: 'BANK', subtype: 'CHECKING_ACCOUNT', number: '3722-5', balance: 1234.56, currencyCode: 'BRL', updatedAt: '2026-11-16T21:00:00.000Z' } },
};

function pecas(over: Partial<PecasExtrato> = {}, rotas: Record<string, { status: number; corpo: unknown }> = {}) {
  const p = pluggyFalsa({ ...ROTAS_BASE, ...rotas });
  const registrarSaldo = vi.fn(async () => true);
  const base: PecasExtrato = {
    autorDoToken: async (t) => (t === 'tok-admin' ? 'autor-1' : null),
    ehAdmin: async () => true,
    credenciais: () => ({ clientId: 'c', clientSecret: 's' }),
    busca: p.busca,
    permitidaDaConta: async (cli, conta) => (cli === CLIENTE && conta === CONTA ? { item_id: ITEM, account_id: ACC } : null),
    ultimoDiaDoExtrato: async () => '2026-11-13',
    registrarSaldo,
    ...over,
  };
  return { pecas: base, pedidos: p.pedidos, registrarSaldo: over.registrarSaldo ?? registrarSaldo };
}
const buscar = (extra: Record<string, unknown> = {}) =>
  ({ token: 'tok-admin', acao: 'buscar', clienteId: CLIENTE, contaBancariaId: CONTA, hoje: '2026-11-16', ...extra });

describe('OPENFINANCE-P3b — buscar do banco (só a conta permitida, desde o corte)', () => {
  it('corte = dia seguinte à última linha do extrato; lê só a conta ligada, de 14/11 a hoje; grava o saldo com a hora do banco', async () => {
    const { pecas: pc, pedidos, registrarSaldo } = pecas({}, { [q('2026-11-14', '2026-11-16')]: { status: 200, corpo: { totalPages: 1, results: [tx('a', '2026-11-14T13:00:00Z', -50), tx('b', '2026-11-15T13:00:00Z', 80)] } } });
    const r = await extrato(buscar(), pc);
    expect(r.status).toBe(200);
    if (!r.corpo.ok) throw new Error('falhou');
    expect(r.corpo).toMatchObject({ acao: 'buscar', de: '2026-11-14', ate: '2026-11-16', corte: '2026-11-14', ultimoDia: '2026-11-13' });
    expect(r.corpo.transacoes.map((t) => t.id)).toEqual(['a', 'b']);
    expect(r.corpo.conta).toMatchObject({ balance: 1234.56, saldoEm: '2026-11-16T21:00:00.000Z', type: 'BANK' });
    expect(registrarSaldo).toHaveBeenCalledWith({ p_item: ITEM, p_account: ACC, p_saldo: 1234.56, p_saldo_em: '2026-11-16T21:00:00.000Z', p_autor: 'autor-1' });
    expect(r.corpo.saldoGravado).toBe(true);
    /* nada além do item, da conta permitida e das transações dela */
    expect(pedidos).toEqual(['POST /auth', `GET /items/${ITEM}`, `GET /accounts/${ACC}`, q('2026-11-14', '2026-11-16')]);
  });

  it('segue o cursor (`after` do `next`) repetindo conta e período, até o `next` nulo; não repete transação ilegível', async () => {
    const { pecas: pc, pedidos } = pecas({}, {
      [q('2026-11-14', '2026-11-16')]: { status: 200, corpo: { next: `?accountId=${ACC}&after=cursor-1%3D`, results: [tx('a', '2026-11-14', -1), { id: 'sem-valor', date: '2026-11-14' }] } },
      [q('2026-11-14', '2026-11-16', 'cursor-1=')]: { status: 200, corpo: { next: null, results: [tx('b', '2026-11-15', 2)] } },
    });
    const r = await extrato(buscar(), pc);
    if (!r.corpo.ok) throw new Error('falhou');
    expect(r.corpo.transacoes.map((t) => t.id)).toEqual(['a', 'b']);
    expect(pedidos.filter((p) => p.startsWith('GET /v2/transactions'))).toEqual([q('2026-11-14', '2026-11-16'), q('2026-11-14', '2026-11-16', 'cursor-1=')]);
    expect(pedidos.some((p) => p.startsWith('GET /transactions'))).toBe(false);
  });

  it('cursor que não acaba: para na 20ª página e não importa nada pela metade', async () => {
    const rotas: Record<string, { status: number; corpo: unknown }> = { [q('2026-11-14', '2026-11-16')]: { status: 200, corpo: { next: `?after=c1`, results: [tx('t0', '2026-11-14', -1)] } } };
    for (let i = 1; i <= 25; i++) rotas[q('2026-11-14', '2026-11-16', `c${i}`)] = { status: 200, corpo: { next: `?after=c${i + 1}`, results: [tx(`t${i}`, '2026-11-14', -1)] } };
    const { pecas: pc, pedidos } = pecas({}, rotas);
    const r = await extrato(buscar(), pc);
    expect(r.status).toBe(502);
    expect(pedidos.filter((p) => p.startsWith('GET /v2/transactions'))).toHaveLength(20);
  });

  it('sem extrato na conta: olha 90 dias para trás e não há corte', async () => {
    const de = somarDias('2026-11-16', -90);
    const { pecas: pc } = pecas({ ultimoDiaDoExtrato: async () => null }, { [q(de, '2026-11-16')]: { status: 200, corpo: { totalPages: 1, results: [] } } });
    const r = await extrato(buscar(), pc);
    if (!r.corpo.ok) throw new Error('falhou');
    expect(r.corpo).toMatchObject({ de, corte: null, ultimoDia: null });
  });

  it('extrato já em dia (corte depois de hoje): não pede transação, só o saldo', async () => {
    const { pecas: pc, pedidos } = pecas({ ultimoDiaDoExtrato: async () => '2026-11-16' });
    const r = await extrato(buscar(), pc);
    if (!r.corpo.ok) throw new Error('falhou');
    expect(r.corpo.transacoes).toEqual([]);
    expect(pedidos.some((p) => p.startsWith('GET /v2/transactions'))).toBe(false);
  });

  it('a falha ao gravar o saldo não derruba a busca (saldoGravado = false)', async () => {
    const { pecas: pc } = pecas({ registrarSaldo: async () => { throw new Error('x'); } }, { [q('2026-11-14', '2026-11-16')]: { status: 200, corpo: { totalPages: 1, results: [] } } });
    const r = await extrato(buscar(), pc);
    if (!r.corpo.ok) throw new Error('falhou');
    expect(r.corpo.saldoGravado).toBe(false);
  });

  it('banco sem saldo: não grava saldo (nulo, nunca zero)', async () => {
    const registrarSaldo = vi.fn(async () => true);
    const { pecas: pc } = pecas({ registrarSaldo }, {
      [`GET /accounts/${ACC}`]: { status: 200, corpo: { id: ACC, type: 'BANK' } },
      [q('2026-11-14', '2026-11-16')]: { status: 200, corpo: { totalPages: 1, results: [] } },
    });
    const r = await extrato(buscar(), pc);
    if (!r.corpo.ok) throw new Error('falhou');
    expect(registrarSaldo).not.toHaveBeenCalled();
    expect(r.corpo.saldoGravado).toBeNull();
    expect(r.corpo.conta.balance).toBeNull();
  });
});

describe('OPENFINANCE-P3b — portas fechadas do extrato', () => {
  it('sem login 401; não-admin 403; pedido inválido 400 — sem falar com a Pluggy', async () => {
    const { pecas: pc, pedidos } = pecas({ ehAdmin: async () => false });
    expect((await extrato(buscar({ token: null }), pc)).status).toBe(401);
    expect((await extrato(buscar({ acao: 'gravar' }), pc)).status).toBe(400);
    expect((await extrato(buscar({ contaBancariaId: 'x' }), pc)).status).toBe(400);
    expect((await extrato(buscar(), pc)).status).toBe(403);
    expect(pedidos).toEqual([]);
  });

  it('conta do sistema sem ligação = 404, sem falar com a Pluggy', async () => {
    const { pecas: pc, pedidos } = pecas({ permitidaDaConta: async () => null });
    const r = await extrato(buscar(), pc);
    expect(r.status).toBe(404);
    expect(pedidos).toEqual([]);
  });

  it('conexão de outro cliente = 409, sem ler conta nem transação', async () => {
    const { pecas: pc, pedidos } = pecas({}, { [`GET /items/${ITEM}`]: { status: 200, corpo: { id: ITEM, clientUserId: 'outro' } } });
    const r = await extrato(buscar(), pc);
    expect(r.status).toBe(409);
    expect(pedidos).toEqual(['POST /auth', `GET /items/${ITEM}`]);
  });

  it('a Pluggy devolve outra conta ou um cartão: nada lido', async () => {
    const outra = pecas({}, { [`GET /accounts/${ACC}`]: { status: 200, corpo: { id: 'acc-de-outro', type: 'BANK' } } });
    expect((await extrato(buscar(), outra.pecas)).status).toBe(502);
    const cartao = pecas({}, { [`GET /accounts/${ACC}`]: { status: 200, corpo: { id: ACC, type: 'CREDIT' } } });
    expect((await extrato(buscar(), cartao.pecas)).status).toBe(400);
    expect(cartao.pedidos.some((p) => p.includes('/transactions'))).toBe(false);
  });

  it('erro ao ler a ligação ou o extrato = 500 sem falar com a Pluggy; erro nas transações = 502 e o saldo NÃO se grava', async () => {
    expect((await extrato(buscar(), pecas({ permitidaDaConta: async () => 'erro' }).pecas)).status).toBe(500);
    expect((await extrato(buscar(), pecas({ ultimoDiaDoExtrato: async () => 'erro' }).pecas)).status).toBe(500);
    const { pecas: pc, registrarSaldo } = pecas({}, { [q('2026-11-14', '2026-11-16')]: { status: 500, corpo: {} } });
    expect((await extrato(buscar(), pc)).status).toBe(502);
    expect(registrarSaldo).not.toHaveBeenCalled();
  });

  it('a recusa da Pluggy nas transações: a frase diz o status e a fila guarda status + código (nada da mensagem dela)', async () => {
    const registrarFalha = vi.fn(async () => true);
    const { pecas: pc } = pecas({ registrarFalha }, {
      [q('2026-11-14', '2026-11-16')]: { status: 400, corpo: { code: 400, codeDescription: 'INVALID_PARAMETERS', message: 'Conta de Fulano CPF 123' } },
    });
    const r = await extrato(buscar(), pc);
    expect(r.status).toBe(502);
    expect(r.corpo).toMatchObject({ ok: false, frase: 'Não consegui ler o extrato no banco (Pluggy 400). Nada foi lido; tente de novo.' });
    expect(registrarFalha).toHaveBeenCalledWith({ item_id: ITEM, account_id: ACC, erro_codigo: '400 INVALID_PARAMETERS' });
    expect(JSON.stringify(registrarFalha.mock.calls)).not.toContain('Fulano');
  });

  it('o resumo da leitura vai à fila só com contagens por dia de Brasília e status (nenhum valor, nome ou descrição)', async () => {
    const resumos: string[] = [];
    const registrarLeitura = async (p: { resumo: string }) => { resumos.push(p.resumo); return true; };
    const { pecas: pc } = pecas({ registrarLeitura }, {
      [q('2026-11-14', '2026-11-16')]: { status: 200, corpo: { next: null, results: [tx('a', '2026-11-14T13:00:00Z', -50, { description: 'PIX FULANO' }), tx('b', '2026-11-15T02:30:00Z', 80), tx('c', '2026-11-16T13:00:00Z', 1, { status: 'PENDING' })] } },
    });
    const r = await extrato(buscar(), pc);
    expect(r.status).toBe(200);
    const resumo = resumos[0] ?? '';
    expect(resumo).toBe('buscar 2026-11-14..2026-11-16 (pedido 2026-11-13..2026-11-17) · 3 recebidas · POSTED 2 · PENDING 1 · por dia: 14/11:2 16/11:1');
    expect(resumo).not.toMatch(/FULANO|50|80/);
  });

  it('a trilha da falha que quebra não muda a resposta', async () => {
    const { pecas: pc } = pecas({ registrarFalha: async () => { throw new Error('x'); } }, { [q('2026-11-14', '2026-11-16')]: { status: 503, corpo: null } });
    const r = await extrato(buscar(), pc);
    expect(r.status).toBe(502);
    expect(r.corpo).toMatchObject({ frase: 'Não consegui ler o extrato no banco (Pluggy 503). Nada foi lido; tente de novo.' });
  });

  it('a resposta nunca leva a chave da API', async () => {
    const { pecas: pc } = pecas({}, { [q('2026-11-14', '2026-11-16')]: { status: 200, corpo: { totalPages: 1, results: [] } } });
    expect(JSON.stringify((await extrato(buscar(), pc)).corpo)).not.toContain('chave-sintetica');
  });
});

describe('OPENFINANCE-P3b — conferir (só leitura, período já no extrato)', () => {
  const conferir = (de: unknown, ate: unknown) => buscar({ acao: 'conferir', de, ate });
  it('01–13/11: lê o período pedido e NÃO grava o saldo', async () => {
    const { pecas: pc, registrarSaldo } = pecas({}, { [q('2026-11-01', '2026-11-13')]: { status: 200, corpo: { totalPages: 1, results: [tx('a', '2026-11-03', -10)] } } });
    const r = await extrato(conferir('2026-11-01', '2026-11-13'), pc);
    if (!r.corpo.ok) throw new Error('falhou');
    expect(r.corpo).toMatchObject({ acao: 'conferir', de: '2026-11-01', ate: '2026-11-13', saldoGravado: null });
    expect(registrarSaldo).not.toHaveBeenCalled();
  });
  it('recusa: depois da última linha, período invertido, data inválida, mais de 62 dias, conta sem extrato', async () => {
    const { pecas: pc, pedidos } = pecas();
    expect((await extrato(conferir('2026-11-01', '2026-11-14'), pc)).status).toBe(400);
    expect((await extrato(conferir('2026-11-10', '2026-11-01'), pc)).status).toBe(400);
    expect((await extrato(conferir('2026-02-30', '2026-11-01'), pc)).status).toBe(400);
    expect((await extrato(conferir('2026-09-01', '2026-11-13'), pc)).status).toBe(400);
    expect((await extrato(conferir('2026-11-01', '2026-11-13'), pecas({ ultimoDiaDoExtrato: async () => null }).pecas)).status).toBe(400);
    expect(pedidos).toEqual([]);
  });
  it('62 dias cabem', async () => {
    const de = somarDias('2026-11-13', -61);
    const { pecas: pc } = pecas({}, { [q(de, '2026-11-13')]: { status: 200, corpo: { totalPages: 1, results: [] } } });
    expect((await extrato(conferir(de, '2026-11-13'), pc)).status).toBe(200);
  });
});

describe('OPENFINANCE-P3b — a transação que volta à tela (lista fechada de campos)', () => {
  it('só os campos da prévia; sem valor numérico = fora', () => {
    const t = transacaoDaPluggy({ ...tx('a', '2026-11-14', -5), creditCardMetadata: { x: 1 }, merchant: { cnpj: '123' }, paymentData: { payer: { documentNumber: '1' } } });
    expect(Object.keys(t ?? {}).sort()).toEqual(['accountId', 'amount', 'currencyCode', 'date', 'description', 'id', 'providerId', 'status', 'type']);
    expect(transacaoDaPluggy({ id: 'x', date: '2026-11-14', amount: '5' })).toBeNull();
  });
});

describe('OPENFINANCE-P3b — ligar a conta do banco à conta do sistema', () => {
  const pedido = (extra: Record<string, unknown> = {}) => ({ token: 'tok-admin', clienteId: CLIENTE, permitidaId: PERMITIDA, contaBancariaId: CONTA, ...extra });
  const pecasLigar = (over: Partial<PecasLigar> = {}): PecasLigar => ({
    autorDoToken: async (t) => (t === 'tok-admin' ? 'autor-1' : null),
    ehAdmin: async () => true,
    ligar: async () => ({ ok: true, corpo: { mudou: true, simulado: false } }),
    ...over,
  });
  it('liga com o autor do token e repassa a prévia', async () => {
    const ligar = vi.fn(async () => ({ ok: true as const, corpo: { mudou: true, simulado: true } }));
    const r = await ligarConta(pedido({ simular: true }), pecasLigar({ ligar }));
    expect(r.status).toBe(200);
    expect(ligar).toHaveBeenCalledWith({ p_cliente: CLIENTE, p_permitida: PERMITIDA, p_conta: CONTA, p_autor: 'autor-1', p_simular: true });
  });
  it('conta nula = desligar; ausente ou inválida = 400', async () => {
    const ligar = vi.fn(async () => ({ ok: true as const, corpo: {} }));
    expect((await ligarConta(pedido({ contaBancariaId: null }), pecasLigar({ ligar }))).status).toBe(200);
    expect(ligar).toHaveBeenCalledWith(expect.objectContaining({ p_conta: null, p_simular: false }));
    expect((await ligarConta(pedido({ contaBancariaId: undefined }), pecasLigar())).status).toBe(400);
    expect((await ligarConta(pedido({ contaBancariaId: 'x' }), pecasLigar())).status).toBe(400);
  });
  it('401 / 403 antes de gravar; as recusas do banco viram frase', async () => {
    const ligar = vi.fn(async () => ({ ok: true as const, corpo: {} }));
    expect((await ligarConta(pedido({ token: null }), pecasLigar({ ligar }))).status).toBe(401);
    expect((await ligarConta(pedido(), pecasLigar({ ligar, ehAdmin: async () => false }))).status).toBe(403);
    expect(ligar).not.toHaveBeenCalled();
    for (const [codigo, status] of [['42501', 409], ['23505', 409], ['22023', 400], [null, 500]] as const) {
      const r = await ligarConta(pedido(), pecasLigar({ ligar: async () => ({ ok: false, codigo }) }));
      expect(r.status).toBe(status);
      expect(r.corpo.frase).toMatch(/Nada foi gravado/);
    }
  });
});
