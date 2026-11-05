/**
 * PIQUETE-PRO-01 (Gabriel 04/11 10:34) — o "+ Piquete" profissional no hook, com um mapa de verdade (jsdom): o ímã (o ponto a até 7 px da borda do
 * vizinho gruda nela e a divisa fica igual), editar os cantos (arrastar, botão direito, clicar na borda), apagar, o Desfazer de cada gesto (mais de
 * uma vez), a praça que já existe fora sozinha, "Restante vira piquete", a prévia só com SEM PIQUETE = 0 e o "+ Área interna".
 */
import L from 'leaflet';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: () => Promise.resolve({ error: null, data: { ok: true } }),
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; },
  },
}));

import { useCriarPiquetes } from './useCriarPiquetes';
import { areaDoBancoHa } from '@/lib/mapa/criarPiquetes';

const O = -47.9, S = -15.51, LON = 0.0112, LAT = 0.0072; // ~1.200 × 800 m
const GEO: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[O, S], [O + LON, S], [O + LON, S + LAT], [O, S + LAT], [O, S]]] };
const x = (k: number) => O + k * LON, y = (k: number) => S + k * LAT;
const PRACA: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[x(0.8), y(0.8)], [x(0.9), y(0.8)], [x(0.9), y(0.9)], [x(0.8), y(0.9)], [x(0.8), y(0.8)]]] };
const PAI = { geometriaId: 'geo-1', pastoId: 'pasto-1', nome: 'P6', geojson: GEO };
const GEOMETRIAS = [
  { id: 'geo-1', pasto_id: 'pasto-1', tipo: 'pasto', geojson: GEO },
  { id: 'pr', pasto_id: null, tipo: 'praca_alimentacao', nome_original: 'Praça P_06', geojson: PRACA },
];
const TOTAL = areaDoBancoHa(GEO);
const M = 1 / (111320 * Math.cos((15.5 * Math.PI) / 180)); // 1 m de longitude em graus

let mapa: L.Map;
function memoria() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
beforeEach(() => {
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

async function abrir(geometrias = GEOMETRIAS) {
  const h = renderHook(() => useCriarPiquetes({ mapa, pastos: [], geometrias, clienteId: 'cli', aoGravar: () => {}, enquadrar: () => {} }));
  act(() => h.result.current.abrir(PAI, 'poligonos'));
  await waitFor(() => expect(h.result.current.grupo.estado).toBe('ok'));
  return h;
}
type H = Awaited<ReturnType<typeof abrir>>;
const clicar = (lng: number, lat: number) => act(() => { mapa.fire('click', { latlng: L.latLng(lat, lng) }); });
const tecla = (key: string, ctrlKey = false) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey })); });
const piquete = (cantos: [number, number][]) => { cantos.forEach(c => clicar(c[0], c[1])); clicar(cantos[0][0], cantos[0][1]); };
const OESTE: [number, number][] = [[x(-0.1), y(-0.1)], [x(0.5), y(-0.1)], [x(0.5), y(1.1)], [x(-0.1), y(1.1)]];
const area = (h: H, i: number) => h.result.current.divisoes[i]?.areaHa ?? 0;
const alcas = () => { const r: L.Marker[] = []; mapa.eachLayer(l => { if (l instanceof L.Marker && l.options.draggable) r.push(l); }); return r; };
const alcaEm = (lng: number, lat: number) => alcas().find(m => Math.abs(m.getLatLng().lng - lng) < 1e-7 && Math.abs(m.getLatLng().lat - lat) < 1e-7);

