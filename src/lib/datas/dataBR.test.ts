/** FIN-V2-DESEMPENHO-01c — dd/mm/aaaa; ausente ou torto = "—"; e a seção "sem caixa" de Lançamentos usa ela (não o dd/mm/aa da OC). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataBR } from './dataBR';

describe('dataBR', () => {
  it('dd/mm/aaaa; com hora também; ausente ou torto = "—"', () => {
    expect(dataBR('2026-09-30')).toBe('30/09/2026');
    expect(dataBR('2026-01-05T10:00:00Z')).toBe('05/01/2026');
    expect(dataBR(null)).toBe('—');
    expect(dataBR('')).toBe('—');
    expect(dataBR('30/09/26')).toBe('—');
  });
  it('a seção "sem caixa" escreve a competência com ela', () => {
    const secao = readFileSync(resolve(__dirname, '../../components/financeiro-v2/SecaoSemCaixa.tsx'), 'utf8');
    expect(secao).toContain('{dataBR(l.data_competencia)}');
    expect(secao).not.toContain('dataCurta');
  });
});
