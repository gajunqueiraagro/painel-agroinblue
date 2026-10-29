/**
 * P172 — a tela do Plano de Contas (Cadastros), com o banco MOCKADO. O que se prende:
 *   · só o admin AGROinBLUE vê as ações (criar, renomear, inativar, reativar e o link dos Dividendos); o cliente vê só a leitura;
 *   · criar e renomear chamam a função do P171 SIMULANDO antes (a prévia) e só gravam no "Confirmar"; a recusa fica escrita;
 *   · "Mostrar inativos" funciona: as 6 contas globais inativas do proto (os nomes reais, medidos em 29/10) aparecem com ele.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface Conta {
  id: string; cliente_id: string | null; tipo_operacao: string; macro_custo: string; grupo_custo: string | null; centro_custo: string;
  subcentro: string | null; escopo_negocio: string; ativo: boolean; ordem_exibicao: number; compoe_dre: boolean;
}
const estado = vi.hoisted(() => ({
  admin: true,
  plano: [] as Conta[],
  dividendos: [] as { id: string; cliente_id: string; nome: string; ativo: boolean; ordem_exibicao: number }[],
  leituras: [] as { tabela: string; passos: unknown[][] }[],
  rpc: vi.fn(),
  notificar: vi.fn(),
  toastOk: vi.fn(),
  toastErro: vi.fn(),
}));

vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente Teste' }, isAdmin: estado.admin }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: (...a: unknown[]) => estado.notificar(...a) }));
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => estado.toastOk(...a), error: (...a: unknown[]) => estado.toastErro(...a) } }));
vi.mock('@/integrations/supabase/client', () => {
  const tabela = (nome: string) => {
    const leitura = { tabela: nome, passos: [] as unknown[][] };
    estado.leituras.push(leitura);
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'or', 'order']) q[m] = (...a: unknown[]) => { leitura.passos.push([m, ...a]); return q; };
    q.then = (ok: (v: { data: unknown; error: null }) => unknown) => {
      /* o banco de mentira respeita o filtro de ativo, como o de verdade */
      const soAtivas = leitura.passos.some(p => p[0] === 'eq' && p[1] === 'ativo' && p[2] === true);
      const linhas = nome === 'financeiro_plano_contas' ? estado.plano : nome === 'financeiro_dividendos' ? estado.dividendos : [];
      return Promise.resolve(ok({ data: soAtivas ? linhas.filter(l => l.ativo) : linhas, error: null }));
    };
    return q;
  };
  return { supabase: { from: tabela, rpc: (...a: unknown[]) => estado.rpc(...a) } };
});

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

import { FinV2PlanoContasTab } from '@/pages/FinV2PlanoContasTab';
import { loadContasDoPlanoDoCliente } from '@/lib/financeiro/planoContasBuilder';
import { lerRespostaDoSubcentro, moldeDaConta } from '@/lib/financeiro/subcentroDoCliente';

const conta = (id: string, sub: string, o: Partial<Conta> = {}): Conta => ({
  id, cliente_id: null, tipo_operacao: '2-Saídas', macro_custo: 'Saída Financeira', grupo_custo: 'Outras Saídas',
  centro_custo: 'Movimentações Financeiras', subcentro: sub, escopo_negocio: 'administrativo', ativo: true, ordem_exibicao: 16020,
  compoe_dre: false, ...o,
});
/* as 6 globais inativas do proto (29/10), com a classificação de lá */
const INATIVAS_GLOBAIS: Conta[] = [
  conta('i1', 'Adiantamento de Clientes', { tipo_operacao: '1-Entradas', macro_custo: 'Entrada Financeira', grupo_custo: 'Outras Entradas', ativo: false, ordem_exibicao: 3010 }),
  conta('i2', 'Adiantamento a Fornecedores', { ativo: false, ordem_exibicao: 16030 }),
  conta('i3', 'Nutrição Cria', { macro_custo: 'Custeio Produção', grupo_custo: 'Custo Variável Pecuária', centro_custo: 'Nutrição', ativo: false, ordem_exibicao: 6010, compoe_dre: true }),
  conta('i4', 'Nutrição Engorda', { macro_custo: 'Custeio Produção', grupo_custo: 'Custo Variável Pecuária', centro_custo: 'Nutrição', ativo: false, ordem_exibicao: 6012, compoe_dre: true }),
  conta('i5', 'Nutrição Recria', { macro_custo: 'Custeio Produção', grupo_custo: 'Custo Variável Pecuária', centro_custo: 'Nutrição', ativo: false, ordem_exibicao: 6011, compoe_dre: true }),
  conta('i6', 'Devolução de Adiantamento de Clientes', { ativo: false, ordem_exibicao: 16031 }),
];
const AJUSTES = conta('g1', 'Pagamento Estornado', { centro_custo: 'Ajustes', ordem_exibicao: 16005 });
const AMORTIZACAO = conta('g2', 'Amortização de Empréstimo', { centro_custo: 'Amortizações', ordem_exibicao: 16010 });
const BOI = conta('g3', 'Venda de Boi Gordo', { tipo_operacao: '1-Entradas', macro_custo: 'Receita Operacional', grupo_custo: 'Pecuária',
  centro_custo: 'Venda de Animais', ordem_exibicao: 1010, compoe_dre: true });
