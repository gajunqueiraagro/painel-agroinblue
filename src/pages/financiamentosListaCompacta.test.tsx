/**
 * FIN-LISTA-COMPACTA-01 — lista de Parcelamentos e Financiamentos: coluna "Nº contrato" propria, o numero fora da
 * Descricao (o sufixo PEC / AGR fica), "Contratado" no cabecalho, status com a fracao inteira, sem a trava de largura
 * e ordenacao pelo numero do contrato (nulo como texto vazio).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FINS = [
  { id: 'f1', descricao: 'Recuperação de Solo', numero_contrato: 'PR-78.192', data_contrato: '2024-03-10', natureza: 'financiamento',
    tipo_financiamento: 'agricultura', credor_id: 'c1', valor_total: 1000, total_parcelas: 7, status: 'ativo', created_at: '2024-03-10',
    financeiro_fornecedores: { nome: 'BRDE' } },
  { id: 'f2', descricao: 'Armazem', numero_contrato: null, data_contrato: '2024-01-05', natureza: 'financiamento',
    tipo_financiamento: 'pecuaria', credor_id: 'c1', valor_total: 2000, total_parcelas: 1, status: 'ativo', created_at: '2024-01-05',
    financeiro_fornecedores: { nome: 'BRDE' } },
  { id: 'f3', descricao: 'Trator', numero_contrato: 'Atualizar', data_contrato: '2024-02-01', natureza: 'parcelamento',
    tipo_financiamento: 'agricultura', credor_id: 'c2', valor_total: 3000, total_parcelas: 3, status: 'ativo', created_at: '2024-02-01',
    financeiro_fornecedores: { nome: 'Concessionaria' } },
];

vi.mock('@/integrations/supabase/client', () => {
  const q: any = { select: () => q, eq: () => q, order: async () => ({ data: FINS, error: null }) };
  return { supabase: { from: () => q, rpc: async () => ({ data: {}, error: null }) } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-1' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ inscreverEmLancamentos: () => () => {} }));
vi.mock('@/hooks/useSituacaoDoContrato', () => ({ lerSituacaoEmLoteDoBanco: async () => new Map() }));
vi.mock('@/components/financiamentos/ObrigacaoDialog', () => ({ ObrigacaoDialog: () => null }));

import FinanciamentosListaPage from './FinanciamentosListaPage';

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><FinanciamentosListaPage /></QueryClientProvider>);
}

const ordemDosNumeros = () => screen.getAllByTestId('cel-numero-contrato').map((c) => c.textContent);

describe('FIN-LISTA-COMPACTA-01', () => {
  beforeEach(() => { cleanup(); sessionStorage.clear(); });

  it('coluna Nº contrato logo depois da Descricao, com o numero como esta gravado', async () => {
    montar();
    await screen.findAllByTestId('cel-numero-contrato');
    const cab = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
    expect(cab.slice(0, 4)).toEqual(['Tipo', 'Descrição', 'Nº contrato', 'Credor']);
    expect(cab).toContain('Contratado');
    expect(cab).not.toContain('Contratado em');
    expect(ordemDosNumeros()).toEqual(['', 'Atualizar', 'PR-78.192']);
    const cel = screen.getAllByTestId('cel-numero-contrato')[2];
    expect(cel.className).toContain('whitespace-nowrap');
    expect(cel.className).toContain('text-[9px]');
    expect(cel.className).toContain('text-zinc-600');
  });

  it('o numero saiu da Descricao e o sufixo PEC / AGR ficou', async () => {
    montar();
    const descs = await screen.findAllByTestId('cel-descricao');
    const solo = descs.find((d) => d.textContent?.includes('Recuperação de Solo'))!;
    expect(solo.textContent).not.toContain('PR-78.192');
    expect(within(solo).getByText('· AGR')).toBeTruthy();
    expect(solo.getAttribute('title')).toBe('Recuperação de Solo · AGR');
    expect(descs.find((d) => d.textContent?.includes('Armazem'))!.textContent).toContain('· PEC');
  });

  it('status com a fracao, sem corte; ordenar por Nº contrato funciona nos dois sentidos', async () => {
    montar();
    const st = await screen.findAllByTestId('cel-status');
    expect(st[0].className).toContain('whitespace-nowrap');
    expect(st[0].className).not.toContain('truncate');
    expect(st.map((s) => s.textContent)).toContain('ativo0/7');
    fireEvent.click(screen.getByText('Nº contrato'));
    expect(ordemDosNumeros()).toEqual(['', 'Atualizar', 'PR-78.192']);
    fireEvent.click(screen.getByText('Nº contrato'));
    expect(ordemDosNumeros()).toEqual(['PR-78.192', 'Atualizar', '']);
  });

  it('fonte: sem a trava max-w-5xl, colgroup em px e so a Descricao sem largura', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/pages/FinanciamentosListaPage.tsx'), 'utf8');
    expect(src).not.toMatch(/className="[^"]*max-w-5xl/);
    const cg = src.slice(src.indexOf('<colgroup>'), src.indexOf('</colgroup>'));
    const cols = cg.match(/<col\b[^>]*\/>/g) ?? [];
    expect(cols).toHaveLength(11);
    expect(cols.filter((c) => !/width:/.test(c))).toHaveLength(1);
    expect(cols.map((c) => Number(c.match(/width: (\d+)/)?.[1] ?? 0)).reduce((a, b) => a + b, 0)).toBe(786);
  });
});
