/**
 * FORN-AVISO-BUSCA-01 (Gabriel 19/10/2026) — o aviso dos inativos com lançamentos de Cadastros › Fornecedores (FORN-01b: a faixa nomeia):
 * sem busca, o total do cliente; com busca, só os inativos que batem com ela (o MESMO filtro da lista, `filtroDaBusca`), e some com 0;
 * relê ao fechar a ferramenta de mesclar. Tela montada sobre banco de mentira.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const banco = vi.hoisted(() => ({
  inativosComLanc: [] as { favorecido_id: string; valor: number; financeiro_fornecedores: { nome: string } }[],
  nomes: { i1: 'Aguimar F E Cia Ltda', i2: 'Aguimar F. E. Cia Ltda', i3: 'MMM Comércio de Gas' } as Record<string, string>,
  ultimaBusca: null as { p_busca: string; p_situacao: string } | null,
}));
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (tabela: string) => {
    const estado: { ids: string[] | null; or: string | null; joinInativos: boolean } = { ids: null, or: null, joinInativos: false };
    const c: Record<string, unknown> = {};
    for (const m of ['eq', 'not', 'is', 'order', 'neq', 'limit', 'maybeSingle', 'single']) c[m] = () => c;
    c.select = (cols: string) => { if (tabela === 'financeiro_lancamentos_v2' && cols.includes('!inner')) estado.joinInativos = true; return c; };
    c.in = (_col: string, ids: string[]) => { estado.ids = ids; return c; };
    c.or = (f: string) => { estado.or = f; return c; };
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

  /* FORN-LISTA-01 — a lista de cadastros vem de `fn_fornecedor_lista` */
  const lista = (args: { p_situacao: string; p_busca?: string }, linhas: { id: string; nome: string; ativo: boolean; fundido_em_id?: string | null; fundido_em?: string | null }[]) => {
    const sit = (l: { ativo: boolean; fundido_em_id?: string | null }) => (l.fundido_em_id ? 'mesclado' : l.ativo ? 'ativo' : 'inativo');
    const termo = (args.p_busca ?? '').trim().toLowerCase();
    const casam = linhas.filter((l) => l.nome.toLowerCase().includes(termo));
    const s = casam.filter((l) => args.p_situacao === 'todos' || sit(l) === args.p_situacao.slice(0, -1));
    const dono = (id?: string | null) => linhas.find((l) => l.id === id)?.nome ?? null;
    return { data: { total: s.length, contagens: { ativos: casam.filter((l) => sit(l) === 'ativo').length, inativos: casam.filter((l) => sit(l) === 'inativo').length,
      mesclados: casam.filter((l) => sit(l) === 'mesclado').length, todos: casam.length }, documentos: s.map((l) => [l.id, null]),
      itens: s.map((l) => ({ ...l, cpf_cnpj: null, lancamentos: 0, ultimo_uso: null, situacao: sit(l), dono_nome: dono(l.fundido_em_id) })) }, error: null };
  };
  /* FORN-BUSCA-UNICA-01 — o aviso busca pela RPC `fn_fornecedor_buscar` */
  const rpc = async (fn: string, args: { p_busca: string; p_situacao: string }) => {
    if (fn === 'fn_fornecedor_lista') return lista(args, []);
    if (fn !== 'fn_fornecedor_buscar') return { data: null, error: null };
    banco.ultimaBusca = { p_busca: args.p_busca, p_situacao: args.p_situacao };
    const termo = (args.p_busca ?? '').trim().toLowerCase();
    const itens = Object.entries(banco.nomes).filter(([, nome]) => nome.toLowerCase().includes(termo)).map(([id, nome]) => ({ id, nome, ativo: false }));
    return { data: { total: itens.length, itens }, error: null };
  };
  return { supabase: { from: (t: string) => cadeia(t), rpc } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'vera', nome: 'Vera' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { FinV2FornecedoresTab } from './FinV2FornecedoresTab';

const linha = (id: string, valor: number) => ({ favorecido_id: id, valor, financeiro_fornecedores: { nome: banco.nomes[id] } });
beforeEach(() => {
  banco.inativosComLanc = [linha('i1', -100), linha('i1', -100), linha('i2', -50), linha('i3', -10)];
  banco.ultimaBusca = null;
});
const aviso = () => screen.getByTestId('aviso-inativos-com-lancamento').textContent ?? '';
async function buscar(texto: string) {
  fireEvent.change(screen.getByPlaceholderText('Buscar por razão social, nome fantasia ou CNPJ…'), { target: { value: texto } });
  await act(async () => { await new Promise((ok) => setTimeout(ok, 450)); });
}

describe('o aviso dos inativos com lançamento', () => {
  it('sem busca: a faixa NOMEIA o inativo de maior valor (quantos lançamentos, quanto) e diz quantos mais (FORN-01b)', async () => {
    render(<FinV2FornecedoresTab />);
    await waitFor(() => expect(aviso()).toBe('Aguimar F E Cia Ltda (inativo) · 2 lançamentos · R$\u00a0200,00 · e mais 2 inativos com lançamentosUnir pelo Mesclar'));
  });
  it('"Unir pelo Mesclar" abre a ferramenta JÁ com o inativo (quem fica, a pessoa escolhe)', async () => {
    const fonte = readFileSync(resolve(__dirname, 'FinV2FornecedoresTab.tsx'), 'utf8');
    expect(fonte).toContain("onClick={() => setMesclarPar({ absorver: [faixa.primeiro.id] })}>Unir pelo Mesclar</button>");
    expect(fonte).toMatch(/<MesclarFornecedoresDialog aberto clienteId=\{clienteAtual\.id\} inicial=\{mesclarPar\}/);
    render(<FinV2FornecedoresTab />);
    await waitFor(() => expect(screen.getByTestId('unir-pelo-mesclar')).toBeTruthy());
  });
  it('com busca: só os que batem; some com 0 (o lugar fica)', async () => {
    render(<FinV2FornecedoresTab />);
    await waitFor(() => expect(aviso()).toContain('e mais 2 inativos'));
    await buscar('aguimar');
    await waitFor(() => expect(aviso()).toContain('Aguimar F E Cia Ltda (inativo) · 2 lançamentos · R$\u00a0200,00 · e mais 1 inativo com lançamentos'));
    await buscar('ana ve');
    await waitFor(() => expect(aviso()).toBe(''));
    expect(screen.getByTestId('aviso-inativos-com-lancamento')).toBeTruthy();
    expect(banco.ultimaBusca).toEqual({ p_busca: 'ana ve', p_situacao: 'inativos' });
  });
  it('relê ao fechar a ferramenta de mesclar (lido da fonte: as duas portas)', () => {
    const fonte = readFileSync(resolve(__dirname, 'FinV2FornecedoresTab.tsx'), 'utf8');
    expect(fonte.match(/void load\(\); void loadInativosComLancamento\(\); \}\} \/>/g)).toHaveLength(2);
  });
  it('a lista e o aviso usam a MESMA busca (a RPC da busca única) com o texto da busca', () => {
    const fonte = readFileSync(resolve(__dirname, 'FinV2FornecedoresTab.tsx'), 'utf8');
    /* FORN-LISTA-01: a lista pela `fn_fornecedor_lista` (a busca única no banco), com o MESMO texto; o aviso pela RPC da busca */
    expect(fonte.match(/buscarFornecedoresNoBanco<[^>]+>\(clienteId, searchDebounced,/g)).toHaveLength(1);
    expect(fonte.match(/busca: searchDebounced/g)).toHaveLength(1);
    expect(fonte).not.toMatch(/\.or\(filtro\)/);
  });
});
