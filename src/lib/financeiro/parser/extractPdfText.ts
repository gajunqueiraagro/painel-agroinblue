/**
 * extractPdfText — extrai texto puro de PDF via pdfjs-dist.
 *
 * Uso: guard de importacao. PDFs escaneados (imagem) retornam
 * hasTextLayer=false. Caller deve rejeitar com mensagem clara.
 *
 * Decisoes:
 *  - Lazy import de pdfjs-dist: nao entra no bundle inicial,
 *    so carrega quando operador clica em Importar Extrato com PDF.
 *  - Worker via CDN (cdnjs) usando pdfjs.version: garante sempre a
 *    mesma versao do package.json sem build hack do Vite.
 *  - Tipos: local + type guard, sem depender de paths internos do
 *    pdfjs-dist que mudam entre versoes.
 *
 * NOTA — Worker CDN: se houver problema de CSP (Content Security
 * Policy) em producao ou bloqueio de cdnjs, trocar por worker local
 * via Vite em PR futuro:
 *   import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
 *   pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
 */

export interface PdfExtractResult {
  /** Texto concatenado de todas as paginas, separado por \n. */
  text: string;
  /** Total de paginas no PDF. */
  pageCount: number;
  /** false quando text.trim() vazio = PDF escaneado/sem texto. */
  hasTextLayer: boolean;
}

/** Item de texto retornado pelo TextContent do pdfjs-dist. */
interface PdfTextItem {
  str: string;
}

/** Type guard local — TextContent.items pode trazer TextItem ou
 *  TextMarkedContent (apenas o primeiro tem .str). */
function hasStr(it: unknown): it is PdfTextItem {
  return (
    typeof it === 'object' &&
    it !== null &&
    'str' in it &&
    typeof (it as { str: unknown }).str === 'string'
  );
}

export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' +
    pdfjs.version +
    '/pdf.worker.min.mjs';

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pageCount = pdf.numPages;

  let text = '';
  for (let n = 1; n <= pageCount; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    // Cast pra unknown[] (NÃO any) para permitir o type guard estreitar:
    // content.items é (TextItem | TextMarkedContent)[] do pdfjs-dist;
    // hasStr aceita unknown e retorna predicate. unknown é a forma TS-safe
    // de propagar pro filter sem depender dos tipos internos do package.
    const lineText = (content.items as unknown[])
      .filter(hasStr)
      .map((it) => it.str)
      .join(' ');
    text += lineText + '\n';
  }

  return { text, pageCount, hasTextLayer: text.trim().length > 0 };
}
