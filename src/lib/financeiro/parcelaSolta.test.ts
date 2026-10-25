/**
 * P104 — a parcela lançada SOLTA (PURO). Os números do caso (a NF 46.994: 6 parcelas soltas — 620,85 · 620,80 · 620,83 × 4), descrições
 * SINTÉTICAS.
 *   S1 "k/N" no fim = parcela solta; sem fração (ou N < 2) = à vista · S2 as irmãs: mesmo N, valor a até 5 centavos; a própria conta uma vez
 *   S3 a frase, com e sem o "achadas"
 */
import { describe, it, expect } from 'vitest';
import { achadasDaFracao, fraseDaParcelaSolta, parcelaSolta } from './parcelaSolta';

const D = (k: number, n = 6) => `Tinta sintetica - ${k}/${n}`;
const SEIS = [620.85, 620.80, 620.83, 620.83, 620.83, 620.83].map((v, i) => ({ id: `l${i + 1}`, descricao: D(i + 1), valorCent: Math.round(v * 100) }));

describe('P104 — parcela solta', () => {
  it('S1 a fração no fim da descrição', () => {
    expect(parcelaSolta('Tinta latex - 6/6')).toEqual({ k: 6, n: 6 });
    expect([parcelaSolta('Compra de sal'), parcelaSolta('Lote 1/1'), parcelaSolta(null)]).toEqual([null, null, null]);
  });
  it('S2 as irmãs: as 6 achadas (a própria uma vez); outro N, valor longe ou repetida não contam', () => {
    const alvo = { id: 'l6', valorCent: 62083, fracao: { k: 6, n: 6 } };
    expect(achadasDaFracao(alvo, SEIS)).toBe(6);
    expect(achadasDaFracao(alvo, [...SEIS.slice(0, 2), { id: 'x', descricao: D(3, 5), valorCent: 62083 }, { id: 'y', descricao: D(4), valorCent: 70000 },
      { id: 'z', descricao: D(1), valorCent: 62083 }])).toBe(3);
    expect(achadasDaFracao(alvo, [])).toBe(1);
  });
  it('S3 a frase', () => {
    expect(fraseDaParcelaSolta({ k: 6, n: 6 }, 6)).toBe('Parcela 6/6 lançada solta (sem parcelamento) · achadas 6 de 6');
    expect(fraseDaParcelaSolta({ k: 6, n: 6 }, null)).toBe('Parcela 6/6 lançada solta (sem parcelamento)');
  });
});
