/**
 * P143 PAGAMENTO-PARCELAS-01 — as parcelas da compra na aba Pagamento (dado SINTETICO).
 * Q1 as linhas e os totais do PARCELAMENTO vem do banco (`fn_financiamento_situacao`), nada somado da lista · Q2 a situacao da SOLTA pela
 * regra da tela do contrato · Q3 as linhas das SOLTAS pela regra do P95/P104 (mesma fracao, ±5 centavos, um por k) e o "juntar" so' com as N
 * · Q4 a tabela: a aberta destacada e sem clique, as outras abrem no mesmo modal, o selo da casa, os totais · Q5 a solta no bloco: a tabela
 * das irmas, "Juntar num parcelamento" com a previa do banco e a recusa em frase · Q6 a forma gravada fora da lista ("valor atual").
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ParcelasNoPagamento } from './ParcelasNoPagamento';
import { ParcelarEsteLancamento } from './ParcelarEsteLancamento';
import { idsParaJuntar, linhasDaNota, linhasDasSoltas, linhasDoContrato, situacaoDoLancamento, totaisDoContrato, type LinhaDaParcela } from '@/lib/financeiro/parcelasNoPagamento';
import { lerSituacaoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';
import { FORMAS_PAGAMENTO_V2, FORMA_PAGAMENTO_V2_NENHUMA, formaForaDaLista } from '@/lib/financeiro/formasPagamentoV2';
import type { GravadoresDaJuncao } from '@/lib/financeiro/juntarParcelas';
import { numeroDaNota } from '@/lib/financeiro/parcelaSolta';
import type { LancamentoParaParcelar } from '@/lib/financeiro/parcelarLancamento';

/* a resposta da fn_financiamento_situacao, sintetica: 4 parcelas de 239,99, a 1 paga, a 2 vencida, a 3 e a 4 a vencer */
const parcela = (numero: number, situacao: string, extra: Record<string, unknown> = {}) => ({
  id: `p${numero}`, numero, data_vencimento: `2026-0${numero + 5}-16`, valor_principal: 239.99, valor_juros: 0, valor_total: 239.99, situacao,
  pago_em: situacao === 'paga' ? '2026-06-16' : null, valor_pago: situacao === 'paga' ? 239.99 : 0, lancamento_id: `lanc-${numero}`,
  lancamento_juros_id: null, fonte: 'lancamento', diverge: false, conta_nome: 'Cartão Sintetico Visa', documentos: [], boletos: 0, ...extra,
});
const SITUACAO = {
  parcelas: [parcela(3, 'pendente'), parcela(1, 'paga'), parcela(2, 'vencida'), parcela(4, 'pendente')],
  cartoes: { valor_contrato: 959.96, pago: 239.99, a_vencer: 479.98, vencido: 239.99, adiado: 0, adiado_qtde: 0, pagas: 1, parcelas: 4,
    juros_previstos: 0, soma_principal: 959.96, soma_total: 959.96, divergentes: 0 },
};

describe('Q1 — o parcelamento: linhas e totais do banco', () => {
  const s = lerSituacaoDoContrato(SITUACAO);
  if (!s) throw new Error('a situacao sintetica nao leu');
  it('as linhas na ordem do numero, com a situacao e a conta que o banco deu', () => {
    expect(linhasDoContrato(s).map((l) => [l.numero, l.total, l.situacao, l.lancamentoId, l.valorCent, l.conta])).toEqual([
      [1, 4, 'paga', 'lanc-1', 23999, 'Cartão Sintetico Visa'], [2, 4, 'vencida', 'lanc-2', 23999, 'Cartão Sintetico Visa'],
      [3, 4, 'pendente', 'lanc-3', 23999, 'Cartão Sintetico Visa'], [4, 4, 'pendente', 'lanc-4', 23999, 'Cartão Sintetico Visa']]);
    expect(linhasDoContrato(s)[0]).toMatchObject({ vencimento: '2026-06-16', pagamento: '2026-06-16' });
  });
  it('os totais sao os do banco (cartoes), nao a soma da lista', () => {
    expect(totaisDoContrato(s.cartoes)).toEqual({ qtd: 4, totalCent: 95996, pagasQtd: 1, pagasCent: 23999, aPagarQtd: 3, aPagarCent: 71997 });
    const outro = lerSituacaoDoContrato({ ...SITUACAO, cartoes: { ...SITUACAO.cartoes, valor_contrato: 1000, pago: 1 } });
    if (!outro) throw new Error('nao leu');
    expect(totaisDoContrato(outro.cartoes)).toMatchObject({ totalCent: 100000, pagasCent: 100 });
  });
});

