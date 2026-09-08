/**
 * `csvLinhaPt` — 133i item 13.
 *
 * ⚠ O DEFEITO ERA INVISÍVEL NO CÓDIGO E ÓBVIO NO EXCEL: com `,` de separador, o arquivo
 * inteiro abre na coluna A do Excel brasileiro. O teste trava o separador e o
 * escapamento, que são as duas coisas que fazem a planilha do produtor abrir certo.
 */
import { describe, it, expect } from 'vitest';
import { csvLinhaPt } from './csv';

describe('csvLinhaPt', () => {
  it('separa por ponto e vírgula — o separador do Excel pt-BR', () => {
    expect(csvLinhaPt(['a', 'b', 'c'])).toBe('a;b;c');
  });

  it('não põe aspas onde não precisa', () => {
    expect(csvLinhaPt(['Banco do Brasil', 'R$ 1.234,56'])).toBe('Banco do Brasil;R$ 1.234,56');
  });

  it('a vírgula do valor NÃO vira separador nem exige aspas', () => {
    expect(csvLinhaPt(['R$ 1.234,56'])).toBe('R$ 1.234,56');
  });

  it('põe aspas quando o texto tem o separador', () => {
    expect(csvLinhaPt(['Pago; conferido'])).toBe('"Pago; conferido"');
  });

  it('dobra aspas internas e envolve', () => {
    expect(csvLinhaPt(['diz "olá"'])).toBe('"diz ""olá"""');
  });

  it('quebra de linha também exige aspas', () => {
    expect(csvLinhaPt(['linha1\nlinha2'])).toBe('"linha1\nlinha2"');
  });

  it('null e undefined viram campo vazio, não "null"', () => {
    expect(csvLinhaPt([null, undefined, 0])).toBe(';;0');
  });
});
