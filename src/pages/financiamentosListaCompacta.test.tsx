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
  { id: 'f1', descricao: 'Recuperação de Solo', numero_contrato: 'PR-78.192', data_contrato: '2024-03-10', natureza: 'parcelamento',
    tipo_financiamento: 'agricultura', credor_id: 'c1', valor_total: 1000, total_parcelas: 7, status: 'ativo', created_at: '2024-03-10',
    financeiro_fornecedores: { nome: 'BRDE' } },
  { id: 'f2', descricao: 'Armazem', numero_contrato: null, data_contrato: '2024-01-05', natureza: 'parcelamento',
    tipo_financiamento: 'pecuaria', credor_id: 'c1', valor_total: 2000, total_parcelas: 1, status: 'ativo', created_at: '2024-01-05',
    financeiro_fornecedores: { nome: 'BRDE' } },
  { id: 'f3', descricao: 'Trator', numero_contrato: 'Atualizar', data_contrato: '2024-02-01', natureza: 'parcelamento',
    tipo_financiamento: 'agricultura', credor_id: 'c2', valor_total: 3000, total_parcelas: 3, status: 'ativo', created_at: '2024-02-01',
    financeiro_fornecedores: { nome: 'Concessionaria' } },
  { id: 'f4', descricao: 'Custeio BB', numero_contrato: 'C_4608772', data_contrato: '2025-05-02', natureza: 'financiamento',
    tipo_financiamento: 'pecuaria', credor_id: 'c3', valor_total: 9000, total_parcelas: 4, status: 'ativo', created_at: '2025-05-02',
    financeiro_fornecedores: { nome: 'Banco do Brasil' } },
];

