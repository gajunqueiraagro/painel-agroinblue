/* FECH-P2-TRAVA-01 — o Reabrir do Valor do Rebanho: (D2) vai pela fn_valor_rebanho_reabrir, nunca por UPDATE direto;
   (3) aparece também com o mês VALIDADO e o P2 aberto (o estado que o Reabrir antigo deixava na Baia Grande, set/26). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const { banco, lerEstadoDoP2 } = vi.hoisted(() => {
  const banco = {
    fechamento: null as null | { status: string },
    rpc: vi.fn(async (_nome: string, _args: unknown) => ({ data: {}, error: null as unknown })),
    updates: [] as string[],
  };
  const estado = { travado: false };
  return { banco, estado, lerEstadoDoP2: vi.fn(async () => ({ ok: true as const, valor: { travado: estado.travado, revalidar: false } })) };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: banco.rpc,
    from: (tabela: string) => {
      const q = {
        select: () => q, eq: () => q, order: () => q,
        update: () => { banco.updates.push(tabela); return q; },
        maybeSingle: async () => ({ data: tabela === 'valor_rebanho_fechamento' ? banco.fechamento : null, error: null }),
        then: (ok: (r: { data: unknown[]; error: null }) => void) => ok({ data: [], error: null }),
      };
      return q;
    },
  },
}));
vi.mock('@/lib/fechamento/travaDoP2', () => ({ lerEstadoDoP2 }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz', cliente_id: 'cli', papel: 'dono' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { useValorRebanho } from './useValorRebanho';

beforeEach(() => {
  vi.clearAllMocks();
  banco.fechamento = null; banco.updates = [];
  lerEstadoDoP2.mockImplementation(async () => ({ ok: true as const, valor: { travado: false, revalidar: false } }));
});

describe('useValorRebanho — Reabrir', () => {
  it('validado com o P2 aberto: validadoComP2Aberto liga (o Reabrir aparece)', async () => {
    banco.fechamento = { status: 'aberto' };
    lerEstadoDoP2.mockImplementation(async () => ({ ok: true as const, valor: { travado: true, revalidar: false } }));
    const { result } = renderHook(() => useValorRebanho('2026-09'));
    await waitFor(() => expect(result.current.validadoComP2Aberto).toBe(true));
    expect(result.current.isFechado).toBe(false);
    expect(lerEstadoDoP2).toHaveBeenCalledWith('faz', '2026-09');
  });

  it('P2 fechado: é o isFechado que mostra o Reabrir, não a marca nova', async () => {
    banco.fechamento = { status: 'fechado' };
    lerEstadoDoP2.mockImplementation(async () => ({ ok: true as const, valor: { travado: true, revalidar: false } }));
    const { result } = renderHook(() => useValorRebanho('2026-09'));
    await waitFor(() => expect(result.current.isFechado).toBe(true));
    expect(result.current.validadoComP2Aberto).toBe(false);
  });

  it('mês livre: nada', async () => {
    banco.fechamento = { status: 'aberto' };
    const { result } = renderHook(() => useValorRebanho('2026-09'));
    await waitFor(() => expect(lerEstadoDoP2).toHaveBeenCalled());
    expect(result.current.validadoComP2Aberto).toBe(false);
  });

  it('reabrir vai pela fn_valor_rebanho_reabrir (uma transação), nunca por UPDATE direto', async () => {
    banco.fechamento = { status: 'fechado' };
    const { result } = renderHook(() => useValorRebanho('2026-09'));
    await waitFor(() => expect(result.current.isFechado).toBe(true));
    await act(async () => { await result.current.reabrirFechamento(); });
    expect(banco.rpc).toHaveBeenCalledWith('fn_valor_rebanho_reabrir', {
      p_fazenda_id: 'faz', p_ano_mes: '2026-09', p_motivo: 'Reabertura pela tela do Valor do Rebanho',
    });
    expect(banco.updates).toEqual([]);
  });
});
