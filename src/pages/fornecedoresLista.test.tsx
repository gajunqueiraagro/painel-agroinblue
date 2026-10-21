/**
 * FORN-LISTA-01 — a lista de Cadastros › Fornecedores (aba Cadastro): (1) o leitor sem cast e as frases; (2) a tela pede ao banco a
 * ordem, a página e o "Por página" (lembrado por usuário), e com "Sem CPF/CNPJ" manda os ids que o validador único escolheu;
 * (3) "sem documento" em cinza (o "vazio" laranja saiu), "—" no vazio, data dd/mm/aaaa; (4) abaixo de 900px a Cidade/UF sai.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const banco = vi.hoisted(() => ({ chamadas: [] as Record<string, unknown>[] }));
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = () => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'not', 'is', 'order', 'neq', 'limit', 'in', 'or', 'range', 'maybeSingle', 'single']) c[m] = () => c;
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return c;
  };
  const linhas = [
    { id: 'a', nome: 'Sintq Alfa Comércio Ltda', nome_fantasia: 'Alfa', cpf_cnpj: '54.442.418/0001-88', municipio: 'Campo Grande', uf: 'MS', lancamentos: 12, ultimo_uso: '2026-10-05', situacao: 'ativo', ativo: true },
    { id: 'b', nome: 'Sintq Beta', nome_fantasia: null, cpf_cnpj: null, municipio: null, uf: null, lancamentos: 0, ultimo_uso: null, situacao: 'ativo', ativo: true },
    { id: 'c', nome: 'Sintq Gama', nome_fantasia: null, cpf_cnpj: '123', municipio: null, uf: 'MS', lancamentos: 3, ultimo_uso: '2026-01-31', situacao: 'ativo', ativo: true },
  ];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn !== 'fn_fornecedor_lista') return { data: null, error: null };
    banco.chamadas.push(args);
    const ids = args.p_ids as string[] | null;
    const s = ids ? linhas.filter((l) => ids.includes(l.id)) : linhas;
    return { data: { total: s.length, contagens: { ativos: 3, inativos: 2, mesclados: 1, todos: 6 },
      documentos: linhas.map((l) => [l.id, l.cpf_cnpj]), itens: s.slice(0, Number(args.p_limite)) }, error: null };
  };
  return { supabase: { from: () => cadeia(), rpc, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Teste' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { FinV2FornecedoresTab } from './FinV2FornecedoresTab';
import { lerPaginaDaLista, textoDoIntervalo, paginasDe, dataDoUltimoUso, cidadeUf, idsSemDocumento } from '@/lib/fornecedores/listaDeFornecedores';

const guardado = new Map<string, string>();
Object.defineProperty(window, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => { guardado.set(k, v); }, clear: () => guardado.clear() } });
beforeEach(() => { banco.chamadas.length = 0; window.localStorage.clear(); Object.defineProperty(window, 'innerWidth', { value: 1300, configurable: true }); });
const ultima = () => banco.chamadas[banco.chamadas.length - 1];

describe('FORN-LISTA-01 — o leitor e as frases', () => {
  it('peça torta = nulo; a boa é lida inteira', () => {
    expect(lerPaginaDaLista({ total: 1, contagens: { ativos: 1 }, documentos: [], itens: [] })).toBeNull();
    expect(lerPaginaDaLista({ total: 1, contagens: { ativos: 1, inativos: 0, mesclados: 0, todos: 1 }, documentos: [], itens: [{ id: 'x', nome: 'X', lancamentos: 1, situacao: 'outra' }] })).toBeNull();
    const v = lerPaginaDaLista({ total: 1, contagens: { ativos: 1, inativos: 0, mesclados: 0, todos: 1 }, documentos: [['x', null]],
      itens: [{ id: 'x', nome: 'X', lancamentos: 2, situacao: 'mesclado', dono_nome: 'Y' }] });
    expect(v?.itens[0]).toMatchObject({ id: 'x', situacao: 'mesclado', dono_nome: 'Y', lancamentos: 2 });
  });
  it('intervalo, páginas, data dd/mm/aaaa, cidade/UF e o "sem CPF/CNPJ" pelo validador único', () => {
    expect(textoDoIntervalo(355, 1, 100)).toBe('Mostrando 1–100 de 355');
    expect(textoDoIntervalo(355, 4, 100)).toBe('Mostrando 301–355 de 355');
    expect(textoDoIntervalo(0, 1, 100)).toBe('Nenhum cadastro');
    expect(paginasDe(355, 100)).toBe(4);
    expect(dataDoUltimoUso('2026-10-05')).toBe('05/10/2026');
    expect(dataDoUltimoUso(null)).toBeNull();
    expect(cidadeUf('Camapuã', 'MS')).toBe('Camapuã/MS');
    expect(cidadeUf(null, null)).toBeNull();
    expect(idsSemDocumento([{ id: 'a', cpfCnpj: '54.442.418/0001-88' }, { id: 'b', cpfCnpj: null }, { id: 'c', cpfCnpj: '123' }])).toEqual(['b', 'c']);
  });
});

describe('FORN-LISTA-01 — a tela', () => {
  it('padrão: Razão social A-Z, 100 por página, contagens nos filtros, "sem documento" cinza, "—" e data cheia', async () => {
    render(<FinV2FornecedoresTab />);
    await screen.findByText('Sintq Alfa Comércio Ltda');
    expect(ultima()).toMatchObject({ p_ordem: 'razao_social', p_desc: false, p_limite: 100, p_offset: 0, p_situacao: 'ativos', p_ids: null });
    expect(screen.getByTestId('fornecedores-contador').textContent).toBe('3 cadastros ativos');
    expect(screen.getByRole('button', { name: 'Mesclados 1' })).toBeTruthy();
    expect(screen.getByTestId('filtro-sem-documento').textContent).toBe('Sem CPF/CNPJ 2');
    const beta = screen.getByText('Sintq Beta').closest('tr') as HTMLElement;
    expect(within(beta).getByTestId('doc-sem-documento').className).toContain('text-muted-foreground');
    expect(within(beta).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId('doc-vazio')).toBeNull();
    expect(screen.getByText('05/10/2026')).toBeTruthy();
    expect(screen.getByTestId('intervalo-fornecedores').textContent).toBe('Mostrando 1–3 de 3');
  });
  it('clicar no cabeçalho ordena (de novo inverte); "Por página" pede ao banco e fica lembrado por usuário', async () => {
    render(<FinV2FornecedoresTab />);
    await screen.findByText('Sintq Alfa Comércio Ltda');
    fireEvent.click(screen.getByTestId('ordem-lancamentos'));
    await waitFor(() => expect(ultima()).toMatchObject({ p_ordem: 'lancamentos', p_desc: false }));
    fireEvent.click(screen.getByTestId('ordem-lancamentos'));
    await waitFor(() => expect(ultima()).toMatchObject({ p_ordem: 'lancamentos', p_desc: true }));
    fireEvent.click(screen.getByRole('button', { name: '200' }));
    await waitFor(() => expect(ultima()).toMatchObject({ p_limite: 200, p_offset: 0 }));
    expect(window.localStorage.getItem('forn-lista-por-pagina:u1')).toBe('200');
  });
  it('"Sem CPF/CNPJ" manda ao banco só os ids que o validador único escolheu', async () => {
    render(<FinV2FornecedoresTab />);
    await screen.findByText('Sintq Alfa Comércio Ltda');
    fireEvent.click(screen.getByTestId('filtro-sem-documento'));
    await waitFor(() => expect(ultima()).toMatchObject({ p_ids: ['b', 'c'] }));
    await waitFor(() => expect(screen.queryByText('Sintq Alfa Comércio Ltda')).toBeNull());
  });
  it('abaixo de 900px a Cidade/UF sai', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 820, configurable: true });
    render(<FinV2FornecedoresTab />);
    await screen.findByText('Sintq Alfa Comércio Ltda');
    expect(screen.queryByTestId('ordem-cidade')).toBeNull();
    expect(screen.queryByText('Campo Grande/MS')).toBeNull();
  });
  it('nada corta com "…" na lista (lido da fonte)', () => {
    const fonte = readFileSync(resolve(__dirname, 'FinV2FornecedoresTab.tsx'), 'utf8');
    expect(fonte).not.toMatch(/\btruncate\b|text-ellipsis|line-clamp/);
    expect(fonte).toContain("placeholder=\"Buscar por razão social, nome fantasia ou CNPJ…\"");
  });
});