const REPASSE = conta('r1', 'Animais de funcionários', { cliente_id: 'cli', centro_custo: 'Repasses a terceiros', ordem_exibicao: 16006 });
const REPASSE_INATIVO = conta('r2', 'Repasse antigo', { cliente_id: 'cli', centro_custo: 'Repasses a terceiros', ordem_exibicao: 16006, ativo: false });

const simulado = (extra: Record<string, unknown> = {}) => ({ data: { antes: { lancamentos_vivos: 4 }, depois: {}, recusa: null, ...extra }, error: null });

const montar = async () => {
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><FinV2PlanoContasTab onAbrirDividendos={() => {}} /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('Venda de Boi Gordo')).toBeTruthy());
};
const linhaDe = (nome: string) => {
  const tr = screen.getByText(nome).closest('tr');
  if (!tr) throw new Error(`sem linha para ${nome}`);
  return tr;
};
const chamadas = () => estado.rpc.mock.calls.map(c => [c[0], (c[1] as { p_simular: boolean }).p_simular]);

beforeEach(() => {
  estado.admin = true;
  estado.plano = [BOI, AJUSTES, AMORTIZACAO, REPASSE, REPASSE_INATIVO, ...INATIVAS_GLOBAIS];
  estado.dividendos = [{ id: 'd1', cliente_id: 'cli', nome: 'Despesas Pessoais', ativo: true, ordem_exibicao: 0 }];
  estado.leituras = [];
  estado.rpc.mockReset();
  estado.rpc.mockResolvedValue(simulado());
  estado.notificar.mockReset();
  estado.toastOk.mockReset();
  estado.toastErro.mockReset();
});

describe('P172 — quem vê as ações', () => {
  it('o admin vê o "+ Novo", o renomear/inativar no subcentro do cliente e o link dos Dividendos; a conta padrão não tem ação', async () => {
    await montar();
    expect(screen.getByTestId('novo-subcentro').textContent).toBe('+ Novo subcentro do cliente');
    const repasse = linhaDe('Animais de funcionários');
    expect(within(repasse).getByTestId('selo-do-cliente').textContent).toBe('do cliente');
    expect(within(repasse).getByTestId('renomear-subcentro')).toBeTruthy();
    expect(within(repasse).getByTestId('inativar-subcentro')).toBeTruthy();
    const dividendo = linhaDe('Dividendos Despesas Pessoais');
    expect(within(dividendo).getByTestId('selo-do-cliente')).toBeTruthy();
    expect(within(dividendo).getByTestId('ir-dividendos').textContent).toBe('no cadastro de Dividendos ↗');
    expect(within(linhaDe('Pagamento Estornado')).getByTestId('acoes-da-conta').textContent).toBe('');
    expect(within(linhaDe('Pagamento Estornado')).queryByTestId('selo-do-cliente')).toBeNull();
  });

  it('o cliente vê a mesma lista, só leitura: nenhuma ação, nem a coluna delas', async () => {
    estado.admin = false;
    await montar();
    expect(screen.getByText('Animais de funcionários')).toBeTruthy();
    expect(within(linhaDe('Animais de funcionários')).getByTestId('selo-do-cliente')).toBeTruthy();
    for (const t of ['novo-subcentro', 'linha-novo-subcentro', 'renomear-subcentro', 'inativar-subcentro', 'ir-dividendos', 'acoes-da-conta']) {
      expect(screen.queryAllByTestId(t)).toHaveLength(0);
    }
    expect(screen.queryByLabelText('Ações')).toBeNull();
  });

  it('o "+ Novo" fica no lugar do centro mesmo sem nenhum subcentro do cliente ainda (o centro não existe no cliente)', async () => {
    estado.plano = [BOI, AJUSTES, AMORTIZACAO];
    await montar();
    const linhas = Array.from(document.querySelectorAll('tbody tr')).map(tr => tr.textContent ?? '');
    const iNovo = linhas.findIndex(t => t.includes('+ Novo subcentro do cliente'));
    expect(iNovo).toBeGreaterThan(linhas.findIndex(t => t.includes('Pagamento Estornado')));
    expect(iNovo).toBeLessThan(linhas.findIndex(t => t.includes('Amortização de Empréstimo')));
    expect(linhas[iNovo]).toContain('Repasses a terceiros');
  });
});

