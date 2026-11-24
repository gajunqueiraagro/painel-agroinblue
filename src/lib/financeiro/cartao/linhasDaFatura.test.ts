/**
 * CARTAO-FATURA-IMPORT-01 — a prévia da fatura (linhasDaFatura) sobre dados SINTÉTICOS: cada regra do pedido tem um caso.
 */
import { describe, expect, it } from 'vitest';
import type { FaturaLida, LinhaDaFatura } from './lerFaturaOurocard';
import { linhasDaFatura, parcelaDaDescricao, type LancamentoNoCartao } from './linhasDaFatura';

const CARTAO = 'cartao-a'; const OUTRO = 'cartao-b';
let ordem = 0;
const linha = (x: Partial<LinhaDaFatura>): LinhaDaFatura => ({ ordem: ++ordem, secao: 'Serviços', dataCompra: '2026-09-04', descricao: 'LOJA EXEMPLO',
  pais: 'BR', valorCent: 10000, parcela: null, exterior: null, tipo: 'compra', titular: null, finalCartao: '1234', ...x });
const fatura = (linhas: LinhaDaFatura[]): FaturaLida => ({ produto: 'OUROCARD VISA', finalCartao: '1234', titular: null, vencimento: '2026-10-16',
  fechamento: '2026-10-05', totalCent: null, saldoAnteriorCent: 0, linhas, somaConfere: true, avisos: [] });
const ex = (x: Partial<LancamentoNoCartao>): LancamentoNoCartao => ({ id: 'x', contaId: CARTAO, vencimento: '2026-10-16', competencia: '2026-09-04',
  valorCent: 10000, descricao: 'Compra', fornecedor: 'Loja Exemplo Ltda', parcela: null, status: 'programado', ...x });

