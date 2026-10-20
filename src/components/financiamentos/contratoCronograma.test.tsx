/**
 * FIN-CONTRATO-CRONOGRAMA-01 (Gabriel 20/10/2026) — a aba "Condições e cronograma" mostra e edita o cronograma do banco:
 * (1) UMA FONTE: a tela do contrato e a aba montam as parcelas editáveis pelo mesmo montador, das mesmas três leituras;
 * (2) o dono puro: o rodapé de total, o "saldo após", a faixa do principal contra o contratado (nunca corrige) e a frase do
 *     "Manter ajustes" sem nada a regerar;
 * (3) a tela: no Editar a tabela aparece com as parcelas do banco (C1/C2), Nº parcelas vale para todo sistema (C3), a paga fica cinza
 *     sem campo e sem ✕, o rodapé de total existe, o Regerar acontece no lugar da tabela, e o Salvar grava as linhas editadas.
 * Os contratos dos casos são SINTÉTICOS, no formato dos dois do relato (5 anuais com 2 pagas, Personalizado; 5 anuais SAC com a 1ª paga e
 * as 5 ajustadas).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ParcelaDoContrato } from '@/lib/financiamentos/situacaoDoContrato';
import type { ParcelaParaEditar } from '@/lib/financiamentos/edicaoDoContrato';

const P = (id: string, numero: number, venc: string, principal: number, juros: number, situacao: ParcelaDoContrato['situacao'], pagoEm: string | null): ParcelaDoContrato => ({
  id, numero, dataVencimento: venc, valorPrincipal: principal, valorJuros: juros, valorTotal: principal + juros, situacao, pagoEm,
  valorPago: situacao === 'paga' ? principal + juros : 0, lancamentoId: `l-${id}`, lancamentoJurosId: `j-${id}`, fonte: 'lancamento', diverge: false, detalhe: null,
});
/* o formato do C_778.324: Personalizado, 5 anuais de principal igual, 2 pagas; o principal não fecha por 2 centavos */
const PERSONALIZADO = [
  P('a1', 1, '2031-05-15', 1000.01, 500, 'paga', '2031-05-15'), P('a2', 2, '2032-05-15', 1000.01, 400, 'paga', '2032-05-15'),
  P('a3', 3, '2033-05-15', 1000.01, 300, 'pendente', null), P('a4', 4, '2034-05-15', 1000.01, 200, 'pendente', null),
  P('a5', 5, '2035-05-15', 1000.01, 100, 'pendente', null),
];
/* o formato do 8.233.040: SAC anual, a 1ª paga, as 5 ajustadas (gravadas pelo editarParcelas com os valores do extrato) */
const AJUSTADAS = [
  P('b1', 1, '2031-08-15', 2000, 900, 'paga', '2031-08-17'), P('b2', 2, '2032-08-15', 2000, 400, 'pendente', null),
  P('b3', 3, '2033-08-15', 2000, 300, 'pendente', null), P('b4', 4, '2034-08-15', 2000, 200, 'pendente', null),
  P('b5', 5, '2035-08-15', 2000, 100, 'pendente', null),
];

import {
  FRASE_MANTER_SEM_NADA, ajustadasDasGravadas, contaDoCronograma, faixaDoPrincipal, fraseDaRecusaDoRegerar, montarParcelasParaEditar,
} from '@/lib/financiamentos/edicaoDoContrato';