describe('Q2 — a situacao da solta pela regra da tela do contrato', () => {
  it('realizado/conciliado = paga; nao paga com vencimento antes de hoje = vencida; senao a vencer', () => {
    expect(situacaoDoLancamento('realizado', '2026-01-01', '2026-10-29')).toBe('paga');
    expect(situacaoDoLancamento('conciliado', null, '2026-10-29')).toBe('paga');
    expect(situacaoDoLancamento('programado', '2026-10-28', '2026-10-29')).toBe('vencida');
    expect(situacaoDoLancamento('programado', '2026-10-29', '2026-10-29')).toBe('pendente');
    expect(situacaoDoLancamento('previsto', null, '2026-10-29')).toBe('pendente');
  });
});

describe('Q3 — as soltas: a regra do P95/P104 e o juntar', () => {
  const propria = { id: 'l2', descricao: 'Peca sintetica - 2/3', valorCent: 50000, vencimento: '2026-11-10', status: 'programado' };
  const irmas = [
    { id: 'l1', descricao: 'Peca sintetica - 1/3', valorCent: 50004, vencimento: '2026-10-10', pagamento: '2026-10-10', status: 'realizado', conta: 'Conta Sintetica' },
    { id: 'l3', descricao: 'Peca sintetica - 3/3', valorCent: 49996, vencimento: '2026-12-10', status: 'programado' },
    { id: 'lx', descricao: 'Outra sintetica - 3/3', valorCent: 50001, vencimento: '2026-12-10', status: 'programado' },
    { id: 'ly', descricao: 'Peca sintetica - 1/4', valorCent: 50000 },
    { id: 'lz', descricao: 'Peca sintetica - 1/3', valorCent: 80000 },
  ];
  /* ⚠ a regra do P95 (a do "achadas X de N") nao compara a descricao-base: o MESMO fornecedor (a busca filtra), a mesma fracao N e o valor
     a ±5 centavos. Por isso a "Outra sintetica - 3/3" (lx) conta quando a da k=3 de verdade nao entra — e a previa do juntar LISTA as N. */
  it('uma por k, mesma fracao N, ±5 centavos; a propria entra; ordem do k', () => {
    const l = linhasDasSoltas(propria, irmas, '2026-10-29', 5);
    expect(l.map((x) => [x.numero, x.total, x.lancamentoId, x.situacao])).toEqual([[1, 3, 'l1', 'paga'], [2, 3, 'l2', 'pendente'], [3, 3, 'l3', 'pendente']]);
    expect(l[0]).toMatchObject({ pagamento: '2026-10-10', conta: 'Conta Sintetica' });
    expect(linhasDasSoltas(propria, irmas, '2026-10-29', 3).map((x) => x.lancamentoId)).toEqual(['l2', 'lx']);
    expect(linhasDasSoltas(propria, irmas, '2026-10-29', 0).map((x) => x.numero)).toEqual([2]);
  });
  it('juntar so\' com as N, cada k uma vez', () => {
    expect(idsParaJuntar(linhasDasSoltas(propria, irmas, '2026-10-29', 5))).toEqual(['l1', 'l2', 'l3']);
    expect(idsParaJuntar(linhasDasSoltas(propria, irmas.filter((x) => x.id !== 'l3' && x.id !== 'lx'), '2026-10-29', 5))).toBeNull();
    expect(idsParaJuntar([])).toBeNull();
  });
  it('a que nao e\' parcela (sem "k/N") nao tem linhas', () => {
    expect(linhasDasSoltas({ ...propria, descricao: 'Peca sintetica' }, irmas, '2026-10-29', 5)).toEqual([]);
  });
});

const LINHAS: LinhaDaParcela[] = [1, 2, 3].map((k) => ({
  lancamentoId: `lanc-${k}`, numero: k, total: 3, vencimento: `2026-1${k - 1}-10`, pagamento: k === 1 ? '2026-10-10' : null, valorCent: 23999,
  situacao: k === 1 ? 'paga' : k === 2 ? 'vencida' : 'pendente', conta: 'Cartão Sintetico Visa de nome comprido',
}));

