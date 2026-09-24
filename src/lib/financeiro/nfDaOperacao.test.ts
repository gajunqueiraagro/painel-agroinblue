/**
 * A CÉLULA NF E A ORIGEM do PDF de movimentações — OC-PDF-ORIGEM-NF-01.
 *
 * ⚠ NASCE DE UM PDF, não de zelo: no `movimentacoes_abate_2026` do NJ, as seis linhas vindas de
 * OC (17/07 a 14/08) saíam com Origem "—" e NF "—", enquanto as legadas traziam "Faz. Pureza" e
 * "000.007.xxx". Medido: `fazenda_id` está preenchido em 109 de 109 lançamentos de OC, e
 * `fazenda_origem` é nulo em 109 de 109 — o dado nunca faltou, o PDF lia a coluna errada.
 *
 * ⚠ O CASO QUE JUSTIFICA O ARQUIVO É O DO LEGADO: ele precisa continuar lendo o campo dele. Um
 * teste que só afirmasse "a NF vem da OC" passaria verde também numa função que ignorasse o
 * `notaFiscal` gravado — e aí as linhas legadas do MESMO PDF perderiam a nota que já mostravam.
 */
import { describe, it, expect } from 'vitest';
import { celulaNF, origemDaLinha } from '@/lib/financeiro/nfDaOperacao';

describe('celulaNF', () => {
  it('sem NF nenhuma, traço', () => {
    expect(celulaNF(null, [])).toBe('—');
    expect(celulaNF(null, undefined)).toBe('—');
    expect(celulaNF('', [])).toBe('—');
  });

  it('uma NF da operação — o caso do NJ 14/08/2026', () => {
    expect(celulaNF(null, [{ numero: '000.008.301' }])).toBe('000.008.301');
  });

  it('duas NFs saem as duas, em ordem de número', () => {
    expect(celulaNF(null, [{ numero: '000.008.301' }, { numero: '000.007.998' }]))
      .toBe('000.007.998 · 000.008.301');
  });

  it('NF sem número é ignorada, e não vira "?"', () => {
    /* ⚠ Medido: a venda 581d075c tem DUAS `nf_principal` com `numero` nulo. */
    expect(celulaNF(null, [{ numero: null }, { numero: undefined }])).toBe('—');
    /* Sobrando uma com número, ela aparece sozinha — as sem número somem. */
    expect(celulaNF(null, [{ numero: null }, { numero: '000.006.713' }])).toBe('000.006.713');
  });

  it('o legado manda: NF gravada no lançamento ganha da operação', () => {
    expect(celulaNF('000.007.092', [{ numero: '000.008.301' }])).toBe('000.007.092');
    /* Espaço em branco não é NF. */
    expect(celulaNF('   ', [{ numero: '000.008.301' }])).toBe('000.008.301');
  });
});

describe('origemDaLinha', () => {
  const mapa = new Map([['d3396cdd', 'Faz. Pureza']]);

  it('a chave é a fonte — o caso das seis linhas de OC', () => {
    expect(origemDaLinha(mapa, 'd3396cdd', null)).toBe('Faz. Pureza');
  });

  it('o texto legado é fallback, não fonte', () => {
    /* Sem `fazenda_id` conhecido, vale o texto que o legado gravou. */
    expect(origemDaLinha(mapa, null, 'Faz. Santa Luzia')).toBe('Faz. Santa Luzia');
    expect(origemDaLinha(mapa, 'desconhecida', 'Faz. Santa Luzia')).toBe('Faz. Santa Luzia');
  });

  it('a chave ganha do texto quando os dois existem', () => {
    /* ⚠ É o ponto da correção: `fazenda_origem` é cache e pode estar velho. */
    expect(origemDaLinha(mapa, 'd3396cdd', 'Nome Antigo')).toBe('Faz. Pureza');
  });

  it('sem nenhum dos dois, traço', () => {
    expect(origemDaLinha(mapa, null, null)).toBe('—');
    expect(origemDaLinha(mapa, '', '  ')).toBe('—');
  });
});