vi.mock('@/integrations/supabase/client', () => {
  const q: any = { select: () => q, eq: () => q, is: () => q, order: async () => ({ data: FINS, error: null }) };
  return { supabase: { from: () => q, rpc: async () => ({ data: {}, error: null }) } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-1' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ inscreverEmLancamentos: () => () => {} }));
vi.mock('@/hooks/useSituacaoDoContrato', () => ({ lerSituacaoEmLoteDoBanco: async () => new Map() }));
vi.mock('@/components/financiamentos/ObrigacaoDialog', () => ({ ObrigacaoDialog: () => null }));

import FinanciamentosListaPage from './FinanciamentosListaPage';

/* FIN-FINANC-28-P3 — esta lista e' agora a da aba "Compras parceladas" (so' parcelamentos); a pagina abre em
   "Financiamentos", entao o teste troca de aba antes de olhar a tabela. */
function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const r = render(<QueryClientProvider client={qc}><FinanciamentosListaPage /></QueryClientProvider>);
  fireEvent.click(screen.getByText('Compras parceladas'));
  return r;
}

const ordemDasDatas = () => screen.getAllByTestId('cel-data').map((c) => c.textContent);

describe('FIN-LISTA-COMPACTA-01 / FIN-FINANC-28-P3-FIX2 — aba Compras parceladas', () => {
  beforeEach(() => { cleanup(); sessionStorage.clear(); });

  /* FIX2 (Gabriel, 17/10): Data · Descrição · Credor · Valor da compra · A pagar · Parcela · Próxima · Situação · Pagas — sem a
     pílula de Tipo e sem o Nº contrato (que vai no `title` da Descrição). O teste prende o CONTEÚDO, não as classes. */
  it('colunas na ordem da casa (data primeiro), sem Tipo e sem Nº contrato', async () => {
    montar();
    await screen.findAllByTestId('cel-data');
    const cab = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
    expect(cab).toEqual(['Data', 'Descrição', 'Credor', 'Valor da compra', 'A pagar', 'Parcela', 'Próxima', 'Situação', 'Pagas']);
    expect(screen.queryByTestId('cel-numero-contrato')).toBeNull();
  });

  it('o nº do contrato mora no title da Descrição; o sufixo PEC / AGR ficou', async () => {
    montar();
    const descs = await screen.findAllByTestId('cel-descricao');
    const solo = descs.find((d) => d.textContent?.includes('Recuperação de Solo'))!;
    expect(solo.textContent).not.toContain('PR-78.192');
    expect(within(solo).getByText('· AGR')).toBeTruthy();
    expect(solo.getAttribute('title')).toBe('Recuperação de Solo · AGR · nº PR-78.192');
    expect(descs.find((d) => d.textContent?.includes('Armazem'))!.getAttribute('title')).toBe('Armazem · PEC');
  });

  it('situação e pagas em colunas próprias; ordenar por Data nos dois sentidos', async () => {
    montar();
    await screen.findAllByTestId('cel-status');
    expect(screen.getAllByTestId('cel-pagas').map((c) => c.textContent)).toContain('0/7');
    expect(ordemDasDatas()).toEqual(['05/01/24', '01/02/24', '10/03/24']);
    fireEvent.click(screen.getByText('Data'));
    expect(ordemDasDatas()).toEqual(['10/03/24', '01/02/24', '05/01/24']);
  });

  it('fonte: colgroup em px, Descrição e Credor sem largura (dividem a sobra), fixas = 568', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/pages/FinanciamentosListaPage.tsx'), 'utf8');
    expect(src).not.toMatch(/className="[^"]*max-w-5xl/);
    const cg = src.slice(src.indexOf('<colgroup>'), src.indexOf('</colgroup>'));
    const cols = cg.match(/<col\b[^>]*\/>/g) ?? [];
    expect(cols).toHaveLength(9);
    expect(cols.filter((c) => !/width:/.test(c))).toHaveLength(2);
    expect(cols.map((c) => Number(c.match(/width: (\d+)/)?.[1] ?? 0)).reduce((a, b) => a + b, 0)).toBe(568);
  });

  it('linhas: valores da lista, só parcelamentos', async () => {
    montar();
    await screen.findAllByTestId('cel-data');
    const linhas = screen.getAllByRole('link').map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.replace(/\u00a0/g, ' ').trim()));
    expect(linhas).toEqual([
      ['05/01/24', 'Armazem· PEC', 'BRDE', 'R$ 2.000,00', 'R$ 0,00', '—', '—', 'ativo', '0/1'],
      ['01/02/24', 'Trator· AGR', 'Concessionaria', 'R$ 3.000,00', 'R$ 0,00', '—', '—', 'ativo', '0/3'],
      ['10/03/24', 'Recuperação de Solo· AGR', 'BRDE', 'R$ 1.000,00', 'R$ 0,00', '—', '—', 'ativo', '0/7'],
    ]);
    expect(screen.queryByText('Custeio BB')).toBeNull();
  });

  it('cards: Total das compras · Já pago · A pagar · Vencidas (sem Principal e sem Juros); A pagar = parcelas em aberto, sem marca (FIX3)', async () => {
    montar();
    await screen.findAllByTestId('cel-data');
    const cards = screen.getByTestId('cards-compras');
    expect(Array.from(cards.children).map((c) => c.firstElementChild?.textContent)).toEqual(['Total das compras', 'Já pago', 'A pagar', 'Vencidas']);
    expect(cards.textContent).not.toMatch(/Juros|Principal/);
    // sem leitura do lote no teste: em aberto 0 e Total − Já pago 6.000,00. O card mostra AS PARCELAS EM ABERTO (FIX3) e a
    // diferença vai SÓ no `title`: nem ponto âmbar nem sublinhado
    const aPagar = screen.getByTestId('card-A pagar');
    expect(aPagar.querySelector('button')?.textContent?.replace(/\s/g, ' ')).toBe('R$ 0,00');
    expect(aPagar.getAttribute('title')).toContain('diferença');
    expect(aPagar.getAttribute('title')?.replace(/\s/g, ' ')).toContain('Total − Já pago = R$ 6.000,00');
    expect(screen.queryByTestId('a-pagar-diverge')).toBeNull();
    expect(aPagar.querySelector('button')?.className).not.toContain('underline');
  });

  it('a aba Financiamentos (a que abre) traz o financiamento, e o filtro de busca vale nela', async () => {
    cleanup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><FinanciamentosListaPage /></QueryClientProvider>);
    await screen.findByText('Custeio BB');
    expect(screen.queryByText('Trator')).toBeNull();
    expect(screen.getByTestId('filtros-financiamentos')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Buscar descrição...'), { target: { value: 'nada disso' } });
    expect(screen.queryByText('Custeio BB')).toBeNull();
  });
});

