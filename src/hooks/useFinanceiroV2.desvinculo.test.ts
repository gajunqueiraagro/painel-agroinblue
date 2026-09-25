/**
 * OC-DESVINCULAR-01 — depois de desvincular, a classificacao do lancamento volta a ser editavel.
 *
 * ⚠ A PARTE CANCELADA CONTINUA APONTANDO O TITULO (D1: cancelado e' historia). O `editarLancamento`
 *   perguntava "existe parte?" sem filtrar `cancelada`, e o lancamento desvinculado ficaria com o
 *   subcentro travado para sempre — "Titulo da Operacao Comercial: classificacao nao pode ser editado".
 * ⚠ O CONSTRUTOR FALSO APLICA O FILTRO QUE O HOOK PEDIR: a parte so' some se a consulta disser
 *   `cancelada = false`. O caso de controle (parte VIVA) prova que a busca sabe achar e que a trava
 *   continua valendo para quem ainda e' da OC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const LANC = 'a5c1c61a-7039-4ea8-9492-e264d6187076';
const cenario = { parteCancelada: true };
const updates: Array<Record<string, unknown>> = [];

const linha = () => ({
  id: LANC, cliente_id: 'cli', fazenda_id: 'faz', conta_bancaria_id: 'conta', conta_destino_id: null,
  data_competencia: '2025-01-17', data_pagamento: '2025-01-20', data_vencimento: null, valor: 5056, sinal: '-1',
  tipo_operacao: '2-Saídas', status_transacao: 'realizado', descricao: 'Abate 020 V - Graxaria',
  macro_custo: 'Deduções de Receitas', grupo_custo: 'Deduções Pecuária', centro_custo: 'Impostos',
  subcentro: 'Impostos e Despesas de Abates e Vendas', escopo_negocio: 'pecuaria', observacao: null, ano_mes: '2025-01',
  documento: null, historico: null, numero_documento: null, favorecido_id: 'fav',
  origem_lancamento: 'manual', origem_tipo: null, lote_importacao_id: null, forma_pagamento: null, dados_pagamento: null,
  cancelado: false, conciliado_em: null, editado_manual: true, created_by: 'u', created_at: '2026-09-18', updated_at: '2026-09-25',
  movimentacao_rebanho_id: null, recorrencia_id: null, safra_id: null, plano_conta_id: null, compoe_dre: true,
});

function construtor(tabela: string) {
  const st: { tipo: string; filtros: Record<string, unknown>; payload?: Record<string, unknown> } = { tipo: 'select', filtros: {} };
  const resposta = (terminal: string | null) => {
    if (tabela === 'zoo_operacao_partes') {
      const parte = { id: 'a7ed61c9', cancelada: cenario.parteCancelada };
      const passa = !('cancelada' in st.filtros) || st.filtros.cancelada === parte.cancelada;
      return { data: passa ? (terminal ? parte : [parte]) : (terminal ? null : []), error: null };
    }
    if (tabela === 'financeiro_lancamentos_v2') {
      if (st.tipo === 'update') { updates.push(st.payload ?? {}); return { data: null, error: null }; }
      if (terminal) return { data: linha(), error: null };
      return { data: [linha()], count: 1, error: null };
    }
    if (terminal) return { data: null, error: null };
    return { data: [], count: 0, error: null };
  };
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    update: (p: Record<string, unknown>) => { st.tipo = 'update'; st.payload = p; return b; },
    eq: (col: string, val: unknown) => { st.filtros[col] = val; return b; },
    maybeSingle: () => Promise.resolve(resposta('maybeSingle')),
    single: () => Promise.resolve(resposta('single')),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resposta(null)).then(ok, erro),
  });
  for (const m of ['neq', 'in', 'is', 'gte', 'lte', 'gt', 'lt', 'or', 'not', 'order', 'range', 'limit', 'ilike', 'like', 'filter', 'match', 'contains']) b[m] = () => b;
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => construtor(t), rpc: () => Promise.resolve({ data: null, error: null }) },
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }));
vi.mock('@/lib/financeiro/conciliacaoSync', () => ({
  sincronizarVinculosDoLancamento: vi.fn(() => Promise.resolve()),
  recomputarStatusExtrato: vi.fn(() => Promise.resolve()),
}));

import { useFinanceiroV2, type LancamentoV2Form } from './useFinanceiroV2';

/* O gesto do Gabriel depois do desvinculo: tirar a devolucao do DRE, para "Pagamento Estornado". */
const form: LancamentoV2Form = {
  fazenda_id: 'faz', conta_bancaria_id: 'conta', data_competencia: '2025-01-17', data_pagamento: '2025-01-20',
  valor: 5056, tipo_operacao: '2-Saídas', status_transacao: 'realizado', descricao: 'Abate 020 V - Graxaria',
  macro_custo: 'Saída Financeira', grupo_custo: 'Outras Saídas', centro_custo: 'Ajustes', subcentro: 'Pagamento Estornado',
  favorecido_id: 'fav',
};
const recusouPorOC = () => toast.error.mock.calls.some(c => String(c[0]).startsWith('Título da Operação Comercial'));

beforeEach(() => { updates.length = 0; Object.values(toast).forEach(f => f.mockClear()); });

describe('classificacao depois do desvinculo', () => {
  it('parte CANCELADA (desvinculado): o subcentro novo e gravado', async () => {
    cenario.parteCancelada = true;
    const { result } = renderHook(() => useFinanceiroV2());
    await act(async () => { await result.current.editarLancamento(LANC, form); });
    expect(recusouPorOC()).toBe(false);
    expect(updates.some(u => u.subcentro === 'Pagamento Estornado')).toBe(true);
  });

  it('parte VIVA (ainda da OC): a trava continua — e a busca prova que sabe achar a parte', async () => {
    cenario.parteCancelada = false;
    const { result } = renderHook(() => useFinanceiroV2());
    await act(async () => { await result.current.editarLancamento(LANC, form); });
    expect(recusouPorOC()).toBe(true);
    expect(updates.some(u => u.subcentro === 'Pagamento Estornado')).toBe(false);
  });
});
