/* CARTAO-FATURA-IMPORT-01 — a leitura do PDF na bancada: o arquivo "fatura-bancada*.pdf" devolve as linhas SINTÉTICAS da fatura
   (`dados/fatura.ts`, sem pdfjs); qualquer outro arquivo segue para o leitor de verdade (as outras telas não mudam). */
import { extrairLinhasPdf as doApp, type LinhasDoPdf } from '../../../src/lib/oc/leitura/linhasDoPdf';
import { FATURA_BANCADA } from '../dados/fatura';
export * from '../../../src/lib/oc/leitura/linhasDoPdf';
export async function extrairLinhasPdf(file: File): Promise<LinhasDoPdf> {
  return file.name.startsWith('fatura-bancada') ? { linhas: FATURA_BANCADA, paginas: 2, temTexto: true } : doApp(file);
}
