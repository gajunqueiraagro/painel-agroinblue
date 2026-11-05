/**
 * PIQUETES-PRACA-CONCAVO-01 (Gabriel 03/11 09:41, NJ › Pureza › P19A) — a tela do "Criar piquetes": o aviso dos polígonos soltos dentro do
 * pasto (item 3) e a divisão pequena em âmbar (item 1). A conta (a linha que sai e volta, a praça no furo) está em `src/lib/mapa/pracaConcavo.test.ts`.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ rpc: [] as { fn: string; a: Record<string, unknown> }[] }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, a: Record<string, unknown>) => {
      estado.rpc.push({ fn, a });
      const piq = Array.isArray(a.p_piquetes) ? a.p_piquetes : [];
      return Promise.resolve({ error: null, data: {
        caso: 'novo', contorno: { area_ha: 97.5 }, soma_ha: 97.3, dif_contorno_ha: 0.2, concluir: { frase: 'frase do banco' },
        piquetes: piq.map((x: { nome: string }) => ({ nome: x.nome, area_ha: 24.3, liga: 'novo' })),
      } });
    },
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; },
  },
}));

import { CriarPiquetesNoMapa } from './CriarPiquetes';
import { useCriarPiquetes, type CriarPiquetes } from '@/hooks/useCriarPiquetes';

const R = 6378137;
function retangulo(ha: number): GeoJSON.Polygon {
  const dl = (0.0112 * Math.PI) / 180;
  const latN = (Math.asin(Math.sin((-15.51 * Math.PI) / 180) + (ha * 10000) / (R * R * dl)) * 180) / Math.PI;
  return { type: 'Polygon', coordinates: [[[-47.9, -15.51], [-47.9 + 0.0112, -15.51], [-47.9 + 0.0112, latN], [-47.9, latN], [-47.9, -15.51]]] };
}
const GEO = retangulo(97.5);
const PAI = { geometriaId: 'geo-1', pastoId: 'pasto-1', nome: 'Modulo 03', geojson: GEO };
const PASTOS: { id: string; nome: string }[] = [];
const quadra = (lon: number, lat: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[lon, lat], [lon + 0.001, lat], [lon + 0.001, lat + 0.001], [lon, lat + 0.001], [lon, lat]]] });
/* dois piquetes do KMZ sem classificação DENTRO do pasto, um classificado e um fora */
const GEOMETRIAS = [
  { id: 'geo-1', pasto_id: 'pasto-1', tipo: 'pasto', nome_original: 'Modulo 03', geojson: GEO },
  { id: 's1', pasto_id: null, tipo: 'outra', nome_original: 'M03-A', geojson: quadra(-47.898, -15.509) },
  { id: 's2', pasto_id: null, tipo: 'outra', nome_original: 'M03-B', geojson: quadra(-47.892, -15.509) },
  { id: 'r1', pasto_id: null, tipo: 'reserva', nome_original: 'APP', geojson: quadra(-47.895, -15.505) },
  { id: 'f1', pasto_id: null, tipo: 'outra', nome_original: 'Fora', geojson: quadra(-47.80, -15.509) },
];

let piqAtual: CriarPiquetes;
const usados = vi.hoisted(() => ({ ids: [] as string[][] }));
function Host() {
  const piq = useCriarPiquetes({ mapa: null, pastos: PASTOS, geometrias: GEOMETRIAS, clienteId: 'cli', aoGravar: () => {}, enquadrar: () => {} });
  piqAtual = piq;
  return <CriarPiquetesNoMapa piq={piq} aoUsarPiqueteDe={s => { usados.ids.push(s.map(x => x.id)); }} />;
}
function memoria() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
async function abrir() {
  render(<Host />);
  act(() => piqAtual.abrir(PAI));
  await waitFor(() => expect(piqAtual.grupo.estado).toBe('ok'));
}
beforeEach(() => { estado.rpc = []; usados.ids = []; vi.stubGlobal('localStorage', memoria());
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 2000 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 0 }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth'); Reflect.deleteProperty(HTMLElement.prototype, 'offsetWidth'); });

describe('PIQUETES-PRACA-CONCAVO-01 · a tela', () => {
  it('item 3: ao abrir, avisa os polígonos sem classificação dentro do pasto e oferece "É piquete de" (os 2 de dentro, só eles)', async () => {
    await abrir();
    expect(screen.getByTestId('piquetes-soltos-frase').textContent).toBe('Há 2 polígonos sem classificação dentro deste pasto: usar "É piquete de"?');
    fireEvent.click(screen.getByTestId('piquetes-usar-piquete-de'));
    expect(usados.ids).toEqual([['s1', 's2']]);
  });
  it('item 3: "Desenhar mesmo assim" tira o aviso (e ele volta ao abrir de novo)', async () => {
    await abrir();
    fireEvent.click(screen.getByTestId('piquetes-desenhar-assim'));
    expect(screen.queryByTestId('piquetes-soltos')).toBeNull();
    act(() => piqAtual.abrir(PAI));
    expect(screen.getByTestId('piquetes-soltos')).toBeTruthy();
  });
  it('item 1: divisão abaixo de 1 ha fica âmbar na lista (100 iguais de 0,975 ha); acima de 1 ha, não', async () => {
    await abrir();
    act(() => piqAtual.mudarConfig({ modo: 'iguais', colunas: 100 }));
    const linhas = screen.getAllByTestId('piquetes-linha');
    expect(linhas.length).toBe(100);
    expect(linhas.every(l => l.getAttribute('data-pequena') === '1')).toBe(true);
    act(() => piqAtual.mudarConfig({ colunas: 4 }));
    expect(screen.getAllByTestId('piquetes-linha').some(l => l.getAttribute('data-pequena') === '1')).toBe(false);
  });
});
