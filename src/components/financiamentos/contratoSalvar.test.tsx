/**
 * FIN-CONTRATO-SALVAR-01 (Gabriel 19/10/2026, Santa Rita) — o modal de contrato de crédito "não salva" e as abas ficam bloqueadas. Aqui:
 * as abas abrem no Editar; no Novo, a aba que precisa do contrato mostra o que falta e o "Salvar e continuar" salva e abre a aba; a
 * leitura com erro apaga o Salvar com o motivo escrito; o recado quebra a linha (sem reticências) e cada item do "Falta" leva à aba dele;
 * a periodicidade nula é inferida das parcelas (nunca "anual" calado); o plano dos juros vem pela atividade.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { inferirPeriodicidade, formDoContrato } from '@/lib/financiamentos/edicaoDoContrato';

const banco: {
  contrato: Record<string, unknown> | null; erroContrato: string | null; vencimentos: string[];
  rpcs: { fn: string; args: Record<string, unknown> }[]; faltaVazia: boolean;
} = { contrato: null, erroContrato: null, vencimentos: [], rpcs: [], faltaVazia: false };

vi.mock('@/integrations/supabase/client', () => {
  const from = (t: string) => {
    const q: Record<string, unknown> = {};
    const fim = () => {
      if (t === 'financiamentos') return { data: banco.erroContrato ? null : banco.contrato, error: banco.erroContrato ? { message: banco.erroContrato } : null };
      if (t === 'financiamento_parcelas') return { data: banco.vencimentos.map((d) => ({ data_vencimento: d, status: 'pendente' })), error: null };
      return { data: t === 'financiamento_consorcio' ? null : [], error: null };
    };
    for (const k of ['select', 'eq', 'is', 'order', 'limit', 'in']) q[k] = () => q;
    q.maybeSingle = () => Promise.resolve(fim());
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(fim()).then(ok);
    return q;
  };
  const rpc = (fn: string, args: Record<string, unknown>) => {
    banco.rpcs.push({ fn, args });
    if (fn === 'fn_financiamento_criar') return Promise.resolve({ data: { financiamento_id: 'fin-novo' }, error: null });
    if (fn === 'fn_financiamento_salvar_cabecalho') return Promise.resolve({ data: { simulado: false, recusa: null, cronograma_mudou: false }, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  return { supabase: { from, rpc } };
});
vi.mock('@tanstack/react-query', async (orig) => ({ ...(await orig<object>()), useQueryClient: () => ({ invalidateQueries: () => undefined }),
  useQuery: () => ({ data: null }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: () => undefined }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'c1', nome: 'Cliente Teste' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
const CLASSIF = [
  { id: 'pl-amort-pec', subcentro: 'Amortização Financiamento Pecuária', tipo_operacao: '2-Saídas' },
  { id: 'pl-juros-pec', subcentro: 'Juros de Financiamento Pecuária', tipo_operacao: '2-Saídas' },
  { id: 'pl-juros-agr', subcentro: 'Juros de Financiamento Agricultura', tipo_operacao: '2-Saídas' },
];
vi.mock('@/hooks/useFinanciamentoCadastro', () => ({ useFinanciamentoCadastro: () => ({ contas: [], classificacoes: CLASSIF }) }));
vi.mock('@/hooks/useContratoDeCredito', () => ({ CHAVES_DO_CONTRATO: [], useContratoDeCredito: () => ({ documentos: [] }) }));
vi.mock('@/components/financiamentos/ContratoDeCredito', () => ({
  BlocoLiberacoes: () => <div data-testid="bloco-liberacoes" />, BlocoDestinacoes: () => <div data-testid="bloco-destinacoes" />,
  BlocoDocumentos: () => <div data-testid="bloco-documentos" />,
}));
vi.mock('@/components/shared/FavorecidoSelect', () => ({ FavorecidoSelect: () => <div /> }));
vi.mock('@/components/shared/FazendaSelect', () => ({ FazendaSelect: () => <div /> }));
vi.mock('@/components/shared/ContaBancariaSelect', () => ({ ContaBancariaSelect: () => <div /> }));
vi.mock('@/components/shared/PlanoSubcentroSelect', () => ({ PlanoSubcentroSelect: ({ value }: { value: string }) => <div data-testid="plano-valor">{value}</div> }));
vi.mock('@/components/financeiro-v2/NovoFornecedorDialog', () => ({ NovoFornecedorDialog: () => null }));
vi.mock('./ConsorcioDialog', () => ({ ConsorcioDialog: () => null }));
vi.mock('@/lib/financiamentos/cadastroDoContrato', async (orig) => {
  const real = await orig<typeof import('@/lib/financiamentos/cadastroDoContrato')>();
  return { ...real, oQueFalta: (f: Parameters<typeof real.oQueFalta>[0]) => (banco.faltaVazia ? [] : real.oQueFalta(f)) };
});

import { CadastroDeContratoDialog } from './CadastroDeContratoDialog';

/** um contrato antigo como os da Santa Rita: sem periodicidade, sem sistema, sem plano dos juros (dado SINTÉTICO) */
const ANTIGO = {
  id: 'fin-1', natureza: 'financiamento', status: 'ativo', descricao: 'Custeio Exemplo', numero_contrato: '000.000.00/01', credor_id: 'cr1',
  conta_bancaria_id: 'ct1', fazenda_id: 'fz1', valor_total: 120000, data_contrato: '2025-08-10', data_primeira_parcela: '2026-07-26', total_parcelas: 3,
  taxa_juros: 0, taxa_juros_mensal: 1.1715, tipo_financiamento: 'pecuaria', periodicidade: null, sistema_amortizacao: null, tipo_taxa: null,
  plano_principal_id: null, plano_conta_parcela_id: 'pl-amort-pec', plano_juros_id: null, financeiro_fornecedores: { nome: 'Banco Exemplo' },
};
const abrirEditar = async () => {
  render(<CadastroDeContratoDialog aberto aoFechar={vi.fn()} financiamentoId="fin-1" />);
  await waitFor(() => expect(screen.getByTestId('titulo-do-cadastro').textContent).toMatch(/000\.000\.00\/01/));
};
const aba = (nome: string) => screen.getByRole('button', { name: nome });

