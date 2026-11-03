/**
 * FIN-LISTA-SEM-F5-01 (Gabriel 03/11) — a parcela da compra parcelada editada no modal do lançamento grava pela grade do contrato
 * (`fn_parcelamento_editar_parcelas`) ANTES do gravador de sempre, que depois vê "nada mudou" (P116) e não avisa. QUEM GRAVA AVISA:
 * L1 gravou → o canal dos lançamentos ouve (a lista de Lançamentos e os totais se releem, sem F5)
 * L2 o banco recusou → ninguém é avisado (nada mudou)
 * L3 sem cliente → não avisa (não há a quem)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const banco = vi.hoisted(() => ({ erro: null as { message: string } | null, pedidos: [] as { fn: string; args: Record<string, unknown> }[] }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: async (fn: string, args: Record<string, unknown>) => { banco.pedidos.push({ fn, args }); return { data: null, error: banco.erro }; } },
}));

import { gravarParcelaDoModal } from './parcelaNoModalBanco';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';

const LISTA = [{ id: 'p4', data_vencimento: '2026-11-02', valor: 6134.86 }];

describe('FIN-LISTA-SEM-F5-01 — a parcela gravada no modal avisa a lista', () => {
  beforeEach(() => { banco.erro = null; banco.pedidos = []; });

  it('L1 gravou: a grade do contrato com a lista e o total, e o canal dos lançamentos do cliente ouve (sem ids: a página inteira)', async () => {
    const ouviu = vi.fn();
    const sair = inscreverEmLancamentos('cli-1', ouviu);
    const r = await gravarParcelaDoModal('fin-1', LISTA, 2453946, 'cli-1');
    sair();
    expect(r).toBeNull();
    expect(banco.pedidos).toEqual([{ fn: 'fn_parcelamento_editar_parcelas', args: { p_financiamento_id: 'fin-1', p_parcelas: LISTA, p_valor_total: 24539.46 } }]);
    expect(ouviu).toHaveBeenCalledTimes(1);
    expect(ouviu).toHaveBeenCalledWith(undefined);
  });

  it('L2 o banco recusou: a frase volta e ninguém é avisado', async () => {
    banco.erro = { message: 'Mês fechado.' };
    const ouviu = vi.fn();
    const sair = inscreverEmLancamentos('cli-1', ouviu);
    expect(await gravarParcelaDoModal('fin-1', LISTA, 2453946, 'cli-1')).toBe('Mês fechado.');
    sair();
    expect(ouviu).not.toHaveBeenCalled();
  });

  it('L3 sem cliente: grava e não avisa ninguém; o aviso é do cliente certo (o de outro cliente não ouve)', async () => {
    const outro = vi.fn();
    const sair = inscreverEmLancamentos('cli-2', outro);
    expect(await gravarParcelaDoModal('fin-1', LISTA, 2453946, null)).toBeNull();
    expect(await gravarParcelaDoModal('fin-1', LISTA, 2453946, 'cli-1')).toBeNull();
    sair();
    expect(outro).not.toHaveBeenCalled();
  });
});
