/**
 * MAPA-PAINEL-CERCADA-01 — a área cercada = útil (o polígono do pasto) + as áreas internas (polígonos de área classificados cujo ponto
 * mais interno cai no contorno EXTERNO do pasto; o buraco não tira de dentro). Sem classificação, área total e outro pasto não contam.
 */
import { describe, expect, it } from 'vitest';
import { areaCercadaDoPasto } from './areaCercada';
import { areaEmHectares } from './areaDoPoligono';

const q = (x: number, y: number, l: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x, y], [x + l, y], [x + l, y - l], [x, y - l], [x, y]]] });
const L = 0.01; // ~1 km de lado
const pastoComBuraco: GeoJSON.Polygon = { type: 'Polygon', coordinates: [q(0, 0, L).coordinates[0], q(0.004, -0.004, 0.002).coordinates[0].slice().reverse()] };

describe('área cercada do pasto (MAPA-PAINEL-CERCADA-01)', () => {
  const geos = [
    { id: 'p', tipo: 'pasto', nome_original: 'P1', geojson: pastoComBuraco },
    { id: 'sede', tipo: 'benfeitoria', nome_original: 'Sede', geojson: q(0.004, -0.004, 0.002) },   // no buraco do pasto: conta
    { id: 'cur', tipo: 'curral', nome_original: 'Curral', geojson: q(0.001, -0.001, 0.001) },      // por cima do pasto: conta
    { id: 'fora', tipo: 'reserva_legal', nome_original: 'Mata de fora', geojson: q(0.02, 0, 0.002) }, // fora: não conta
    { id: 'sem', tipo: 'outra', nome_original: 'Sem classe', geojson: q(0.007, -0.007, 0.001) },     // sem classificação: não conta
    { id: 'tot', tipo: 'area_total', nome_original: 'Área total', geojson: q(-0.001, 0.001, 0.012) }, // área total: não conta
    { id: 'p2', tipo: 'pasto', nome_original: 'P2', geojson: q(0.0085, -0.0085, 0.001) },          // outro pasto: não conta
  ];
  const r = areaCercadaDoPasto(geos[0], geos);

  it('útil = o polígono do pasto (com o buraco descontado); internas = só a sede e o curral', () => {
    expect(r.utilHa).toBeCloseTo(areaEmHectares(pastoComBuraco), 6);
    expect(r.internas.map(i => i.nome)).toEqual(['Sede', 'Curral']);
    expect(r.internasHa).toBeCloseTo(areaEmHectares(q(0.004, -0.004, 0.002)) + areaEmHectares(q(0.001, -0.001, 0.001)), 6);
    expect(r.cercadaHa).toBeCloseTo(r.utilHa + r.internasHa, 9);
  });
  it('pasto sem nada dentro: internas 0 e cercada = útil', () => {
    const s = areaCercadaDoPasto({ id: 'x', geojson: q(1, 1, L) }, geos);
    expect(s.internasHa).toBe(0);
    expect(s.cercadaHa).toBeCloseTo(s.utilHa, 9);
  });
});
