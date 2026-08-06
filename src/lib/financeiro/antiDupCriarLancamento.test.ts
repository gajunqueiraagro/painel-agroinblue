import { describe, it, expect } from 'vitest';
import {
  predicadoCompromissoAberto,
  diasEntreISO,
  type LancParaAntiDup,
  type ParamsPredicadoAntiDup,
} from './antiDupCriarLancamento';

function lanc(overrides: Partial<LancParaAntiDup> = {}): LancParaAntiDup {
  return {
    id: 'l1',
    data_pagamento: null,
    data_vencimento: '2026-08-10',
    data_competencia: '2026-08-01',
    valor: 6000,
    sinal: -1,
    descricao: 'Prolabore',
    status_transacao: 'agendado',
    cenario: null,
    cancelado: false,
    ...overrides,
  };
}

function params(overrides: Partial<ParamsPredicadoAntiDup> = {}): ParamsPredicadoAntiDup {
  return {
    valorAbs: 6000,
    sinal: -1,
    dataMov: '2026-08-10',
    idsVinculadosAtivos: new Set<string>(),
    ...overrides,
  };
}

describe('predicadoCompromissoAberto — tolerância de valor ±0,01', () => {
  it('dentro da tolerância: 6000.01 vs 6000 passa', () => {
    expect(predicadoCompromissoAberto(lanc({ valor: 6000.01 }), params())).toBe(true);
  });
  it('fora da tolerância: 6000.02 vs 6000 falha', () => {
    expect(predicadoCompromissoAberto(lanc({ valor: 6000.02 }), params())).toBe(false);
  });
});

describe('predicadoCompromissoAberto — direção/sinal', () => {
  it('mesma direção (saída ↔ débito) passa', () => {
    expect(predicadoCompromissoAberto(lanc({ sinal: -1 }), params({ sinal: -1 }))).toBe(true);
  });
  it('sinal oposto falha', () => {
    expect(predicadoCompromissoAberto(lanc({ sinal: 1 }), params({ sinal: -1 }))).toBe(false);
  });
});

describe('predicadoCompromissoAberto — janela de ±10 dias sobre a âncora', () => {
  it('exatamente no limite de +10 dias passa', () => {
    expect(
      predicadoCompromissoAberto(lanc({ data_vencimento: '2026-08-20' }), params()),
    ).toBe(true);
  });
  it('exatamente no limite de -10 dias passa', () => {
    expect(
      predicadoCompromissoAberto(lanc({ data_vencimento: '2026-07-31' }), params()),
    ).toBe(true);
  });
  it('fora da janela (11 dias) falha', () => {
    expect(
      predicadoCompromissoAberto(lanc({ data_vencimento: '2026-08-21' }), params()),
    ).toBe(false);
  });
});

describe('predicadoCompromissoAberto — prioridade pagamento → vencimento → competência', () => {
  it('pagamento dentro da janela decide, mesmo com vencimento fora', () => {
    expect(
      predicadoCompromissoAberto(
        lanc({ data_pagamento: '2026-08-09', data_vencimento: '2026-12-31' }),
        params(),
      ),
    ).toBe(true);
  });
  it('pagamento FORA da janela decide (vencimento dentro não resgata)', () => {
    expect(
      predicadoCompromissoAberto(
        lanc({ data_pagamento: '2026-12-31', data_vencimento: '2026-08-10' }),
        params(),
      ),
    ).toBe(false);
  });
  it('sem pagamento e sem vencimento, competência é o último fallback', () => {
    expect(
      predicadoCompromissoAberto(
        lanc({ data_vencimento: null, data_competencia: '2026-08-10' }),
        params(),
      ),
    ).toBe(true);
  });
  it('três datas nulas falha (sem âncora)', () => {
    expect(
      predicadoCompromissoAberto(
        lanc({ data_pagamento: null, data_vencimento: null, data_competencia: null }),
        params(),
      ),
    ).toBe(false);
  });
});

describe('predicadoCompromissoAberto — vínculo de conciliação', () => {
  it('lançamento com vínculo ATIVO é excluído', () => {
    expect(
      predicadoCompromissoAberto(lanc({ id: 'lx' }), params({ idsVinculadosAtivos: new Set(['lx']) })),
    ).toBe(false);
  });
  it('vínculo DESFEITO (id fora do set de ativos) é incluído', () => {
    expect(
      predicadoCompromissoAberto(lanc({ id: 'lx' }), params({ idsVinculadosAtivos: new Set(['outro']) })),
    ).toBe(true);
  });
});

describe('predicadoCompromissoAberto — vivo (cancelado IS NOT TRUE)', () => {
  it('cancelado=false passa', () => {
    expect(predicadoCompromissoAberto(lanc({ cancelado: false }), params())).toBe(true);
  });
  it('cancelado=null passa (legado)', () => {
    expect(predicadoCompromissoAberto(lanc({ cancelado: null }), params())).toBe(true);
  });
  it('cancelado=true falha', () => {
    expect(predicadoCompromissoAberto(lanc({ cancelado: true }), params())).toBe(false);
  });
});

describe('predicadoCompromissoAberto — cenário e status', () => {
  it('cenario=meta é excluído', () => {
    expect(predicadoCompromissoAberto(lanc({ cenario: 'meta' }), params())).toBe(false);
  });
  it('cenario=null passa (COALESCE → realizado)', () => {
    expect(predicadoCompromissoAberto(lanc({ cenario: null }), params())).toBe(true);
  });
  it('status realizado não é compromisso aberto', () => {
    expect(predicadoCompromissoAberto(lanc({ status_transacao: 'realizado' }), params())).toBe(false);
  });
  it('status programado é compromisso aberto', () => {
    expect(predicadoCompromissoAberto(lanc({ status_transacao: 'programado' }), params())).toBe(true);
  });
});

describe('diasEntreISO', () => {
  it('mesmo dia → 0; 10 dias → 10', () => {
    expect(diasEntreISO('2026-08-10', '2026-08-10')).toBe(0);
    expect(diasEntreISO('2026-08-10', '2026-08-20')).toBe(10);
  });
});
