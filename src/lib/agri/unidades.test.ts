import { describe, it, expect } from 'vitest';
import { UNIDADES_INSUMO, labelDaUnidade, unidadeConhecida } from './unidades';

describe('unidades de insumo', () => {
  it('o catálogo tem os códigos canônicos que o estoque futuro vai agrupar', () => {
    expect(UNIDADES_INSUMO.map(u => u.valor)).toEqual(['kg', 't', 'sc', 'L', 'un', 'dose']);
  });

  it('o rótulo mostra código e nome — o código sozinho não se lê numa lista', () => {
    expect(labelDaUnidade('t')).toBe('t — tonelada');
    expect(labelDaUnidade('sc')).toBe('sc — saca');
  });

  /* ⚠ ESTE É O TESTE QUE IMPORTA. "Ton" foi digitado antes do catálogo existir; se a função
     devolvesse '—' ou vazio, a linha pareceria sem unidade e o operador a "corrigiria" para
     outra coisa. Valor fora do catálogo se MOSTRA como está. */
  it('unidade legada fora do catálogo se exibe como está, nunca como ausência', () => {
    expect(labelDaUnidade('Ton')).toBe('Ton');
    expect(unidadeConhecida('Ton')).toBe(false);
  });

  it('vazio e nulo são ausência de verdade', () => {
    expect(labelDaUnidade('')).toBe('—');
    expect(labelDaUnidade(null)).toBe('—');
    expect(labelDaUnidade(undefined)).toBe('—');
    expect(unidadeConhecida('')).toBe(false);
    expect(unidadeConhecida(null)).toBe(false);
  });

  it('o código é sensível a caixa, e é por isso que ele vem de lista', () => {
    /* 'L' é litro; 'l' não está no catálogo. Texto livre produzia os dois. */
    expect(unidadeConhecida('L')).toBe(true);
    expect(unidadeConhecida('l')).toBe(false);
  });

  it('espaço em volta não inventa unidade nova', () => {
    expect(unidadeConhecida(' kg ')).toBe(true);
    expect(labelDaUnidade(' kg ')).toBe('kg — quilo');
  });
});
