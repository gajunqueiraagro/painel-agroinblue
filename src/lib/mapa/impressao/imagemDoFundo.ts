/**
 * MAPA-IMPRESSAO-01 (D1, Gabriel 03/11 07:44) — a imagem de satélite da folha: Esri World Imagery pelo SERVIÇO OFICIAL com a chave da
 * conta (ArcGIS Location Platform, `VITE_ESRI_API_KEY`): o estilo `arcgis/imagery` do Basemap Styles diz o endereço dos tiles e as
 * fontes (atribuição); os tiles (Web Mercator, 256 px) são desenhados num canvas JÁ na grade UTM da folha por uma afim ajustada nos
 * pontos do bloco (em ~15 km a diferença Mercator × UTM é rotação + escala; o erro que sobra é medido e testado).
 * - Sem chave: a opção some do diálogo e o PDF sai "Sem satélite". Até a resposta da Esri sobre a licença, o padrão é "Sem satélite".
 * - Qualquer falha (estilo, tile, canvas): "sem satélite" com o motivo — o PDF sai do mesmo jeito.
 * - Endereço público sem chave: NUNCA. Google: NUNCA (a Google proíbe as imagens dela em documento impresso ou PDF).
 * - A chave nunca vai para log, mensagem de erro ou relatório (as URLs com o token não são impressas).
 * - Atribuição na folha (Esri): "Powered by Esri" + "Sources: …" no canto de baixo à direita do mapa, fundo branco.
 */
import { deUtm, type Fuso } from './utm';

export const ESTILO_IMAGERY = 'https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/imagery';
/** As fontes do estilo `arcgis/imagery` (lido em 03/11/2026); o lido na hora vale mais. */
export const FONTES_ESRI_PADRAO = 'Esri, Vantor, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community';
export const MAX_PX = 4096;
/** A resolução da imagem na folha. */
export const DPI = 200;
/** Teto de tiles por folha (a cota grátis é de 2 milhões/mês; um A0 a 1:15.000 pede ~500). */
export const MAX_TILES = 900;

export interface EstiloLido { modelo: string; fontes: string; tamanho: number; maxZoom: number }

/** O estilo do Basemap Styles → o modelo dos tiles da fonte raster (com o token) e as fontes. Torto = null. */
export function lerEstilo(dado: unknown, chave: string): EstiloLido | null {
  if (typeof dado !== 'object' || dado === null) return null;
  const fontes = Reflect.get(dado, 'sources');
  if (typeof fontes !== 'object' || fontes === null) return null;
  for (const f of Object.values(fontes)) {
    if (typeof f !== 'object' || f === null || Reflect.get(f, 'type') !== 'raster') continue;
    const tiles = Reflect.get(f, 'tiles');
    const modelo = Array.isArray(tiles) && typeof tiles[0] === 'string' ? tiles[0] : null;
    if (!modelo || !modelo.includes('{z}') || !modelo.includes('{x}') || !modelo.includes('{y}')) continue;
    const comToken = /[?&]token=/.test(modelo) ? modelo : `${modelo}${modelo.includes('?') ? '&' : '?'}token=${encodeURIComponent(chave)}`;
    const atrib = Reflect.get(f, 'attribution');
    const tam = Reflect.get(f, 'tileSize');
    const mz = Reflect.get(f, 'maxzoom');
    return {
      modelo: comToken,
      fontes: typeof atrib === 'string' && atrib.trim() ? atrib.trim().replace(/^Sources?:\s*/i, '') : FONTES_ESRI_PADRAO,
      tamanho: typeof tam === 'number' && tam > 0 ? tam : 256,
      maxZoom: typeof mz === 'number' ? Math.min(mz, 19) : 19,
    };
  }
  return null;
}

