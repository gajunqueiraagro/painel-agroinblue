/**
 * FECH-PASTO-UNIDADE-01 F2 — o "Copiar anterior" (pasto sem piquete) de um mês anterior lançado POR PIQUETES: a mesma categoria tem uma linha
 * por piquete; a cópia SOMA as linhas (peso ponderado, a regra da `fn_fechamento_pasto_inteiro`). Antes pegava a primeira e as cabeças dos
 * outros piquetes sumiam da cópia.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { tabelas } = vi.hoisted(() => ({
  tabelas: {
    fechamento_pastos: { id: 'fp-set', lote_mes: null, tipo_uso_mes: 'cria', qualidade_mes: 6, observacao_mes: null },
    fechamento_pasto_itens: [
      { categoria_id: 'va', quantidade: 40, peso_medio_kg: 450, lote: null, observacoes: null, origem_dado: 'manual', lote_id: 'L1', piquete_id: '7a' },
      { categoria_id: 'va', quantidade: 34, peso_medio_kg: 440, lote: null, observacoes: null, origem_dado: 'manual', lote_id: 'L1', piquete_id: '7b' },
      { categoria_id: 'mm', quantidade: 46, peso_medio_kg: 30, lote: null, observacoes: null, origem_dado: 'manual', lote_id: null, piquete_id: '7c' },
    ],
  } as Record<string, unknown>,
}));
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (t: string) => {
    const p: Record<string, unknown> = {};
    for (const k of ['select', 'eq', 'order']) p[k] = () => p;
    p.single = async () => ({ data: tabelas[t], error: null });
    p.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: tabelas[t], error: null }).then(ok);
    return p;
  };
  return { supabase: { from: (t: string) => cadeia(t), rpc: async () => ({ data: null, error: null }) } };
});
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'pur' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useFechamento } from './useFechamento';

const CATS = [{ id: 'mf', nome: 'Mamotes F', codigo: 'mamotes_f' }, { id: 'mm', nome: 'Mamotes M', codigo: 'mamotes_m' }, { id: 'va', nome: 'Vacas', codigo: 'vacas' }];
const comQc = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

describe('Copiar anterior de um mês lançado por piquetes (PUR P7)', () => {
  it('soma as linhas de cada categoria (cab e peso ponderado); o lote segue quando é um só; nenhuma cabeça fica para trás', async () => {
    const { result } = renderHook(() => useFechamento(), { wrapper: comQc });
    const r = await result.current.copiarMesAnterior('p7', '2026-10', CATS as never);
    expect(r.itens.map(i => `${i.categoria_id} ${i.quantidade} ${i.peso_medio_kg ?? '—'} ${i.lote_id ?? '—'}`)).toEqual(['mf 0 — —', 'mm 46 30 —', 'va 74 445.41 L1']);
    expect(r.itens.reduce((s, i) => s + i.quantidade, 0)).toBe(120);
    expect(r.itens.find(i => i.categoria_id === 'va')!.origem_dado).toBe('copiado_mes_anterior');
  });
});
