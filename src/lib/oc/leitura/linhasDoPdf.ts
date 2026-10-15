/* OC-DOC-ESPECIE-ABATE-01 passo 4 — O TEXTO DO PDF EM LINHAS, COMO NO PAPEL.
   ⚠ POR QUE NAO O `extractPdfText`: ele junta os itens de cada pagina com espaco, na ORDEM DO FLUXO do PDF, e a posicao se
     perde. No Romaneio da Minerva os rotulos saem todos antes ("Lote: Fornecedor: … Data Abate:") e os valores depois; na NF da
     JBS o "VALOR TOTAL DA NOTA" sai longe do numero. Ler por rotulo nesse texto e' adivinhar pela ordem. `extractPdfText` fica
     INTOCADO (o extrato bancario depende dele).
   A REGRA: itens agrupados pela altura (`y`, tolerancia de 2pt), cada linha da de cima para baixo, os itens da esquerda para a
   direita, as CELULAS juntas por " | ". Pagina por pagina, na ordem. `montarLinhas` e' pura (testada com itens falsos). */
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { importarDoApp } from '@/lib/app/falhaDeVersao';
import { montarLinhas, type ItemDoPdf } from '@/lib/oc/leitura/montarLinhas';

export { montarLinhas, SEPARADOR_DE_CELULA, type ItemDoPdf } from '@/lib/oc/leitura/montarLinhas';

export interface LinhasDoPdf { linhas: string[]; paginas: number; temTexto: boolean }

/* Le^ o item do pdfjs sem cast: so' os que tem `str` e `transform` numerico. */
function itemDe(it: unknown): ItemDoPdf | null {
  if (typeof it !== 'object' || it === null || !('str' in it) || !('transform' in it)) return null;
  const { str, transform } = it;
  if (typeof str !== 'string' || !Array.isArray(transform)) return null;
  const x = Number(transform[4]); const y = Number(transform[5]);
  return Number.isFinite(x) && Number.isFinite(y) ? { str, x, y } : null;
}

export async function extrairLinhasPdf(file: File): Promise<LinhasDoPdf> {
  const pdfjs = await importarDoApp(() => import('pdfjs-dist'));
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const paginas: ItemDoPdf[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const conteudo = await (await pdf.getPage(n)).getTextContent();
    const itens: ItemDoPdf[] = [];
    for (const it of conteudo.items) { const i = itemDe(it); if (i) itens.push(i); }
    paginas.push(itens);
  }
  const linhas = montarLinhas(paginas);
  return { linhas, paginas: pdf.numPages, temTexto: linhas.length > 0 };
}