describe('(1) uma fonte: a tela do contrato e a aba montam as parcelas pelo mesmo montador', () => {
  it('as duas telas chamam `montarParcelasParaEditar` com a situação, a ajustada e os vínculos', () => {
    const tela = readFileSync('src/pages/FinanciamentoDetalhe.tsx', 'utf8');
    const hook = readFileSync('src/hooks/useEdicaoDoContrato.ts', 'utf8');
    const cad = readFileSync('src/components/financiamentos/CadastroDeContratoDialog.tsx', 'utf8');
    expect(tela).toMatch(/montarParcelasParaEditar\(linhas, ajustadas, credito\.vinculos\)/);
    expect(tela).toMatch(/ajustadasDasGravadas\(parcelas\)/);
    expect(hook).toMatch(/montarParcelasParaEditar\(situacao\.data\.parcelas, ajustadasDasGravadas\(gravadas\.data\), vinculos\.data \?\? \[\]\)/);
    /* as MESMAS chaves de cache (a mesma leitura): a situação com detalhe, as parcelas gravadas, os vínculos */
    expect(hook).toMatch(/\[CHAVE_SITUACAO_DO_CONTRATO, financiamentoId, hoje, 'detalhe'\]/);
    expect(hook).toMatch(/queryKey: \['financiamento-parcelas', financiamentoId\]/);
    expect(hook).toMatch(/queryKey: \['contrato-vinculos-pagamento', financiamentoId\]/);
    /* a aba lê `edicao.parcelas` (C1: nunca o `form.parcelas` vazio do contrato gravado) */
    expect(cad).toMatch(/const parcelasDoBanco = edicao\.parcelas \?\? null;/);
  });
  it('os dois casos: a paga trava; a vinculada trava; a ajustada vem de `financiamento_parcelas`', () => {
    const gravadas = AJUSTADAS.map((p) => ({ id: p.id, ajustada: true, status: p.situacao === 'paga' ? 'pago' : 'pendente' }));
    const b = montarParcelasParaEditar(AJUSTADAS, ajustadasDasGravadas(gravadas), [{ parcelaId: 'b3' }]);
    expect(b.map((l) => [l.numero, l.ajustada, l.trava])).toEqual([
      [1, true, 'paga · não muda'], [2, true, null], [3, true, 'pagamento vinculado · desvincule antes'], [4, true, null], [5, true, null]]);
    const a = montarParcelasParaEditar(PERSONALIZADO, ajustadasDasGravadas([{ id: 'a1', ajustada: false }, { id: 'a9', ajustada: true, status: 'cancelado' }]), []);
    expect(a.map((l) => [l.trava !== null, l.ajustada, l.pagoEm])).toEqual([[true, false, '2031-05-15'], [true, false, '2032-05-15'], [false, false, null], [false, false, null], [false, false, null]]);
  });
});

describe('(2) o dono puro', () => {
  it('o rodapé soma em centavos; o saldo após é o contratado menos o principal acumulado; a faixa diz quanto falta e nunca corrige', () => {
    const c = contaDoCronograma(montarParcelasParaEditar(PERSONALIZADO, new Set(), []), 5000.07);
    expect([c.principal, c.juros, c.total, c.pagas, c.parcelas]).toEqual([5000.05, 1500, 6500.05, 2, 5]);
    expect(c.saldoApos).toEqual([4000.06, 3000.05, 2000.04, 1000.03, 0.02]);
    expect(faixaDoPrincipal(c)).toEqual({ texto: '5 parcelas · principal R$ 5.000,05', conferencia: 'falta R$ 0,02 para o contratado', confere: false });
    expect(faixaDoPrincipal(contaDoCronograma(montarParcelasParaEditar(AJUSTADAS, new Set(), []), 10000)).conferencia).toBe('= valor contratado ✓');
    expect(faixaDoPrincipal(contaDoCronograma([{ principal: 101, juros: 0 }], 100)).conferencia).toBe('sobra R$ 1,00 sobre o contratado');
  });
  it('"Manter ajustes" sem parcela livre: a frase explica; sem ajustadas em aberto, a recusa do banco passa como veio', () => {
    expect(fraseDaRecusaDoRegerar('Nenhuma parcela em aberto para regerar.', { modo: 'manter_ajustes', ajustadasEmAberto: 4 }))
      .toEqual({ frase: FRASE_MANTER_SEM_NADA, campo: null, semNada: true });
    expect(fraseDaRecusaDoRegerar('Nenhuma parcela em aberto para regerar.', { modo: 'manter_ajustes', ajustadasEmAberto: 0 }).frase).toBe('Nenhuma parcela em aberto para regerar.');
    expect(fraseDaRecusaDoRegerar('Nenhuma parcela em aberto para regerar.', { modo: 'recalcular_todas', ajustadasEmAberto: 4 }).frase).toBe('Nenhuma parcela em aberto para regerar.');
  });
});

/* ═══ (3) a tela ═══════════════════════════════════════════════════════════════════════════════════════════════════════ */
const ANTES = AJUSTADAS.map((p) => ({ id: p.id, numero_parcela: p.numero, data_vencimento: p.dataVencimento, valor_principal: p.valorPrincipal, valor_juros: p.valorJuros,
  valor_total: p.valorTotal, status: p.situacao === 'paga' ? 'pago' : 'pendente', ajustada: true }));
