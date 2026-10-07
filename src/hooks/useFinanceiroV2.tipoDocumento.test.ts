/**
 * PARC-FECHA-02 item 1 — "ponho nota fiscal, salvo e ele vira documento" (Gabriel, NJ, 06/10).
 *
 * ⚠ O DEFEITO: o banco GRAVAVA "Nota Fiscal" (auditoria do NJ: 58bfafe9, 9e159df4), mas o remendo da linha em memória não
 *   levava `tipo_documento` (campo OPCIONAL no tipo: a anotação que acusa campo esquecido não o via). Reabrir o modal — que lê
 *   da LISTA — mostrava o número sem tipo ("Doc. 119238"), e o salvar seguinte mandava o tipo NULO.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const updates: Array<{ tabela: string; payload: Record<string, unknown> }> = [];
const LANC_ID = '4ff3f3fe-0000-4000-8000-000000000001';
const marcaNoBanco = { em: null as string | null, origem: null as string | null };
/** O que o banco DEVOLVE depois do UPDATE (o `verify`): começa sem tipo, como toda parcela nascida do cadastro. */
const docNoBanco = { tipo: null as string | null, numero: null as string | null };

const linhaBase = () => ({
  id: LANC_ID, cliente_id: 'cli', fazenda_id: 'faz', conta_bancaria_id: 'conta', conta_destino_id: null,
  data_competencia: '2026-10-01', data_pagamento: null, data_vencimento: '2026-11-05',
  valor: 888.49, sinal: '-1', tipo_operacao: '2-Saídas', status_transacao: 'programado',
  descricao: 'Folha', macro_custo: 'Custeio Produtivo', grupo_custo: 'Pessoal', centro_custo: 'Folha', subcentro: 'Salários',
  escopo_negocio: 'pecuaria', observacao: null, ano_mes: '2026-10', documento: null, historico: null,
  favorecido_id: 'fav', origem_lancamento: 'recorrencia', origem_tipo: null, lote_importacao_id: null, forma_pagamento: null,
  dados_pagamento: null, cancelado: false, conciliado_em: null, editado_manual: false, created_by: 'u',
  created_at: '2026-09-25', updated_at: '2026-09-25', movimentacao_rebanho_id: null, recorrencia_id: 'rec-1', safra_id: null,
  plano_conta_id: null, compoe_dre: true, valor_do_mes_em: marcaNoBanco.em, valor_do_mes_origem: marcaNoBanco.origem,
  tipo_documento: docNoBanco.tipo, numero_documento: docNoBanco.numero,
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
    update: (payload: Record<string, unknown>) => {
      st.tipo = 'update'; updates.push({ tabela, payload });
      /* o banco GRAVA o que o form mandou — é isso que o `verify` lê em seguida */
      if (tabela === 'financeiro_lancamentos_v2' && 'tipo_documento' in payload) { docNoBanco.tipo = (payload.tipo_documento as string | null) ?? null; docNoBanco.numero = (payload.numero_documento as string | null) ?? null; }
      return b;
    },
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

describe('o tipo do documento sobrevive ao salvar (a linha em memória diz o que o banco gravou)', () => {
  beforeEach(() => { updates.length = 0; docNoBanco.tipo = null; docNoBanco.numero = null; });
  it('editar com "Nota Fiscal" + número: o UPDATE leva os dois e a LINHA da lista passa a tê-los', async () => {
    const r = await montar();
    await act(async () => { await r.current.editarLancamento(LANC_ID, form({ tipo_documento: 'Nota Fiscal', numero_documento: '119238' })); });
    expect(updatesDoLancamento()[0].payload).toMatchObject({ tipo_documento: 'Nota Fiscal', numero_documento: '119238' });
    const linha = r.current.lancamentos.find(l => l.id === LANC_ID);
    expect(linha?.numero_documento).toBe('119238');
    expect(linha?.tipo_documento).toBe('Nota Fiscal');
  });
  it('salvar de novo SEM tocar no tipo (o form nasce da linha em memória) não o apaga', async () => {
    const r = await montar();
    await act(async () => { await r.current.editarLancamento(LANC_ID, form({ tipo_documento: 'Nota Fiscal', numero_documento: '119238' })); });
    const linha = r.current.lancamentos.find(l => l.id === LANC_ID);
    await act(async () => { await r.current.editarLancamento(LANC_ID, form({ tipo_documento: linha?.tipo_documento ?? undefined, numero_documento: linha?.numero_documento ?? undefined, descricao: 'Folha 2' })); });
    expect(updatesDoLancamento()[1].payload).toMatchObject({ tipo_documento: 'Nota Fiscal', numero_documento: '119238' });
  });
});
