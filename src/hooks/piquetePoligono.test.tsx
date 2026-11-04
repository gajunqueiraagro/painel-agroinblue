/**
 * PIQUETE-POLIGONO-01 (Gabriel 03/11 21:37, "só isto") — o "+ Piquete" no hook, com um mapa de verdade (jsdom): abre já desenhando; cada piquete
 * é um polígono clicado ponto a ponto e fechado no 1º ponto (a ferramenta única do Medir no mapa); recortado pelo pasto e sem cobrir o anterior;
 * um por clique no botão; nomes "<pasto>-A, B…"; pelo menos 2 para gravar; Backspace/Ctrl+Z no meio tiram o ponto, Ctrl+Z fora tira o piquete;
 * Esc desiste do piquete (não cancela tudo); a prévia é a `fn_piquetes_criar` de sempre com os polígonos.
 */
import L from 'leaflet';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ rpc: [] as { fn: string; a: Record<string, unknown> }[], grupo: null as null | { id: string; nome: string } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, a: Record<string, unknown>) => {
      estado.rpc.push({ fn, a });
      const piq = Array.isArray(a.p_piquetes) ? a.p_piquetes : [];
      return Promise.resolve({ error: null, data: a.p_simular ? {
        caso: 'novo', contorno: { area_ha: 95.5 }, soma_ha: 60, dif_contorno_ha: -35.5, concluir: { frase: 'frase do banco' },
        piquetes: piq.map((x: { nome: string }) => ({ nome: x.nome, area_ha: 30, liga: 'novo' })),
      } : { ok: true } });
    },
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: estado.grupo, error: null }) }; return q; },
  },
}));

import { useCriarPiquetes } from './useCriarPiquetes';
import { areaDoBancoHa } from '@/lib/mapa/criarPiquetes';

const O = -47.9, S = -15.51, LON = 0.0112, LAT = 0.0072; // ~1.200 × 800 m
const GEO: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[O, S], [O + LON, S], [O + LON, S + LAT], [O, S + LAT], [O, S]]] };
const PAI = { geometriaId: 'geo-1', pastoId: 'pasto-1', nome: 'P6', geojson: GEO };
const GEOMETRIAS = [{ id: 'geo-1', pasto_id: 'pasto-1', tipo: 'pasto', geojson: GEO }];
const x = (k: number) => O + k * LON, y = (k: number) => S + k * LAT;

let mapa: L.Map;
function memoria() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
beforeEach(() => {
  estado.rpc = []; estado.grupo = null;
  vi.stubGlobal('localStorage', memoria());
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => ctx, configurable: true });
  const div = document.createElement('div');
  Object.defineProperty(div, 'clientWidth', { value: 1200 });
  Object.defineProperty(div, 'clientHeight', { value: 700 });
  document.body.appendChild(div);
  mapa = L.map(div, { zoomControl: false, attributionControl: false, preferCanvas: true });
  mapa.setView([y(0.5), x(0.5)], 15);
});
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

async function abrir() {
  const h = renderHook(() => useCriarPiquetes({ mapa, pastos: [], geometrias: GEOMETRIAS, clienteId: 'cli', aoGravar: () => {}, enquadrar: () => {} }));
  act(() => h.result.current.abrir(PAI, 'poligonos'));
  await waitFor(() => expect(h.result.current.grupo.estado).toBe('ok'));
  return h;
}
type H = Awaited<ReturnType<typeof abrir>>;
const clicar = (lng: number, lat: number) => act(() => { mapa.fire('click', { latlng: L.latLng(lat, lng) }); });
const tecla = (key: string, ctrlKey = false) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey })); });
/** clica os cantos e fecha clicando de novo em cima do 1º */
const piquete = (cantos: [number, number][]) => { cantos.forEach(c => clicar(c[0], c[1])); clicar(cantos[0][0], cantos[0][1]); };
/* a metade oeste e a metade leste; a leste começa além da borda (o clique de fora é recortado) */
const OESTE: [number, number][] = [[x(0), y(0)], [x(0.5), y(0)], [x(0.5), y(1)], [x(0), y(1)]];
const LESTE: [number, number][] = [[x(0.5), y(-0.2)], [x(1.2), y(-0.2)], [x(1.2), y(1)], [x(0.5), y(1)]];
const desenharDois = (h: H) => { piquete(OESTE); act(() => h.result.current.setFerramenta('piquete')); piquete(LESTE); };

