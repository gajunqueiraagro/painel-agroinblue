import { describe, it, expect } from 'vitest';
import { dataAncoraLancamento, orFiltroDataAncora } from './dataAncora';

describe('dataAncoraLancamento — prioridade pagamento → vencimento → competência', () => {
  it('pagamento preenchido vence, mesmo com vencimento/competência divergentes', () => {
    expect(
      dataAncoraLancamento({
        data_pagamento: '2026-08-05',
        data_vencimento: '2026-08-20',
        data_competencia: '2026-07-01',
      }),
    ).toBe('2026-08-05');
  });

  it('pagamento nulo + vencimento preenchido → vencimento', () => {
    expect(
      dataAncoraLancamento({
        data_pagamento: null,
        data_vencimento: '2026-08-20',
        data_competencia: '2026-07-01',
      }),
    ).toBe('2026-08-20');
  });

  it('pagamento nulo + vencimento nulo → competência (último fallback)', () => {
    expect(
      dataAncoraLancamento({
        data_pagamento: null,
        data_vencimento: null,
        data_competencia: '2026-07-01',
      }),
    ).toBe('2026-07-01');
  });

  it('três datas nulas → null', () => {
    expect(
      dataAncoraLancamento({
        data_pagamento: null,
        data_vencimento: null,
        data_competencia: null,
      }),
    ).toBeNull();
  });
});

describe('orFiltroDataAncora — string PostgREST com semântica COALESCE', () => {
  it('gera exatamente os três ramos para (ini, fim) fixos', () => {
    expect(orFiltroDataAncora('2026-08-01', '2026-08-31')).toBe(
      'and(data_pagamento.gte.2026-08-01,data_pagamento.lte.2026-08-31),' +
        'and(data_pagamento.is.null,data_vencimento.gte.2026-08-01,data_vencimento.lte.2026-08-31),' +
        'and(data_pagamento.is.null,data_vencimento.is.null,data_competencia.gte.2026-08-01,data_competencia.lte.2026-08-31)',
    );
  });
});
