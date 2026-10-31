/**
 * MAPA-02b — o hook dos mapas da casa com o Leaflet DE VERDADE (jsdom, caixa de 800×600 de mentira):
 *  - o zoom menos agressivo (adendo do Gabriel, 31/10): `zoomSnap` 0,25, `zoomDelta` 0,5, 120 px de roda por nível;
 *  - o zoom fracionado NÃO multiplica tiles: o Leaflet pede só níveis inteiros (`Math.round(zoom)`);
 *  - com chave: UMA sessão para dois mapas e uma troca de fundo; tiles na 2dtiles; os créditos com o logo e o copyright do viewport;
 *  - sem chave ou com a sessão recusada: OpenStreetMap + "satélite indisponível · usando mapa" (D4), a tela não quebra;
 *  - a troca de fundo (D5) fica salva e não recria o mapa.
 * Nenhuma chamada de rede: o `fetch` é falso, a chave é de mentira.
 */
import { act, render } from '@testing-library/react';
import L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RODA_PX_POR_NIVEL, ZOOM_DELTA, ZOOM_SNAP, useStableLeafletMap } from './useStableLeafletMap';
import { FRASE_SEM_SATELITE, esquecerSessaoParaTeste, lerFundoSalvo, type FundoDoMapa } from '@/lib/mapa/fundoDoMapa';
import { ESPERA_DA_VISTA_MS } from '@/lib/mapa/camadaDoFundo';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-teste' } }) }));

const CHAVE = 'AIza-de-mentira-para-teste';

const memoria = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
};

type Hook = ReturnType<typeof useStableLeafletMap>;
const montados: Hook[] = [];
function Mapa({ indice, fundo }: { indice: number; fundo?: FundoDoMapa }) {
  const h = useStableLeafletMap({ debugName: `teste-${indice}`, fundo });
  montados[indice] = h;
  return <div ref={h.mapContainerRef} />;
}

let buscar: ReturnType<typeof vi.fn>;
const pedidos = (trecho: string) => buscar.mock.calls.filter(([u]) => String(u).includes(trecho));
const responder = (url: string): Response => {
  if (url.includes('/createSession')) {
    return new Response(JSON.stringify({ session: 'sessao-1', expiry: String(Math.floor(Date.now() / 1000) + 14 * 86400), tileWidth: 256 }));
  }
  if (url.includes('/viewport')) {
    return new Response(JSON.stringify({ copyright: 'Imagens ©2026 Airbus', maxZoomRects: [{ maxZoom: 20, north: 90, south: -90, east: 180, west: -180 }] }));
  }
  return new Response('', { status: 404 });
};
const camadasDeTile = (map: L.Map) => {
  const urls: string[] = [];
  map.eachLayer((l) => { if (l instanceof L.TileLayer) urls.push(String(Reflect.get(l, '_url'))); });
  return urls;
};
const creditos = (i = 0) => montados[i].mapContainerRef.current?.querySelector('[data-testid="mapa-creditos"]');
const esperar = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

