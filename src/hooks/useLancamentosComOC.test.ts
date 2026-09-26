/**
 * VINCULAR-FIX-01, item 4 — o icone de OC da lista do Financeiro V2 sai da PARTE VIVA, nao da origem.
 *
 * ⚠ O CASO QUE JUSTIFICA O ARQUIVO E' O VINCULADO: um lancamento importado (origem
 *   'importacao_incremental') ligado a uma OC pelo Vincular tem parte viva e NAO tinha icone — 5 da Vera
 *   em 25/09/2026. E o par dele e' o desvinculado: a parte cancela, a notificacao chega, o icone some.
 * ⚠ O BANCO FALSO APLICA OS FILTROS que o hook manda (`cancelada = false`, cliente): um hook que
 *   esquecesse o filtro de parte viva traria a parte cancelada e o caso "some ao desvincular" cairia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

interface Parte { id: string; cliente_id: string; operacao_id: string; financeiro_lancamento_id: string | null; cancelada: boolean }
const OCS: Record<string, string> = { 'oc-venda': 'venda', 'oc-boitel': 'venda', 'oc-abate': 'abate', 'oc-compra': 'compra' };
let partes: Parte[] = [];
const BOITEL = ['oc-boitel'];

function from(tabela: string) {
  const filtros: Array<(r: Record<string, unknown>) => boolean> = [];
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = (col: string, v: unknown) => { filtros.push(r => r[col] === v); return b; };
  b.not = (col: string) => { filtros.push(r => r[col] != null); return b; };
  b.in = (col: string, vs: unknown[]) => { filtros.push(r => vs.includes(r[col])); return b; };
  b.order = () => b;
  b.range = () => b;
  b.then = (ok: (v: unknown) => unknown) => {
    const base: Record<string, unknown>[] = tabela === 'zoo_operacao_partes'
      ? partes.map(p => ({ ...p, zoo_operacoes_comerciais: { tipo_operacao: OCS[p.operacao_id] } }))
      : BOITEL.map(id => ({ operacao_id: id }));
    return Promise.resolve({ data: base.filter(r => filtros.every(f => f(r))), error: null }).then(ok);
  };
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => from(t) } }));

const subs = new Set<() => void>();
vi.mock('@/hooks/useFinanceiroV2', () => ({
  inscreverEmLancamentos: (_c: string, cb: () => void) => { subs.add(cb); return () => subs.delete(cb); },
}));

import { useLancamentosComOC, rotuloOrigemOC } from '@/hooks/useLancamentosComOC';

beforeEach(() => {
  subs.clear();
  partes = [
    { id: '1', cliente_id: 'vera', operacao_id: 'oc-abate', financeiro_lancamento_id: 'importado-vinculado', cancelada: false },
    { id: '2', cliente_id: 'vera', operacao_id: 'oc-boitel', financeiro_lancamento_id: 'titulo-boitel', cancelada: false },
    { id: '3', cliente_id: 'vera', operacao_id: 'oc-venda', financeiro_lancamento_id: 'desvinculado', cancelada: true },
    { id: '4', cliente_id: 'nj', operacao_id: 'oc-compra', financeiro_lancamento_id: 'de-outro-cliente', cancelada: false },
  ];
});

describe('icone de OC por parte viva', () => {
  it('o vinculado tem icone; o desvinculado e o de outro cliente nao', async () => {
    const { result } = renderHook(() => useLancamentosComOC('vera'));
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get('importado-vinculado')).toEqual({ operacaoId: 'oc-abate', tipo: 'abate', ehBoitel: false });
    expect(result.current.get('titulo-boitel')?.ehBoitel).toBe(true);
    expect(result.current.has('desvinculado')).toBe(false);
    expect(result.current.has('de-outro-cliente')).toBe(false);
  });

  it('some ao desvincular: a parte cancela, a notificacao chega, o mapa rele', async () => {
    const { result } = renderHook(() => useLancamentosComOC('vera'));
    await waitFor(() => expect(result.current.has('importado-vinculado')).toBe(true));
    partes = partes.map(p => (p.id === '1' ? { ...p, cancelada: true } : p));
    act(() => { for (const cb of [...subs]) cb(); });
    await waitFor(() => expect(result.current.has('importado-vinculado')).toBe(false));
    /* a busca sabe achar: o do boitel continua la' */
    expect(result.current.has('titulo-boitel')).toBe(true);
  });
});

describe('tooltip pelo tipo da OC', () => {
  it('Compra, Venda, Abate e Boitel — e nao mais "Compra de Animais" para todos', () => {
    expect(rotuloOrigemOC({ tipo: 'compra', ehBoitel: false })).toBe('Origem: Operação Comercial de Compra');
    expect(rotuloOrigemOC({ tipo: 'venda', ehBoitel: false })).toBe('Origem: Operação Comercial de Venda');
    expect(rotuloOrigemOC({ tipo: 'abate', ehBoitel: false })).toBe('Origem: Operação Comercial de Abate');
    expect(rotuloOrigemOC({ tipo: 'venda', ehBoitel: true })).toBe('Origem: Operação Comercial de Boitel');
  });
});
