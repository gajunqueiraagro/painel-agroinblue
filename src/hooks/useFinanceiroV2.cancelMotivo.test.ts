/**
 * FIN-V2-CANCEL-MOTIVO-01 — cancelar pelo Financeiro V2 exige motivo NO HOOK, e titulo com parte
 * viva de OC nao se cancela por esta porta (nem individual, nem em lote).
 *
 * ⚠ OS DOIS TITULOS QUE MOTIVARAM A TRAVA: e8032b0d (OC 7f7de76f, Iagro) e f489abd9 (OC c80ebe9e),
 *   cancelados pelo Financeiro com a parte da OC viva — ficaram orfaos. Aqui eles sao os ids com
 *   parte viva do fixture.
 * ⚠ O SUPABASE E' UM CONSTRUTOR FALSO que registra cada UPDATE (payload e ids): "nao gravou" e'
 *   afirmado pela AUSENCIA do update, e o caso de controle prova que a contagem sabe achar um.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const IATRO = 'e8032b0d-be55-4b72-ad62-e399b4c1dc30';
const ADIANT = 'f489abd9-76b5-4807-89fa-8fdd6abc925d';
const COMUM_1 = '11111111-0000-0000-0000-000000000001';
const COMUM_2 = '22222222-0000-0000-0000-000000000002';
const COM_PARTE = new Set([IATRO, ADIANT]);

interface Update { tabela: string; payload: Record<string, unknown>; ids: string[] }
const updates: Update[] = [];

function construtor(tabela: string) {
  const st: { tipo: string; payload: Record<string, unknown>; ids: string[] } = { tipo: 'select', payload: {}, ids: [] };
  const b: Record<string, unknown> = {};
  const resposta = () => {
    if (st.tipo === 'update') { updates.push({ tabela, payload: st.payload, ids: st.ids }); return { data: null, error: null }; }
    if (tabela === 'zoo_operacao_partes') {
      const vivos = st.ids.filter(id => COM_PARTE.has(id));
      return { data: vivos.map(id => ({ id: `parte-${id}`, financeiro_lancamento_id: id })), error: null };
    }
    return { data: [], count: 0, error: null };
  };
  Object.assign(b, {
    select: () => b,
    update: (payload: Record<string, unknown>) => { st.tipo = 'update'; st.payload = payload; return b; },
    eq: (col: string, val: unknown) => { if ((col === 'id' || col === 'financeiro_lancamento_id') && typeof val === 'string') st.ids = [val]; return b; },
    in: (col: string, vals: string[]) => { if (col === 'id' || col === 'financeiro_lancamento_id') st.ids = vals; return b; },
    maybeSingle: () => Promise.resolve(resposta()),
    single: () => Promise.resolve(resposta()),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, erro),
  });
  for (const m of ['neq', 'is', 'gte', 'lte', 'gt', 'lt', 'or', 'not', 'order', 'range', 'limit', 'ilike', 'like', 'filter', 'match', 'contains']) b[m] = () => b;
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => construtor(t), rpc: () => Promise.resolve({ data: null, error: null }) },
}));
/* `vi.hoisted`: o mock sobe para o topo do arquivo, e o espiao tem de subir junto. */
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'gabriel' } }) }));
vi.mock('@/lib/financeiro/conciliacaoSync', () => ({
  sincronizarVinculosDoLancamento: vi.fn(() => Promise.resolve()),
  recomputarStatusExtrato: vi.fn(() => Promise.resolve()),
}));

import { useFinanceiroV2 } from './useFinanceiroV2';
import { MOTIVO_OBRIGATORIO, MOTIVO_BLOQUEIO_TITULO_OC } from '@/lib/financeiro/cancelamentoLancamento';

const cancelamentos = () => updates.filter(u => u.tabela === 'financeiro_lancamentos_v2' && u.payload.cancelado === true);

beforeEach(() => { updates.length = 0; Object.values(toast).forEach(f => f.mockClear()); });

describe('cancelamento individual', () => {
  it('recusa motivo vazio ou so espacos, sem gravar nada', async () => {
    const { result } = renderHook(() => useFinanceiroV2());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.excluirLancamento(COMUM_1, '   '); });
    expect(ok).toBe(false);
    await act(async () => { ok = await result.current.excluirLancamento(COMUM_1); });
    expect(ok).toBe(false);
    expect(cancelamentos()).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith(MOTIVO_OBRIGATORIO);
  });

  it('titulo com parte viva de OC nao cancela, e diz o caminho', async () => {
    const { result } = renderHook(() => useFinanceiroV2());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.excluirLancamento(IATRO, 'duplicado'); });
    expect(ok).toBe(false);
    expect(cancelamentos()).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith(MOTIVO_BLOQUEIO_TITULO_OC);
  });

  it('com motivo e sem OC: grava motivo aparado e autor (a contagem sabe achar)', async () => {
    const { result } = renderHook(() => useFinanceiroV2());
    await act(async () => { await result.current.excluirLancamento(COMUM_1, '  lançado em dobro  '); });
    expect(cancelamentos()).toEqual([expect.objectContaining({
      ids: [COMUM_1],
      payload: expect.objectContaining({ cancelado_motivo: 'lançado em dobro', cancelado_por: 'gabriel' }),
    })]);
  });
});

describe('cancelamento em lote', () => {
  it('sem motivo nao grava nada', async () => {
    const { result } = renderHook(() => useFinanceiroV2());
    let r: { excluidos: number; puladosOC: string[] } | undefined;
    await act(async () => { r = await result.current.excluirLancamentosEmLote([COMUM_1, COMUM_2], ''); });
    expect(r?.excluidos).toBe(0);
    expect(cancelamentos()).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith(MOTIVO_OBRIGATORIO);
  });

  it('com motivo: grava motivo e autor em cada linha, e PULA os titulos de OC dizendo quais', async () => {
    const { result } = renderHook(() => useFinanceiroV2());
    let r: { excluidos: number; bloqueados: string[]; puladosOC: string[] } | undefined;
    await act(async () => { r = await result.current.excluirLancamentosEmLote([COMUM_1, IATRO, COMUM_2, ADIANT], 'limpeza de teste'); });
    expect(r).toEqual({ excluidos: 2, bloqueados: [], puladosOC: [IATRO, ADIANT] });
    const c = cancelamentos();
    expect(c).toHaveLength(1);
    expect(c[0].ids).toEqual([COMUM_1, COMUM_2]);
    expect(c[0].payload).toMatchObject({ cancelado: true, cancelado_motivo: 'limpeza de teste', cancelado_por: 'gabriel' });
  });

  it('as duas funcoes sem chamador sairam do hook', () => {
    const { result } = renderHook(() => useFinanceiroV2());
    expect(Object.keys(result.current)).not.toContain('cancelarRealizadosImportados');
    expect(Object.keys(result.current)).not.toContain('cancelarMigracao');
    /* A busca sabe achar: os dois caminhos que ficaram estao la'. */
    expect(Object.keys(result.current)).toEqual(expect.arrayContaining(['excluirLancamento', 'excluirLancamentosEmLote']));
  });
});
