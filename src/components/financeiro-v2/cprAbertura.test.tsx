/**
 * P106 (Gabriel 26/10/2026) — Contas a Pagar e Receber: o PERÍODO por mês e a ABERTURA padrão, com a tela MONTADA.
 *   A1 abre SEMPRE em "Mês atual" + "Ambos" — mesmo com o instantâneo antigo da volta do contrato ("60 dias" + "A Pagar") e com um
 *      instantâneo novo ("Mês futuro" + "A Receber"): período e lado não se restauram; a visão e o ampliado, sim (como antes)
 *   A2 os três botões dão o mês inteiro (hoje 26/10/2026: set, out, nov) e as datas de/até mostram o intervalo; trocar de lado é livre
 *   A3 "30 dias" e "60 dias" não existem mais; a ordem é Mês anterior · Mês atual · Mês futuro · Escolher datas
 * O banco é um falso vazio (a abertura não depende de linha nenhuma); o dia de hoje é fixado no relógio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/* o banco falso: toda consulta encadeada termina em { data: [], error: null } */
const banco = vi.hoisted(() => {
  const vazio = { data: [], error: null, count: 0 };
  const cadeia = (): unknown => new Proxy(function () {}, {
    get: (_a, k) => (k === 'then' ? (ok: (v: unknown) => unknown) => Promise.resolve(vazio).then(ok) : cadeia()),
    apply: () => cadeia(),
  });
  return { supabase: cadeia() };
});
vi.mock('@/integrations/supabase/client', () => banco);
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: '__global__' }, fazendas: [] }) }));
vi.mock('@/hooks/useFinanceiroV2', async (original) => {
  const real = await original<Record<string, unknown>>();
  const ok = async () => {};
  const fin = { loadContas: ok, loadClassificacoes: ok, loadFornecedores: ok, loadSafras: ok, contasBancarias: [], classificacoes: [],
    fornecedores: [], safras: [], abrirView: () => banco.supabase, buscarLancamentoPorId: async () => null,
    criarLancamento: async () => true, editarLancamento: async () => true, criarFornecedor: async () => null };
  return { ...real, inscreverEmLancamentos: () => () => {}, useFinanceiroV2: () => fin };
});

import { ContasPagarReceberTab } from './ContasPagarReceberTab';
import { CHAVE_RETORNO_CPR } from '@/lib/financeiro/cprRetorno';

const montar = async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={qc}><ContasPagarReceberTab /></QueryClientProvider></MemoryRouter>);
  await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
};
const ativo = (rotulo: string) => screen.getAllByRole('button', { name: rotulo }).some((b) => b.className.includes('bg-primary'));
/* o campo de data é um input: o que a pessoa vê é o `value` dele */
const valorDe = (id: string) => { const c = screen.getByTestId(id); return c.querySelector('input')?.value ?? c.textContent; };
const datas = () => [valorDe('cpr-de'), valorDe('cpr-ate')];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 26, 7, 21));
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('P106 — período por mês e abertura padrão (tela montada)', () => {
  it('A1 abre em Mês atual + Ambos, mesmo com o instantâneo antigo ("60 dias" + "A Pagar") ou novo ("Mês futuro" + "A Receber")', async () => {
    for (const antigo of [{ atalho: '60', segmento: 'pagar' }, { atalho: 'futuro', datas: null, segmento: 'receber' }, { atalho: 'datas', datas: { de: '2026-01-01', ate: '2026-01-31' }, segmento: 'pagar' }]) {
      sessionStorage.setItem(CHAVE_RETORNO_CPR, JSON.stringify({ visao: 'lista', contaSel: null, statusLigados: ['previsto', 'programado', 'agendado'], ampliado: false, ...antigo }));
      await montar();
      expect(ativo('Mês atual')).toBe(true);
      expect(ativo('Ambos')).toBe(true);
      expect(ativo('A Pagar')).toBe(false);
      expect(ativo('A Receber')).toBe(false);
      expect(datas()).toEqual(['01/10/2026', '31/10/2026']);
      cleanup();
    }
  });

  it('A2 os três botões dão o mês inteiro e as datas mostram o intervalo; trocar de lado é livre', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    await act(async () => { await Promise.resolve(); });
    expect(ativo('Mês anterior')).toBe(true);
    expect(datas()).toEqual(['01/09/2026', '30/09/2026']);
    fireEvent.click(screen.getByRole('button', { name: 'Mês futuro' }));
    await act(async () => { await Promise.resolve(); });
    expect(datas()).toEqual(['01/11/2026', '30/11/2026']);
    fireEvent.click(screen.getByRole('button', { name: 'Mês atual' }));
    await act(async () => { await Promise.resolve(); });
    expect(datas()).toEqual(['01/10/2026', '31/10/2026']);
    fireEvent.click(screen.getByRole('button', { name: 'A Pagar' }));
    await act(async () => { await Promise.resolve(); });
    expect(ativo('A Pagar')).toBe(true);
  });

  it('A3 sem "30 dias" e "60 dias"; a ordem dos botões do período', async () => {
    await montar();
    expect(screen.queryByRole('button', { name: '30 dias' })).toBeNull();
    expect(screen.queryByRole('button', { name: '60 dias' })).toBeNull();
    const rotulos = screen.getAllByRole('button').map((b) => b.textContent);
    const i = rotulos.indexOf('Mês anterior');
    expect(rotulos.slice(i, i + 4)).toEqual(['Mês anterior', 'Mês atual', 'Mês futuro', 'Escolher datas']);
  });
});
