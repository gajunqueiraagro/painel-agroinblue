/**
 * OC-FAZENDA-GLOBAL-01 — a Central de Operacoes Comerciais segue o seletor lateral de fazenda,
 * como o Lancar movimentacao e a Lista. O filtro proprio `f_fazenda` saiu.
 *
 * ⚠ TRES OCs NO FIXTURE, uma de cada tipo de caso: fazenda A, fazenda B e SEM fazenda. A sem
 *   fazenda existe no schema (0 no proto em 25/09/2026) e o criterio e' o da Lista: aparece em
 *   Global, some com uma fazenda escolhida.
 * ⚠ O SUPABASE E' UM CONSTRUTOR FALSO que responde por tabela; o seletor lateral e' um objeto
 *   mutavel atras do `useFazenda`, e o re-render troca a fazenda como o operador trocaria.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { BrowserRouter, useLocation } from 'react-router-dom';

const OC_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const OC_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const OC_SEM = 'cccccccc-0000-0000-0000-000000000003';
const FAZ_A = 'faz-a';
const FAZ_B = 'faz-b';

const op = (id: string, fazenda_id: string | null, data: string) => ({
  id, versao: 1, data_operacao: data, tipo_operacao: 'venda', contraparte_id: null, fazenda_id,
  status_comercial: 'fechada', rascunho: false, entrega_encerrada: false, qtd_negociada: 10,
  peso_total_negociado_kg: null, valor_acordado: 1000, valor_total: 1000,
});
const TABELAS: Record<string, unknown[]> = {
  zoo_operacoes_comerciais: [op(OC_A, FAZ_A, '2026-09-03'), op(OC_B, FAZ_B, '2026-09-02'), op(OC_SEM, null, '2026-09-01')],
  fazendas: [{ id: FAZ_A, nome: 'Faz. Pureza', codigo: 'PUR' }, { id: FAZ_B, nome: 'Faz. Sto. Expedito', codigo: 'SE' }],
};
function construtor(tabela: string) {
  const resposta = { data: TABELAS[tabela] ?? [], error: null };
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = () => b;
  b.then = (ok: (v: typeof resposta) => unknown) => Promise.resolve(resposta).then(ok);
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => construtor(t), rpc: vi.fn() } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-nj', nome: 'NJ Pecuária' } }) }));
const seletor: { fazendaAtual: { id: string; nome: string } | null; isGlobal: boolean } = { fazendaAtual: null, isGlobal: true };
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => seletor }));
vi.mock('@/hooks/useOperacaoComercial', () => ({ useOperacaoComercial: () => ({}) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
/* O resumo real gera PDF/Excel; aqui so' interessa O QUE ele recebe como fazenda. */
vi.mock('@/components/operacao-comercial/central/ResumoOperacoesModal', () => ({
  ResumoOperacoesModal: ({ filtros }: { filtros: { fazenda: string } }) => <div data-testid="resumo-fazenda">{filtros.fazenda}</div>,
}));

import { CentralOperacoesComerciais } from '@/components/operacao-comercial/central/CentralOperacoesComerciais';

function SondaUrl() {
  const loc = useLocation();
  return <div data-testid="url">{loc.search}</div>;
}
const global = () => { seletor.fazendaAtual = { id: '__global__', nome: 'Global' }; seletor.isGlobal = true; };
const fazendaA = () => { seletor.fazendaAtual = { id: FAZ_A, nome: 'Faz. Pureza' }; seletor.isGlobal = false; };

const arvore = () => (
  <><CentralOperacoesComerciais /><SondaUrl /></>
);
/* ⚠ BrowserRouter + `history`, NAO MemoryRouter: `useFiltroUrl` le' `window.location.search` na
   hora de escrever (a guarda de igualdade do OC-URL-RAJADA-01), e o MemoryRouter nao move o
   `window.location` — toda escrita pareceria "nada mudou" e seria descartada. */
function montar(url = '/v2') {
  window.history.replaceState(null, '', url);
  return render(<BrowserRouter>{arvore()}</BrowserRouter>);
}
const visiveis = () => [OC_A, OC_B, OC_SEM].filter(id => document.querySelector(`td[title="${id}"]`));

beforeEach(() => { global(); });

describe('a Central segue o seletor lateral', () => {
  it('Global mostra todas — inclusive a OC sem fazenda', async () => {
    montar();
    await waitFor(() => expect(visiveis()).toEqual([OC_A, OC_B, OC_SEM]));
  });

  it('fazenda escolhida mostra so as OCs dela; a sem fazenda some', async () => {
    fazendaA();
    montar();
    await waitFor(() => expect(document.querySelector(`td[title="${OC_A}"]`)).not.toBeNull());
    expect(visiveis()).toEqual([OC_A]);
  });
});

describe('coluna Faz', () => {
  it('so em Global, como a Lista', async () => {
    const { unmount } = montar();
    await waitFor(() => expect(visiveis()).toHaveLength(3));
    expect(screen.getByText('Faz')).toBeTruthy();
    expect(screen.getByText('PUR')).toBeTruthy();
    unmount();

    fazendaA();
    montar();
    await waitFor(() => expect(visiveis()).toEqual([OC_A]));
    expect(screen.queryByText('Faz')).toBeNull();
    expect(screen.queryByText('PUR')).toBeNull();
  });
});

describe('resumo, PDF e Excel', () => {
  it('a fazenda do cabecalho e a do seletor, ou "todas as fazendas" em Global', async () => {
    const { unmount } = montar();
    await waitFor(() => expect(screen.getByTestId('resumo-fazenda').textContent).toBe('todas as fazendas'));
    unmount();
    fazendaA();
    montar();
    await waitFor(() => expect(screen.getByTestId('resumo-fazenda').textContent).toBe('Faz. Pureza'));
  });
});

describe('a URL', () => {
  it('link antigo com f_fazenda: ignorado (Global segue mostrando todas) e removido, sem tocar o seletor', async () => {
    montar(`/v2?f_busca=&f_fazenda=${FAZ_B}&f_tipo=venda`);
    await waitFor(() => expect(screen.getByTestId('url').textContent).not.toMatch(/f_fazenda/));
    /* O resto da URL fica — a busca sabe achar: o f_tipo continua la'. */
    expect(screen.getByTestId('url').textContent).toMatch(/f_tipo=venda/);
    await waitFor(() => expect(visiveis()).toEqual([OC_A, OC_B, OC_SEM]));
    expect(seletor.isGlobal).toBe(true);
  });

  it('trocar de fazenda no seletor volta para a pagina 1', async () => {
    const r = montar('/v2?f_pag=2');
    await waitFor(() => expect(visiveis()).toHaveLength(3));
    /* A montagem NAO zera a pagina (a regra do PR-OC-LISTA-01). */
    expect(screen.getByTestId('url').textContent).toMatch(/f_pag=2/);
    await act(async () => { fazendaA(); r.rerender(<BrowserRouter>{arvore()}</BrowserRouter>); });
    await waitFor(() => expect(visiveis()).toEqual([OC_A]));
    await waitFor(() => expect(screen.getByTestId('url').textContent).not.toMatch(/f_pag=2/));
  });
});
