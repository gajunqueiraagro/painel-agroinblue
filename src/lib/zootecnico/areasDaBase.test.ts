/**
 * A ÁREA CONTRA A BASE do Início — VALOR-REBANHO-GRAFICOS-BASE-01.
 *
 * ⚠ O CRUZAMENTO É O QUE NENHUM OUTRO GATE VÊ. A cor da área troca no x em que a série corta a
 * base, e esse x sai de uma interpolação entre dois pontos vizinhos. Errar por meio intervalo
 * pinta de azul um mês que já estava abaixo do Início — TSC e build ficam mudos, porque é
 * aritmética dentro de um atributo, e a olho nu ninguém distingue 0,5 de 0,4.
 *
 * ⚠ O BURACO É A OUTRA METADE. Mês aberto corta a área, e os vizinhos de um buraco NÃO são
 * vizinhos: interpolar por cima dele inventaria um cruzamento numa data em que não há leitura.
 * O caso do buraco anda junto com o caso cheio de propósito — afirmar só a ausência passaria
 * verde também numa função que nunca acha cruzamento nenhum (a mesma lição do auto-teste do
 * `check:tdz`).
 */
import { describe, it, expect } from 'vitest';
import { areasDaBase } from '@/lib/zootecnico/areasDaBase';

describe('areasDaBase', () => {
  it('soma as alturas dos dois lados e cruza no meio do intervalo', () => {
    const r = areasDaBase([10, 12, 8, 10], 10);

    expect(r.alturaAcima).toBe(2);
    expect(r.alturaAbaixo).toBe(2);

    /* Entre 12 (índice 1) e 8 (índice 2) a base está no MEIO: 1 + 0,5. */
    expect(r.cruzamentos).toHaveLength(1);
    expect(r.cruzamentos[0] - 1).toBeCloseTo(0.5, 10);

    /* A caixa da área vai de 12 a 8; a base a 10 fica exatamente no meio dela. */
    expect(r.fracaoDaBase).toBeCloseTo(0.5, 10);
  });

  it('série inteira acima é toda azul; inteira abaixo, toda vermelha', () => {
    const acima = areasDaBase([10, 11, 14], 10);
    expect(acima.alturaAbaixo).toBe(0);
    expect(acima.cruzamentos).toEqual([]);
    expect(acima.fracaoDaBase).toBe(1);

    const abaixo = areasDaBase([10, 9, 6], 10);
    expect(abaixo.alturaAcima).toBe(0);
    expect(abaixo.cruzamentos).toEqual([]);
    expect(abaixo.fracaoDaBase).toBe(0);
  });

  it('mês aberto corta a área: o buraco não vira ponte', () => {
    /* PROVA QUE A BUSCA SABE ACHAR: os mesmos dois valores, vizinhos, cruzam. */
    expect(areasDaBase([12, 8], 10).cruzamentos).toHaveLength(1);

    /* Com o mês do meio em aberto, não há vizinhança — e não há cruzamento. */
    const comBuraco = areasDaBase([12, null, 8], 10);
    expect(comBuraco.cruzamentos).toEqual([]);
    /* As alturas continuam contando os pontos que existem. */
    expect(comBuraco.alturaAcima).toBe(2);
    expect(comBuraco.alturaAbaixo).toBe(2);
  });

  it('sem ponto e sem altura não há área — e a resposta é ausência, nunca zero', () => {
    expect(areasDaBase([null, null], 10).fracaoDaBase).toBeNull();
    expect(areasDaBase([10, 10, 10], 10).fracaoDaBase).toBeNull();
    /* ⚠ `0` seria "tudo abaixo da base", que é resposta. `null` é "não há o que pintar". */
    expect(areasDaBase([10, 10, 10], 10).alturaAcima).toBe(0);
  });

  it('encostar na base e voltar não é cruzar; atravessar por cima dela é', () => {
    expect(areasDaBase([12, 10, 14], 10).cruzamentos).toEqual([]);
    /* Aqui o cruzamento é o PRÓPRIO ponto que está na base — índice 1, sem fração. */
    expect(areasDaBase([12, 10, 8], 10).cruzamentos).toEqual([1]);
  });
});
