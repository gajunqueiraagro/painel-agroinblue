/**
 * PR-CONC-OFX-LINHA-SALDO-01 — a linha de saldo do extrato, com as descrições REAIS gravadas no banco (Itaú, NJ e
 * Santa Rita, jul/26) e os movimentos que começam parecido mas são movimento.
 */
import { describe, it, expect } from 'vitest';
import { ehLinhaDeSaldo, separarLinhasDeSaldo, conferirSaldoDoExtrato } from './linhaDeSaldo';

describe('ehLinhaDeSaldo', () => {
  it.each([
    'SALDO ANTERIOR',
    'SALDO TOTAL DISPONÍVEL DIA',
    'SALDO TOTAL DISPONIVEL DIA',   // sem acento, como outro banco manda
    'saldo anterior',               // caixa não importa
    '  SALDO   TOTAL DISPONÍVEL DIA ',
    'SALDO DO DIA',
    'SDO CTA ANT',
  ])('"%s" é saldo', (d) => expect(ehLinhaDeSaldo(d)).toBe(true));

  it.each([
    'PIX ENVIADO SALDO ANTERIOR JOAO',     // "SALDO" no MEIO de um movimento não conta
    'TED RECEBIDA - SALDO TOTAL DISPONIVEL',
    'SALDO APLIC AUT MAIS',               // começa com SALDO, mas não é nenhum dos saldos medidos
    'SDOCLIENTE LTDA',                    // "SDO" colado não é o prefixo "SDO "
    'Pix - Agendamento - 04/09 05:35 CAMARGO PROMOCAO DE VENDA',
    '',
  ])('"%s" é movimento', (d) => expect(ehLinhaDeSaldo(d)).toBe(false));
});

describe('separarLinhasDeSaldo', () => {
  it('separa preservando a ordem do arquivo', () => {
    const linhas = [
      { descricao: 'SALDO ANTERIOR', n: 1 }, { descricao: 'PIX RECEBIDO', n: 2 },
      { descricao: 'SALDO TOTAL DISPONÍVEL DIA', n: 3 }, { descricao: 'TARIFA', n: 4 },
    ];
    const r = separarLinhasDeSaldo(linhas);
    expect(r.movimentos.map((l) => l.n)).toEqual([2, 4]);
    expect(r.saldos.map((l) => l.n)).toEqual([1, 3]);
  });
});

describe('conferirSaldoDoExtrato', () => {
  const s = (data: string, valor: number, descricao = 'SALDO TOTAL DISPONÍVEL DIA') => ({ data, valor, descricao });
  it('o último do período (em empate de data, o último do arquivo) contra o declarado: confere', () => {
    const r = conferirSaldoDoExtrato([s('2026-08-15', 2494790.27, 'SALDO ANTERIOR'), s('2026-09-14', 1883910.34), s('2026-09-14', 1884687.76)], 1884687.76);
    expect(r).toEqual({ ultimo: { data: '2026-09-14', valor: 1884687.76, descricao: 'SALDO TOTAL DISPONÍVEL DIA' }, confere: true, diferenca: 0 });
  });
  it('diverge: diz a diferença (último − declarado)', () => {
    const r = conferirSaldoDoExtrato([s('2026-09-14', 1884687.76)], 1884000);
    expect(r.confere).toBe(false);
    expect(r.diferenca).toBeCloseTo(687.76, 2);
  });
  it('sem saldo declarado: null, nunca "confere" por ausência', () => {
    expect(conferirSaldoDoExtrato([s('2026-09-14', 10)], null)).toMatchObject({ confere: null, diferenca: null });
  });
  it('sem linha de saldo: nada a conferir', () => {
    expect(conferirSaldoDoExtrato([], 100)).toEqual({ ultimo: null, confere: null, diferenca: null });
  });
});
