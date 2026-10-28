/**
 * P158b — com um modal aberto, o ✕ do aviso fecha o aviso, e o modal continua aberto.
 * Monta o `Toaster` da casa (o sonner de verdade) e o `DialogContent` da casa (o Radix de verdade), como na prévia da nota
 * ("O que a nota muda em cada parcela") com o erro "Os itens da nota não foram guardados…" por cima.
 * O jsdom não decide clique por `pointer-events`; a conta que o navegador faz (e que o `user-event` faz) é a herança: o primeiro
 * ancestral com `pointer-events` declarado manda. `pointerEventsEfetivo` faz essa conta.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { Toaster } from './sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from './alert-dialog';

vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light' }) }));

beforeAll(() => {
  /* o arrastar do sonner captura o ponteiro; o jsdom não tem */
  if (!HTMLElement.prototype.setPointerCapture) HTMLElement.prototype.setPointerCapture = () => {};
  if (!HTMLElement.prototype.releasePointerCapture) HTMLElement.prototype.releasePointerCapture = () => {};
  /* o sonner pergunta o tema do sistema */
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', { value: (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }) });
  }
});

function pointerEventsEfetivo(el: Element | null): string {
  for (let e = el; e; e = e.parentElement) {
    const v = e instanceof HTMLElement ? e.style.pointerEvents : '';
    if (v && v !== 'inherit') return v;
  }
  return 'auto';
}

describe('P158b — o ✕ do aviso com um modal aberto', () => {
  it('o ✕ recebe o clique, fecha o aviso, e o modal NÃO fecha', async () => {
    const mudou = vi.fn();
    render(
      <>
        <Toaster />
        <Dialog open onOpenChange={mudou}>
          <DialogContent>
            <DialogTitle>O que a nota muda em cada parcela</DialogTitle>
            <DialogDescription>prévia</DialogDescription>
          </DialogContent>
        </Dialog>
      </>,
    );
    /* o Radix desliga o clique fora do modal */
    await waitFor(() => expect(document.body.style.pointerEvents).toBe('none'));
    act(() => { toast.error('Os itens da nota não foram guardados'); });
    const fechar = await screen.findByRole('button', { name: /close toast/i });

    /* 1) o ✕ recebe o clique (no navegador, sem a correção, herdava o `none` do body) */
    expect(pointerEventsEfetivo(fechar)).toBe('auto');

    /* 2) o clique no ✕ fecha o aviso — e não conta como "clique fora" do modal */
    await new Promise((r) => setTimeout(r, 0));   // o Radix liga o "clique fora" num setTimeout
    fireEvent.pointerDown(fechar);
    fireEvent.click(fechar);
    await waitFor(() => expect(screen.queryByText('Os itens da nota não foram guardados')).toBeNull());
    expect(mudou).not.toHaveBeenCalled();
    expect(screen.getByText('O que a nota muda em cada parcela')).toBeTruthy();
  });

  it('também sobre um AlertDialog (confirmação): o ✕ recebe o clique e fecha o aviso; a confirmação fica', async () => {
    const mudou = vi.fn();
    render(
      <>
        <Toaster />
        <AlertDialog open onOpenChange={mudou}>
          <AlertDialogContent>
            <AlertDialogTitle>Confirmar</AlertDialogTitle>
            <AlertDialogDescription>x</AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      </>,
    );
    await waitFor(() => expect(document.body.style.pointerEvents).toBe('none'));
    act(() => { toast.warning('Atenção sobre a confirmação'); });
    const fechar = await screen.findByRole('button', { name: /close toast/i });
    expect(pointerEventsEfetivo(fechar)).toBe('auto');
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.pointerDown(fechar);
    fireEvent.click(fechar);
    await waitFor(() => expect(screen.queryByText('Atenção sobre a confirmação')).toBeNull());
    expect(mudou).not.toHaveBeenCalled();
  });

  it('o clique fora de verdade (fora do aviso) continua fechando o modal', async () => {
    const mudou = vi.fn();
    render(
      <>
        <div data-testid="fora">fora</div>
        <Dialog open onOpenChange={mudou}>
          <DialogContent>
            <DialogTitle>Modal</DialogTitle>
            <DialogDescription>x</DialogDescription>
          </DialogContent>
        </Dialog>
      </>,
    );
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.pointerDown(screen.getByTestId('fora'));
    expect(mudou).toHaveBeenCalledWith(false);
  });
});
