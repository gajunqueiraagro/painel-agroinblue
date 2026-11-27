/**
 * ENTRADA-CENTRAL-01 F1 — a matriz 2D que a Lambda põe no lugar do `DOMMatrix` (só para o pdfjs carregar no Node): as contas afins
 * certas (as mesmas do DOMMatrix 2D do navegador), conferidas contra a conta à mão.
 */
import { describe, expect, it } from 'vitest';
import { Matriz2D } from '../../../infra/ses-entrada/src/leitor';

const valores = (m: Matriz2D) => [m.a, m.b, m.c, m.d, m.e, m.f].map((x) => Math.round(x * 1e9) / 1e9);

describe('Matriz2D (o DOMMatrix 2D da Lambda)', () => {
  it('identidade, construtor por lista, escala e translação na ordem do DOMMatrix (pós-multiplica)', () => {
    expect(valores(new Matriz2D())).toEqual([1, 0, 0, 1, 0, 0]);
    expect(valores(new Matriz2D([2, 0, 0, 3, 5, 7]))).toEqual([2, 0, 0, 3, 5, 7]);
    /* o mesmo do worker do pdfjs: scaleSelf(1/w, -1/h).translateSelf(0, -h) */
    expect(valores(new Matriz2D().scaleSelf(1 / 4, -1 / 2).translateSelf(0, -2))).toEqual([0.25, 0, 0, -0.5, 0, 1]);
    expect(valores(new Matriz2D().translateSelf(10, 20).scaleSelf(2))).toEqual([2, 0, 0, 2, 10, 20]);
  });
  it('multiplica, pré-multiplica, inverte e transforma ponto', () => {
    const m = new Matriz2D([1, 2, 3, 4, 5, 6]);
    expect(valores(new Matriz2D([1, 2, 3, 4, 5, 6]).multiplySelf(new Matriz2D([7, 8, 9, 10, 11, 12])))).toEqual([31, 46, 39, 58, 52, 76]);
    expect(valores(new Matriz2D([7, 8, 9, 10, 11, 12]).preMultiplySelf(new Matriz2D([1, 2, 3, 4, 5, 6])))).toEqual([31, 46, 39, 58, 52, 76]);
    const inv = new Matriz2D([1, 2, 3, 4, 5, 6]).invertSelf();
    expect(valores(inv.multiplySelf(m))).toEqual([1, 0, 0, 1, 0, 0]);
    expect(new Matriz2D([2, 0, 0, 3, 5, 7]).transformPoint({ x: 1, y: 1 })).toEqual({ x: 7, y: 10, z: 0, w: 1 });
    expect(valores(new Matriz2D([1, 2, 2, 4, 0, 0]).invertSelf()).every((x) => Number.isNaN(x))).toBe(true);
  });
});
