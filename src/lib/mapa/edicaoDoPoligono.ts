/**
 * MAPA-EDITAR-POLIGONO-01 — a geometria da edição de polígono, numa lib só e pura (Gabriel 01/11/2026).
 * - Medidas ao vivo: a área é a MESMA conta do mapa (`areaEmHectares`, esfera de raio 6.371.008,8 m); perímetro e lados pela distância na
 *   esfera de mesmo raio (haversine). Nenhuma segunda conta de área.
 * - Unir e sobreposição pela `polyclip-ts` (MIT, dependência direta fixa; decisão do Gabriel 01/11).
 * - Dividir: a linha riscada, prolongada até uma caixa bem maior que o polígono, fecha um "lado"; metade A = polígono ∩ lado, metade B =
 *   polígono − lado (as duas pela polyclip). Assim as duas metades têm EXATAMENTE a mesma divisa (sem fresta nem sobreposição). Sobrou
 *   mais de 2 pedaços (a linha entra e sai várias vezes) = recusa com frase.
 * O banco (`fn_geometria_gravar`) guarda e confere; a conta é toda daqui.
 */
import { difference, intersection, union } from 'polyclip-ts';
import { areaEmHectares } from '@/lib/mapa/areaDoPoligono';

const RAIO_DA_TERRA_M = 6371008.8;

export type Ponto = [number, number]; // [lng, lat]
type Anel = Ponto[];
type Poli = Anel[];

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string };

const rad = (g: number) => (g * Math.PI) / 180;
const pt = (p: readonly number[]): Ponto => [p[0], p[1]];

/** Distância em metros entre dois pontos [lng, lat], na esfera do mapa. */
export function distanciaM(a: readonly number[], b: readonly number[]): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_DA_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function aneisExternos(g: GeoJSON.Geometry): Anel[] {
  if (g.type === 'Polygon') return g.coordinates.length ? [g.coordinates[0].map(pt)] : [];
  if (g.type === 'MultiPolygon') return g.coordinates.filter(p => p.length).map(p => p[0].map(pt));
  return [];
}

/** Os lados do anel externo, em metros (o anel fechado não repete o último lado). */
export function ladosM(anel: readonly (readonly number[])[]): number[] {
  const n = anel.length;
  if (n < 2) return [];
  const fechado = anel[0][0] === anel[n - 1][0] && anel[0][1] === anel[n - 1][1];
  const pontos = fechado ? anel.slice(0, -1) : anel;
  return pontos.map((p, i) => distanciaM(p, pontos[(i + 1) % pontos.length]));
}

export interface Medidas { areaHa: number; perimetroM: number; ladosM: number[] }

export function medidasDe(g: GeoJSON.Geometry): Medidas {
  const aneis = aneisExternos(g);
  const lados = aneis.flatMap(a => ladosM(a));
  return { areaHa: areaEmHectares(g), perimetroM: lados.reduce((s, l) => s + l, 0), ladosM: aneis.length === 1 ? ladosM(aneis[0]) : lados };
}

/** "12,4 ha" · "1.530 m" — pt-BR. */
export const textoHa = (ha: number) => `${ha.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ha`;
export const textoM = (m: number) => `${Math.round(m).toLocaleString('pt-BR')} m`;

/** "área do mapa X ha · cadastro Y ha" (a área oficial é a do cadastro; sem cadastro: "—"). */
export function fraseDasAreas(areaDoMapaHa: number, areaCadastroHa: number | null | undefined): string {
  return `área do mapa ${textoHa(areaDoMapaHa)} · cadastro ${areaCadastroHa != null && areaCadastroHa > 0 ? textoHa(areaCadastroHa) : '—'}`;
}

// ---------------------------------------------------------------------------------------------------------------------------
function paraPoli(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): Poli | Poli[] {
  if (g.type === 'Polygon') return g.coordinates.map(a => a.map(pt));
  return g.coordinates.map(pp => pp.map(a => a.map(pt)));
}

function deMultiPoli(m: Poli[]): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const partes = m.filter(p => p.length && p[0].length >= 4);
  if (partes.length === 0) return null;
  if (partes.length === 1) return { type: 'Polygon', coordinates: partes[0] };
  return { type: 'MultiPolygon', coordinates: partes };
}

const ehPoligono = (g: GeoJSON.Geometry): g is GeoJSON.Polygon | GeoJSON.MultiPolygon => g.type === 'Polygon' || g.type === 'MultiPolygon';

/** Une dois polígonos que se tocam (o encaixe garante o lado comum). Não se tocam = recusa. */
export function unirVizinhos(a: GeoJSON.Geometry, b: GeoJSON.Geometry): Resultado<GeoJSON.Polygon> {
  if (!ehPoligono(a) || !ehPoligono(b)) return { ok: false, motivo: 'Só se unem polígonos.' };
  const u = deMultiPoli(union(paraPoli(a), paraPoli(b)));
  if (!u) return { ok: false, motivo: 'A união ficou vazia.' };
  if (u.type !== 'Polygon') return { ok: false, motivo: 'Os dois polígonos não se tocam: aproxime as divisas (encaixe nos vértices) e tente de novo.' };
  return { ok: true, valor: u };
}

export interface Sobreposicao { id: string; nome: string; areaHa: number }

