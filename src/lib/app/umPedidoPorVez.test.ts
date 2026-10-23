/**
 * P53 — UM pedido por vez para a mesma pergunta: quem chega com a MESMA chave enquanto o pedido está a caminho recebe a mesma resposta;
 * terminado, o próximo vai ao banco (nada é guardado além do voo). E o `useStatusPilares` montado 3× com o mesmo mês pede UMA vez.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
const rpc = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => ({ data: { p1_mapa_pastos: { status: 'oficial' } }, error: null })));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { criarUmPedidoPorVez } from './umPedidoPorVez';
import { useStatusPilares } from '@/hooks/useStatusPilares';

describe('criarUmPedidoPorVez', () => {
  it('a mesma chave em voo: um pedido, a mesma resposta; chave diferente: outro pedido; terminado: pede de novo', async () => {
    const umPorVez = criarUmPedidoPorVez<number>();
    let n = 0;
    const pedir = () => new Promise<number>((ok) => setTimeout(() => ok(++n), 5));
    const [a, b, c] = await Promise.all([umPorVez('f|2026-09', pedir), umPorVez('f|2026-09', pedir), umPorVez('f|2026-10', pedir)]);
    expect([a, b, n]).toEqual([1, 1, 2]);
    expect(c).toBe(2);
    expect(await umPorVez('f|2026-09', pedir)).toBe(3);
  });
  it('o erro também é dividido e a chave sai (o próximo tenta de novo)', async () => {
    const umPorVez = criarUmPedidoPorVez<number>();
    const falha = vi.fn(async () => { throw new Error('rede'); });
    await expect(Promise.all([umPorVez('k', falha), umPorVez('k', falha)])).rejects.toThrow('rede');
    expect(falha).toHaveBeenCalledTimes(1);
    await expect(umPorVez('k', falha)).rejects.toThrow('rede');
    expect(falha).toHaveBeenCalledTimes(2);
  });
});

describe('useStatusPilares — o mesmo mês em 3 componentes ao mesmo tempo', () => {
  it('pede UMA vez e os três leem o mesmo status', async () => {
    rpc.mockClear();
    const hooks = [1, 2, 3].map(() => renderHook(() => useStatusPilares('faz-1', '2026-09')));
    await waitFor(() => expect(hooks.every((h) => h.result.current.status.p1_mapa_pastos.status === 'oficial')).toBe(true));
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
