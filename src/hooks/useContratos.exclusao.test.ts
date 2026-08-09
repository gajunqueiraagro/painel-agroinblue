/**
 * PR-SEC-RLS-CONTRATOS-01A — gates do front para a recusa de exclusão.
 *
 * Arquivo auxiliar justificado nominalmente: os gates G30, G31 e G32 exigem
 * provar que a ação de excluir (a) NÃO emite DELETE, (b) mostra mensagem segura
 * e (c) não emite toast de sucesso. Nenhuma dessas três coisas é verificável
 * pela suíte SQL, que não enxerga o cliente.
 *
 * O cliente Supabase é mockado por completo: qualquer chamada a `.from()` marca
 * o gate como vermelho.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const fromSpy = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => {
      fromSpy(...args);
      throw new Error('gate: o writer nao pode tocar o banco nesta operacao');
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => toastSuccess(m),
    error: (m: string) => toastError(m),
  },
}));

// Contextos: o hook os consome no topo; devolvemos algo estável e sintético.
vi.mock('@/contexts/ClienteContext', () => ({
  useCliente: () => ({ clienteAtual: null }),
}));
vi.mock('@/contexts/FazendaContext', () => ({
  useFazenda: () => ({ fazendaAtual: null }),
}));

import { useContratos, MENSAGEM_EXCLUSAO_BLOQUEADA } from './useContratos';

describe('PR-SEC-RLS-CONTRATOS-01A — exclusão de contrato bloqueada', () => {
  beforeEach(() => {
    fromSpy.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it('G31 a mensagem orienta encerrar e não vaza detalhe de banco', () => {
    expect(MENSAGEM_EXCLUSAO_BLOQUEADA).toMatch(/Encerrado/);
    expect(MENSAGEM_EXCLUSAO_BLOQUEADA).toMatch(/n[ãa]o podem ser exclu/i);
    for (const proibido of [
      'SQLSTATE', '42501', 'permission denied', 'row-level security',
      'details', 'hint', 'policy', 'financeiro_contratos', 'PGRST', 'DELETE',
    ]) {
      expect(MENSAGEM_EXCLUSAO_BLOQUEADA.toLowerCase()).not.toContain(proibido.toLowerCase());
    }
  });

  it('G30 excluirContrato NÃO emite nenhuma chamada ao banco', async () => {
    const { result } = renderHook(() => useContratos());
    fromSpy.mockClear();

    let retorno: boolean | undefined;
    await act(async () => {
      retorno = await result.current.excluirContrato();
    });

    expect(fromSpy).not.toHaveBeenCalled();
    expect(retorno).toBe(false);
  });

  it('G32 não emite toast de sucesso, e o toast de erro traz a mensagem autoral', async () => {
    const { result } = renderHook(() => useContratos());
    toastSuccess.mockClear();
    toastError.mockClear();

    await act(async () => {
      await result.current.excluirContrato();
    });

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(MENSAGEM_EXCLUSAO_BLOQUEADA);
  });
});
