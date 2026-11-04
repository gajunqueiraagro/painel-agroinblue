/**
 * PIQUETE-PRO-01 (Gabriel 04/11 10:34) — as contas puras do "+ Piquete" profissional: corrigir (cantos, recorte pelo vizinho), a borda comum igual
 * (o trecho entre dois pontos grudados na mesma borda segue a borda), os 100% do pasto (sobra, "Restante vira piquete", a conta) e a área interna
 * (a que existe fica fora sozinha; a desenhada recorta). Contornos SINTÉTICOS (~1.200 × 800 m).
 */
import { describe, expect, it } from 'vitest';
import {
  areasParaGravar, cantosDoPiquete, comCantoMovido, comCantoNaBorda, piqueteDesenhado, piqueteRecortado, semCanto, sobraDoPasto, tracadoPelasBordas,
} from '@/lib/mapa/linhasDosPiquetes';
import {
  comAreaInterna, comPiqueteCru, comPiqueteDesenhado, comPiqueteEditado, comRestante, contaDoPasto, desenhoVazio, semPiqueteNoDesenho, TOLERANCIA_SEM_PIQUETE_HA,
} from '@/lib/mapa/desenhoDosPiquetes';
import { areasInternasDoPasto } from '@/lib/mapa/areaCercada';
import { areaDoBancoHa } from '@/lib/mapa/criarPiquetes';
import { textoDaAreaHa, textoDaMedida } from '@/hooks/usePontoAPonto';
import type { Ponto } from '@/lib/mapa/edicaoDoPoligono';

const O = -47.9, S = -15.51, LON = 0.0112, LAT = 0.0072;
const p = (a: number, b: number): Ponto => [O + a * LON, S + b * LAT];
const anel = (pts: Ponto[]) => [...pts, pts[0]];
const ret = (a0: number, b0: number, a1: number, b1: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [anel([p(a0, b0), p(a1, b0), p(a1, b1), p(a0, b1)])] });
const PASTO = ret(0, 0, 1, 1);
/* o furo no meio (a praça antiga) e a praça que o ocupa */
const FURO = anel([p(0.45, 0.45), p(0.45, 0.55), p(0.55, 0.55), p(0.55, 0.45)]);
const COM_FURO: GeoJSON.Polygon = { type: 'Polygon', coordinates: [PASTO.coordinates[0], FURO] };
const PRACA: GeoJSON.Polygon = { type: 'Polygon', coordinates: [anel([p(0.45, 0.45), p(0.55, 0.45), p(0.55, 0.55), p(0.45, 0.55)])] };
const TOTAL = areaDoBancoHa(PASTO);
const ha = (g: GeoJSON.Polygon | GeoJSON.MultiPolygon | null | undefined) => (g ? areaDoBancoHa(g) : 0);

describe('corrigir o piquete', () => {
  it('editado por cima do vizinho: a sobreposição sai sozinha (o vizinho fica com a divisa dele)', () => {
    const oeste = ret(0, 0, 0.5, 1);
    const r = piqueteRecortado(PASTO, [oeste], ret(0.3, 0, 1, 1));
    expect(ha(r)).toBeCloseTo(TOTAL / 2, 1);
  });
  it('os cantos: arrastar, tirar (o anel não fica com menos de 3) e criar na borda (a forma não muda)', () => {
    const q = ret(0, 0, 0.5, 1);
    expect(cantosDoPiquete(q)).toHaveLength(4);
    const movido = comCantoMovido(q, { parte: 0, anel: 0, i: 1 }, p(0.75, 0));
    expect(cantosDoPiquete(movido)[1].p).toEqual(p(0.75, 0));
    expect(movido.type === 'Polygon' && movido.coordinates[0][4]).toEqual(movido.type === 'Polygon' && movido.coordinates[0][0]); // continua fechado
    const tri = semCanto(q, { parte: 0, anel: 0, i: 2 });
    expect(tri && cantosDoPiquete(tri)).toHaveLength(3);
    expect(tri && semCanto(tri, { parte: 0, anel: 0, i: 0 })).toBeNull();
    const com5 = comCantoNaBorda(q, p(0.25, 0.01));
    expect(cantosDoPiquete(com5)).toHaveLength(5);
    expect(cantosDoPiquete(com5)[1].p[0]).toBeCloseTo(p(0.25, 0)[0], 9);
    expect(ha(com5)).toBeCloseTo(ha(q), 6);
  });
  it('o fim do arrasto recorta pelo vizinho; o que some por inteiro volta à forma de antes', () => {
    const d0 = comPiqueteDesenhado(PASTO, comPiqueteDesenhado(PASTO, desenhoVazio(), [p(0, 0), p(0.5, 0), p(0.5, 1), p(0, 1)]), [p(0.5, 0), p(1, 0), p(1, 1), p(0.5, 1)]);
    const antes = d0.piquetes?.[1];
    if (!antes) throw new Error('sem B');
    const cru = comPiqueteCru(d0, 1, comCantoMovido(antes, { parte: 0, anel: 0, i: 0 }, p(0.2, 0)));
    expect(ha(cru.piquetes?.[1])).toBeGreaterThan(TOTAL / 2); // ao vivo, ainda por cima do A
    const fim = comPiqueteEditado(PASTO, cru, 1, antes);
    expect(ha(fim.piquetes?.[1])).toBeCloseTo(TOTAL / 2, 1);
    const sumiu = comPiqueteEditado(PASTO, comPiqueteCru(d0, 1, ret(0.1, 0.1, 0.2, 0.2)), 1, antes);
    expect(sumiu.piquetes?.[1]).toBe(antes);
    expect(semPiqueteNoDesenho(d0, 0).piquetes).toEqual([antes]);
  });
});

