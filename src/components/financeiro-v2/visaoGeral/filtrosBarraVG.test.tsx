/**
 * P83 — o seletor de Contas da Visão Geral com "Todas · Limpar" no topo (o par compartilhado `AcoesDaListaMultipla`).
 *   B1 "Todas" marca todas as contas ativas; "Limpar" desmarca todas (nenhuma conta) — os dois chegam ao estado que vai ao banco
 *   B2 o gesto que não vale fica apagado (todas marcadas → "Todas" apagado; nenhuma → "Limpar" apagado)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: () => ({}) } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));

import { FiltrosBarraVG, rotuloDasContas } from './FiltrosBarraVG';
import { filtrosVG } from '@/lib/financeiro/visaoGeral';

const LISTA = {
  contas: [
    { id: 'c1', nome: 'Banco A', tipo: 'cc', ativa: true, no_caixa: true },
    { id: 'c2', nome: 'Banco B', tipo: 'cc', ativa: true, no_caixa: true },
    { id: 'c3', nome: 'Cartão', tipo: 'cartao', ativa: true, no_caixa: true },
  ],
  atividades: [], safras: [],
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: LISTA, error: null });
  filtrosVG.mudar({ contas: null, fazenda: null, safra: null, atividade: null, clienteId: null, lista: null });
});

const abrir = async () => {
  render(<FiltrosBarraVG />);
  await act(async () => { await Promise.resolve(); });
  const gatilho = screen.getByTestId('vg-contas');
  fireEvent.pointerDown(gatilho, { button: 0, pointerType: 'mouse' });
  fireEvent.click(gatilho);
  return screen.findByTestId('vg-contas-acoes');
};

describe('Contas · Todas e Limpar', () => {
  it('B1 Todas marca as ativas; Limpar não deixa nenhuma', async () => {
    await abrir();
    fireEvent.click(screen.getByTestId('vg-contas-acoes-limpar'));
    expect(filtrosVG.ler().contas).toEqual([]);
    expect(rotuloDasContas(LISTA.contas, [])).toBe('Nenhuma conta');
    fireEvent.click(screen.getByTestId('vg-contas-acoes-todas'));
    expect(filtrosVG.ler().contas).toEqual(['c1', 'c2', 'c3']);
  });

  it('B2 o gesto que não vale fica apagado', async () => {
    await abrir();
    /* o padrão (contas do caixa + cartões) já marca as três: "Todas" apagado */
    expect((screen.getByTestId('vg-contas-acoes-todas') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('vg-contas-acoes-limpar') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('vg-contas-acoes-limpar'));
    expect((screen.getByTestId('vg-contas-acoes-limpar') as HTMLButtonElement).disabled).toBe(true);
  });
});
