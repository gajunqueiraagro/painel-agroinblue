/**
 * A régua de ordenação das tabelas — PR-TABELA-SORT-01.
 *
 * ⚠ O TESTE É DA FUNÇÃO PURA, não do hook: `ordenarPorColuna` carrega a decisão toda, e o hook
 * só guarda qual coluna está ativa. Testar pelo React exigiria montar uma tabela para conferir
 * uma comparação.
 */
import { describe, it, expect } from 'vitest';
import { ordenarPorColuna, type ColunaOrdenavel } from './useOrdenacaoTabela';

interface Linha { id: string; ppb: number | null; data: string; nome: string | null }

const col = (c: Partial<ColunaOrdenavel<Linha, string>>): ColunaOrdenavel<Linha, string> =>
  ({ coluna: 'x', tipo: 'numero', valor: l => l.ppb, ...c });

const LINHAS: Linha[] = [
  { id: 'a', ppb: 27, data: '2024-03-15', nome: 'Ávila' },
  { id: 'b', ppb: 180, data: '2024-01-02', nome: 'zebu' },
  { id: 'c', ppb: 9, data: '2024-12-31', nome: 'Ana' },
  { id: 'd', ppb: null, data: '2024-06-01', nome: null },
];

const ids = (l: Linha[]) => l.map(x => x.id).join('');

describe('ordenar por número', () => {
  it('⚠ 180 VEM DEPOIS DE 27 — como texto, "180" viria antes porque "1" < "2"', () => {
    expect(ids(ordenarPorColuna(LINHAS, col({}), 'asc'))).toBe('cabd');
  });

  it('descendente inverte, e o vazio continua no fim', () => {
    expect(ids(ordenarPorColuna(LINHAS, col({}), 'desc'))).toBe('bacd');
  });
});

describe('ordenar por data', () => {
  it('é cronológico — ISO ordena como texto e isso é a cronologia', () => {
    const c = col({ tipo: 'data', valor: l => l.data });
    expect(ids(ordenarPorColuna(LINHAS, c, 'asc'))).toBe('badc');
    expect(ids(ordenarPorColuna(LINHAS, c, 'desc'))).toBe('cdab');
  });
});

describe('ordenar por texto', () => {
  it('é alfabético em pt-BR: acento não joga "Ávila" para o fim', () => {
    const c = col({ tipo: 'texto', valor: l => l.nome });
    expect(ids(ordenarPorColuna(LINHAS, c, 'asc'))).toBe('cabd');
  });
});

describe('a ausência', () => {
  it('⚠ VAI PARA O FIM NOS DOIS SENTIDOS — nulo não é zero nem string vazia', () => {
    /* Como zero, a carga sem laudo encabeçaria o crescente como se fosse a melhor. */
    expect(ordenarPorColuna(LINHAS, col({}), 'asc').at(-1)?.id).toBe('d');
    expect(ordenarPorColuna(LINHAS, col({}), 'desc').at(-1)?.id).toBe('d');
  });
});

describe('a estabilidade', () => {
  it('empate preserva a ordem de origem — a lista não pisca a cada render', () => {
    const iguais: Linha[] = [
      { id: 'p', ppb: 5, data: '', nome: null },
      { id: 'q', ppb: 5, data: '', nome: null },
      { id: 'r', ppb: 5, data: '', nome: null },
    ];
    expect(ids(ordenarPorColuna(iguais, col({}), 'asc'))).toBe('pqr');
    expect(ids(ordenarPorColuna(iguais, col({}), 'desc'))).toBe('pqr');
  });

  it('sem coluna definida, devolve a lista como veio — e uma CÓPIA', () => {
    const r = ordenarPorColuna(LINHAS, undefined, 'asc');
    expect(ids(r)).toBe('abcd');
    expect(r).not.toBe(LINHAS);
  });
});