describe('a borda comum igual', () => {
  /* o vizinho com a divisa dobrada (3 trechos) */
  const VIZ = anel([p(0, 0), p(0.5, 0), p(0.52, 0.5), p(0.5, 1), p(0, 1)]);
  it('dois pontos grudados na mesma borda e a borda colada no trecho: o trecho segue a borda, canto por canto', () => {
    const r = tracadoPelasBordas([p(0.5, 0), p(1, 0), p(1, 1), p(0.5, 1)], [VIZ], 200);
    expect(r).toHaveLength(5);
    expect(r[4]).toEqual(p(0.52, 0.5));
    const piq = piqueteDesenhado(PASTO, [{ type: 'Polygon', coordinates: [VIZ] }], r);
    expect(ha(piq) + areaDoBancoHa({ type: 'Polygon', coordinates: [VIZ] })).toBeCloseTo(TOTAL, 3); // sem fresta
  });
  it('a borda que se afasta do trecho mais que o desvio (o corte reto que atravessa o pasto) fica reta', () => {
    expect(tracadoPelasBordas([p(0.5, 0), p(1, 0), p(1, 1), p(0.5, 1)], [VIZ], 5)).toHaveLength(4);
    expect(tracadoPelasBordas([p(0, 0.5), p(1, 0.5), p(1, 2), p(0, 2)], [anel([p(0, 0), p(1, 0), p(1, 1), p(0, 1)])], 50)).toHaveLength(4);
  });
  it('ponto fora da borda não é "em cima": nada muda', () => {
    expect(tracadoPelasBordas([p(0.6, 0), p(1, 0), p(1, 1), p(0.6, 1)], [VIZ], 500)).toHaveLength(4);
  });
});

describe('100% do pasto', () => {
  it('a sobra é o pasto menos o que cobre; "Restante vira piquete" fecha o pasto (Z = 0)', () => {
    const d1 = comPiqueteDesenhado(PASTO, desenhoVazio(), [p(0, 0), p(0.4, 0), p(0.4, 1), p(0, 1)]);
    expect(ha(sobraDoPasto(PASTO, d1.piquetes ?? []))).toBeCloseTo(TOTAL * 0.6, 1);
    const c1 = contaDoPasto(PASTO, d1);
    expect(c1.semPiqueteHa).toBeCloseTo(TOTAL * 0.6, 1);
    const d2 = comRestante(PASTO, d1);
    expect(d2.piquetes).toHaveLength(2);
    const c2 = contaDoPasto(PASTO, d2);
    expect(c2.semPiqueteHa).toBeLessThanOrEqual(TOLERANCIA_SEM_PIQUETE_HA);
    expect(c2.semPiquete).toBeNull();
    expect(c2.piquetesHa).toBeCloseTo(c2.pastoHa, 3);
    expect(comRestante(PASTO, d2)).toBe(d2);
  });
  it('a sobra em pedaços soltos vira um piquete por pedaço, o maior primeiro; o farelo abaixo de 0,01 ha não vira piquete', () => {
    const meio = comPiqueteDesenhado(PASTO, desenhoVazio(), [p(0.2, 0), p(0.6, 0), p(0.6, 1), p(0.2, 1)]);
    const r = comRestante(PASTO, meio);
    expect(r.piquetes).toHaveLength(3);
    expect(ha(r.piquetes?.[1])).toBeCloseTo(TOTAL * 0.4, 1);
    expect(ha(r.piquetes?.[2])).toBeCloseTo(TOTAL * 0.2, 1);
    /* sobra só uma lasca de ~1 m × 800 m (0,08 ha) e um farelo de ~5 m × 5 m (0,0025 ha) */
    const m = 1 / (111320 * Math.cos((15.5 * Math.PI) / 180) * LON);
    const quase = comPiqueteDesenhado(PASTO, desenhoVazio(), [p(0, 0), p(1 - m, 0), p(1 - m, 1), p(0, 1)]);
    const lasca = comRestante(PASTO, quase);
    expect(lasca.piquetes).toHaveLength(2);
    expect(ha(lasca.piquetes?.[1])).toBeGreaterThan(TOLERANCIA_SEM_PIQUETE_HA);
    const f = 5 * m;
    const g = f * LON / LAT;
    const farelo = comPiqueteDesenhado(PASTO, desenhoVazio(), [p(0, 0), p(1, 0), p(1, 1 - g), p(1 - f, 1 - g), p(1 - f, 1), p(0, 1)]);
    const z = ha(sobraDoPasto(PASTO, farelo.piquetes ?? []));
    expect(z).toBeGreaterThan(0);
    expect(z).toBeLessThan(TOLERANCIA_SEM_PIQUETE_HA);
    expect(comRestante(PASTO, farelo)).toBe(farelo);
  });
  it('a conta: o pasto é a área do contorno (o furo já fora); a praça no furo entra em "praça/corredores" e não falta piquete por ela', () => {
    const d = comRestante(COM_FURO, desenhoVazio(), [PRACA]);
    const c = contaDoPasto(COM_FURO, d, [PRACA]);
    expect(c.pastoHa).toBeCloseTo(TOTAL - areaDoBancoHa(PRACA), 3);
    expect(c.internasHa).toBeCloseTo(areaDoBancoHa(PRACA), 6);
    expect(c.semPiqueteHa).toBe(0);
    expect(c.piquetesHa).toBeCloseTo(c.pastoHa, 3);
  });
});

