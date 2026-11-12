/**
 * DRE-VARIACAO-SIMPLES-01 — as contas do modal de 2 abas, sobre fixture SINTÉTICO.
 * Os 3 cenários do briefing: (A) menos @ e @ mais cara (o caso tipo Vera do mock) · (B) mais @ e
 * @ mais barata · (C) categoria que nasceu no período (sem @ no início).
 * ⚠ `producao`/`mercado` são o `vpb`/`efeito` da RPC e, de propósito, diferem em centavos da conta
 * refeita a partir de v0/v1p0/v1p1: o teste prova que a tela LÊ os campos e não refaz a conta.
 */
import { describe, expect, it } from 'vitest';
import {
  datasDasPontas, degrausDoPreco, extratoDasArrobas, linhaDe, mesCurto, notaDoMix, periodoCurto, porCategoria,
  type CatDaVariacao,
} from '@/components/agri/variacaoSimples';
import type { MovimentosPec, ParcelaMov } from '@/hooks/useDrePecuaria';

const cat = (cod: string, jovem: boolean, at0: number, at1: number, pk0: number, pk1: number, centavos = 0.37): CatDaVariacao => {
  const v0 = at0 * pk0; const v1p0 = at1 * pk0; const v1p1 = at1 * pk1;
  return { cod, nome: cod, jovem, at0, at1, v0, v1p0, v1p1, producao: v1p0 - v0 + centavos, mercado: v1p1 - v1p0 - centavos };
};
const p = (arrobas: number): ParcelaMov => ({ cabecas: 0, arrobas, valor: 0 });
const MOV = (o: Partial<Record<keyof MovimentosPec, number>>): MovimentosPec => ({
  inicio: p(0), fim: p(0), produzidas: p(o.produzidas ?? 0), nascimentos: p(o.nascimentos ?? 0), compradas: p(o.compradas ?? 0),
  transf_entrada: p(o.transf_entrada ?? 0), vendas_abates: p(o.vendas_abates ?? 0), mortes: p(o.mortes ?? 0),
  transf_saida: p(o.transf_saida ?? 0), ajustes: p(0), desfrute_por_tipo: null,
});

/* (A) o mock: bezerros +550 @ e mais caros; vacas e bois com menos @; a arroba subiu */
const A = [
  cat('bezerros', true, 2100, 2650, 330, 395),
  cat('desmama', true, 4300, 3900, 300, 350),
  cat('vacas', false, 9800, 9200, 270, 320),
  cat('bois', false, 2250, 1170, 285, 335),
];

describe('variação simples — por categoria', () => {
  it('(A) menos @ e @ mais cara: Produção + Mercado = Valor fim − Valor início, lendo vpb/efeito da RPC', () => {
    const { grupos, total } = porCategoria(A);
    expect(grupos.map(g => g.titulo)).toEqual(['Gado jovem', 'Gado adulto']);
    expect(total.at0).toBe(18450);
    expect(total.at1).toBe(16920);
    expect(total.dAt).toBe(-1530);
    /* a soma das parcelas que a RPC mandou (com os centavos de propósito), não a conta refeita */
    expect(total.producao).toBeCloseTo(A.reduce((s, c) => s + c.producao, 0), 6);
    expect(total.producao).toBeCloseTo(-408300 + 4 * 0.37, 6);
    expect(total.mercado).toBeCloseTo(885750 - 4 * 0.37, 6);
    /* o teste do briefing: Produção + Mercado = Valor fim − Valor início */
    expect(total.total).toBeCloseTo(total.v1 - total.v0, 6);
    expect(total.total).toBeCloseTo(477450, 6);
    /* o preço médio é PONDERADO (valor ÷ @), não a média das categorias */
    expect(total.pk0).toBeCloseTo(5270250 / 18450, 6);
    expect(total.pk1).toBeCloseTo(5747700 / 16920, 6);
    /* subtotais = soma das categorias do grupo */
    expect(grupos[0].subtotal.producao).toBeCloseTo(grupos[0].cats.reduce((s, c) => s + c.producao, 0), 6);
    expect(grupos[1].subtotal.at1).toBe(9200 + 1170);
  });

  it('(B) mais @ e @ mais barata: a produção sobe e o mercado desce', () => {
    const B = [cat('garrotes', true, 1000, 1400, 320, 300), cat('vacas', false, 3000, 3100, 280, 260)];
    const { total } = porCategoria(B);
    expect(total.dAt).toBe(500);
    expect(total.producao).toBeGreaterThan(0);
    expect(total.mercado).toBeLessThan(0);
    expect(total.total).toBeCloseTo(total.v1 - total.v0, 6);
    expect(total.dPkPct).toBeLessThan(0);
  });

  it('(C) categoria que nasceu no período: o R$/@ do início é o do fim valorado a preço do início (o critério do banco)', () => {
    const nova: CatDaVariacao = { cod: 'bois', nome: 'Bois', jovem: false, at0: 0, at1: 500, v0: 0, v1p0: 140000, v1p1: 165000, producao: 140000, mercado: 25000 };
    const l = linhaDe('Bois', [nova]);
    expect(l.pk0).toBe(280);
    expect(l.pk1).toBe(330);
    expect(l.total).toBe(165000);
    expect(l.total).toBe(l.v1 - l.v0);
  });

  it('nota do mix: o Δ% do total fora da faixa das categorias = a mistura explica', () => {
    const { grupos, total } = porCategoria(A);
    const nota = notaDoMix(total, grupos.flatMap(g => g.cats));
    expect(total.dPkPct).toBeCloseTo(18.92, 1);
    expect(nota).toContain('entre 16,7% e 19,7%');
    expect(nota).toContain('mistura do rebanho');
    expect(nota).toContain('dentro de "Produção"');
    expect(notaDoMix(total, grupos[0].cats.slice(0, 1))).toBeNull();
  });
});

