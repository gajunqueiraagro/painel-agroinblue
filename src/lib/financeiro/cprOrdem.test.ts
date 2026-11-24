/**
 * CPR-LAYOUT-03 — as regras puras da lista da Contas a Pagar e Receber: a ordem por coluna (padrão vencimento crescente), o saldo em
 * toda linha (fecha no saldo do dia) e a NF só com o número. Dado sintético.
 */
import { describe, expect, it } from 'vitest';
import {
  ORDEM_PADRAO_CPR, faixaDosVencidosCpr, numeroCurtoDoDocCpr, ordenarLinhasCpr, proximaOrdemCpr, saldoAntesDoGrupoCpr, saldoPorLinhaCpr, type ChavesDaLinhaCpr,
} from '@/lib/financeiro/cprOrdem';

interface L { id: string; venc: string | null; comp: string | null; valor: number; desc: string; forn: string; nf: string }
const chaves = (l: L): ChavesDaLinhaCpr => ({
  comp: l.comp, venc: l.venc, descricao: l.desc, fornecedor: l.forn, subcentro: '', nf: l.nf, status: '', valor: l.valor,
});
const l = (id: string, venc: string | null, valor: number, o: Partial<L> = {}): L => ({ id, venc, comp: venc, valor, desc: id, forn: '', nf: '', ...o });
const ids = (ls: L[]) => ls.map((x) => x.id);

describe('a ordem da lista', () => {
  it('padrão = vencimento crescente: o vencido de 08/07 vem ANTES do de 10/11 (era por valor)', () => {
    const dono = [l('grande-10/11', '2026-11-10', -500000), l('pequeno-08/07', '2026-07-08', -100)];
    expect(ORDEM_PADRAO_CPR).toEqual({ coluna: 'venc', sentido: 'asc' });
    expect(ids(ordenarLinhasCpr(dono, ORDEM_PADRAO_CPR, chaves))).toEqual(['pequeno-08/07', 'grande-10/11']);
  });

  it('empate fica na ordem do dono (estável), nos dois sentidos', () => {
    const dono = [l('a', '2026-11-16', 10), l('b', '2026-11-16', -5), l('c', '2026-11-16', -1)];
    expect(ids(ordenarLinhasCpr(dono, { coluna: 'venc', sentido: 'asc' }, chaves))).toEqual(['a', 'b', 'c']);
    expect(ids(ordenarLinhasCpr(dono, { coluna: 'venc', sentido: 'desc' }, chaves))).toEqual(['a', 'b', 'c']);
  });

  it('toda coluna ordena: valor (com sinal), texto sem acento/caixa, NF numérica; vazio vai para o fim nos dois sentidos', () => {
    const dono = [l('x', '2026-11-01', -10, { desc: 'Óleo', forn: 'beta', nf: '9232' }), l('y', null, 50, { desc: 'abate', forn: '', nf: '123771' }),
      l('z', '2026-10-01', -900, { desc: 'Energia', forn: 'Alfa', nf: '' })];
    expect(ids(ordenarLinhasCpr(dono, { coluna: 'valor', sentido: 'desc' }, chaves))).toEqual(['y', 'x', 'z']);
    expect(ids(ordenarLinhasCpr(dono, { coluna: 'descricao', sentido: 'asc' }, chaves))).toEqual(['y', 'z', 'x']);
    expect(ids(ordenarLinhasCpr(dono, { coluna: 'fornecedor', sentido: 'asc' }, chaves))).toEqual(['z', 'x', 'y']);
    expect(ids(ordenarLinhasCpr(dono, { coluna: 'fornecedor', sentido: 'desc' }, chaves))).toEqual(['x', 'z', 'y']);
    expect(ids(ordenarLinhasCpr(dono, { coluna: 'nf', sentido: 'asc' }, chaves))).toEqual(['x', 'y', 'z']);
    expect(ids(ordenarLinhasCpr(dono, { coluna: 'venc', sentido: 'desc' }, chaves))).toEqual(['x', 'z', 'y']);
    /* não mexe na entrada */
    expect(ids(dono)).toEqual(['x', 'y', 'z']);
  });

  it('clicar: a mesma coluna inverte; outra começa crescente (o Valor começa do maior)', () => {
    expect(proximaOrdemCpr(ORDEM_PADRAO_CPR, 'venc')).toEqual({ coluna: 'venc', sentido: 'desc' });
    expect(proximaOrdemCpr({ coluna: 'venc', sentido: 'desc' }, 'venc')).toEqual({ coluna: 'venc', sentido: 'asc' });
    expect(proximaOrdemCpr(ORDEM_PADRAO_CPR, 'fornecedor')).toEqual({ coluna: 'fornecedor', sentido: 'asc' });
    expect(proximaOrdemCpr(ORDEM_PADRAO_CPR, 'valor')).toEqual({ coluna: 'valor', sentido: 'desc' });
  });
});

