/**
 * MAPA-IMPRESSAO-01 (D3, Gabriel 03/11) — UTM SIRGAS 2000 com o FUSO AUTOMÁTICO, o padrão dos mapas de georreferenciamento.
 * Sem proj4: a série de Krüger (Karney 2011, até n⁴: erro < 1 mm dentro do fuso) sobre o elipsoide GRS80, o do SIRGAS 2000. O GeoJSON
 * do banco vem em WGS84; WGS84 e SIRGAS 2000 diferem em centímetros, abaixo do traço de qualquer folha (A0 a 1:5.000 = 1 mm = 5 m).
 * Conferido contra o pyproj (EPSG 4674 → 3197x/3198x) em `utm.test.ts`.
 */

const A = 6378137;
const F = 1 / 298.257222101; // GRS80
const K0 = 0.9996;
const N = F / (2 - F);
const A_RET = (A / (1 + N)) * (1 + (N * N) / 4 + (N ** 4) / 64);
const ALFA = [
  N / 2 - (2 * N * N) / 3 + (5 * N ** 3) / 16 + (41 * N ** 4) / 180,
  (13 * N * N) / 48 - (3 * N ** 3) / 5 + (557 * N ** 4) / 1440,
  (61 * N ** 3) / 240 - (103 * N ** 4) / 140,
  (49561 * N ** 4) / 161280,
];
const E2N = (2 * Math.sqrt(N)) / (1 + N);
const rad = (g: number) => (g * Math.PI) / 180;

export interface Fuso {
  numero: number;
  sul: boolean;
  /** EPSG do SIRGAS 2000 / UTM (31978–31985 no hemisfério sul, 31972–31976 no norte). */
  epsg: number;
  meridianoCentral: number;
}

/** O fuso pela longitude (e o hemisfério pela latitude) de um ponto — o centro da fazenda. */
export function fusoDe(lon: number, lat: number): Fuso {
  const numero = Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
  const sul = lat < 0;
  return { numero, sul, epsg: sul ? 31960 + numero : 31954 + numero, meridianoCentral: numero * 6 - 183 };
}

/** Longitude/latitude (graus) → E/N (metros) no fuso dado. */
export function paraUtm(lon: number, lat: number, fuso: Fuso): { e: number; n: number } {
  const phi = rad(lat);
  const dl = rad(lon - fuso.meridianoCentral);
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - E2N * Math.atanh(E2N * Math.sin(phi)));
  const xi = Math.atan2(t, Math.cos(dl));
  const eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let x = eta;
  let y = xi;
  for (let j = 1; j <= 4; j++) {
    x += ALFA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    y += ALFA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
  }
  return { e: 500000 + K0 * A_RET * x, n: (fuso.sul ? 10000000 : 0) + K0 * A_RET * y };
}

const BETA = [
  N / 2 - (2 * N * N) / 3 + (37 * N ** 3) / 96 - (N ** 4) / 360,
  (N * N) / 48 + (N ** 3) / 15 - (437 * N ** 4) / 1440,
  (17 * N ** 3) / 480 - (37 * N ** 4) / 840,
  (4397 * N ** 4) / 161280,
];
const E2 = F * (2 - F);
const E = Math.sqrt(E2);

/** E/N (metros) no fuso → longitude/latitude (graus). A inversa da série de Krüger; a latitude pela iteração de Karney (converge em
 *  poucas voltas). Usada para achar os tiles da imagem que cobrem o quadro da folha. */
export function deUtm(e: number, n: number, fuso: Fuso): { lon: number; lat: number } {
  const xi = (n - (fuso.sul ? 10000000 : 0)) / (K0 * A_RET);
  const eta = (e - 500000) / (K0 * A_RET);
  let xl = xi;
  let el = eta;
  for (let j = 1; j <= 4; j++) {
    xl -= BETA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    el -= BETA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const tl = Math.sin(xl) / Math.sqrt(Math.sinh(el) ** 2 + Math.cos(xl) ** 2);
  let t = tl;
  for (let i = 0; i < 6; i++) {
    const s = Math.sqrt(1 + t * t);
    const sigma = Math.sinh(E * Math.atanh((E * t) / s));
    const tli = t * Math.sqrt(1 + sigma * sigma) - sigma * s;
    const dt = ((tl - tli) / Math.sqrt(1 + tli * tli)) * ((1 + (1 - E2) * t * t) / ((1 - E2) * s));
    t += dt;
    if (Math.abs(dt) < 1e-14) break;
  }
  return { lon: fuso.meridianoCentral + (Math.atan2(Math.sinh(el), Math.cos(xl)) * 180) / Math.PI, lat: (Math.atan(t) * 180) / Math.PI };
}

/**
 * A convergência meridiana em graus: o ângulo do norte verdadeiro em relação ao norte da quadrícula, positivo quando o norte verdadeiro
 * fica à DIREITA (sentido horário). Medida pela própria projeção (um passo para o norte no meridiano), sem fórmula à parte.
 */
export function convergencia(lon: number, lat: number, fuso: Fuso): number {
  const a = paraUtm(lon, lat, fuso);
  const b = paraUtm(lon, lat + 0.001, fuso);
  return (Math.atan2(b.e - a.e, b.n - a.n) * 180) / Math.PI;
}

/** "0°35′" (sempre positivo; o lado vai na frase). */
export function grausMinutos(g: number): string {
  const v = Math.abs(g);
  let graus = Math.floor(v);
  let min = Math.round((v - graus) * 60);
  if (min === 60) { graus += 1; min = 0; }
  return `${graus}°${String(min).padStart(2, '0')}′`;
}
