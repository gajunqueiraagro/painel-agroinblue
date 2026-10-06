/**
 * gerarPdfCpr — CPR-EXPORT-01. Entry do PDF "Contas a Pagar e Receber": o MESMO chassi e o mesmo padrão de erro do
 * `gerarPdfAnaliseExecutivaV3` (motor por `import()` dinâmico, `try` na função inteira, a causa na frase).
 *
 * ⚠ SEM TOAST: a frase do erro VOLTA para quem chamou, que a escreve ao lado do botão (UX-TOAST-01).
 */
import { carregarLogoBase64 } from '@/lib/pdf/pdfChassi';
import type { ModeloCpr } from '@/lib/pdf/cpr/modeloCpr';

export type ResultadoDoPdfCpr = { ok: true; aviso: string | null } | { ok: false; frase: string };

import { motivoDaFalhaDoPdf } from '@/lib/pdf/cpr/falhaDoPdf';

/* a frase mora fora deste módulo (que se carrega por `import()`); o nome antigo continua exportado daqui */
export { motivoDaFalhaDoPdf };

/** Monta o PDF e devolve o arquivo em memória — a tela baixa; a prova confere. */
export async function montarBlobPdfCpr(modelo: ModeloCpr): Promise<Blob> {
  let logoData: string | undefined;
  try { logoData = await carregarLogoBase64(); } catch { logoData = undefined; }
  const [{ pdf }, { DocumentoCpr }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/lib/pdf/cpr/DocumentoCpr'),
  ]);
  return pdf(<DocumentoCpr modelo={modelo} logoData={logoData} />).toBlob();
}

export async function gerarPdfCpr(modelo: ModeloCpr): Promise<ResultadoDoPdfCpr> {
  try {
    const blob = await montarBlobPdfCpr(modelo);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${modelo.arquivo}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, aviso: modelo.valorInvalido ? `PDF gerado, mas ${modelo.valorInvalido} está com valor inválido.` : null };
  } catch (e) {
    console.error('[PDF Contas a Pagar e Receber] falha ao gerar:', e);
    return { ok: false, frase: motivoDaFalhaDoPdf(e) };
  }
}
