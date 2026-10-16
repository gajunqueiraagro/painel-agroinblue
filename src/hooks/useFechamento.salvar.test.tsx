/**
 * FECH-MAPA-PASTO-MODAL-01 — `salvarItens` para se o DELETE falhar (o INSERT nao roda) e entrega a recusa a quem chamou.
 * FECH-PASTO-SALVAR-TRANSACAO-01 — o card do pasto grava e reabre pelas duas RPCs, e o erro do banco volta inteiro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const insert = vi.fn(async () => ({ error: null }));
let erroDelete: { message: string } | null = null;
let erroRpc: { message: string } | null = null;
const rpc = vi.fn(async (_nome: string, _args: unknown) => ({ data: { ok: true }, error: erroRpc }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: async () => ({ data: [] }) }),
      delete: () => ({ eq: async () => ({ error: erroDelete }) }),
      insert,
    }),
    rpc: (nome: string, args: unknown) => rpc(nome, args),
  },
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'f' }, isGlobal: false }) }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useFechamento } from './useFechamento';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient() }, children);
const item = { categoria_id: 'c1', quantidade: 5, peso_medio_kg: 300, lote: null, observacoes: null, origem_dado: 'manual' };

beforeEach(() => { vi.clearAllMocks(); erroDelete = null; erroRpc = null; });

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

describe('as duas RPCs do card', () => {
  it('salvar: uma chamada com card, campos e itens; o erro do banco volta inteiro', async () => {
    const { result } = renderHook(() => useFechamento(), { wrapper });
    const campos = { lote_mes: 'L', tipo_uso_mes: 'cria', qualidade_mes: 7, observacao_mes: null };
    expect(await result.current.salvarCardDoPasto('f1', campos, [item])).toEqual({ ok: true, erro: null });
    expect(rpc).toHaveBeenCalledWith('fn_fechamento_pasto_salvar', { p_fechamento_id: 'f1', p_campos: campos, p_itens: [item] });
    erroRpc = { message: 'Mês 2026-09 possui Valor do Rebanho validado ou P2 fechado.' };
    expect((await result.current.salvarCardDoPasto('f1', campos, [item])).erro).toContain('P2 fechado');
    expect(insert).not.toHaveBeenCalled();
  });
  it('reabrir: a RPC do card com o motivo', async () => {
    const { result } = renderHook(() => useFechamento(), { wrapper });
    await result.current.reabrirCardDoPasto('f1', 'Reabertura individual via modal de pasto');
    expect(rpc).toHaveBeenCalledWith('fn_fechamento_pasto_reabrir', { p_fechamento_id: 'f1', p_motivo: 'Reabertura individual via modal de pasto' });
  });
});