describe('PIQUETE-POLIGONO-01 · "+ Piquete" = polígono desenhado dentro do pasto', () => {
  it('abre já desenhando o 1º piquete, no modo dos polígonos, sem nada desenhado', async () => {
    const h = await abrir();
    expect(h.result.current.modo).toBe('poligonos');
    expect(h.result.current.ferramenta).toBe('piquete');
    expect(h.result.current.divisoes).toHaveLength(0);
    expect(h.result.current.motivo).toBe('Desenhe pelo menos 2 piquetes ("+ Piquete").');
  });

  it('cada clique é um ponto; o clique em cima do 1º fecha: o piquete entra e o botão desliga (um por clique no botão)', async () => {
    const h = await abrir();
    OESTE.forEach(c => clicar(c[0], c[1]));
    expect(h.result.current.divisoes).toHaveLength(0);
    clicar(OESTE[0][0], OESTE[0][1]);
    expect(h.result.current.divisoes).toHaveLength(1);
    expect(h.result.current.divisoes[0].areaHa).toBeCloseTo(areaDoBancoHa(GEO) / 2, 1);
    expect(h.result.current.ferramenta).toBeNull();
    clicar(x(0.7), y(0.5)); // sem o botão, o clique não desenha nada
    expect(h.result.current.divisoes).toHaveLength(1);
  });

  it('o piquete é recortado pelo pasto e não cobre o anterior: as duas metades somam o pasto, nomes P6-A e P6-B, e a prévia libera', async () => {
    const h = await abrir();
    desenharDois(h);
    const [a, b] = h.result.current.divisoes;
    expect(a.areaHa + b.areaHa).toBeCloseTo(areaDoBancoHa(GEO), 1);
    expect(b.areaHa).toBeCloseTo(areaDoBancoHa(GEO) / 2, 1);
    expect([...h.result.current.nomes].sort()).toEqual(['P6-A', 'P6-B']);
    expect(h.result.current.motivo).toBeNull();
  });

  it('enquanto desenha: Backspace e Ctrl+Z tiram o ponto (não o piquete de antes); Esc desiste do piquete e não pede para cancelar tudo', async () => {
    const h = await abrir();
    piquete(OESTE);
    act(() => h.result.current.setFerramenta('piquete'));
    clicar(x(0.25), y(0.5)); // dentro do piquete A: é ponto do novo, não escolhe a divisão A
    expect(h.result.current.escolhida).toBeNull();
    tecla('Backspace');
    clicar(x(0.6), y(0.1)); clicar(x(0.9), y(0.1)); clicar(x(0.9), y(0.9));
    tecla('Backspace');
    tecla('z', true);
    expect(h.result.current.divisoes).toHaveLength(1);
    expect(h.result.current.motivo).toBe('Feche o piquete no 1º ponto (ou Esc para desistir dele).');
    tecla('Escape');
    expect(h.result.current.ferramenta).toBeNull();
    expect(h.result.current.confirmarCancelar).toBe(false);
    expect(h.result.current.divisoes).toHaveLength(1);
  });

  it('fora do desenho, Ctrl+Z tira o último piquete', async () => {
    const h = await abrir();
    desenharDois(h);
    tecla('z', true);
    expect(h.result.current.divisoes).toHaveLength(1);
  });

  it('gravar = a prévia da fn_piquetes_criar de sempre, com os 2 polígonos e os nomes', async () => {
    const h = await abrir();
    desenharDois(h);
    await act(async () => { await h.result.current.prever(); });
    const chamada = estado.rpc.find(r => r.fn === 'fn_piquetes_criar');
    expect(chamada?.a.p_simular).toBe(true);
    const piq = (chamada?.a.p_piquetes ?? []) as { nome: string; geojson: GeoJSON.Geometry | null }[];
    expect(piq.map(p => p.nome).sort()).toEqual(['P6-A', 'P6-B']);
    expect(piq.every(p => p.geojson?.type === 'Polygon')).toBe(true);
    expect(h.result.current.previa?.fraseLocal ?? '').toMatch(/^cria 2 pastos novos no cadastro \(P6-A/);
  });

  it('o pasto que já originou um grupo (o P6 de verdade) abre igual: nada troca sozinho para "N iguais"', async () => {
    estado.grupo = { id: 'gx', nome: 'P6' };
    const h = renderHook(() => useCriarPiquetes({ mapa, pastos: [{ id: 'm1', nome: '6A', grupo_id: 'gx' }, { id: 'm2', nome: '6B', grupo_id: 'gx' }],
      geometrias: GEOMETRIAS, clienteId: 'cli', aoGravar: () => {}, enquadrar: () => {} }));
    act(() => h.result.current.abrir(PAI, 'poligonos'));
    await waitFor(() => expect(h.result.current.existente).toBe(true));
    expect(h.result.current.modo).toBe('poligonos');
    expect(h.result.current.divisoes).toHaveLength(0);
  });
});
