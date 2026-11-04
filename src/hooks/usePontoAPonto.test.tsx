/**
 * MEDIR-NO-MAPA-01 — a ferramenta ponto a ponto, com um mapa de verdade (jsdom): a linha termina no duplo clique / Enter e devolve os pontos;
 * o polígono fecha no clique em cima do 1º ponto; Backspace tira o último; Esc cancela; a medida ao vivo (m e m²).
 */
import L from 'leaflet';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { areaDoAnelM2, comprimentoM, textoDaMedida, usePontoAPonto, type FormaDoPontoAPonto } from './usePontoAPonto';
import type { Ponto } from '@/lib/mapa/edicaoDoPoligono';

const O = -52.79, S = -21.473;
const MX = 1 / 103700, MY = 1 / 110700; // ~1 m em graus nessa latitude
const em = (x: number, y: number): Ponto => [O + x * MX, S + y * MY];
/* o galpão de 30 × 20 m */
const GALPAO: Ponto[] = [em(0, 0), em(30, 0), em(30, 20), em(0, 20)];

let mapa: L.Map;
beforeEach(() => {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => ctx, configurable: true });
  const div = document.createElement('div');
  Object.defineProperty(div, 'clientWidth', { value: 1200 });
  Object.defineProperty(div, 'clientHeight', { value: 700 });
  document.body.appendChild(div);
  mapa = L.map(div, { zoomControl: false, attributionControl: false, preferCanvas: true });
  mapa.setView([S + 10 * MY, O + 15 * MX], 19);
});
afterEach(() => { document.body.innerHTML = ''; });

function montar(forma: FormaDoPontoAPonto | null) {
  const aoTerminar = vi.fn(), aoCancelar = vi.fn();
  const h = renderHook(({ f }) => usePontoAPonto({ mapa, forma: f, aoTerminar, aoCancelar }), { initialProps: { f: forma } });
  return { h, aoTerminar, aoCancelar };
}
const clicar = (p: Ponto) => act(() => { mapa.fire('click', { latlng: L.latLng(p[1], p[0]) }); });
const tecla = (key: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key })); });
const vivo = () => [...mapa.getContainer().querySelectorAll('[data-testid="ponto-a-ponto-medida"]')].map(e => e.textContent);

describe('MEDIR-NO-MAPA-01 · a ferramenta ponto a ponto (uma só)', () => {
  it('as contas: o galpão de 30 × 20 m tem 600 m²; a linha de 3 trechos soma os trechos', () => {
    expect(areaDoAnelM2(GALPAO)).toBeGreaterThan(597);
    expect(areaDoAnelM2(GALPAO)).toBeLessThan(603);
    expect(areaDoAnelM2(GALPAO.slice(0, 2))).toBe(0);
    expect(areaDoAnelM2([])).toBe(0);
    expect(comprimentoM([em(0, 0), em(30, 0), em(30, 20), em(0, 20)])).toBeCloseTo(80, 0);
    expect(textoDaMedida('poligono', GALPAO)).toMatch(/^(59[7-9]|60[0-3]) m²$/); // o grau→metro do teste é aproximado
    expect(textoDaMedida('poligono', [em(0, 0), em(100, 0), em(100, 30), em(0, 30)])).toMatch(/^3\.0[0-1]\d m²$/); // o milhar com ponto
    expect(textoDaMedida('linha', [em(0, 0), em(12, 0)])).toBe('12 m');
  });

  it('linha: cada clique é um ponto; a medida ao vivo é o comprimento até o cursor; o duplo clique termina e devolve os pontos', () => {
    const { h, aoTerminar } = montar('linha');
    clicar(em(0, 0));
    act(() => { mapa.fire('mousemove', { latlng: L.latLng(S, O + 12 * MX) }); });
    expect(vivo()).toEqual(['12 m']);
    clicar(em(12, 0));
    clicar(em(12, 0)); // o 2º clique do duplo clique não repete o ponto
    expect(h.result.current.pontos).toHaveLength(2);
    act(() => { mapa.fire('dblclick', { latlng: L.latLng(S, O + 12 * MX) }); });
    expect(aoTerminar).toHaveBeenCalledWith([em(0, 0), em(12, 0)]);
    expect(h.result.current.pontos).toHaveLength(0);
  });

  it('linha: Backspace tira o último ponto; Enter termina; com 1 ponto, nada termina', () => {
    const { h, aoTerminar } = montar('linha');
    clicar(em(0, 0)); clicar(em(5, 0)); clicar(em(9, 9));
    tecla('Backspace');
    expect(h.result.current.pontos).toEqual([em(0, 0), em(5, 0)]);
    tecla('Backspace');
    tecla('Enter');
    expect(aoTerminar).not.toHaveBeenCalled();
    clicar(em(7, 0));
    tecla('Enter');
    expect(aoTerminar).toHaveBeenCalledWith([em(0, 0), em(7, 0)]);
  });

  it('polígono: a medida ao vivo é a área; o clique em cima do 1º ponto fecha (sem repetir o ponto)', () => {
    const { aoTerminar } = montar('poligono');
    GALPAO.forEach(clicar);
    act(() => { mapa.fire('mousemove', { latlng: L.latLng(S + 20 * MY, O) }); });
    expect(vivo()[0]).toMatch(/ m²$/);
    clicar(em(0.3, 0.2)); // a menos de 10 px do 1º ponto
    expect(aoTerminar).toHaveBeenCalledWith(GALPAO);
  });

  it('polígono: com 2 pontos, o clique no 1º é só mais um ponto (não fecha)', () => {
    const { h, aoTerminar } = montar('poligono');
    clicar(em(0, 0)); clicar(em(30, 0)); clicar(em(0.3, 0.2));
    expect(aoTerminar).not.toHaveBeenCalled();
    expect(h.result.current.pontos).toHaveLength(3);
  });

  it('Esc cancela (os pontos somem, aoCancelar é chamado, nada termina); desligada, o clique não marca nada', () => {
    const { h, aoTerminar, aoCancelar } = montar('poligono');
    clicar(em(0, 0)); clicar(em(30, 0));
    tecla('Escape');
    expect(aoCancelar).toHaveBeenCalledTimes(1);
    expect(aoTerminar).not.toHaveBeenCalled();
    expect(h.result.current.pontos).toHaveLength(0);
    h.rerender({ f: null });
    clicar(em(0, 0));
    expect(h.result.current.pontos).toHaveLength(0);
    tecla('Escape');
    expect(aoCancelar).toHaveBeenCalledTimes(1);
  });
});
