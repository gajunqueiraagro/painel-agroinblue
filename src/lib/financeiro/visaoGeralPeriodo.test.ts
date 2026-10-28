import { describe, expect, it } from 'vitest';
import { contarMeses, faixaDoPeriodo } from '@/lib/financeiro/visaoGeral';

/* P147 (Gabriel 27/10 18:25) — o modo "Ano" da Visão Geral é jan a DEZ do ano do mês escolhido, sempre; Últ. 12 e 6 + 6 não mudam */
describe('P147 — faixaDoPeriodo', () => {
  it('Ano com mês out → jan a dez (12 colunas)', () => {
    const [de, ate] = faixaDoPeriodo('ano', '2026-10', '2025-01', '2025-03');
    expect([de, ate]).toEqual(['2026-01', '2026-12']);
    expect(contarMeses(de, ate)).toBe(12);
  });
  it('Ano com mês ago → jan a dez (12 colunas)', () => {
    const [de, ate] = faixaDoPeriodo('ano', '2026-08', '2025-01', '2025-03');
    expect([de, ate]).toEqual(['2026-01', '2026-12']);
    expect(contarMeses(de, ate)).toBe(12);
  });
  it('Ano com mês jan, dez e de outro ano: sempre o ano do mês escolhido inteiro', () => {
    expect(faixaDoPeriodo('ano', '2026-01', '', '')).toEqual(['2026-01', '2026-12']);
    expect(faixaDoPeriodo('ano', '2026-12', '', '')).toEqual(['2026-01', '2026-12']);
    expect(faixaDoPeriodo('ano', '2027-03', '', '')).toEqual(['2027-01', '2027-12']);
  });
  it('Últ. 12, 6 + 6 e De → Até não mudam', () => {
    expect(faixaDoPeriodo('u12', '2026-10', '', '')).toEqual(['2025-11', '2026-10']);
    expect(faixaDoPeriodo('66', '2026-10', '', '')).toEqual(['2026-05', '2027-04']);
    expect(faixaDoPeriodo('per', '2026-10', '2026-03', '2025-11')).toEqual(['2025-11', '2026-03']);
  });
});