describe('P172 — os grupos e a coluna DRE', () => {
  it('cada grupo aparece UMA vez, no lugar da 1ª conta dele, mesmo com a ordem do plano intercalando grupos (o caso do NJ)', async () => {
    const OUTRAS = { macro_custo: 'Saída Financeira', grupo_custo: 'Outras Saídas', compoe_dre: false };
    const PEC = { macro_custo: 'Custeio Produção', grupo_custo: 'Custo Variável Pecuária', compoe_dre: true };
    estado.plano = [BOI,
      conta('o1', 'Juros Pagos', { ...OUTRAS, centro_custo: 'Juros', ordem_exibicao: 5010 }),
      conta('p1', 'Sal Mineral', { ...PEC, centro_custo: 'Nutrição', ordem_exibicao: 6000 }),
      conta('o2', 'Tarifas', { ...OUTRAS, centro_custo: 'Tarifas', ordem_exibicao: 10005 }),
      conta('p2', 'Vacinas', { ...PEC, centro_custo: 'Sanidade', ordem_exibicao: 10010 }),
      conta('o3', 'Pagamento Estornado', { ...OUTRAS, centro_custo: 'Ajustes', ordem_exibicao: 16005 })];
    await montar();
    const faixas = screen.getAllByTestId('faixa-do-grupo').map(f => f.textContent ?? '');
    expect(faixas).toEqual([
      'Receita › Receita Operacional › Pecuária · 1 conta',
      'Despesa › Saída Financeira › Outras Saídas · 3 contas',
      'Despesa › Custeio Produção › Custo Variável Pecuária · 2 contas',
      'Despesa › Dividendos › Dividendos · 1 conta',
    ]);
    const linhas = Array.from(document.querySelectorAll('tbody tr')).map(tr => tr.textContent ?? '');
    const pos = (t: string) => linhas.findIndex(l => l.includes(t));
    /* dentro do grupo, a ordem do plano; o "+ Novo" depois de Ajustes (16005), no lugar do centro do molde */
    expect([pos('Juros Pagos'), pos('Tarifas'), pos('Pagamento Estornado'), pos('+ Novo subcentro'), pos('Sal Mineral'), pos('Vacinas')])
      .toEqual([...[pos('Juros Pagos'), pos('Tarifas'), pos('Pagamento Estornado'), pos('+ Novo subcentro'), pos('Sal Mineral'), pos('Vacinas')]].sort((a, b) => a - b));
    expect(pos('+ Novo subcentro')).toBe(pos('Pagamento Estornado') + 1);
  });

  it('DRE: o dividendo sem conta no plano mostra "não" (Dividendos = fora do DRE, a regra do banco), nunca "—"', async () => {
    await montar();
    const dre = (nome: string) => linhaDe(nome).querySelectorAll('td')[4].textContent;
    expect(dre('Dividendos Despesas Pessoais')).toBe('não');
    expect(dre('Venda de Boi Gordo')).toBe('sim');
    expect(dre('Pagamento Estornado')).toBe('não');
  });
});

