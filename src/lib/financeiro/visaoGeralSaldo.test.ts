/**
 * P83 — a linha do saldo do gráfico da Visão Geral (`trechosDoSaldo`): azul acima de zero, vermelha abaixo, a cor troca NO cruzamento,
 * tracejada até os meses previstos.
 *   T1 mesmo sinal: um trecho por par de meses, com a cor do sinal
 *   T2 sinais opostos: o trecho é partido no x onde a reta cruza o zero (interpolação), cada metade com a sua cor, encostando no zero
 *   T3 o trecho que chega num mês previsto é tracejado; o que sai do último realizado para o 1º previsto também
 *   T4 encostar no zero não parte o trecho
 */
import { describe, it, expect } from 'vitest';
import { trechosDoSaldo } from '@/lib/financeiro/visaoGeral';

const Y0 = 100;
const p = (x: number, v: number, previsto = false) => ({ x, y: Y0 - v, v, previsto });

describe('trechosDoSaldo', () => {
  it('T1 mesmo sinal: um trecho, a cor do sinal', () => {
    expect(trechosDoSaldo([p(0, 10), p(10, 30)], Y0)).toEqual([{ x1: 0, y1: 90, x2: 10, y2: 70, neg: false, tracejado: false }]);
    expect(trechosDoSaldo([p(0, -10), p(10, -30)], Y0)).toEqual([{ x1: 0, y1: 110, x2: 10, y2: 130, neg: true, tracejado: false }]);
  });
  it('T2 sinais opostos: partido no cruzamento', () => {
    /* de +30 a −10 em 40px: cruza o zero em 3/4 do caminho → x = 30 */
    expect(trechosDoSaldo([p(0, 30), p(40, -10)], Y0)).toEqual([
      { x1: 0, y1: 70, x2: 30, y2: Y0, neg: false, tracejado: false },
      { x1: 30, y1: Y0, x2: 40, y2: 110, neg: true, tracejado: false },
    ]);
  });
  it('T3 tracejado até os meses previstos', () => {
    const t = trechosDoSaldo([p(0, 10), p(10, 20), p(20, 30, true), p(30, -10, true)], Y0);
    expect(t.map((x) => [x.tracejado, x.neg])).toEqual([[false, false], [true, false], [true, false], [true, true]]);
  });
  it('T4 encostar no zero não parte', () => {
    expect(trechosDoSaldo([p(0, 10), p(10, 0), p(20, -5)], Y0).length).toBe(2);
  });
});
