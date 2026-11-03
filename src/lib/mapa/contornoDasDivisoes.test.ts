/** MAPA-PIQUETES-04 — o contorno do pai = a união das divisões, limpa. Casos: as divisões REAIS do P18 e do P28 da Faz. Pureza (02/11). */
import { describe, expect, it } from 'vitest';
import { areaEmHectares } from '@/lib/mapa/areaDoPoligono';
import { contornoDasDivisoes, limparAnel } from './contornoDasDivisoes';
import CASOS from './contornoDasDivisoes.casos.json';

type Divisao = { id: string; nome: string; geojson: GeoJSON.Polygon };
const poligono = (coordinates: number[][][]): GeoJSON.Polygon => ({ type: 'Polygon', coordinates });
const ler = (lista: { id: string; nome: string; geojson: { coordinates: number[][][] } }[]): Divisao[] =>
  lista.map((d) => ({ id: d.id, nome: d.nome, geojson: poligono(d.geojson.coordinates) }));
const casos: Record<string, Divisao[]> = { P18: ler(CASOS.P18), P28: ler(CASOS.P28) };
const m = (a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);
const temAgulha = (anel: number[][]) => anel.slice(0, -1).some((_p, i, pts) => m(pts[(i - 1 + pts.length) % pts.length], pts[(i + 1) % pts.length]) < 0.5);

describe('o contorno das divisões', () => {
  for (const pai of ['P18', 'P28']) {
    it(`${pai}: uma peça, área = Σ das divisões, o redondel fica como furo, sem agulha e o furo não encosta no contorno`, () => {
      const divs = casos[pai];
      const r = contornoDasDivisoes(divs);
      expect(r.ok).toBe(true);
      if ('motivo' in r) return;
      const soma = divs.reduce((s, d) => s + areaEmHectares(d.geojson), 0);
      expect(Math.abs(areaEmHectares(r.valor) - soma)).toBeLessThan(0.05);
      expect(r.valor.coordinates).toHaveLength(2);
      for (const anel of r.valor.coordinates) expect(temAgulha(anel)).toBe(false);
      const [fora, furo] = r.valor.coordinates;
      expect(furo.some((p) => fora.some((q) => m(p, q) < 0.5))).toBe(false);
    });
  }
  it('limparAnel: tira a agulha (ida e volta) e o ponto colado; o resto fica', () => {
    const anel = [[0, 0], [0.001, 0], [0.0015, 0.0005], [0.001, 0], [0.001, 0.001], [0.001, 0.0010000001], [0, 0.001], [0, 0]];
    const r = limparAnel(anel);
    expect(r.anel).toEqual([[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]);
    expect(r.tirados).toBe(3);
  });
  it('divisão que não encosta: recusa com o nome', () => {
    const [a, b] = casos.P18;
    const longe = { ...b, nome: 'Longe', geojson: poligono(b.geojson.coordinates.map((anel) => anel.map(([x, y]) => [x + 0.05, y]))) };
    const r = contornoDasDivisoes([a, longe]);
    expect(r.ok).toBe(false);
    if ('motivo' in r) expect(r.motivo).toContain('Longe');
  });
});
