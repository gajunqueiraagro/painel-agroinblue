/**
 * FIN-FINANC-LAYOUT-03 (Gabriel 12/11, regra soberana de 29/10: ordenação em toda tabela) — o dono da ordem das tabelas de financiamento:
 * vazio sempre no fim, empate estável, texto sem acento/caixa com número em ordem de número, e o clique que inverte.
 */
import { describe, expect, it } from 'vitest';
import { compararValores, ordenarPor, proximaOrdem } from './ordemDaTabela';

describe('ordemDaTabela', () => {
  it('vazio (nulo, indefinido, "") vai para o FIM nas duas direções — nunca vira zero nem "a"', () => {
    const l = [{ v: 2 }, { v: null }, { v: 0 }, { v: undefined }, { v: 1 }];
    expect(ordenarPor(l, { col: 'v', dir: 'asc' }, (x) => x.v).map((x) => x.v)).toEqual([0, 1, 2, null, undefined]);
    expect(ordenarPor(l, { col: 'v', dir: 'desc' }, (x) => x.v).map((x) => x.v)).toEqual([2, 1, 0, null, undefined]);
    expect(compararValores('', 'a', 'asc')).toBe(1);
  });
  it('texto sem acento e sem caixa; número dentro do texto em ordem de número', () => {
    const l = ['Parcela 10/15', 'parcela 2/15', 'Ágio', 'abrir'];
    expect(ordenarPor(l, { col: 't', dir: 'asc' }, (x) => x)).toEqual(['abrir', 'Ágio', 'parcela 2/15', 'Parcela 10/15']);
  });
  it('datas ISO em ordem de calendário; empate mantém a ordem do banco (estável)', () => {
    const l = [{ d: '2026-07-22', i: 1 }, { d: '2025-11-21', i: 2 }, { d: '2026-07-22', i: 3 }];
    expect(ordenarPor(l, { col: 'd', dir: 'asc' }, (x) => x.d).map((x) => x.i)).toEqual([2, 1, 3]);
    expect(ordenarPor(l, { col: 'd', dir: 'desc' }, (x) => x.d).map((x) => x.i)).toEqual([1, 3, 2]);
  });
  it('a entrada não muda (cópia)', () => {
    const l = [3, 1, 2];
    ordenarPor(l, { col: 'n', dir: 'asc' }, (x) => x);
    expect(l).toEqual([3, 1, 2]);
  });
  it('o clique: a coluna ativa inverte; outra começa na direção inicial dela', () => {
    expect(proximaOrdem({ col: 'data', dir: 'asc' }, 'data')).toEqual({ col: 'data', dir: 'desc' });
    expect(proximaOrdem({ col: 'data', dir: 'desc' }, 'data')).toEqual({ col: 'data', dir: 'asc' });
    expect(proximaOrdem({ col: 'data', dir: 'desc' }, 'valor')).toEqual({ col: 'valor', dir: 'asc' });
    expect(proximaOrdem({ col: 'data', dir: 'asc' }, 'valor', 'desc')).toEqual({ col: 'valor', dir: 'desc' });
  });
});
