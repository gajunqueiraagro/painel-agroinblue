/**
 * NOTA-PDF-REGRESSAO-01 — o leiaute da NF que o leitor nao lia, no DANFE SINTETICO (as posicoes do real, dados de teste): a FATURA em
 * coluna, o item em duas meias-linhas, os numeros alinhados a' direita da coluna, a descricao repetida e o tracejado. Roda em qualquer
 * maquina (o real fica no gabarito, fora do repo: `notaGabarito.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { continuarDescricao, notaDoDanfe } from './danfe';
import { lerNota } from './lerNota';
import type { PdfjsMinimo } from './lerNotaPdf';
import { descricaoCurtaDoItem, ncmDeBemDoPatrimonio } from './proporLancamento';
import { danfeSinteticoFaturaEmColuna } from './__fixtures__/danfeSintetico';

describe('NOTA-PDF-REGRESSAO-01 — FATURA em coluna e item em meias-linhas', () => {
  it('a duplicata, o item inteiro e a descrição sugerida', () => {
    const r = notaDoDanfe(danfeSinteticoFaturaEmColuna());
    if (r.ok === false) throw new Error(r.frase);
    const n = r.nota;
    expect([n.numero, n.emissao, n.totais.notaCent]).toEqual(['4321', '2026-11-12', 1550000]);
    expect(n.duplicatas).toEqual([{ numero: '001', vencimento: '2026-11-19', valorCent: 1550000 }]);
    expect(n.itens).toHaveLength(1);
    const i = n.itens[0];
    /* Chat 13:45 — a descrição inteira: a linha de baixo continua a de cima; a repetição e o tracejado não entram */
    expect([i.descricao, i.detalhe, i.quantidade, i.unidade, i.unitarioCent, i.valorCent]).toEqual(['ROCADEIRA SINTETICA ANO: 2026 CHASSI: 0000001', null, '1.0000', 'UN', 1550000, 1550000]);
    expect(i.fiscal).toMatchObject({ codigo: '000001', ncm: '84328000', cst: '020', cfop: '5102', bcIcmsCent: 510570, vIcmsCent: 86797, vIpiCent: 0, aliqIcms: '17,00%', aliqIpi: '0,00%' });
    expect(descricaoCurtaDoItem(n)).toBe('Rocadeira sintetica ano: 2026 chassi: 0000001');
    /* Chat 13:45 — roçadeira (NCM 8432): pode ser bem do patrimônio */
    expect(ncmDeBemDoPatrimonio(n)).toBe('84328000');
    expect(ncmDeBemDoPatrimonio({ itens: n.itens.map((x) => ({ ...x, fiscal: x.fiscal ? { ...x.fiscal, ncm: '23099090' } : null })) })).toBeNull();
    expect(r.divergencias).toEqual([]);
  });
  it('o caminho da bancada: desenhado pelo jsPDF (folha em pé) e relido pelo pdfjs', async () => {
    const { jsPDF } = await import('jspdf');
    const pdfjs: PdfjsMinimo = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [595.28, 841.89] });
    /* a fonte do tamanho do real (h): maior, a chave passa da borda da folha em pé e sai cortada */
    for (const it of danfeSinteticoFaturaEmColuna()[0]) { doc.setFontSize(Math.max(4, it.h)); doc.text(it.str, it.x, 841.89 - it.y); }
    const r = await lerNota(doc.output('arraybuffer'), { pdfjs });
    if (r.ok === false) throw new Error(r.frase);
    expect([r.nota.numero, r.nota.duplicatas.length, r.nota.itens.length, r.divergencias]).toEqual(['4321', 1, 1, []]);
  });

  it('continuarDescricao: o número partido junta sem espaço e separa o texto colado; o resto, com espaço', () => {
    expect(continuarDescricao('ANO: 202', '6CHASSI: 1')).toBe('ANO: 2026 CHASSI: 1');
    expect(continuarDescricao('IMP = ', '400460101003')).toBe('IMP = 400460101003');
    expect(continuarDescricao('FEMEA GIRATO', 'RIA RETA')).toBe('FEMEA GIRATO RIA RETA');
    expect(continuarDescricao('C 2', '20 UN')).toBe('C 220 UN');
  });
});
