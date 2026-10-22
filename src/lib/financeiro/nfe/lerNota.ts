/**
 * A NOTA DO ARQUIVO, SEJA XML OU PDF — FIN-NOTA-PDF-01. UMA porta: o "+ Da nota" entrega o arquivo aqui e recebe a MESMA `NotaLida`.
 *   XML -> `lerNFe` (o leitor de sempre, intocado); PDF -> `itensDoPdf` + `notaDoDanfe`.
 * ⚠ QUEM DECIDE O QUE E' O ARQUIVO SAO OS BYTES ("%PDF" no comeco), nao a extensao nem o tipo que o navegador diz.
 * ⚠ So' o PDF traz `marcas` (o amarelo da previa) e `divergencias` (a conferencia pela chave); no XML a chave vem do protocolo.
 */
import { lerNFe } from './lerNFe';
import { notaDoDanfe, type CampoConferido, type MarcaNoPdf, type TotaisExtrasDoDanfe } from './danfe';
import { itensDoPdf, type PaginasDoPdf, type PdfjsMinimo } from './lerNotaPdf';
import type { AvisoNFe, NotaLida } from './tipos';

export type NotaDoArquivo =
  | { ok: true; origem: 'xml' | 'pdf'; nota: NotaLida; avisos: AvisoNFe[]; marcas: MarcaNoPdf[]; divergencias: CampoConferido[];
      tamanhos: PaginasDoPdf['tamanhos'];
      /** ITENS-NOTA-01 — so' o PDF: os totais do quadro do imposto (seguro, outras, IPI, ST, tributos aprox.) */
      extras?: TotaisExtrasDoDanfe | null }
  | { ok: false; origem: 'xml' | 'pdf'; frase: string };

export const FRASE_PDF_ILEGIVEL = 'Não foi possível abrir o PDF (arquivo danificado ou protegido). Nada foi lido.';

/** Os bytes comecam por "%PDF"? */
export function ehPdf(bytes: ArrayBuffer): boolean {
  const b = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  return b.length === 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
}

export async function lerNota(bytes: ArrayBuffer, opcoes: { pdfjs?: PdfjsMinimo } = {}): Promise<NotaDoArquivo> {
  if (!ehPdf(bytes)) {
    const r = lerNFe(bytes);
    if (r.ok === false) return { ok: false, origem: 'xml', frase: r.frase };
    return { ok: true, origem: 'xml', nota: r.nota, avisos: r.avisos, marcas: [], divergencias: [], tamanhos: [] };
  }
  let lido: PaginasDoPdf;
  try {
    lido = await itensDoPdf(bytes, opcoes.pdfjs);
  } catch {
    return { ok: false, origem: 'pdf', frase: FRASE_PDF_ILEGIVEL };
  }
  const r = notaDoDanfe(lido.paginas);
  if (r.ok === false) return { ok: false, origem: 'pdf', frase: r.frase };
  return { ok: true, origem: 'pdf', nota: r.nota, avisos: r.avisos, marcas: r.marcas, divergencias: r.divergencias, tamanhos: lido.tamanhos, extras: r.extras };
}
