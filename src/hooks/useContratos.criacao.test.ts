/** PR-FIN-DATAS-VENCIMENTO-02A — gates do front para a criacao atomica. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const ins = vi.fn(); const upd = vi.fn(); const del = vi.fn(); const rpc = vi.fn();
const tOk = vi.fn(); const tErr = vi.fn();
let resp: unknown = { ok: true, contrato_id: 'ct-novo', criadas: 12, versao: '2026-08-09T10:00:00Z' };
const CT = { id: 'ct1', cliente_id: 'c1', updated_at: '2026-08-09T10:00:00Z', valor: 10,
  data_inicio: '2026-01-10', dia_pagamento: 10, status: 'ativo' };

function b() {
  const o: Record<string, unknown> = {}; const ch = () => o;
  o.select = ch; o.eq = ch; o.order = ch;
  o.insert = (...a: unknown[]) => { ins(...a); return o; };
  o.update = (...a: unknown[]) => { upd(...a); return o; };
  o.delete = (...a: unknown[]) => { del(...a); return o; };
  o.single = async () => ({ data: CT, error: null });
  o.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r);
  return o;
}
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => b(), rpc: (n: string, a: unknown) => { rpc(n, a); return Promise.resolve({ data: resp, error: null }); } },
}));
vi.mock('sonner', () => ({ toast: { success: (m: string) => tOk(m), error: (m: string) => tErr(m) } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'c1' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: null }) }));

import { useContratos, MENSAGEM_CRIACAO_INDEFINIDA } from './useContratos';
const FORM = { fazenda_id: 'faz1', valor: 100, data_inicio: '2026-01-31', dia_pagamento: 31 };

describe('02A — criacao atomica', () => {
  beforeEach(() => { ins.mockClear(); upd.mockClear(); del.mockClear(); rpc.mockClear(); tOk.mockClear(); tErr.mockClear();
    resp = { ok: true, contrato_id: 'ct-novo', criadas: 12, versao: '2026-08-09T10:00:00Z' }; });

  it('G1 usa exatamente uma RPC, sem INSERT direto nem DELETE', async () => {
    const { result } = renderHook(() => useContratos());
    await act(async () => { await result.current.criarContrato(FORM); });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('fn_contrato_criar_e_gerar');
    expect(ins).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('G2 nao envia cliente_id, id nem timestamps', async () => {
    const { result } = renderHook(() => useContratos());
    await act(async () => { await result.current.criarContrato(FORM); });
    const a = rpc.mock.calls[0][1] as Record<string, unknown>;
    for (const proibido of ['cliente_id','p_cliente_id','id','p_id','created_at','updated_at','p_created_at','p_updated_at']) {
      expect(Object.keys(a)).not.toContain(proibido);
    }
    expect(a.p_fazenda_id).toBe('faz1');
    expect(a.p_valor).toBe(100);
    expect(a.p_status).toBe('ativo');
  });

  it('G3 sucesso so apos retorno valido, com a contagem', async () => {
    const { result } = renderHook(() => useContratos());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.criarContrato(FORM); });
    expect(ok).toBe(true);
    expect(tOk).toHaveBeenCalledTimes(1);
    expect(String(tOk.mock.calls[0][0])).toMatch(/12/);
  });

  it('G4 resposta neutra NAO vira sucesso', async () => {
    resp = null;
    const { result } = renderHook(() => useContratos());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.criarContrato(FORM); });
    expect(ok).toBe(false);
    expect(tOk).not.toHaveBeenCalled();
    expect(tErr).toHaveBeenCalledWith(MENSAGEM_CRIACAO_INDEFINIDA);
  });

  it('G5 retorno incoerente (sem contrato_id) NAO vira sucesso', async () => {
    resp = { ok: true, criadas: 3 };
    const { result } = renderHook(() => useContratos());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.criarContrato(FORM); });
    expect(ok).toBe(false);
    expect(tOk).not.toHaveBeenCalled();
  });

  it('G6 edicao com regeneracao continua na RPC do 01B', async () => {
    resp = { ok: true, removidas: 1, criadas: 2 };
    const { result } = renderHook(() => useContratos());
    await act(async () => { await result.current.editarContrato('ct1', { valor: 5 }, true); });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('fn_contrato_editar_e_regenerar');
    expect(upd).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('G7 edicao sem regeneracao usa UPDATE e nao chama RPC', async () => {
    const { result } = renderHook(() => useContratos());
    await act(async () => { await result.current.editarContrato('ct1', { valor: 5 }, false); });
    expect(upd).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('G8 mensagem de criacao sem detalhe de banco', () => {
    for (const p of ['SQLSTATE','P0001','P0002','details','hint','financeiro_','fazenda']) {
      expect(MENSAGEM_CRIACAO_INDEFINIDA.toLowerCase()).not.toContain(p.toLowerCase());
    }
  });
});
