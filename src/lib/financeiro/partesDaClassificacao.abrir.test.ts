/** FIN-CLASSIF-DIVIDIDA-01b — REGRA DO ID: a linha da parte 2+ ("id#2") abre o LANCAMENTO (Painel por periodo, Extrato gerencial). */
import { describe, it, expect, vi } from 'vitest';
const pedido = vi.hoisted(() => ({ eq: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ eq: (c: string, v: string) => { pedido.eq(c, v); return { maybeSingle: async () => ({ data: { id: v } }) }; } }) }) },
}));
import { lerLancamentoDaLinha } from './partesDaClassificacao';

describe('lerLancamentoDaLinha', () => {
  it('"abc#2" pede o lancamento "abc" (nunca o id da linha da parte)', async () => {
    expect(await lerLancamentoDaLinha<{ id: string }>('abc#2')).toEqual({ id: 'abc' });
    expect(pedido.eq).toHaveBeenLastCalledWith('id', 'abc');
    await lerLancamentoDaLinha('xyz');
    expect(pedido.eq).toHaveBeenLastCalledWith('id', 'xyz');
  });
});
