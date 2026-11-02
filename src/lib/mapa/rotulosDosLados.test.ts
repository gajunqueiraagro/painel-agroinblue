/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a — a régua dos piquetes: os metros de CADA lado de cada divisão, SEM repetir o lado comum, pelo MESMO
 * componente de rótulos (a mesma regra de visibilidade) dos outros modos.
 */
import L from 'leaflet';
import { describe, expect, it } from 'vitest';
import { cortesIguais, montar } from './criarPiquetes';
import { distanciaM } from './edicaoDoPoligono';
import { linhasDaGrade, segmentosDaRegua } from './linhasDosPiquetes';
import { desenharRotulosDeSegmentos, desenharRotulosDosLados, ladosDeSegmentos, rotulosVisiveis, textoDoLado } from './rotulosDosLados';

const R = 6378137;
function retangulo(ha: number): GeoJSON.Polygon {
  const dl = (0.0112 * Math.PI) / 180;
  const latN = (Math.asin(Math.sin((-15.51 * Math.PI) / 180) + (ha * 10000) / (R * R * dl)) * 180) / Math.PI;
  return { type: 'Polygon', coordinates: [[[-47.9, -15.51], [-47.9 + 0.0112, -15.51], [-47.9 + 0.0112, latN], [-47.9, latN], [-47.9, -15.51]]] };
}

function mapaDeTeste(g: GeoJSON.Polygon): L.Map {
  const div = document.createElement('div');
  Object.defineProperty(div, 'clientWidth', { value: 1200 });
  Object.defineProperty(div, 'clientHeight', { value: 700 });
  const mapa = L.map(div, { zoomControl: false, attributionControl: false });
  const [[x0, y0], , [x1, y1]] = g.coordinates[0];
  mapa.fitBounds([[y0, x0], [y1, x1]]);
  return mapa;
}

describe('os metros da régua (segmentos sem repetir)', () => {
  const g = retangulo(80);
  const m = montar(g);
  // 2 faixas × 3 colunas: 6 divisões, mas o lado de uma é o de outra
  const linhas = linhasDaGrade(m, cortesIguais(m, 2, 3));
  const segs = segmentosDaRegua(g, linhas, []);

  it('cada lado vira um texto "N m" com milhar pt-BR; o lado comum aparece UMA vez', () => {
    const lados = ladosDeSegmentos(segs);
    expect(lados).toHaveLength(segs.length);
    const total = segs.reduce((s, x) => s + distanciaM(x.p, x.q), 0);
    // contorno (perímetro) + as linhas internas: bem menos que somar o perímetro de cada uma das 6 divisões
    const perimetroDoPasto = [0, 1, 2, 3].reduce((s, i) => s + distanciaM(g.coordinates[0][i], g.coordinates[0][i + 1]), 0);
    expect(total).toBeGreaterThan(perimetroDoPasto);
    expect(total).toBeLessThan(perimetroDoPasto * 2.2);
    expect(lados.every(l => /^\d{1,3}(\.\d{3})* m$/.test(l.texto))).toBe(true);
    expect(textoDoLado(1234.4)).toBe('1.234 m');
    lados.forEach((l, i) => expect(l.texto).toBe(textoDoLado(distanciaM(segs[i].p, segs[i].q))));
  });

  it('mesma regra de visibilidade do componente: o rótulo que não cabe no lado (ou encavalaria) não desenha', () => {
    const longo = { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, texto: '1.234 m' };
    const curto = { a: { x: 0, y: 10 }, b: { x: 12, y: 10 }, texto: '1.234 m' };
    const em_cima = { a: { x: 0, y: 2 }, b: { x: 150, y: 2 }, texto: '999 m' };
    expect(rotulosVisiveis([longo, curto, em_cima])).toEqual([true, false, false]);
  });

  it('no mapa: rótulo nos lados que cabem e faixa com tooltip nos que não; limpa o grupo a cada chamada; mapa desmontado não quebra', () => {
    const mapa = mapaDeTeste(g);
    const grupo = L.layerGroup().addTo(mapa);
    desenharRotulosDeSegmentos(mapa, grupo, segs);
    const n1 = grupo.getLayers().length;
    expect(n1).toBe(segs.length);
    desenharRotulosDeSegmentos(mapa, grupo, segs);
    expect(grupo.getLayers().length).toBe(n1);
    const marcadores = grupo.getLayers().filter(l => l instanceof L.Marker);
    expect(marcadores.length).toBeGreaterThan(0);
    desenharRotulosDeSegmentos(mapa, grupo, []);
    expect(grupo.getLayers()).toHaveLength(0);
    // o componente antigo segue igual
    desenharRotulosDosLados(mapa, grupo, g.coordinates[0], false);
    expect(grupo.getLayers()).toHaveLength(4);
    mapa.remove();
    expect(() => desenharRotulosDeSegmentos(mapa, grupo, segs)).not.toThrow();
  });
});
