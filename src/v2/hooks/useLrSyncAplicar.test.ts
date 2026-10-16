import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { aplicarLr, desfazerLr } from './useLrSyncAplicar';

describe('FIN-LR-SYNC-01a2 — aplicar e desfazer pelo banco', () => {
  beforeEach(() => rpc.mockReset());

  it('aplicar leva as decisões como vieram e SIMULA por padrão', async () => {
    rpc.mockResolvedValue({ data: { simulado: true }, error: null });
    const dec = [{ chave: 'p|A1|1|2032-01-02|2032-04', acao: 'atualizar', situacao: 'mudou', lancamento_visto: 'l1' }];
    const r = await aplicarLr('cli', 'ses', dec);
    expect(rpc).toHaveBeenCalledWith('fn_lr_sync_aplicar', { p_cliente: 'cli', p_sessao: 'ses', p_decisoes: dec, p_simular: true });
    expect(r).toEqual({ ok: true, envelope: { simulado: true } });
  });

  it('gravar é explícito', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await aplicarLr('cli', 'ses', [], false);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_simular: false });
  });

  it('desfazer: a última (nulo) e simulado por padrão', async () => {
    rpc.mockResolvedValue({ data: { resumo: {} }, error: null });
    await desfazerLr('cli', null);
    expect(rpc).toHaveBeenCalledWith('fn_lr_sync_desfazer', { p_cliente: 'cli', p_aplicacao: null, p_simular: true });
  });

  it('o erro do banco vai como veio', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "So' a ultima atualizacao do Lucro Rural pode ser desfeita" } });
    const r = await desfazerLr('cli', 'ap1', false);
    expect(r).toEqual({ ok: false, frase: "So' a ultima atualizacao do Lucro Rural pode ser desfeita" });
  });
});
