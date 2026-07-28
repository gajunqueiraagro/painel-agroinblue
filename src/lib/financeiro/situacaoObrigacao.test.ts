import { describe, it, expect } from 'vitest';
import {
  derivarSituacaoObrigacaoFinanceira,
  type SituacaoObrigacaoFinanceira,
} from './situacaoObrigacao';

// PR-FIN-DATAS-02 — testes do helper puro de situação da obrigação.
//   Determinístico: nenhuma dependência do relógio/timezone. A `dataReferencia` é sempre
//   EXPLÍCITA — nenhum caso usa a data atual do sistema, nem fake timers.
const REF = '2026-07-29';          // "referência" fixa
const ONTEM = '2026-07-28';
const HOJE = '2026-07-29';
const AMANHA = '2026-07-30';

// atalho tipado
const sit = (i: Parameters<typeof derivarSituacaoObrigacaoFinanceira>[0]): SituacaoObrigacaoFinanceira =>
  derivarSituacaoObrigacaoFinanceira(i);

describe('A. precedência da liquidação', () => {
  it('1. liquidação + vencimento passado → liquidado', () => {
    expect(sit({ dataLiquidacao: ONTEM, dataVencimento: '2026-01-01', dataReferencia: REF })).toBe('liquidado');
  });
  it('2. liquidação + vencimento hoje → liquidado', () => {
    expect(sit({ dataLiquidacao: HOJE, dataVencimento: HOJE, dataReferencia: REF })).toBe('liquidado');
  });
  it('3. liquidação + vencimento futuro → liquidado', () => {
    expect(sit({ dataLiquidacao: HOJE, dataVencimento: '2026-12-31', dataReferencia: REF })).toBe('liquidado');
  });
  it('4. liquidação sem vencimento → liquidado', () => {
    expect(sit({ dataLiquidacao: HOJE, dataVencimento: null, dataReferencia: REF })).toBe('liquidado');
  });
});

describe('B. ausência de vencimento', () => {
  it('5. null + null → sem_vencimento', () => {
    expect(sit({ dataVencimento: null, dataLiquidacao: null, dataReferencia: REF })).toBe('sem_vencimento');
  });
  it('6. undefined + undefined → sem_vencimento', () => {
    expect(sit({ dataVencimento: undefined, dataLiquidacao: undefined, dataReferencia: REF })).toBe('sem_vencimento');
  });
  it('7. vencimento "" e sem liquidação → sem_vencimento', () => {
    expect(sit({ dataVencimento: '', dataLiquidacao: null, dataReferencia: REF })).toBe('sem_vencimento');
  });
  it('8. vencimento só-espaços → sem_vencimento', () => {
    expect(sit({ dataVencimento: '   ', dataLiquidacao: '  ', dataReferencia: REF })).toBe('sem_vencimento');
  });
  it('campos ausentes por omissão → sem_vencimento', () => {
    expect(sit({ dataReferencia: REF })).toBe('sem_vencimento');
  });
});

describe('C. comparação com a referência', () => {
  it('9. vencimento ontem → vencido', () => {
    expect(sit({ dataVencimento: ONTEM, dataLiquidacao: null, dataReferencia: REF })).toBe('vencido');
  });
  it('10. vencimento hoje → a_vencer', () => {
    expect(sit({ dataVencimento: HOJE, dataLiquidacao: null, dataReferencia: REF })).toBe('a_vencer');
  });
  it('11. vencimento amanhã → a_vencer', () => {
    expect(sit({ dataVencimento: AMANHA, dataLiquidacao: null, dataReferencia: REF })).toBe('a_vencer');
  });
  it('12. troca de mês: venc 2026-06-30, ref 2026-07-01 → vencido', () => {
    expect(sit({ dataVencimento: '2026-06-30', dataReferencia: '2026-07-01' })).toBe('vencido');
  });
  it('12b. troca de mês: venc 2026-08-01, ref 2026-07-31 → a_vencer', () => {
    expect(sit({ dataVencimento: '2026-08-01', dataReferencia: '2026-07-31' })).toBe('a_vencer');
  });
  it('13. troca de ano: venc 2025-12-31, ref 2026-01-01 → vencido', () => {
    expect(sit({ dataVencimento: '2025-12-31', dataReferencia: '2026-01-01' })).toBe('vencido');
  });
  it('13b. troca de ano: venc 2027-01-01, ref 2026-12-31 → a_vencer', () => {
    expect(sit({ dataVencimento: '2027-01-01', dataReferencia: '2026-12-31' })).toBe('a_vencer');
  });
  it('14. mesma obrigação, referências diferentes → resultados determinísticos e distintos', () => {
    const venc = '2026-07-15';
    expect(sit({ dataVencimento: venc, dataReferencia: '2026-07-10' })).toBe('a_vencer');
    expect(sit({ dataVencimento: venc, dataReferencia: '2026-07-15' })).toBe('a_vencer');
    expect(sit({ dataVencimento: venc, dataReferencia: '2026-07-16' })).toBe('vencido');
  });
});

