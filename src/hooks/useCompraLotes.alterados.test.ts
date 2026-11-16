/**
 * OC-SALVAR-RODAPE-01 — `useCompraLotes.alterados`: os lotes da tela diferem dos últimos lidos do banco. É o "pendente" da negociação
 * que o rodapé da OC mostra e que o fechar pergunta. E `salvar({ versaoEsperada })`: quem salvou os dados no mesmo gesto passa a versão
 * que recebeu (o `versao` do hook só muda no próximo render). O banco é de mentira.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const LOTE = { id: 'l1', ordem: 1, categoria_negociada: 'bois', qtd_negociada: 36, peso_medio_negociado_kg: 550,
  criterio_valor: 'kg', valor_informado: null, observacao: 'OC 10770' };
function consulta() {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order']) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [LOTE], error: null }).then(ok);
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => consulta(), rpc: vi.fn(async () => ({ data: { versao: 9 }, error: null })) },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { useCompraLotes } from '@/hooks/useCompraLotes';
import { supabase } from '@/integrations/supabase/client';

const montar = () => renderHook(() => useCompraLotes({
  operacaoId: 'op-1', clienteId: 'cli-1', versao: 3, onVersaoChange: vi.fn(), enabled: true,
}));
const chamadasRpc = (): unknown[][] => Reflect.get(Reflect.get(supabase.rpc, 'mock'), 'calls');
beforeEach(() => { vi.mocked(supabase.rpc).mockClear(); });

describe('useCompraLotes.alterados', () => {
  it('recém-lido: nada alterado; editar o peso altera; voltar ao lido desaltera', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lotes).toHaveLength(1));
    expect(result.current.alterados).toBe(false);
    const id = result.current.lotes[0].idLocal;
    act(() => result.current.editarLote(id, { pesoMedioKg: '562' }));
    expect(result.current.alterados).toBe(true);
    act(() => result.current.editarLote(id, { pesoMedioKg: '550' }));
    expect(result.current.alterados).toBe(false);
  });
  it('lote novo e lote removido são alteração', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lotes).toHaveLength(1));
    act(() => { result.current.adicionarLote(); });
    expect(result.current.alterados).toBe(true);
    act(() => result.current.removerLote(result.current.lotes[1].idLocal));
    expect(result.current.alterados).toBe(false);
    act(() => result.current.removerLote(result.current.lotes[0].idLocal));
    expect(result.current.alterados).toBe(true);
  });
  it('salvar relê o banco: o alterado zera', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lotes).toHaveLength(1));
    act(() => result.current.editarLote(result.current.lotes[0].idLocal, { observacao: 'OC 10771' }));
    expect(result.current.alterados).toBe(true);
    await act(async () => { await result.current.salvar({ silent: true }); });
    expect(result.current.alterados).toBe(false);
  });
  it('versaoEsperada vai ao banco no lugar da do hook; sem ela, a do hook', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lotes).toHaveLength(1));
    await act(async () => { await result.current.salvar({ silent: true, versaoEsperada: 7 }); });
    await act(async () => { await result.current.salvar({ silent: true }); });
    const versoes = chamadasRpc().map(c => Reflect.get(Object(c[1]), 'p_versao_esperada'));
    expect(versoes).toEqual([7, 3]);
  });
});