beforeEach(() => {
  banco.contrato = ANTIGO; banco.erroContrato = null; banco.vencimentos = ['2026-07-26', '2026-08-26', '2026-09-26']; banco.rpcs = []; banco.faltaVazia = false;
});

describe('1 · abas no Editar', () => {
  it('Liberações, Destinação e Documentos abrem no Editar (o contrato existe)', async () => {
    await abrirEditar();
    for (const [nome, bloco] of [['Liberações', 'bloco-liberacoes'], ['Destinação', 'bloco-destinacoes'], ['Documentos', 'bloco-documentos']]) {
      expect(aba(nome)).not.toBeDisabled();
      fireEvent.click(aba(nome));
      expect(screen.getByTestId(bloco)).toBeTruthy();
      expect(screen.queryByTestId('painel-antes-de-salvar')).toBeNull();
    }
  });
});

describe('2 · aba "antes" no Novo', () => {
  it('mostra o painel com o que falta (a mesma lista do resumo); item leva à aba dele', () => {
    render(<CadastroDeContratoDialog aberto aoFechar={vi.fn()} prefill={{ natureza: 'financiamento' }} />);
    fireEvent.click(aba('Liberações'));
    const painel = screen.getByTestId('painel-antes-de-salvar');
    expect(painel.textContent).toMatch(/Para lançar liberações, o contrato precisa existir\./);
    expect(screen.getByTestId('painel-falta').textContent).toMatch(/^Falta: descrição, credor, conta de captação/);
    expect(screen.getByTestId('o-que-falta').textContent).toMatch(/descrição/);
    fireEvent.click(screen.getByRole('button', { name: 'nº do contrato' }));
    expect(screen.getByTestId('aba-contrato')).toBeTruthy();
  });
  it('"Salvar e continuar" grava o contrato e abre a aba pedida', async () => {
    banco.faltaVazia = true;
    render(<CadastroDeContratoDialog aberto aoFechar={vi.fn()} prefill={{ natureza: 'financiamento' }} />);
    fireEvent.click(aba('Destinação'));
    await act(async () => { fireEvent.click(screen.getByTestId('salvar-e-continuar')); });
    await waitFor(() => expect(screen.getByTestId('bloco-destinacoes')).toBeTruthy());
    expect(banco.rpcs.some((r) => r.fn === 'fn_financiamento_criar')).toBe(true);
  });
});

