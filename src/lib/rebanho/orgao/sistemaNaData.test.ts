/**
 * REBANHO-ORGAO-01 F3 v3 — o sistema na data do saldo do órgão (dados SINTÉTICOS). A conta: cache do fim do mês ± os lançamentos.
 */
import { describe, it, expect } from 'vitest';
import { depoisDaData, fatosNaData, fimDoMes, rebanhoNaData } from './sistemaNaData';
import type { FatosDoBanco } from './montarDeclaracao';

const FZ = 'fz-1';
const base = (over: Partial<FatosDoBanco>): FatosDoBanco => ({
  desde: '2026-05-04', ate: '2026-11-30', fazendas: [{ id: FZ, nome: 'Fazenda Sintética', uf: 'MS' }],
  nascimentos: [], reclassificacoes: [], mortesConsumo: [], ajustes: [], movimentos: [], rebanhoHoje: [], ...over,
});
const porCat = (xs: { categoria: string; cab: number }[]) => Object.fromEntries(xs.map((x) => [x.categoria, x.cab]));

describe('o sistema na data do saldo', () => {
  it('fim do mês', () => {
    expect(fimDoMes('2026-11')).toBe('2026-11-30');
    expect(fimDoMes('2026-02')).toBe('2026-02-28');
    expect(fimDoMes('2026-12')).toBe('2026-12-31');
  });

  it('cache do MESMO mês: desfaz o que caiu depois da data (nascimento 27/11, morte 25/11, reclassificação 24/11)', () => {
    const f = base({
      rebanhoHoje: [{ fazendaId: FZ, anoMes: '2026-11', categoria: 'mamotes_f', cab: 257 }, { fazendaId: FZ, anoMes: '2026-11', categoria: 'vacas', cab: 554 },
        { fazendaId: FZ, anoMes: '2026-11', categoria: 'desmama_f', cab: 10 }],
      nascimentos: [{ fazendaId: FZ, data: '2026-11-27', categoria: 'mamotes_f', cab: 21 }, { fazendaId: FZ, data: '2026-11-10', categoria: 'mamotes_f', cab: 5 }],
      mortesConsumo: [{ fazendaId: FZ, data: '2026-11-25', tipo: 'morte', categoria: 'vacas', cab: 1 }],
      reclassificacoes: [{ fazendaId: FZ, data: '2026-11-24', de: 'mamotes_f', para: 'desmama_f', cab: 10 }],
    });
    // em 23/11: sem os 21 nascidos em 27/11, com a vaca morta em 25/11, sem a desmama de 24/11
    expect(porCat(rebanhoNaData(f, FZ, '2026-11-23'))).toEqual({ mamotes_f: 257 - 21 + 10, vacas: 555 });
    // no fim do mês = o cache
    expect(porCat(rebanhoNaData(f, FZ, '2026-11-30'))).toEqual({ mamotes_f: 257, vacas: 554, desmama_f: 10 });
  });

  it('cache de mês ANTERIOR: soma o que caiu entre o fim daquele mês e a data (venda, compra, ajuste)', () => {
    const f = base({
      rebanhoHoje: [{ fazendaId: FZ, anoMes: '2026-10', categoria: 'vacas', cab: 100 }, { fazendaId: FZ, anoMes: '2026-10', categoria: 'garrotes', cab: 40 }],
      movimentos: [
        { id: 'v', fazendaId: FZ, tipo: 'venda', data: '2026-11-05', sentido: 'saida', categoria: 'garrotes', cab: 40, egtas: [] },
        { id: 'c', fazendaId: FZ, tipo: 'compra', data: '2026-11-20', sentido: 'entrada', categoria: 'vacas', cab: 5, egtas: [] },
        { id: 'x', fazendaId: FZ, tipo: 'abate', data: '2026-10-15', sentido: 'saida', categoria: 'vacas', cab: 9, egtas: [] },   // já no cache
      ],
      ajustes: [{ fazendaId: FZ, data: '2026-11-25', sentido: 'saida', categoria: 'vacas', cab: 2 }],   // depois da data: não entra
    });
    expect(porCat(rebanhoNaData(f, FZ, '2026-11-23'))).toEqual({ vacas: 105 });
  });

  it('sem cache da fazenda = nada (nunca estima)', () => {
    expect(rebanhoNaData(base({ nascimentos: [{ fazendaId: FZ, data: '2026-11-01', categoria: 'mamotes_f', cab: 3 }] }), FZ, '2026-11-23')).toEqual([]);
  });

  it('os fatos param na data e o aviso conta o que veio depois', () => {
    const f = base({
      rebanhoHoje: [{ fazendaId: FZ, anoMes: '2026-11', categoria: 'mamotes_m', cab: 238 }],
      nascimentos: [{ fazendaId: FZ, data: '2026-11-27', categoria: 'mamotes_m', cab: 26 }, { fazendaId: FZ, data: '2026-10-01', categoria: 'mamotes_m', cab: 36 }],
      mortesConsumo: [{ fazendaId: FZ, data: '2026-11-05', tipo: 'morte', categoria: 'mamotes_m', cab: 3 }],
    });
    const n = fatosNaData(f, '2026-11-23');
    expect(n.nascimentos.map((x) => x.cab)).toEqual([36]);
    expect(n.mortesConsumo.map((x) => x.cab)).toEqual([3]);
    expect(n.ate).toBe('2026-11-23');
    expect(porCat(n.rebanhoHoje)).toEqual({ mamotes_m: 212 });
    expect(depoisDaData(f, FZ, '2026-11-23')).toEqual({ lancamentos: 1, cab: 26 });
  });
});
