/**
 * FINANC-VINCULO-OBRIGATORIO-01 FASE 1 (mock aprovado com ajuste, Gabriel 27/11) — o "Vincular a um contrato": NENHUM contrato nasce escolhido;
 * o de parcela de valor igual só ganha o selo; a parcela grava pela prévia do banco antes; "Agora não" só fecha (a pendência fica). SINTÉTICO.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  vincularParcela: vi.fn(async (_p: string, _papel: string, _m: boolean, simular: boolean) => ({ recusa: null, paga: !simular || true, cancelados: 0, avisos: [] })),
  vincularEncargo: vi.fn(async () => null), vincularLiberacao: vi.fn(async () => null),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('@/hooks/useFornecedoresDoCliente', () => ({ useFornecedoresDoCliente: () => ({ fornecedores: [
  { id: 'b1', nome: 'Banco Bradesco', nome_fantasia: null, cpf_cnpj: null, aliases_norm: null, ativo: true },
  { id: 'b2', nome: 'Banco Itaú BBA', nome_fantasia: null, cpf_cnpj: null, aliases_norm: null, ativo: true }] }) }));
vi.mock('@/hooks/useLancamentoNoFinanciamento', () => ({ useLancamentoNoFinanciamento: () => api }));
vi.mock('@/hooks/useSituacaoDoContrato', () => ({ useSituacaoEmLote: () => ({ data: new Map([
  ['f1', { parcelas: [{ id: 'q9', numero: 9, dataVencimento: '2027-01-08', situacao: 'pendente' }], cartoes: {}, saldo: { saldo: 1200000 } }],
  ['f2', { parcelas: [{ id: 'q3', numero: 3, dataVencimento: '2027-04-30', situacao: 'pendente' }], cartoes: {}, saldo: { saldo: 2000000 } }]]) }) }));
vi.mock('@/lib/financiamentos/vinculoPendente', async (orig) => ({
  ...(await orig<typeof import('@/lib/financiamentos/vinculoPendente')>()),
  consultarContratosParaVincular: async () => [
    { id: 'f1', numero: '27.669', descricao: 'Custeio A', credorId: 'b1', dataContrato: '2026-01-30', valorContratado: 1200000, status: 'ativo' },
    { id: 'f2', numero: '197006191819500', descricao: 'Custeio B', credorId: 'b2', dataContrato: '2026-04-30', valorContratado: 2000000, status: 'ativo' }],
}));

import { VincularAUmContrato } from './VincularAUmContrato';
import type { ParcelaExata } from '@/lib/financiamentos/vinculoPendente';

const EXATA: ParcelaExata = { parcelaId: 'q3', financiamentoId: 'f2', numeroContrato: '197006191819500', numeroParcela: 3, vencimento: '2027-04-30', papel: 'juros' };
beforeEach(() => { api.vincularParcela.mockClear(); api.vincularEncargo.mockClear(); });

function montar(tipo: 'juros' | 'amortizacao' = 'juros') {
  const aoFechar = vi.fn(); const aoVincular = vi.fn();
  render(<VincularAUmContrato lancamentoId="l1" clienteId="cli" tipo={tipo} subcentro="Juros de Financiamento Pecuária" valor={16238} data="2026-10-30"
    exata={EXATA} aoFechar={aoFechar} aoVincular={aoVincular} />);
  return { aoFechar, aoVincular };
}

describe('Vincular a um contrato', () => {
  it('abre SEM contrato escolhido; o de valor igual só tem o selo; o Vincular apagado', async () => {
    montar();
    const linhas = await screen.findAllByTestId('vinculo-contrato');
    expect(linhas.map((l) => l.getAttribute('aria-selected'))).toEqual(['false', 'false']);
    expect(screen.getByTestId('vinculo-parcela-igual').textContent).toBe('valor igual · parc. 3');
    expect(screen.getByTestId('vinculo-previa').textContent).toBe('Escolha o contrato na lista.');
    expect(screen.getByTestId('vinculo-gravar').hasAttribute('disabled')).toBe(true);
    expect(api.vincularParcela).not.toHaveBeenCalled();
  });

  it('o contrato da parcela igual: prévia do banco (simular) e grava NA parcela como juros', async () => {
    const { aoFechar, aoVincular } = montar();
    fireEvent.click((await screen.findAllByTestId('vinculo-contrato'))[1]);
    await waitFor(() => expect(api.vincularParcela).toHaveBeenCalledWith('q3', 'juros', false, true));
    await waitFor(() => expect(screen.getByTestId('vinculo-gravar').hasAttribute('disabled')).toBe(false));
    expect(screen.getByTestId('vinculo-gravar').textContent).toBe('Vincular ao 197006191819500');
    fireEvent.click(screen.getByTestId('vinculo-gravar'));
    await waitFor(() => expect(api.vincularParcela).toHaveBeenCalledWith('q3', 'juros', false, false));
    expect(aoVincular).toHaveBeenCalled(); expect(aoFechar).toHaveBeenCalled();
  });

  it('juros em OUTRO contrato = encargo de juros (sem parcela)', async () => {
    montar();
    fireEvent.click((await screen.findAllByTestId('vinculo-contrato'))[0]);
    expect(screen.getByTestId('vinculo-previa').textContent).toBe('Juros do contrato 27.669 (encargo)');
    fireEvent.click(screen.getByTestId('vinculo-gravar'));
    await waitFor(() => expect(api.vincularEncargo).toHaveBeenCalledWith('f1', 'juros'));
    expect(api.vincularParcela).not.toHaveBeenCalled();
  });

  it('V3 — "Agora não" só fecha: nenhum gravador é chamado', async () => {
    const { aoFechar, aoVincular } = montar('amortizacao');
    await screen.findAllByTestId('vinculo-contrato');
    fireEvent.click(screen.getByTestId('vinculo-agora-nao'));
    expect(aoFechar).toHaveBeenCalled(); expect(aoVincular).not.toHaveBeenCalled();
    expect(api.vincularParcela).not.toHaveBeenCalled(); expect(api.vincularEncargo).not.toHaveBeenCalled();
  });
});
