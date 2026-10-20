/**
 * FIN-FINANC-28 · EDITAR = CADASTRO NOVO v2 (Gabriel 18/10/2026) — a edição do contrato de crédito:
 * (1) o dono puro: o form do contrato gravado (vazio = "não cadastrado"), só o que mudou vai ao banco, as mudanças das parcelas,
 *     antes × depois, a diferença do saldo em laranja;
 * (2) o cadastro em modo editar: título, natureza travada, "não cadastrado", o Salvar manda só o cabeçalho que mudou, e o banco
 *     dizendo que o cronograma mudou acende "Regerar parcelas em aberto";
 * (3) o regerar pergunta "Manter ajustes" (padrão) ou "Recalcular todas", mostra a prévia e só grava na confirmação;
 * (4) editar as parcelas à mão: travada em leitura com o motivo, mexer marca "ajustada", o Salvar manda as mudanças, a diferença do
 *     saldo aparece em laranja.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const edicao = {
  salvarCabecalho: vi.fn(async () => ({ simulado: false, recusa: null, corpo: { cronograma_mudou: true, campos_do_cronograma: ['taxa'] } })),
  editarParcelas: vi.fn(async (_m: unknown, simular: boolean) => ({ simulado: simular, recusa: null, corpo: { diferenca_do_saldo: -1500 } })),
  regerar: vi.fn(async (_modo: string, simular: boolean) => ({ simulado: simular, recusa: null, corpo: {
    base: { saldo: 3000, guardado: 400, principal: 2600, parcelas: 2, sistema: 'sac', taxa_aa: 12 }, diferenca_do_saldo: 0,
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
import { EditarParcelasDialog, RegerarParcelas, type ParcelaParaEditar } from './EdicaoDoContrato';
import {
  antesDepois, dadosDoCabecalho, formDoContrato, fraseDaDiferenca, lerFoto, mudancasDasParcelas, taxaAaDoContrato, travaNaTela,
} from '@/lib/financiamentos/edicaoDoContrato';

describe('(1) o dono puro da edição', () => {
  it('o contrato antigo sem sistema/carência/tipo/periodicidade: "não cadastrado", nunca um padrão; a taxa a.a. sai da mensal', () => {
    const c = formDoContrato(CONTRATO, null)!;
    expect(c.naoCadastrado).toEqual(['sistema', 'periodicidade', 'tipoTaxa', 'carenciaAte']);
    expect(c.form.taxaAa).toBe(taxaAaDoContrato(0, 0.6821));
    expect(c.form.taxaAa).toBeCloseTo(8.4994, 3);
    expect(c.form.planoPrincipalId).toBe('pl1');
    expect(c.credorNome).toBe('SINT BANCO REGIONAL DE DESENVOLVIMENTO DO EXTREMO SUL');
    expect(formDoContrato({ natureza: 'parcelamento' }, null)).toBeNull();
  });
  it('só o que mudou vai ao banco; campo "não cadastrado" não escolhido não vai', () => {
    const c = formDoContrato(CONTRATO, null)!;
    expect(dadosDoCabecalho(c.form, c.form, c.naoCadastrado)).toEqual({});
    expect(dadosDoCabecalho(c.form, { ...c.form, descricao: 'Armazém novo', taxaAa: 10 }, c.naoCadastrado)).toEqual({ descricao: 'Armazém novo', taxa_aa: 10 });
    expect(dadosDoCabecalho(c.form, { ...c.form, sistema: 'price' }, c.naoCadastrado)).toEqual({});
    expect(dadosDoCabecalho(c.form, { ...c.form, sistema: 'price' }, [])).toEqual({ sistema_amortizacao: 'price' });
  });
  it('as mudanças das parcelas: alterar só o que mudou, acrescentar as sem id, retirar as que saíram', () => {
    const o = [{ id: 'a', vencimento: '2031-01-01', principal: 100, juros: 1 }, { id: 'b', vencimento: '2031-02-01', principal: 100, juros: 1 }];
    expect(mudancasDasParcelas(o, [{ ...o[0], principal: 150 }, { id: null, vencimento: '2031-03-01', principal: 50, juros: 0 }])).toEqual({
      alterar: [{ id: 'a', valor_principal: 150 }], acrescentar: [{ data_vencimento: '2031-03-01', valor_principal: 50, valor_juros: 0 }], retirar: ['b'],
    });
  });
  it('antes × depois, a diferença em laranja (zero não diz nada) e a trava na tela', () => {
    const antes = lerFoto([{ id: 'p1', numero_parcela: 1, valor_principal: 1, valor_juros: 0, status: 'pendente' }, { id: 'p9', numero_parcela: 2, valor_principal: 1, valor_juros: 0, status: 'cancelado' }])!;
    expect(antes.map((p) => p.id)).toEqual(['p1']);
    expect(antesDepois(antes, [{ ...antes[0], principal: 2 }]).map((l) => l.marca)).toEqual(['mudou']);
    expect(antesDepois(antes, []).map((l) => l.marca)).toEqual(['retirada']);
    expect(fraseDaDiferenca(0)).toBeNull();
    expect(fraseDaDiferenca(-1500)).toBe('Principal das parcelas difere do saldo em R$ 1.500,00 (abaixo).');
    expect(travaNaTela('paga', false)).toBe('paga · não muda');
    expect(travaNaTela('pendente', true)).toBe('pagamento vinculado · desvincule antes');
    expect(travaNaTela('vencida', false)).toBeNull();
  });
});

describe('(2) o cadastro em modo editar', () => {
  it('título com nº e credor inteiro, natureza travada, "não cadastrado" no sistema; o Salvar manda só o que mudou e acende o Regerar', async () => {
    edicao.salvarCabecalho.mockClear();
    render(<CadastroDeContratoDialog aberto aoFechar={vi.fn()} financiamentoId="f1" />);
    await waitFor(() => expect(screen.getByTestId('titulo-do-cadastro').textContent).toBe('Editar contrato · SINT-78.179 · SINT BANCO REGIONAL DE DESENVOLVIMENTO DO EXTREMO SUL'));
    expect((screen.getByRole('button', { name: 'Consórcio' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Compra parcelada' }) as HTMLButtonElement).disabled).toBe(true);
    const descricao = screen.getByDisplayValue('Armazém');
    fireEvent.change(descricao, { target: { value: 'Armazém novo' } });
    fireEvent.click(screen.getByTestId('salvar-cadastro'));
    await waitFor(() => expect(edicao.salvarCabecalho).toHaveBeenCalledWith({ descricao: 'Armazém novo' }, false));
    /* FIN-CONTRATO-NC-SALVAR-01 (contrato novo): o sistema segue não cadastrado no banco, então o Regerar (que lê o banco) fica APAGADO
       com a frase, no lugar de abrir a prévia */
    expect(await screen.findByTestId('motivo-do-regerar')).toHaveTextContent('Salve o cabeçalho antes de regerar — a prévia usa o que está gravado');
    expect(screen.queryByTestId('regerar-parcelas')).toBeNull();
    expect((screen.getByTestId('abrir-regerar') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Sistema de amortização · não cadastrado/)).toBeTruthy();
  });
});

