/**
 * P100 — o desenho do gráfico do modal de análise:
 *   C1 a curva passa EXATAMENTE por cada ponto (o fim de cada trecho é o ponto do banco)
 *   C2 entre dois meses a curva fica entre os dois valores (sem "barriga" falsa): pico, vale, degrau e reta, amostrando cada Bézier
 *   C3 mês sem ponto quebra a linha em trechos
 *   R1 `posicionar`: o 1º candidato que cabe e não encosta; nada cabe → −1 (e nada é posto)
 */
import { describe, it, expect } from 'vitest';
import { curvaMonotona, encostam, posicionar, trechos, type Caixa, type Ponto } from './graficoAnaliseVG';

/** os trechos cúbicos do caminho: [início, controle 1, controle 2, fim] */
function cubicas(d: string): Ponto[][] {
  const nums = (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
  const pts: Ponto[] = [];
  for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  const out: Ponto[][] = [];
  for (let i = 1; i + 2 < pts.length; i += 3) out.push([pts[i - 1], pts[i], pts[i + 1], pts[i + 2]]);
  return out;
}
const bezier = (c: Ponto[], t: number): Ponto => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t * t * t * c[3][k]) as Ponto;
};
const CASOS: Record<string, Ponto[]> = {
  pico: [[0, 50], [10, 10], [20, 50], [30, 48]],
  vale: [[0, 10], [10, 90], [20, 12], [30, 15], [40, 80]],
  degrau: [[0, 10], [10, 10], [20, 80], [30, 80], [40, 81]],
  reta: [[0, 0], [10, 10], [20, 20], [30, 30]],
  agulha: [[0, 50], [10, 49], [20, 5], [30, 50], [40, 50]],
};

describe('P100 — curva do gráfico do modal', () => {
  it('C1 passa exatamente por cada ponto', () => {
    for (const p of Object.values(CASOS)) {
      const cs = cubicas(curvaMonotona(p));
      expect(cs.length).toBe(p.length - 1);
      cs.forEach((c, i) => { expect(c[0]).toEqual(p[i]); expect(c[3]).toEqual(p[i + 1]); });
    }
  });

  it('C2 entre dois meses fica entre os dois valores (sem barriga)', () => {
    for (const [nome, p] of Object.entries(CASOS)) {
      cubicas(curvaMonotona(p)).forEach((c, i) => {
        const lo = Math.min(p[i][1], p[i + 1][1]) - 1e-9, hi = Math.max(p[i][1], p[i + 1][1]) + 1e-9;
        for (let t = 0; t <= 1; t += 0.02) {
          const y = bezier(c, t)[1];
          expect(y >= lo && y <= hi, `${nome} trecho ${i} t=${t.toFixed(2)} y=${y}`).toBe(true);
        }
      });
    }
  });

  it('C3 mês sem ponto quebra a linha', () => {
    expect(trechos([[0, 1], [1, 2], null, [3, 4]])).toEqual([[[0, 1], [1, 2]], [[3, 4]]]);
    expect(trechos([null, null])).toEqual([]);
  });

  it('R1 posicionar: o 1º que cabe e não encosta', () => {
    const area: Caixa = { x: 0, y: 0, w: 100, h: 50 };
    const postos: Caixa[] = [{ x: 10, y: 10, w: 20, h: 8 }];
    const sobre: Caixa = { x: 15, y: 12, w: 10, h: 6 }, fora: Caixa = { x: 95, y: 10, w: 10, h: 6 }, livre: Caixa = { x: 50, y: 10, w: 10, h: 6 };
    expect(posicionar([sobre, fora, livre], postos, area)).toBe(2);
    expect(postos).toHaveLength(2);
    expect(posicionar([sobre, fora], postos, area)).toBe(-1);
    expect(postos).toHaveLength(2);
    expect(encostam(livre, { x: 60.6, y: 10, w: 5, h: 5 })).toBe(false);
  });
});
