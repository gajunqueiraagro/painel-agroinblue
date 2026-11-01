/* MAPA-EDITAR-POLIGONO-08 (Gabriel 01/11 16:00: "o único caminho é Cancelar e perder tudo"): o desenho novo fica guardado no navegador por
   cliente + fazenda; o que volta é conferido (só polígono de verdade), e um cliente/fazenda não vê o rascunho de outro. */
import { describe, it, expect, beforeEach } from 'vitest';
import { guardarRascunho, lerRascunhoGuardado } from './useEdicaoDoPoligono';

/* o ambiente de teste não traz `localStorage`: um armazenamento em memória com a mesma interface */
const memoria = new Map<string, string>();
const armazenamento = {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => { memoria.set(k, String(v)); },
  removeItem: (k: string) => { memoria.delete(k); },
  clear: () => memoria.clear(),
  key: (i: number) => [...memoria.keys()][i] ?? null,
  get length() { return memoria.size; },
};
Object.defineProperty(globalThis, 'localStorage', { value: armazenamento, configurable: true });

const G: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[-48, -15], [-47.99, -15], [-47.99, -15.01], [-48, -15]]] };

beforeEach(() => localStorage.clear());

describe('rascunho guardado no navegador (-08)', () => {
  it('guarda e lê por cliente + fazenda; outro cliente ou fazenda não vê; apagar some', () => {
    guardarRascunho('c1', 'f1', { geojson: G, nome: 'APP rio', em: '16:05' });
    expect(lerRascunhoGuardado('c1', 'f1')).toEqual({ geojson: G, nome: 'APP rio', em: '16:05' });
    expect(lerRascunhoGuardado('c2', 'f1')).toBeNull();
    expect(lerRascunhoGuardado('c1', 'f2')).toBeNull();
    guardarRascunho('c1', 'f1', null);
    expect(lerRascunhoGuardado('c1', 'f1')).toBeNull();
  });
  it('o que volta é conferido: texto quebrado, tipo errado ou anel curto = nada (nunca quebra a tela)', () => {
    localStorage.setItem('mapa-rascunho:c1:f1', '{quebrado');
    expect(lerRascunhoGuardado('c1', 'f1')).toBeNull();
    localStorage.setItem('mapa-rascunho:c1:f1', JSON.stringify({ geojson: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }));
    expect(lerRascunhoGuardado('c1', 'f1')).toBeNull();
    localStorage.setItem('mapa-rascunho:c1:f1', JSON.stringify({ geojson: { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] } }));
    expect(lerRascunhoGuardado('c1', 'f1')).toBeNull();
  });
});
