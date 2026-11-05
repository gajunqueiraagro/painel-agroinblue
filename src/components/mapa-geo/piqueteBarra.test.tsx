/**
 * PIQUETE-POLIGONO-01 (Gabriel 03/11 21:37) e PIQUETE-PRO-01 (04/11 10:34) — a barra do "+ Piquete": só "+ Piquete", Desfazer, Cancelar e "Prévia e gravar"; sem o menu do modo
 * nem a "Área desejada"; desenhando, a 2ª linha diz como; fora disso o que falta vem em cinza (nunca vermelho); a lista com nome editável.
 */
import L from 'leaflet';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: () => Promise.resolve({ error: null, data: null }),
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; },
  },
}));

import { CriarPiquetesNoMapa } from './CriarPiquetes';
import { useCriarPiquetes, type CriarPiquetes } from '@/hooks/useCriarPiquetes';

const O = -47.9, S = -15.51, LON = 0.0112, LAT = 0.0072;
const GEO: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[O, S], [O + LON, S], [O + LON, S + LAT], [O, S + LAT], [O, S]]] };
const PAI = { geometriaId: 'geo-1', pastoId: 'pasto-1', nome: 'P6', geojson: GEO };
const GEOMETRIAS = [{ id: 'geo-1', pasto_id: 'pasto-1', tipo: 'pasto', geojson: GEO }];

let piqAtual: CriarPiquetes;
let mapa: L.Map;
function Host() {
  const piq = useCriarPiquetes({ mapa, pastos: [], geometrias: GEOMETRIAS, clienteId: 'cli', aoGravar: () => {}, enquadrar: () => {} });
  piqAtual = piq;
  return <CriarPiquetesNoMapa piq={piq} />;
}
function memoria() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const clicar = (k: number, j: number) => act(() => { mapa.fire('click', { latlng: L.latLng(S + j * LAT, O + k * LON) }); });

beforeEach(() => {
  vi.stubGlobal('localStorage', memoria());
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 2000 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 0 });
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => ctx, configurable: true });
  const div = document.createElement('div');
  Object.defineProperty(div, 'clientWidth', { value: 1200 });
  Object.defineProperty(div, 'clientHeight', { value: 700 });
  document.body.appendChild(div);
  mapa = L.map(div, { zoomControl: false, attributionControl: false, preferCanvas: true });
  mapa.setView([S + LAT / 2, O + LON / 2], 15);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function abrir() {
  render(<Host />);
  act(() => piqAtual.abrir(PAI, 'poligonos'));
  await waitFor(() => expect(piqAtual.grupo.estado).toBe('ok'));
}

describe('PIQUETE-POLIGONO-01 · a barra do "+ Piquete"', () => {
  /* PIQUETE-PRO-01 (Gabriel 04/11 10:34): + "+ Área interna" e "Restante vira piquete"; a "Área desejada" saiu (a lista tem o rodapé dos 100%) */
  it('"+ Piquete", "+ Área interna", "Restante vira piquete", Desfazer, Cancelar e "Prévia e gravar"; sem o menu do modo nem a "Área desejada"', async () => {
    await abrir();
    const barra = screen.getByTestId('barra-piquetes');
    expect([...barra.querySelectorAll('button')].map(b => b.textContent?.trim()))
      .toEqual(['+ Piquete', '+ Área interna', 'Restante vira piquete', 'Desfazer', 'Cancelar', 'Prévia e gravar']);
    expect(screen.queryByTestId('piquetes-modo')).toBeNull();
    expect(screen.queryByTestId('piquetes-area-desejada')).toBeNull();
  });

  it('a lista: Editar pontos · Renomear · Apagar em cada piquete; o rodapé Pasto · Piquetes · Praça/corredores · SEM PIQUETE (vermelho até zerar)', async () => {
    await abrir();
    /* nada desenhado: o pasto inteiro está SEM PIQUETE */
    expect(screen.getByTestId('piquetes-sem-piquete').textContent).toBe(screen.getByTestId('piquetes-conta-pasto').textContent);
    expect(screen.getByTestId('piquetes-sem-piquete').dataset.falta).toBe('1');
    [[0, 0], [0.5, 0], [0.5, 1], [0, 1], [0, 0]].forEach(([k, j]) => clicar(k, j));
    expect(screen.getByTestId('piquetes-restante').hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByTestId('piquetes-restante'));
    expect(screen.getByTestId('piquetes-sem-piquete').textContent).toBe('0,00');
    expect(screen.getByTestId('piquetes-sem-piquete').dataset.falta).toBeUndefined();
    expect(screen.getByTestId('piquetes-soma').textContent).toBe(screen.getByTestId('piquetes-conta-pasto').textContent);
    expect(screen.getByTestId('piquetes-restante').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('piquetes-previa').hasAttribute('disabled')).toBe(false);
    /* Renomear põe o cursor no nome; Editar pontos liga a edição (o botão fica azul); Apagar tira o piquete */
    fireEvent.click(screen.getAllByTestId('piquetes-renomear')[1]);
    expect(document.activeElement).toBe(screen.getAllByTestId('piquetes-nome')[1]);
    fireEvent.click(screen.getAllByTestId('piquetes-editar')[0]);
    expect(piqAtual.editando).not.toBeNull();
    expect(screen.getAllByTestId('piquetes-editar')[0].className).toContain('bg-blue-600');
    fireEvent.click(screen.getAllByTestId('piquetes-apagar')[0]);
    expect(screen.getAllByTestId('piquetes-linha')).toHaveLength(1);
    expect(screen.getByTestId('piquetes-sem-piquete').dataset.falta).toBe('1');
  });

  it('desenhando, a 2ª linha diz como; fora disso o que falta vem em cinza; com 2 piquetes, a prévia libera', async () => {
    await abrir();
    expect(screen.getByTestId('piquetes-dica').textContent).toBe('clique os pontos do piquete · fecha no 1º ponto · Backspace tira o último ponto · Esc desiste');
    [[0, 0], [0.5, 0], [0.5, 1], [0, 1], [0, 0]].forEach(([k, j]) => clicar(k, j));
    const aviso = screen.getByTestId('piquetes-aviso');
    expect(aviso.textContent).toBe('Desenhe pelo menos 2 piquetes ("+ Piquete").');
    expect(aviso.className).toContain('text-muted-foreground');
    expect(screen.getByTestId('piquetes-previa').hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByTestId('piquetes-mais-piquete'));
    [[0.5, 0], [1, 0], [1, 1], [0.5, 1], [0.5, 0]].forEach(([k, j]) => clicar(k, j));
    expect(screen.getAllByTestId('piquetes-nome').map(i => (i as HTMLInputElement).value).sort()).toEqual(['P6-A', 'P6-B']);
    expect(screen.getByTestId('piquetes-previa').hasAttribute('disabled')).toBe(false);
    expect(screen.getByTestId('piquetes-medidas').textContent).toMatch(/· 2 piquetes de /);
  });
});
