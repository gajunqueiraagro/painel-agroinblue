/**
 * MAPA-IMPORT-01b — a área em hectares de um polígono do mapa (KML/KMZ/GeoJSON), calculada na leitura (nunca gravada no polígono).
 * Fórmula de área esférica (a do turf `area`, raio médio 6.371.008,8 m): anel externo menos os furos; MultiPolygon soma as partes.
 * Não havia cálculo de área no app (FASE 0); a fórmula é curta e não pede dependência nova.
 */
const RAIO_DA_TERRA_M = 6371008.8;

function radianos(graus: number): number {
  return (graus * Math.PI) / 180;
}

/** Área do anel em m² (sem sinal). O anel é [lng, lat][], fechado ou não. */
export function areaDoAnelM2(anel: readonly (readonly number[])[]): number {
  const n = anel.length;
  if (n < 3) return 0;
  let soma = 0;
  for (let i = 0; i < n; i++) {
    const [lng1, lat1] = anel[i];
    const [lng2, lat2] = anel[(i + 1) % n];
    soma += (radianos(lng2) - radianos(lng1)) * (2 + Math.sin(radianos(lat1)) + Math.sin(radianos(lat2)));
  }
  return Math.abs((soma * RAIO_DA_TERRA_M * RAIO_DA_TERRA_M) / 2);
}

function areaDoPoligonoM2(aneis: readonly (readonly (readonly number[])[])[]): number {
  if (aneis.length === 0) return 0;
  const [externo, ...furos] = aneis;
  return Math.max(0, areaDoAnelM2(externo) - furos.reduce((s, f) => s + areaDoAnelM2(f), 0));
}

/** Área em hectares; geometria que não é Polygon/MultiPolygon vale 0. */
export function areaEmHectares(geometria: GeoJSON.Geometry): number {
  if (geometria.type === 'Polygon') return areaDoPoligonoM2(geometria.coordinates) / 10000;
  if (geometria.type === 'MultiPolygon') return geometria.coordinates.reduce((s, p) => s + areaDoPoligonoM2(p), 0) / 10000;
  return 0;
}

/** A área da tabela: 1 casa, vírgula decimal, sem separador de milhar ("1610,3"). */
export function areaNaTabela(hectares: number): string {
  return hectares.toFixed(1).replace('.', ',');
}