describe('P172 — "Mostrar inativos" funciona', () => {
  it('as 6 globais inativas aparecem com o interruptor (e o subcentro do cliente inativo, com "reativar")', async () => {
    await montar();
    for (const c of INATIVAS_GLOBAIS) expect(screen.queryByText(c.subcentro ?? '')).toBeNull();
    fireEvent.click(screen.getByTestId('mostrar-inativos'));
    for (const c of INATIVAS_GLOBAIS) expect(linhaDe(c.subcentro ?? '').hasAttribute('data-inativa')).toBe(true);
    expect(document.querySelectorAll('tr[data-inativa]')).toHaveLength(7);
    expect(within(linhaDe('Repasse antigo')).getByTestId('reativar-subcentro')).toBeTruthy();
    expect(within(linhaDe('Nutrição Cria')).queryByTestId('reativar-subcentro')).toBeNull();
    expect(screen.getByTestId('contagem-plano').textContent).toContain('7 inativas');
  });

  it('o carregador só tira o filtro de ativo quando pedido; o padrão (os seletores) segue só as ativas', async () => {
    await loadContasDoPlanoDoCliente('cli');
    await loadContasDoPlanoDoCliente('cli', { incluirInativos: true });
    const [padrao, todas] = estado.leituras.filter(l => l.tabela === 'financeiro_plano_contas');
    expect(padrao.passos).toContainEqual(['eq', 'ativo', true]);
    expect(todas.passos.some(p => p[0] === 'eq' && p[1] === 'ativo')).toBe(false);
    expect(todas.passos).toContainEqual(['or', 'cliente_id.is.null,cliente_id.eq.cli']);
  });
});

describe('P172 — os gestos simulam antes de gravar (P171)', () => {
  it('criar: "Conferir" simula, a prévia aparece, "Confirmar" grava; depois a lista relê e os outros são avisados', async () => {
    await montar();
    fireEvent.click(screen.getByTestId('novo-subcentro'));
    fireEvent.change(screen.getByTestId('nome-subcentro'), { target: { value: '  Gado do capataz ' } });
    fireEvent.click(screen.getByTestId('conferir-subcentro'));
    await waitFor(() => expect(screen.getByTestId('previa-subcentro').textContent).toContain('nasce em Repasses a terceiros, fora do DRE'));
    expect(estado.rpc).toHaveBeenCalledTimes(1);
    expect(estado.rpc.mock.calls[0]).toEqual(['fn_subcentro_cliente_criar',
      { p_cliente_id: 'cli', p_molde: 'repasses_terceiros', p_nome: 'Gado do capataz', p_simular: true }]);
    const lidas = estado.leituras.length;
    fireEvent.click(screen.getByTestId('confirmar-subcentro'));
    await waitFor(() => expect(estado.toastOk).toHaveBeenCalledWith('Subcentro criado'));
    expect(chamadas()).toEqual([['fn_subcentro_cliente_criar', true], ['fn_subcentro_cliente_criar', false]]);
    expect(estado.notificar).toHaveBeenCalledWith('cli');
    expect(estado.leituras.length).toBeGreaterThan(lidas);
  });

  it('renomear: a prévia diz quantos lançamentos mudam de nome, pelo número do banco; mudar o nome apaga a prévia', async () => {
    estado.rpc.mockResolvedValue(simulado({ lancamentos_tocados: 3 }));
    await montar();
    fireEvent.click(within(linhaDe('Animais de funcionários')).getByTestId('renomear-subcentro'));
    expect((screen.getByTestId('nome-subcentro') as HTMLInputElement).value).toBe('Animais de funcionários');
    fireEvent.change(screen.getByTestId('nome-subcentro'), { target: { value: 'Animais de terceiros' } });
    fireEvent.click(screen.getByTestId('conferir-subcentro'));
    await waitFor(() => expect(screen.getByTestId('previa-subcentro').textContent).toBe('3 lançamentos mudam de nome (a classificação não muda).'));
    expect(estado.rpc.mock.calls[0]).toEqual(['fn_subcentro_cliente_renomear', { p_id: 'r1', p_nome: 'Animais de terceiros', p_simular: true }]);
    fireEvent.change(screen.getByTestId('nome-subcentro'), { target: { value: 'Outro nome' } });
    expect(screen.getByTestId('previa-subcentro').textContent).toBe('');
    expect(screen.queryByTestId('confirmar-subcentro')).toBeNull();
    fireEvent.click(screen.getByTestId('conferir-subcentro'));
    await waitFor(() => expect(screen.getByTestId('confirmar-subcentro')).toBeTruthy());
    fireEvent.click(screen.getByTestId('confirmar-subcentro'));
    await waitFor(() => expect(estado.toastOk).toHaveBeenCalledWith('Subcentro renomeado'));
    expect(chamadas()).toEqual([['fn_subcentro_cliente_renomear', true], ['fn_subcentro_cliente_renomear', true], ['fn_subcentro_cliente_renomear', false]]);
  });

  it('a recusa do banco fica escrita no lugar da prévia, sem toast, e nada se grava', async () => {
    estado.rpc.mockResolvedValue({ data: { antes: null, depois: null, recusa: { motivo: 'nome_em_uso', frase: 'O plano de contas deste cliente já tem a conta «Sal»: escolha outro nome.' } }, error: null });
    await montar();
    fireEvent.click(screen.getByTestId('novo-subcentro'));
    fireEvent.change(screen.getByTestId('nome-subcentro'), { target: { value: 'Sal' } });
    fireEvent.click(screen.getByTestId('conferir-subcentro'));
    await waitFor(() => expect(screen.getByTestId('previa-subcentro').textContent).toContain('já tem a conta «Sal»'));
    expect(screen.queryByTestId('confirmar-subcentro')).toBeNull();
    expect(estado.toastErro).not.toHaveBeenCalled();
    expect(chamadas()).toEqual([['fn_subcentro_cliente_criar', true]]);
  });

  it('a recusa que só vem na gravação (outro gravou entre a prévia e o Confirmar) fica escrita e o diálogo não fecha', async () => {
    estado.rpc.mockResolvedValueOnce(simulado()).mockResolvedValueOnce({ data: null, error: { message: 'Este subcentro já está inativo. Nada foi gravado.' } });
    await montar();
    fireEvent.click(within(linhaDe('Animais de funcionários')).getByTestId('inativar-subcentro'));
    await waitFor(() => expect(screen.getByTestId('confirmar-subcentro')).toBeTruthy());
    fireEvent.click(screen.getByTestId('confirmar-subcentro'));
    await waitFor(() => expect(screen.getByTestId('previa-subcentro').textContent).toBe('Este subcentro já está inativo. Nada foi gravado.'));
    expect(estado.toastOk).not.toHaveBeenCalled();
    expect(estado.notificar).not.toHaveBeenCalled();
  });

  it('inativar: simula ao abrir (quantos lançamentos usam a conta) e grava só no "Confirmar"', async () => {
    await montar();
    fireEvent.click(within(linhaDe('Animais de funcionários')).getByTestId('inativar-subcentro'));
    await waitFor(() => expect(screen.getByTestId('previa-subcentro').textContent).toContain('4 lançamentos usam esta conta'));
    expect(chamadas()).toEqual([['fn_subcentro_cliente_inativar', true]]);
    fireEvent.click(screen.getByTestId('confirmar-subcentro'));
    await waitFor(() => expect(estado.toastOk).toHaveBeenCalledWith('Subcentro inativado'));
    expect(chamadas()).toEqual([['fn_subcentro_cliente_inativar', true], ['fn_subcentro_cliente_inativar', false]]);
  });
});

