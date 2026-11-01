/* MAPA-EDITAR-POLIGONO-01 — a geometria da edição: medidas na mesma conta do mapa, unir, sobreposição e dividir sem fresta. */
import { describe, it, expect } from 'vitest';
import { areaEmHectares } from './areaDoPoligono';
import {
  distanciaM, dividirPorLinha, fraseDasAreas, ladosM, medidasDe, sobreposicoes, textoHa, textoM, unirVizinhos, type Ponto,
} from './edicaoDoPoligono';

const quad = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon =>
  ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });

// ~1,1 km de lado perto de -15° de latitude
const A = quad(-48, -15, -47.99, -15.01);
const B = quad(-47.99, -15, -47.98, -15.01); // vizinho de A pelo lado x = -47.99
const LONGE = quad(-47.9, -15, -47.89, -15.01);

describe('medidas (a mesma conta do mapa)', () => {
  it('a área é exatamente a do areaEmHectares; os lados e o perímetro pela esfera de mesmo raio', () => {
    const m = medidasDe(A);
    expect(m.areaHa).toBe(areaEmHectares(A));
    expect(m.ladosM).toHaveLength(4);
    // 0,01° de latitude ≈ 1.111,95 m (esfera de raio 6.371.008,8 m)
    expect(m.ladosM[1]).toBeCloseTo(1111.95, 1);
    expect(m.perimetroM).toBeCloseTo(m.ladosM.reduce((s, l) => s + l, 0), 6);
    expect(distanciaM([0, 0], [0, 1])).toBeCloseTo(111195.08, 1);
  });

  it('anel aberto ou fechado dá os mesmos lados', () => {
    const fechado = A.coordinates[0];
    expect(ladosM(fechado)).toEqual(ladosM(fechado.slice(0, -1)));
  });

  it('textos pt-BR e a frase das duas áreas (a oficial é a do cadastro)', () => {
    expect(textoHa(12.44)).toBe('12,4 ha');
    expect(textoM(1530.4)).toBe('1.530 m');
    expect(fraseDasAreas(12.44, 13)).toBe('área do mapa 12,4 ha · cadastro 13,0 ha');
    expect(fraseDasAreas(12.44, null)).toBe('área do mapa 12,4 ha · cadastro —');
  });
});

describe('unir', () => {
  it('dois vizinhos viram um polígono com a soma das áreas', () => {
    const r = unirVizinhos(A, B);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(areaEmHectares(r.valor)).toBeCloseTo(areaEmHectares(A) + areaEmHectares(B), 3);
  });
  it('polígonos que não se tocam: recusa com frase', () => {
    const r = unirVizinhos(A, LONGE);
    expect(r.ok).toBe(false);
    if ('motivo' in r) expect(r.motivo).toContain('não se tocam');
  });
});

describe('sobreposição (aviso)', () => {
  it('vizinho encostado não conta; invadido conta com a área invadida', () => {
    expect(sobreposicoes(A, [{ id: 'b', nome: 'B', geojson: B }])).toEqual([]);
    const invasor = quad(-48, -15, -47.985, -15.01); // invade metade de B
    const s = sobreposicoes(invasor, [{ id: 'b', nome: 'B', geojson: B }, { id: 'l', nome: 'Longe', geojson: LONGE }]);
    expect(s.map(x => x.id)).toEqual(['b']);
    expect(s[0].areaHa).toBeCloseTo(areaEmHectares(B) / 2, 1);
  });
});

describe('dividir por uma linha', () => {
  it('linha reta de lado a lado: 2 metades que somam a área e dividem a mesma divisa (sem fresta nem sobreposição)', () => {
    const linha: Ponto[] = [[-47.995, -14.99], [-47.995, -15.02]];
    const r = dividirPorLinha(A, linha);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { a, b } = r.valor;
    expect(areaEmHectares(a) + areaEmHectares(b)).toBeCloseTo(areaEmHectares(A), 6);
    expect(areaEmHectares(a)).toBeCloseTo(areaEmHectares(A) / 2, 2);
    expect(sobreposicoes(a, [{ id: 'b', nome: 'b', geojson: b }])).toEqual([]);
    const u = unirVizinhos(a, b);
    expect(u.ok && areaEmHectares(u.valor)).toBeCloseTo(areaEmHectares(A), 6);
  });

  it('linha com dobra (3 pontos) também divide em 2', () => {
    const r = dividirPorLinha(A, [[-47.998, -14.99], [-47.995, -15.005], [-47.992, -15.02]]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(areaEmHectares(r.valor.a) + areaEmHectares(r.valor.b)).toBeCloseTo(areaEmHectares(A), 6);
  });

  it('linha que não atravessa: recusa', () => {
    const r = dividirPorLinha(A, [[-47.95, -14.99], [-47.95, -15.02]]);
    expect(r.ok).toBe(false);
  });

  it('linha que entra e sai pelo mesmo lado (recorta um canto): 2 pedaços, vale', () => {
    const r = dividirPorLinha(A, [[-48.001, -15.002], [-47.995, -15.002], [-47.995, -15.008], [-48.001, -15.008]]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(areaEmHectares(r.valor.a) + areaEmHectares(r.valor.b)).toBeCloseTo(areaEmHectares(A), 6);
  });

  it('linha que entra e sai duas vezes (3+ pedaços): recusa com frase', () => {
    const zigue: Ponto[] = [[-47.997, -14.99], [-47.997, -15.02], [-47.993, -15.02], [-47.993, -14.99]];
    const r = dividirPorLinha(A, zigue);
    expect(r.ok).toBe(false);
    if ('motivo' in r) expect(r.motivo).toContain('mais de 2 partes');
  });

  it('polígono com furo: recusa', () => {
    const furado: GeoJSON.Polygon = { type: 'Polygon', coordinates: [A.coordinates[0],
      [[-47.996, -15.004], [-47.994, -15.004], [-47.994, -15.006], [-47.996, -15.006], [-47.996, -15.004]]] };
    expect(dividirPorLinha(furado, [[-47.995, -14.99], [-47.995, -15.02]]).ok).toBe(false);
  });
});
