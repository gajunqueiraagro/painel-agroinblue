/**
 * PIQUETE-POLIGONO-01 — a conta pura do "+ Piquete": o polígono clicado é recortado pela borda do pasto e não cobre os piquetes já
 * desenhados (o vizinho fica com a divisa dele). Contornos SINTÉTICOS (~1.200 × 800 m).
 */
import { describe, expect, it } from 'vitest';
import { piqueteDesenhado } from '@/lib/mapa/linhasDosPiquetes';
import { comPiqueteDesenhado, desenhoVazio, temDesenho } from '@/lib/mapa/desenhoDosPiquetes';
import { areaDoBancoHa } from '@/lib/mapa/criarPiquetes';
import type { Ponto } from '@/lib/mapa/edicaoDoPoligono';

const O = -47.9, S = -15.51, LON = 0.0112, LAT = 0.0072;
const PASTO: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[O, S], [O + LON, S], [O + LON, S + LAT], [O, S + LAT], [O, S]]] };
const p = (a: number, b: number): Ponto => [O + a * LON, S + b * LAT];
const TOTAL = areaDoBancoHa(PASTO);

describe('piqueteDesenhado', () => {
  it('o clique além da borda não leva área de fora: a metade leste desenhada até longe é só a metade do pasto', () => {
    const r = piqueteDesenhado(PASTO, [], [p(0.5, -0.5), p(2, -0.5), p(2, 1.5), p(0.5, 1.5)]);
    expect(r?.type).toBe('Polygon');
    expect(areaDoBancoHa(r!)).toBeCloseTo(TOTAL / 2, 1);
  });
  it('não cobre o piquete de antes: o que passa por cima dele fica com ele', () => {
    const oeste = piqueteDesenhado(PASTO, [], [p(0, 0), p(0.5, 0), p(0.5, 1), p(0, 1)])!;
    const r = piqueteDesenhado(PASTO, [oeste], [p(0.25, 0), p(1, 0), p(1, 1), p(0.25, 1)]);
    expect(areaDoBancoHa(r!)).toBeCloseTo(TOTAL / 2, 1);
    expect(areaDoBancoHa(oeste) + areaDoBancoHa(r!)).toBeCloseTo(TOTAL, 1);
  });
  it('o que cruza o piquete de antes de lado a lado sai em 2 partes (MultiPolygon: a tela diz que saiu em partes)', () => {
    const meio = piqueteDesenhado(PASTO, [], [p(0.4, 0), p(0.6, 0), p(0.6, 1), p(0.4, 1)])!;
    const r = piqueteDesenhado(PASTO, [meio], [p(0.2, 0.2), p(0.8, 0.2), p(0.8, 0.4), p(0.2, 0.4)]);
    expect(r?.type).toBe('MultiPolygon');
  });
  it('fora do pasto, só por cima dos outros, menos de 0,5 m² ou menos de 3 pontos: nada', () => {
    expect(piqueteDesenhado(PASTO, [], [p(2, 2), p(3, 2), p(3, 3)])).toBeNull();
    const tudo = piqueteDesenhado(PASTO, [], [p(0, 0), p(1, 0), p(1, 1), p(0, 1)])!;
    expect(piqueteDesenhado(PASTO, [tudo], [p(0.2, 0.2), p(0.4, 0.2), p(0.4, 0.4)])).toBeNull();
    const m = 1 / 107300; // ~1 m de longitude
    expect(piqueteDesenhado(PASTO, [], [p(0.5, 0.5), [p(0.5, 0.5)[0] + 0.5 * m, p(0.5, 0.5)[1]], [p(0.5, 0.5)[0], p(0.5, 0.5)[1] + 0.5 * m]])).toBeNull();
    expect(piqueteDesenhado(PASTO, [], [p(0, 0), p(1, 0)])).toBeNull();
    expect(piqueteDesenhado(PASTO, [], [])).toBeNull();
  });
});

describe('comPiqueteDesenhado', () => {
  it('acrescenta na ordem em que nasceu e conta como trabalho; nada sobrou = o desenho não muda', () => {
    const d1 = comPiqueteDesenhado(PASTO, desenhoVazio(), [p(0, 0), p(0.5, 0), p(0.5, 1), p(0, 1)]);
    const d2 = comPiqueteDesenhado(PASTO, d1, [p(0.5, 0), p(1, 0), p(1, 1), p(0.5, 1)]);
    expect(d2.piquetes).toHaveLength(2);
    expect(d2.piquetes?.[0]).toBe(d1.piquetes?.[0]); // o 1º desenhado é o A
    expect(temDesenho(d1)).toBe(true);
    expect(comPiqueteDesenhado(PASTO, d2, [p(0.1, 0.1), p(0.3, 0.1), p(0.3, 0.3)])).toBe(d2);
  });
});