/** Polígonos vizinhos que o editado invade, com a área invadida (aviso; abaixo de 10 m² é encaixe, não conta). */
export function sobreposicoes(g: GeoJSON.Geometry, vizinhos: readonly { id: string; nome: string; geojson: GeoJSON.Geometry }[],
  minimoHa = 0.001): Sobreposicao[] {
  if (!ehPoligono(g)) return [];
  const eu = paraPoli(g);
  const achadas: Sobreposicao[] = [];
  for (const v of vizinhos) {
    if (!ehPoligono(v.geojson)) continue;
    const i = deMultiPoli(intersection(eu, paraPoli(v.geojson)));
    const ha = i ? areaEmHectares(i) : 0;
    if (ha >= minimoHa) achadas.push({ id: v.id, nome: v.nome, areaHa: ha });
  }
  return achadas.sort((x, y) => y.areaHa - x.areaHa);
}

// --- dividir ----------------------------------------------------------------------------------------------------------------
type Caixa = { oeste: number; sul: number; leste: number; norte: number };

function caixaGrande(g: GeoJSON.Polygon, linha: readonly Ponto[]): Caixa {
  const xs = [...g.coordinates[0].map(p => p[0]), ...linha.map(p => p[0])];
  const ys = [...g.coordinates[0].map(p => p[1]), ...linha.map(p => p[1])];
  const w = Math.max(...xs) - Math.min(...xs) || 1e-3;
  const h = Math.max(...ys) - Math.min(...ys) || 1e-3;
  const folga = Math.max(w, h) * 10;
  return { oeste: Math.min(...xs) - folga, sul: Math.min(...ys) - folga, leste: Math.max(...xs) + folga, norte: Math.max(...ys) + folga };
}

/** Onde o raio que sai de `de` na direção `para` (além de `para`) encontra a borda da caixa. */
function naBorda(de: Ponto, para: Ponto, c: Caixa): Ponto {
  const dx = para[0] - de[0];
  const dy = para[1] - de[1];
  const ts: number[] = [];
  if (dx > 0) ts.push((c.leste - de[0]) / dx);
  if (dx < 0) ts.push((c.oeste - de[0]) / dx);
  if (dy > 0) ts.push((c.norte - de[1]) / dy);
  if (dy < 0) ts.push((c.sul - de[1]) / dy);
  const t = Math.min(...ts.filter(v => v > 0));
  return [de[0] + dx * t, de[1] + dy * t];
}

/** Posição na volta da borda da caixa, no sentido horário a partir do canto noroeste (0..4). */
function voltaNaBorda(p: Ponto, c: Caixa): number {
  const w = c.leste - c.oeste;
  const h = c.norte - c.sul;
  const eps = 1e-12 * Math.max(w, h);
  if (Math.abs(p[1] - c.norte) <= eps) return (p[0] - c.oeste) / w;          // topo: 0..1
  if (Math.abs(p[0] - c.leste) <= eps) return 1 + (c.norte - p[1]) / h;      // direita: 1..2
  if (Math.abs(p[1] - c.sul) <= eps) return 2 + (c.leste - p[0]) / w;        // base: 2..3
  return 3 + (p[1] - c.sul) / h;                                             // esquerda: 3..4
}

const CANTOS = (c: Caixa): [number, Ponto][] => [[1, [c.leste, c.norte]], [2, [c.leste, c.sul]], [3, [c.oeste, c.sul]], [4, [c.oeste, c.norte]]];

/** O "lado" que a linha fecha: a linha prolongada até a borda + a volta da borda (sentido horário) do fim até o começo. */
function ladoDaLinha(linha: readonly Ponto[], c: Caixa): Poli {
  const n = linha.length;
  const ini = naBorda(linha[1], linha[0], c);
  const fim = naBorda(linha[n - 2], linha[n - 1], c);
  const anel: Ponto[] = [ini, ...linha.map(pt), fim];
  const tIni = voltaNaBorda(ini, c);
  const t = voltaNaBorda(fim, c);
  const alvo = tIni <= t ? tIni + 4 : tIni;
  for (const volta of [0, 4]) {
    for (const [k, canto] of CANTOS(c)) {
      const tc = k + volta;
      if (tc > t && tc < alvo) anel.push(canto);
    }
  }
  anel.push(ini);
  return [anel];
}

export interface Divisao { a: GeoJSON.Polygon; b: GeoJSON.Polygon }

/** Divide um polígono por uma linha riscada (2+ pontos). Precisa dar exatamente 2 pedaços. */
export function dividirPorLinha(g: GeoJSON.Geometry, linha: readonly Ponto[]): Resultado<Divisao> {
  if (g.type !== 'Polygon') return { ok: false, motivo: 'Só se divide um polígono simples (sem partes separadas).' };
  if (g.coordinates.length > 1) return { ok: false, motivo: 'Este polígono tem furo: redesenhe-o antes de dividir.' };
  if (linha.length < 2) return { ok: false, motivo: 'Risque a linha de divisão com pelo menos 2 pontos.' };
  const c = caixaGrande(g, linha);
  const lado = ladoDaLinha(linha, c);
  const poli = paraPoli(g);
  const a = deMultiPoli(intersection(poli, lado));
  const b = deMultiPoli(difference(poli, lado));
  if (!a || !b) return { ok: false, motivo: 'A linha não atravessa o polígono: risque de um lado ao outro.' };
  if (a.type !== 'Polygon' || b.type !== 'Polygon') {
    return { ok: false, motivo: 'A linha corta o polígono em mais de 2 partes: risque uma linha que entre e saia uma vez só.' };
  }
  return { ok: true, valor: { a, b } };
}
