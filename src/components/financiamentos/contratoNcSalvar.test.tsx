/**
 * FIN-CONTRATO-NC-SALVAR-01 (Gabriel 20/10/2026) — campo "não cadastrado" ESCOLHIDO sempre vai ao banco; o Regerar (que lê o banco) fica
 * apagado enquanto a tela difere do banco; a linha de base da prévia diz o sistema e a periodicidade que o banco vai usar.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const edicao = {
  salvarCabecalho: vi.fn(async () => ({ simulado: false, recusa: null, corpo: { cronograma_mudou: true, campos_do_cronograma: ['taxa'] } })),
  editarParcelas: vi.fn(async (_m: unknown, simular: boolean) => ({ simulado: simular, recusa: null, corpo: { diferenca_do_saldo: -1500 } })),
  regerar: vi.fn(async (_modo: string, simular: boolean) => ({ simulado: simular, recusa: null, corpo: {
    base: { saldo: 592000, guardado: 0, principal: 592000, parcelas: 5, sistema: 'sac', taxa_aa: 7.43, periodicidade: 'anual' }, diferenca_do_saldo: 0,
    antes: [{ id: 'p1', numero_parcela: 1, data_vencimento: '2031-02-15', valor_principal: 1000, valor_juros: 10, valor_total: 1010, status: 'pendente', ajustada: false },
            { id: 'p2', numero_parcela: 2, data_vencimento: '2031-03-15', valor_principal: 400, valor_juros: 10, valor_total: 410, status: 'pendente', ajustada: true }],
    depois: [{ id: 'p1', numero_parcela: 1, data_vencimento: '2031-02-15', valor_principal: 1300, valor_juros: 26, valor_total: 1326, status: 'pendente', ajustada: false },
             { id: 'p2', numero_parcela: 2, data_vencimento: '2031-03-15', valor_principal: 400, valor_juros: 10, valor_total: 410, status: 'pendente', ajustada: true },
             { id: 'p3', numero_parcela: 3, data_vencimento: '2031-04-15', valor_principal: 1300, valor_juros: 13, valor_total: 1313, status: 'pendente', ajustada: false }],
  } })),
  desfazer: vi.fn(async () => ({ simulado: false, recusa: null, corpo: {} })),
  ultimaOperacao: null,
};
vi.mock('@/hooks/useEdicaoDoContrato', () => ({ useEdicaoDoContrato: () => edicao }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'c1', nome: 'Cliente Teste' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFinanciamentoCadastro', () => ({ useFinanciamentoCadastro: () => ({ contas: [], classificacoes: [] }) }));
vi.mock('@/hooks/useContratoDeCredito', () => ({ useContratoDeCredito: () => ({ documentos: [] }) }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/components/financeiro-v2/NovoFornecedorDialog', () => ({ NovoFornecedorDialog: () => null }));
const CONTRATO = {
  id: 'f1', natureza: 'financiamento', tipo_financiamento: 'agricultura', descricao: 'Armazém', numero_contrato: 'SINT-78.179',
  credor_id: 'cr1', conta_bancaria_id: 'ct1', fazenda_id: 'fz1', valor_total: 7200000, data_contrato: '2025-11-10', data_primeira_parcela: '2026-10-01',
  total_parcelas: 15, taxa_juros: 0, taxa_juros_mensal: 0.6821, sistema_amortizacao: null, periodicidade: null, tipo_taxa: null, carencia_ate: null,
  plano_principal_id: null, plano_conta_parcela_id: 'pl1', plano_juros_id: 'pl2', garantias: null, observacao: null, finalidade: 'investimento',
  linha_credito_id: null, financeiro_fornecedores: { nome: 'SINT BANCO REGIONAL DE DESENVOLVIMENTO DO EXTREMO SUL' },
};
vi.mock('@/integrations/supabase/client', () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, { select: () => q, eq: () => q, maybeSingle: async () => ({ data: CONTRATO, error: null }), then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok) });
  return { supabase: { from: () => q, rpc: () => Promise.resolve({ data: null, error: null }) } };
});


import { CadastroDeContratoDialog } from './CadastroDeContratoDialog';
import { RegerarParcelas } from './EdicaoDoContrato';
import {
  FRASE_SALVE_ANTES_DE_REGERAR, dadosDoCabecalho, formDoContrato, fraseDaRecusaDoRegerar, lerBase, motivoRegerarApagado, textoDaBase,
} from '@/lib/financiamentos/edicaoDoContrato';

const aba = (n: string) => screen.getByRole('button', { name: n });
const abrir = async () => {
  render(<CadastroDeContratoDialog aberto aoFechar={vi.fn()} financiamentoId="f1" />);
  await waitFor(() => expect(screen.getByTestId('titulo-do-cadastro').textContent).toContain('SINT-78.179'));
  fireEvent.click(aba('Condições e cronograma'));
};

describe('FIN-CONTRATO-NC-SALVAR-01 · o dono puro', () => {
  const c = formDoContrato(CONTRATO, null, [])!;
  it('campo não cadastrado ESCOLHIDO vai mesmo igual ao padrão/inferido; não escolhido não vai', () => {
    expect(c.form.sistema).toBe('sac');
    /* escolheu SAC (o mesmo valor do formulário) e a periodicidade mostrada: os dois vão */
    expect(dadosDoCabecalho(c.form, c.form, ['tipoTaxa', 'carenciaAte'], ['sistema', 'periodicidade']))
      .toEqual({ sistema_amortizacao: 'sac', periodicidade: c.form.periodicidade });
    /* não escolheu: nada vai (nunca grava padrão calado) */
    expect(dadosDoCabecalho(c.form, c.form, c.naoCadastrado, [])).toEqual({});
  });
  it('o Regerar fica apagado com cabeçalho pendente ou campo não cadastrado; livre sem nenhum dos dois', () => {
    expect(motivoRegerarApagado({ periodicidade: 'anual' }, [])).toBe(FRASE_SALVE_ANTES_DE_REGERAR);
    expect(motivoRegerarApagado({}, ['sistema'])).toBe(FRASE_SALVE_ANTES_DE_REGERAR);
    expect(motivoRegerarApagado({ descricao: 'x' }, ['carenciaAte'])).toBeNull();
  });
  it('a linha de base diz o que o BANCO vai usar; a recusa vira instrução com o campo', () => {
    const b = lerBase({ base: { saldo: 1, guardado: 0, principal: 1, parcelas: 5, sistema: 'sac', taxa_aa: 7.43, periodicidade: 'anual' } })!;
    expect(textoDaBase(b)).toBe('SAC · anual · 7,43% a.a.');
    expect(fraseDaRecusaDoRegerar('Sistema de amortização não cadastrado: preencha no contrato antes de regerar.'))
      .toEqual({ frase: 'Escolha o sistema de amortização e clique Salvar cabeçalho antes de regerar', campo: 'sistema' });
  });
});

