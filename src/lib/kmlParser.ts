import { kml as kmlToGeoJSON } from '@tmcw/togeojson';

export interface ParsedPolygon {
  name: string;
  geojson: GeoJSON.Geometry;
  properties: Record<string, unknown>;
}

/**
 * Parse KML text into an array of polygons with names.
 */
export function parseKML(kmlText: string): ParsedPolygon[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'application/xml');
  const geoJson = kmlToGeoJSON(doc);

  return geoJson.features
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
  // Dynamic import to keep bundle small
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // Find the KML file inside the KMZ
  const kmlFile = zip.file(/\.kml$/i)[0];
  if (!kmlFile) throw new Error('Nenhum arquivo .kml encontrado dentro do KMZ');
  
  const kmlText = await kmlFile.async('text');
  return parseKML(kmlText);
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
