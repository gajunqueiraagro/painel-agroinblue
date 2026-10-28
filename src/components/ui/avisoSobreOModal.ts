/**
 * P158b (Gabriel 28/10/2026 17:26) — O ✕ DO AVISO FUNCIONA COM QUALQUER MODAL ABERTO.
 *
 * O modal do Radix (Dialog, AlertDialog, Sheet) põe `pointer-events: none` no `body` enquanto está aberto e devolve o clique só ao
 * conteúdo dele. O `Toaster` do sonner mora FORA do modal (no fim do `body`): o aviso aparecia por cima, mas nenhum clique chegava
 * nele — o erro/atenção, que só fecha no ✕ (P158), ficava preso na tela ("Os itens da nota não foram guardados…" sobre "O que a nota
 * muda em cada parcela").
 * Duas metades, e as duas são necessárias:
 *   1. a lista do sonner devolve o clique a si mesma (`ESTILO_DO_AVISO` no `Toaster`, `sonner.tsx`);
 *   2. o clique no aviso NÃO conta como "clique fora" do modal (`semFecharPeloAviso` no Dialog e no Sheet da casa) — sem isto,
 *      fechar o aviso fecharia junto o modal, e o que estava preenchido nele. O AlertDialog do Radix nunca fecha por clique fora
 *      (nem expõe esses eventos): para ele basta a metade 1.
 */
import type { CSSProperties } from 'react';

/** O atributo que o sonner põe na lista dos avisos (`<ol data-sonner-toaster>`). */
export const SELETOR_DO_AVISO = '[data-sonner-toaster]';

/** A lista dos avisos recebe clique mesmo com o `body` em `pointer-events: none` (modal aberto). */
export const ESTILO_DO_AVISO: CSSProperties = { pointerEvents: 'auto' };

export function ehDoAviso(alvo: EventTarget | null): boolean {
  return alvo instanceof Element && alvo.closest(SELETOR_DO_AVISO) !== null;
}

/** Embrulha o `onPointerDownOutside` / `onInteractOutside` do modal: o gesto que vem do aviso não fecha o modal (e não chega ao de quem
 *  usa o modal); o resto segue para ele como sempre. */
export function semFecharPeloAviso<E extends { target: EventTarget | null; preventDefault(): void }>(dele?: (e: E) => void) {
  return (e: E) => {
    if (ehDoAviso(e.target)) { e.preventDefault(); return; }
    dele?.(e);
  };
}
