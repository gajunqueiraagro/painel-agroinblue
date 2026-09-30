/**
 * PR-CONC-CRIAR-LOTE-LAYOUT-01 — o modal "Criar lançamentos do extrato" na régua da casa.
 *
 * ⚠ A PRÉVIA É FALSA AQUI (a RPC não mudou e não é deste PR); os números da faixa são os do print do Gabriel (NJ · BB ·
 *   set/26) e as linhas são movimentos reais daquele mês. Prova-se a FORMA: a caixa do cabeçalho em três estados, o que
 *   reage à seleção, a cor pelo sinal, o botão com o número e a trava de duplo clique.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import type { PreviaConciliarMes, CruConciliar } from '@/hooks/useConciliarMes';

const cru = (extratoId: string, dataBanco: string, valorBanco: number, historicoBanco: string, documentoBanco: string): CruConciliar =>
  ({ extratoId, lancamentoId: null, dataBanco, valorBanco, historicoBanco, documentoBanco, importacaoId: null, ambiguo: false });

const PREVIA: PreviaConciliarMes = {
  simulado: true, movimentosExtrato: 218, jaConciliados: 64, processados: 0, restantes: 0,
  crus: [
    cru('a', '2026-09-01', -506.51, 'Pix - Agendamento - 01/09 05:34 TELEFONICA BRAS', '202609011506510'),
    cru('b', '2026-09-01', -83.75, 'Pagamento de Boleto - AGROLINE', '202609011837500'),
    cru('c', '2026-09-01', 1250, 'Pix - Recebido - 01/09 14:02 FRIGORIFICO', '202609011402000'),
    cru('d', '2026-09-02', -8700, 'Pagamento de Boleto - UNIPETRO M.S. DISTRIBUIDORA DE PETROLE', '202609020870000'),
  ],
  crusTotal: -8040.26, substituidos: [], substituidosTotal: 0, aguardandoExatos: [],
  semPar: [{ lancamentoId: 'l1', data: '2026-09-10', valor: -13750, descricao: 'Parcela', subcentro: null, statusTransacao: 'realizado', origemLancamento: 'manual' }],
  semParTotal: -13750, ambiguos: 0, ambiguosLista: [],
  saldo: { inicial: 177290.71, movimentosExtrato: -164162.92, finalCalculado: 13127.79, finalDigitado: 13127.70, confere: false },
};

const M = vi.hoisted(() => ({ gravar: vi.fn(), simular: vi.fn() }));
vi.mock('@/hooks/useConciliarMes', () => ({
  useConciliarMes: () => ({ simular: M.simular, gravar: M.gravar, simulando: false, gravando: false, gravados: 0, erro: null }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: () => Promise.resolve({ data: { pares: [] }, error: null }) },
}));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ConciliarMesDialog } from './ConciliarMesDialog';

beforeEach(() => {
  M.simular.mockReset().mockResolvedValue(PREVIA);
  M.gravar.mockReset().mockResolvedValue({ ...PREVIA, crus: [] });
});

async function abrir() {
  render(<ConciliarMesDialog open onOpenChange={() => {}} clienteId="nj" contaId="bb" contaNome="Banco do Brasil"
    ano={2026} mes={9} arquivosOfx={3} saldoSistemaHoje={812614.24} aoConcluir={() => {}} />);
  await screen.findByTestId('tabela-crus');
}
const todos = () => screen.getByRole('checkbox', { name: 'Marcar todos' });
const linha = (hist: string) => screen.getAllByTestId('linha-cru').find((tr) => tr.textContent?.includes(hist))!;
const botaoCriar = () => screen.getByRole('button', { name: /^Criar \d+ lançamentos?$/ });

describe('marcar todos: a caixa do cabeçalho, três estados', () => {
  it('vazia → parcial → cheia → vazia', async () => {
    await abrir();
    const cab = todos();
    expect(cab).not.toBeChecked();
    expect(cab).not.toBePartiallyChecked();
    fireEvent.click(linha('AGROLINE'));
    await waitFor(() => expect(cab).toBePartiallyChecked());
    fireEvent.click(cab);
    await waitFor(() => expect(cab).toBeChecked());
    expect(cab).not.toBePartiallyChecked();
    for (const tr of screen.getAllByTestId('linha-cru')) expect(within(tr).getByRole('checkbox')).toBeChecked();
    fireEvent.click(cab);
    await waitFor(() => expect(cab).not.toBeChecked());
    expect(screen.queryByTestId('marcados-resumo')?.textContent).toBe('0 marcados');
  });

  it('o "marcar todos" solto do canto saiu', async () => {
    await abrir();
    expect(screen.queryByText('marcar todos')).toBeNull();
  });
});

describe('o que reage à seleção', () => {
  it('uma saída e uma entrada marcadas: a barra das abas, as Saídas, as Entradas e o total', async () => {
    await abrir();
    fireEvent.click(linha('TELEFONICA'));
    fireEvent.click(linha('FRIGORIFICO'));
    expect(screen.getByTestId('marcados-resumo').textContent).toBe('2 marcados · +743,49');
    expect(screen.getByTestId('lat-saidas').textContent).toBe('Saídas (1)−506,51');
    expect(screen.getByTestId('lat-entradas').textContent).toBe('Entradas (1)+1.250,00');
    expect(screen.getByTestId('lat-total').textContent).toBe('2 lançamentos crus+743,49');
  });

  it('o botão diz o número: 0 desligado com o motivo escrito; com a seleção, "Criar N lançamentos"', async () => {
    await abrir();
    expect(botaoCriar()).toBeDisabled();
    expect(botaoCriar().textContent).toBe('Criar 0 lançamentos');
    expect(screen.getByTestId('motivo-criar').textContent).toBe('Marque as linhas que devem virar lançamento.');
    fireEvent.click(linha('AGROLINE'));
    expect(botaoCriar().textContent).toBe('Criar 1 lançamento');
    fireEvent.click(todos());
    expect(botaoCriar()).toBeEnabled();
    expect(botaoCriar().textContent).toBe('Criar 4 lançamentos');
    expect(screen.queryByTestId('motivo-criar')).toBeNull();
  });
});

describe('a régua e a cor pelo sinal', () => {
  it('uma informação por coluna: [caixa] Data | Histórico | Doc | Valor | selo; e o texto de apoio saiu da linha', async () => {
    await abrir();
    const cels = within(linha('TELEFONICA')).getAllByRole('cell').map((c) => c.textContent);
    expect(cels.slice(1)).toEqual(['01/09', 'Pix - Agendamento - 01/09 05:34 TELEFONICA BRAS', '202609011506510', '−506,51', 'cru']);
    expect(screen.queryByText(/nada parecido no sistema/)).toBeNull();
    expect(screen.getByTestId('aviso-cru').textContent)
      .toBe('Nasce cru: data, valor e histórico do banco, sem subcentro e sem fornecedor. Classifique no Enriquecer · Excel. Nada existente é alterado.');
  });

  it('saída vermelha, entrada verde — na linha e no total do dia', async () => {
    await abrir();
    const valor = (hist: string) => within(linha(hist)).getAllByRole('cell')[4];
    expect(valor('TELEFONICA').className).toContain('text-red-600');
    expect(valor('FRIGORIFICO').className).toContain('text-emerald-600');
    const [d1, d2] = screen.getAllByTestId('linha-dia');
    expect(d1.textContent).toBe('01/09 · 3 movimentos+659,74');
    expect(within(d1).getAllByRole('cell')[2].className).toContain('text-emerald-600');
    expect(d2.textContent).toBe('02/09 · 1 movimento−8.700,00');
    expect(within(d2).getAllByRole('cell')[2].className).toContain('text-red-600');
  });

  it('a faixa de saldo: os mesmos números, uma linha; a diferença contra o extrato em âmbar', async () => {
    await abrir();
    const f = screen.getByTestId('faixa-saldo').textContent;
    expect(f).toContain('Saldo inicial177.290,7101/09');
    expect(f).toContain('Movimentos do banco−164.162,92218 · 64 já conciliados');
    expect(f).toContain('Saldo final do extrato13.127,70digitado · 30/09');
    expect(f).toContain('Sistema hoje812.614,24faltam os 4 do banco');
    const depois = screen.getByTestId('faixa-depois');
    expect(depois.textContent).toBe('Sistema depois de criar13.127,79+0,09 contra o extrato');
    expect(within(depois).getByText('+0,09 contra o extrato').className).toContain('text-amber-700');
  });
});

describe('criar', () => {
  it('um clique grava os marcados, uma vez', async () => {
    await abrir();
    fireEvent.click(todos());
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(M.gravar).toHaveBeenCalledTimes(1));
    expect(M.gravar).toHaveBeenCalledWith('nj', 'bb', '2026-09', ['a', 'b', 'c', 'd']);
  });

  it('dois cliques no mesmo tique (antes do render): a trava por ref grava uma vez só', async () => {
    await abrir();
    fireEvent.click(todos());
    let soltar: () => void = () => {};
    M.gravar.mockImplementation(() => new Promise((ok) => { soltar = () => ok({ ...PREVIA, crus: [] }); }));
    const b = botaoCriar();
    const chave = Object.keys(b).find((k) => k.startsWith('__reactProps'));
    const props: { onClick: () => void } = Reflect.get(b, chave ?? '');
    act(() => { props.onClick(); props.onClick(); });
    soltar();
    await waitFor(() => expect(M.gravar).toHaveBeenCalledTimes(1));
  });
});
