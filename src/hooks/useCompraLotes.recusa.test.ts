/**
 * OC-LOTE-FISICO-POS-SAIDA-01 (D4) — `useCompraLotes.salvar({ aoRecusar })`: com o callback NAO HA TOAST e a frase do banco chega
 * nele (quem chama a mostra num modal centrado); sem ele, a recusa segue em toast, como antes (o ramo "reabra para editar" inclusive).
 * O banco e' de mentira: `oc_salvar_lotes` recusa com P0001 e a frase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const FRASE = 'Lote vacas (ordem 1) tem saída adotada (01/09/2026 · 18 cab): quantidade e peso dessa saída se corrigem em Lançar movimentação, não pela operação.';
const LOTE = { id: 'l1', ordem: 1, categoria_negociada: 'vacas', qtd_negociada: 18, peso_medio_negociado_kg: 481.78,
  criterio_valor: 'kg', valor_informado: null, observacao: null };
const banco = { mensagem: FRASE };
function consulta() {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order']) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [LOTE], error: null }).then(ok);
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => consulta(),
    rpc: vi.fn(async () => ({ data: null, error: { code: 'P0001', message: banco.mensagem } })),
  },
}));
const toastErro = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastErro(...a), success: vi.fn(), warning: vi.fn() } }));

import { useCompraLotes } from '@/hooks/useCompraLotes';

const montar = (onReabrir?: () => void) => renderHook(() => useCompraLotes({
  operacaoId: 'op-1', clienteId: 'cli-1', versao: 3, onVersaoChange: vi.fn(), enabled: true, onReabrir,
}));

beforeEach(() => { toastErro.mockReset(); banco.mensagem = FRASE; });

describe('useCompraLotes.salvar — a recusa', () => {
  it('com aoRecusar: a frase do banco chega ao callback, verbatim, e NAO ha toast', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lotes).toHaveLength(1));
    const aoRecusar = vi.fn();
    let r: number | null = 0;
    await act(async () => { r = await result.current.salvar({ aoRecusar }); });
    expect(r).toBeNull();
    expect(aoRecusar).toHaveBeenCalledTimes(1);
    expect(aoRecusar).toHaveBeenCalledWith(FRASE);
    expect(toastErro).not.toHaveBeenCalled();
  });

  it('com aoRecusar: "reabra para editar" tambem vai ao callback (sem o toast com a acao Reabrir)', async () => {
    banco.mensagem = 'Negociacao fechada; reabra para editar (oc_reabrir)';
    const { result } = montar(vi.fn());
    await waitFor(() => expect(result.current.lotes).toHaveLength(1));
    const aoRecusar = vi.fn();
    await act(async () => { await result.current.salvar({ aoRecusar }); });
    expect(aoRecusar).toHaveBeenCalledWith('Negociacao fechada; reabra para editar (oc_reabrir)');
    expect(toastErro).not.toHaveBeenCalled();
  });

  it('sem aoRecusar: o de antes — a frase em toast', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lotes).toHaveLength(1));
    await act(async () => { await result.current.salvar(); });
    expect(toastErro).toHaveBeenCalledWith(FRASE);
  });

  it('sem aoRecusar, "reabra para editar": o toast com a acao Reabrir, como antes', async () => {
    banco.mensagem = 'Negociacao fechada; reabra para editar (oc_reabrir)';
    const { result } = montar(vi.fn());
    await waitFor(() => expect(result.current.lotes).toHaveLength(1));
    await act(async () => { await result.current.salvar(); });
    expect(toastErro).toHaveBeenCalledTimes(1);
    expect(toastErro.mock.calls[0][1]).toMatchObject({ action: { label: 'Reabrir' } });
  });
});