/** lon/lat → pixel global do Web Mercator no zoom z (tiles de `t` px). */
export function pixelMercator(lon: number, lat: number, z: number, t: number): [number, number] {
  const n = t * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

export interface PlanoDoBloco {
  /** a posição do bloco no quadro, em mm */
  x: number; y: number; w: number; h: number;
  pxW: number; pxH: number;
  /** a afim [a, b, c, d, e, f] do canvas: pixel do mosaico (relativo a `origem`) → pixel do bloco */
  afim: [number, number, number, number, number, number];
  /** o maior erro da afim no bloco, em metros do terreno */
  erroM: number;
}
export interface PlanoDaImagem { z: number; tamanho: number; origem: [number, number]; tiles: [number, number][]; blocos: PlanoDoBloco[] }

/** Resolve 3×3 (eliminação de Gauss). */
function resolver3(m: number[][], v: number[]): number[] {
  const a = m.map((l, i) => [...l, v[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let l = c + 1; l < 3; l++) if (Math.abs(a[l][c]) > Math.abs(a[p][c])) p = l;
    [a[c], a[p]] = [a[p], a[c]];
    for (let l = 0; l < 3; l++) {
      if (l === c) continue;
      const k = a[l][c] / a[c][c];
      for (let j = c; j < 4; j++) a[l][j] -= k * a[c][j];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

/**
 * O plano da imagem: o zoom (a resolução do terreno mais perto da pedida pela folha), os tiles que cobrem o quadro e, por bloco (≤ 4.096
 * px), a afim que leva o mosaico Mercator para a grade UTM do bloco (mínimos quadrados em 7×7 pontos) e o erro dela.
 */
export function planoDaImagem(e: {
  fuso: Fuso; extensao: { e0: number; n0: number; e1: number; n1: number }; quadroMm: { w: number; h: number };
  tamanho: number; maxZoom: number; dpi?: number;
}): PlanoDaImagem {
  const dpi = e.dpi ?? DPI;
  const { e0, n0, e1, n1 } = e.extensao;
  const pxW = Math.round((e.quadroMm.w / 25.4) * dpi);
  const pxH = Math.round((e.quadroMm.h / 25.4) * dpi);
  const mPorPx = (e1 - e0) / pxW;
  const centro = deUtm((e0 + e1) / 2, (n0 + n1) / 2, e.fuso);
  const resZ0 = (2 * Math.PI * 6378137 * Math.cos((centro.lat * Math.PI) / 180)) / e.tamanho;
  let z = Math.max(0, Math.min(e.maxZoom, Math.round(Math.log2(resZ0 / mPorPx))));

  const cols = Math.ceil(pxW / MAX_PX);
  const rows = Math.ceil(pxH / MAX_PX);
  const PASSOS = 6;
  const montar = (zz: number): PlanoDaImagem => {
    const pontosDoBloco: { u: number; v: number; X: number; Y: number }[][] = [];
    let xMin = Infinity; let xMax = -Infinity; let yMin = Infinity; let yMax = -Infinity;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const bw = Math.round(pxW / cols); const bh = Math.round(pxH / rows);
      const pts: { u: number; v: number; X: number; Y: number }[] = [];
      for (let i = 0; i <= PASSOS; i++) for (let j = 0; j <= PASSOS; j++) {
        const u = (bw * i) / PASSOS; const v = (bh * j) / PASSOS;
        const ee = e0 + ((e1 - e0) * (c * bw + u)) / (cols * bw);
        const nn = n1 - ((n1 - n0) * (r * bh + v)) / (rows * bh);
        const ll = deUtm(ee, nn, e.fuso);
        const [X, Y] = pixelMercator(ll.lon, ll.lat, zz, e.tamanho);
        xMin = Math.min(xMin, X); xMax = Math.max(xMax, X); yMin = Math.min(yMin, Y); yMax = Math.max(yMax, Y);
        pts.push({ u, v, X, Y });
      }
      pontosDoBloco.push(pts);
    }
    const tx0 = Math.floor(xMin / e.tamanho); const tx1 = Math.floor(xMax / e.tamanho);
    const ty0 = Math.floor(yMin / e.tamanho); const ty1 = Math.floor(yMax / e.tamanho);
    const origem: [number, number] = [tx0 * e.tamanho, ty0 * e.tamanho];
    const tiles: [number, number][] = [];
    for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) tiles.push([x, y]);
    const blocos: PlanoDoBloco[] = pontosDoBloco.map((pts, k) => {
      const r = Math.floor(k / cols); const c = k % cols;
      const bw = Math.round(pxW / cols); const bh = Math.round(pxH / rows);
      /* mínimos quadrados: u = a·X + c·Y + e ; v = b·X + d·Y + f (X, Y relativos à origem do mosaico) */
      const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; const bu = [0, 0, 0]; const bv = [0, 0, 0];
      for (const p of pts) {
        const q = [p.X - origem[0], p.Y - origem[1], 1];
        for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) M[i][j] += q[i] * q[j]; bu[i] += q[i] * p.u; bv[i] += q[i] * p.v; }
      }
      const [a, cc, ee] = resolver3(M, bu);
      const [b, d, f] = resolver3(M, bv);
      let erroPx = 0;
      for (const p of pts) {
        const X = p.X - origem[0]; const Y = p.Y - origem[1];
        erroPx = Math.max(erroPx, Math.hypot(a * X + cc * Y + ee - p.u, b * X + d * Y + f - p.v));
      }
      return {
        x: (e.quadroMm.w * c) / cols, y: (e.quadroMm.h * r) / rows, w: e.quadroMm.w / cols, h: e.quadroMm.h / rows,
        pxW: bw, pxH: bh, afim: [a, b, cc, d, ee, f], erroM: erroPx * mPorPx,
      };
    });
    return { z: zz, tamanho: e.tamanho, origem, tiles, blocos };
  };
  let plano = montar(z);
  while (plano.tiles.length > MAX_TILES && z > 0) { z -= 1; plano = montar(z); }
  return plano;
}

/** A URL de um tile pelo modelo do estilo (com o token: nunca imprimir). */
export const urlDoTile = (modelo: string, z: number, x: number, y: number) =>
  modelo.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

export type FundoDaFolha =
  | { tipo: 'imagem'; blocos: { dados: string; x: number; y: number; w: number; h: number }[]; fontes: string }
  | { tipo: 'papel'; motivo: string | null };

export const MOTIVO_SEM_CHAVE = 'Sem satélite: a chave da conta Esri não está configurada.';
export const MOTIVO_FALHOU = 'A imagem de satélite não veio (rede ou serviço Esri); o mapa saiu sem satélite.';

/**
 * O fundo da folha. `lerEstiloJson` busca o estilo (com a chave); `compor` busca os tiles e desenha os blocos (o navegador, ou o teste).
 * Qualquer falha = papel com o motivo.
 */
export async function lerFundo(e: {
  querImagem: boolean; chave: string | null; fuso: Fuso;
  extensao: { e0: number; n0: number; e1: number; n1: number }; quadroMm: { w: number; h: number };
  lerEstiloJson: (url: string) => Promise<unknown>;
  compor: (plano: PlanoDaImagem, modelo: string) => Promise<string[]>;
}): Promise<FundoDaFolha> {
  if (!e.querImagem) return { tipo: 'papel', motivo: null };
  if (!e.chave) return { tipo: 'papel', motivo: MOTIVO_SEM_CHAVE };
  try {
    const estilo = lerEstilo(await e.lerEstiloJson(`${ESTILO_IMAGERY}?token=${encodeURIComponent(e.chave)}`), e.chave);
    if (!estilo) return { tipo: 'papel', motivo: MOTIVO_FALHOU };
    const plano = planoDaImagem({ fuso: e.fuso, extensao: e.extensao, quadroMm: e.quadroMm, tamanho: estilo.tamanho, maxZoom: estilo.maxZoom });
    const dados = await e.compor(plano, estilo.modelo);
    if (dados.length !== plano.blocos.length) return { tipo: 'papel', motivo: MOTIVO_FALHOU };
    return { tipo: 'imagem', fontes: estilo.fontes, blocos: plano.blocos.map((b, i) => ({ dados: dados[i], x: b.x, y: b.y, w: b.w, h: b.h })) };
  } catch {
    return { tipo: 'papel', motivo: MOTIVO_FALHOU };
  }
}

/** A chave da conta Esri (variável do build); vazia = sem a opção do satélite. Nunca imprimir. */
export function chaveEsri(): string | null {
  const v = import.meta.env.VITE_ESRI_API_KEY;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

// --- navegador ---------------------------------------------------------------------------------------------------------------------
/** O estilo (JSON). O erro não leva a URL (ela tem o token). */
export async function lerEstiloNoNavegador(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`estilo Esri: ${r.status}`);
  return r.json();
}

async function tileNoNavegador(url: string): Promise<ImageBitmap> {
  const r = await fetch(url);
  const tipo = r.headers.get('content-type') ?? '';
  if (!r.ok || !tipo.startsWith('image/')) throw new Error(`tile Esri: ${r.status} ${tipo}`);
  return createImageBitmap(await r.blob());
}

/** Busca os tiles (8 por vez) e desenha cada bloco num canvas pela afim; devolve um JPEG (data URL) por bloco. */
export async function comporNoNavegador(plano: PlanoDaImagem, modelo: string): Promise<string[]> {
  const imagens = new Map<string, ImageBitmap>();
  const fila = [...plano.tiles];
  const trabalhador = async () => {
    for (let t = fila.shift(); t; t = fila.shift()) imagens.set(`${t[0]}/${t[1]}`, await tileNoNavegador(urlDoTile(modelo, plano.z, t[0], t[1])));
  };
  await Promise.all(Array.from({ length: 8 }, trabalhador));
  const saida: string[] = [];
  for (const b of plano.blocos) {
    const canvas = document.createElement('canvas');
    canvas.width = b.pxW; canvas.height = b.pxH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponível');
    ctx.fillStyle = '#3a4436';
    ctx.fillRect(0, 0, b.pxW, b.pxH);
    ctx.setTransform(...b.afim);
    for (const [x, y] of plano.tiles) {
      const img = imagens.get(`${x}/${y}`);
      /* +0,5 px de sobra em cada tile: sem fresta entre os tiles depois da rotação */
      if (img) ctx.drawImage(img, x * plano.tamanho - plano.origem[0], y * plano.tamanho - plano.origem[1], plano.tamanho + 0.5, plano.tamanho + 0.5);
    }
    saida.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  for (const img of imagens.values()) img.close();
  return saida;
}
