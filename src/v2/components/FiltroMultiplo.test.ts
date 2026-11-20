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

  /* PROD-LANC-FILTROS-01 (Gabriel 19/11): o botão diz "Categorias · 2 de 4" — o nome do filtro e quantas de quantas, numa linha só */
  it('parcial: "Categorias · N de TOTAL"', () => {
    expect(rotuloDoFiltro(['bois'], 6, R)).toBe('Categorias · 1 de 6');
    expect(rotuloDoFiltro(['bois', 'vacas'], 6, R)).toBe('Categorias · 2 de 6');
    expect(rotuloDoFiltro(['a', 'b', 'c', 'd', 'e'], 6, R)).toBe('Categorias · 5 de 6');
  });

  it('sem opção nenhuma não inventa "todas" para uma seleção que existe', () => {
    /* ⚠ `total === 0` acontece enquanto a lista carrega. Se o `>= total` valesse ali, uma
       seleção viva apareceria como "Categorias" durante o carregamento e o operador acharia
       que o filtro se perdeu. */
    expect(rotuloDoFiltro(['bois'], 0, R)).toBe('Categorias · 1');
  });
});
