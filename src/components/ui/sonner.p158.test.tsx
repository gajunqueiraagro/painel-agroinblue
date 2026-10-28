/**
 * P158 (TOAST-POSICAO-02) — o aviso no topo, no centro, com ✕ e 2 s; ERRO e ATENÇÃO ficam até o ✕ (sem `duration` na chamada →
 * Infinity; com `duration`, a dela). O `sonner` é mocado: o teste vê o que o embrulho entrega ao sonner e as props do Toaster.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const chamadas = vi.hoisted(() => ({ error: [] as unknown[][], warning: [] as unknown[][], success: [] as unknown[][], toaster: [] as Record<string, unknown>[] }));

vi.mock('sonner', () => {
  const toast = Object.assign(() => 1, {
    error: (...a: unknown[]) => { chamadas.error.push(a); return 1; },
    warning: (...a: unknown[]) => { chamadas.warning.push(a); return 1; },
    success: (...a: unknown[]) => { chamadas.success.push(a); return 1; },
  });
  const Toaster = (props: Record<string, unknown>) => { chamadas.toaster.push(props); return null; };
  return { toast, Toaster };
});
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light' }) }));

import { Toaster, toast } from './sonner';

describe('P158 — aviso no topo, com ✕, 2 s; erro e atenção ficam até o ✕', () => {
  it('o Toaster nasce em top-center, offset 12px, com ✕ e 2000 ms', () => {
    render(<Toaster />);
    const p = chamadas.toaster.at(-1);
    expect(p?.position).toBe('top-center');
    expect(p?.offset).toBe('12px');
    expect(p?.closeButton).toBe(true);
    expect(p?.duration).toBe(2000);
  });

  it('toast.error e toast.warning sem duration → Infinity (fica até o ✕); com duration → a dela; o resto do pedido passa igual', () => {
    toast.error('Falhou', { description: 'detalhe' });
    toast.warning('Atenção');
    toast.error('Rápido', { duration: 3000 });
    expect(chamadas.error[0]).toEqual(['Falhou', { description: 'detalhe', duration: Infinity }]);
    expect(chamadas.warning[0]).toEqual(['Atenção', { duration: Infinity }]);
    expect(chamadas.error[1]).toEqual(['Rápido', { duration: 3000 }]);
  });

  it('toast.success não é embrulhado (usa os 2 s do Toaster)', () => {
    toast.success('Salvo');
    expect(chamadas.success[0]).toEqual(['Salvo']);
  });
});
