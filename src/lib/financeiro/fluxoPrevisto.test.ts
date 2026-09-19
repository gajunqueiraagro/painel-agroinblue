/**
 * O fluxo previsto — PR-CPR-2B.
 *
 * ⚠ OS NÚMEROS SÃO OS DO PROTO EM 19/09/2026, medidos, não inventados: são eles que a
 * homologação confere na tela, e travá-los aqui é o que impede o gráfico de discordar da Lista
 * sem ninguém ver.
 */
import { describe, it, expect } from 'vitest';
import {
  montarFluxoPrevisto, primeiroNegativo, rotuloDoMes, type LinhaFluxoPrevisto,
} from './fluxoPrevisto';

const saida = (venc: string | null, valor: number): LinhaFluxoPrevisto =>
  ({ data_vencimento: venc, valor, tipo_operacao: '2-Saídas' });
const entrada = (venc: string | null, valor: number): LinhaFluxoPrevisto =>
  ({ data_vencimento: venc, valor, tipo_operacao: '1-Entradas' });

describe('rotuloDoMes', () => {
  it('encurta para mes/aa', () => {
    expect(rotuloDoMes('2026-09')).toBe('set/26');
    expect(rotuloDoMes('2027-02')).toBe('fev/27');
  });
});

describe('montarFluxoPrevisto — NJ, 90 dias', () => {
  const linhas = [
    saida('2026-09-19', 627301.33), saida('2026-10-05', 820312.53),
    saida('2026-11-10', 121496.42), saida('2026-12-13', 96691.87),
  ];
  const r = montarFluxoPrevisto(linhas, 1832544.83);

  it('abre em "Hoje" com o saldo em caixa, antes de qualquer mês', () => {
    expect(r.pontos[0]).toEqual({
      chave: 'inicio', rotulo: 'Hoje', entradas: 0, saidas: 0, saldo: 1832544.83 });
  });

  it('as saídas são negativas — é o que faz a coluna descer do zero', () => {
    expect(r.pontos.map((p) => p.saidas))
      .toEqual([0, -627301.33, -820312.53, -121496.42, -96691.87]);
    expect(r.pontos.every((p) => p.entradas === 0)).toBe(true);
  });

  it('a linha desce até 166.742,68 e NÃO fura o zero', () => {
    expect(r.pontos.map((p) => p.saldo))
      .toEqual([1832544.83, 1205243.50, 384930.97, 263434.55, 166742.68]);
    expect(primeiroNegativo(r.pontos)).toBeNull();
  });
});

describe('montarFluxoPrevisto — Vera, 90 dias (o combo de verdade)', () => {
  const linhas = [
    entrada('2026-09-25', 991126.96), saida('2026-09-30', 1013.23),
    entrada('2026-10-02', 470789.46), saida('2026-10-13', 151014.35),
    saida('2026-11-13', 152286.75), saida('2026-12-13', 150454.23),
  ];
  const r = montarFluxoPrevisto(linhas, 198299.74);

  it('tem entradas E saídas no mesmo mês', () => {
    expect(r.pontos[1]).toMatchObject({ rotulo: 'set/26', entradas: 991126.96, saidas: -1013.23 });
  });

  it('a linha SOBE e passa de 1,4 milhão', () => {
    const saldos = r.pontos.map((p) => p.saldo);
    expect(saldos[0]).toBe(198299.74);
    expect(Math.max(...saldos)).toBeGreaterThan(1_400_000);
    expect(saldos[saldos.length - 1]).toBe(1205447.60);
  });
});

describe('primeiroNegativo', () => {
  /** ⚠ O caso do NJ em "Tudo": a CPR do BBA em fev/27 leva a linha a −2,4 milhões. */
  it('acha o mês em que a linha fura o zero', () => {
    const r = montarFluxoPrevisto([
      saida('2027-01-10', 42065.75), saida('2027-02-15', 2510230.75),
      saida('2027-03-10', 78050.43),
    ], 141938.13);
    const neg = primeiroNegativo(r.pontos);
    expect(neg?.rotulo).toBe('fev/27');
    expect(neg?.saldo).toBe(-2410358.37);
  });

  it('cliente já negativo hoje é apontado no próprio "Hoje"', () => {
    const r = montarFluxoPrevisto([saida('2026-10-01', 10)], -500);
    expect(primeiroNegativo(r.pontos)?.chave).toBe('inicio');
  });
});

describe('o que NÃO entra no gráfico', () => {
  /**
   * ⚠ O CASO QUE JUSTIFICA O CAMPO. Um compromisso sem vencimento não tem posição num eixo de
   * tempo, mas somir com ele em silêncio faria o total do gráfico divergir do da Lista sem
   * explicação. Ele é contado para a tela poder dizer.
   */
  it('lançamento sem vencimento fica fora e é CONTADO', () => {
    const r = montarFluxoPrevisto([saida(null, 999), saida('2026-10-01', 10)], 0);
    expect(r.semVencimento).toBe(1);
    expect(r.pontos).toHaveLength(2);
    expect(r.pontos[1].saldo).toBe(-10);
  });

  it('transferência e tipo desconhecido não viram dinheiro por omissão', () => {
    const r = montarFluxoPrevisto([
      { data_vencimento: '2026-10-01', valor: 5000, tipo_operacao: '3-Transferências' },
      { data_vencimento: '2026-10-01', valor: 5000, tipo_operacao: '9-Sei lá' },
    ], 100);
    expect(r.pontos).toHaveLength(1);
    expect(r.pontos[0].saldo).toBe(100);
  });

  it('sem lançamento nenhum, sobra só o ponto de hoje', () => {
    const r = montarFluxoPrevisto([], 1234.56);
    expect(r.pontos).toEqual([
      { chave: 'inicio', rotulo: 'Hoje', entradas: 0, saidas: 0, saldo: 1234.56 }]);
  });
});
