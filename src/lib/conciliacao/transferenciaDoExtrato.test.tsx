/**
 * P139 — criar transferência pela linha do extrato: a leitura da simulação do banco, a regra do botão (gêmea pede confirmação) e o
 * diálogo de verdade com a RPC simulada (o espelho que o banco escolhe, o empate, a gêmea com "Criar mesmo assim" e "Ignorar como
 * duplicada", a transferência já lançada).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { lerSimulacao, lerSugestao, porqueDaSugestao, type SugestaoDeTransferencia } from './transferenciaDoExtrato';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => Promise.resolve({ data: CONTAS, error: null }) }) }) }) }) } }));
const CONTAS = vi.hoisted(() => [
  { id: 'cc', nome_conta: 'Corrente', nome_exibicao: 'Banco Bradesco', banco: 'Bradesco', agencia: null, numero_conta: null, tipo_conta: 'cc' },
  { id: 'inv', nome_conta: 'Invest', nome_exibicao: 'Bradesco - Invest. Facil', banco: 'Bradesco', agencia: null, numero_conta: null, tipo_conta: 'inv' },
]);
import { CriarTransferenciaDialog, estadoDoBotao } from '@/components/conciliacao/CriarTransferenciaDialog';
import { loteProntoParaGravar } from '@/components/conciliacao/CriarTransferenciasLoteDialog';

const SIM_CRIAR = {
  ok: true, simulado: true, acao: 'criar', extrato_id: 'e1', valor: '500.00', data: '2031-03-10', origem: 'inv', destino: 'cc',
  espelhos: [{ id: 'm1', data: '2031-03-12', descricao: 'RESGATE', valor: '-500.00', distancia: 2 }], espelho_id: 'm1', gemeas: [], existente: null,
};

describe('P139 — a leitura da simulação', () => {
  it('lê a ação, o valor exato (texto), o espelho escolhido e a lista', () => {
    const s = lerSimulacao(SIM_CRIAR);
    expect(s?.acao).toBe('criar');
    expect(s?.valor).toBe(500);
    expect(s?.espelhoId).toBe('m1');
    expect(s?.espelhos).toEqual([{ id: 'm1', data: '2031-03-12', descricao: 'RESGATE', valor: -500, distancia: 2 }]);
  });
  it('peça torta = null (a tela nunca inventa)', () => {
    expect(lerSimulacao({ ...SIM_CRIAR, ok: false })).toBeNull();
    expect(lerSimulacao({ ...SIM_CRIAR, acao: 'outra' })).toBeNull();
    expect(lerSimulacao({ ...SIM_CRIAR, espelhos: [{ id: 'x' }] })).toBeNull();
  });
  it('a transferência já lançada e a meia ponta', () => {
    const s = lerSimulacao({ ...SIM_CRIAR, acao: 'casar_existente', espelhos: [], espelho_id: null,
      existente: { id: 'l4', descricao: 'transf lançada', data: '2031-03-25', meia_ponta: true } });
    expect(s?.existente).toEqual({ id: 'l4', descricao: 'transf lançada', data: '2031-03-25', meiaPonta: true });
  });
  it('a sugestão e o porquê do selo', () => {
    const s = lerSugestao({ extrato_id: 'e1', conta_sugerida: 'inv', conta_nome: 'Bradesco - Invest. Facil', motivo: 'aplicacao_automatica', candidatas: 1 });
    expect(s && porqueDaSugestao(s)).toContain('a única conta de investimento deste banco');
    expect(lerSugestao({ extrato_id: 'e1', motivo: 'inventado', candidatas: 1 })).toBeNull();
  });
});

describe('P139 — a regra do botão (uma só para disabled, title e rodapé)', () => {
  const sim = lerSimulacao(SIM_CRIAR);
  it('sem gêmea: grava', () => { expect(estadoDoBotao(sim, false, false).pode).toBe(true); });
  it('com gêmea: só depois de confirmar', () => {
    const g = lerSimulacao({ ...SIM_CRIAR, gemeas: [{ id: 'g3', descricao: 'Resg/vencto Cdb', data: '2031-03-20', valor: '700' }] });
    expect(estadoDoBotao(g, false, false)).toMatchObject({ pode: false });
    expect(estadoDoBotao(g, false, true).pode).toBe(true);
  });
  it('casar com a existente muda o rótulo', () => {
    const e = lerSimulacao({ ...SIM_CRIAR, acao: 'casar_existente', existente: { id: 'l4', descricao: 'x', data: null, meia_ponta: false } });
    expect(estadoDoBotao(e, false, false).rotulo).toBe('Casar com a existente');
  });
  it('lote: linha sem conta e gêmea sem confirmar seguram o lote inteiro', () => {
    const a = lerSimulacao(SIM_CRIAR)!; const sem = lerSimulacao({ ...SIM_CRIAR, extrato_id: 'e2', acao: 'escolher_conta' })!;
    expect(loteProntoParaGravar([a, sem], 2, new Set()).pode).toBe(false);
    const g = lerSimulacao({ ...SIM_CRIAR, extrato_id: 'e3', gemeas: [{ id: 'g', descricao: 'x', data: '2031-03-20' }] })!;
    expect(loteProntoParaGravar([a, g], 2, new Set()).pode).toBe(false);
    expect(loteProntoParaGravar([a, g], 2, new Set(['e3'])).pode).toBe(true);
  });
});

describe('P139 — o diálogo', () => {
  beforeEach(() => { rpc.mockReset(); Element.prototype.scrollIntoView = () => {}; });
  const MOV = { extrato_id: 'e1', data: '2031-03-10', historico: 'RESG AUTOMATICO INVEST', valor: 500, conta_id: 'cc' };
  const SUG: SugestaoDeTransferencia = { extratoId: 'e1', contaSugerida: 'inv', contaNome: 'Bradesco - Invest. Facil', motivo: 'aplicacao_automatica', candidatas: 1 };

  it('abre com a conta sugerida, mostra o espelho que o BANCO escolheu e grava pela porta', async () => {
    rpc.mockImplementation((_fn: string, args: { p_simular: boolean }) => Promise.resolve(
      args.p_simular ? { data: SIM_CRIAR, error: null } : { data: { ok: true, lancamento_id: 'L1' }, error: null }));
    const onGravado = vi.fn();
    render(<CriarTransferenciaDialog aberto clienteId="cli" movimento={MOV} sugestao={SUG} onFechar={vi.fn()} onGravado={onGravado} />);
    await waitFor(() => expect(screen.getByText('RESGATE')).toBeInTheDocument());
    expect(rpc).toHaveBeenCalledWith('fn_transferencia_do_extrato', expect.objectContaining({ p_extrato: 'e1', p_outra_conta: 'inv', p_simular: true }));
    const botao = screen.getByTestId('gravar-transferencia');
    expect(botao).toHaveTextContent('Criar e conciliar');
    fireEvent.click(botao);
    await waitFor(() => expect(onGravado).toHaveBeenCalled());
    expect(rpc).toHaveBeenLastCalledWith('fn_transferencia_do_extrato', expect.objectContaining({ p_espelho: 'm1', p_simular: false }));
  });

  it('gêmea: o botão espera "Criar mesmo assim"; "Ignorar como duplicada" vai ao ignorar da casa', async () => {
    rpc.mockResolvedValue({ data: { ...SIM_CRIAR, gemeas: [{ id: 'g3', descricao: 'Resg/vencto Cdb', data: '2031-03-10', valor: '500' }] }, error: null });
    const ignorar = vi.fn();
    render(<CriarTransferenciaDialog aberto clienteId="cli" movimento={MOV} sugestao={SUG} onFechar={vi.fn()} onGravado={vi.fn()} onIgnorarDuplicada={ignorar} />);
    await waitFor(() => expect(screen.getByTestId('aviso-gemea')).toBeInTheDocument());
    expect(screen.getByTestId('gravar-transferencia')).toBeDisabled();
    fireEvent.click(screen.getByText('Criar mesmo assim'));
    expect(screen.getByTestId('gravar-transferencia')).not.toBeDisabled();
    fireEvent.click(screen.getByText('Ignorar como duplicada'));
    expect(ignorar).toHaveBeenCalledWith('e1');
  });

  it('empate de espelhos: avisa e não marca nenhum', async () => {
    rpc.mockResolvedValue({ data: { ...SIM_CRIAR, espelho_id: null, espelhos: [
      { id: 'a', data: '2031-03-09', descricao: 'TED A', valor: '-500', distancia: 1 },
      { id: 'b', data: '2031-03-11', descricao: 'TED B', valor: '-500', distancia: 1 }] }, error: null });
    render(<CriarTransferenciaDialog aberto clienteId="cli" movimento={MOV} sugestao={SUG} onFechar={vi.fn()} onGravado={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('aviso-empate')).toBeInTheDocument());
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
  });

  it('a recusa do banco fica no rodapé (nunca toast) e nada fecha', async () => {
    rpc.mockImplementation((_fn: string, args: { p_simular: boolean }) => Promise.resolve(
      args.p_simular ? { data: SIM_CRIAR, error: null } : { data: null, error: { message: 'Já existe um movimento igual (...): pode ser duplicado.' } }));
    const onGravado = vi.fn();
    render(<CriarTransferenciaDialog aberto clienteId="cli" movimento={MOV} sugestao={SUG} onFechar={vi.fn()} onGravado={onGravado} />);
    await waitFor(() => expect(screen.getByTestId('gravar-transferencia')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('gravar-transferencia'));
    await waitFor(() => expect(screen.getByTestId('rodape-transferencia')).toHaveTextContent('pode ser duplicado'));
    expect(onGravado).not.toHaveBeenCalled();
  });
});
