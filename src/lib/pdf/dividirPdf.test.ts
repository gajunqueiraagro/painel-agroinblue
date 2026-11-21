/**
 * BOLETO-SEPARAR-01 — a rotina única de dividir PDF. PDF SINTÉTICO (feito aqui pelo pdf-lib); nenhum arquivo de cliente.
 * A prova que importa: depois de dividir, o texto CONTINUA TEXTO (o pdf.js o lê de volta, página a página).
 */
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { itensDoPdf, type PdfjsMinimo } from '@/lib/financeiro/nfe/lerNotaPdf';
import { dividirPdf, paginasDosBoletos, FRASE_PDF_NAO_ABRE, FRASE_GRUPO_VAZIO, fraseForaDoPdf } from './dividirPdf';

async function pdfSintetico(textos: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  for (const t of textos) doc.addPage([400, 300]).drawText(t, { x: 20, y: 150, size: 12, font: fonte });
  return doc.save();
}
const textoDasPaginas = async (bytes: Uint8Array) => {
  const pdfjs: PdfjsMinimo = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { paginas } = await itensDoPdf(bytes.slice().buffer, pdfjs);
  return paginas.map((p) => p.map((i) => i.str).join('').trim());
};

describe('dividirPdf', () => {
  it('copia as páginas de cada grupo, na ordem, e o texto continua texto', async () => {
    const pdf = await pdfSintetico(['FICHA A 23790.00000', 'FICHA B 34191.11111', 'RECIBO B']);
    const r = await dividirPdf(pdf, [[1], [2, 3]]);
    expect('arquivos' in r).toBe(true);
    if (!('arquivos' in r)) return;
    expect(r.arquivos).toHaveLength(2);
    expect(await textoDasPaginas(r.arquivos[0])).toEqual(['FICHA A 23790.00000']);
    expect(await textoDasPaginas(r.arquivos[1])).toEqual(['FICHA B 34191.11111', 'RECIBO B']);
  });
  it('recusa com a frase: página fora do PDF, grupo vazio, arquivo que não é PDF', async () => {
    const pdf = await pdfSintetico(['UM', 'DOIS']);
    expect(await dividirPdf(pdf, [[1], [3]])).toEqual({ ok: false, frase: fraseForaDoPdf(3, 2) });
    expect(await dividirPdf(pdf, [[0]])).toEqual({ ok: false, frase: fraseForaDoPdf(0, 2) });
    expect(await dividirPdf(pdf, [[1], []])).toEqual({ ok: false, frase: FRASE_GRUPO_VAZIO });
    expect(await dividirPdf(Uint8Array.from('nao sou pdf', (c) => c.charCodeAt(0)), [[1]])).toEqual({ ok: false, frase: FRASE_PDF_NAO_ABRE });
  });
});

describe('paginasDosBoletos (as regras da FASE 0)', () => {
  it('1 boleto por página: cada página é um arquivo', () => {
    expect(paginasDosBoletos([1, 2, 3], 3)).toEqual([[1], [2], [3]]);
  });
  it('capa sem boleto vai com o boleto seguinte; ficha + recibo ficam juntos; o resto vai com o último', () => {
    expect(paginasDosBoletos([2, 4], 5)).toEqual([[1, 2], [3, 4, 5]]);
  });
  it('2 boletos na MESMA página: a página não se divide, os dois recebem o mesmo grupo', () => {
    expect(paginasDosBoletos([1, 1, 2], 2)).toEqual([[1], [1], [2]]);
  });
});