describe('(3) regerar parcelas em aberto', () => {
  it('"Manter ajustes" é o padrão; a prévia vem do banco (antes × depois); trocar o modo pede outra prévia; só grava na confirmação', async () => {
    edicao.regerar.mockClear();
    const feito = vi.fn();
    render(<RegerarParcelas api={edicao} onFeito={feito} />);
    await waitFor(() => expect(edicao.regerar).toHaveBeenCalledWith('manter_ajustes', true));
    expect((await screen.findAllByTestId('linha-antes-depois')).map((l) => l.getAttribute('data-marca'))).toEqual(['mudou', 'igual', 'nova']);
    expect(screen.getByTestId('base-do-regerar').textContent).toContain('regera R$ 2.600,00 em 2 parcela(s)');
    fireEvent.click(screen.getByRole('button', { name: 'Recalcular todas' }));
    await waitFor(() => expect(edicao.regerar).toHaveBeenCalledWith('recalcular_todas', true));
    expect(edicao.regerar.mock.calls.every((c) => c[1] === true)).toBe(true);
    fireEvent.click(await screen.findByTestId('confirmar-regerar'));
    await waitFor(() => expect(edicao.regerar).toHaveBeenCalledWith('recalcular_todas', false));
    await waitFor(() => expect(feito).toHaveBeenCalled());
  });
});

describe('(4) editar as parcelas à mão', () => {
  const P = (o: Partial<ParcelaParaEditar>): ParcelaParaEditar => ({ id: 'p1', numero: 1, vencimento: '2031-02-15', principal: 1000, juros: 10, ajustada: false, trava: null, ...o });
  it('a travada fica em leitura com o motivo; mexer marca "ajustada"; a diferença do saldo em laranja; o Salvar manda as mudanças', async () => {
    edicao.editarParcelas.mockClear();
    const fechar = vi.fn();
    render(<EditarParcelasDialog aberto aoFechar={fechar} api={edicao} ultimaOperacao={null}
      parcelas={[P({ trava: 'paga · não muda' }), P({ id: 'p2', numero: 2, vencimento: '2031-03-15' })]} />);
    const linhas = screen.getAllByTestId('linha-editar-parcela');
    expect(within(linhas[0]).getByTestId('trava-da-parcela').textContent).toBe('paga · não muda');
    expect(within(linhas[0]).queryByTestId('retirar-parcela')).toBeNull();
    expect((screen.getByTestId('salvar-parcelas') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(linhas[1]).getByTestId('retirar-parcela'));
    await waitFor(() => expect(edicao.editarParcelas).toHaveBeenCalledWith({ alterar: [], acrescentar: [], retirar: ['p2'] }, true));
    expect(await screen.findByTestId('diferenca-editar')).toBeTruthy();
    fireEvent.click(screen.getByTestId('acrescentar-parcela'));
    expect(within(screen.getAllByTestId('linha-editar-parcela')[1]).getByTestId('selo-ajustada')).toBeTruthy();
    fireEvent.click(screen.getByTestId('salvar-parcelas'));
    await waitFor(() => expect(edicao.editarParcelas).toHaveBeenLastCalledWith(
      { alterar: [], acrescentar: [{ data_vencimento: null, valor_principal: 0, valor_juros: 0 }], retirar: ['p2'] }, false));
    await waitFor(() => expect(fechar).toHaveBeenCalled());
  });
  it('"Desfazer a última" só com operação; pede motivo e chama o desfazer dela', async () => {
    edicao.desfazer.mockClear();
    render(<EditarParcelasDialog aberto aoFechar={vi.fn()} api={edicao} ultimaOperacao={{ id: 'op1', tipo: 'regerar', feitaEm: '2026-10-18' }} parcelas={[P({})]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer a última' }));
    fireEvent.click(screen.getByTestId('confirmar-desfazer'));
    expect(screen.getByTestId('recado-editar-parcelas').textContent).toBe('Informe o motivo para desfazer.');
    expect(edicao.desfazer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('motivo-desfazer'), { target: { value: 'errei a taxa' } });
    fireEvent.click(screen.getByTestId('confirmar-desfazer'));
    await waitFor(() => expect(edicao.desfazer).toHaveBeenCalledWith('op1', 'errei a taxa', false));
  });
});
