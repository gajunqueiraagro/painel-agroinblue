/**
 * DRE-LAYOUT-04 (Gabriel 09/11) — a abertura do DRE da pecuária: ANO CIVIL, de jan até o último mês fechado em TODAS as fazendas
 * (as que têm fechamento no ano). Caso real da Vera (medido 09/11): Baia Grande e 3 Muchachas fechadas até out/26 → jan–out/26.
 */
import { describe, expect, it } from 'vitest';
import { anoCivilAteOUltimoFechado } from './SeletorPeriodoPecuaria';

const f = (fazenda_id: string, ...meses: string[]) => meses.map(ano_mes => ({ fazenda_id, ano_mes }));

describe('abertura do DRE: ano civil até o último mês fechado', () => {
  it('Vera: as duas fazendas fechadas até out/26 → jan–out/26', () => {
    expect(anoCivilAteOUltimoFechado([...f('bg', '2025-12', '2026-09', '2026-10'), ...f('3m', '2026-10', '2026-01')]))
      .toEqual({ de: { ano: 2026, mes: 1 }, ate: { ano: 2026, mes: 10 } });
  });
  it('Global = o último fechado em TODAS: uma fazenda em set segura em set', () => {
    expect(anoCivilAteOUltimoFechado([...f('a', '2026-10'), ...f('b', '2026-09')])?.ate).toEqual({ ano: 2026, mes: 9 });
  });
  it('fazenda sem fechamento no ano (sem gado) não segura o período', () => {
    expect(anoCivilAteOUltimoFechado([...f('a', '2026-10'), ...f('vendida', '2025-06')])?.ate).toEqual({ ano: 2026, mes: 10 });
  });
  it('em janeiro, sem nada fechado no ano novo: o ano anterior inteiro até dez', () => {
    expect(anoCivilAteOUltimoFechado(f('a', '2026-11', '2026-12'))).toEqual({ de: { ano: 2026, mes: 1 }, ate: { ano: 2026, mes: 12 } });
  });
  it('sem fechamento nenhum: null (a tela fica no padrão)', () => {
    expect(anoCivilAteOUltimoFechado([])).toBeNull();
  });
});
