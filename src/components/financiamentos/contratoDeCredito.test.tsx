/**
 * FIN-FINANC-28 · PASSO 4 — a tela do contrato de crédito.
 * (1) o cartão Saldo devedor é o de `fn_financiamento_saldo` (sem liberação: "?", nunca deduzido); (2) o total das liberações, ao
 * centavo; (3) o GESTO CONTRÁRIO das três remoções (liberação e documento pedem motivo; a recusa do banco fica no diálogo);
 * (4) "sem doc" na coluna Pendência da lista; (5) o dono puro (saldo após, avisos, destinações, encargos); (6) a peça não soma.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BlocoDestinacoes, BlocoDocumentos, BlocoLiberacoes, CabecalhoDoCredito } from './ContratoDeCredito';
import {
  avisosDoCronograma, encargosDoContrato, resumoDasDestinacoes, saldoAposDasParcelas, type LiberacaoDoContrato,
} from '@/lib/financiamentos/contratoDeCredito';
import { pendenciaCurta, textoDasPendencias } from '@/lib/financiamentos/listaDeFinanciamentos';
import { lerTelaDoContrato } from '@/lib/financiamentos/telaDoContrato';
import type { ParcelaDoContrato, SaldoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';

type Api = Parameters<typeof BlocoLiberacoes>[0]['api'];

const LIB = (o: Partial<LiberacaoDoContrato> = {}): LiberacaoDoContrato => ({
  id: 'lib-1', data: '2025-11-21', valor: 318465, forma: 'conta', lancamentoId: null, lancamento: null, fornecedorId: null, fornecedorNome: null,
  contratoLiquidadoId: null, contratoLiquidadoNumero: null, destinacaoId: null, observacao: null, ...o,
});
const api = (o: Partial<Api> = {}): Api => ({
  tela: null, erroDaTela: null, relerTela: vi.fn(),
  liberacoes: [LIB(), LIB({ id: 'lib-2', data: '2025-12-22', valor: 636930.01, lancamentoId: 'lanc-9', lancamento: { descricao: 'BRDE', data: '2025-12-22', conta: 'Sicredi' } })],
  destinacoes: [{ id: 'd-1', descricao: 'Recuperação de solo', orcado: 955395 }],
  documentos: [{ id: 'doc-1', especie: 'aditivo', nome: 'aditivo.pdf', storagePath: 'c/financiamentos/f/doc-1.pdf', criadoEm: '2026-10-17T10:00:00Z', enviadoPor: 'Gabriel' }],
  encargos: [], erroDeLeitura: null,
  salvarLiberacao: vi.fn(async () => null), removerLiberacao: vi.fn(async () => null), salvarDestinacao: vi.fn(async () => null),
  removerDestinacao: vi.fn(async () => null), enviarDocumento: vi.fn(async () => null), removerDocumento: vi.fn(async () => null),
  urlDoDocumento: vi.fn(async () => null), lerCaptacoesLivres: vi.fn(async () => []), lerContratosAnteriores: vi.fn(async () => []),
  vinculos: [], buscar: vi.fn(async () => "x"), vincularPagamento: vi.fn(async () => "x"), desvincularPagamento: vi.fn(async () => "x"),
  lerEncargosPerto: vi.fn(async () => []), vincularEncargo: vi.fn(async () => null),
    baixaViva: null, darBaixa: vi.fn(async () => 'x'), desfazerBaixa: vi.fn(async () => null), lerSucessores: vi.fn(async () => []),
    lerJuntaveis: vi.fn(async () => []), juntar: vi.fn(async () => 'x'), desfazerJuncao: vi.fn(async () => 'x'),
  ...o,
});
const SALDO = (o: Partial<SaldoDoContrato> = {}): SaldoDoContrato => ({
  aplicaSaldo: true, regra: 'calculado', contratado: 955395, liberado: 955395, liberacoes: 2, amortizado: 0, saldo: 955395,
  jurosPagos: 0, jurosPrevistos: 559532.35, foraDasSomas: false, pendencias: [], ...o,
});
const cabecalho = (saldo: SaldoDoContrato | null) => render(
  <CabecalhoDoCredito numero="PR-78.192" credor="BANCO REGIONAL DE DESENVOLVIMENTO DO EXTREMO SUL" documento="92.816.560/0001-37" credorTitle="BRDE · 92.816.560/0001-37"
    descricao="Recuperação de Solo" subtitulo="9,01 % a.a. · SAC" saldo={saldo} jurosAVencer={559532.35} proxVencimento="2026-10-01" valorDaProx={86081.9}
    onEditar={() => undefined} onDocumentos={() => undefined} />,
);

describe('(1) o cartão Saldo devedor é o do banco', () => {
  it('com liberação: o número de fn_financiamento_saldo, como veio (a tela não deduz nada)', () => {
    cabecalho(SALDO({ saldo: 123456.78, liberado: 200000 }));
    expect(screen.getByTestId('cartao-saldo').textContent).toBe('Saldo devedorR$ 123.456,78');
    expect(screen.getByTestId('cartao-liberado').textContent).toBe('Liberado (2)R$ 200.000,00');
    expect(screen.getByTestId('cartao-proxima').textContent).toBe('Próx. parcela · 01/10/26R$ 86.081,90');
  });
  it('sem liberação gravada: "?" com o porquê no title, nunca o contratado', () => {
    cabecalho(SALDO({ liberado: null, saldo: null, liberacoes: 0 }));
    expect(screen.getByTestId('cartao-saldo').textContent).toBe('Saldo devedor?');
    expect(screen.getByTestId('cartao-saldo').getAttribute('title')).toContain('não se deduz do contratado');
    expect(screen.getByTestId('cartao-liberado').textContent).toBe('Liberado (0)?');
  });
  it('o credor pelo nome do cadastro inteiro, com o documento ao lado e "Nome · doc" no title', () => {
    cabecalho(SALDO());
    expect(screen.getByTestId('credor-do-contrato').textContent).toBe('BANCO REGIONAL DE DESENVOLVIMENTO DO EXTREMO SUL');
    expect(screen.getByTestId('documento-do-credor').textContent).toBe('92.816.560/0001-37');
  });
});

describe('(2) o total das liberações — TELA v3: os números vêm de fn_contrato_tela', () => {
  /* a leitura da tela: entrou = o lançamento vinculado limitado à liberação; a identificar = valor − entrou; os totais prontos */
  const TELA = lerTelaDoContrato({
    condicoes: { taxa: null, unidade: null, taxa_aa: null, sistema: null, carencia_ate: null, tipo_taxa: null, periodicidade: null },
    contrato: { data_contrato: null, vencimento_final: null, atividade: null, credor: null, credor_documento: null, primeira_liberacao: null, ultima_liberacao: null, vencidas: 0 },
    liberacoes: [
      { id: 'lib-1', data: '2025-11-21', forma: 'conta', valor: 318465, destinacao_id: null, destino: null, lancamento_id: null, entrou: 0, a_identificar: 318465, excedente: 0 },
      { id: 'lib-2', data: '2025-12-22', forma: 'conta', valor: 636930.01, destinacao_id: 'd-1', destino: 'Recuperação de solo', lancamento_id: 'lanc-9', entrou: 636930.01, a_identificar: 0, excedente: 120 },
    ],
    liberacoes_total: { qtde: 2, liberado: 955395.01, entrou: 636930.01, a_identificar: 318465, excedente: 120 },
    pagamentos: [], pagamentos_total: { qtde: 0, principal: 0, juros: 0, encargos: 0, total: 0 }, historico: [], a_resolver: [],
  });
  it('total, entrou e a identificar são os do banco; o excedente aparece "+X a mais"; o destino é coluna', () => {
    expect(TELA).not.toBeNull();
    render(<BlocoLiberacoes api={api({ tela: TELA })} contaDoContrato="Conta do contrato" onAbrirLancamento={() => undefined} clienteId="cli" />);
    expect(screen.getByTestId('total-liberacoes').textContent).toBe('955.395,01');
    expect(screen.getByTestId('total-a-identificar').textContent).toBe('318.465,00');
    expect(screen.getAllByTestId('a-identificar').map((c) => c.textContent)).toEqual(['318.465,00', '+120,00 a mais']);
    expect(screen.getAllByTestId('entrou-na-conta').map((c) => c.textContent)).toEqual(['0,00', '636.930,01']);
    expect(screen.getAllByTestId('destino-da-liberacao').map((c) => c.textContent)).toEqual(['—', 'Recuperação de solo']);
    /* em conta sem lançamento = "a casar"; com lançamento = ↔ que abre no Financeiro */
    expect(screen.getAllByTestId('linha-liberacao')[0].textContent).toContain('a casar');
    expect(screen.getByTestId('liberacao-vinculada').textContent).toBe('↔ 22/12/25');
  });
  it('sem a leitura da tela, "…" — nunca zero inventado; sem liberação, o bloco diz o vazio', () => {
    render(<BlocoLiberacoes api={api({ liberacoes: [] })} contaDoContrato={null} onAbrirLancamento={() => undefined} clienteId="cli" />);
    expect(screen.getByTestId('liberacoes-vazio')).toBeTruthy();
    expect(screen.getByTestId('total-liberacoes').textContent).toBe('…');
  });
});

