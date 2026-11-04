import { describe, expect, it } from 'vitest';
import { convergencia, deUtm, fusoDe, grausMinutos, paraUtm } from './utm';

/* Referência: pyproj 3 (PROJ), Transformer EPSG 4674 → 319xx, always_xy; gerado em 03/11/2026 (MAPA-IMPRESSAO-01). */
const PYPROJ = [
  { lon: -52.61, lat: -21.2665, fuso: 22, epsg: 31982, e: 332957.113, n: 7647506.209 },
  { lon: -52.64326, lat: -21.31373, fuso: 22, epsg: 31982, e: 329560.048, n: 7642241.812 },
  { lon: -54.0, lat: -20.0, fuso: 21, epsg: 31981, e: 813926.32, n: 7785705.974 },
  { lon: -48.5, lat: -15.8, fuso: 22, epsg: 31982, e: 767816.254, n: 8251595.683 },
  { lon: -56.9, lat: -8.5, fuso: 21, epsg: 31981, e: 511006.081, n: 9060424.274 },
  { lon: -35.2, lat: -5.8, fuso: 25, epsg: 31985, e: 256380.941, n: 9358430.956 },
  { lon: -60.0, lat: -31.0, fuso: 21, epsg: 31981, e: 213539.919, n: 6566533.331 },
  { lon: -50.999, lat: -3.0, fuso: 22, epsg: 31982, e: 500111.123, n: 9668406.82 },
  { lon: -45.0, lat: -23.5, fuso: 23, epsg: 31983, e: 500000.0, n: 7401128.625 },
];

describe('UTM SIRGAS 2000 (MAPA-IMPRESSAO-01, D3)', () => {
  it('U1: bate com o pyproj em 9 pontos de 4 fusos, abaixo de 1 cm', () => {
    expect(PYPROJ).toHaveLength(9);
    for (const p of PYPROJ) {
      const r = paraUtm(p.lon, p.lat, { numero: p.fuso, sul: true, epsg: p.epsg, meridianoCentral: p.fuso * 6 - 183 });
      expect(Math.abs(r.e - p.e)).toBeLessThan(0.01);
      expect(Math.abs(r.n - p.n)).toBeLessThan(0.01);
    }
  });
  it('U5: a inversa (E/N → lon/lat) volta ao ponto do pyproj abaixo de 1 mm', () => {
    for (const p of PYPROJ) {
      const fuso = { numero: p.fuso, sul: true, epsg: p.epsg, meridianoCentral: p.fuso * 6 - 183 };
      const r = deUtm(p.e, p.n, fuso);
      const volta = paraUtm(r.lon, r.lat, fuso);
      expect(Math.hypot(volta.e - p.e, volta.n - p.n)).toBeLessThan(0.001);
      expect(Math.abs(r.lon - p.lon)).toBeLessThan(1e-7);
      expect(Math.abs(r.lat - p.lat)).toBeLessThan(1e-7);
    }
  });
  it('U2: o fuso automático e o EPSG', () => {
    expect(fusoDe(-52.61, -21.27)).toEqual({ numero: 22, sul: true, epsg: 31982, meridianoCentral: -51 });
    expect(fusoDe(-56.9, -8.5).epsg).toBe(31981);
    expect(fusoDe(-45.0, -23.5).epsg).toBe(31983);
    expect(fusoDe(-35.2, -5.8).epsg).toBe(31985);
    expect(fusoDe(-60.7, 2.8)).toEqual({ numero: 20, sul: false, epsg: 31974, meridianoCentral: -63 });
  });
  it('U3: a convergência meridiana bate com o pyproj (0,01°)', () => {
    /* o pyproj (`meridian_convergence`) mede o norte da QUADRÍCULA a partir do verdadeiro; aqui é o VERDADEIRO a partir da quadrícula
       (o que a seta da folha desenha): o mesmo ângulo com o sinal trocado. Oeste do meridiano central, no sul: o norte verdadeiro
       fica à esquerda. */
    const casos = [[-52.61, -21.2665, 0.584093], [-48.5, -15.8, -0.681108], [-35.2, -5.8, 0.222434]];
    for (const [lon, lat, ref] of casos) expect(Math.abs(convergencia(lon, lat, fusoDe(lon, lat)) + ref)).toBeLessThan(0.01);
  });
  it('U4: graus e minutos', () => {
    expect(grausMinutos(0.584093)).toBe('0°35′');
    expect(grausMinutos(-0.681108)).toBe('0°41′');
    expect(grausMinutos(1.9999)).toBe('2°00′');
  });
});
