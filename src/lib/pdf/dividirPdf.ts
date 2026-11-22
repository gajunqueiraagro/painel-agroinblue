/**
 * BOLETO-SEPARAR-01 + FOLHA × CAIXA (Gabriel 15:36: pdf-lib) — a rotina ÚNICA de dividir PDF: serve ao boleto (1 arquivo por boleto) e à
 * folha (1 arquivo por funcionário). As páginas são COPIADAS (pdf-lib `copyPages`): o texto, a linha digitável e o CNPJ continuam texto.
 * Páginas contadas a partir de 1, como no PDF que o operador vê.
 */
import { PDFDocument } from 'pdf-lib';

export type Divisao = { ok: true; arquivos: Uint8Array[] } | { ok: false; frase: string };

export const FRASE_PDF_NAO_ABRE = 'Não consegui abrir este PDF para dividir.';
export const FRASE_GRUPO_VAZIO = 'Há um arquivo sem nenhuma página.';
export const fraseForaDoPdf = (pagina: number, total: number) => `A página ${pagina} não existe (o PDF tem ${total}).`;

export async function dividirPdf(bytes: ArrayBuffer | Uint8Array, grupos: number[][]): Promise<Divisao> {
  let origem: PDFDocument;
  try {
    origem = await PDFDocument.load(bytes);
  } catch (e) {
    console.error('[dividirPdf] não abriu', e);
    return { ok: false, frase: FRASE_PDF_NAO_ABRE };
  }
  const total = origem.getPageCount();
  for (const g of grupos) {
    if (g.length === 0) return { ok: false, frase: FRASE_GRUPO_VAZIO };
    const fora = g.find((p) => !Number.isInteger(p) || p < 1 || p > total);
    if (fora !== undefined) return { ok: false, frase: fraseForaDoPdf(fora, total) };
  }
  const arquivos: Uint8Array[] = [];
  for (const g of grupos) {
    const novo = await PDFDocument.create();
    const paginas = await novo.copyPages(origem, g.map((p) => p - 1));
    paginas.forEach((p) => novo.addPage(p));
    arquivos.push(await novo.save());
  }
  return { ok: true, arquivos };
}

/**
 * As páginas de cada boleto (FASE 0 14:50 b), dada a página em que a linha digitável de cada um foi achada (na ordem do arquivo):
 * - o arquivo de um boleto vai da página seguinte à do boleto anterior até a dele (capa/aviso sem boleto vai com o boleto seguinte;
 *   ficha + recibo em 2 páginas ficam juntos);
 * - as páginas depois do último boleto vão com o último;
 * - 2 boletos na MESMA página: a página não se divide — os dois recebem o mesmo grupo.
 */
export function paginasDosBoletos(paginaDeCadaBoleto: number[], totalDePaginas: number): number[][] {
  const distintas = [...new Set(paginaDeCadaBoleto)].sort((a, b) => a - b);
  const grupoDa = new Map<number, number[]>();
  distintas.forEach((p, i) => {
    const inicio = i === 0 ? 1 : distintas[i - 1] + 1;
    const fim = i === distintas.length - 1 ? Math.max(p, totalDePaginas) : p;
    grupoDa.set(p, Array.from({ length: fim - inicio + 1 }, (_, k) => inicio + k));
  });
  return paginaDeCadaBoleto.map((p) => grupoDa.get(p) ?? [p]);
}