describe('áreas internas', () => {
  it('a que já existe dentro do contorno externo (mesmo no furo) é interna; "outra", "pasto" e a de fora não', () => {
    const geos = [
      { id: 'pr', tipo: 'praca_alimentacao', geojson: PRACA },
      { id: 'so', tipo: 'outra', geojson: ret(0.1, 0.1, 0.2, 0.2) },
      { id: 'pa', tipo: 'pasto', geojson: ret(0.1, 0.1, 0.2, 0.2) },
      { id: 'fo', tipo: 'curral', geojson: ret(2, 2, 2.1, 2.1) },
      { id: 'se', tipo: 'benfeitoria', geojson: ret(0.8, 0.8, 0.9, 0.9) },
    ];
    expect(areasInternasDoPasto({ id: 'g', geojson: COM_FURO }, geos).map(g => g.id)).toEqual(['pr', 'se']);
  });
  it('a área interna que já existe (sobre o pasto) fica fora do piquete sozinha', () => {
    const sede = ret(0.8, 0.8, 0.9, 0.9);
    const d = comPiqueteDesenhado(PASTO, desenhoVazio(), [p(0.5, 0), p(1, 0), p(1, 1), p(0.5, 1)], [sede]);
    expect(ha(d.piquetes?.[0])).toBeCloseTo(TOTAL / 2 - areaDoBancoHa(sede), 2);
  });
  it('"+ Área interna" recorta os piquetes que ela cobre, vai na gravação (benfeitoria com o nome dela) e nada sobrou = não muda', () => {
    const d = comRestante(PASTO, desenhoVazio());
    const r = comAreaInterna(PASTO, d, 'benfeitoria', [p(0.1, 0.1), p(0.3, 0.1), p(0.3, 0.3), p(0.1, 0.3)]);
    expect(r.internas).toHaveLength(1);
    expect(ha(r.piquetes?.[0])).toBeCloseTo(TOTAL * (1 - 0.04), 2);
    expect(contaDoPasto(PASTO, r).semPiqueteHa).toBe(0);
    expect(areasParaGravar(r.internas ?? [])).toEqual([{ nome: 'Benfeitoria', tipo: 'benfeitoria', geojson: r.internas?.[0].geojson }]);
    expect(areasParaGravar([{ id: 'c', tipo: 'corredor', nome: 'x', geojson: PRACA }])[0].tipo).toBe('estrada');
    expect(comAreaInterna(PASTO, d, 'praca', [p(2, 2), p(3, 2), p(3, 3)])).toBe(d);
  });
});

describe('a medida ao vivo do piquete', () => {
  it('em hectare com 2 casas, nunca m² (a régua da cerca segue em metros)', () => {
    expect(textoDaAreaHa(560600)).toBe('56,06 ha');
    expect(textoDaMedida('poligono', [p(0, 0), p(1, 0), p(1, 1)], 'ha')).toMatch(/^\d+,\d\d ha$/);
    expect(textoDaMedida('poligono', [p(0, 0), p(1, 0), p(1, 1)])).toMatch(/m²$/);
    expect(textoDaMedida('linha', [p(0, 0), p(1, 0)], 'ha')).toMatch(/m$/);
  });
});
