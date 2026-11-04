/**
 * CADERNO-CAMPO-01 peça 1 — gera e baixa o PDF do "Exportar mês". O mesmo padrão do PDF da CPR (`gerarPdfCpr`): o motor por `import()`
 * dinâmico pelo dono (`importarDoApp`), `try` na função inteira, a frase da falha pela `motivoDaFalhaDoPdf`.
 * ⚠ SEM TOAST: a frase VOLTA para quem chamou, que a escreve no diálogo (UX-TOAST-01).
 */
import type { CadernoDoMes } from '@/lib/caderno/cadernoDoMes';
import { motivoDaFalhaDoPdf } from '@/lib/pdf/cpr/falhaDoPdf';
import { importarDoApp } from '@/lib/app/falhaDeVersao';

/** `frase` = a falha em português (null quando deu certo) */
export interface ResultadoDoCaderno { ok: boolean; frase: string | null }

/** Monta o PDF em memória (a prova confere; a tela baixa). */
export async function montarBlobDoCaderno(caderno: CadernoDoMes): Promise<Blob> {
  const [{ pdf }, { DocumentoCaderno }] = await Promise.all([
    importarDoApp(() => import('@react-pdf/renderer')),
    importarDoApp(() => import('@/lib/caderno/DocumentoCaderno')),
  ]);
  return pdf(<DocumentoCaderno caderno={caderno} />).toBlob();
}

export async function gerarCadernoDoMes(caderno: CadernoDoMes): Promise<ResultadoDoCaderno> {
  try {
    const blob = await montarBlobDoCaderno(caderno);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${caderno.arquivo}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, frase: null };
  } catch (e) {
    console.error('[PDF Caderno de campo] falha ao gerar:', e);
    return { ok: false, frase: motivoDaFalhaDoPdf(e) };
  }
}