describe('Q4 — a tabela', () => {
  it('a aberta destacada e sem clique; as outras abrem no mesmo modal; o selo da casa; datas dd/mm/aaaa', () => {
    const onAbrir = vi.fn();
    render(<ParcelasNoPagamento linhas={LINHAS} abertaId="lanc-2" onAbrir={onAbrir} totais={{ qtd: 3, totalCent: 71997, pagasQtd: 1, pagasCent: 23999, aPagarQtd: 2, aPagarCent: 47998 }} />);
    const linhas = screen.getAllByTestId('parcela-no-pagamento');
    expect(linhas.map((l) => l.getAttribute('data-aberta'))).toEqual([null, 'sim', null]);
    fireEvent.click(linhas[1]);
    expect(onAbrir).not.toHaveBeenCalled();
    fireEvent.click(linhas[2]);
    expect(onAbrir).toHaveBeenCalledWith('lanc-3');
    expect(screen.getAllByTestId('parcela-no-pagamento-status').map((s) => s.textContent)).toEqual(['Paga', 'Vencida', 'A vencer']);
    expect(within(linhas[0]).getAllByText('10/10/2026')).toHaveLength(2);
    expect(within(linhas[2]).getByTitle('Cartão Sintetico Visa de nome comprido')).toBeTruthy();
    expect(screen.getByTestId('parcelas-no-pagamento-rodape').textContent).toBe('3 parcelas · R$ 719,97pagas 1 · R$ 239,99a pagar 2 · R$ 479,98');
  });
  it('sem onAbrir, nenhuma linha e\' clicavel; altura fixa do corpo (10 linhas de 19px)', () => {
    render(<ParcelasNoPagamento linhas={LINHAS} abertaId="lanc-1" rodape={<span>so o rodape</span>} />);
    expect(screen.getAllByTestId('parcela-no-pagamento').every((l) => !l.getAttribute('title')?.startsWith('Abrir'))).toBe(true);
    expect(screen.getByTestId('parcelas-no-pagamento-corpo').style.height).toBe('190px');
    expect(screen.getByTestId('parcelas-no-pagamento-rodape').textContent).toBe('so o rodape');
  });
});

