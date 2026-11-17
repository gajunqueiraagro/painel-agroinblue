/**
 * NOTA-DANFE-01 — abre o DANFE do XML numa aba. A aba nasce NO CLIQUE (`abrirAbaDoDanfe`): abrir depois de esperar o XML do banco
 * faria o navegador barrar o pop-up. O documento é o do `danfeHtml` (puro); o leitor é o de sempre (`lerNFe` + `lerExtrasDoDanfe`).
 */
import { lerExtrasDoDanfe, lerNFe } from '@/lib/financeiro/nfe/lerNFe';
import { danfeHtml } from '@/lib/financeiro/nfe/danfeHtml';

/** o HTML do DANFE ou a frase de por que não sai (a mesma recusa do leitor) */
export async function danfeDoArquivo(arquivo: File): Promise<{ ok: true; html: string } | { ok: false; frase: string }> {
  const bytes = await new Response(arquivo).arrayBuffer();
  const lida = lerNFe(bytes);
  if (lida.ok === false) return { ok: false, frase: lida.frase };
  const extras = lerExtrasDoDanfe(bytes);
  if (!extras) return { ok: false, frase: 'Não consegui ler esta nota para o DANFE.' };
  return { ok: true, html: danfeHtml(lida.nota, extras) };
}

/** a aba vazia, aberta no clique ("Gerando o DANFE…"); `null` se o navegador barrou */
export function abrirAbaDoDanfe(): Window | null {
  const aba = window.open('', '_blank');
  if (aba) aba.document.write('<!doctype html><title>DANFE</title><p style="font:14px system-ui;padding:24px">Gerando o DANFE…</p>');
  return aba;
}

/** escreve o DANFE na aba; sem aba (pop-up barrado), baixa o .html para abrir e imprimir */
export async function mostrarDanfe(aba: Window | null, arquivo: File): Promise<void> {
  const r = await danfeDoArquivo(arquivo);
  if (r.ok === false) { aba?.close(); throw new Error(r.frase); }
  if (aba && !aba.closed) { aba.document.open(); aba.document.write(r.html); aba.document.close(); return; }
  const url = URL.createObjectURL(new Blob([r.html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url; a.download = arquivo.name.replace(/\.xml$/i, '') + '-DANFE.html'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
