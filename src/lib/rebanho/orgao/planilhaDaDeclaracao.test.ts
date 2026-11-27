/** REBANHO-ORGAO-01 (F3) — a planilha é a MESMA conta da tela, no formato das planilhas do Gabriel. Dado FICTÍCIO. */
import { describe, it, expect } from 'vitest';
import { CABECALHO_PLANILHA, linhasDaPlanilha } from './planilhaDaDeclaracao';
import { propostaDaDeclaracao } from './propostaDaDeclaracao';

const conta = propostaDaDeclaracao({
  referencia: '2026-11-30', desde: '2026-05-04',
  fazendas: [{ id: 'A', iagro: { F: [15, 20, 30, 40], M: [11, 2, 3, 4] }, jaDeclarado: null,
    rebanhoHoje: [{ categoria: 'mamotes_f', cab: 21 }, { categoria: 'vacas', cab: 90 }, { categoria: 'mamotes_m', cab: 16 }, { categoria: 'touros', cab: 4 }] }],
  nascimentos: [{ fazendaId: 'A', data: '2026-07-01', categoria: 'mamotes_f', cab: 6 }, { fazendaId: 'A', data: '2026-07-01', categoria: 'mamotes_m', cab: 5 }],
  reclassificacoes: [], mortesConsumo: [{ fazendaId: 'A', data: '2026-06-10', tipo: 'morte', categoria: 'vacas', cab: 2 }], ajustes: [],
}).fazendas[0];

describe('a planilha da declaração', () => {
  const { linhas, mesclas } = linhasDaPlanilha('Fazenda Alfa', '24/11/2026', conta);
  it('o cabeçalho e as linhas no formato do Gabriel (Fazenda, Data, a tabela, o Total)', () => {
    expect(linhas[1]).toEqual([null, 'Fazenda:', 'Fazenda Alfa']);
    expect(linhas[2]).toEqual([null, 'Data', '24/11/2026']);
    expect(linhas[4]).toEqual([null, ...CABECALHO_PLANILHA]);
    expect(linhas.slice(5, 13).map((l) => [l[1], l[2]])).toEqual([['F', '00-12'], [null, '13-24'], [null, '25-36'], [null, '37-acima'],
      ['M', '00-12'], [null, '13-24'], [null, '25-36'], [null, '37-acima']]);
    expect(linhas[13][2]).toBe('Total');
  });
  it('os números são os da conta (IAGRO, nascimentos, mortes; sem troca de faixa lançada = vazio, nunca zero; o zero é zero)', () => {
    const f012 = linhas[5]; const f37 = linhas[8];
    expect([f012[3], f012[4], f012[5]]).toEqual([15, 6, 0]);
    expect(f37[5]).toBe(2);
    expect(f012[6]).toBeNull();                        // a troca de faixa sem nascimento registrado: em branco (a pessoa preenche)
    expect(f012[7]).toBe(conta.linhas.F[0].proposto);
    expect(linhas[13][3]).toBe(125);                    // o total do IAGRO
    expect(linhas[13][6]).toBeNull();                   // há troca de faixa sem número: o total dela não se inventa
  });
  it('o "Saldo Real" das fêmeas 13-24…37+ é UM bloco (célula mesclada nas 3 faixas), como na tela', () => {
    expect(mesclas).toContainEqual({ linha: 6, coluna: 10, linhas: 3 });
    expect(linhas[6][10]).toBe(90);
    expect([linhas[7][10], linhas[8][10]]).toEqual([null, null]);
  });
});
