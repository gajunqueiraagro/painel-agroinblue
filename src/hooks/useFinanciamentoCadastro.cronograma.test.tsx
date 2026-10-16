/**
 * FIN-PARCELAS-TAXA-ZERO-01 — o cronograma do financiamento cadastrado pela tela e o que o salvar grava.
 *
 * (1) a conta pura (`montarCronograma` / `linhasDasParcelas`): taxa 0 com 80 parcelas, taxa > 0, dia 31 em mês curto, o centavo
 *     do arredondamento; (2) o hook de verdade com um banco de mentira: as parcelas vão com o `valor_total` e, depois delas, o
 *     escritor dos lançamentos (`fn_reconciliar_financiamento`) é chamado para o contrato novo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { montarCronograma, linhasDasParcelas } from '@/lib/financiamentos/cronogramaDoFinanciamento';

type Chamada = { tabela?: string; rpc?: string; op: string; payload?: unknown };
const chamadas: Chamada[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const construtor = (tabela: string): unknown => {
    let op = 'select';
    const p: unknown = new Proxy(() => undefined, {
      get: (_a, nome) => {
        if (nome === 'then') {
          const data = tabela === 'financiamentos' && op === 'insert' ? { id: 'fin-1' } : [];
          return (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok);
        }
        return (...args: unknown[]) => {
          if (nome === 'insert' || nome === 'update' || nome === 'delete') {
            op = String(nome);
            chamadas.push({ tabela, op, payload: args[0] });
          }
          return p;
        };
      },
    });
    return p;
  };
  return {
    supabase: {
      from: (tabela: string) => construtor(tabela),
      rpc: (nome: string, args: unknown) => {
        chamadas.push({ rpc: nome, op: 'rpc', payload: args });
        return Promise.resolve({ data: { resumo: {} }, error: null });
      },
    },
  };
});
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz' }, isGlobal: false }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { useFinanciamentoCadastro } from './useFinanciamentoCadastro';

const meses = (datas: string[]) => datas.map(d => d.slice(0, 7));
const mesSeguinte = (am: string) => {
  const [a, m] = am.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
};
const soma = (vs: number[]) => Math.round(vs.reduce((s, v) => s + Math.round(v * 100), 0)) / 100;

describe('montarCronograma — a conta pura', () => {
  it('taxa 0, 80 parcelas: principal = 2.803,66, juros 0, a 1ª na data da 1ª parcela e nenhum mês pulado', () => {
    const c = montarCronograma({
      valorTotal: 224292.8, valorEntrada: 0, totalParcelas: 80, taxaJurosAnual: 0,
      dataPrimeiraParcela: '2026-07-18', mesesPorParcela: 1,
    });
    expect(c).toHaveLength(80);
    expect(c.every(p => p.valor_principal === 2803.66 && p.valor_juros === 0)).toBe(true);
    expect(c[0].data_vencimento).toBe('2026-07-18');
    expect(c[79].data_vencimento).toBe('2033-02-18');
    const ms = meses(c.map(p => p.data_vencimento));
    for (let i = 1; i < ms.length; i++) expect(ms[i]).toBe(mesSeguinte(ms[i - 1]));
    expect(soma(c.map(p => p.valor_principal))).toBe(224292.8);
    const linhas = linhasDasParcelas('fin-1', 'cli', c);
    expect(linhas.every(l => l.valor_total === 2803.66 && l.status === 'pendente')).toBe(true);
  });

  it('taxa > 0: toda parcela tem juros e valor_total = principal + juros', () => {
    const c = montarCronograma({
      valorTotal: 120000, valorEntrada: 0, totalParcelas: 12, taxaJurosAnual: 8,
      dataPrimeiraParcela: '2026-08-10', mesesPorParcela: 1,
    });
    expect(c.every(p => p.valor_juros > 0)).toBe(true);
    for (const l of linhasDasParcelas('fin-1', 'cli', c)) {
      expect(l.valor_total).toBe(Math.round((l.valor_principal + l.valor_juros) * 100) / 100);
    }
  });

  it('vencimento no dia 31: cai no último dia do mês curto e volta ao 31 no mês seguinte', () => {
    const c = montarCronograma({
      valorTotal: 400, valorEntrada: 0, totalParcelas: 4, taxaJurosAnual: 0,
      dataPrimeiraParcela: '2026-01-31', mesesPorParcela: 1,
    });
    expect(c.map(p => p.data_vencimento)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('o centavo do arredondamento vai para a última parcela: a soma fecha com o contrato', () => {
    const c = montarCronograma({
      valorTotal: 1000, valorEntrada: 0, totalParcelas: 3, taxaJurosAnual: 0,
      dataPrimeiraParcela: '2026-09-01', mesesPorParcela: 1,
    });
    expect(c.map(p => p.valor_principal)).toEqual([333.33, 333.33, 333.34]);
    expect(soma(c.map(p => p.valor_principal))).toBe(1000);
  });
});

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);

async function cadastrar(taxa: number, total: number, n: number) {
  const { result } = renderHook(() => useFinanciamentoCadastro(), { wrapper });
  act(() => {
    result.current.setForm(f => ({
      ...f, natureza: 'financiamento', descricao: 'Consórcio', valor_total: total, total_parcelas: n,
      taxa_juros_anual: taxa, data_contrato: '2026-06-01', data_primeira_parcela: '2026-07-18',
    }));
  });
  act(() => { result.current.gerarParcelas(); });
  let ok = false;
  await act(async () => { ok = await result.current.salvar(); });
  return ok;
}

beforeEach(() => { chamadas.length = 0; });

describe('salvar — o que vai ao banco', () => {
  it('taxa 0, 80 parcelas: 80 linhas com valor_total, e depois o escritor dos lançamentos do contrato novo', async () => {
    expect(await cadastrar(0, 224292.8, 80)).toBe(true);
    const ins = chamadas.find(c => c.tabela === 'financiamento_parcelas' && c.op === 'insert');
    const linhas = ins?.payload as Array<{ valor_principal: number; valor_juros: number; valor_total: number; data_vencimento: string }>;
    expect(linhas).toHaveLength(80);
    expect(linhas.every(l => l.valor_total === 2803.66 && l.valor_juros === 0)).toBe(true);
    expect(linhas[0].data_vencimento).toBe('2026-07-18');
    const iIns = chamadas.indexOf(ins!);
    const iRpc = chamadas.findIndex(c => c.rpc === 'fn_reconciliar_financiamento');
    expect(iRpc).toBeGreaterThan(iIns);
    expect(chamadas[iRpc].payload).toEqual({ p_financiamento_id: 'fin-1', p_dry_run: false, p_recalcula_vt: true });
  });

  it('taxa > 0: valor_total = principal + juros em toda linha, e os lançamentos também são pedidos', async () => {
    expect(await cadastrar(8, 120000, 12)).toBe(true);
    const ins = chamadas.find(c => c.tabela === 'financiamento_parcelas' && c.op === 'insert');
    const linhas = ins?.payload as Array<{ valor_principal: number; valor_juros: number; valor_total: number }>;
    expect(linhas).toHaveLength(12);
    expect(linhas.every(l => l.valor_juros > 0 && l.valor_total === Math.round((l.valor_principal + l.valor_juros) * 100) / 100)).toBe(true);
    expect(chamadas.some(c => c.rpc === 'fn_reconciliar_financiamento')).toBe(true);
  });
});