describe('FIN-FINANC-28-P3-FIX3 — voltar do contrato reabre a aba de onde saiu', () => {
  beforeEach(() => { cleanup(); sessionStorage.clear(); });

  it('abrir uma compra em "Compras parceladas", voltar (remontar) e a lista continua em Compras parceladas, com os filtros', async () => {
    const onDetalhe = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><FinanciamentosListaPage onDetalhe={onDetalhe} /></QueryClientProvider>);
    fireEvent.click(screen.getByText('Compras parceladas'));
    const linhas = await screen.findAllByRole('link');
    fireEvent.click(linhas[0]);
    expect(onDetalhe).toHaveBeenCalledWith('f2');
    const salvo = JSON.parse(sessionStorage.getItem('financiamentos_lista_filtros_cli-1') ?? '{}');
    expect(salvo.aba).toBe('parcelas');
    expect(salvo.status).toBe('ativo');
    cleanup();
    // a volta: a página remonta (o detalhe a desmontou) e lê o que foi guardado
    render(<QueryClientProvider client={new QueryClient()}><FinanciamentosListaPage onDetalhe={onDetalhe} /></QueryClientProvider>);
    expect(await screen.findByTestId('cards-compras')).toBeTruthy();
    expect((await screen.findAllByTestId('cel-data')).length).toBe(3);
  });

  it('sem nada guardado a página abre em "Financiamentos" (o detector sabe achar a aba)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><FinanciamentosListaPage /></QueryClientProvider>);
    await screen.findByText('Custeio BB');
    expect(screen.queryByTestId('cards-compras')).toBeNull();
  });
});

describe('FIN-FINANC-28-P3-FIX3 — o filtro Credor é o seletor da casa com busca', () => {
  beforeEach(() => { cleanup(); sessionStorage.clear(); });

  it('digitar parte do nome filtra a lista de credores (só os dos contratos) e escolher filtra os contratos', async () => {
    montar();
    await screen.findAllByTestId('cel-data');
    const filtro = screen.getByTestId('filtro-credor');
    expect(filtro.querySelector('select')).toBeNull();
    fireEvent.click(within(filtro).getByRole('combobox'));
    /* FORN-BUSCA-UNICA-01 — o seletor padrão (a busca única): o vazio "Todos credores" e as opções dos credores dos contratos */
    const busca = await screen.findByPlaceholderText('Buscar por nome ou CNPJ/CPF...');
    fireEvent.change(busca, { target: { value: 'conc' } });
    expect(within(screen.getByTestId('favorecido-lista')).getByText('Todos credores')).toBeTruthy();
    const opcoes = screen.getAllByTestId('favorecido-opcao');
    expect(opcoes.map((o) => o.querySelector('span')?.textContent)).toEqual(['Concessionaria']);
    fireEvent.click(opcoes[0]);
    expect(screen.getAllByTestId('cel-data').map((c) => c.textContent)).toEqual(['01/02/24']);
    expect(filtro.getAttribute('title')).toBe('Concessionaria');
    expect(filtro.className).toContain('w-40');
  });
});