/* o jsdom não tem 3D: sem isto o Leaflet ignora o `zoomSnap` (arredonda para inteiro) e o `zoomDelta` — todo navegador real tem */
const any3dDeVerdade = L.Browser.any3d;
beforeEach(() => {
  Reflect.set(L.Browser, 'any3d', true);
  vi.useFakeTimers();
  montados.length = 0;
  esquecerSessaoParaTeste();
  const l = memoria(); const s = memoria();
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => l });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => s });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}),
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  /* como o `fetch` do navegador: chamado como MÉTODO de outro objeto (`deps.buscar(url)`) ele recusa com "Illegal invocation" —
     foi assim que o viewport falhava calado no navegador real (31/10 12:30) e o crédito ficava sempre o de reserva */
  buscar = vi.fn(async function (this: unknown, u: unknown) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    return responder(String(u));
  });
  vi.stubGlobal('fetch', buscar);
});
afterEach(() => {
  Reflect.set(L.Browser, 'any3d', any3dDeVerdade);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('zoom menos agressivo (adendo 31/10)', () => {
  it('o mapa nasce com zoomSnap 0,25, zoomDelta 0,5 e 120 px de roda por nível; o +/− anda meio nível', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    render(<Mapa indice={0} />);
    await esperar();
    const map = montados[0].mapInstanceRef.current;
    if (!map) throw new Error('o mapa não nasceu');
    expect([ZOOM_SNAP, ZOOM_DELTA, RODA_PX_POR_NIVEL]).toEqual([0.25, 0.5, 120]);
    expect([map.options.zoomSnap, map.options.zoomDelta, map.options.wheelPxPerZoomLevel]).toEqual([0.25, 0.5, 120]);
    map.setView([-15.5, -47.5], 15, { animate: false });
    const mais = montados[0].mapContainerRef.current?.querySelector('.leaflet-control-zoom-in');
    if (!(mais instanceof HTMLElement)) throw new Error('sem o botão +');
    mais.click();
    await esperar(300);
    expect(map.getZoom()).toBe(15.5);
    const menos = montados[0].mapContainerRef.current?.querySelector('.leaflet-control-zoom-out');
    if (!(menos instanceof HTMLElement)) throw new Error('sem o botão −');
    menos.click();
    await esperar(300);
    menos.click();
    await esperar(300);
    expect(map.getZoom()).toBe(14.5);
  });

  it('o zoom fracionado NÃO multiplica tiles: 15 → 15,25 → 15,5 → 15,75 → 16 pede só os níveis 15 e 16, cada tile uma vez', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    render(<Mapa indice={0} />);
    await esperar();
    const map = montados[0].mapInstanceRef.current;
    if (!map) throw new Error('o mapa não nasceu');
    const tiles: string[] = [];
    const Contadora = L.GridLayer.extend({
      createTile(c: L.Coords) { tiles.push(`${c.z}/${c.x}/${c.y}`); return document.createElement('div'); },
    });
    map.setView([-15.5, -47.5], 15, { animate: false });
    new Contadora().addTo(map);
    const doNivel15 = tiles.length;
    /* o gesto do usuário (roda, trackpad, +/−) é ANIMADO; o zoom sem animação (`animate: false`) descarta e repede os tiles em
       QUALQUER nível, inteiro ou não — é do Leaflet, não do zoom fracionado (o cache do navegador atende) */
    const porPasso: number[] = [];
    for (const z of [15.25, 15.5, 15.75, 16]) {
      map.setZoom(z);
      await esperar(300);
      expect(map.getZoom()).toBe(z);
      porPasso.push(tiles.length);
    }
    // 15,25: nada novo (os do 15 ampliados) · 15,5: nascem os do 16 · 15,75 e 16: nada novo
    expect(porPasso[0]).toBe(doNivel15);
    expect(porPasso[1]).toBeGreaterThan(doNivel15);
    expect(porPasso[3]).toBe(porPasso[1]);
    expect(map.getZoom()).toBe(16);
    expect(new Set(tiles.map((t) => t.split('/')[0]))).toEqual(new Set(['15', '16']));
    expect(new Set(tiles).size).toBe(tiles.length);
    expect(doNivel15).toBeGreaterThan(0);
    // os tiles do 16 só nasceram ao cruzar o ",5"
    expect(tiles.filter((t) => t.startsWith('16/')).length).toBe(tiles.length - doNivel15);
  });
});