describe('3 · o Salvar nunca é calado', () => {
  it('leitura com erro: o motivo escrito e o Salvar apagado com ele', async () => {
    banco.erroContrato = 'permission denied for table financiamentos';
    render(<CadastroDeContratoDialog aberto aoFechar={vi.fn()} financiamentoId="fin-1" />);
    await waitFor(() => expect(screen.getByTestId('recado-do-cadastro').textContent).toBe('Não consegui carregar o contrato: permission denied for table financiamentos'));
    expect(screen.getByTestId('salvar-cadastro')).toBeDisabled();
    expect(screen.getByTestId('salvar-cadastro').getAttribute('title')).toMatch(/^Não consegui carregar o contrato/);
  });
  it('o recado quebra a linha (sem reticências), e o "Falta:" do Salvar leva cada item à aba dele', async () => {
    render(<CadastroDeContratoDialog aberto aoFechar={vi.fn()} prefill={{ natureza: 'financiamento' }} />);
    const recado = screen.getByTestId('recado-do-cadastro');
    expect(recado.className).not.toMatch(/\btruncate\b/);
    expect(recado.className).toMatch(/\bbreak-words\b/);
    expect(recado.className).toMatch(/text-\[11px\]/);
    await act(async () => { fireEvent.click(screen.getByTestId('salvar-cadastro')); });
    expect(recado.textContent).toMatch(/^Falta: descrição, credor/);
    expect(recado.className).toMatch(/text-destructive/);
    fireEvent.click(screen.getAllByTestId('falta-item').find((b) => b.textContent === 'nº de parcelas') ?? screen.getAllByTestId('falta-item')[0]);
    expect(banco.rpcs.some((r) => r.fn === 'fn_financiamento_criar')).toBe(false);
  });
  it('Editar: muda um campo e grava só ele (o plano dos juros sugerido vai junto)', async () => {
    await abrirEditar();
    fireEvent.change(screen.getByDisplayValue('Custeio Exemplo'), { target: { value: 'Custeio Exemplo 2' } });
    await act(async () => { fireEvent.click(screen.getByTestId('salvar-cadastro')); });
    const r = banco.rpcs.find((x) => x.fn === 'fn_financiamento_salvar_cabecalho');
    expect(r?.args.p_dados).toEqual({ descricao: 'Custeio Exemplo 2', plano_juros_id: 'pl-juros-pec' });
    expect(screen.getByTestId('recado-do-cadastro').textContent).toBe('Cabeçalho salvo.');
  });
});

describe('4 · periodicidade nula', () => {
  it('inferida das parcelas: 1, 3, 6, 12 meses; sem como inferir, a do banco (mensal), dita', () => {
    expect(inferirPeriodicidade(['2026-07-26', '2026-08-26', '2026-09-26'])).toEqual({ periodicidade: 'mensal', origem: 'parcelas' });
    expect(inferirPeriodicidade(['2027-01-10', '2026-07-10', '2028-01-10'])).toEqual({ periodicidade: 'semestral', origem: 'parcelas' });
    expect(inferirPeriodicidade(['2026-07-26', '2027-07-26'])).toEqual({ periodicidade: 'anual', origem: 'parcelas' });
    expect(inferirPeriodicidade(['2026-07-26'])).toEqual({ periodicidade: 'mensal', origem: 'banco' });
    expect(inferirPeriodicidade([])).toEqual({ periodicidade: 'mensal', origem: 'banco' });
  });
  it('o formulário nunca abre "anual" calado; a gravada vale', () => {
    expect(formDoContrato(ANTIGO, null, ['2026-07-26', '2026-08-26'])?.form.periodicidade).toBe('mensal');
    expect(formDoContrato(ANTIGO, null, [])?.form.periodicidade).toBe('mensal');
    expect(formDoContrato({ ...ANTIGO, periodicidade: 'anual' }, null, ['2026-07-26', '2026-08-26'])).toMatchObject({ form: { periodicidade: 'anual' }, origemDaPeriodicidade: 'gravada' });
  });
  it('a tela diz "inferida das parcelas" e o Salvar não manda a periodicidade', async () => {
    await abrirEditar();
    fireEvent.click(aba('Condições e cronograma'));
    /* FIN-CONTRATO-NC-SALVAR-01: a inferida pede confirmação (e fica em tom de sugestão) */
    expect(screen.getByText('Periodicidade · inferida das parcelas · confirme *')).toBeTruthy();
    expect(screen.getByTestId('resumo-do-cadastro').textContent).toMatch(/não cadastrado · mensal \(inferida\)/);
    fireEvent.click(aba('Contrato'));
    fireEvent.change(screen.getByDisplayValue('Custeio Exemplo'), { target: { value: 'X' } });
    await act(async () => { fireEvent.click(screen.getByTestId('salvar-cadastro')); });
    expect(banco.rpcs.find((x) => x.fn === 'fn_financiamento_salvar_cabecalho')?.args.p_dados).not.toHaveProperty('periodicidade');
  });
});

describe('5 · plano dos juros pela atividade', () => {
  it('Novo: o plano dos juros nasce pela atividade (pecuária); Editar: o vazio é sugerido e escrito no recado', async () => {
    render(<CadastroDeContratoDialog aberto aoFechar={vi.fn()} prefill={{ natureza: 'financiamento' }} />);
    expect(screen.getByTestId('o-que-falta').textContent).not.toMatch(/plano dos juros/);
    expect(screen.getAllByTestId('plano-valor').map((e) => e.textContent)).toEqual(['Amortização Financiamento Pecuária', 'Juros de Financiamento Pecuária']);
  });
  it('Editar: o vazio é sugerido e escrito no recado', async () => {
    await abrirEditar();
    expect(screen.getByTestId('recado-do-cadastro').textContent).toBe('plano dos juros sugerido pela atividade · salve para gravar');
  });
});
