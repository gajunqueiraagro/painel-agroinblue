import { describe, it, expect } from 'vitest';
import { parseBrDateToIso, formatIsoToBr, isoToDate, dateToIso } from './date-picker';

// UI-CALENDARIO-02 — testes das funções puras (rede de segurança principal).
// Comportamentos interativos (abrir no mês da data, digitar↔calendário, foco/teclado)
// ficam para homologação em runtime — ver relatório pré-commit.

describe('parseBrDateToIso — válidas', () => {
  it('15/03/2025 → 2025-03-15', () => {
    expect(parseBrDateToIso('15/03/2025')).toEqual({ status: 'valid', iso: '2025-03-15' });
  });
  it('29/02/2024 (bissexto) → 2024-02-29', () => {
    expect(parseBrDateToIso('29/02/2024')).toEqual({ status: 'valid', iso: '2024-02-29' });
  });
  it('separador "-": 15-03-2025 → 2025-03-15', () => {
    expect(parseBrDateToIso('15-03-2025')).toEqual({ status: 'valid', iso: '2025-03-15' });
  });
  it('separador ".": 15.03.2025 → 2025-03-15', () => {
    expect(parseBrDateToIso('15.03.2025')).toEqual({ status: 'valid', iso: '2025-03-15' });
  });
  it('dia/mês com 1 dígito: 1/3/2025 → 2025-03-01', () => {
    expect(parseBrDateToIso('1/3/2025')).toEqual({ status: 'valid', iso: '2025-03-01' });
  });
  it('01/3/2025 → 2025-03-01', () => {
    expect(parseBrDateToIso('01/3/2025')).toEqual({ status: 'valid', iso: '2025-03-01' });
  });
  it('1-03-2025 → 2025-03-01', () => {
    expect(parseBrDateToIso('1-03-2025')).toEqual({ status: 'valid', iso: '2025-03-01' });
  });
  it('espaços externos são ignorados (trim)', () => {
    expect(parseBrDateToIso('  15/03/2025  ')).toEqual({ status: 'valid', iso: '2025-03-15' });
  });
});

describe('parseBrDateToIso — inválidas (rejeitadas)', () => {
  for (const t of ['00/10/2026', '15/00/2026', '31/02/2026', '29/02/2025', '15/13/2026', '32/01/2026']) {
    it(`${t} → invalid`, () => {
      expect(parseBrDateToIso(t)).toEqual({ status: 'invalid' });
    });
  }
  it('ano com 2 dígitos → invalid (fora do escopo desta frente)', () => {
    expect(parseBrDateToIso('15/03/25')).toEqual({ status: 'invalid' });
  });
  it('ano com 3 dígitos → invalid', () => {
    expect(parseBrDateToIso('15/03/225')).toEqual({ status: 'invalid' });
  });
  it('texto não-numérico → invalid', () => {
    expect(parseBrDateToIso('abc')).toEqual({ status: 'invalid' });
  });
});

describe('parseBrDateToIso — incompletos (NÃO viram data no commit)', () => {
  for (const t of ['1', '15', '15/', '15/0', '15/03', '15/03/']) {
    it(`"${t}" → invalid (mantido p/ correção, sem emitir)`, () => {
      expect(parseBrDateToIso(t)).toEqual({ status: 'invalid' });
    });
  }
});

describe('parseBrDateToIso — vazio', () => {
  it('"" → empty', () => {
    expect(parseBrDateToIso('')).toEqual({ status: 'empty' });
  });
  it('"   " (só espaços) → empty', () => {
    expect(parseBrDateToIso('   ')).toEqual({ status: 'empty' });
  });
});

describe('formatIsoToBr / proteção contra ISO externo inválido', () => {
  it('2025-03-15 → 15/03/2025', () => {
    expect(formatIsoToBr('2025-03-15')).toBe('15/03/2025');
  });
  it('ISO vazio → "" (não formata)', () => {
    expect(formatIsoToBr('')).toBe('');
  });
  it('ISO malformado → "" (nunca vira data/ hoje)', () => {
    expect(formatIsoToBr('2025/03/15')).toBe('');
    expect(formatIsoToBr('15/03/2025')).toBe('');
    expect(formatIsoToBr('not-a-date')).toBe('');
  });
});

describe('isoToDate — proteção defensiva (sem Invalid Date, sem virar hoje)', () => {
  it('2025-03-15 → Date local 15/03/2025', () => {
    const d = isoToDate('2025-03-15');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(2); // março (0-based)
    expect(d!.getDate()).toBe(15);
  });
  it('ISO impossível (2025-02-31) → null', () => {
    expect(isoToDate('2025-02-31')).toBeNull();
  });
  it('ISO vazio/ malformado → null', () => {
    expect(isoToDate('')).toBeNull();
    expect(isoToDate('15/03/2025')).toBeNull();
    expect(isoToDate('abc')).toBeNull();
  });
});

describe('round-trip TZ-safe (data civil não desloca 1 dia)', () => {
  it('ISO → BR → ISO preserva o dia', () => {
    for (const iso of ['2025-03-15', '2024-02-29', '2025-01-01', '2025-12-31']) {
      const br = formatIsoToBr(iso);
      const back = parseBrDateToIso(br);
      expect(back).toEqual({ status: 'valid', iso });
    }
  });
  it('dateToIso(Date local) não usa toISOString → sem deslocamento', () => {
    // 15/03/2025 00:00 local. Com toISOString em fuso negativo poderia cair no dia 14/15;
    // dateToIso usa componentes locais → sempre 2025-03-15.
    expect(dateToIso(new Date(2025, 2, 15))).toBe('2025-03-15');
    expect(dateToIso(new Date(2024, 1, 29))).toBe('2024-02-29');
  });
});
