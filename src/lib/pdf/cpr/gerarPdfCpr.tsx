/**
 * gerarPdfCpr — CPR-EXPORT-01. Entry do PDF "Contas a Pagar e Receber": o MESMO chassi e o mesmo padrão de erro do
 * `gerarPdfAnaliseExecutivaV3` (motor por `import()` dinâmico, `try` na função inteira, a causa na frase).
 *
 * ⚠ SEM TOAST: a frase do erro VOLTA para quem chamou, que a escreve ao lado do botão (UX-TOAST-01).
 */
import { carregarLogoBase64 } from '@/lib/pdf/pdfChassi';
import type { ModeloCpr } from '@/lib/pdf/cpr/modeloCpr';

export type ResultadoDoPdfCpr = { ok: true; aviso: string | null } | { ok: false; frase: string };

/** Traduz a exceção para uma frase que diz o que houve E o que fazer — as mesmas três causas do PDF executivo. */
export function motivoDaFalhaDoPdf(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg)) {
    return 'O aplicativo foi atualizado depois que esta página abriu. Recarregue a página (Ctrl+R) e gere o PDF de novo.';
  }
  if (/unsupported number/i.test(msg)) {
    return `Um valor inválido entre as contas deste período impediu o desenho do PDF. Confira os lançamentos. (${msg})`;
  }
  return `Falha ao gerar PDF: ${msg}`;
}

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