describe('(3) o gesto contrário', () => {
  it('remover liberação: sem motivo não vai ao banco; com motivo, a RPC de remover com o id e o motivo', async () => {
    const a = api();
    render(<BlocoLiberacoes api={a} contaDoContrato={null} onAbrirLancamento={() => undefined} clienteId="cli" />);
    fireEvent.click(screen.getAllByTestId('remover-liberacao')[1]);
    expect(screen.getByTestId('dialogo-remover').textContent).toContain('deixa de estar ligado ao contrato');
    fireEvent.click(screen.getByTestId('confirmar-remover'));
    expect(screen.getByTestId('erro-remover').textContent).toBe('Informe o motivo.');
    expect(a.removerLiberacao).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('motivo-remover'), { target: { value: 'lançada em dobro' } });
    fireEvent.click(screen.getByTestId('confirmar-remover'));
    await waitFor(() => expect(a.removerLiberacao).toHaveBeenCalledWith('lib-2', 'lançada em dobro'));
    await waitFor(() => expect(screen.queryByTestId('dialogo-remover')).toBeNull());
  });
  it('remover destinação: a RPC; a recusa do banco (liberação viva nela) fica ESCRITA no diálogo, que não fecha', async () => {
    const a = api({ removerDestinacao: vi.fn(async () => 'Esta destinação tem 1 liberação(ões): tire a destinação delas antes.') });
    render(<BlocoDestinacoes api={a} />);
    fireEvent.click(screen.getByTestId('remover-destinacao'));
    fireEvent.click(screen.getByTestId('confirmar-remover'));
    await waitFor(() => expect(a.removerDestinacao).toHaveBeenCalledWith('d-1'));
    expect(screen.getByTestId('erro-remover').textContent).toBe('Esta destinação tem 1 liberação(ões): tire a destinação delas antes.');
    expect(screen.getByTestId('dialogo-remover')).toBeTruthy();
  });
  it('remover documento: motivo obrigatório e a RPC de remover (o arquivo fica guardado)', async () => {
    const a = api();
    render(<BlocoDocumentos api={a} />);
    fireEvent.click(screen.getByTestId('remover-documento'));
    fireEvent.change(screen.getByTestId('motivo-remover'), { target: { value: 'arquivo errado' } });
    fireEvent.click(screen.getByTestId('confirmar-remover'));
    await waitFor(() => expect(a.removerDocumento).toHaveBeenCalledWith('doc-1', 'arquivo errado'));
  });
  it('sem cédula viva, a linha "Cédula — falta" em laranja; com cédula, some', () => {
    const { unmount } = render(<BlocoDocumentos api={api()} />);
    expect(screen.getByTestId('falta-cedula').textContent).toContain('falta');
    unmount();
    render(<BlocoDocumentos api={api({ documentos: [{ id: 'c', especie: 'cedula', nome: 'cedula.pdf', storagePath: 'x', criadoEm: '2026-10-17T10:00:00Z', enviadoPor: null }] })} />);
    expect(screen.queryByTestId('falta-cedula')).toBeNull();
  });
});