describe('Q5 — a solta no bloco Parcelamento: as irmas e o juntar', () => {
  const LANC: LancamentoParaParcelar = {
    id: 'l2', valorCent: 50000, descricao: 'Peca sintetica - 2/3', dataCompetencia: '2026-10-10', fazendaId: 'faz-1', planoContaId: 'pl-1',
    safraId: null, cultura: null, fase: null, favorecidoId: 'f1', formaPagamento: 'Cartão', contaId: 'c1', escopo: 'pecuaria',
  };
  const ABERTO = { status: 'programado', dataPagamento: null, conciliadoEm: null };
  const IRMAS = [{ id: 'l1', descricao: 'Peca sintetica - 1/3', valorCent: 50000, vencimento: '2026-10-10', status: 'realizado' },
    { id: 'l3', descricao: 'Peca sintetica - 3/3', valorCent: 50000, vencimento: '2026-12-10', status: 'programado' }];
  const juncao = (resposta: unknown) => {
    const juntar = vi.fn(async (_c: string, _ids: readonly string[], _comp: string | null, _sim: boolean) => resposta);
    const g: GravadoresDaJuncao = { juntar, documentos: vi.fn(async () => []), editarDocumento: vi.fn(async () => undefined) };
    return { juntar, g };
  };
  const OK = { ok: true, parcelas: 3, soma: 1500, descricao: 'Peca sintetica', efeito_por_mes: [],
    lista: [1, 2, 3].map((k) => ({ numero: k, lancamento_id: `l${k}`, descricao: `Peca sintetica - ${k}/3`, vencimento: `2026-1${k - 1}-10`, valor: 500, status: 'programado' })) };
  const montar = (irmas: typeof IRMAS, g: GravadoresDaJuncao, onParcelado = vi.fn(), onAbrirParcela?: (id: string) => void) => {
    render(<ParcelarEsteLancamento clienteId="cli" lancamento={LANC} situacao={ABERTO} vencimentoAtual="2026-11-10"
      conta={{ id: 'c1', nome: 'Cartão Sintetico', cartao: true }} onParcelado={onParcelado} buscarIrmas={vi.fn(async () => irmas)}
      juncao={g} onAbrirParcela={onAbrirParcela} />);
    return { onParcelado };
  };
  it('a tabela das 3 irmas (a aberta destacada), "soltas, sem parcelamento" e o clique abre a outra', async () => {
    const abrir = vi.fn();
    montar(IRMAS, juncao(OK).g, vi.fn(), abrir);
    await waitFor(() => expect(screen.getAllByTestId('parcela-no-pagamento')).toHaveLength(3));
    expect(screen.getByTestId('parcela-solta-frase').textContent).toBe('Parcela 2/3 lançada solta (sem parcelamento) · achadas 3 de 3');
    expect(screen.getByTestId('parcelas-no-pagamento-rodape').textContent).toBe('soltas, sem parcelamento · achadas 3 de 3');
    expect(screen.getAllByTestId('parcela-no-pagamento')[1].getAttribute('data-aberta')).toBe('sim');
    fireEvent.click(screen.getAllByTestId('parcela-no-pagamento')[0]);
    expect(abrir).toHaveBeenCalledWith('l1');
  });
  it('faltando uma das N: "Juntar" apagado, com o porque no title', async () => {
    montar(IRMAS.slice(0, 1), juncao(OK).g);
    await waitFor(() => expect(screen.getAllByTestId('parcela-no-pagamento')).toHaveLength(2));
    expect(screen.getByTestId('parcela-solta-juntar')).toBeDisabled();
    expect(screen.getByTestId('parcela-solta-juntar').getAttribute('title')).toBe('Para juntar, as 3 parcelas têm de estar lançadas: achadas 2 de 3');
  });
  it('com as N: a previa (simulada, sem mudar a competencia) e o Juntar grava pela mesma funcao', async () => {
    const { juntar, g } = juncao(OK);
    const { onParcelado } = montar(IRMAS, g);
    await waitFor(() => expect(screen.getByTestId('parcela-solta-juntar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('parcela-solta-juntar'));
    await waitFor(() => expect(screen.getByTestId('parcela-solta-juntar-gravar')).toBeEnabled());
    expect(juntar).toHaveBeenLastCalledWith('cli', ['l1', 'l2', 'l3'], null, true);
    expect(screen.getByText(/As 3 parcelas ficam como estão/).textContent).toContain('R$ 1.500,00');
    expect(screen.getAllByTestId('parcela-solta-juntar-linha').map((l) => l.textContent)).toEqual([
      '1/3Peca sintetica - 1/310/10/2026500,00', '2/3Peca sintetica - 2/310/11/2026500,00', '3/3Peca sintetica - 3/310/12/2026500,00']);
    fireEvent.click(screen.getByTestId('parcela-solta-juntar-gravar'));
    await waitFor(() => expect(onParcelado).toHaveBeenCalled());
    expect(juntar).toHaveBeenLastCalledWith('cli', ['l1', 'l2', 'l3'], null, false);
  });
  it('a recusa do banco aparece em frase e o Juntar fica apagado', async () => {
    const { g } = juncao({ ok: false, recusa: { motivo: 'paga_conciliada', frase: 'A parcela 1/3 está conciliada: as N precisam estar abertas.' } });
    montar(IRMAS, g);
    await waitFor(() => expect(screen.getByTestId('parcela-solta-juntar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('parcela-solta-juntar'));
    await waitFor(() => expect(screen.getByTestId('parcela-solta-recusa').textContent).toBe('A parcela 1/3 está conciliada: as N precisam estar abertas.'));
    expect(screen.getByTestId('parcela-solta-juntar-gravar')).toBeDisabled();
  });
});

/* P143 (Gabriel 29/10 15:03) — o caso "Parcela 3 - None" da NF 4964: a descrição SEM "k/N"; as irmãs pela MESMA nota do mesmo fornecedor
   (aqui com dado sintético no mesmo formato: "4964 / 1", "4964", "4964"; duas pagas e a aberta) */
describe('Q7 — a solta pela NOTA (sem "k/N" na descrição)', () => {
  it('o nº da nota: sem pontos, antes da barra, sem os zeros da frente; o que não é número = nulo', () => {
    expect(['4964 / 1', '4964', '000.004.964', '4964-2', ' 4964 '].map(numeroDaNota)).toEqual(['4964', '4964', '4964', '4964', '4964']);
    expect([null, '', 'NF', '000', 'abc/1'].map(numeroDaNota)).toEqual([null, null, null, null, null]);
  });
  const PROPRIA = { id: 'n3', descricao: 'Parcela 3 - None', valorCent: 50000, vencimento: '2026-10-11', status: 'programado' };
  const IRMAS_NOTA = [{ id: 'n2', descricao: 'Manutencao sintetica', valorCent: 50000, vencimento: '2026-09-11', status: 'realizado', pagamento: '2026-09-11' },
    { id: 'n1', descricao: 'Manutencao sintetica Pecuaria', valorCent: 50000, vencimento: '2026-08-12', status: 'realizado', pagamento: '2026-08-12' }];
  it('as linhas na ordem do vencimento; a parcela = a posição, N = quantas são; sozinha = vazio', () => {
    const l = linhasDaNota(PROPRIA, IRMAS_NOTA, '2026-10-29');
    expect(l.map((x) => [x.numero, x.total, x.lancamentoId, x.situacao])).toEqual([[1, 3, 'n1', 'paga'], [2, 3, 'n2', 'paga'], [3, 3, 'n3', 'vencida']]);
    expect(idsParaJuntar(l)).toEqual(['n1', 'n2', 'n3']);
    expect(linhasDaNota(PROPRIA, [PROPRIA], '2026-10-29')).toEqual([]);
  });
  const LANC_NOTA: LancamentoParaParcelar = {
    id: 'n3', valorCent: 50000, descricao: 'Parcela 3 - None', dataCompetencia: '2026-07-13', fazendaId: 'faz-1', planoContaId: 'pl-1',
    safraId: null, cultura: null, fase: null, favorecidoId: 'f1', formaPagamento: 'Boleto', contaId: 'c1', escopo: 'pecuaria',
  };
  const juncaoOk = () => {
    const juntar = vi.fn(async (_c: string, _ids: readonly string[], _comp: string | null, _sim: boolean) => ({ ok: true, parcelas: 3, soma: 1500,
      descricao: 'Manutencao sintetica', efeito_por_mes: [], lista: [] }));
    const g: GravadoresDaJuncao = { juntar, documentos: vi.fn(async () => []), editarDocumento: vi.fn(async () => undefined) };
    return { juntar, g };
  };
  it('no bloco: a tabela das 3 da nota, a frase, o Resumo avisado e o Juntar com as 3 na ordem do vencimento', async () => {
    const { juntar, g } = juncaoOk();
    const buscarNota = vi.fn(async () => IRMAS_NOTA);
    const naoBusca = vi.fn(async () => null);
    const onSolta = vi.fn();
    render(<ParcelarEsteLancamento clienteId="cli" lancamento={LANC_NOTA} situacao={{ status: 'programado', dataPagamento: null, conciliadoEm: null }}
      vencimentoAtual="2026-10-11" conta={null} onParcelado={vi.fn()} buscarIrmas={naoBusca} buscarIrmasNota={buscarNota}
      numeroDocumento="4964" juncao={g} onParcelaSolta={onSolta} />);
    await waitFor(() => expect(screen.getAllByTestId('parcela-no-pagamento')).toHaveLength(3));
    expect(buscarNota).toHaveBeenCalledWith('cli', 'f1', '4964');
    expect(naoBusca).not.toHaveBeenCalled();
    expect(screen.queryByTestId('parcelar-este')).toBeNull();
    expect(screen.getByTestId('parcela-solta-frase').textContent).toBe('Parcela 3 de 3 da NF 4964 lançada solta (sem parcelamento)');
    expect(screen.getByTestId('parcelas-no-pagamento-rodape').textContent).toBe('soltas, sem parcelamento · 3 lançamentos da NF 4964');
    expect(screen.getAllByTestId('parcela-no-pagamento')[2].getAttribute('data-aberta')).toBe('sim');
    await waitFor(() => expect(onSolta).toHaveBeenLastCalledWith({ k: 3, n: 3 }));
    fireEvent.click(screen.getByTestId('parcela-solta-juntar'));
    await waitFor(() => expect(juntar).toHaveBeenLastCalledWith('cli', ['n1', 'n2', 'n3'], null, true));
  });
  it('a nota sem irmã (ou sem nº): o bloco de parcelar de sempre, "hoje: à vista"', async () => {
    const buscarNota = vi.fn(async () => [PROPRIA]);
    render(<ParcelarEsteLancamento clienteId="cli" lancamento={LANC_NOTA} situacao={{ status: 'programado', dataPagamento: null, conciliadoEm: null }}
      vencimentoAtual="2026-10-11" conta={null} onParcelado={vi.fn()} buscarIrmasNota={buscarNota} numeroDocumento="4964" juncao={juncaoOk().g} />);
    await waitFor(() => expect(buscarNota).toHaveBeenCalled());
    expect(screen.getByTestId('parcelar-este')).toBeTruthy();
    expect(screen.queryByTestId('parcela-solta')).toBeNull();
  });
});

describe('Q6 — a forma gravada fora da lista (a regra da Mesa, 30/09)', () => {
  it('fora da lista volta o texto; na lista, vazia ou "Nenhuma", nulo', () => {
    expect(formaForaDaLista('Cartão de Crédito')).toBe('Cartão de Crédito');
    expect(formaForaDaLista('PIX/Transferência Bancária')).toBe('PIX/Transferência Bancária');
    for (const f of FORMAS_PAGAMENTO_V2) expect(formaForaDaLista(f)).toBeNull();
    for (const v of ['', '   ', null, undefined, FORMA_PAGAMENTO_V2_NENHUMA]) expect(formaForaDaLista(v)).toBeNull();
  });
});
