/**
 * CONC-SEM-TRAVA-01 (tela) — a Estacao "Conciliar movimento do extrato" (1:1 e grupo da conciliacao do mes): a selecao que nao fecha o
 * valor cheio do movimento nao trava mais com o aviso; o botao vira "Conciliar…" e abre o modal da diferenca.
 *   E1 grupo de dois que soma menos que o movimento -> "Conciliar…" liberado, abre o modal com os dois lancamentos
 *   E2 um lancamento MENOR que o movimento continua sendo o vinculo parcial de sempre ("Vincular (1)")
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const CAND = vi.hoisted(() => [
  { id: 'r1', descricao: 'Venda 118 Vacas - 1/3', favorecido: 'Comprador', numeroDocumento: null, dataReferencia: '2026-06-30', valor: 215000,
    status: 'programado', jaConciliado: 0, saldo: 215000, deltaValor: 0, deltaDias: 0, score: 1, preMarcado: false, ambiguo: false, indisponivel: false },
  { id: 'r4', descricao: 'Venda 40 Bezerros', favorecido: 'Comprador', numeroDocumento: null, dataReferencia: '2026-06-30', valor: 98000,
    status: 'programado', jaConciliado: 0, saldo: 98000, deltaValor: 0, deltaDias: 0, score: 1, preMarcado: false, ambiguo: false, indisponivel: false },
]);
const ABERTO = vi.hoisted(() => ({ props: null as null | { extratos: { id: string }[]; lancamentos: { id: string }[] } }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(async () => ({ data: null, error: null })) } }));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));
vi.mock('@/components/conciliacao/ConciliarDiferencaModal', () => ({
  ConciliarDiferencaModal: (p: { extratos: { id: string }[]; lancamentos: { id: string }[] }) => { ABERTO.props = p; return <div data-testid="modal-conciliar" />; },
}));
vi.mock('@/hooks/useConciliacaoDoMes', () => ({
  TOL: 0.005,
  useVinculosDoMovimento: () => ({ vinculos: [], loading: false, recarregar: vi.fn() }),
  useCandidatosDoMovimento: () => ({ candidatos: CAND, carregando: false, recarregar: vi.fn() }),
  vincularSelecao: vi.fn(async () => ({ ok: true, erro: null })),
  desfazerGrupo: vi.fn(),
}));

import { EstacaoConciliar } from './EstacaoConciliar';

const MOV = { id: 'pix-0630', data_movimento: '2026-06-30', descricao: 'PIX RECEBIDO', documento: null, valor: 375000,
  valorConciliado: 0, valorAberto: 375000, situacao: 'nao_conciliado' } as never;

function marcar(desc: string) {
  const linha = screen.getByText(desc).closest('tr') as HTMLElement;
  fireEvent.click(within(linha).getByRole('checkbox'));
}

describe('CONC-SEM-TRAVA-01 — a Estação abre o modal da diferença', () => {
  it('E1 grupo que soma menos que o movimento: "Conciliar…" abre o modal com os dois', async () => {
    render(<EstacaoConciliar movimento={MOV} aoFechar={() => {}} aoMudar={() => {}} />);
    marcar('Venda 118 Vacas - 1/3'); marcar('Venda 40 Bezerros');
    const botao = screen.getByTestId('vincular-estacao');
    expect(botao.textContent).toContain('Conciliar…');
    expect(botao).not.toBeDisabled();
    fireEvent.click(botao);
    await waitFor(() => expect(screen.getByTestId('modal-conciliar')).toBeTruthy());
    expect(ABERTO.props?.extratos.map(e => e.id)).toEqual(['pix-0630']);
    expect(ABERTO.props?.lancamentos.map(l => l.id).sort()).toEqual(['r1', 'r4']);
  });
  it('E2 um lançamento menor que o movimento: segue o vínculo parcial ("Vincular (1)")', () => {
    render(<EstacaoConciliar movimento={MOV} aoFechar={() => {}} aoMudar={() => {}} />);
    marcar('Venda 118 Vacas - 1/3');
    expect(screen.getByTestId('vincular-estacao').textContent).toContain('Vincular (1)');
  });
});
