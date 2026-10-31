import { describe, expect, it } from 'vitest';
import { areaEmHectares, areaNaTabela } from './areaDoPoligono';

// Um quadrado de 0,01° × 0,01° perto do equador ≈ 123,6 ha (1,1119 km × 1,1119 km).
const QUADRADO: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]] };

describe('areaEmHectares (MAPA-IMPORT-01b)', () => {
  it('quadrado de 0,01° no equador', () => {
    expect(areaEmHectares(QUADRADO)).toBeCloseTo(123.6, 0);
  });

  it('o furo é descontado', () => {
    const comFuro: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [QUADRADO.coordinates[0], [[0.0025, 0.0025], [0.0075, 0.0025], [0.0075, 0.0075], [0.0025, 0.0075], [0.0025, 0.0025]]],
    };
    expect(areaEmHectares(comFuro)).toBeCloseTo(areaEmHectares(QUADRADO) * 0.75, 1);
  });

  it('MultiPolygon soma as partes; ponto vale 0', () => {
    const dois: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: [QUADRADO.coordinates, QUADRADO.coordinates] };
    expect(areaEmHectares(dois)).toBeCloseTo(areaEmHectares(QUADRADO) * 2, 6);
    expect(areaEmHectares({ type: 'Point', coordinates: [0, 0] })).toBe(0);
  });

  it('a tabela mostra 1 casa com vírgula', () => {
    expect(areaNaTabela(1610.2849)).toBe('1610,3');
    expect(areaNaTabela(2.04)).toBe('2,0');
  });
});
