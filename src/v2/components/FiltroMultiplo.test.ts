/**
 * ⚠ "TUDO MARCADO" E "NADA MARCADO" DIZEM A MESMA COISA, e é isso que o rótulo tem de
 * refletir: os dois recortam o conjunto inteiro. Mostrar "6 categorias" quando são as seis
 * faria o operador procurar o que ficou de fora — e não ficou nada.
 */
import { describe, it, expect } from 'vitest';
import { rotuloDoFiltro } from './FiltroMultiplo';

const R = { todos: 'Categorias', um: 'categoria', varios: 'categorias' };

describe('rótulo do filtro múltiplo', () => {
  it('nada marcado é "todas"', () => {
    expect(rotuloDoFiltro([], 6, R)).toBe('Categorias');
  });

  it('tudo marcado também é "todas"', () => {
    expect(rotuloDoFiltro(['a', 'b', 'c'], 3, R)).toBe('Categorias');
  });

  it('uma marcada usa o singular', () => {
    expect(rotuloDoFiltro(['bois'], 6, R)).toBe('1 categoria');
  });

  it('mais de uma conta no plural', () => {
    expect(rotuloDoFiltro(['bois', 'vacas'], 6, R)).toBe('2 categorias');
    expect(rotuloDoFiltro(['a', 'b', 'c', 'd', 'e'], 6, R)).toBe('5 categorias');
  });

  it('sem opção nenhuma não inventa "todas" para uma seleção que existe', () => {
    /* ⚠ `total === 0` acontece enquanto a lista carrega. Se o `>= total` valesse ali, uma
       seleção viva apareceria como "Categorias" durante o carregamento e o operador acharia
       que o filtro se perdeu. */
    expect(rotuloDoFiltro(['bois'], 0, R)).toBe('1 categoria');
  });
});
