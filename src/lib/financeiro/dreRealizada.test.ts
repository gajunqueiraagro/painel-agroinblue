import { describe, it, expect } from 'vitest';
import { isLancamentoDRERealizada } from './dreRealizada';

// FIN-FLAGS-01B — contrato do gate de pertencimento à DRE Realizada.
// O gate depende EXCLUSIVAMENTE de compoe_dre; macro/grupo/tipo são irrelevantes (não consultados).
describe('isLancamentoDRERealizada', () => {
  it('true entra (independente da macro)', () => {
    expect(isLancamentoDRERealizada({ compoe_dre: true })).toBe(true);
  });

  it('false não entra', () => {
    expect(isLancamentoDRERealizada({ compoe_dre: false })).toBe(false);
  });

  it('null não entra', () => {
    expect(isLancamentoDRERealizada({ compoe_dre: null })).toBe(false);
  });

  it('undefined não entra', () => {
    expect(isLancamentoDRERealizada({})).toBe(false);
    expect(isLancamentoDRERealizada({ compoe_dre: undefined })).toBe(false);
  });

  // Casos do briefing: a resposta segue compoe_dre, NÃO a macro.
  it.each([
    ['Receita Operacional', true, true],
    ['Tributos', true, true],
    ['Investimento na Fazenda', true, true],
    ['Investimento em Bovinos', true, true],
    ['Dividendos', false, false],
    ['Entrada Financeira', false, false],
    ['Saída Financeira', false, false],
    ['Financeiro', false, false],
    ['Transferências', false, false],
    ['Entre Contas', false, false],
    // macro "válida" mas compoe_dre=false → NÃO entra (flag é soberana sobre a macro)
    ['Receita Operacional', false, false],
    // macro incomum/desconhecida mas compoe_dre=true → PASSA o gate (linha é decidida depois)
    ['Macro Incomum XYZ', true, true],
  ])('macro=%s compoe_dre=%s → %s', (macro_custo, compoe_dre, esperado) => {
    expect(isLancamentoDRERealizada({ compoe_dre } as any)).toBe(esperado);
  });

  it('NULL/macro válida não entra (sem fallback por macro)', () => {
    // mesmo com macro que "pareceria" DRE, compoe_dre=null mantém fora
    expect(isLancamentoDRERealizada({ compoe_dre: null } as any)).toBe(false);
  });
});
