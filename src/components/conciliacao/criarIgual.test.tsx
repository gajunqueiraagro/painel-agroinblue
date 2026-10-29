/**
 * P153 — o "Criar igual": o modelo do histórico entra no `prefill` do Criar de hoje (`CriarLancamentoDaLinha`) e mais nada.
 * ⚠ O valor, a data e a conta continuam os do MOVIMENTO (travados); sem modelo, o prefill é o de sempre.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { MovimentoConciliacao } from '@/hooks/useConciliacaoDoMes';

const M = vi.hoisted(() => ({ prefill: null as Record<string, unknown> | null }));
vi.mock('sonner', () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { fazenda_id: 'faz-da-conta' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({
  useFinanceiroV2: () => ({
    contasBancarias: [], fornecedores: [], classificacoes: [], safras: [],
    loadContas: async () => {}, loadFornecedores: async () => {}, loadClassificacoes: async () => {}, loadSafras: async () => {},
    criarFornecedor: async () => null, criarLancamentoComId: async () => 'novo',
  }),
  notificarLancamentosMudaram: () => {},
}));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-1' } }) }));
vi.mock('@/components/financeiro-v2/LancamentoV2Dialog', () => ({
  LancamentoV2Dialog: (p: { prefill?: Record<string, unknown> }) => { M.prefill = p.prefill ?? null; return null; },
}));

import { CriarLancamentoDaLinha } from './CriarLancamentoDaLinha';

const MOV: MovimentoConciliacao = {
  id: 'ext-1', data_movimento: '2026-10-05', descricao: 'PAGAMENTO DE BOLETO - ZEBRALUX SINT', documento: null, valor: -1382,
  valorConciliado: 0, valorAberto: -1382, situacao: 'nao_conciliado', lancamentoId: null, vinculos: 0,
  lancamentoDescricao: null, lancamentoFavorecido: null,
};
const MODELO = { favorecido_id: 'f1', plano_conta_id: 'p1', subcentro: 'Nutrição', centro_custo: 'Pecuária', fazenda_id: 'fz1', descricao: 'Ração de engorda' };

beforeEach(() => { M.prefill = null; });

describe('Criar igual (o modelo no prefill)', () => {
  it('o modelo preenche fornecedor, subcentro, fazenda e descrição; valor, data e conta seguem os do movimento', () => {
    render(<CriarLancamentoDaLinha movimento={MOV} contaBancariaId="cb-extrato" modelo={MODELO} aoFechar={() => {}} aoCriado={() => {}} />);
    expect(M.prefill).toMatchObject({
      favorecido_id: 'f1', plano_conta_id: 'p1', subcentro: 'Nutrição', centro_custo: 'Pecuária', fazenda_id: 'fz1', descricao: 'Ração de engorda',
      valor: 1382, data_pagamento: '2026-10-05', conta_bancaria_id: 'cb-extrato', tipo_operacao: '2-Saídas', status_transacao: 'realizado',
    });
  });
  it('sem modelo, o prefill de sempre: a fazenda da conta, a descrição do banco, sem fornecedor nem subcentro', () => {
    render(<CriarLancamentoDaLinha movimento={MOV} contaBancariaId="cb-extrato" aoFechar={() => {}} aoCriado={() => {}} />);
    expect(M.prefill).toMatchObject({ fazenda_id: 'faz-da-conta', descricao: 'PAGAMENTO DE BOLETO - ZEBRALUX SINT' });
    expect(M.prefill).not.toHaveProperty('favorecido_id');
    expect(M.prefill).not.toHaveProperty('subcentro');
  });
});