describe('P172 — a leitura da resposta do P171', () => {
  it('erro = a frase do banco; recusa = a frase; peça torta nunca vira sucesso', () => {
    expect(lerRespostaDoSubcentro(null, { message: 'Só o consultor AGROinBLUE cria e altera os subcentros do cliente.' }))
      .toEqual({ ok: false, frase: 'Só o consultor AGROinBLUE cria e altera os subcentros do cliente.' });
    expect(lerRespostaDoSubcentro({ recusa: { frase: 'Informe o nome do subcentro.' } }, null)).toEqual({ ok: false, frase: 'Informe o nome do subcentro.' });
    expect(lerRespostaDoSubcentro({ algo: 1 }, null).ok).toBe(false);
    expect(lerRespostaDoSubcentro({ recusa: null, antes: { lancamentos_vivos: 2 }, lancamentos_tocados: 5 }, null))
      .toEqual({ ok: true, lancamentosTocados: 5, lancamentosVivos: 2 });
  });

  it('só a conta DO CLIENTE no centro do molde tem molde; a global de mesmo centro e a de outro centro, não', () => {
    expect(moldeDaConta(REPASSE)?.chave).toBe('repasses_terceiros');
    expect(moldeDaConta({ ...REPASSE, cliente_id: null })).toBeNull();
    expect(moldeDaConta({ ...AJUSTES, cliente_id: 'cli' })).toBeNull();
  });
});
