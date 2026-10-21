/**
 * OS ITENS DE TEXTO DO PDF, COM POSICAO E TAMANHO — FIN-NOTA-PDF-01. O mesmo `pdfjs` dos leitores de extrato e de documento da OC
 * (`extractPdfText`, `extrairLinhasPdf`), carregado so' quando um PDF chega. A leitura em si e' pura e mora em `danfe.ts`.
 * ⚠ `width`/`height` do item sao em pontos do PDF; a altura cai para a escala da fonte (`transform[3]`) quando o item nao a traz.
 */
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { importarDoApp } from '@/lib/app/falhaDeVersao';
import type { ItemDoDanfe } from './danfe';

export interface PaginasDoPdf { paginas: ItemDoDanfe[][]; tamanhos: { largura: number; altura: number }[] }

/** O item do pdfjs sem cast: so' os que tem `str` e `transform` numerico. */
export function itemDoPdfjs(it: unknown): ItemDoDanfe | null {
  if (typeof it !== 'object' || it === null || !('str' in it) || !('transform' in it)) return null;
  const { str, transform } = it;
  if (typeof str !== 'string' || !Array.isArray(transform)) return null;
  const x = Number(transform[4]); const y = Number(transform[5]);
  const w = 'width' in it ? Number(it.width) : 0;
  const hItem = 'height' in it ? Number(it.height) : 0;
  const h = hItem > 0 ? hItem : Math.abs(Number(transform[3])) || 0;
  return Number.isFinite(x) && Number.isFinite(y) ? { str, x, y, w: Number.isFinite(w) ? w : 0, h: Number.isFinite(h) ? h : 0 } : null;
}

/** O pedaco do pdfjs que a extracao usa (o teste passa o build `legacy`, que roda no node). */
export interface PdfjsMinimo {
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<{
    numPages: number;
    getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }>; getViewport: (o: { scale: number }) => { width: number; height: number } }>;
  }> };
}

export async function itensDoPdf(bytes: ArrayBuffer, pdfjsInjetado?: PdfjsMinimo): Promise<PaginasDoPdf> {
  let pdfjs: PdfjsMinimo;
  if (pdfjsInjetado) pdfjs = pdfjsInjetado;
  else {
    const m = await importarDoApp(() => import('pdfjs-dist'));
    m.GlobalWorkerOptions.workerSrc = workerSrc;
    pdfjs = m;
  }
  /* copia: o pdfjs transfere o buffer para o worker, e quem chamou ainda vai usar os bytes (anexo, previa) */
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const paginas: ItemDoDanfe[][] = [];
  const tamanhos: { largura: number; altura: number }[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const vp = pagina.getViewport({ scale: 1 });
    tamanhos.push({ largura: vp.width, altura: vp.height });
    const conteudo = await pagina.getTextContent();
    const itens: ItemDoDanfe[] = [];
    for (const it of conteudo.items) { const i = itemDoPdfjs(it); if (i) itens.push(i); }
    paginas.push(itens);
  }
  return { paginas, tamanhos };
}