describe('PIQUETE-PRO-01 · o "+ Piquete" profissional', () => {
  it('a praça que já existe no pasto fica fora sozinha e entra em "praça/corredores"', async () => {
    const h = await abrir();
    expect(h.result.current.fixasDoPasto.map(f => f.nome)).toEqual(['Praça P_06']);
    piquete([[x(-0.1), y(-0.1)], [x(1.1), y(-0.1)], [x(1.1), y(1.1)], [x(-0.1), y(1.1)]]);
    expect(area(h, 0)).toBeCloseTo(TOTAL - areaDoBancoHa(PRACA), 2);
    expect(h.result.current.conta?.internasHa).toBeCloseTo(areaDoBancoHa(PRACA), 6);
    expect(h.result.current.conta?.semPiqueteHa).toBe(0);
  });

  it('o ímã: o ponto clicado a 10 m da divisa do vizinho gruda nela — a divisa fica igual (sem fresta); com Alt, não gruda', async () => {
    const h = await abrir([GEOMETRIAS[0]]);
    piquete(OESTE);
    act(() => h.result.current.setFerramenta('piquete'));
    /* o B começa a 10 m a leste da divisa do A, nos cantos dela na borda do pasto */
    piquete([[x(0.5) + 10 * M, y(1)], [x(0.5) + 10 * M, y(0)], [x(1.1), y(-0.1)], [x(1.1), y(1.1)]]);
    expect(area(h, 0) + area(h, 1)).toBeCloseTo(TOTAL, 2);
    expect(h.result.current.conta?.semPiqueteHa).toBe(0);
    /* com Alt o ímã solta: a fresta de 10 m fica (e vira SEM PIQUETE) */
    act(() => h.result.current.desfazer());
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true })); });
    act(() => h.result.current.setFerramenta('piquete'));
    piquete([[x(0.5) + 10 * M, y(1)], [x(0.5) + 10 * M, y(0)], [x(1.1), y(-0.1)], [x(1.1), y(1.1)]]);
    expect(h.result.current.conta?.semPiqueteHa).toBeGreaterThan(0.5);
  });

  it('a divisa dobrada do vizinho: o B clicado só nos 2 cantos dela segue a dobra (sem fresta)', async () => {
    const h = await abrir([GEOMETRIAS[0]]);
    /* o A com a divisa dobrada para dentro dele (o canto do meio em 0,45) */
    piquete([[x(-0.1), y(-0.1)], [x(0.5), y(-0.1)], [x(0.45), y(0.5)], [x(0.5), y(1.1)], [x(-0.1), y(1.1)]]);
    act(() => h.result.current.setFerramenta('piquete'));
    const k = 0.5 - 0.05 / 6; // onde a divisa do A encontra a borda do pasto
    piquete([[x(k), y(1)], [x(k), y(0)], [x(1.1), y(-0.1)], [x(1.1), y(1.1)]]);
    expect(h.result.current.conta?.semPiqueteHa).toBeLessThan(0.01);
    expect(area(h, 0) + area(h, 1)).toBeCloseTo(TOTAL, 2);
  });

  it('o ímã também no clique solto: a 10 m da borda do pasto, o canto vai para a borda', async () => {
    const h = await abrir([GEOMETRIAS[0]]);
    piquete([[x(0), y(0) + 10 * M], [x(0.5), y(0) + 10 * M], [x(0.5), y(1)], [x(0), y(1)]]);
    expect(area(h, 0)).toBeCloseTo(TOTAL / 2, 2);
  });

  it('SEM PIQUETE > 0,01 ha trava a prévia; "Restante vira piquete" fecha os 100%', async () => {
    const h = await abrir();
    piquete(OESTE);
    act(() => h.result.current.setFerramenta('piquete'));
    piquete([[x(0.5), y(-0.1)], [x(0.8), y(-0.1)], [x(0.8), y(1.1)], [x(0.5), y(1.1)]]);
    expect(h.result.current.motivo).toMatch(/^Faltam [\d,]+ ha sem piquete: desenhe ou use "Restante vira piquete"\.$/);
    act(() => h.result.current.restanteViraPiquete());
    expect(h.result.current.divisoes).toHaveLength(3);
    expect(h.result.current.conta?.semPiqueteHa).toBe(0);
    expect(h.result.current.motivo).toBeNull();
    expect([...h.result.current.nomes].sort()).toEqual(['P6-A', 'P6-B', 'P6-C']);
  });

  it('editar pontos: arrastar o canto (recorta pelo vizinho ao soltar), botão direito tira, clique na borda cria; cada gesto se desfaz, um a um', async () => {
    const h = await abrir([GEOMETRIAS[0]]);
    piquete(OESTE);
    act(() => h.result.current.setFerramenta('piquete'));
    piquete([[x(0.5), y(-0.1)], [x(1.1), y(-0.1)], [x(1.1), y(1.1)], [x(0.5), y(1.1)]]);
    const b0 = area(h, 1);
    act(() => h.result.current.editarPiquete(1));
    expect(h.result.current.editando).toBe(1);
    /* o canto de baixo à direita (1, 0) vai para (0.75, 0): o B perde um triângulo, que vira SEM PIQUETE */
    const canto = alcaEm(x(1), y(0));
    if (!canto) throw new Error('sem a alça do canto');
    act(() => { canto.fire('dragstart'); canto.setLatLng(L.latLng(y(0), x(0.75))); canto.fire('drag'); canto.fire('dragend'); });
    expect(area(h, 1)).toBeCloseTo(b0 - TOTAL * 0.25 * 0.5, 1);
    /* o canto de cima à esquerda vai para dentro do A: ao soltar, a sobreposição sai sozinha */
    const outro = alcaEm(x(0.5), y(1));
    if (!outro) throw new Error('sem a alça do outro canto');
    const antesDoA = area(h, 0);
    act(() => { outro.fire('dragstart'); outro.setLatLng(L.latLng(y(1), x(0.2))); outro.fire('drag'); outro.fire('dragend'); });
    expect(area(h, 0)).toBeCloseTo(antesDoA, 6);
    expect(area(h, 0) + area(h, 1) + (h.result.current.conta?.semPiqueteHa ?? 0)).toBeCloseTo(TOTAL, 2);
    /* botão direito no canto (0.75, 0) tira o canto */
    const n0 = alcas().length;
    const c2 = alcaEm(x(0.75), y(0));
    if (!c2) throw new Error('sem a alça movida');
    act(() => { c2.fire('contextmenu', { originalEvent: new MouseEvent('contextmenu') }); });
    expect(alcas().length).toBe(n0 - 1);
    /* desfaz os 3 gestos, um a um: volta ao B de antes */
    tecla('z', true); tecla('z', true);
    expect(area(h, 1)).toBeCloseTo(b0 - TOTAL * 0.25 * 0.5, 1);
    tecla('z', true);
    expect(area(h, 1)).toBeCloseTo(b0, 6);
    /* Esc termina a edição (não pergunta para cancelar tudo) */
    tecla('Escape');
    expect(h.result.current.editando).toBeNull();
    expect(h.result.current.confirmarCancelar).toBe(false);
  });

  it('apagar o piquete: a área dele volta a ser SEM PIQUETE; Ctrl+Z traz de volta', async () => {
    const h = await abrir([GEOMETRIAS[0]]);
    piquete(OESTE);
    act(() => h.result.current.restanteViraPiquete());
    act(() => h.result.current.apagarPiquete(0));
    expect(h.result.current.divisoes).toHaveLength(1);
    expect(h.result.current.conta?.semPiqueteHa).toBeCloseTo(TOTAL / 2, 2);
    tecla('z', true);
    expect(h.result.current.divisoes).toHaveLength(2);
    expect(h.result.current.conta?.semPiqueteHa).toBe(0);
  });

  it('"+ Área interna": desenhada ponto a ponto, recorta os piquetes e entra em "praça/corredores"; vai na gravação', async () => {
    const h = await abrir([GEOMETRIAS[0]]);
    piquete(OESTE);
    act(() => h.result.current.restanteViraPiquete());
    act(() => h.result.current.desenharAreaInterna('corredor'));
    expect(h.result.current.ferramenta).toBe('areaInterna');
    piquete([[x(0.45), y(-0.1)], [x(0.55), y(-0.1)], [x(0.55), y(1.1)], [x(0.45), y(1.1)]]);
    expect(h.result.current.desenho.internas?.map(a => a.tipo)).toEqual(['corredor']);
    expect(area(h, 0) + area(h, 1)).toBeCloseTo(TOTAL * 0.9, 2);
    expect(h.result.current.conta?.internasHa).toBeCloseTo(TOTAL * 0.1, 2);
    expect(h.result.current.conta?.semPiqueteHa).toBe(0);
    expect(h.result.current.motivo).toBeNull();
  });
});
