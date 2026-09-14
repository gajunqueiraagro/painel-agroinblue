import { describe, it, expect } from 'vitest';
import { formatarNF } from '@/lib/calculos/formatters';
describe('formatarNF — padrão A25', () => {
  it('preenche com zeros até nove e agrupa de três', () => {
    expect(formatarNF('7086649')).toBe('007.086.649');
    expect(formatarNF('123456789')).toBe('123.456.789');
    expect(formatarNF('7')).toBe('000.000.007');
  });
  it('aceita o que já vem pontuado', () => {
    expect(formatarNF('007.086.649')).toBe('007.086.649');
  });
  /* ⚠ O CASO QUE SEPARA ESTE FORMATTER DO OUTRO: acima de nove dígitos não é nNF, e truncar
     apagaria dado na tela. Volta como veio. */
  it('mais de nove dígitos volta como veio, nunca mutilado', () => {
    expect(formatarNF('1234567890')).toBe('1234567890');
  });
  it('vazio e nulo não inventam zeros', () => {
    expect(formatarNF('')).toBe('');
    expect(formatarNF(null)).toBe('');
    expect(formatarNF(undefined)).toBe('');
  });
  it('texto sem dígito volta como veio', () => {
    expect(formatarNF('s/n')).toBe('s/n');
  });
});
