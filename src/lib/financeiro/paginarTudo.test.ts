/**
 * ⚠ O TESTE QUE IMPORTA É O DA PARADA, e ele existe por um defeito possível e caro: parar na
 * leva filtrada, e não na bruta, faria a consulta terminar cedo e a tela mostrar um pedaço
 * dizendo que é o todo. Numa tela de conferência isso é pior que um erro visível.
 */
import { describe, it, expect } from 'vitest';
import { paginarTudo } from './paginarTudo';

describe('paginarTudo', () => {
  it('junta as levas até a primeira incompleta', async () => {
    const total = Array.from({ length: 2500 }, (_, i) => i);
    const lidas: number[] = [];
    const r = await paginarTudo<number>(async (de, tamanho) => {
      lidas.push(de);
      const fatia = total.slice(de, de + tamanho);
      return { linhas: fatia, brutas: fatia.length };
    }, 1000);
    expect(r).toHaveLength(2500);
    expect(lidas).toEqual([0, 1000, 2000]);
  });

  it('uma leva CHEIA que o filtro esvazia NÃO encerra a busca', async () => {
    /* O caso do `fetchAllLancamentos`: o filtro residual pode derrubar a leva inteira, e o
       banco ainda tem páginas. Se a parada olhasse `linhas`, o resto sumiria em silêncio. */
    const r = await paginarTudo<number>(async (de) => {
      if (de === 0) return { linhas: [], brutas: 1000 };
      if (de === 1000) return { linhas: [7, 8], brutas: 500 };
      throw new Error('não deveria pedir uma terceira leva');
    }, 1000);
    expect(r).toEqual([7, 8]);
  });

  it('total exatamente múltiplo do tamanho pede uma leva a mais, e ela vem vazia', () => {
    /* Não é desperdício: com 1.000 exatas o banco não tem como dizer "acabou" de outro jeito. */
    return paginarTudo<number>(async (de) => (de === 0
      ? { linhas: [1, 2, 3], brutas: 3 }
      : { linhas: [], brutas: 0 }), 3).then((r) => expect(r).toEqual([1, 2, 3]));
  });

  it('nada a buscar devolve lista vazia sem estourar', async () => {
    expect(await paginarTudo<number>(async () => ({ linhas: [], brutas: 0 }))).toEqual([]);
  });
});