describe('FIN-FINANC-28-P3-FIX4 — filtros: trocar de aba zera, "Limpar filtros" fixo, a volta do detalhe mantém', () => {
  beforeEach(() => { cleanup(); sessionStorage.clear(); });

  const escolherCredor = async (nome: string) => {
    const filtro = screen.getByTestId('filtro-credor');
    fireEvent.click(within(filtro).getByRole('combobox'));
    const busca = await screen.findByPlaceholderText('Buscar por nome ou CNPJ/CPF...');
    fireEvent.change(busca, { target: { value: nome.slice(0, 4) } });
    fireEvent.click(screen.getAllByTestId('favorecido-opcao').find((b) => b.querySelector('span')?.textContent === nome)!);
  };

  it('(a) trocar de aba zera o credor e a busca (e o Limpar volta a ficar apagado)', async () => {
    montar();
    await screen.findAllByTestId('cel-data');
    fireEvent.change(screen.getByPlaceholderText('Buscar descrição...'), { target: { value: 'Trator' } });
    await escolherCredor('Concessionaria');
    expect(screen.getByTestId('filtro-credor').getAttribute('title')).toBe('Concessionaria');
    expect((screen.getByTestId('limpar-filtros') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByText('Financiamentos'));
    expect(screen.getByTestId('filtro-credor').getAttribute('title')).toBe('Todos credores');
    expect((screen.getByPlaceholderText('Buscar descrição...') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('limpar-filtros') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Compras parceladas'));
    expect((await screen.findAllByTestId('cel-data')).length).toBe(3);
  });

  it('(b) "Limpar filtros" existe sempre (apagado sem filtro), mesma largura, e zera tudo da aba', async () => {
    montar();
    await screen.findAllByTestId('cel-data');
    const botao = screen.getByTestId('limpar-filtros') as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.className).toContain('w-[92px]');
    await escolherCredor('BRDE');
    fireEvent.change(screen.getByPlaceholderText('Nº contrato...'), { target: { value: 'PR' } });
    expect(screen.getAllByTestId('cel-data').length).toBe(1);
    expect(screen.getByTestId('limpar-filtros')).toBe(botao);
    expect(botao.disabled).toBe(false);
    fireEvent.click(botao);
    expect(screen.getAllByTestId('cel-data').length).toBe(3);
    expect(screen.getByTestId('filtro-credor').getAttribute('title')).toBe('Todos credores');
    expect(botao.disabled).toBe(true);
  });

  it('(d) FIN-FINANC-28 passo 4c — Vencimento "de": só os contratos com parcela no intervalo (sem lote, nenhum); Limpar zera', async () => {
    montar();
    await screen.findAllByTestId('cel-data');
    /* os dois "de" da fileira: o 1º é o do Contrato, o 2º o do Vencimento (a ordem da tela) */
    const vencDe = screen.getAllByPlaceholderText('de')[1] as HTMLInputElement;
    fireEvent.change(vencDe, { target: { value: '01/11/2026' } });
    fireEvent.blur(vencDe);
    expect(screen.queryAllByTestId('cel-data').length).toBe(0);
    const botao = screen.getByTestId('limpar-filtros') as HTMLButtonElement;
    expect(botao.disabled).toBe(false);
    fireEvent.click(botao);
    expect(screen.getAllByTestId('cel-data').length).toBe(3);
    expect((screen.getAllByPlaceholderText('de')[1] as HTMLInputElement).value).toBe('');
  });

  it('(c) a volta do detalhe mantém os filtros (só a troca de aba zera)', async () => {
    const onDetalhe = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><FinanciamentosListaPage onDetalhe={onDetalhe} /></QueryClientProvider>);
    fireEvent.click(screen.getByText('Compras parceladas'));
    await screen.findAllByTestId('cel-data');
    await escolherCredor('BRDE');
    fireEvent.click(screen.getAllByRole('link')[0]);
    cleanup();
    render(<QueryClientProvider client={new QueryClient()}><FinanciamentosListaPage onDetalhe={onDetalhe} /></QueryClientProvider>);
    await screen.findByTestId('cards-compras');
    /* FORN-BUSCA-UNICA-01 — o valor guardado é o id; o nome vem da lista carregada */
    expect((await screen.findAllByTestId('cel-data')).length).toBe(2);
    expect(screen.getByTestId('filtro-credor').getAttribute('title')).toBe('BRDE');
  });
});
