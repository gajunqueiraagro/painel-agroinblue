/**
 * OPENFINANCE-PILOTO-01 — a resposta do Open Finance vira a MESMA fonte da prévia (`FonteDoExtrato`).
 * O fixture é sintético no formato da Pluggy (ver `_origem` no JSON); a Pluggy não é chamada.
 */
import { describe, it, expect } from 'vitest';
import fixture from './openFinance.sandbox.json';
import { fonteDoOpenFinance, diaEmBrasilia, type ContaOpenFinance, type TransacaoOpenFinance } from './openFinance';

const conta: ContaOpenFinance = fixture.conta;
const cartao: ContaOpenFinance = fixture.cartao;
const transacoes: TransacaoOpenFinance[] = fixture.transacoes;
const OPC = { de: '2026-10-01', ate: '2026-11-12', buscadoEm: '2026-11-13', desde: '2026-11-01' };

function lida(t: TransacaoOpenFinance[] = transacoes, opc = OPC) {
  const r = fonteDoOpenFinance(conta, t, opc);
  if (r.ok === false) throw new Error(`recusou: ${r.motivo}`);
  return r;
}

describe('a fonte do Open Finance', () => {
  it('entra só o LANÇADO, uma vez, depois do corte, em ordem de dia — e o relatório diz o que ficou de fora', () => {
    const { fonte, relatorio } = lida();
    expect(fonte.formato).toBe('OPEN_FINANCE');
    expect(fonte.movimentos.map((m) => [m.data, m.valor, m.tipo, m.descricao, m.documento])).toEqual([
      ['2026-11-03', 1500, 'credito', 'PIX RECEBIDO JOAO DA SILVA', 'OF-BB-20261103-0001'],
      ['2026-11-04', -250.4, 'debito', 'TARIFA PACOTE SERVICOS', 'OF-BB-20261104-0002'],
      ['2026-11-04', -80, 'debito', 'PIX ENVIADO FORNECEDOR RACAO', 'OF-BB-20261104-0003'],
      ['2026-11-06', 0.13, 'credito', 'RENDIMENTO POUPANCA AUT', null],
      ['2026-11-06', 0.13, 'credito', 'RENDIMENTO POUPANCA AUT', null],
      ['2026-11-10', 5580, 'credito', 'DEP DINHEIRO AGENCIA', 'OF-BB-20261110-0009'],
      ['2026-11-10', -0.26, 'debito', 'TARIFA DOC AVULSA', 'OF-BB-20261110-0010'],
    ]);
    expect(relatorio).toEqual({
      recebidas: 11, entram: 7, pendentes: 1, zeradas: 1, antesDoCorte: 1, repetidasNaResposta: 1, semData: 0, semDocumento: 2, foraDoPeriodo: 0,
    });
    expect(fonte.linhasInformativas).toBe(1);
  });

  it('o PENDENTE não entra (ainda não é extrato)', () => {
    const { fonte } = lida();
    expect(fonte.movimentos.some((m) => m.descricao.includes('COMPRA CARTAO DEBITO'))).toBe(false);
  });

  it('o sinal vem do type: DEBIT com valor positivo SAI; CREDIT com valor negativo ENTRA', () => {
    const t: TransacaoOpenFinance[] = [
      { id: 'a', amount: 80, date: '2026-11-05', status: 'POSTED', type: 'DEBIT', providerId: 'x1' },
      { id: 'b', amount: -12.5, date: '2026-11-05', status: 'POSTED', type: 'CREDIT', providerId: 'x2' },
      { id: 'c', amount: -7, date: '2026-11-05', status: 'POSTED', type: null, providerId: 'x3' },
    ];
    expect(lida(t).fonte.movimentos.map((m) => [m.valor, m.tipo])).toEqual([[-80, 'debito'], [12.5, 'credito'], [-7, 'debito']]);
  });

  it('a data é o dia em Brasília (a Pluggy manda UTC): 05/11 01:30Z é 04/11', () => {
    expect(diaEmBrasilia('2026-11-05T01:30:00.000Z')).toBe('2026-11-04');
    expect(diaEmBrasilia('2026-11-05T03:00:00.000Z')).toBe('2026-11-05');
    expect(diaEmBrasilia('2026-11-05')).toBe('2026-11-05');
    expect(diaEmBrasilia('lixo')).toBeNull();
  });

  it('o documento é o providerId, nunca o id da Pluggy (que muda ao refazer e ao reconectar)', () => {
    const { fonte } = lida();
    expect(fonte.movimentos.some((m) => (m.documento ?? '').startsWith('tx-'))).toBe(false);
  });

  it('a mesma transação repetida na resposta (página sobreposta) entra uma vez', () => {
    const { fonte } = lida([...transacoes, transacoes[0], transacoes[1]]);
    expect(fonte.movimentos.filter((m) => m.documento === 'OF-BB-20261103-0001')).toHaveLength(1);
    expect(fonte.movimentos).toHaveLength(7);
  });

  it('sem corte entra o de antes (28/10) e o período declarado começa no "de"', () => {
    const { fonte, relatorio } = lida(transacoes, { ...OPC, desde: null });
    expect(relatorio.antesDoCorte).toBe(0);
    expect(fonte.movimentos[0]).toMatchObject({ data: '2026-10-28', valor: -1200 });
    expect(fonte.periodoDeclaradoInicio).toBe('2026-10-01');
  });

  it('com corte o período declarado começa no corte', () => {
    expect(lida().fonte.periodoDeclaradoInicio).toBe('2026-11-01');
    expect(lida().fonte.periodoDeclaradoFim).toBe('2026-11-12');
  });

  it('o saldo declarado é o da conta, com a data da busca; sem saldo = null, nunca zero', () => {
    const { fonte } = lida();
    expect([fonte.saldoDeclarado, fonte.saldoDeclaradoData]).toEqual([15234.56, '2026-11-13']);
    const semSaldo = fonteDoOpenFinance({ ...conta, balance: null }, transacoes, OPC);
    expect(semSaldo.ok && [semSaldo.fonte.saldoDeclarado, semSaldo.fonte.saldoDeclaradoData]).toEqual([null, null]);
  });

  it('cartão de crédito é recusado (a fatura não se importa por aqui), sem ler nada', () => {
    const r = fonteDoOpenFinance(cartao, transacoes, OPC);
    expect(r).toMatchObject({ ok: false, motivo: 'cartao' });
    expect(r.ok === false && r.frase).toMatch(/cartão de crédito/);
  });

  it('movimento de outra conta na resposta: recusa inteira (nunca mistura contas)', () => {
    const r = fonteDoOpenFinance(conta, [...transacoes, { ...transacoes[1], id: 'tx-z', accountId: 'outra' }], OPC);
    expect(r).toMatchObject({ ok: false, motivo: 'outra_conta' });
  });

  it('conta que não é em reais: recusa', () => {
    expect(fonteDoOpenFinance({ ...conta, currencyCode: 'USD' }, transacoes, OPC)).toMatchObject({ ok: false, motivo: 'moeda' });
  });

  it('valor com resto de ponto flutuante vai ao centavo (round2 da casa)', () => {
    const t: TransacaoOpenFinance[] = [
      { id: 'a', amount: -10.006, date: '2026-11-05', status: 'POSTED', type: 'DEBIT', providerId: 'p1' },
      { id: 'b', amount: 0.1 + 0.2, date: '2026-11-05', status: 'POSTED', type: 'CREDIT', providerId: 'p2' },
      { id: 'c', amount: 0.004, date: '2026-11-05', status: 'POSTED', type: 'CREDIT', providerId: 'p3' },
    ];
    const r = lida(t);
    expect(r.fonte.movimentos.map((m) => m.valor)).toEqual([-10.01, 0.3]);
    expect(r.relatorio.zeradas).toBe(1); // 0,004 é zero ao centavo: informativa, não movimento
  });

  it('OF-CONFERIR-CASAMENTO-01 — a borda pede 1 dia a mais de cada lado: no dia de BRASÍLIA, o que cai fora do período não entra', () => {
    const base = { accountId: conta.id, description: 'X', status: 'POSTED', type: 'DEBIT', providerId: 'p', currencyCode: 'BRL' };
    const t: TransacaoOpenFinance[] = [
      { ...base, id: 'antes', amount: -1, date: '2026-10-01T02:00:00.000Z' },   // 30/09 23:00 em Brasília: fora
      { ...base, id: 'primeiro', amount: -2, date: '2026-10-01T03:00:00.000Z' }, // 01/10 00:00: dentro
      { ...base, id: 'ultimo', amount: -3, date: '2026-11-13T02:59:00.000Z' },   // 12/11 23:59: dentro (o 13/11 em UTC)
      { ...base, id: 'depois', amount: -4, date: '2026-11-13T03:00:00.000Z' },   // 13/11 00:00: fora
    ];
    const r = lida(t, { ...OPC, desde: null });
    expect(r.fonte.movimentos.map((m) => [m.data, m.valor])).toEqual([['2026-10-01', -2], ['2026-11-12', -3]]);
    expect(r.relatorio.foraDoPeriodo).toBe(2);
  });
});
