/**
 * FIN-V2-DESEMPENHO-01b — `useListaPaginaV2`: uma ida à `fn_fin_v2_lista_pagina` por pedido; a resposta VELHA nunca escreve por cima
 * da nova; quem grava lançamento avisa o canal e a página volta (sem F5); os nomes dos fornecedores DA PÁGINA vêm numa ida por id;
 * falha = frase da tela, nunca página vazia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

type Resolver = (v: { data: unknown; error: unknown }) => void;
const banco: { pedidos: { args: Record<string, unknown>; resolver: Resolver }[]; nomes: { id: string; nome: string }[]; idsPedidos: string[][] } =
  { pedidos: [], nomes: [], idsPedidos: [] };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (_fn: string, args: Record<string, unknown>) => new Promise((resolver) => { banco.pedidos.push({ args, resolver }); }),
    from: () => {
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b, eq: () => b,
        in: (_c: string, ids: string[]) => { banco.idsPedidos.push(ids); return Promise.resolve({ data: banco.nomes.filter((n) => ids.includes(n.id)), error: null }); },
      });
      return b;
    },
  },
}));

import { useListaPaginaV2, FRASE_LISTA_INDISPONIVEL } from './useListaPaginaV2';
import { notificarLancamentosMudaram } from './useFinanceiroV2';

const resposta = (ids: string[], total = ids.length) => ({
  versao: 't', pagina: 0, por_pagina: 200, total_linhas: total,
  linhas: ids.map((id) => ({ id, cliente_id: 'cli', favorecido_id: `f-${id}`, conciliado: false })),
  totais: { entradas: 0, saidas: 0, transferencias: 0, entradas_sem_caixa: 0, saidas_sem_caixa: 0 }, sem_caixa: { linhas: 0, total: 0 },
});
const pedido = (pagina: number) => ({ filtros: { anos: [2026] }, ordem: { campo: 'default', dir: 'asc', nivel: 'centro' }, pagina, porPagina: 200 });

beforeEach(() => { banco.pedidos = []; banco.nomes = []; banco.idsPedidos = []; });

describe('useListaPaginaV2', () => {
  it('uma ida por pedido, com os parâmetros da RPC; sem habilitar, não consulta', async () => {
    renderHook(() => useListaPaginaV2('cli', pedido(0), false));
    expect(banco.pedidos).toHaveLength(0);
    renderHook(() => useListaPaginaV2('cli', pedido(2), true));
    expect(banco.pedidos).toHaveLength(1);
    expect(banco.pedidos[0].args).toEqual({ p_cliente: 'cli', p_filtros: { anos: [2026] }, p_ordem: { campo: 'default', dir: 'asc', nivel: 'centro' }, p_pagina: 2, p_por_pagina: 200 });
  });

  it('a resposta velha (página 0) chegando depois da nova (página 1) não escreve', async () => {
    const { result, rerender } = renderHook(({ p }) => useListaPaginaV2('cli', pedido(p), true), { initialProps: { p: 0 } });
    rerender({ p: 1 });
    expect(banco.pedidos).toHaveLength(2);
    await act(async () => { banco.pedidos[1].resolver({ data: resposta(['nova']), error: null }); });
    await act(async () => { banco.pedidos[0].resolver({ data: resposta(['velha']), error: null }); });
    expect(result.current.pagina?.linhas.map((l) => l.id)).toEqual(['nova']);
    expect(result.current.carregando).toBe(false);
  });

  it('quem grava avisa o canal e a página é relida com o MESMO pedido; os nomes da página vêm por id', async () => {
    banco.nomes = [{ id: 'f-a', nome: 'Fornecedor A' }];
    const { result } = renderHook(() => useListaPaginaV2('cli', pedido(3), true));
    await act(async () => { banco.pedidos[0].resolver({ data: resposta(['a']), error: null }); });
    await waitFor(() => expect(result.current.nomes.get('f-a')).toBe('Fornecedor A'));
    expect(banco.idsPedidos).toEqual([['f-a']]);
    act(() => { notificarLancamentosMudaram('cli'); });
    expect(banco.pedidos).toHaveLength(2);
    expect(banco.pedidos[1].args.p_pagina).toBe(3);
  });

  it('falha ou resposta torta = a frase da tela, e a página não vira "0 lançamentos"', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useListaPaginaV2('cli', pedido(0), true));
    await act(async () => { banco.pedidos[0].resolver({ data: { total_linhas: 0 }, error: null }); });
    expect(result.current.erro).toBe(FRASE_LISTA_INDISPONIVEL);
    expect(result.current.pagina).toBeNull();
    erro.mockRestore();
  });
});
