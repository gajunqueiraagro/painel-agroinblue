/**
 * BPO-APROVACAO-01 — a tela do aprovador, com o banco FALSO: o BPO desligado diz isso e não mostra nada; o aprovador marca e aprova em
 * lote pela prévia (p_simular) e só depois grava; recusar exige motivo (a mensagem no campo, nunca toast); quem não é aprovador só vê.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const banco = vi.hoisted(() => ({
  tabelas: {} as Record<string, unknown[]>, rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  respostaRpc: (_fn: string, _a: Record<string, unknown>): { data: unknown; error: unknown } => ({ data: [], error: null }),
}));
vi.mock('@/integrations/supabase/client', () => {
  const consulta = (t: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in', 'is']) b[m] = () => b;
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: banco.tabelas[t] ?? [], error: null }).then(ok);
    return b;
  };
  return { supabase: { from: (t: string) => consulta(t), rpc: (fn: string, a: Record<string, unknown>) => { banco.rpcs.push({ fn, args: a }); return Promise.resolve(banco.respostaRpc(fn, a)); } } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Fazenda Exemplo' }, isAdmin: false }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-aprovador' } }) }));

import AprovarPagamentosPage from './AprovarPagamentosPage';

const txt = (el: Element | null) => (el?.textContent ?? '').replace(/\s/g, ' ');

const linha = (id: string, o: Record<string, unknown> = {}) => ({ lancamento_id: id, rodada: 1, situacao: 'aguardando', valor: -100, vencimento: '2026-11-18',
  conta_bancaria_id: 'itau', conta: 'Itaú 7225', fornecedor: `Fornecedor ${id}`, fazenda: '3M', status_transacao: 'programado', tem_nota: true, tem_boleto: true, ...o });
beforeEach(() => {
  banco.rpcs = [];
  banco.tabelas = { financeiro_bpo_config: [{ ativo: true }], financeiro_aprovadores: [{ id: 'a1' }], openfinance_saldos: [{ conta_bancaria_id: 'itau', saldo: 1000, saldo_em: null, lido_em: '2026-11-17' }] };
  banco.respostaRpc = (fn, a) => fn === 'fn_aprovacao_lista' ? { data: [linha('a', { valor: -300 }), linha('b', { valor: -200 })], error: null }
    : fn === 'fn_aprovacao_decidir' ? { data: { ok: true, simulado: a.p_simular, n: (a.p_ids as string[]).length, total: 500 }, error: null } : { data: [], error: null };
});

describe('BPO — a tela do aprovador', () => {
  it('BPO desligado: a frase, sem fila nem botões', async () => {
    banco.tabelas.financeiro_bpo_config = [];
    render(<AprovarPagamentosPage />);
    expect((await screen.findByTestId('aprovar-desligado')).textContent).toBe('A aprovação de pagamentos não está ligada neste cliente.');
    expect(screen.queryByTestId('aprovar-lote')).toBeNull();
  });
  it('a fila por dia, o saldo depois da fila; marcar 2 → prévia (simular) → confirmar grava os 2', async () => {
    render(<AprovarPagamentosPage />);
    await screen.findAllByTestId('aprovar-item');
    expect(txt(screen.getByTestId('aprovar-saldos'))).toContain('R$ 500,00');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Marcar Fornecedor a' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Marcar Fornecedor b' }));
    expect(txt(screen.getByTestId('aprovar-lote'))).toBe('Aprovar 2 · R$ 500,00');
    fireEvent.click(screen.getByTestId('aprovar-lote'));
    await screen.findByTestId('aprovar-previa');
    expect(banco.rpcs.filter((r) => r.fn === 'fn_aprovacao_decidir')).toEqual([{ fn: 'fn_aprovacao_decidir', args: { p_cliente: 'cli', p_ids: ['a', 'b'], p_aprovar: true, p_motivo: null, p_simular: true } }]);
    fireEvent.click(screen.getByTestId('aprovar-confirmar'));
    await waitFor(() => expect(banco.rpcs.filter((r) => r.fn === 'fn_aprovacao_decidir')).toHaveLength(2));
    expect(banco.rpcs.filter((r) => r.fn === 'fn_aprovacao_decidir')[1].args).toMatchObject({ p_ids: ['a', 'b'], p_aprovar: true, p_simular: false });
    await waitFor(() => expect(txt(screen.getByTestId('aprovar-frase'))).toBe('2 pagamentos aprovados · R$ 500,00.'));
  });
  it('recusar sem motivo: a mensagem no campo e nada gravado; com motivo grava a recusa', async () => {
    render(<AprovarPagamentosPage />);
    fireEvent.click((await screen.findAllByText('Fornecedor a'))[0]);
    fireEvent.click(await screen.findByTestId('aprovar-recusar'));
    fireEvent.click(await screen.findByTestId('aprovar-confirmar-recusa'));
    expect(screen.getByTestId('aprovar-motivo-erro').textContent).toBe('Escreva por que não aprovar (o motivo volta para quem lançou).');
    expect(banco.rpcs.some((r) => r.fn === 'fn_aprovacao_decidir')).toBe(false);
    fireEvent.change(screen.getByTestId('aprovar-motivo'), { target: { value: 'Falta o boleto' } });
    fireEvent.click(screen.getByTestId('aprovar-confirmar-recusa'));
    await waitFor(() => expect(banco.rpcs.find((r) => r.fn === 'fn_aprovacao_decidir')?.args).toMatchObject({ p_ids: ['a'], p_aprovar: false, p_motivo: 'Falta o boleto', p_simular: false }));
  });
  it('quem não é aprovador só vê: sem caixa, sem "Aprovar", com a frase', async () => {
    banco.tabelas.financeiro_aprovadores = [];
    render(<AprovarPagamentosPage />);
    await screen.findAllByTestId('aprovar-item');
    expect(screen.getByTestId('aprovar-so-leitura')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByTestId('aprovar-lote')).toBeNull();
  });
  it('a recusa do banco ("BPO: …") vai à frase sem o prefixo', async () => {
    banco.respostaRpc = (fn) => fn === 'fn_aprovacao_lista' ? { data: [linha('a')], error: null }
      : fn === 'fn_aprovacao_decidir' ? { data: null, error: { message: 'BPO: algum pagamento não está mais aguardando (foi mudado ou já decidido). Atualize a fila.' } } : { data: [], error: null };
    render(<AprovarPagamentosPage />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Marcar Fornecedor a' }));
    fireEvent.click(screen.getByTestId('aprovar-lote'));
    await waitFor(() => expect(screen.getByTestId('aprovar-frase').textContent).toBe('algum pagamento não está mais aguardando (foi mudado ou já decidido). Atualize a fila.'));
  });
});
