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
import { supabase } from '@/integrations/supabase/client';
import { FRASE_QUANTIDADE_INTEIRA } from '@/lib/oc/numeroDoLote';

const montar = (onReabrir?: () => void) => renderHook(() => useCompraLotes({
  operacaoId: 'op-1', clienteId: 'cli-1', versao: 3, onVersaoChange: vi.fn(), enabled: true, onReabrir,
}));

beforeEach(() => { toastErro.mockReset(); banco.mensagem = FRASE; vi.mocked(supabase.rpc).mockClear(); });

/* FORN-CADASTRO-02: com os tipos regenerados, `vi.mocked(supabase.rpc).mock.calls` passou do limite de instanciação (TS2589) — as
   chamadas se leem pelo `mock` do próprio vi.fn */
const chamadasRpc = (): unknown[][] => Reflect.get(Reflect.get(supabase.rpc, 'mock'), 'calls');

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

/* LOTE-PESO-CALC-01 — o salvar nao trunca nem arredonda a quantidade, e conta nao resolvida nunca vai ao `parseNumericValue`. */
describe('useCompraLotes.salvar — conta e quantidade', () => {
  const comLote = async (patch: Record<string, string>) => {
    const h = montar();
    await waitFor(() => expect(h.result.current.lotes).toHaveLength(1));
    act(() => { h.result.current.editarLote(h.result.current.lotes[0].idLocal, patch); });
    return h;
  };
  it('texto com operador nao resolvido: recusado com a frase, nada vai ao banco (nunca 3618 de "36+18")', async () => {
    for (const p of [{ quantidade: '36+18' }, { pesoMedioKg: '(36*461,72+18*456,61)/54' }, { valorInformado: '10000*2+500' }]) {
      const { result } = await comLote(p);
      const aoRecusar = vi.fn();
      let r: number | null = 0;
      await act(async () => { r = await result.current.salvar({ aoRecusar }); });
      expect(r).toBeNull();
      expect(aoRecusar).toHaveBeenCalledTimes(1);
      expect(aoRecusar.mock.calls[0][0]).toMatch(/^Lote vacas \(ordem 1\) — (Quantidade|Peso médio|Valor): conta não calculada\./);
    }
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it('quantidade "54,5": recusada (sem truncar para 54)', async () => {
    const { result } = await comLote({ quantidade: '54,5' });
    const aoRecusar = vi.fn();
    await act(async () => { await result.current.salvar({ aoRecusar }); });
    expect(aoRecusar).toHaveBeenCalledWith(`Lote vacas (ordem 1) — Quantidade: ${FRASE_QUANTIDADE_INTEIRA}.`);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it('resolvido: quantidade inteira como esta' + "'" + ' e o peso a duas casas', async () => {
    const { result } = await comLote({ quantidade: '54', pesoMedioKg: '460,016' });
    await act(async () => { await result.current.salvar({ aoRecusar: vi.fn() }); });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const lotes = chamadasRpc()[0][1] as { p_lotes: { qtd_negociada: number; peso_medio_negociado_kg: number }[] };
    expect(lotes.p_lotes[0]).toMatchObject({ qtd_negociada: 54, peso_medio_negociado_kg: 460.02 });
  });
  it('ajuste (B): lote de 1200 cab, sem tocar, salva (nao e' + "'" + ' recusado); "1.200" vai como 1200', async () => {
    for (const quantidade of ['1200', '1.200']) {
      vi.mocked(supabase.rpc).mockClear();
      const { result } = await comLote({ quantidade });
      const aoRecusar = vi.fn();
      await act(async () => { await result.current.salvar({ aoRecusar }); });
      const p = chamadasRpc()[0][1] as { p_lotes: { qtd_negociada: number }[] };
      expect(p.p_lotes[0].qtd_negociada).toBe(1200);
      expect(aoRecusar).toHaveBeenCalledWith(FRASE);   // a frase que veio do banco de mentira, nao uma recusa da tela
    }
  });
  it('ajuste (A): valor simples "14,125" vai ao banco com as tres casas', async () => {
    const { result } = await comLote({ valorInformado: '14,125' });
    await act(async () => { await result.current.salvar({ aoRecusar: vi.fn() }); });
    const p = chamadasRpc()[0][1] as { p_lotes: { valor_informado: number }[] };
    expect(p.p_lotes[0].valor_informado).toBe(14.125);
  });
});