const edicao: {
  parcelas: ParcelaParaEditar[] | null; ultimaOperacao: null;
  salvarCabecalho: ReturnType<typeof vi.fn>; editarParcelas: ReturnType<typeof vi.fn>; regerar: ReturnType<typeof vi.fn>; desfazer: ReturnType<typeof vi.fn>;
} = {
  parcelas: null, ultimaOperacao: null,
  salvarCabecalho: vi.fn(async () => ({ simulado: false, recusa: null, corpo: { cronograma_mudou: false } })),
  editarParcelas: vi.fn(async (_m: unknown, simular: boolean) => ({ simulado: simular, recusa: null, corpo: {} })),
  regerar: vi.fn(async (modo: string, simular: boolean) => (modo === 'manter_ajustes'
    ? { simulado: simular, recusa: 'Nenhuma parcela em aberto para regerar.', corpo: {} }
    : { simulado: simular, recusa: null, corpo: { antes: ANTES, depois: ANTES.map((a, i) => (i === 0 ? a : { ...a, valor_juros: a.valor_juros + 10, ajustada: false })),
        base: { saldo: 8000, guardado: 0, principal: 8000, parcelas: 4, sistema: 'sac', taxa_aa: 7, periodicidade: 'anual' }, diferenca_do_saldo: 0 } })),
  desfazer: vi.fn(async () => ({ simulado: false, recusa: null, corpo: {} })),
};
vi.mock('@/hooks/useEdicaoDoContrato', () => ({ useEdicaoDoContrato: () => edicao }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'c1', nome: 'Cliente Teste' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFinanciamentoCadastro', () => ({ useFinanciamentoCadastro: () => ({ contas: [], classificacoes: [] }) }));
vi.mock('@/hooks/useContratoDeCredito', () => ({ useContratoDeCredito: () => ({ documentos: [] }) }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/components/financeiro-v2/NovoFornecedorDialog', () => ({ NovoFornecedorDialog: () => null }));
const CONTRATO: Record<string, unknown> = {
  id: 'f1', natureza: 'financiamento', tipo_financiamento: 'pecuaria', descricao: 'Custeio sintético', numero_contrato: 'SINT-1',
  credor_id: 'cr1', conta_bancaria_id: 'ct1', fazenda_id: 'fz1', valor_total: 10000, data_contrato: '2030-08-10', data_primeira_parcela: '2031-08-15',
  total_parcelas: 5, taxa_juros: 7, taxa_juros_mensal: null, sistema_amortizacao: 'sac', periodicidade: 'anual', tipo_taxa: 'pos', carencia_ate: null,
  plano_principal_id: 'pl1', plano_juros_id: 'pl2', garantias: null, observacao: null, finalidade: 'custeio', linha_credito_id: null,
  financeiro_fornecedores: { nome: 'SINT BANCO' },
};
vi.mock('@/integrations/supabase/client', () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, { select: () => q, eq: () => q, maybeSingle: async () => ({ data: CONTRATO, error: null }), then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok) });
  return { supabase: { from: () => q, rpc: () => Promise.resolve({ data: null, error: null }) } };
});

import { CadastroDeContratoDialog } from './CadastroDeContratoDialog';
import { RegerarParcelas } from './EdicaoDoContrato';

const abrir = async (parcelas: ParcelaParaEditar[] | null, contrato: Record<string, unknown> = {}) => {
  edicao.parcelas = parcelas;
  Object.assign(CONTRATO, { sistema_amortizacao: 'sac', ...contrato });
  render(<CadastroDeContratoDialog aberto aoFechar={vi.fn()} financiamentoId="f1" />);
  await waitFor(() => expect(screen.getByTestId('titulo-do-cadastro').textContent).toContain('SINT-1'));
  fireEvent.click(screen.getByRole('button', { name: 'Condições e cronograma' }));
};

describe('(3) a aba Condições e cronograma no Editar', () => {
  it('C1/C2: a tabela aparece com as parcelas do banco; a paga fica cinza sem campo e sem ✕; o rodapé soma e diz "X de N pagas"', async () => {
    await abrir(montarParcelasParaEditar(PERSONALIZADO, new Set(), []), { sistema_amortizacao: 'livre', valor_total: 5000.07 });
    const tabela = screen.getByTestId('tabela-da-aba-condicoes');
    const linhas = within(tabela).getAllByTestId('linha-editar-parcela');
    expect(linhas).toHaveLength(5);
    expect(within(linhas[0]).queryByTestId('retirar-parcela')).toBeNull();
    expect(within(linhas[0]).queryByRole('textbox')).toBeNull();
    expect(within(linhas[2]).getByTestId('retirar-parcela')).toBeTruthy();
    expect(within(linhas[2]).getAllByRole('textbox').length).toBeGreaterThanOrEqual(2);
    const total = within(tabela).getByTestId('total-do-cronograma');
    expect(total.textContent).toContain('5.000,05');
    expect(total.textContent).toContain('2 de 5 pagas');
    expect(screen.getByTestId('conferencia-do-principal').textContent).toBe('falta R$ 0,02 para o contratado');
  });
  it('C3: "Nº parcelas" e "1º vencimento" valem para todo sistema (o Personalizado inclusive)', async () => {
    await abrir(montarParcelasParaEditar(PERSONALIZADO, new Set(), []), { sistema_amortizacao: 'livre' });
    expect(within(screen.getByTestId('condicoes-linha-2')).getByTestId('n-parcelas')).toBeTruthy();
    expect(within(screen.getByTestId('condicoes-linha-2')).getByText('1º vencimento *')).toBeTruthy();
  });
  it('o Salvar grava as linhas editadas pelo `editarParcelas` (só o que mudou); o cabeçalho igual não vai', async () => {
    edicao.salvarCabecalho.mockClear(); edicao.editarParcelas.mockClear();
    await abrir(montarParcelasParaEditar(AJUSTADAS, new Set(AJUSTADAS.map((p) => p.id)), []));
    const linha2 = within(screen.getByTestId('tabela-da-aba-condicoes')).getAllByTestId('linha-editar-parcela')[1];
    const [, juros] = within(linha2).getAllByRole('textbox').filter((e) => e.getAttribute('inputmode') === 'decimal');
    fireEvent.focus(juros); fireEvent.change(juros, { target: { value: '450,00' } }); fireEvent.blur(juros);
    expect((screen.getByTestId('abrir-regerar') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByTestId('salvar-cadastro')); });
    expect(edicao.salvarCabecalho).not.toHaveBeenCalled();
    expect(edicao.editarParcelas).toHaveBeenCalledWith({ alterar: [{ id: 'b2', valor_juros: 450 }], acrescentar: [], retirar: [] }, false);
  });
  it('o Regerar acontece no lugar da tabela: a faixa, o antes × depois com o mesmo rodapé de total, e "Voltar"', async () => {
    await abrir(montarParcelasParaEditar(AJUSTADAS, new Set(AJUSTADAS.map((p) => p.id)), []));
    fireEvent.click(screen.getByTestId('abrir-regerar'));
    /* "Manter ajustes" sem parcela livre: a frase explica e o gravar fica apagado */
    expect(await screen.findByTestId('recusa-do-regerar')).toHaveTextContent(FRASE_MANTER_SEM_NADA);
    expect((screen.getByTestId('confirmar-regerar') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('tabela-da-aba-condicoes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Recalcular todas' }));
    expect(await screen.findByTestId('total-antes-depois')).toBeTruthy();
    expect(screen.getByTestId('base-do-regerar').textContent).toContain('Regerar 4 em aberto');
    expect(screen.getByTestId('base-do-regerar').textContent).toContain('a 1 paga fica');
    fireEvent.click(screen.getByTestId('voltar-do-regerar'));
    expect(screen.getByTestId('tabela-da-aba-condicoes')).toBeTruthy();
  });
});

describe('(3b) o selo "ajustada" mora num lugar próprio', () => {
  it('na tabela de edição ele fica na célula Situação, nunca na do Nº nem na do vencimento', async () => {
    await abrir(montarParcelasParaEditar(AJUSTADAS, new Set(AJUSTADAS.map((p) => p.id)), []));
    const linha = within(screen.getByTestId('tabela-da-aba-condicoes')).getAllByTestId('linha-editar-parcela')[1];
    const celulas = linha.querySelectorAll('td');
    expect(within(celulas[0]).queryByTestId('selo-ajustada')).toBeNull();
    expect(within(celulas[1]).queryByTestId('selo-ajustada')).toBeNull();
    expect(within(celulas[7]).getByTestId('selo-ajustada')).toBeTruthy();
  });
  it('no antes × depois ele tem coluna própria', async () => {
    render(<RegerarParcelas api={edicao as never} onFeito={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Recalcular todas' }));
    const linha = (await screen.findAllByTestId('linha-antes-depois'))[0];
    const celulas = linha.querySelectorAll('td');
    expect(within(celulas[celulas.length - 1]).getByTestId('selo-ajustada')).toBeTruthy();
    expect(within(celulas[0]).queryByTestId('selo-ajustada')).toBeNull();
  });
});
