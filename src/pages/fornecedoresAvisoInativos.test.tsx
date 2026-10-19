/**
 * FORN-AVISO-BUSCA-01 (Gabriel 19/10/2026) — o aviso "N fornecedores inativos ainda têm lançamentos" de Cadastros › Fornecedores:
 * sem busca, o total do cliente; com busca, só os inativos que batem com ela (o MESMO filtro da lista, `filtroDaBusca`), e some com 0;
 * relê ao fechar a ferramenta de mesclar. Tela montada sobre banco de mentira.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const banco = vi.hoisted(() => ({
  inativosComLanc: [{ favorecido_id: 'i1' }, { favorecido_id: 'i1' }, { favorecido_id: 'i2' }, { favorecido_id: 'i3' }],
  nomes: { i1: 'Aguimar F E Cia Ltda', i2: 'Aguimar F. E. Cia Ltda', i3: 'MMM Comércio de Gas' } as Record<string, string>,
  ultimoOr: null as string | null,
}));
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (tabela: string) => {
    const estado: { ids: string[] | null; or: string | null; joinInativos: boolean } = { ids: null, or: null, joinInativos: false };
    const c: Record<string, unknown> = {};
    for (const m of ['eq', 'not', 'is', 'order', 'neq', 'limit', 'maybeSingle', 'single']) c[m] = () => c;
    c.select = (cols: string) => { if (tabela === 'financeiro_lancamentos_v2' && cols.includes('!inner')) estado.joinInativos = true; return c; };
    c.in = (_col: string, ids: string[]) => { estado.ids = ids; return c; };
    c.or = (f: string) => { estado.or = f; banco.ultimoOr = f; return c; };
    c.range = () => c;
    c.then = (ok: (r: unknown) => unknown) => {
      if (estado.joinInativos) return Promise.resolve({ data: banco.inativosComLanc, error: null, count: banco.inativosComLanc.length }).then(ok);
      if (tabela === 'financeiro_fornecedores' && estado.ids) {
        const termo = (estado.or ?? '').match(/nome\.ilike\.%([^%]+)%/)?.[1]?.toLowerCase() ?? '';
        const data = estado.ids.filter((id) => (banco.nomes[id] ?? '').toLowerCase().includes(termo)).map((id) => ({ id }));
        return Promise.resolve({ data, error: null }).then(ok);
      }
      return Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    };
    return c;
  };
  return { supabase: { from: (t: string) => cadeia(t), rpc: async () => ({ data: null, error: null }) } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'vera', nome: 'Vera' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { FinV2FornecedoresTab, filtroDaBusca } from './FinV2FornecedoresTab';

beforeEach(() => {
  banco.inativosComLanc = [{ favorecido_id: 'i1' }, { favorecido_id: 'i1' }, { favorecido_id: 'i2' }, { favorecido_id: 'i3' }];
  banco.ultimoOr = null;
});
const aviso = () => screen.getByTestId('aviso-inativos-com-lancamento').textContent ?? '';
async function buscar(texto: string) {
  fireEvent.change(screen.getByPlaceholderText('Buscar fornecedor...'), { target: { value: texto } });
  await act(async () => { await new Promise((ok) => setTimeout(ok, 450)); });
}

describe('o aviso dos inativos com lançamento', () => {
  it('sem busca: o total do cliente (fornecedores distintos)', async () => {
    render(<FinV2FornecedoresTab />);
    await waitFor(() => expect(aviso()).toContain('3 fornecedores inativos ainda têm lançamentos'));
  });
  it('com busca: só os que batem; some com 0 (o lugar fica)', async () => {
    render(<FinV2FornecedoresTab />);
    await waitFor(() => expect(aviso()).toContain('3 fornecedores'));
    await buscar('aguimar');
    await waitFor(() => expect(aviso()).toContain('2 fornecedores inativos'));
    await buscar('ana ve');
    await waitFor(() => expect(aviso()).toBe(''));
    expect(screen.getByTestId('aviso-inativos-com-lancamento')).toBeTruthy();
    expect(banco.ultimoOr).toBe(filtroDaBusca('ana ve'));
  });
  it('relê ao fechar a ferramenta de mesclar (lido da fonte: as duas portas)', () => {
    const fonte = readFileSync(resolve(__dirname, 'FinV2FornecedoresTab.tsx'), 'utf8');
    expect(fonte.match(/void load\(\); void loadInativosComLancamento\(\); \}\} \/>/g)).toHaveLength(2);
  });
  it('a lista e o aviso usam o MESMO filtro da busca', () => {
    expect(filtroDaBusca('  ')).toBeNull();
    expect(filtroDaBusca('linea')).toContain('nome.ilike.%linea%');
    expect(filtroDaBusca('21.018.928')).toContain('cpf_cnpj.ilike.%2%1%0%1%8%9%2%8%');
    const fonte = readFileSync(resolve(__dirname, 'FinV2FornecedoresTab.tsx'), 'utf8');
    expect(fonte.match(/filtroDaBusca\(searchDebounced\)/g)).toHaveLength(2);
  });
});
