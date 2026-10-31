import { kml as kmlToGeoJSON } from '@tmcw/togeojson';
import { importarDoApp } from '@/lib/app/falhaDeVersao';

export interface ParsedPolygon {
  name: string;
  geojson: GeoJSON.Geometry;
  properties: Record<string, unknown>;
}

/** MAPA-IMPORT-01b — o que o arquivo trouxe: os polígonos e quantos PONTOS (rótulos do Google Earth) ficaram de fora. */
export interface MapaLido {
  poligonos: ParsedPolygon[];
  pontosIgnorados: number;
}

function contarPontos(features: readonly GeoJSON.Feature[]): number {
  return features.filter(f => f.geometry && (f.geometry.type === 'Point' || f.geometry.type === 'MultiPoint')).length;
}

function feicoesDoKML(kmlText: string): GeoJSON.Feature[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'application/xml');
  return kmlToGeoJSON(doc).features;
}

/**
 * Parse KML text into an array of polygons with names.
 */
export function parseKML(kmlText: string): ParsedPolygon[] {
  return poligonosDoKML(feicoesDoKML(kmlText));
}

function poligonosDoKML(features: readonly GeoJSON.Feature[]): ParsedPolygon[] {
  return features
    .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map(f => ({
      name: (f.properties?.name as string) || 'Sem nome',
      geojson: f.geometry!,
      properties: f.properties || {},
    }));
}

/**
 * Parse KMZ (zipped KML) into polygons.
 * KMZ is a zip file containing a doc.kml.
 */
export async function parseKMZ(arrayBuffer: ArrayBuffer): Promise<ParsedPolygon[]> {
  return parseKML(await textoDoKMZ(arrayBuffer));
}

/* O ÚNICO import() do jszip (o censo dos import() dinâmicos conta este): o KMZ é um zip com o doc.kml dentro. */
async function textoDoKMZ(arrayBuffer: ArrayBuffer): Promise<string> {
  const JSZip = (await importarDoApp(() => import('jszip'))).default;
  const zip = await JSZip.loadAsync(arrayBuffer);
  const kmlFile = zip.file(/\.kml$/i)[0];
  if (!kmlFile) throw new Error('Nenhum arquivo .kml encontrado dentro do KMZ');
  return kmlFile.async('text');
}

/**
 * Parse a GeoJSON string into polygons.
 */
export function parseGeoJSON(text: string): ParsedPolygon[] {
  const geoJson = JSON.parse(text) as GeoJSON.FeatureCollection | GeoJSON.Feature | GeoJSON.Geometry;

  let features: GeoJSON.Feature[] = [];
  if ('type' in geoJson) {
    if (geoJson.type === 'FeatureCollection') features = (geoJson as GeoJSON.FeatureCollection).features;
    else if (geoJson.type === 'Feature') features = [geoJson as GeoJSON.Feature];
    else features = [{ type: 'Feature', geometry: geoJson as GeoJSON.Geometry, properties: {} }];
  }

  return features
    .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map(f => ({
      name: (f.properties?.name as string) || (f.properties?.Name as string) || (f.properties?.nome as string) || 'Sem nome',
      geojson: f.geometry!,
      properties: f.properties || {},
    }));
}

/** MAPA-IMPORT-01b — o arquivo (KML, KMZ ou GeoJSON) com a contagem dos pontos ignorados. Os polígonos são os mesmos de `parseKMLFile`. */
export async function lerArquivoDeMapa(file: File): Promise<MapaLido> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'geojson' || ext === 'json') {
    const text = await file.text();
    const bruto = JSON.parse(text);
    const features: GeoJSON.Feature[] = bruto?.type === 'FeatureCollection' ? bruto.features ?? [] : bruto?.type === 'Feature' ? [bruto] : [];
    return { poligonos: parseGeoJSON(text), pontosIgnorados: contarPontos(features) };
  }
  const kmlText = ext === 'kmz' ? await textoDoKMZ(await file.arrayBuffer()) : await file.text();
  const features = feicoesDoKML(kmlText);
  return { poligonos: poligonosDoKML(features), pontosIgnorados: contarPontos(features) };
}

/**
 * Parse KML, KMZ, or GeoJSON file.
 */
export async function parseKMLFile(file: File): Promise<ParsedPolygon[]> {
  const ext = file.name.toLowerCase().split('.').pop();
  
  if (ext === 'kmz') {
    const buffer = await file.arrayBuffer();
    return parseKMZ(buffer);
  }
  
  const text = await file.text();

  if (ext === 'geojson' || ext === 'json') {
    return parseGeoJSON(text);
  }

  return parseKML(text);
}
