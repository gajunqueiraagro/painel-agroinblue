/**
 * PATR-LIGAR-FINANC-01 (1) — o "Ligar" do "Ligar lançamentos ao bem" confere e grava no MESMO gesto.
 *   L1 marcar e clicar Ligar (sem Conferir antes): o banco simula, a prévia está limpa, grava — 2 chamadas (simular, gravar) e fecha
 *   L2 a prévia recusa: para na prévia (o motivo escrito na linha dela), nada é gravado, o modal fica aberto
 *   L3 repetida: para pedindo a confirmação; marcada a caixa, o Ligar grava com a confirmação
 *   L4 nada marcado: o Ligar fica apagado e o motivo está ESCRITO no rodapé (nunca só no title)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => import('../../../scripts/ui-cortes/mocks/supabase'));
vi.mock('@/contexts/ClienteContext', () => import('../../../scripts/ui-cortes/mocks/cliente'));
vi.mock('@/contexts/AuthContext', () => import('../../../scripts/ui-cortes/mocks/auth'));
vi.mock('@/contexts/FazendaContext', () => import('../../../scripts/ui-cortes/mocks/fazenda'));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { LigarLancamentosDialog } from './LigarLancamentosDialog';
import { PatrimonioApiProvider } from '@/hooks/usePatrimonio';
import type { PatrimonioApi, PreviaLigar, ItemSemBem } from '@/lib/patrimonio/patrimonioApi';

const ITEM: ItemSemBem = { lancamento_id: 'l1', parte_ordem: 1, data: '2026-03-06', valor: 42075, descricao: 'Plantadeira sintética – 15% entrada',
  fornecedor: 'Revenda sintética', subcentro: 'Máquinas', fazenda_codigo: 'PUR', repetida: false, de_contrato: false, a_realizar: false };
const previa = (p: Partial<PreviaLigar>): PreviaLigar => ({ ok: true, soma: 42075, n_ligar: 1, n_recusas: 0, n_repetidas: 0, itens: [], contratos: [], ...p });

let ligar: ReturnType<typeof vi.fn>;
let previaDoBanco: PreviaLigar;
function api(): PatrimonioApi {
  return {
    categorias: async () => [], lista: async () => ({ ok: true, dados: [] }), semBemResumo: async () => null, itensSemBem: async () => [ITEM],
    lancamentosDoBem: async () => [], pastosDaFazenda: async () => [], pastosDoBem: async () => [], serie: async () => [], avaliacoes: async () => [],
    documentos: async () => [], cadastroDoBem: async () => null, salvarBem: async () => ({ ok: true, dados: {} }), mudarParametros: async () => ({ ok: true, dados: {} }),
    corrigirParametros: async () => ({ ok: true, dados: {} }), versaoDoBem: async () => 1, ligar: (...a) => ligar(...a),
    desligar: async () => ({ ok: true, dados: {} }), salvarPastos: async () => ({ ok: true, dados: {} }), salvarAvaliacao: async () => ({ ok: true, dados: {} }),
    cancelarAvaliacao: async () => ({ ok: true, dados: {} }), enviarDocumento: async () => null, removerDocumento: async () => ({ ok: true, dados: {} }), urlDoDocumento: async () => null,
  };
}
const aoFechar = vi.fn(); const aoLigar = vi.fn();
function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PatrimonioApiProvider api={api()}>
    <LigarLancamentosDialog bemId="bem1" clienteId="cli" aoFechar={aoFechar} aoLigar={aoLigar} />
  </PatrimonioApiProvider></QueryClientProvider>);
}
const botaoLigar = () => screen.getByTestId('ligar-confirmar') as HTMLButtonElement;
const marcarOItem = async () => fireEvent.click(await screen.findByTestId('ligar-item'));

beforeEach(() => {
  cleanup(); aoFechar.mockReset(); aoLigar.mockReset();
  previaDoBanco = previa({});
  ligar = vi.fn(async (_b: string, _i: unknown, _c: boolean, simular: boolean) => ({ ok: true, dados: simular ? previaDoBanco : previa({}) }));
});

describe('Ligar lançamentos ao bem — o Ligar confere e grava no mesmo gesto', () => {
  it('L1 marcar e clicar Ligar (sem Conferir): simula, grava e fecha', async () => {
    montar(); await marcarOItem();
    expect(botaoLigar().disabled).toBe(false);
    fireEvent.click(botaoLigar());
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(ligar.mock.calls.map(c => c[3])).toEqual([true, false]);
    expect(ligar.mock.calls[1][1]).toEqual([{ lancamento_id: 'l1', parte_ordem: 1 }]);
    expect(aoLigar).toHaveBeenCalledTimes(1);
  });
  it('L2 a prévia recusa: para na prévia com o motivo escrito, nada gravado', async () => {
    previaDoBanco = previa({ n_recusas: 1, n_ligar: 0, itens: [{ lancamento_id: 'l1', parte_ordem: 1, situacao: 'recusa', motivo: 'já ligado a outro bem', repetida: false, valor: 42075, descricao: null }] });
    montar(); await marcarOItem();
    fireEvent.click(botaoLigar());
    expect(await screen.findByText('1 não se ligam (em vermelho na lista).')).toBeTruthy();
    expect(screen.getByText('já ligado a outro bem')).toBeTruthy();
    expect(ligar.mock.calls.map(c => c[3])).toEqual([true]);
    expect(aoFechar).not.toHaveBeenCalled();
  });
  it('L3 repetida: para pedindo a confirmação; marcada, o Ligar grava com ela', async () => {
    previaDoBanco = previa({ n_repetidas: 1 });
    montar(); await marcarOItem();
    fireEvent.click(botaoLigar());
    const caixa = await screen.findByText(/marcado\(s\) como possível repetição/);
    expect(ligar).toHaveBeenCalledTimes(1); expect(aoFechar).not.toHaveBeenCalled();
    fireEvent.click(caixa.querySelector('button') ?? caixa);
    fireEvent.click(botaoLigar());
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(ligar.mock.calls.slice(1).map(c => [c[2], c[3]])).toEqual([[true, true], [true, false]]);
  });
  it('L4 nada marcado: Ligar apagado e o motivo ESCRITO no rodapé', async () => {
    montar(); await screen.findByTestId('ligar-item');
    expect(botaoLigar().disabled).toBe(true);
    expect(screen.getByText('marque ao menos um lançamento para ligar')).toBeTruthy();
  });
});
