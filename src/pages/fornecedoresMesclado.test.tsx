/**
 * FORN-MESCLAR-02d (Gabriel 19/10/2026) — o cadastro absorvido por mesclagem viva, em Cadastros › Fornecedores: some de "Ativos"
 * (o banco o mantém inativo) e, em "Inativos" / "Todos", a situação diz "Mesclado em <nome>" no lugar de "Inativo", com a data no
 * `title`. Tela montada sobre banco de mentira; a regra da linha é `situacaoDaLinha`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const banco = vi.hoisted(() => ({
  linhas: [
    { id: 'dono', nome: 'Sintq Dono Zeta Comércio de Insumos Agropecuários', ativo: true, fundido_em_id: null, fundido_em: null },
    { id: 'abs', nome: 'Sintq Absorvido Zeta', ativo: false, fundido_em_id: 'dono', fundido_em: '2026-10-19T15:00:00Z' },
    { id: 'ina', nome: 'Sintq Inativo Zeta', ativo: false, fundido_em_id: null, fundido_em: null },
  ],
}));
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (tabela: string) => {
    const estado: { cols: string; ativo: boolean | null; ids: string[] | null } = { cols: '', ativo: null, ids: null };
    const c: Record<string, unknown> = {};
    for (const m of ['not', 'is', 'order', 'neq', 'limit', 'maybeSingle', 'single', 'or', 'range']) c[m] = () => c;
    c.select = (cols: string) => { estado.cols = cols; return c; };
    c.eq = (col: string, v: unknown) => { if (col === 'ativo') estado.ativo = v as boolean; return c; };
    c.in = (_col: string, ids: string[]) => { estado.ids = ids; return c; };
    c.then = (ok: (r: unknown) => unknown) => {
      if (tabela === 'financeiro_fornecedores' && estado.cols === '*') {
        const data = banco.linhas.filter((l) => estado.ativo === null || l.ativo === estado.ativo);
        return Promise.resolve({ data, error: null, count: data.length }).then(ok);
      }
      if (tabela === 'financeiro_fornecedores' && estado.cols === 'id, nome' && estado.ids) {
        const data = banco.linhas.filter((l) => estado.ids!.includes(l.id)).map((l) => ({ id: l.id, nome: l.nome }));
        return Promise.resolve({ data, error: null }).then(ok);
      }
      return Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    };
    return c;
  };
  return { supabase: { from: (t: string) => cadeia(t), rpc: async () => ({ data: null, error: null }) } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'teste', nome: 'Teste' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { FinV2FornecedoresTab, situacaoDaLinha } from './FinV2FornecedoresTab';

describe('situacaoDaLinha', () => {
  it('absorvido: "Mesclado em <nome>", a data dd/mm/aaaa no title', () => {
    const s = situacaoDaLinha({ ativo: false, fundido_em_id: 'dono', fundido_em: '2026-10-19T15:00:00Z' }, 'Sintq Dono');
    expect(s.rotulo).toBe('Mesclado em Sintq Dono');
    expect(s.mesclado).toBe(true);
    expect(s.title).toBe('mesclado em Sintq Dono em 19/10/2026 — desfaça a mesclagem para reativar');
  });
  it('sem mesclagem: Ativo / Inativo, como antes', () => {
    expect(situacaoDaLinha({ ativo: true }, null)).toEqual({ rotulo: 'Ativo', title: undefined, mesclado: false });
    expect(situacaoDaLinha({ ativo: false, fundido_em_id: null }, null).rotulo).toBe('Inativo');
  });
});

describe('Cadastros › Fornecedores com um absorvido', () => {
  it('em "Ativos" o absorvido não aparece', async () => {
    render(<FinV2FornecedoresTab />);
    await waitFor(() => expect(screen.getAllByText('Sintq Dono Zeta Comércio de Insumos Agropecuários').length).toBeGreaterThan(0));
    expect(screen.queryByText('Sintq Absorvido Zeta')).toBeNull();
    expect(screen.queryByTestId('situacao-mesclado')).toBeNull();
  });
  it('em "Todos" a situação diz "Mesclado em <nome>", inteira, com a data no title; o inativo comum segue "Inativo"', async () => {
    render(<FinV2FornecedoresTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(screen.getByTestId('situacao-mesclado').textContent)
      .toBe('Mesclado em Sintq Dono Zeta Comércio de Insumos Agropecuários'));
    const selo = screen.getByTestId('situacao-mesclado');
    expect(selo.getAttribute('title')).toContain('em 19/10/2026 — desfaça a mesclagem para reativar');
    expect(selo.className).not.toMatch(/truncate|line-clamp/);
    expect(screen.getAllByText('Inativo').length).toBeGreaterThan(0);
  });
});
