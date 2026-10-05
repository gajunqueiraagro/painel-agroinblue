import { describe, it, expect } from 'vitest';
import { centavosDoTexto, somarCentavos } from './centavos';

describe('centavosDoTexto — do texto do XML a centavos inteiros, sem float', () => {
  it('"0.10" + "0.20" = 30 centavos (em float daria 0.30000000000000004)', () => {
    /* a busca sabe achar: o float erra mesmo */
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(somarCentavos([centavosDoTexto('0.10')!, centavosDoTexto('0.20')!])).toBe(30);
  });
  it('"1345.50" = 134550; "16238.00" = 1623800; "8119.00" = 811900; "672.75" = 67275', () => {
    expect(centavosDoTexto('1345.50')).toBe(134550);
    expect(centavosDoTexto('16238.00')).toBe(1623800);
    expect(centavosDoTexto('8119.00')).toBe(811900);
    expect(centavosDoTexto('672.75')).toBe(67275);
  });
  it('valores em que `Number(x) * 100` nao da inteiro saem exatos', () => {
    for (const [t, c] of [['1.15', 115], ['8.29', 829], ['19.99', 1999], ['1.005', 101], ['4.35', 435], ['1345.5', 134550], ['7', 700], ['0.00', 0], ['0.07', 7]] as const) {
      expect(`${t}=${centavosDoTexto(t)}`).toBe(`${t}=${c}`);
    }
    expect(Number.isInteger(1.15 * 100)).toBe(false);
  });
  it('mais de duas casas: arredonda pela terceira, sobre o texto', () => {
    expect(centavosDoTexto('10.004')).toBe(1000);
    expect(centavosDoTexto('10.005')).toBe(1001);
    expect(centavosDoTexto('0.9999999999')).toBe(100);
  });
  it('o que nao e valor devolve null — e zero e valor', () => {
    for (const t of ['', '  ', 'abc', '1.345,50', '1,50', '1.2.3', '.5', '5.', null, undefined]) expect(centavosDoTexto(t)).toBeNull();
    expect(centavosDoTexto('0')).toBe(0);
    expect(centavosDoTexto(' 12.30 ')).toBe(1230);
    expect(centavosDoTexto('-5.25')).toBe(-525);
  });
});
