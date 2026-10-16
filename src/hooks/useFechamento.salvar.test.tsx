/**
 * FECH-MAPA-PASTO-MODAL-01 — `salvarItens` para se o DELETE falhar (o INSERT nao roda) e entrega a recusa a quem chamou;
 * `atualizarCamposMensais` devolve o erro em vez de engoli-lo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const insert = vi.fn(async () => ({ error: null }));
let erroDelete: { message: string } | null = null;
let erroUpdate: { message: string } | null = null;
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: async () => ({ data: [] }) }),
      delete: () => ({ eq: async () => ({ error: erroDelete }) }),
      insert,
      update: () => ({ eq: async () => ({ error: erroUpdate }) }),
    }),
  },
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'f' }, isGlobal: false }) }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useFechamento } from './useFechamento';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient() }, children);
const item = { categoria_id: 'c1', quantidade: 5, peso_medio_kg: 300, lote: null, observacoes: null, origem_dado: 'manual' };

beforeEach(() => { vi.clearAllMocks(); erroDelete = null; erroUpdate = null; });

describe('salvarItens', () => {
  it('erro do DELETE impede o INSERT e a recusa vai para quem chamou', async () => {
    erroDelete = { message: 'Mês 2026-09 possui Valor do Rebanho validado' };
    const { result } = renderHook(() => useFechamento(), { wrapper });
    const aoRecusar = vi.fn();
    expect(await result.current.salvarItens('f1', [item], { aoRecusar })).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(aoRecusar.mock.calls[0][0]).toContain('Valor do Rebanho validado');
  });
  it('sem erro, apaga e insere', async () => {
    const { result } = renderHook(() => useFechamento(), { wrapper });
    expect(await result.current.salvarItens('f1', [item])).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe('atualizarCamposMensais', () => {
  it('devolve o erro do banco', async () => {
    erroUpdate = { message: 'P2 fechado' };
    const { result } = renderHook(() => useFechamento(), { wrapper });
    expect(await result.current.atualizarCamposMensais('f1', { lote_mes: 'x' })).toEqual({ ok: false, erro: 'P2 fechado' });
  });
});