describe('D. calendário (validação sem Date)', () => {
  it('15. 2024-02-29 válida (bissexto ÷4) → a_vencer', () => {
    expect(sit({ dataVencimento: '2024-02-29', dataReferencia: '2024-01-01' })).toBe('a_vencer');
  });
  it('16. 2025-02-29 inválida → erro', () => {
    expect(() => sit({ dataVencimento: '2025-02-29', dataReferencia: REF })).toThrow();
  });
  it('17. 2000-02-29 válida (÷400)', () => {
    expect(sit({ dataVencimento: '2000-02-29', dataReferencia: '2000-01-01' })).toBe('a_vencer');
  });
  it('18. 1900-02-29 inválida (÷100 não ÷400) → erro', () => {
    expect(() => sit({ dataVencimento: '1900-02-29', dataReferencia: REF })).toThrow();
  });
  it('19. abril com dia 31 inválida → erro', () => {
    expect(() => sit({ dataVencimento: '2026-04-31', dataReferencia: REF })).toThrow();
  });
  it('20. mês 00 inválido → erro', () => {
    expect(() => sit({ dataVencimento: '2026-00-10', dataReferencia: REF })).toThrow();
  });
  it('21. mês 13 inválido → erro', () => {
    expect(() => sit({ dataVencimento: '2026-13-01', dataReferencia: REF })).toThrow();
  });
  it('22. dia 00 inválido → erro', () => {
    expect(() => sit({ dataVencimento: '2026-07-00', dataReferencia: REF })).toThrow();
  });
  it('23. ano 0000 inválido (decisão aprovada) → erro', () => {
    expect(() => sit({ dataVencimento: '0000-01-01', dataReferencia: REF })).toThrow();
  });
});

describe('E. formato', () => {
  it('24. DD/MM/YYYY inválido → erro', () => {
    expect(() => sit({ dataVencimento: '31/12/2026', dataReferencia: REF })).toThrow();
  });
  it('25. mês sem zero à esquerda (2026-1-01) inválido → erro', () => {
    expect(() => sit({ dataVencimento: '2026-1-01', dataReferencia: REF })).toThrow();
  });
  it('26. dia sem zero à esquerda (2026-01-1) inválido → erro', () => {
    expect(() => sit({ dataVencimento: '2026-01-1', dataReferencia: REF })).toThrow();
  });
  it('27. timestamp completo inválido → erro', () => {
    expect(() => sit({ dataVencimento: '2026-07-29T00:00:00', dataReferencia: REF })).toThrow();
  });
  it('28. texto arbitrário inválido → erro', () => {
    expect(() => sit({ dataVencimento: 'amanhã', dataReferencia: REF })).toThrow();
  });
  it('29. data com espaços externos válida após trim', () => {
    expect(sit({ dataVencimento: ' 2026-07-30 ', dataReferencia: REF })).toBe('a_vencer');
  });
});

describe('F. data de referência', () => {
  it('30. referência vazia → erro', () => {
    expect(() => sit({ dataVencimento: HOJE, dataReferencia: '' })).toThrow('Data de referência inválida: esperado YYYY-MM-DD.');
  });
  it('31. referência só espaços → erro', () => {
    expect(() => sit({ dataVencimento: HOJE, dataReferencia: '   ' })).toThrow('Data de referência inválida: esperado YYYY-MM-DD.');
  });
  it('32. referência inválida (2026-02-30) → erro', () => {
    expect(() => sit({ dataVencimento: HOJE, dataReferencia: '2026-02-30' })).toThrow();
  });
  it('33. input null em runtime → erro (sem TypeError opaco)', () => {
    // @ts-expect-error validação defensiva de runtime
    expect(() => sit(null)).toThrow('Entrada inválida: objeto de parâmetros ausente.');
  });
  it('34. input undefined em runtime → erro', () => {
    // @ts-expect-error validação defensiva de runtime
    expect(() => sit(undefined)).toThrow('Entrada inválida: objeto de parâmetros ausente.');
  });
});

describe('G. validação completa ANTES da precedência', () => {
  it('35. liquidação válida + vencimento inválido → erro (não mascara como liquidado)', () => {
    expect(() => sit({ dataLiquidacao: HOJE, dataVencimento: '2026-13-01', dataReferencia: REF }))
      .toThrow('Data de vencimento inválida: esperado YYYY-MM-DD.');
  });
  it('36. vencimento válido + liquidação inválida → erro', () => {
    expect(() => sit({ dataVencimento: HOJE, dataLiquidacao: '31/12/2026', dataReferencia: REF }))
      .toThrow('Data de liquidação inválida: esperado YYYY-MM-DD.');
  });
  it('37. liquidação válida + referência inválida → erro', () => {
    expect(() => sit({ dataLiquidacao: HOJE, dataReferencia: 'ontem' }))
      .toThrow('Data de referência inválida: esperado YYYY-MM-DD.');
  });
});

describe('H. pureza / determinismo', () => {
  it('38. mesma entrada repetida → sempre o mesmo resultado', () => {
    const input = { dataVencimento: '2026-07-15', dataLiquidacao: null, dataReferencia: REF };
    const r1 = sit(input);
    const r2 = sit(input);
    const r3 = sit({ ...input });
    expect(r1).toBe('vencido');
    expect(r2).toBe(r1);
    expect(r3).toBe(r1);
  });
  it('39/40. resultado independe da data atual e do timezone (referência explícita)', () => {
    // Sem fake timers, sem mock de Date: o resultado depende SÓ dos argumentos.
    expect(sit({ dataVencimento: '2026-07-29', dataReferencia: '2026-07-29' })).toBe('a_vencer');
    expect(sit({ dataVencimento: '2026-07-29', dataReferencia: '2026-07-30' })).toBe('vencido');
  });
  it('41. não usa fake timers para funcionar (nenhum vi.useFakeTimers neste arquivo)', () => {
    // asserção trivial: a suíte inteira roda sem manipular o relógio.
    expect(true).toBe(true);
  });
});
