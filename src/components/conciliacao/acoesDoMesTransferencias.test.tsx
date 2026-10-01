/**
 * PR-CONC-TRANSFERENCIAS-01 — o botão "Transferências entre contas (N)" no passo 2 (`AcoesDoMes`).
 *
 * ⚠ ANTES DO "Criar lançamentos em lote": é a ordem do fluxo do mês. E ele é do CLIENTE (cruza contas): aparece mesmo
 *   quando a conta da régua não tem movimento no mês, desde que haja par pendente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const M = vi.hoisted(() => ({ movimentos: [] as Array<{ situacao: string }>, total: 0, meias: [] as unknown[] }));

vi.mock('@/hooks/useConciliacaoDoMes', () => ({
  useConciliacaoDoMes: () => ({ movimentos: M.movimentos, recarregar: vi.fn() }),
}));
vi.mock('@/hooks/useExtratoDaConta', () => ({
  useSaldoGerencialDoMes: () => ({ anoMes: '2026-09', saldoInicial: 0, posicaoEm: null }),
  useSaldoSistemaNaPosicao: () => ({ saldoSistema: null }),
  useImportacoesDaConta: () => ({ importacoes: [] }),
  importacoesDoMes: () => ({ ativas: [] }),
}));
vi.mock('@/components/conciliacao/PalcoDoMes', () => ({ PalcoDoMes: () => null }));
vi.mock('@/components/conciliacao/ConciliarMesDialog', () => ({ ConciliarMesDialog: () => null }));
vi.mock('@/components/conciliacao/TransferenciasEntreContasModal', () => ({ TransferenciasEntreContasModal: () => null }));
vi.mock('@/hooks/useTransferenciasSugeridas', () => ({
  useTransferenciasSugeridas: () => ({
    dados: { total: M.total, linhas: [], meias: M.meias }, carregando: false, erro: null, fechar: vi.fn(), fecharMeia: vi.fn(), depoisDeGravar: vi.fn(),
  }),
}));

import { AcoesDoMes } from './AcoesDoMes';

beforeEach(() => { M.movimentos = [{ situacao: 'nao_conciliado' }]; M.total = 10; M.meias = []; });

const montar = () => render(<AcoesDoMes clienteId="nj" contaId="itau" contaNome="Itau BBA" ano={2026} mes={9} />);

describe('Transferências entre contas no passo 2', () => {
  it('vem ANTES do "Criar lançamentos em lote", com o número de pares pendentes', () => {
    montar();
    const rotulos = screen.getAllByRole('button').map((b) => b.textContent);
    expect(rotulos[0]).toBe('Transferências entre contas (10)');
    expect(rotulos[1]).toBe('Criar lançamentos em lote (1)');
  });

  it('sem par pendente, o rótulo fica sem número', () => {
    M.total = 0;
    montar();
    expect(screen.getByRole('button', { name: 'Transferências entre contas' })).toBeEnabled();
  });

  it('conta da régua sem movimento no mês: o botão das transferências continua (elas cruzam contas)', () => {
    M.movimentos = [];
    montar();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Transferências entre contas (10)']);
  });

  /* CONC-TRANSF-SEGUNDA-PONTA-01: o (N) soma pares e meias transferências. */
  it('o número soma as duas espécies: 10 pares + 3 meias = (13)', () => {
    M.meias = [{}, {}, {}];
    montar();
    expect(screen.getAllByRole('button')[0].textContent).toBe('Transferências entre contas (13)');
  });
  it('só meias pendentes, conta sem movimento: o botão aparece com o número delas', () => {
    M.movimentos = []; M.total = 0; M.meias = [{}, {}];
    montar();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Transferências entre contas (2)']);
  });

  it('conta sem movimento e nenhum par: nada aparece, como antes', () => {
    M.movimentos = []; M.total = 0;
    const { container } = montar();
    expect(container.innerHTML).toBe('');
  });
});
