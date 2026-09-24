/**
 * A CASCATA DO ABATE — ABATE-RESUMO-TABELA-01.
 *
 * ⚠ NASCE DE UM NUMERO IMPOSSIVEL NA TELA. O resumo do lançamento mostrava, na OC 8a6295f0
 * (NJ · Faz. Pureza · 14/08/2026 · 18 vacas):
 *     Valor base   104.883,89
 *     Bônus       +  2.499,01
 *     Valor bruto  104.674,12   ← base − funrural
 *     Funrural    −    209,77
 *     Líquido      107.174,97   ← MAIOR que o bruto, com funrural positivo
 * O fallback fazia duas coisas erradas de uma vez: ignorava o bônus e subtraía o funrural,
 * que é justamente o que separa bruto de líquido — então o funrural entrava DUAS vezes na
 * leitura. Medido: 625 de 863 abates não têm `detalhes_snapshot.calculation` e caem nesse
 * caminho; 31 deles têm bônus ou funrural e exibiam o número errado.
 *
 * ⚠ O CASO QUE JUSTIFICA O ARQUIVO É O DO FUNRURAL: ele NÃO pode aparecer no bruto. Um teste
 * que só afirmasse `bruto = base + bônus` passaria verde também numa função que subtraísse o
 * funrural do líquido duas vezes — por isso os dois lados da cascata andam juntos aqui.
 */
import { describe, it, expect } from 'vitest';
import { cascataAbate } from '@/lib/calculos/abate';

describe('cascataAbate', () => {
  it('o bruto soma o bônus e NÃO enxerga o funrural — os números do NJ 14/08/2026', () => {
    const r = cascataAbate(104_883.89, 2_499.01, 0, 209.77);

    expect(r.valorBruto).toBeCloseTo(107_382.90, 2);
    /* ⚠ O QUE A TELA MOSTRAVA, e que este caso existe para reprovar. */
    expect(r.valorBruto).not.toBeCloseTo(104_674.12, 2);

    expect(r.valorLiquido).toBeCloseTo(107_173.13, 2);
    /* Com funrural positivo, o líquido é SEMPRE menor que o bruto. */
    expect(r.valorLiquido).toBeLessThan(r.valorBruto);
  });

  it('descontos saem do bruto; bônus entram', () => {
    const r = cascataAbate(1_000, 100, 40, 0);
    expect(r.valorBruto).toBe(1_060);
    expect(r.valorLiquido).toBe(1_060);
  });

  it('sem bônus, sem desconto e sem funrural, o bruto é a própria base', () => {
    const r = cascataAbate(4_397.32, 0, 0, 0);
    expect(r.valorBruto).toBeCloseTo(4_397.32, 2);
    expect(r.valorLiquido).toBeCloseTo(4_397.32, 2);
  });

  it('só o funrural separa bruto de líquido — Santa Rita 20/08/2026', () => {
    const r = cascataAbate(4_397.32, 0, 0, 71.68);
    expect(r.valorBruto).toBeCloseTo(4_397.32, 2);
    expect(r.valorLiquido).toBeCloseTo(4_325.64, 2);
    /* ⚠ O bruto NÃO se mexe quando o funrural entra: é isso que a versão antiga quebrava. */
    expect(cascataAbate(4_397.32, 0, 0, 0).valorBruto).toBe(r.valorBruto);
  });

  it('não arredonda — quem arredonda é a saída do buildAbateCalculation', () => {
    const r = cascataAbate(0.105, 0.001, 0, 0);
    expect(r.valorBruto).toBeCloseTo(0.106, 10);
  });
});
