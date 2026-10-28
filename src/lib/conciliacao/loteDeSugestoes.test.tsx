/**
 * P124 (CONC-LOTE-SUGESTOES-01) — o lote do mês: a régua do motor (a tela só agrupa), a busca 4 de cada vez, a gravação PAR A PAR pelo
 * gravador de hoje (um recusado não para os outros) e o palco: buscar por gesto, a exata vem marcada, a prévia antes de gravar, ✓ ou a
 * recusa em cada linha; a caixa "Vincular os exatos" saiu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { CandidatoConciliacao, MovimentoConciliacao } from '@/hooks/useConciliacaoDoMes';

const B = vi.hoisted(() => ({
  rpc: vi.fn(),
  vincular: vi.fn(),
  movimentos: [] as unknown[],
  emVoo: 0, maxEmVoo: 0,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: B.rpc } }));
vi.mock('@/hooks/useConciliacaoDoMes', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useConciliacaoDoMes')>()),
  vincularSelecao: B.vincular,
  useConciliacaoDoMes: () => ({ movimentos: B.movimentos, loading: false, recarregar: async () => {} }),
}));
vi.mock('@/components/conciliacao/EstacaoConciliar', () => ({ EstacaoConciliar: () => <div data-testid="estacao" /> }));

import { classificarCandidatos, valorDoPar, fraseDoResultado, conciliarEmLote, buscarSugestoesDoMes } from './loteDeSugestoes';
import { PalcoDoMes } from '@/components/conciliacao/PalcoDoMes';

const cand = (o: Partial<CandidatoConciliacao>): CandidatoConciliacao => ({
  id: 'l1', descricao: 'Folha de Pagamento', favorecido: 'Colaborador Sintético', numeroDocumento: null, dataReferencia: '2031-10-05',
  valor: 2414.38, status: 'programado', jaConciliado: 0, saldo: 2414.38, deltaValor: 0, deltaDias: 3, score: 90,
  preMarcado: true, ambiguo: false, indisponivel: false, motivoIndisponivel: null, vencimento: '2031-10-05', ...o,
});
const linhaRpc = (o: Record<string, unknown>) => ({
  id: 'l1', descricao: 'Folha de Pagamento', favorecido: 'Colaborador Sintético', valor: '2414.38', status: 'programado', saldo: '2414.38',
  delta_valor: '0', delta_dias: 3, score: 90, pre_marcado: true, ambiguo: false, indisponivel: false, vencimento: '2031-10-05', ...o,
});
const mov = (id: string, valor: number, o: Partial<MovimentoConciliacao> = {}): MovimentoConciliacao => ({
  id, data_movimento: '2031-10-02', descricao: `PIX - ENVIADO ${id}`, documento: null, valor, valorConciliado: 0, valorAberto: valor,
  situacao: 'nao_conciliado', lancamentoId: null, vinculos: 0, lancamentoDescricao: null, lancamentoFavorecido: null, ...o,
});

beforeEach(() => { B.rpc.mockReset(); B.vincular.mockReset(); B.emVoo = 0; B.maxEmVoo = 0; });

describe('P124 — a régua é a do motor (a tela só agrupa)', () => {
  it('pré-marcado sem empate = exata; empate ou sem pré-marca com valor igual = a conferir; abaixo de 70 ou nada = sem', () => {
    expect(classificarCandidatos([cand({})]).balde).toBe('exata');
    expect(classificarCandidatos([cand({ ambiguo: true })])).toMatchObject({ balde: 'conferir', empate: true });
    expect(classificarCandidatos([cand({ preMarcado: false, score: 70, deltaDias: 9 })]).balde).toBe('conferir');
    expect(classificarCandidatos([cand({ preMarcado: false, score: 30 })]).balde).toBe('sem');
    expect(classificarCandidatos([]).balde).toBe('sem');
  });
  it('o indisponível (já coberto) nunca é a sugestão', () => {
    expect(classificarCandidatos([cand({ indisponivel: true }), cand({ id: 'l2', preMarcado: false, score: 75 })]))
      .toMatchObject({ balde: 'conferir', candidato: { id: 'l2' } });
  });
  it('o valor do par: o que falta no movimento, nunca mais que o livre do lançamento', () => {
    expect(valorDoPar(-2414.38, { saldo: 2414.38 })).toBe(2414.38);
    expect(valorDoPar(-1499.43, { saldo: 1621 })).toBe(1499.43);
    expect(valorDoPar(-500, { saldo: 300 })).toBe(300);
  });
});

describe('P124 — buscar e gravar', () => {
  it('busca o motor de cada movimento com limite 2, no máximo 4 em voo; erro ≠ sem sugestão', async () => {
    B.rpc.mockImplementation(async (_fn: string, a: { p_extrato_id: string; p_limite: number }) => {
      B.emVoo += 1; B.maxEmVoo = Math.max(B.maxEmVoo, B.emVoo);
      await new Promise((r) => setTimeout(r, 5));
      B.emVoo -= 1;
      expect(a.p_limite).toBe(2);
      if (a.p_extrato_id === 'e-erro') return { data: null, error: { message: 'canceling statement due to statement timeout' } };
      return { data: a.p_extrato_id === 'e-sem' ? [] : [linhaRpc({})], error: null };
    });
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'e-sem', 'e-erro'];
    const r = await buscarSugestoesDoMes('cli', ids);
    expect(B.maxEmVoo).toBe(4);
    expect(r.get('a')).toMatchObject({ ok: true, sugestao: { balde: 'exata' } });
    expect(r.get('e-sem')).toMatchObject({ ok: true, sugestao: { balde: 'sem' } });
    expect(r.get('e-erro')).toMatchObject({ ok: false });
  });
  it('grava PAR A PAR pelo gravador de hoje; o recusado não para os outros; a frase é a do banco', async () => {
    B.vincular.mockImplementation(async (extratoId: string) => (extratoId === 'e2'
      ? { ok: false, erro: 'sobre_aplicacao: valor excede o aberto do movimento' } : { ok: true, erro: null }));
    const r = await conciliarEmLote([
      { extratoId: 'e1', lancamentoId: 'l1', valor: 10 }, { extratoId: 'e2', lancamentoId: 'l2', valor: 20 }, { extratoId: 'e3', lancamentoId: 'l3', valor: 30 }]);
    expect(B.vincular).toHaveBeenCalledTimes(3);
    expect(B.vincular).toHaveBeenNthCalledWith(1, 'e1', [{ lancamentoId: 'l1', valor: 10 }], 'lote do mês');
    expect(r.map((x) => x.ok)).toEqual([true, false, true]);
    expect(fraseDoResultado(r)).toBe('2 conciliados · 1 recusado: sobre_aplicacao: valor excede o aberto do movimento');
  });
});

describe('P124 — o palco do mês', () => {
  const montar = () => render(<PalcoDoMes clienteId="cli" contaId="bb" contaNome="Banco Exemplo" ano={2031} mes={10} aoFechar={vi.fn()} />);
  beforeEach(() => {
    B.movimentos = [mov('e-exata', -2414.38), mov('e-conferir', -1499.43), mov('e-sem', -175), mov('e-ok', -50, { situacao: 'conciliado', valorAberto: 0, vinculos: 1, lancamentoDescricao: 'Tarifa' })];
    B.rpc.mockImplementation(async (_fn: string, a: { p_extrato_id: string }) => ({ data:
      a.p_extrato_id === 'e-exata' ? [linhaRpc({ id: 'l-exata' })]
      : a.p_extrato_id === 'e-conferir' ? [linhaRpc({ id: 'l-conf', pre_marcado: false, score: 70, delta_valor: '-121.57', saldo: '1621' })]
      : [], error: null }));
  });
  it('a caixa "Vincular os exatos" saiu; buscar é gesto e só pergunta pelos abertos', async () => {
    montar();
    expect(screen.queryByText(/Vincular os exatos/)).toBeNull();
    expect(B.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('buscar-sugestoes'));
    await waitFor(() => expect(screen.getByTestId('chip-sugestao-exata')).toHaveTextContent('exata (1)'));
    expect(B.rpc).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('chip-sugestao-conferir')).toHaveTextContent('(1)');
    expect(screen.getByTestId('chip-sugestao-sem')).toHaveTextContent('(1)');
  });
  it('a exata vem MARCADA e a conferir não; a prévia diz quantos e o total; grava par a par e a linha diz ✓ ou recusado', async () => {
    B.vincular.mockResolvedValue({ ok: true, erro: null });
    montar();
    fireEvent.click(screen.getByTestId('buscar-sugestoes'));
    await waitFor(() => expect(screen.getByTestId('conciliar-selecionados')).toHaveTextContent('Conciliar selecionados (1)'));
    const linhas = screen.getAllByTestId('linha-palco');
    const exata = linhas.find((l) => l.getAttribute('data-balde') === 'exata')!;
    const conferir = linhas.find((l) => l.getAttribute('data-balde') === 'conferir')!;
    expect(within(exata).getByTestId('marcar-linha')).toHaveAttribute('data-state', 'checked');
    expect(within(conferir).getByTestId('marcar-linha')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('selecionados')).toHaveTextContent('Selecionados: 1 · -R$ 2.414,38');
    fireEvent.click(screen.getByTestId('conciliar-selecionados'));
    expect(screen.getByTestId('previa-lote')).toHaveTextContent('1 serão conciliados · total -R$ 2.414,38');
    expect(B.vincular).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirmar-lote'));
    await waitFor(() => expect(screen.getByTestId('rodape-palco')).toHaveTextContent('1 conciliado'));
    expect(B.vincular).toHaveBeenCalledWith('e-exata', [{ lancamentoId: 'l-exata', valor: 2414.38 }], 'lote do mês');
    expect(within(exata).getByTestId('resultado-par')).toHaveTextContent('✓');
  });
  it('a conferir marcada à mão grava pelo livre do lançamento (min dos dois); a recusa fica na linha e no rodapé', async () => {
    B.vincular.mockResolvedValue({ ok: false, erro: 'extrato ja possui vinculo ativo' });
    montar();
    fireEvent.click(screen.getByTestId('buscar-sugestoes'));
    await waitFor(() => expect(screen.getByTestId('chip-sugestao-exata')).toHaveTextContent('(1)'));
    const conferir = screen.getAllByTestId('linha-palco').find((l) => l.getAttribute('data-balde') === 'conferir')!;
    fireEvent.click(within(conferir).getByTestId('marcar-linha'));
    fireEvent.click(screen.getByTestId('conciliar-selecionados'));
    fireEvent.click(screen.getByTestId('confirmar-lote'));
    await waitFor(() => expect(screen.getByTestId('rodape-palco')).toHaveTextContent('recusado'));
    expect(B.vincular).toHaveBeenCalledWith('e-conferir', [{ lancamentoId: 'l-conf', valor: 1499.43 }], 'lote do mês');
    expect(within(conferir).getByTestId('resultado-par')).toHaveTextContent('recusado');
  });
});
