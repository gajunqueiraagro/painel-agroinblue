/**
 * DRE-VARIACAO-EXPLICA-01 fatia 1b — a explicação da variação, com os números REAIS da Vera · Baia Grande jan→set/26
 * (ensaio de 08/11 07:51 da 115300, já com a 116220): v0 3.248.845,98 · vpb −293.185,98 · efeito 128.740,09 · ágio −53.695,80 ·
 * v1_p1 3.084.400,09; @ dez/25 10.183,70 e set/26 9.578,67 (a série da V4).
 */
import { describe, expect, it } from 'vitest';
import {
  cardsDaProducao, fimPeloCadastro, fraseDaVariacao, linhaV6, ponteEmReais, producaoSemAgio, serieV4, type TotaisDaVariacao,
} from './variacaoExplica';

const BG: TotaisDaVariacao = {
  v0: 3248845.98, v1_p0: 3248845.98 - 293185.98, v1_p1: 3084400.09, vpb: -293185.98, efeito: 128740.09, agio: -53695.80,
  at0: 10183.70, at1: 9578.67, p1_fonte: 'fechamento',
};
const R = { p0: 'dez/25', p1: 'set/26' };
const soma = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);

describe('ponte em R$ (V1)', () => {
  it('Detalhado: Início + Produção + Evolução + Mercado = Fim, ao centavo (BG real)', () => {
    const p = ponteEmReais(BG, R, { resumido: false, reposicao: null });
    expect(p.map(x => x.chave)).toEqual(['inicio', 'producao', 'evolucao', 'mercado', 'fim']);
    expect(p[1].valor).toBeCloseTo(-239490.18, 2);
    expect(p[2].valor).toBeCloseTo(-53695.80, 2);
    expect(soma(p.slice(0, 4).map(x => x.valor))).toBeCloseTo(p[4].valor ?? NaN, 2);
    expect(p[0].rotulo).toBe('Valia em dez/25');
  });
  it('Resumido (D2/F3): sem as pontas, com a Reposição, e termina na linha da grade', () => {
    const p = ponteEmReais(BG, R, { resumido: true, reposicao: 100000 });
    expect(p.map(x => x.chave)).toEqual(['producao', 'evolucao', 'reposicao', 'linha']);
    expect(p[2].valor).toBe(-100000);
    expect(p[3].valor).toBeCloseTo(-293185.98 - 100000, 2);
  });
  it('Resumido sem reposição lida: a reposição e a linha são "—", nunca zero', () => {
    const p = ponteEmReais(BG, R, { resumido: true, reposicao: null });
    expect(p[2].valor).toBeNull();
    expect(p[3].valor).toBeNull();
  });
  it('D3: fim pelo cadastro = mercado "—" (o resto da ponte fica)', () => {
    const t: TotaisDaVariacao = { ...BG, p1_fonte: 'cadastro', efeito: 0, v1_p1: BG.v1_p0 };
    expect(fimPeloCadastro(t)).toBe(true);
    const p = ponteEmReais(t, R, { resumido: false, reposicao: null });
    expect(p[3].valor).toBeNull();
    expect(cardsDaProducao(t).mercado).toBeNull();
  });
  it('sem a chave do ágio: Produção = vpb inteiro e Evolução "—"', () => {
    const t = { ...BG, agio: null };
    expect(producaoSemAgio(t)).toBe(BG.vpb);
    expect(ponteEmReais(t, R, { resumido: false, reposicao: null })[2].valor).toBeNull();
  });
});

describe('cards da Produção (V2, A2)', () => {
  it('Quantidade + Composição = a barra Produção (vpb − ágio)', () => {
    const c = cardsDaProducao(BG);
    expect((c.quantidade ?? NaN) + (c.composicao ?? NaN)).toBeCloseTo(producaoSemAgio(BG), 2);
    expect(c.quantidade).toBeCloseTo((9578.67 - 10183.70) * (3248845.98 / 10183.70), 2);
    expect(c.mercado).toBe(128740.09);
  });
  it('rebanho do início zerado: sem preço médio, a Quantidade é "—"', () => {
    expect(cardsDaProducao({ ...BG, at0: 0, v0: 0 }).quantidade).toBeNull();
  });
});

describe('V6 e V4', () => {
  it('participação em @ e Δ p.p. sobre o total', () => {
    const l = linhaV6({ nome: 'Vacas', q0: 100, q1: 90, at0: 1000, at1: 900, v0: 300000, v1p0: 270000, v1p1: 280000, vpb: -30000, efeito: 10000, agio: 0 },
      { at0: 4000, at1: 4500 });
    expect(l.part0).toBe(25);
    expect(l.part1).toBe(20);
    expect(l.dPart).toBe(-5);
    expect(l.pk0).toBe(300);
    expect(l.dCabPct).toBe(-10);
  });
  it('mês do cadastro: sem R$/@ do mês ("—"), com o de dez/AA', () => {
    const s = serieV4([{ ano_mes: '2026-08', fonte: 'cadastro', arrobas: 100, v_ref: 30000, v_mes: null },
      { ano_mes: '2026-09', fonte: 'fechamento', arrobas: 200, v_ref: 60000, v_mes: 64000 }]);
    expect(s[0]).toEqual({ ano_mes: '2026-08', arrobas: 100, pkRef: 300, pkMes: null, cadastro: true });
    expect(s[1].pkMes).toBe(320);
  });
});

describe('frase (V5)', () => {
  it('os números da tela, em pt-BR, com o sinal certo', () => {
    const f = fraseDaVariacao(BG, R);
    expect(f).toContain('De dez/25 a set/26');
    expect(f).toContain('−605 @');
    expect(f).toContain('evolução de categoria, −R$ 53.696');
    expect(f).toContain('variação por produção do DRE: −R$ 293.186');
    expect(f).toContain('o mercado: +R$ 128.740');
  });
  it('fim pelo cadastro: o mercado sai sem número', () => {
    expect(fraseDaVariacao({ ...BG, p1_fonte: 'cadastro' }, R)).toContain('O mercado fica sem número');
  });
});
