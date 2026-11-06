/**
 * P158 (TOAST-POSICAO-02) — o aviso no topo, no centro, com ✕ e 2 s; ERRO e ATENÇÃO ficam até o ✕ (sem `duration` na chamada →
 * Infinity; com `duration`, a dela). O `sonner` é mocado: o teste vê o que o embrulho entrega ao sonner e as props do Toaster.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const chamadas = vi.hoisted(() => ({ error: [] as unknown[][], warning: [] as unknown[][], success: [] as unknown[][], info: new Array<unknown[]>(), toaster: [] as Record<string, unknown>[] }));

vi.mock('sonner', () => {
  const toast = Object.assign(() => 1, {
    error: (...a: unknown[]) => { chamadas.error.push(a); return 1; },
    warning: (...a: unknown[]) => { chamadas.warning.push(a); return 1; },
    success: (...a: unknown[]) => { chamadas.success.push(a); return 1; },
    info: (...a: unknown[]) => { chamadas.info.push(a); return 1; },
    message: () => 1,
  });
  const Toaster = (props: Record<string, unknown>) => { chamadas.toaster.push(props); return null; };
  return { toast, Toaster };
});
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light' }) }));

import { Toaster, idDoAviso, toast } from './sonner';

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
    expect(chamadas.error[0]).toEqual(['Falhou', { description: 'detalhe', id: 'aviso:error:Falhou', duration: Infinity }]);
    expect(chamadas.warning[0]).toEqual(['Atenção', { id: 'aviso:warning:Atenção', duration: Infinity }]);
    expect(chamadas.error[1]).toEqual(['Rápido', { duration: 3000, id: 'aviso:error:Rápido' }]);
  });

  it('toast.success não ganha duração (usa os 2 s do Toaster)', () => {
    toast.success('Salvo');
    expect(chamadas.success[0]).toEqual(['Salvo', { id: 'aviso:success:Salvo' }]);
  });
});

describe('FECH-REVALIDAR-AVISO-01 — nenhum aviso repetido', () => {
  it('o mesmo texto do mesmo tipo leva o MESMO id (o sonner atualiza em vez de empilhar); outro texto ou outro tipo, outro id', () => {
    toast.warning('Revalide o Valor do Rebanho de set/26 (o peso mudou).');
    toast.warning('Revalide o Valor do Rebanho de set/26 (o peso mudou).');
    toast.info('Revalide o Valor do Rebanho de set/26 (o peso mudou).');
    const msg = 'Revalide o Valor do Rebanho de set/26 (o peso mudou).';
    const doAviso = ['Revalide o Valor do Rebanho de set/26 (o peso mudou).', { id: `aviso:warning:${msg}`, duration: Infinity }];
    expect(chamadas.warning.slice(-2)).toEqual([doAviso, doAviso]);
    expect(chamadas.info.at(-1)).toEqual([msg, { id: `aviso:info:${msg}` }]);
  });
  it('quem passa o id decide; mensagem que não é texto não ganha id', () => {
    toast.success('Salvo', { id: 'meu' });
    expect(chamadas.success.at(-1)).toEqual(['Salvo', { id: 'meu' }]);
    expect(idDoAviso('info', { tipo: 'elemento' })).toBeUndefined();
    expect(idDoAviso('info', '  ')).toBeUndefined();
  });
});
