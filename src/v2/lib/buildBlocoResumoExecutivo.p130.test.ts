/**
 * P130 — VG Planejamento: a "Receita Silvícola" (arrendamento florestal) não caía em nenhum balde do Bloco e o banner acusava
 * "Planejamento não conciliado: diferença de R$ 1.192.681" no NJ 2026. Regra: a tela nunca filtra o que não mostra — a receita de
 * silvicultura entra no bloco de receitas (linha própria) e o banner some porque PASSA A BATER.
 */
import { describe, expect, it } from 'vitest';
import { buildBlocoResumoExecutivo } from './buildBlocoResumoExecutivo';
import type { SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import metaNj from '../../../scripts/ui-cortes/dados/meta-nj-2026.json';

const s = (v: unknown): string => String(v ?? '');
const n = (v: unknown): number => Number(v ?? 0);

const linha = (grupo: string, macro: string, centro: string, subcentro: string, escopo: string, valorMes: number): SubcentroGrid => ({
  macro_custo: macro, grupo_custo: grupo, centro_custo: centro, subcentro, escopo_negocio: escopo, ordem_exibicao: 0,
  meses: new Array(12).fill(valorMes),
});

/** O grid META do NJ 2026 da bancada (caixa): digitado + calculado da fn_meta_linhas, somados por conta do plano. */
function gridNj2026(): SubcentroGrid[] {
  // plano: [id, macro, grupo, centro, subcentro, escopo, ordem]; planejamento: [fazenda, conta, macro, grupo, centro, subcentro, escopo,
  // mes, valor]; metaLinhas: [regime, fazenda, conta, mes, origem, origem_detalhe, valor] (o `_` do arquivo)
  const plano = new Map<string, SubcentroGrid>();
  const conta = (r: unknown[], o: number, ordem: number): SubcentroGrid => ({
    macro_custo: s(r[o]), grupo_custo: s(r[o + 1]), centro_custo: s(r[o + 2]), subcentro: s(r[o + 3]), escopo_negocio: s(r[o + 4]),
    ordem_exibicao: ordem, meses: new Array(12).fill(0),
  });
  for (const p of metaNj.plano) plano.set(s(p[0]), conta(p, 1, n(p[6])));
  // o digitado traz a classificação da própria conta (pode ser conta do cliente, fora do catálogo global)
  for (const d of metaNj.planejamento) if (!plano.has(s(d[1]))) plano.set(s(d[1]), conta(d, 2, 0));
  const usadas = new Set<string>();
  const somar = (id: string, mes: number, valor: number) => {
    const g = plano.get(id);
    if (!g) throw new Error(`conta fora do plano da bancada: ${id}`);
    g.meses[mes - 1] += valor;
    usadas.add(id);
  };
  for (const d of metaNj.planejamento) somar(s(d[1]), n(d[7]), n(d[8]));
  for (const l of metaNj.metaLinhas) if (s(l[0]) === 'caixa' && s(l[4]) !== 'digitada') somar(s(l[2]), n(l[3]), n(l[6]));
  return [...usadas].map((id) => plano.get(id)).filter((g): g is SubcentroGrid => !!g);
}

describe('P130 — a receita de silvicultura tem linha própria e o Bloco concilia', () => {
  it('sintético: Receita Silvícola vira a linha "Receita Silvicultura", entra no Total Entradas e o banner não acusa', () => {
    const grid = [
      linha('Receita Pecuária', 'Receita Operacional', 'Abates', 'Abates de Machos', 'pecuaria', 1000),
      linha('Receita Silvícola', 'Receita Operacional', 'Arrendamento', 'Arrendamento Florestal', 'silvicultura', 250),
    ];
    const d = buildBlocoResumoExecutivo({ lancFin2025: [], gridMeta2026: grid, saldoInicialMeta: 0 });
    expect(d.receitaSilvicultura.label).toBe('Receita Silvicultura');
    expect(d.receitaSilvicultura.meta).toBe(3000);
    expect(d.totalEntradas.meta).toBe(15000);
    expect(d.diferencaMeta).toBe(0);
    expect(d.conciliado).toBe(true);
  });

  it('NJ 2026 da bancada: a Receita Silvicultura é R$ 1.192.681,44 e o banner some porque bate (diferença < R$ 1)', () => {
    const grid = gridNj2026();
    expect(grid.some((g) => g.grupo_custo === 'Receita Silvícola')).toBe(true);
    const d = buildBlocoResumoExecutivo({ lancFin2025: [], gridMeta2026: grid, saldoInicialMeta: 0 });
    expect(d.receitaSilvicultura.meta).toBeCloseTo(1192681.44, 2);
    expect(Math.abs(d.diferencaMeta)).toBeLessThan(1);
    expect(d.conciliado).toBe(true);
  });

  it('a soma das linhas de entrada é o Total Entradas (nenhuma linha fica fora do total)', () => {
    const d = buildBlocoResumoExecutivo({ lancFin2025: [], gridMeta2026: gridNj2026(), saldoInicialMeta: 0 });
    const linhas = [d.receitaPecuaria, d.receitaAgricultura, d.receitaSilvicultura, d.outrasReceitas, d.entradasFinanceiras];
    expect(linhas.reduce((s, l) => s + l.meta, 0)).toBeCloseTo(d.totalEntradas.meta, 2);
  });
});