describe('FIN-CONTRATO-NC-SALVAR-01 · a tela', () => {
  it('não escolhido: segmento sem nada marcado; a periodicidade mostrada é sugestão; o Regerar apagado e o Salvar em destaque', async () => {
    await abrir();
    expect(screen.getByText(/Sistema de amortização · não cadastrado/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'SAC' }).className).not.toContain('bg-primary');
    expect(screen.getByRole('button', { name: 'Mensal' }).getAttribute('data-sugestao')).toBe('sim');
    expect(screen.getByRole('button', { name: 'Mensal' }).getAttribute('title')).toBe('sugestão: clique para confirmar e salve o cabeçalho');
    expect(screen.getByTestId('motivo-do-regerar')).toHaveTextContent(FRASE_SALVE_ANTES_DE_REGERAR);
    expect((screen.getByTestId('abrir-regerar') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('salvar-cadastro').getAttribute('data-destaque')).toBe('sim');
    expect(screen.getByTestId('origem-do-resumo')).toHaveTextContent('prévia da tela · não gravado');
  });
  it('escolher SAC e a periodicidade mostrada (iguais ao que a tela já tinha) VAI ao banco', async () => {
    edicao.salvarCabecalho.mockClear();
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'SAC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mensal' }));
    expect(screen.getByRole('button', { name: 'Mensal' }).getAttribute('data-sugestao')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId('salvar-cadastro')); });
    expect(edicao.salvarCabecalho).toHaveBeenCalledWith({ sistema_amortizacao: 'sac', periodicidade: 'mensal' }, false);
  });
  it('com tudo gravado e nada pendente, o Regerar abre e a linha de base mostra a periodicidade do banco', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'SAC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pós (CDI/TLP)' }));
    await act(async () => { fireEvent.click(screen.getByTestId('salvar-cadastro')); });
    expect(screen.queryByTestId('motivo-do-regerar')).toBeNull();
    expect(await screen.findByTestId('texto-da-base')).toHaveTextContent('SAC · anual · 7,43% a.a.');
    expect(screen.getByTestId('origem-do-resumo')).toHaveTextContent('como está gravado');
  });
  it('a recusa do banco por sistema não cadastrado é instrução, e o campo pedido é destacado', async () => {
    const recusou = { ...edicao, regerar: vi.fn(async () => ({ simulado: true, recusa: 'Sistema de amortização não cadastrado: preencha no contrato antes de regerar.', corpo: {} })) };
    const campo = vi.fn();
    render(<RegerarParcelas api={recusou} onFeito={vi.fn()} onCampoFaltando={campo} />);
    expect(await screen.findByTestId('recusa-do-regerar')).toHaveTextContent('Escolha o sistema de amortização e clique Salvar cabeçalho antes de regerar');
    expect(campo).toHaveBeenCalledWith('sistema');
  });
});
