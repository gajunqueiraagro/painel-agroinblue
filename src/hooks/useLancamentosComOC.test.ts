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

interface Parte { id: string; cliente_id: string; operacao_id: string; financeiro_lancamento_id: string | null; cancelada: boolean; componente?: string; origem?: string }
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
    { id: '5', cliente_id: 'vera', operacao_id: 'oc-venda', financeiro_lancamento_id: 'recebimento-cc', cancelada: false, componente: 'recebimento', origem: 'manual' },
  ];
});

describe('icone de OC por parte viva', () => {
  it('o vinculado tem icone; o desvinculado e o de outro cliente nao', async () => {
    const { result } = renderHook(() => useLancamentosComOC('vera'));
    await waitFor(() => expect(result.current.size).toBe(3));
    expect(result.current.get('importado-vinculado')).toEqual({ operacaoId: 'oc-abate', tipo: 'abate', ehBoitel: false, foraDoDre: false });
    /* OC-CC-CLASSIFICACAO-01: o recebimento da conta corrente e' marcado fora do DRE; o titulo comum, nao */
    expect(result.current.get('recebimento-cc')?.foraDoDre).toBe(true);
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

describe('OC-CC-CLASSIFICACAO-01 — a marca "fora do DRE" no tooltip e o espelho da regra do banco', () => {
  it('o tooltip do recebimento/pagamento da conta corrente leva "fora do DRE · OC <codigo>"; o do titulo comum, nao', () => {
    expect(rotuloOrigemOC({ tipo: 'venda', ehBoitel: false, foraDoDre: true, operacaoId: '232c05aa-e531-4f91' }))
      .toBe('Origem: Operação Comercial de Venda · fora do DRE · OC 232c05aa');
    expect(rotuloOrigemOC({ tipo: 'compra', ehBoitel: false, foraDoDre: false, operacaoId: '1337bb2d-9c86' }))
      .toBe('Origem: Operação Comercial de Compra');
  });

  it('parteForaDoDre e _oc_cc_fora_do_dre dizem a mesma coisa para cada componente e origem', async () => {
    const { parteForaDoDre } = await import('@/hooks/useLancamentosComOC');
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync('supabase/migrations/20261027173000_oc_cc_classificacao_01.sql', 'utf8');
    /* a regra do banco, lida do arquivo: e' ela que o front espelha */
    expect(sql).toContain("and ((pt.componente = 'recebimento' and pt.origem not in ('explicacao', 'entrega'))");
    expect(sql).toContain("or (pt.componente = 'devolucao_comprador' and pt.origem = 'explicacao')))");
    const casos: Array<[string, string, boolean]> = [
      ['recebimento', 'manual', true], ['recebimento', 'programacao', true], ['recebimento', 'entrega', false],
      ['recebimento', 'explicacao', false], ['devolucao_comprador', 'explicacao', true], ['devolucao_comprador', 'manual', false],
      ['principal', 'programacao', false], ['entrega', 'entrega', false], ['frete', 'programacao', false],
    ];
    for (const [componente, origem, esperado] of casos) expect(parteForaDoDre({ componente, origem })).toBe(esperado);
  });
});