describe('o fundo (MAPA-02b)', () => {
  it('com chave: UMA sessão para dois mapas e uma troca de fundo; tiles na 2dtiles; créditos com o logo e o copyright do viewport', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', CHAVE);
    render(<><Mapa indice={0} /><Mapa indice={1} /></>);
    await esperar(ESPERA_DA_VISTA_MS + 10);
    expect(pedidos('/createSession')).toHaveLength(1);
    const map = montados[0].mapInstanceRef.current;
    if (!map) throw new Error('o mapa não nasceu');
    expect(camadasDeTile(map)).toEqual([`https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=sessao-1&key=${CHAVE}`]);
    expect(montados[0].fundoAtivo).toBe('satelite');
    expect(creditos()?.querySelector('img')?.getAttribute('alt')).toBe('Google Maps');
    expect(creditos()?.textContent).toContain('Imagens ©2026 Airbus');
    expect(map.getMaxZoom()).toBe(20); // o zoom máximo da região (viewport)

    await act(async () => { montados[0].trocarFundo('mapa'); });
    await act(async () => { montados[0].trocarFundo('satelite'); });
    await esperar(ESPERA_DA_VISTA_MS + 10);
    expect(pedidos('/createSession')).toHaveLength(1);
    expect(montados[0].mapInstanceRef.current).toBe(map); // o mesmo mapa: trocar o fundo não recria
  });

  it('o mapa parado não pede o viewport de novo; mexer pede UM depois da espera', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', CHAVE);
    render(<Mapa indice={0} />);
    await esperar(ESPERA_DA_VISTA_MS + 10);
    const antes = pedidos('/viewport').length;
    const map = montados[0].mapInstanceRef.current;
    if (!map) throw new Error('o mapa não nasceu');
    map.fire('moveend');
    await esperar(ESPERA_DA_VISTA_MS + 10);
    expect(pedidos('/viewport').length).toBe(antes);
    for (const z of [8, 8.25, 8.5]) map.setView([-15.5, -47.5], z, { animate: false });
    await esperar(ESPERA_DA_VISTA_MS + 10);
    expect(pedidos('/viewport').length).toBe(antes + 1);
  });

  it('sem chave: OpenStreetMap + o aviso, nenhum pedido ao Google', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    render(<Mapa indice={0} />);
    await esperar(ESPERA_DA_VISTA_MS + 10);
    const map = montados[0].mapInstanceRef.current;
    if (!map) throw new Error('o mapa não nasceu');
    expect(buscar).not.toHaveBeenCalled();
    expect(camadasDeTile(map)).toEqual(['https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png']);
    expect(montados[0].fundoAtivo).toBe('mapa');
    expect(creditos()?.textContent).toContain('© OpenStreetMap');
    expect(creditos()?.textContent).toContain(FRASE_SEM_SATELITE);
  });

  it('a sessão recusada (chave fora da trava): OpenStreetMap + o aviso, a tela não quebra', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', CHAVE);
    buscar.mockImplementation(async () => new Response('{}', { status: 403 }));
    render(<Mapa indice={0} />);
    await esperar(ESPERA_DA_VISTA_MS + 10);
    const map = montados[0].mapInstanceRef.current;
    if (!map) throw new Error('o mapa não nasceu');
    expect(camadasDeTile(map)).toEqual(['https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png']);
    expect(creditos()?.textContent).toContain(FRASE_SEM_SATELITE);
  });

  it('3 tiles do satélite falhando antes do primeiro carregar: cai no OpenStreetMap com o aviso', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', CHAVE);
    render(<Mapa indice={0} />);
    await esperar(ESPERA_DA_VISTA_MS + 10);
    const map = montados[0].mapInstanceRef.current;
    if (!map) throw new Error('o mapa não nasceu');
    const google: L.TileLayer[] = [];
    map.eachLayer((l) => { if (l instanceof L.TileLayer) google.push(l); });
    await act(async () => { for (let i = 0; i < 3; i += 1) google[0].fire('tileerror'); });
    expect(camadasDeTile(map)).toEqual(['https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png']);
    expect(montados[0].fundoAtivo).toBe('mapa');
    expect(creditos()?.textContent).toContain(FRASE_SEM_SATELITE);
  });

  it('a troca para Mapa fica salva por usuário e o próximo mapa já abre nela', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', CHAVE);
    const r = render(<Mapa indice={0} />);
    await esperar(ESPERA_DA_VISTA_MS + 10);
    await act(async () => { montados[0].trocarFundo('mapa'); });
    expect(lerFundoSalvo('u-teste')).toBe('mapa');
    expect(creditos()?.textContent).toBe('© OpenStreetMap');
    r.unmount();
    render(<Mapa indice={1} />);
    await esperar();
    expect(montados[1].fundo).toBe('mapa');
  });
});
