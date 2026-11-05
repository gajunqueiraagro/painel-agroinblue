/* EVOLUCAO-TABELA-01 (Gabriel 04/11/2026, item 4) — Δ % só com meta significativa; meta pequena = a diferença absoluta ("+17 cab");
   vale também para o card Desfrute do topo (meta pequena em % = a diferença em pontos). */
import { describe, expect, it } from 'vitest';
import { comparacaoComMeta, comparacaoDoCard, META_SIGNIFICATIVA, type LinhaDaEvolucao } from './evolucaoAno';

const L = (p: Partial<LinhaDaEvolucao>): LinhaDaEvolucao => ({ id: 'x', rotulo: 'X', nivel: 'saida', meses: [], acum: null, meta: null, casas: 0, ...p });

describe('comparacaoComMeta (a coluna Δ)', () => {
  it('a régua é 10 (abaixo dela a meta é pequena)', () => expect(META_SIGNIFICATIVA).toBe(10));
  it('meta pequena de cabeças: a diferença, nunca "+1.560%"', () => {
    expect(comparacaoComMeta(L({ acum: 22, meta: 5 }))).toEqual({ tipo: 'absoluta', valor: 17 });
    expect(comparacaoComMeta(L({ acum: 7, meta: 9 }))).toEqual({ tipo: 'absoluta', valor: -2 });
  });
  it('meta de 10 ou mais: o % de sempre', () => {
    expect(comparacaoComMeta(L({ acum: 15, meta: 10 }))).toEqual({ tipo: 'pct', valor: 50 });
  });
  it('bloco de saída (negativo): a diferença é do TAMANHO da saída (−22 contra −5 = +17)', () => {
    expect(comparacaoComMeta(L({ nivel: 'bloco-saida', acum: -22, meta: -5 }))).toEqual({ tipo: 'absoluta', valor: 17 });
  });
  it('em toneladas a régua vale sobre a meta já em t (escala 1000): 9.000 kg é pequena, 10.000 kg não', () => {
    expect(comparacaoComMeta(L({ acum: 12_000, meta: 9_000 }), 1000)).toEqual({ tipo: 'absoluta', valor: 3 });
    expect(comparacaoComMeta(L({ acum: 12_000, meta: 10_000 }), 1000)?.tipo).toBe('pct');
  });
  it('indicador (GMD, lotação) segue no %, por menor que seja; @ produzidas conta como contagem; desfrute em pontos', () => {
    expect(comparacaoComMeta(L({ id: 'gmd', nivel: 'indicador', acum: 0.6, meta: 0.5, casas: 3 }))?.tipo).toBe('pct');
    expect(comparacaoComMeta(L({ id: 'arrobas-produzidas', nivel: 'indicador', acum: 8, meta: 3 }))).toEqual({ tipo: 'absoluta', valor: 5 });
    expect(comparacaoComMeta(L({ id: 'desfrute', nivel: 'indicador', acum: 50.6, meta: 7.1, deltaEmPontos: true }))?.tipo).toBe('pontos');
  });
  it('sem meta ou sem realizado: nada', () => {
    expect(comparacaoComMeta(L({ acum: 3, meta: null }))).toBeNull();
    expect(comparacaoComMeta(L({ acum: null, meta: 3 }))).toBeNull();
  });
});

describe('comparacaoDoCard (os cards do topo)', () => {
  it('Desfrute com meta pequena (7,7%): a diferença em pontos, nunca "657%"', () => {
    const c = comparacaoDoCard(50.6, 7.7, '%');
    expect(c?.tipo).toBe('pontos');
    expect(c?.valor).toBeCloseTo(42.9, 10);
  });
  it('Desfrute com meta de verdade (25%): o % da meta', () => expect(comparacaoDoCard(20, 25, '%')).toEqual({ tipo: 'pct', valor: 80 }));
  it('cabeças com meta pequena: a diferença; com meta grande: o %; sem meta: nada', () => {
    expect(comparacaoDoCard(12, 4, 'cab')).toEqual({ tipo: 'absoluta', valor: 8 });
    expect(comparacaoDoCard(150, 100, 'cab')).toEqual({ tipo: 'pct', valor: 150 });
    expect(comparacaoDoCard(150, 0, 'cab')).toBeNull();
    expect(comparacaoDoCard(null, 10, 'cab')).toBeNull();
  });
});
