/**
 * SOLTAR ARQUIVO FORA DE UMA ÁREA NÃO ABRE O ARQUIVO — UI-ARRASTAR-ARQUIVO-01a.
 *
 * Sem isto, o navegador trata o arquivo solto em qualquer ponto da página como "abra este arquivo": a aba navega para o PDF ou
 * a planilha e o operador perde a tela em que estava (um lançamento meio preenchido, a conferência aberta).
 *
 * ⚠ UMA PROTEÇÃO SÓ, NO SHELL (`App`). Ela age no FIM da subida do evento: quem já tratou o arrastar (a `AreaDeArquivo`, e as
 *   duas áreas antigas de foto) chamou `preventDefault` antes, e aqui não se mexe em nada.
 * ⚠ SÓ PARA ARQUIVO: `dataTransfer.types` tem de conter "Files". Arrastar texto, link ou uma linha (o `@dnd-kit` do Casar, dos
 *   Pastos e dos Dividendos usa ponteiro, nem passa por aqui) segue como sempre.
 */
const ehArquivo = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files');

export function tratarSoltarFora(e: DragEvent): void {
  if (!ehArquivo(e) || e.defaultPrevented) return;
  e.preventDefault();
  /* O cursor diz "aqui não": sem área embaixo, nada recebe o arquivo. */
  if (e.type === 'dragover' && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
}

/** Liga a proteção na janela e devolve quem a desliga. */
export function protegerSoltarFora(alvo: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  alvo.addEventListener('dragover', tratarSoltarFora);
  alvo.addEventListener('drop', tratarSoltarFora);
  return () => {
    alvo.removeEventListener('dragover', tratarSoltarFora);
    alvo.removeEventListener('drop', tratarSoltarFora);
  };
}
