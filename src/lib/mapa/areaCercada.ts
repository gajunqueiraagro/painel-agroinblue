/**
 * MAPA-PAINEL-CERCADA-01 (FILA 6c) — a ÁREA CERCADA do pasto no painel do Gestor: "útil Y + áreas internas Z" (só leitura). Puro.
 * - útil = a área MEDIDA do polígono do pasto (a fórmula única `areaEmHectares`; a oficial continua sendo a do cadastro);
 * - áreas internas = os polígonos de ÁREA classificados (reserva, APP, curral, sede…; não "sem classificação", não "área total", não outro
 *   pasto) cujo ponto mais interno cai dentro do CONTORNO EXTERNO do pasto — a área interna costuma ser um buraco no polígono do pasto,
 *   então os buracos não contam para "estar dentro";
 * - cercada = útil + internas.
 */
import { areaEmHectares } from '@/lib/mapa/areaDoPoligono';
import { pontoMaisInterno, type Aneis } from '@/lib/mapa/rotulosDoMapa';

export interface AreaCercada {
  utilHa: number;
  internasHa: number;
  cercadaHa: number;
  /** os polígonos internos (nome e área), para o title */
  internas: { nome: string; ha: number }[];
}

/** os tipos que contam como "área interna" (os de área classificados) */
const NAO_CONTAM = new Set(['pasto', 'outra', 'area_total']);

function contornosExternos(g: GeoJSON.Geometry): number[][][] {
  if (g.type === 'Polygon') return g.coordinates.length ? [g.coordinates[0]] : [];
  if (g.type === 'MultiPolygon') return g.coordinates.filter(p => p.length).map(p => p[0]);
  return [];
}

function noAnel(x: number, y: number, anel: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i]; const [xj, yj] = anel[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** o ponto mais interno do polígono (lon, lat), na mesma escala das coordenadas */
function pontoInterno(g: GeoJSON.Geometry): [number, number] | null {
  const poli = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates[0] : null;
  if (!poli || !poli.length || poli[0].length < 4) return null;
  const aneis: Aneis = poli.map(a => a.map(([x, y]) => [x, y]));
  const xs = poli[0].map(c => c[0]); const ys = poli[0].map(c => c[1]);
  /* precisão relativa (1% do polígono): basta um ponto bem de dentro, e coordenada em grau não pede mais que isso */
  const p = pontoMaisInterno(aneis, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 100);
  return [p.x, p.y];
}

export function areaCercadaDoPasto(
  pasto: { id: string; geojson: GeoJSON.Geometry },
  geometrias: readonly { id: string; tipo: string; nome_original: string; geojson: GeoJSON.Geometry }[],
): AreaCercada {
  const utilHa = areaEmHectares(pasto.geojson);
  const internas = areasInternasDoPasto(pasto, geometrias).map(g => ({ nome: g.nome_original, ha: areaEmHectares(g.geojson) }));
  const internasHa = internas.reduce((s, i) => s + i.ha, 0);
  return { utilHa, internasHa, cercadaHa: utilHa + internasHa, internas };
}

/** PIQUETE-PRO-01: os polígonos de área interna do pasto (a MESMA regra da área cercada) — o "+ Piquete" os deixa fora dos piquetes sozinho. */
export function areasInternasDoPasto<T extends { id: string; tipo: string; geojson: GeoJSON.Geometry }>(pasto: { id: string; geojson: GeoJSON.Geometry }, geometrias: readonly T[]): T[] {
  const contornos = contornosExternos(pasto.geojson);
  return geometrias
    .filter(g => g.id !== pasto.id && !NAO_CONTAM.has(g.tipo))
    .filter(g => { const p = pontoInterno(g.geojson); return !!p && contornos.some(c => noAnel(p[0], p[1], c)); });
}
