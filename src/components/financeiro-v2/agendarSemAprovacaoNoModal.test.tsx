/**
 * BPO-APROVACAO-01 P3 (piloto Vera, Gabriel 23/11 08:41) — no "Editar lançamento", pôr uma SAÍDA em Agendado com o BPO ligado e sem aprovação:
 * nada é gravado, a frase fica ao lado do Salvar e o botão "Enviar para aprovação" manda ESTE lançamento à fila (a prévia do banco antes).
 * Sem o BPO, o agendar segue livre. Dados SINTÉTICOS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2, LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

const banco = vi.hoisted(() => ({ bpoLigado: true, rpcs: [] as { fn: string; a: Record<string, unknown> }[] }));
vi.mock('@/integrations/supabase/client', () => {
  const construtor = (tabela: string): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'ilike', 'or', 'match', 'contains']) b[m] = () => b;
    const dados = () => (tabela === 'financeiro_bpo_config' ? (banco.bpoLigado ? [{ ativo: true }] : []) : []);
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) => Promise.resolve({ data: dados(), error: null, count: 0 }).then(ok);
    return b;
  };
  return {
    supabase: {
      from: (t: string) => construtor(t),
      rpc: (fn: string, a: Record<string, unknown> = {}) => {
        banco.rpcs.push({ fn, a });
        return Promise.resolve({ error: null, data: fn === 'fn_aprovacao_enviar' ? { ok: true, simulado: a.p_simular, enviados: 1, aprovados_pelo_mesmo: 0, recusados: [] } : null });
      },
      storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente Sintético' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({ AbaDocumentosLancamento: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { FRASE_AGENDAR_SEM_APROVACAO } from '@/lib/financeiro/aprovacao';

const FAZENDAS = [{ id: 'f1', nome: 'Fazenda Sintética' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{ id: 'bb', nome_conta: 'BB', banco: 'BB', fazenda_id: 'f1', tipo_conta: null, codigo_conta: null,
  nome_exibicao: 'BB', agencia: null, numero_conta: null, conta_digito: null }];
const FORNECEDORES = [{ id: 'fo', nome: 'Fornecedor Sintético', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null }] as FornecedorV2[];
const CLASSIF: ClassificacaoItem[] = [{ id: 'pl', subcentro: 'Vacinas', centro_custo: 'Sanidade', grupo_custo: 'Custo Variável Pecuária',
  macro_custo: 'Custeio Produção', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' }];
const SAFRAS: Safra[] = [];
const PROG = { id: 'l-prog', cliente_id: 'cli', fazenda_id: 'f1', conta_bancaria_id: 'bb', conta_destino_id: null,
  data_competencia: '2026-12-01', data_vencimento: '2026-12-05', data_pagamento: null, ano_mes: '2026-12', valor: 672.75, sinal: -1,
  tipo_operacao: '2-Saídas', status_transacao: 'programado', descricao: 'Vacina sintética', macro_custo: 'Custeio Produção',
  grupo_custo: 'Custo Variável Pecuária', centro_custo: 'Sanidade', subcentro: 'Vacinas', escopo_negocio: 'pecuaria',
  observacao: null, numero_documento: null, tipo_documento: null, favorecido_id: 'fo', forma_pagamento: 'PIX', dados_pagamento: null,
  origem_lancamento: 'manual', recorrencia_id: null, plano_conta_id: 'pl', safra_id: null, cultura: null, fase: null,
  cancelado: false, editado_manual: false } as LancamentoV2;

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  banco.rpcs.length = 0;
  banco.bpoLigado = true;
});

function montar() {
  const onSave = vi.fn(async (_form: LancamentoV2Form, _id?: string) => true);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}><MemoryRouter>
      <LancamentoV2Dialog open onClose={() => {}} onSave={onSave} lancamento={PROG} defaultFazendaId=""
        fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={SAFRAS}
        onCriarFornecedor={async () => null} />
    </MemoryRouter></QueryClientProvider>);
  return onSave;
}
const campoStatus = () => document.querySelector('button[tabindex="4"]') as HTMLButtonElement;
const botaoSalvar = () => document.querySelector('button[tabindex="17"]') as HTMLButtonElement;
async function agendarESalvar() {
  await screen.findByDisplayValue('Vacina sintética');
  await new Promise((r) => setTimeout(r, 40));
  fireEvent.click(campoStatus());
  fireEvent.click(await screen.findByRole('option', { name: /^Agendado$/ }));
  await waitFor(() => expect(botaoSalvar().disabled).toBe(false));
  fireEvent.click(botaoSalvar());
}

describe('P3 — agendar sem aprovação no Editar lançamento', () => {
  it('BPO ligado e sem aprovação: nada grava, a frase fica ao lado do Salvar e "Enviar para aprovação" manda ESTE (prévia antes)', async () => {
    const onSave = montar();
    await agendarESalvar();
    expect((await screen.findByTestId('erro-antes-de-salvar')).textContent).toBe(FRASE_AGENDAR_SEM_APROVACAO);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('enviar-este-para-aprovacao'));
    await waitFor(() => expect(screen.getByTestId('enviar-aprovacao-previa').textContent).toBe('1 vai para a fila'));
    expect(banco.rpcs.filter((c) => c.fn === 'fn_aprovacao_enviar').map((c) => [c.a.p_ids, c.a.p_simular])).toEqual([[['l-prog'], true]]);
  });
  it('BPO desligado: o agendar segue livre (grava, sem frase nem botão)', async () => {
    banco.bpoLigado = false;
    const onSave = montar();
    await agendarESalvar();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].status_transacao).toBe('agendado');
    expect(screen.queryByTestId('enviar-este-para-aprovacao')).toBeNull();
  });
});
