/**
 * P90 — entry do PDF da grade da Visão Geral, no padrão do `gerarPdfCpr`: o motor por `import()` dinâmico, `try` na função inteira, e a
 * FRASE do erro volta para quem chamou (que a escreve ao lado do botão; sem toast).
 */
import { carregarLogoBase64 } from '@/lib/pdf/pdfChassi';
import { motivoDaFalhaDoPdf } from '@/lib/pdf/cpr/falhaDoPdf';
import { importarDoApp } from '@/lib/app/falhaDeVersao';
import type { ModeloGradeVG } from '@/lib/pdf/vg/modeloGradeVG';

export type ResultadoDoPdfGradeVG = { ok: true } | { ok: false; frase: string };

export async function montarBlobPdfGradeVG(modelo: ModeloGradeVG): Promise<Blob> {
  let logoData: string | undefined;
  try { logoData = await carregarLogoBase64(); } catch { logoData = undefined; }
  const [{ pdf }, { DocumentoGradeVG }] = await Promise.all([
    importarDoApp(() => import('@react-pdf/renderer')),
    importarDoApp(() => import('@/lib/pdf/vg/DocumentoGradeVG')),
  ]);
  return pdf(<DocumentoGradeVG modelo={modelo} logoData={logoData} />).toBlob();
}

export async function gerarPdfGradeVG(modelo: ModeloGradeVG): Promise<ResultadoDoPdfGradeVG> {
  try {
    const blob = await montarBlobPdfGradeVG(modelo);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${modelo.arquivo}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true };
  } catch (e) {
    console.error('[PDF Visão Geral] falha ao gerar:', e);
    return { ok: false, frase: motivoDaFalhaDoPdf(e) };
  }
}
