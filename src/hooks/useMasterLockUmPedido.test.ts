/**
 * P53 — a trava master do mês: duas instâncias com o MESMO mês, ao mesmo tempo, fazem UM pedido de cada consulta (pastos,
 * fechamento_pastos, valor_rebanho_mensal); o `checkLockNow` (o do envio) continua indo direto ao banco.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
const pedidos = vi.hoisted(() => [] as string[]);
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (t: string): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'or', 'limit']) c[m] = () => c;
    c.then = (ok: (r: unknown) => unknown) => { pedidos.push(t); return Promise.resolve({ data: [], error: null }).then(ok); };
    return c;
  };
  return { supabase: { from: (t: string) => cadeia(t) } };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', config: {} } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz-1' } }) }));
import { useMasterLock } from './useMasterLock';

describe('useMasterLock — o mesmo mês em duas instâncias', () => {
  it('um pedido de cada consulta; o checkLockNow vai direto', async () => {
    pedidos.length = 0;
    const a = renderHook(() => useMasterLock('2026-09'));
    renderHook(() => useMasterLock('2026-09'));
    await waitFor(() => expect(pedidos.length).toBe(3));
    await new Promise((r) => setTimeout(r, 20));
    expect([...pedidos].sort()).toEqual(['fechamento_pastos', 'pastos', 'valor_rebanho_mensal']);
    await a.result.current.checkLockNow('2026-09');
    expect(pedidos).toHaveLength(6);
  });
});
