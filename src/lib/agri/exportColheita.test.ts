/**
 * O nome do arquivo exportado — PR-AGRI-COLHEITA-EXPORT-15.
 *
 * ⚠ O TESTE É DO NOME porque é a única regra pura do módulo: o resto é montagem de payload e
 * desenho de PDF, que se conferem na tela. E o nome tem uma armadilha real: a safra se chama
 * "25/26-Lav", e a barra é separador de diretório em todo sistema operacional.
 */
import { describe, it, expect } from 'vitest';
import { nomeDoArquivo } from './exportColheita';

describe('o nome do arquivo', () => {
  it('⚠ A BARRA DA SAFRA VIRA HÍFEN: "25/26-Lav" quebraria o salvamento', () => {
    expect(nomeDoArquivo('amendoim', '25/26-Lav', 'xlsx')).toBe('colheita_amendoim_25-26-lav.xlsx');
  });

  it('sem acento e sem espaço', () => {
    expect(nomeDoArquivo('Feijão Caupi', '24/25 Lavoura', 'pdf'))
      .toBe('colheita_feijao-caupi_24-25-lavoura.pdf');
  });

  it('cultura ou safra vazias não produzem nome quebrado', () => {
    expect(nomeDoArquivo('', '', 'xlsx')).toBe('colheita_cultura_safra.xlsx');
  });

  it('não sobra hífen nas pontas', () => {
    expect(nomeDoArquivo('/amendoim/', '-25/26-', 'pdf')).toBe('colheita_amendoim_25-26.pdf');
  });
});
