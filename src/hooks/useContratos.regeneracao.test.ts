/** PR-SEC-RLS-CONTRATOS-01B v2 — gates do front para a RPC unificada. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const upd = vi.fn(); const del = vi.fn(); const rpc = vi.fn();
const tOk = vi.fn(); const tErr = vi.fn();
let resposta: unknown = { ok: true, removidas: 2, criadas: 3 };
const CONTRATO = { id: 'ct1', cliente_id: 'c1', updated_at: '2026-08-09T10:00:00Z',
  valor: 10, data_inicio: '2026-01-10', dia_pagamento: 10, status: 'ativo' };

function b() {
  const o: Record<string, unknown> = {};
  const ch = () => o;
  o.select = ch; o.eq = ch; o.order = ch; o.insert = ch;
  o.update = (...a: unknown[]) => { upd(...a); return o; };
  o.delete = (...a: unknown[]) => { del(...a); return o; };
  o.single = async () => ({ data: CONTRATO, error: null });
  o.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r);
  return o;
}
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => b(), rpc: (n: string, a: unknown) => { rpc(n, a); return Promise.resolve({ data: resposta, error: null }); } },
}));
vi.mock('sonner', () => ({ toast: { success: (m: string) => tOk(m), error: (m: string) => tErr(m) } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'c1' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: null }) }));

import { useContratos, MENSAGEM_REGENERACAO_INDEFINIDA, MENSAGEM_EXCLUSAO_BLOQUEADA } from './useContratos';

describe('01B v2 — edicao + regeneracao unificadas', () => {
  beforeEach(() => { upd.mockClear(); del.mockClear(); rpc.mockClear(); tOk.mockClear(); tErr.mockClear();
    resposta = { ok: true, removidas: 2, criadas: 3 }; });

  it('F1 com regeneracao: nenhum UPDATE, nenhum DELETE, exatamente uma RPC', async () => {
    const { result } = renderHook(() => useContratos());
    await act(async () => { await result.current.editarContrato('ct1', { valor: 50 }, true); });
    expect(upd).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('F2 envia versao PRE-update e parametros tipados', async () => {
    const { result } = renderHook(() => useContratos());
    await act(async () => { await result.current.editarContrato('ct1', { valor: 50 }, true); });
    const [nome, a] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(nome).toBe('fn_contrato_editar_e_regenerar');
    expect(a.p_contrato_id).toBe('ct1');
    expect(a.p_versao).toBe('2026-08-09T10:00:00Z');
    expect(a.p_valor).toBe(50);
    expect(a.p_status).toBe('ativo');
    expect(typeof a.p_a_partir_de).toBe('string');
  });

  it('F3 sucesso so apos commit, com quantidades', async () => {
    const { result } = renderHook(() => useContratos());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.editarContrato('ct1', {}, true); });
    expect(ok).toBe(true);
    expect(tOk).toHaveBeenCalledTimes(1);
    expect(String(tOk.mock.calls[0][0])).toMatch(/2 .*3/);
  });

  it('F4 resposta neutra NAO vira sucesso', async () => {
    resposta = null;
    const { result } = renderHook(() => useContratos());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.editarContrato('ct1', {}, true); });
    expect(ok).toBe(false);
    expect(tOk).not.toHaveBeenCalled();
    expect(tErr).toHaveBeenCalledWith(MENSAGEM_REGENERACAO_INDEFINIDA);
  });

  it('F5 sem regeneracao: UPDATE simples permanece e nao chama RPC', async () => {
    const { result } = renderHook(() => useContratos());
    await act(async () => { await result.current.editarContrato('ct1', { valor: 7 }, false); });
    expect(upd).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('F6 mensagens sem detalhe de banco', () => {
    for (const m of [MENSAGEM_REGENERACAO_INDEFINIDA, MENSAGEM_EXCLUSAO_BLOQUEADA]) {
      for (const p of ['SQLSTATE','P0001','P0003','details','hint','financeiro_','policy']) {
        expect(m.toLowerCase()).not.toContain(p.toLowerCase());
      }
    }
  });

  it('F7 exclusao fisica continua bloqueada (01A)', async () => {
    const { result } = renderHook(() => useContratos());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.excluirContrato(); });
    expect(ok).toBe(false);
    expect(del).not.toHaveBeenCalled();
    expect(tErr).toHaveBeenCalledWith(MENSAGEM_EXCLUSAO_BLOQUEADA);
  });
});
