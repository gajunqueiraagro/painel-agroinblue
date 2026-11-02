/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a — o rascunho do "Criar piquetes" no NAVEGADOR (`localStorage`, `piquetes-rascunho:<clienteId>:<geometriaId>`),
 * como o do desenho de polígono: guardado a cada passo, "Continuar o rascunho de HH:MM?" ao abrir, apagado ao gravar ou descartar. Tudo em
 * try/catch (sem armazenamento, o rascunho vale só nesta tela) e lido com guarda de forma: dado estragado vira "sem rascunho", nunca erro.
 */
import type { ConfigDosPiquetes, Desenho } from '@/lib/mapa/desenhoDosPiquetes';
import type { Ponto } from '@/lib/mapa/edicaoDoPoligono';
import type { NomePreso } from '@/lib/mapa/nomesDosPiquetes';
import type { AreaInterna, LinhaDeCorte } from '@/lib/mapa/linhasDosPiquetes';
import type { Cerca, PracaCentral } from '@/lib/mapa/pracaCentral';

export interface EstadoDosPiquetes { desenho: Desenho; presos: NomePreso[]; config: ConfigDosPiquetes }
export interface RascunhoDosPiquetes { em: string; estado: EstadoDosPiquetes }

export const chaveDoRascunhoDosPiquetes = (cliente: string | null | undefined, geometria: string | null | undefined) =>
  `piquetes-rascunho:${cliente ?? '-'}:${geometria ?? '-'}`;

export const horaDoRascunho = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const ehNumero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const ehPonto = (x: unknown): x is Ponto => Array.isArray(x) && x.length >= 2 && ehNumero(x[0]) && ehNumero(x[1]);
const ehPontos = (x: unknown): x is Ponto[] => Array.isArray(x) && x.every(ehPonto);
const ehObjeto = (x: unknown): x is object => !!x && typeof x === 'object';
const campo = (o: object, k: string): unknown => Reflect.get(o, k);

function ehLinha(x: unknown): x is LinhaDeCorte {
  if (!ehObjeto(x)) return false;
  const pts = campo(x, 'pontos');
  return typeof campo(x, 'id') === 'string' && ehPontos(pts) && pts.length >= 2;
}
function ehCerca(x: unknown): x is Cerca {
  return ehLinha(x) && typeof campo(x, 'fixa') === 'boolean' && ehNumero(campo(x, 'vertice'));
}
function ehPraca(x: unknown): x is PracaCentral {
  if (!ehObjeto(x)) return false;
  const f = campo(x, 'formato'), v = campo(x, 'vertices'), c = campo(x, 'cercas');
  return (f === 'regular' || f === 'circulo' || f === 'livre') && ehPonto(campo(x, 'centro')) && ehPontos(v) && v.length >= 3
    && Array.isArray(c) && c.every(k => ehCerca(k) && k.vertice >= 0 && k.vertice < v.length);
}
const ehGeo = (x: unknown): x is GeoJSON.Polygon | GeoJSON.MultiPolygon =>
  ehObjeto(x) && (campo(x, 'type') === 'Polygon' || campo(x, 'type') === 'MultiPolygon') && Array.isArray(campo(x, 'coordinates'));
function ehArea(x: unknown): x is AreaInterna {
  if (!ehObjeto(x)) return false;
  const t = campo(x, 'tipo');
  return (t === 'praca' || t === 'corredor') && typeof campo(x, 'id') === 'string' && typeof campo(x, 'nome') === 'string' && ehGeo(campo(x, 'geojson'))
    && (campo(x, 'eixo') === undefined || ehPontos(campo(x, 'eixo'))) && (campo(x, 'larguraM') === undefined || ehNumero(campo(x, 'larguraM')));
}
function ehPreso(x: unknown): x is NomePreso {
  return ehObjeto(x) && ehPonto(campo(x, 'ponto')) && typeof campo(x, 'nome') === 'string' && (campo(x, 'liga') === null || typeof campo(x, 'liga') === 'string');
}
function ehConfig(x: unknown): x is ConfigDosPiquetes {
  if (!ehObjeto(x)) return false;
  const m = campo(x, 'medida'), modo = campo(x, 'modo'), formato = campo(x, 'formato');
  return (modo === 'praca' || modo === 'linhas' || modo === 'grade' || modo === 'iguais') && (formato === 'regular' || formato === 'circulo' || formato === 'livre')
    && ehObjeto(m) && ehNumero(campo(m, 'metros')) && ['diagonal', 'lado', 'raio'].includes(String(campo(m, 'tipo')))
    && ['n', 'refLado', 'linhasGrade', 'colunas', 'larguraCorredor'].every(k => ehNumero(campo(x, k)))
    && typeof campo(x, 'cocho') === 'boolean' && typeof campo(x, 'girado') === 'boolean' && typeof campo(x, 'prefixo') === 'string';
}
function ehDesenho(x: unknown): x is Desenho {
  if (!ehObjeto(x)) return false;
  const praca = campo(x, 'praca'), linhas = campo(x, 'linhas'), corredor = campo(x, 'corredor');
  return (praca === null || ehPraca(praca)) && Array.isArray(linhas) && linhas.every(ehLinha) && (corredor === null || ehArea(corredor));
}
export function ehEstadoDosPiquetes(x: unknown): x is EstadoDosPiquetes {
  if (!ehObjeto(x)) return false;
  const presos = campo(x, 'presos');
  return ehDesenho(campo(x, 'desenho')) && Array.isArray(presos) && presos.every(ehPreso) && ehConfig(campo(x, 'config'));
}

export function lerRascunhoDosPiquetes(cliente: string | null | undefined, geometria: string | null | undefined): RascunhoDosPiquetes | null {
  try {
    const txt = localStorage.getItem(chaveDoRascunhoDosPiquetes(cliente, geometria));
    if (!txt) return null;
    const v: unknown = JSON.parse(txt);
    if (!ehObjeto(v)) return null;
    const em = campo(v, 'em'), estado = campo(v, 'estado');
    return ehEstadoDosPiquetes(estado) ? { em: typeof em === 'string' ? em : '', estado } : null;
  } catch { return null; }
}

export function guardarRascunhoDosPiquetes(cliente: string | null | undefined, geometria: string | null | undefined, r: RascunhoDosPiquetes | null) {
  try {
    if (r) localStorage.setItem(chaveDoRascunhoDosPiquetes(cliente, geometria), JSON.stringify(r));
    else localStorage.removeItem(chaveDoRascunhoDosPiquetes(cliente, geometria));
  } catch { /* sem armazenamento: o rascunho vale só nesta tela */ }
}