describe('variação simples — extrato das @', () => {
  it('o ganho de peso fecha o fim; produzido = ganho + nascimentos; transferência só com ≠ 0', () => {
    const ex = extratoDasArrobas(18450, 16920, MOV({ nascimentos: 1160, vendas_abates: 8700, mortes: 240 }), { inicio: '01/01/2026', fim: '31/10/2026' });
    expect(ex.ganho).toBe(6250);
    expect(ex.produzido).toBe(7410);
    expect(ex.vendido).toBe(8700);
    expect(ex.linhas.map(l => l.chave)).toEqual(['inicio', 'ganho', 'nascimentos', 'compras', 'vendas', 'mortes', 'fim']);
    expect(ex.linhas.filter(l => !l.total).reduce((s, l) => s + l.arrobas, 18450)).toBe(16920);
    const comTransf = extratoDasArrobas(100, 120, MOV({ transf_entrada: 30 }), { inicio: 'a', fim: 'b' });
    expect(comTransf.ganho).toBe(-10);
    expect(comTransf.linhas.map(l => l.chave)).toContain('transf_entrada');
  });
});

describe('variação simples — de onde veio, linha por linha (mock v2)', () => {
  it('(A) 1 + 2 = vpb da RPC ao centavo; 3 = efeito da RPC; 1 + 2 + 3 = Valor fim − Valor início', () => {
    const { total } = porCategoria(A);
    const d = degrausDoPreco(total);
    /* os 3 degraus do preço médio PONDERADO: início · hoje a preço do início · hoje */
    expect(d.p0).toBeCloseTo(5270250 / 18450, 6);
    expect(d.pMeio).toBeCloseTo((2650 * 330 + 3900 * 300 + 9200 * 270 + 1170 * 285) / 16920, 6);
    expect(d.p1).toBeCloseTo(5747700 / 16920, 6);
    /* 1 Quantidade = Δ@ × preço médio do início */
    expect(d.quantidade.dAt).toBe(-1530);
    expect(d.quantidade.vale).toBeCloseTo(-1530 * (5270250 / 18450), 6);
    /* 2 = o resto do vpb DA RPC (com os centavos de propósito do fixture) */
    expect(d.quantidade.vale + d.tipo.vale).toBeCloseTo(A.reduce((s, c) => s + c.producao, 0), 6);
    expect(d.producao).toBeCloseTo(-408300 + 4 * 0.37, 6);
    /* 3 = o efeito da RPC */
    expect(d.mercado.vale).toBeCloseTo(A.reduce((s, c) => s + c.mercado, 0), 6);
    /* total */
    expect(d.quantidade.vale + d.tipo.vale + d.mercado.vale).toBeCloseTo(d.total.v1 - d.total.v0, 6);
    expect(d.total.vale).toBeCloseTo(477450, 6);
  });

  it('(B) mais @ e @ mais barata: quantidade positiva, mercado negativo, e a soma fecha', () => {
    const d = degrausDoPreco(porCategoria([cat('garrotes', true, 1000, 1400, 320, 300), cat('vacas', false, 3000, 3100, 280, 260)]).total);
    expect(d.quantidade.vale).toBeGreaterThan(0);
    expect(d.mercado.vale).toBeLessThan(0);
    expect(d.p1 ?? 0).toBeLessThan(d.pMeio ?? 0);
    expect(d.quantidade.vale + d.tipo.vale + d.mercado.vale).toBeCloseTo(d.total.v1 - d.total.v0, 6);
  });

  it('(C) sem gado no fim: não há preço de hoje (traço), e a soma ainda fecha', () => {
    const fim0: CatDaVariacao = { cod: 'bois', nome: 'Bois', jovem: false, at0: 100, at1: 0, v0: 30000, v1p0: 0, v1p1: 0, producao: -30000, mercado: 0 };
    const d = degrausDoPreco(linhaDe('t', [fim0]));
    expect(d.pMeio).toBeNull();
    expect(d.p1).toBeNull();
    expect(d.quantidade.vale).toBe(-30000);
    expect(d.tipo.vale).toBe(0);
  });
});

describe('variação simples — datas', () => {
  it('datas dd/mm/aaaa: o início é o 1º dia depois de P0; o fim, o último dia de P1', () => {
    expect(datasDasPontas('2025-12', '2026-10')).toEqual({ inicio: '01/01/2026', fim: '31/10/2026' });
    expect(datasDasPontas('2026-01', '2026-02')).toEqual({ inicio: '01/02/2026', fim: '28/02/2026' });
    /* v4 (Chat 08:35): os títulos curtos */
    expect(mesCurto('2025-12')).toBe('dez/25');
    expect(periodoCurto('2024-12', '2025-09')).toBe('jan–set/25');
    expect(periodoCurto('2025-06', '2026-06')).toBe('jul/25–jun/26');
  });
});