describe('o saldo em toda linha', () => {
  /* o dia do mock (NJ 16/11): parte de 655.221,99 e fecha em 1.222.873,04 */
  const dia = [447261.84, 125648.87, -1893.33, -1868.75, -1000, -497.58];
  const efeito = (v: number) => v;
  it('corre na ordem desenhada e a ÚLTIMA linha fecha exatamente no saldo do dia', () => {
    const s = saldoPorLinhaCpr(dia, 1222873.04, efeito);
    expect(s).toEqual([1102483.83, 1228132.70, 1226239.37, 1224370.62, 1223370.62, 1222873.04]);
    expect(saldoAntesDoGrupoCpr(dia, 1222873.04, efeito)).toBe(655221.99);
  });
  it('linha que não soma (efeito 0: paga, ponta fora do caixa) repete o saldo de antes', () => {
    expect(saldoPorLinhaCpr([100, 0, -30], 170, efeito)).toEqual([200, 200, 170]);
  });
  it('outra ordem muda os saldos do meio, nunca o fim do dia', () => {
    const s = saldoPorLinhaCpr([...dia].reverse(), 1222873.04, efeito);
    expect(s[s.length - 1]).toBe(1222873.04);
    expect(saldoAntesDoGrupoCpr([...dia].reverse(), 1222873.04, efeito)).toBe(655221.99);
  });
  it('sem saldo do dia (sem caixa conferido): nenhuma linha tem saldo — nunca um número inventado', () => {
    expect(saldoPorLinhaCpr(dia, null, efeito)).toEqual(dia.map(() => null));
    expect(saldoAntesDoGrupoCpr(dia, undefined, efeito)).toBeNull();
  });
});

describe('a NF só com o número (ponto 8)', () => {
  it('"NF 000.009.232" → "9.232"; sem zeros à esquerda fica igual; outro documento fica como o dono escreve', () => {
    expect(numeroCurtoDoDocCpr('NF 000.009.232')).toBe('9.232');
    expect(numeroCurtoDoDocCpr('NF 000.123.771')).toBe('123.771');
    expect(numeroCurtoDoDocCpr('NF 177472')).toBe('177472');
    expect(numeroCurtoDoDocCpr('NF 000.000.000')).toBe('0');
    expect(numeroCurtoDoDocCpr('Rec. 45')).toBe('Rec. 45');
    expect(numeroCurtoDoDocCpr('')).toBe('');
  });
});

describe('a faixa dos vencidos (pontos 2–3)', () => {
  const lado = (valor: number, contas: number) => ({ valor, contas });
  const base = { contam: { pagar: lado(1125822.33, 263), receber: lado(687327.23, 8), linhas: ['a'] }, anteriores: { pagar: lado(10, 20), receber: lado(1, 2) } };
  it('no mês com hoje: quantos, quanto de cada lado e quantos fora do extrato conciliado', () => {
    expect(faixaDosVencidosCpr({ ...base, periodoDe: '2026-11-01', hoje: '2026-11-23', encerrado: false }))
      .toEqual({ contas: 271, pagar: 1125822.33, receber: 687327.23, foraDoExtrato: 22, linhas: ['a'] });
  });
  it('em MÊS FUTURO não aparece (o bloco de 271 contas do print de dezembro); no encerrado também não; sem vencido, nada', () => {
    expect(faixaDosVencidosCpr({ ...base, periodoDe: '2026-12-01', hoje: '2026-11-23', encerrado: false })).toBeNull();
    expect(faixaDosVencidosCpr({ ...base, periodoDe: '2026-10-01', hoje: '2026-11-23', encerrado: true })).toBeNull();
    expect(faixaDosVencidosCpr({ ...base, contam: { pagar: lado(0, 0), receber: lado(0, 0), linhas: [] }, periodoDe: '2026-11-01', hoje: '2026-11-23', encerrado: false })).toBeNull();
  });
});