describe('prévia da fatura do cartão', () => {
  it('pagamento = transferência; anuidade e desconto = par (nada a lançar)', () => {
    const p = linhasDaFatura(fatura([linha({ tipo: 'pagamento', valorCent: -50000 }), linha({ tipo: 'anuidade', valorCent: 1800 }),
      linha({ tipo: 'desconto_anuidade', valorCent: -1800 })]), CARTAO, [ex({ valorCent: -50000 })]);
    expect(p.linhas.map(l => l.decisao)).toEqual(['transferencia', 'anuidade_par', 'anuidade_par']);
    expect(p.totais.anuidade_par.cent).toBe(0);
  });

  it('compra já lançada no mesmo cartão: valor ao centavo + compra até 3 dias; um lançamento casa uma linha só', () => {
    const p = linhasDaFatura(fatura([linha({}), linha({})]), CARTAO, [ex({ id: 'a', competencia: '2026-09-07' })]);
    expect(p.linhas.map(l => [l.decisao, l.existente?.id ?? null])).toEqual([['ja_lancado', 'a'], ['lanca', null]]);
  });

  it('4 dias de distância não casa; 1 centavo casa como diferença; outro cartão é dito', () => {
    expect(linhasDaFatura(fatura([linha({})]), CARTAO, [ex({ competencia: '2026-09-08' })]).linhas[0].decisao).toBe('lanca');
    const c = linhasDaFatura(fatura([linha({})]), CARTAO, [ex({ valorCent: 10001 })]).linhas[0];
    expect([c.decisao, c.diferencas[0]]).toEqual(['ja_lancado_diferenca', 'valor 10001 (1 centavo)']);
    const o = linhasDaFatura(fatura([linha({})]), CARTAO, [ex({ contaId: OUTRO, vencimento: '2026-10-10' })]).linhas[0];
    expect([o.decisao, o.diferencas]).toEqual(['ja_lancado_diferenca', ['outra conta', 'vencimento 2026-10-10']]);
  });

  it('o centavo exato vence o de 1 centavo de diferença, mesmo listado depois', () => {
    const p = linhasDaFatura(fatura([linha({})]), CARTAO, [ex({ id: 'quase', valorCent: 10001 }), ex({ id: 'exato' })]);
    expect([p.linhas[0].decisao, p.linhas[0].existente?.id]).toEqual(['ja_lancado', 'exato']);
  });

  it('o mesmo valor nos dois cartões: prefere o cartão da fatura', () => {
    const p = linhasDaFatura(fatura([linha({})]), CARTAO, [ex({ id: 'b', contaId: OUTRO }), ex({ id: 'a' })]);
    expect([p.linhas[0].decisao, p.linhas[0].existente?.id]).toEqual(['ja_lancado', 'a']);
  });

  it('PARC k/N casa com a parcela k/N (valor + k/N + estabelecimento), nunca pela data; a parcela não casa compra à vista', () => {
    const l = linha({ dataCompra: '2026-07-27', descricao: 'IMPORCAT A3 PARC 03/04', parcela: { k: 3, n: 4 }, valorCent: 69821 });
    const p = linhasDaFatura(fatura([l]), CARTAO, [ex({ id: 'k4', parcela: { k: 4, n: 4 }, valorCent: 69821, fornecedor: 'Imporcate Pecas', vencimento: '2026-11-16', competencia: '2026-07-27' }),
      ex({ id: 'k3', parcela: { k: 3, n: 4 }, valorCent: 69821, fornecedor: 'Imporcate Pecas', competencia: '2026-07-27' })]);
    expect([p.linhas[0].decisao, p.linhas[0].existente?.id]).toEqual(['parcela', 'k3']);
    const avista = linhasDaFatura(fatura([linha({})]), CARTAO, [ex({ parcela: { k: 1, n: 2 } })]);
    expect(avista.linhas[0].decisao).toBe('lanca');
  });

  it('parcela com outro k ou outro valor = diferença (nada se cria); parcela solta vale pelo k/N da descrição e pela data da compra', () => {
    const l = linha({ dataCompra: '2026-04-06', descricao: 'Propig *TROVA PARC 06/10', parcela: { k: 6, n: 10 }, valorCent: 8900 });
    const p = linhasDaFatura(fatura([l]), CARTAO, [ex({ parcela: { k: 7, n: 10 }, valorCent: 8900, fornecedor: 'Trovao Pecas', competencia: '2026-04-06' })]);
    expect([p.linhas[0].decisao, p.linhas[0].diferencas]).toEqual(['parcela_diferenca', ['parcela 7/10']]);
    const v = linhasDaFatura(fatura([linha({ descricao: 'BELPREMIUM CO PARC 01/06', parcela: { k: 1, n: 6 }, valorCent: 70826 })]), CARTAO,
      [ex({ parcela: { k: 1, n: 6 }, valorCent: 44825, fornecedor: 'Belpremium Automoveis' })]);
    expect(v.linhas[0].diferencas).toEqual(['valor 44825']);
    const solta = linhasDaFatura(fatura([linha({ dataCompra: '2026-06-02', descricao: 'R M S JUNIOR PARC 05/05', parcela: { k: 5, n: 5 }, valorCent: 63200 })]), CARTAO,
      [ex({ descricao: 'Fio Eletroplastico 5/5', fornecedor: 'Casa da Cerca', valorCent: 63200, competencia: '2026-06-02' })]);
    expect([solta.linhas[0].decisao, solta.linhas[0].diferencas]).toEqual(['parcela_diferenca', ['parcela solta (sem elo com o parcelamento)']]);
    expect(parcelaDaDescricao('Materiais 09/09')).toEqual({ k: 9, n: 9 });
    expect(parcelaDaDescricao('NF 10.025')).toBeNull();
    expect(parcelaDaDescricao('Rolamento 5/2')).toBeNull();
    expect(parcelaDaDescricao('Pneu 1/1')).toBeNull();
  });

  it('parcela lançada solta sem k/N: casa pelo valor + o vencimento da fatura, ou pela data da compra; nunca por uma janela', () => {
    const l = linha({ dataCompra: '2026-06-25', descricao: 'STUDIUM SOUND PARC 04/04', parcela: { k: 4, n: 4 }, valorCent: 66000 });
    const pelaData = linhasDaFatura(fatura([l]), CARTAO, [ex({ contaId: OUTRO, descricao: 'Parcela 4 - hilux', fornecedor: 'Outro Nome', valorCent: 66000, competencia: '2026-06-25', vencimento: '2026-10-20' })]);
    expect([pelaData.linhas[0].decisao, pelaData.linhas[0].diferencas]).toEqual(['parcela_diferenca', ['sem k/N no sistema', 'outra conta', 'vencimento 2026-10-20']]);
    const peloVenc = linhasDaFatura(fatura([l]), CARTAO, [ex({ descricao: '-', fornecedor: null, valorCent: 66000, competencia: '2026-10-16' })]);
    expect(peloVenc.linhas[0].diferencas).toEqual(['sem k/N no sistema']);
    const longe = linhasDaFatura(fatura([l]), CARTAO, [ex({ descricao: '-', fornecedor: null, valorCent: 66000, competencia: '2026-06-26', vencimento: '2026-10-17' })]);
    expect(longe.linhas[0].decisao).toBe('lanca');
    const outroValor = linhasDaFatura(fatura([l]), CARTAO, [ex({ descricao: '-', fornecedor: null, valorCent: 66001, competencia: '2026-10-16' })]);
    expect(outroValor.linhas[0].decisao).toBe('lanca');
  });

  it('os totais somam cada linha uma vez', () => {
    const p = linhasDaFatura(fatura([linha({ valorCent: 100 }), linha({ valorCent: 250, tipo: 'pagamento' })]), CARTAO, []);
    expect([p.totais.lanca, p.totais.transferencia]).toEqual([{ n: 1, cent: 100 }, { n: 1, cent: 250 }]);
  });
});
