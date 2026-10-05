/**
 * REC-VALOR-DO-MES-MODAL-01 — a marca do valor do mês vai NO MESMO UPDATE da edição, e só quando o form a pede.
 *
 * ⚠ O CLIENTE SUPABASE É O CONSTRUTOR FALSO do `useFinanceiroV2.remendo.test.ts`, guardando o PAYLOAD de cada UPDATE: o que
 *   se afirma é o que foi ao banco (quantos UPDATEs e com quais chaves) e o que a linha em memória passou a dizer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const updates: Array<{ tabela: string; payload: Record<string, unknown> }> = [];
const LANC_ID = '4ff3f3fe-0000-4000-8000-000000000001';
const marcaNoBanco = { em: null as string | null, origem: null as string | null };

const linhaBase = () => ({
  id: LANC_ID, cliente_id: 'cli', fazenda_id: 'faz', conta_bancaria_id: 'conta', conta_destino_id: null,
  data_competencia: '2026-10-01', data_pagamento: null, data_vencimento: '2026-11-05',
  valor: 888.49, sinal: '-1', tipo_operacao: '2-Saídas', status_transacao: 'programado',
  descricao: 'Folha', macro_custo: 'Custeio Produtivo', grupo_custo: 'Pessoal', centro_custo: 'Folha', subcentro: 'Salários',
  escopo_negocio: 'pecuaria', observacao: null, ano_mes: '2026-10', documento: null, historico: null, numero_documento: null,
  favorecido_id: 'fav', origem_lancamento: 'recorrencia', origem_tipo: null, lote_importacao_id: null, forma_pagamento: null,
  dados_pagamento: null, cancelado: false, conciliado_em: null, editado_manual: false, created_by: 'u',
  created_at: '2026-09-25', updated_at: '2026-09-25', movimentacao_rebanho_id: null, recorrencia_id: 'rec-1', safra_id: null,
  plano_conta_id: null, compoe_dre: true, valor_do_mes_em: marcaNoBanco.em, valor_do_mes_origem: marcaNoBanco.origem,
});

function construtor(tabela: string) {
  const st = { tipo: 'select' };
  const b: Record<string, unknown> = {};
  const responder = (terminal: string | null) => {
    if (tabela === 'financeiro_lancamentos_v2') {
      if (st.tipo === 'update') return { data: null, error: null };
      if (terminal) return { data: linhaBase(), error: null };
      return { data: [linhaBase()], count: 1, error: null };
    }
    if (terminal) return { data: null, error: null };
    return { data: [], count: 0, error: null };
  };
  Object.assign(b, {
    select: () => b,
    update: (payload: Record<string, unknown>) => { st.tipo = 'update'; updates.push({ tabela, payload }); return b; },
    single: () => Promise.resolve(responder('single')),
    maybeSingle: () => Promise.resolve(responder('maybeSingle')),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(responder(null)).then(ok, erro),
  });
  for (const m of ['eq', 'neq', 'in', 'is', 'gte', 'lte', 'gt', 'lt', 'or', 'not', 'order', 'range', 'limit', 'ilike', 'like', 'filter', 'match', 'contains']) b[m] = () => b;
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => construtor(t), rpc: () => Promise.resolve({ data: null, error: null }) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }));
vi.mock('@/lib/financeiro/conciliacaoSync', () => ({
  sincronizarVinculosDoLancamento: vi.fn(() => Promise.resolve()),
  recomputarStatusExtrato: vi.fn(() => Promise.resolve()),
}));

import { useFinanceiroV2, type LancamentoV2Form } from './useFinanceiroV2';

const form = (extra: Partial<LancamentoV2Form> = {}): LancamentoV2Form => ({
  fazenda_id: 'faz', conta_bancaria_id: 'conta', data_competencia: '2026-10-01', data_vencimento: '2026-11-05',
  data_pagamento: null, valor: 888.49, tipo_operacao: '2-Saídas', status_transacao: 'programado',
  descricao: 'Folha', macro_custo: 'Custeio Produtivo', grupo_custo: 'Pessoal', centro_custo: 'Folha', subcentro: 'Salários',
  favorecido_id: 'fav', ...extra,
});
async function montar() {
  const { result } = renderHook(() => useFinanceiroV2());
  await act(async () => { await result.current.loadLancamentos({ ano: '2026' }, 0); });
  return result;
}
const updatesDoLancamento = () => updates.filter(u => u.tabela === 'financeiro_lancamentos_v2');

describe('editarLancamento e a marca do valor do mês', () => {
  beforeEach(() => { updates.length = 0; marcaNoBanco.em = null; marcaNoBanco.origem = null; });

  it('pedido "marcar_manual": UM update, com o valor e as duas colunas juntas; a linha em memória fica marcada', async () => {
    const r = await montar();
    let ok: boolean | undefined;
    await act(async () => { ok = await r.current.editarLancamento(LANC_ID, form({ valor: 958.6, valor_do_mes: 'marcar_manual' })); });
    expect(ok).toBe(true);
    const us = updatesDoLancamento();
    expect(us).toHaveLength(1);
    expect(us[0].payload).toMatchObject({ valor: 958.6, valor_do_mes_origem: 'manual' });
    expect(typeof us[0].payload.valor_do_mes_em).toBe('string');
    expect(Number.isNaN(Date.parse(String(us[0].payload.valor_do_mes_em)))).toBe(false);
    /* o pedido em si não é coluna: não vai ao banco */
    expect('valor_do_mes' in us[0].payload).toBe(false);
    /* a linha em memória (a que o modal lê ao reabrir) recebe o MESMO carimbo que foi ao banco */
    expect(r.current.lancamentos[0]?.valor_do_mes_origem).toBe('manual');
    expect(r.current.lancamentos[0]?.valor_do_mes_em).toBe(us[0].payload.valor_do_mes_em);
  });

  it('sem pedido: o payload NÃO tem as duas colunas, e a marca da linha fica como estava', async () => {
    marcaNoBanco.em = '2026-10-05T13:36:03+00:00'; marcaNoBanco.origem = 'planilha';
    const r = await montar();
    await act(async () => { await r.current.editarLancamento(LANC_ID, form({ descricao: 'Folha de outubro' })); });
    const us = updatesDoLancamento();
    expect(us).toHaveLength(1);
    /* o detector sabe achar: o payload tem as chaves de sempre */
    expect('valor' in us[0].payload && 'descricao' in us[0].payload).toBe(true);
    expect('valor_do_mes_em' in us[0].payload).toBe(false);
    expect('valor_do_mes_origem' in us[0].payload).toBe(false);
    expect(r.current.lancamentos[0]?.valor_do_mes_origem).toBe('planilha');
    expect(r.current.lancamentos[0]?.valor_do_mes_em).toBe('2026-10-05T13:36:03+00:00');
  });

  it('pedido "limpar": o valor da regra e as duas colunas NULAS no mesmo update; a linha em memória perde a marca', async () => {
    marcaNoBanco.em = '2026-10-05T13:36:03+00:00'; marcaNoBanco.origem = 'manual';
    const r = await montar();
    expect(r.current.lancamentos[0]?.valor_do_mes_origem).toBe('manual');
    await act(async () => { await r.current.editarLancamento(LANC_ID, form({ valor: 888.49, valor_do_mes: 'limpar' })); });
    const us = updatesDoLancamento();
    expect(us).toHaveLength(1);
    expect(us[0].payload).toMatchObject({ valor: 888.49, valor_do_mes_em: null, valor_do_mes_origem: null });
    expect(r.current.lancamentos[0]?.valor_do_mes_em).toBeNull();
    expect(r.current.lancamentos[0]?.valor_do_mes_origem).toBeNull();
  });
});
