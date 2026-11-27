/**
 * VISUALIZADOR-PDF-02b (Chat 25/11): o leitor de PDF do navegador mostra na barra o TÍTULO do documento; sem título, o fim da URL — e a URL
 * `blob:` é um código ("741cb9c9-…"). Aqui: uma CÓPIA do PDF com o título = o nome do arquivo, SÓ para o leitor (quem baixa recebe o original).
 * As páginas não são redesenhadas: o pdf-lib regrava a estrutura e copia o conteúdo de cada página como está.
 * ⚠ PDF com senha/criptografado ou que o pdf-lib não abre: null — quem chama mostra o original (o leitor mostra o código; o nome segue na
 *   nossa barra). Nunca um PDF pela metade: sem página, null.
 */
import { PDFDocument } from 'pdf-lib';

export async function pdfComTitulo(bytes: ArrayBuffer, titulo: string): Promise<Uint8Array | null> {
  try {
    const doc = await PDFDocument.load(new Uint8Array(bytes.slice(0)), { updateMetadata: false });
    if (doc.getPageCount() < 1) return null;
    doc.setTitle(titulo, { showInWindowTitleBar: true });
    return await doc.save({ useObjectStreams: false });
  } catch {
    return null;
  }
}
