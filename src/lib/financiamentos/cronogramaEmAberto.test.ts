/**
 * FIN-FINANC-28 · P3-GRAFICO — o dono do cronograma do que falta pagar: a SOMA DAS COLUNAS é o card "A pagar" (a regra do lote),
 * mês a mês e ano a ano, ao centavo.
 */
import { describe, expect, it } from 'vitest';
import { aindaAPagarEmJaneiro, cronogramaAnual, cronogramaMensal, parcelasEmAberto, rotuloCompacto } from './cronogramaEmAberto';
import { resumoDoContratoNaLista, totaisDasCompras } from './situacaoEmLote';
import type { ParcelaDoContrato, SituacaoDoContrato } from './situacaoDoContrato';

const par = (p: Partial<ParcelaDoContrato>): ParcelaDoContrato => ({
  id: 'x', numero: 1, dataVencimento: '2026-11-10', valorPrincipal: 100, valorJuros: 0, valorTotal: 100, situacao: 'pendente',
  pagoEm: null, valorPago: 0, lancamentoId: null, lancamentoJurosId: null, fonte: 'lancamento', diverge: false, detalhe: null, ...p,
});
/** um contrato cujos cartões são os que o banco devolveria: a_vencer + vencido = o que falta das não pagas */
const contrato = (parcelas: ParcelaDoContrato[], hoje = '2026-10-17'): SituacaoDoContrato => {
  let aVencer = 0; let vencido = 0; let pago = 0;
  for (const p of parcelas) {
    pago += Math.round(p.valorPago * 100);
    if (p.situacao === 'paga') continue;
    const falta = Math.max(Math.round(p.valorTotal * 100) - Math.round(p.valorPago * 100), 0);
    if (p.dataVencimento && p.dataVencimento < hoje) vencido += falta; else aVencer += falta;
  }
  return { parcelas, cartoes: { valorContrato: 0, pago: pago / 100, aVencer: aVencer / 100, vencido: vencido / 100, pagas: 0, parcelas: parcelas.length,
    jurosPrevistos: 0, somaPrincipal: 0, somaTotal: 0, divergentes: 0, detalhe: null } } as SituacaoDoContrato;
};

const HOJE = '2026-10-17';
const A = contrato([
  par({ dataVencimento: '2026-08-10', valorTotal: 10.01, valorPrincipal: 10.01, situacao: 'vencida' }),
  par({ dataVencimento: '2026-09-10', valorTotal: 100, valorPrincipal: 100, situacao: 'paga', valorPago: 100 }),
  par({ dataVencimento: '2026-10-25', valorTotal: 300.33, valorPrincipal: 300.33 }),
  par({ dataVencimento: '2027-02-05', valorTotal: 50, valorPrincipal: 50, situacao: 'parcial', valorPago: 20 }),
]);
const B = contrato([
  par({ dataVencimento: '2026-10-17', valorTotal: 0.07, valorPrincipal: 0.07 }),
  par({ dataVencimento: '2026-12-01', valorTotal: 1000, valorPrincipal: 1000 }),
]);

describe('cronograma mês a mês (Compras parceladas)', () => {
  const c = cronogramaMensal([A, B, undefined], HOJE);

  it('a soma das colunas é o card "A pagar" (as parcelas em aberto do lote), ao centavo', () => {
    const linhas = [A, B].map((s) => ({ valor_total: 0, pago: 0, total_pendente: resumoDoContratoNaLista(s).totalPendente, vencido: s.cartoes.vencido }));
    const card = totaisDasCompras(linhas).emAberto;
    const soma = c.colunas.reduce((x, col) => x + col.totalCent, 0);
    expect(soma).toBe(Math.round(card * 100));
    expect(c.totalCent).toBe(1001 + 30033 + 3000 + 7 + 100000);
  });

  it('vencidas na 1ª coluna (vencimento antes de hoje; hoje NÃO é vencida) e uma coluna por mês até a última, vazios inclusive', () => {
    expect(c.colunas.map((x) => x.chave)).toEqual(['vencidas', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
    expect(c.colunas.map((x) => x.totalCent)).toEqual([1001, 30040, 0, 100000, 0, 3000]);
    expect(c.vencidasCent).toBe(1001);
    expect(c.ultima).toBe('2027-02');
  });

  it('"depois restam" = o que vem depois da coluna; "ainda em jan/27" = o que vence a partir de 1º de janeiro', () => {
    expect(c.colunas.map((x) => x.depoisCent)).toEqual([133040, 103000, 103000, 3000, 3000, 0]);
    expect(aindaAPagarEmJaneiro(c, HOJE)).toEqual({ rotulo: 'jan/27', cent: 3000 });
  });

  it('a parcial entra só pelo que falta; a paga não entra', () => {
    expect(parcelasEmAberto([A]).map((p) => p.totalCent)).toEqual([1001, 30033, 3000]);
  });

  it('rótulo compacto: milhares "172k", milhões "3,5 mi", abaixo de mil o inteiro', () => {
    expect(rotuloCompacto(17176200)).toBe('172k');
    expect(rotuloCompacto(354631000)).toBe('3,5 mi');
    expect(rotuloCompacto(98000)).toBe('980');
  });
});

describe('cronograma ano a ano (Financiamentos)', () => {
  const F = contrato([
    par({ dataVencimento: '2026-09-01', valorPrincipal: 100, valorJuros: 50, valorTotal: 150, situacao: 'vencida' }),
    par({ dataVencimento: '2027-03-01', valorPrincipal: 1000, valorJuros: 200, valorTotal: 1200 }),
    par({ dataVencimento: '2029-03-01', valorPrincipal: 999.99, valorJuros: 0.01, valorTotal: 1000, situacao: 'parcial', valorPago: 333.33 }),
  ]);
  const c = cronogramaAnual([F], HOJE);
  it('colunas: vencidas e um ano por coluna, do ano de hoje até o último, vazios inclusive', () => {
    expect(c.colunas.map((x) => x.chave)).toEqual(['vencidas', '2026', '2027', '2028', '2029']);
  });
  it('principal + juros = total em toda coluna (a parcial reparte na proporção, juros = o resto) e somam o em aberto', () => {
    for (const col of c.colunas) expect(col.principalCent + col.jurosCent).toBe(col.totalCent);
    expect(c.principalCent + c.jurosCent).toBe(c.totalCent);
    expect(c.totalCent).toBe(Math.round((F.cartoes.aVencer + F.cartoes.vencido) * 100));
    expect(c.colunas[2]).toMatchObject({ principalCent: 100000, jurosCent: 20000 });
    expect(c.ultima).toBe('2029');
  });
  it('o card "Parcelas a pagar" (principalCent do dono) = a soma do principal das colunas do modal anual, ao centavo', () => {
    expect(c.colunas.reduce((x, col) => x + col.principalCent, 0)).toBe(c.principalCent);
    expect(c.principalCent).toBe(10000 + 100000 + Math.round((66667 * 99999) / 100000));
  });
});
