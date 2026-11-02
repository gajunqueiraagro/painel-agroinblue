/* MAPA-EDITAR-POLIGONO-09 — os metros dos lados: um componente para todo modo; lado curto ou rótulo que encavalaria fica no "passar o
   mouse" (nunca rótulo encavalado); sem limite de número de lados (o Modulo 02 tem mais de 40). */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import L from 'leaflet';
import { desenharRotulosDosLados, larguraDoRotulo, rotulosVisiveis, textoDoLado } from './rotulosDosLados';

const lado = (x0: number, y0: number, x1: number, y1: number, texto = '1.234 m') => ({ a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, texto });

describe('rótulos dos lados (-09)', () => {
  it('lado longo na tela mostra; lado curto demais para o rótulo não (vai para o passar o mouse)', () => {
    const w = larguraDoRotulo('1.234 m');
    expect(rotulosVisiveis([lado(0, 0, w + 20, 0), lado(0, 50, w - 5, 50)])).toEqual([true, false]);
  });
  it('dois rótulos que encavalariam: fica o do lado mais longo', () => {
    // dois lados com o meio no mesmo ponto: só um rótulo
    expect(rotulosVisiveis([lado(0, 0, 200, 0), lado(50, -2, 150, 2)])).toEqual([true, false]);
  });
  it('sem limite de lados: 60 lados longos e separados mostram os 60', () => {
    const muitos = Array.from({ length: 60 }, (_x, i) => lado(0, i * 20, 200, i * 20));
    expect(rotulosVisiveis(muitos).filter(Boolean).length).toBe(60);
  });
  it('texto pt-BR', () => { expect(textoDoLado(1234.4)).toBe('1.234 m'); });
  it('mapa já desmontado: não desenha nem quebra a tela (o redesenho agendado depois do map.remove())', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const mapa = L.map(div).setView([-15.5, -47.9], 15);
    const grupo = L.layerGroup().addTo(mapa);
    const pontos = [[-47.9, -15.5], [-47.89, -15.5], [-47.89, -15.49], [-47.9, -15.5]];
    grupo.addLayer(L.marker([-15.5, -47.9])); // o que estava desenhado antes
    mapa.remove();
    expect(() => desenharRotulosDosLados(mapa, grupo, pontos, true)).not.toThrow();
    expect(grupo.getLayers().length).toBe(0);
  });
});
