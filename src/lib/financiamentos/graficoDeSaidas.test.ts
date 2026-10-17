/**
 * FIN-FINANC-28 · PASSO 4c — o dono do gráfico v2 e do filtro de vencimento. (a) "de" sozinho: o contrato entra se tem QUALQUER parcela
 * dali em diante (não só a próxima); (b) os cards com o filtro = a soma das parcelas DO INTERVALO; (c) "até" sozinho; os períodos
 * completos (civil e safra); o número curto; a escala do eixo; e a soma do que falta das colunas = o card "A pagar".
 */
import { describe, expect, it } from 'vitest';
import {
  escalaDoEixo, graficoAnual, graficoMensal, noIntervalo, parcelasDoGrafico, pilhaDaColuna, rotuloCurto, temParcelaNoIntervalo, totaisNoIntervalo,
} from './graficoDeSaidas';
import { resumoDoContratoNaLista, totaisDasCompras } from './situacaoEmLote';
import type { ParcelaDoContrato, SituacaoDoContrato } from './situacaoDoContrato';

const par = (p: Partial<ParcelaDoContrato>): ParcelaDoContrato => ({
  id: 'x', numero: 1, dataVencimento: '2026-11-10', valorPrincipal: 100, valorJuros: 0, valorTotal: 100, situacao: 'pendente',
  pagoEm: null, valorPago: 0, lancamentoId: null, lancamentoJurosId: null, fonte: 'lancamento', diverge: false, detalhe: null, ...p,
});
const HOJE = '2026-10-17';
/** situação com os cartões que o banco daria (a vencer + vencido = o que falta das não pagas) */
const sit = (ps: ParcelaDoContrato[]): SituacaoDoContrato => {
  let aVencer = 0; let vencido = 0; let pago = 0;
  for (const p of ps) {
    pago += Math.round(p.valorPago * 100);
    if (p.situacao === 'paga') continue;
    const f = Math.max(Math.round(p.valorTotal * 100) - Math.round(p.valorPago * 100), 0);
    if (p.dataVencimento && p.dataVencimento < HOJE) vencido += f; else aVencer += f;
  }
  return { parcelas: ps, cartoes: { valorContrato: 0, pago: pago / 100, aVencer: aVencer / 100, vencido: vencido / 100, pagas: 0, parcelas: ps.length,
    jurosPrevistos: 0, somaPrincipal: 0, somaTotal: 0, divergentes: 0, detalhe: null } };
};
/* a "Antena" (a próxima parcela em nov) e uma compra com parcela de out (a próxima) E de nov — o caso do NJ */
const ANTENA = sit([par({ dataVencimento: '2026-11-05', valorTotal: 500, valorPrincipal: 500 })]);
const CERCA = sit([
  par({ dataVencimento: '2026-09-10', valorTotal: 300, valorPrincipal: 300, situacao: 'paga', valorPago: 300 }),
  par({ dataVencimento: '2026-10-20', valorTotal: 300, valorPrincipal: 300 }),
  par({ dataVencimento: '2026-11-20', valorTotal: 300, valorPrincipal: 300 }),
]);