describe('(4) "sem doc" na lista', () => {
  it('a pendência do banco vira "sem doc" na coluna estreita e por extenso no title', () => {
    expect(pendenciaCurta(['sem_documento'])).toBe('sem doc');
    expect(pendenciaCurta(['sem_liberacao', 'sem_documento'])).toBe('sem lib. +1');
    expect(textoDasPendencias(['sem_documento'])).toBe('falta a cédula do contrato');
  });
});

const PAR = (o: Partial<ParcelaDoContrato>): ParcelaDoContrato => ({
  id: 'p', numero: 1, dataVencimento: '2026-10-01', valorPrincipal: 0, valorJuros: 0, valorTotal: 0, situacao: 'pendente',
  pagoEm: null, valorPago: 0, lancamentoId: null, lancamentoJurosId: null, fonte: 'lancamento', diverge: false, detalhe: null, ...o,
});
describe('(5) o dono puro', () => {
  it('saldo após = contratado − principal acumulado, em centavos; sem contratado, nulo', () => {
    const ps = [PAR({ id: 'a', valorPrincipal: 0 }), PAR({ id: 'b', valorPrincipal: 119425.51 }), PAR({ id: 'c', valorPrincipal: 0.1 })];
    expect([...saldoAposDasParcelas(955395, ps).values()]).toEqual([955395, 835969.49, 835969.39]);
    expect([...saldoAposDasParcelas(null, ps).values()]).toEqual([null, null, null]);
  });
  it('avisos: o principal que não fecha com o contratado, e a 1ª parcela com o período inteiro de juros depois da liberação', () => {
    const ps = [
      PAR({ id: 'a', dataVencimento: '2026-10-01', valorJuros: 86081.9 }),
      PAR({ id: 'b', dataVencimento: '2027-10-01', valorJuros: 86081.9 }),
    ];
    const av = avisosDoCronograma({ contratado: 955395, somaPrincipal: 955404.08, parcelas: ps, primeiraLiberacao: '2025-11-21' });
    expect(av[0]).toBe('O principal das parcelas soma 955.404,08 — 9,08 acima do contratado (955.395,00).');
    expect(av[1]).toContain('a 1ª liberação foi em 21/11/25');
    /* liberação no começo do período: nada a dizer; principal que fecha: nada a dizer */
    expect(avisosDoCronograma({ contratado: 955395, somaPrincipal: 955395, parcelas: ps, primeiraLiberacao: '2025-10-05' })).toEqual([]);
  });
  it('destinações: orçado × liberado pelas liberações apontadas; encargos somados', () => {
    const r = resumoDasDestinacoes([{ id: 'd', descricao: 'Solo', orcado: 1000 }], [LIB({ valor: 250, destinacaoId: 'd' }), LIB({ valor: 1 })]);
    expect(r.linhas[0]).toEqual({ id: 'd', descricao: 'Solo', orcado: 1000, liberado: 250, pct: 25 });
    expect(encargosDoContrato([{ papel: 'iof', valor: -10.1 }, { papel: 'tarifa', valor: 0.2 }])).toEqual({ total: 10.3, papeis: 'iof · tarifa' });
    expect(encargosDoContrato([])).toBeNull();
  });
});

describe('(6) a peça só desenha', () => {
  it('nenhuma soma no componente (os números são do banco e do dono puro)', () => {
    const fonte = readFileSync(resolve(__dirname, './ContratoDeCredito.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const soma = (t: string) => /\.reduce\(|\+=\s*[a-zA-Z(]/.test(t);
    expect(soma('const t = xs.reduce((a, b) => a + b, 0)')).toBe(true);
    expect(soma(fonte)).toBe(false);
  });
});
