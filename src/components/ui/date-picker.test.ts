import { describe, it, expect } from 'vitest';
import {
  parseBrDateToIso, formatIsoToBr, isoToDate, dateToIso,
  aplicarMascaraData, normalizarDataColada, ANO_MIN, ANO_MAX,
} from './date-picker';

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

/* ═══ 136a — MÁSCARA DE DIGITAÇÃO ═══════════════════════════════════════════════ */
describe('aplicarMascaraData — as barras entram sozinhas', () => {
  it('vai pondo a barra conforme os dígitos chegam', () => {
    expect(aplicarMascaraData('2')).toBe('2');
    expect(aplicarMascaraData('20')).toBe('20/');
    expect(aplicarMascaraData('20/0')).toBe('20/0');
    expect(aplicarMascaraData('20/08')).toBe('20/08/');
    expect(aplicarMascaraData('20/08/2')).toBe('20/08/2');
    expect(aplicarMascaraData('20/08/2026')).toBe('20/08/2026');
  });

  /** ⚠ A ARMADILHA DA MÁSCARA: sem a guarda, apagar "20/" recolocava a barra e o backspace
      ficava preso. Apagando, a máscara não fecha grupo. */
  it('backspace não é engolido pela barra automática', () => {
    expect(aplicarMascaraData('20', '20/')).toBe('20');
    expect(aplicarMascaraData('2', '20')).toBe('2');
    expect(aplicarMascaraData('20/08', '20/08/')).toBe('20/08');
  });

  it('para nos 8 dígitos — o resto é descartado (maxLength no campo)', () => {
    expect(aplicarMascaraData('20/08/20269999')).toBe('20/08/2026');
  });

  it('ignora letras e símbolos', () => {
    expect(aplicarMascaraData('20/a08b2026')).toBe('20/08/2026');
  });

  /** O separador digitado FECHA o grupo: quem escreve 1/3/2025 continua sendo atendido. */
  it('separador digitado completa o grupo com zero à esquerda', () => {
    expect(aplicarMascaraData('1/')).toBe('01/');
    expect(aplicarMascaraData('01/3/')).toBe('01/03/');
    expect(aplicarMascaraData('01/03/2025')).toBe('01/03/2025');
  });

  it('aceita - e . como separadores digitados', () => {
    expect(aplicarMascaraData('1-3-2025')).toBe('01/03/2025');
    expect(aplicarMascaraData('1.3.2025')).toBe('01/03/2025');
  });

  /** ⚠ O estado transitório de quem digita "20/08/2026" com barras não pode virar 2020. */
  it('NÃO expande ano de 2 dígitos durante a digitação', () => {
    expect(aplicarMascaraData('20/08/20')).toBe('20/08/20');
    expect(aplicarMascaraData('20/08/202')).toBe('20/08/202');
    expect(aplicarMascaraData('20/08/2026')).toBe('20/08/2026');
  });

  it('vazio continua vazio', () => {
    expect(aplicarMascaraData('')).toBe('');
  });
});

/* ═══ 136a — COLAGEM: os quatro formatos ════════════════════════════════════════ */
describe('normalizarDataColada — os quatro formatos do item 1e', () => {
  it('20082026 → 20/08/2026', () => {
    expect(normalizarDataColada('20082026')).toBe('20/08/2026');
  });
  it('20/08/2026 → 20/08/2026', () => {
    expect(normalizarDataColada('20/08/2026')).toBe('20/08/2026');
  });
  it('2026-08-20 (ISO) → 20/08/2026', () => {
    expect(normalizarDataColada('2026-08-20')).toBe('20/08/2026');
  });
  it('20-08-26 (ano curto) → 20/08/2026', () => {
    expect(normalizarDataColada('20-08-26')).toBe('20/08/2026');
  });
  it('espaços em volta não atrapalham', () => {
    expect(normalizarDataColada('  2026-08-20  ')).toBe('20/08/2026');
  });
  it('os quatro terminam no MESMO ISO depois do parse', () => {
    for (const t of ['20082026', '20/08/2026', '2026-08-20', '20-08-26']) {
      expect(parseBrDateToIso(normalizarDataColada(t))).toEqual({ status: 'valid', iso: '2026-08-20' });
    }
  });
});

/* ═══ 136a — FAIXA DE ANO ═══════════════════════════════════════════════════════ */
describe('parseBrDateToIso — ano fora da faixa é dedo trocado', () => {
  it(`ano abaixo de ${ANO_MIN} → invalid`, () => {
    expect(parseBrDateToIso('20/08/0226')).toEqual({ status: 'invalid' });
    expect(parseBrDateToIso('20/08/1899')).toEqual({ status: 'invalid' });
  });
  it(`ano acima de ${ANO_MAX} → invalid`, () => {
    expect(parseBrDateToIso('20/08/2101')).toEqual({ status: 'invalid' });
    expect(parseBrDateToIso('20/08/9999')).toEqual({ status: 'invalid' });
  });
  it('as bordas da faixa continuam válidas', () => {
    expect(parseBrDateToIso(`20/08/${ANO_MIN}`)).toEqual({ status: 'valid', iso: '1900-08-20' });
    expect(parseBrDateToIso(`20/08/${ANO_MAX}`)).toEqual({ status: 'valid', iso: '2100-08-20' });
  });
});