describe('o filtro de vencimento', () => {
  it('(a) "de 01/11/2026": entra QUALQUER contrato com parcela dali em diante — a cerca entra, embora a próxima seja de outubro', () => {
    const i = { de: '2026-11-01', ate: null };
    expect(resumoDoContratoNaLista(CERCA).proxVencimento).toBe('2026-10-20');
    expect(temParcelaNoIntervalo(ANTENA, i)).toBe(true);
    expect(temParcelaNoIntervalo(CERCA, i)).toBe(true);
    expect(temParcelaNoIntervalo(sit([par({ dataVencimento: '2026-10-05' })]), i)).toBe(false);
  });
  it('(b) os cards com o filtro somam SÓ as parcelas no intervalo (pago, vencidas, em aberto)', () => {
    const t = totaisNoIntervalo(parcelasDoGrafico([ANTENA, CERCA], HOJE, { de: '2026-09-01', ate: '2026-10-31' }));
    expect(t).toEqual({ total: 600, pago: 300, emAberto: 300, vencidas: 0, aPagar: 300, diferenca: 0 });
    const nov = totaisNoIntervalo(parcelasDoGrafico([ANTENA, CERCA], HOJE, { de: '2026-11-01', ate: null }));
    expect(nov.emAberto).toBe(800);
  });
  it('(c) "até" sozinho: até a data, inclusive; sem filtro, tudo; parcela sem vencimento só entra sem filtro', () => {
    expect(noIntervalo('2026-10-20', { de: null, ate: '2026-10-20' })).toBe(true);
    expect(noIntervalo('2026-10-21', { de: null, ate: '2026-10-20' })).toBe(false);
    expect(noIntervalo(null, { de: null, ate: '2026-10-20' })).toBe(false);
    expect(noIntervalo(null, null)).toBe(true);
    expect(temParcelaNoIntervalo(undefined, null)).toBe(true);
  });
  it('sem filtro, a soma do que falta das colunas = o card "A pagar" (o dono de sempre), ao centavo', () => {
    const situacoes = [ANTENA, CERCA];
    const g = graficoMensal(parcelasDoGrafico(situacoes, HOJE));
    let falta = 0; for (const c of g.colunas) falta += c.vencidoCent + c.aPagarCent;
    const card = totaisDasCompras(situacoes.map((s) => ({ valor_total: 0, pago: 0, total_pendente: resumoDoContratoNaLista(s).totalPendente, vencido: s.cartoes.vencido }))).emAberto;
    expect(falta).toBe(Math.round(card * 100));
    expect(g.aPagarHojeCent).toBe(falta);
  });
});

describe('os períodos completos', () => {
  const ps = parcelasDoGrafico([CERCA], HOJE);
  it('civil: jan a dez do ano inteiro; o ano marcado no começo', () => {
    const g = graficoMensal(ps, 'civil');
    expect(g.colunas.map((c) => c.chave)[0]).toBe('2026-01');
    expect(g.colunas).toHaveLength(12);
    expect(g.colunas[0].marcaAno).toBe('2026');
    expect(g.colunas.map((c) => c.rotulo).join('')).toBe('JFMAMJJASOND');
  });
  it('safra: jul a jun, blocos completos', () => {
    const g = graficoMensal(ps, 'safra');
    expect([g.colunas[0].chave, g.colunas[g.colunas.length - 1].chave]).toEqual(['2026-07', '2027-06']);
    expect(g.colunas[0].marcaAno).toBe('26/27');
    const a = graficoAnual(ps, 'safra');
    expect(a.colunas.map((c) => c.chave)).toEqual(['2026/27']);
  });
  it('o vencido fica no mês em que venceu; a pilha vem do dono (pago embaixo)', () => {
    const p = parcelasDoGrafico([sit([par({ dataVencimento: '2026-09-10', valorTotal: 400, situacao: 'parcial', valorPago: 100 })])], HOJE);
    const set = graficoMensal(p).colunas.find((c) => c.chave === '2026-09')!;
    expect([set.pagoCent, set.vencidoCent, set.aPagarCent, set.totalCent]).toEqual([10000, 30000, 0, 40000]);
    expect(pilhaDaColuna(set, false)).toEqual([{ tipo: 'pago', valorCent: 10000, baseCent: 0 }, { tipo: 'vencido', valorCent: 30000, baseCent: 10000 }]);
  });
});

describe('o número curto e a escala', () => {
  it('≥ 1 mi "1,6 mi"; ≥ 10 mil "143k"; ≥ 1 mil "8,2k"; abaixo, o inteiro', () => {
    expect(rotuloCurto(160_000_000)).toBe('1,6 mi');
    expect(rotuloCurto(14_305_600)).toBe('143k');
    expect(rotuloCurto(820_000)).toBe('8,2k');
    expect(rotuloCurto(98_000)).toBe('980');
  });
  it('4 ou 5 marcas redondas que cobrem o maior (os dois casos do mock)', () => {
    expect(escalaDoEixo(14_305_600)).toEqual([0, 5_000_000, 10_000_000, 15_000_000]);
    expect(escalaDoEixo(354_631_000)).toEqual([0, 100_000_000, 200_000_000, 300_000_000, 400_000_000]);
  });
});
