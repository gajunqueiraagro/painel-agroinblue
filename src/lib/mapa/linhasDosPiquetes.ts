/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a (Gabriel 02/11/2026, homologação do Modulo 03: "está engessado; preciso escolher, mover e editar, com régua,
 * seguindo o mapa real da fazenda") — a conta pura das LINHAS DE CORTE: UM modelo (polilinhas) para a grade, os N iguais e o que o operador traça.
 *   - A grade e os N iguais só GERAM as linhas iniciais (`linhasDaGrade`); daí em diante tudo é edição de linhas.
 *   - As divisões são as PEÇAS CONEXAS do pasto menos as áreas internas (praça, corredor, furo) menos as linhas (`divisoesDasLinhas`): cada
 *     linha só separa o que o traçado dela realmente atravessa (o segmento de coluna de uma faixa não corta a outra: junção em T) e o resultado
 *     independe da ordem das linhas. A ponta solta de uma linha dentro do pasto se resolve (`resolverLinhas`): passou da outra linha = apara no
 *     cruzamento; ficou curta = vai até a primeira borda ou linha — sem fresta.
 *   - A linha é "fita" de 0,4 mm no plano local: a área de cada peça é a do banco (`areaDoBancoHa`), a perda da fita é desprezível.
 *   - Praça e corredor são áreas internas: saem do pasto ANTES do corte (como o furo da manga) e não são piquete.
 * Puro: nada de mapa nem de banco aqui.
 */
import { difference, union } from 'polyclip-ts';
import {
  areaDoBancoHa, doPlano, emOrdemDeLeitura, fechado, paraPlano, type Cortes, type Divisao, type Montagem, type Plano,
} from '@/lib/mapa/criarPiquetes';
import { distanciaM, textoM, type Ponto } from '@/lib/mapa/edicaoDoPoligono';

type P2 = [number, number];
type Anel2 = P2[];
type Poli2 = Anel2[];

export interface LinhaDeCorte { id: string; pontos: Ponto[] }
export type TipoDeAreaInterna = 'praca' | 'corredor';
export interface AreaInterna {
  id: string; tipo: TipoDeAreaInterna; nome: string;
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  /** só o corredor: o eixo e a largura de onde a faixa nasce */
  eixo?: Ponto[]; larguraM?: number;
}

const TOL_M = 0.02;          // "está em cima" (m)
const SOBRA_M = 0.3;         // quanto a fita passa da borda para cortar limpo (m)
const LARGURA_DA_FITA_M = 0.0004;
const AREA_MINIMA_M2 = 0.5;  // abaixo disso a peça é resto da fita

// --- o plano e as figuras ---------------------------------------------------------------------------------------------------------
const rad = (g: number) => (g * Math.PI) / 180;
function planoDe(g: GeoJSON.Polygon): Plano {
  const externo = g.coordinates[0];
  const lons = externo.map(p => p[0]), lats = externo.map(p => p[1]);
  const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2, lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  return { lon0, lat0, kx: 111320 * Math.cos(rad(lat0)), ky: 110540 };
}
const d2 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function maisPerto(p: readonly number[], a: readonly number[], b: readonly number[]): { q: P2; dist: number; k: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const k = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const q: P2 = [a[0] + k * dx, a[1] + k * dy];
  return { q, dist: d2(p, q), k };
}

/** Onde o segmento a→b (t) encontra c→d (u): a reta de um com a do outro; null = paralelas. */
function cruza(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): { t: number; u: number } | null {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12 * Math.hypot(rx, ry) * Math.hypot(sx, sy) || den === 0) return null;
  return { t: ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u: ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den };
}

function dentroDoAnel(p: readonly number[], anel: readonly (readonly number[])[]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const a = anel[i], b = anel[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) dentro = !dentro;
  }
  return dentro;
}
const dentroDe = (p: readonly number[], polis: readonly Poli2[]) =>
  polis.some(poli => poli.length > 0 && dentroDoAnel(p, poli[0]) && !poli.slice(1).some(f => dentroDoAnel(p, f)));

function areaPlanaM2(poli: Poli2): number {
  return poli.reduce((s, anel, i) => {
    let a = 0;
    for (let k = 0; k < anel.length - 1; k++) a += anel[k][0] * anel[k + 1][1] - anel[k + 1][0] * anel[k][1];
    return s + (i === 0 ? 1 : -1) * Math.abs(a / 2);
  }, 0);
}

// --- a cena: o pasto menos as áreas internas ----------------------------------------------------------------------------------------
interface Cena { plano: Plano; trabalho: Poli2[]; aneis: Anel2[] }
interface Obst { a: P2; b: P2; tipo: 'borda' | 'linha' }

const polisDe = (geo: GeoJSON.Polygon | GeoJSON.MultiPolygon, plano: Plano): Poli2[] => {
  const polis = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates;
  return polis.map(p => p.map(anel => fechado(anel).map(q => paraPlano(plano, q))));
};

function cenaDe(g: GeoJSON.Polygon, internas: readonly Pick<AreaInterna, 'geojson'>[]): Cena {
  const plano = planoDe(g);
  const pasto = polisDe(g, plano)[0];
  const clips = internas.flatMap(a => polisDe(a.geojson, plano));
  const trabalho: Poli2[] = clips.length ? difference(pasto, ...clips).filter(p => p.length && p[0].length >= 4) : [pasto];
  return { plano, trabalho, aneis: trabalho.flatMap(p => p) };
}

const segsDoAnel = (anel: Anel2): Obst[] => anel.slice(0, -1).map((a, i) => ({ a, b: anel[i + 1], tipo: 'borda' }));
const segsDaLinha = (pts: P2[]): Obst[] => pts.slice(0, -1).map((a, i) => ({ a, b: pts[i + 1], tipo: 'linha' }));
function obstaculos(cena: Cena, linhas: P2[][], exceto: number): Obst[] {
  return [...cena.aneis.flatMap(segsDoAnel), ...linhas.flatMap((l, i) => (i === exceto ? [] : segsDaLinha(l)))];
}
const pertoDe = (p: readonly number[], obs: readonly Obst[], tol: number, tipo?: Obst['tipo']) =>
  obs.some(o => (!tipo || o.tipo === tipo) && maisPerto(p, o.a, o.b).dist <= tol);

const semRepetidos = (pts: P2[]): P2[] => pts.filter((p, i) => i === 0 || d2(p, pts[i - 1]) > 1e-9);

/** A ponta `fim` de `pts`: solta dentro do pasto, ou passa de outra linha (apara no cruzamento) ou vai até o primeiro obstáculo. */
function ajustarPonta(entrada: P2[], fim: boolean, cena: Cena, obs: readonly Obst[]): P2[] {
  if (entrada.length < 2) return entrada;
  const pts = fim ? entrada : [...entrada].reverse();
  const n = pts.length - 1;
  const e = pts[n];
  const volta = (r: P2[]) => (fim ? r : [...r].reverse());
  if (pertoDe(e, obs, TOL_M) || !dentroDe(e, cena.trabalho)) return entrada;
  // passou da outra linha? caminha da ponta para dentro e apara no primeiro cruzamento com OUTRA linha
  for (let k = n - 1; k >= 0; k--) {
    const a = pts[k], b = pts[k + 1];
    let melhor: { t: number; p: P2 } | null = null;
    for (const o of obs) {
      if (o.tipo !== 'linha') continue;
      const x = cruza(a, b, o.a, o.b);
      if (!x || x.t < 0 || x.t >= 1 - 1e-9 || x.u < -1e-9 || x.u > 1 + 1e-9) continue;
      const p: P2 = [a[0] + x.t * (b[0] - a[0]), a[1] + x.t * (b[1] - a[1])];
      if (d2(p, pts[0]) <= TOL_M) continue;
      if (!melhor || x.t > melhor.t) melhor = { t: x.t, p };
    }
    if (melhor) return volta(semRepetidos([...pts.slice(0, k + 1), melhor.p]));
  }
  // ficou curta: segue na direção do último trecho até o primeiro obstáculo
  const a = pts[n - 1];
  const len = d2(a, e);
  if (len === 0) return entrada;
  const dir: P2 = [(e[0] - a[0]) / len, (e[1] - a[1]) / len];
  let melhorT = Infinity;
  for (const o of obs) {
    const x = cruza(e, [e[0] + dir[0], e[1] + dir[1]], o.a, o.b);
    if (x && x.t > TOL_M && x.u >= -1e-9 && x.u <= 1 + 1e-9 && x.t < melhorT) melhorT = x.t;
  }
  if (!Number.isFinite(melhorT)) return entrada;
  return volta([...pts.slice(0, n), [e[0] + dir[0] * melhorT, e[1] + dir[1] * melhorT]]);
}

function resolverNoPlano(linhas: P2[][], cena: Cena): P2[][] {
  return linhas.map((pts, i) => {
    const obs = obstaculos(cena, linhas, i);
    const limpo = semRepetidos(pts);
    return ajustarPonta(ajustarPonta(limpo, true, cena, obs), false, cena, obs);
  });
}

const noPlano = (l: LinhaDeCorte, plano: Plano): P2[] => l.pontos.map(p => paraPlano(plano, p));
const emGraus = (pts: readonly P2[], plano: Plano): Ponto[] => pts.map(p => doPlano(plano, p));

/** As linhas com as pontas resolvidas (aparadas ou levadas até a borda/outra linha). Os ids ficam. */
export function resolverLinhas(g: GeoJSON.Polygon, linhas: readonly LinhaDeCorte[], internas: readonly Pick<AreaInterna, 'geojson'>[] = []): LinhaDeCorte[] {
  const cena = cenaDe(g, internas);
  const r = resolverNoPlano(linhas.map(l => noPlano(l, cena.plano)), cena);
  return linhas.map((l, i) => ({ id: l.id, pontos: emGraus(r[i], cena.plano) }));
}

// --- o raio e o encaixe em px ------------------------------------------------------------------------------------------------------
/** O plano local do pasto (metros): o mesmo das contas daqui. */
export const planoDoPasto = (g: GeoJSON.Polygon): Plano => planoDe(g);

/** Onde o raio que sai de `origem` na direção `angulo` (rad; 0 = leste, anti-horário, no plano em metros) encontra a borda do pasto (e dos
 *  furos) pela 1ª vez; null = não encontra. (A cerca da praça nasce daqui.) */
export function bordaNoRaio(g: GeoJSON.Polygon, origem: readonly number[], angulo: number): Ponto | null {
  const cena = cenaDe(g, []);
  const o = paraPlano(cena.plano, origem);
  const dir: P2 = [Math.cos(angulo), Math.sin(angulo)];
  const alvo: P2 = [o[0] + dir[0], o[1] + dir[1]];
  let melhor = Infinity;
  for (const s of cena.aneis.flatMap(segsDoAnel)) {
    const x = cruza(o, alvo, s.a, s.b);
    if (x && x.t > 0.001 && x.u >= -1e-9 && x.u <= 1 + 1e-9 && x.t < melhor) melhor = x.t;
  }
  return Number.isFinite(melhor) ? doPlano(cena.plano, [o[0] + dir[0] * melhor, o[1] + dir[1] * melhor]) : null;
}

/** Metros que cabem em 1 px do mapa no zoom e na latitude dados (Web Mercator). */
export const metrosPorPixel = (zoom: number, lat: number) => (156543.03392 * Math.cos(rad(lat))) / 2 ** zoom;
/** A tolerância do encaixe em metros: `px` (7) pixels de tela. */
export const toleranciaDeEncaixeM = (zoom: number, lat: number, px = 7) => px * metrosPorPixel(zoom, lat);

// --- as divisões ----------------------------------------------------------------------------------------------------------------------
/** A fita da linha: um retângulo por trecho e um quadrado por dobra; a ponta que encosta na borda passa dela `SOBRA_M` (corte limpo). */
function fitasDaLinha(pts: P2[], obs: readonly Obst[]): Poli2[] {
  if (pts.length < 2) return [];
  const w = LARGURA_DA_FITA_M / 2;
  const p = pts.map(q => [q[0], q[1]] as P2);
  const estende = (fim: boolean) => {
    const i = fim ? p.length - 1 : 0, j = fim ? i - 1 : 1;
    if (pertoDe(p[i], obs, TOL_M, 'linha') || !pertoDe(p[i], obs, TOL_M, 'borda')) return;
    const len = d2(p[i], p[j]);
    if (len > 0) p[i] = [p[i][0] + ((p[i][0] - p[j][0]) / len) * SOBRA_M, p[i][1] + ((p[i][1] - p[j][1]) / len) * SOBRA_M];
  };
  estende(true); estende(false);
  const fitas: Poli2[] = [];
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i], b = p[i + 1];
    const len = d2(a, b);
    if (len < 1e-9) continue;
    const nx = (-(b[1] - a[1]) / len) * w, ny = ((b[0] - a[0]) / len) * w;
    fitas.push([[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]]]);
  }
  for (let i = 1; i + 1 < p.length; i++) {
    const [x, y] = p[i];
    fitas.push([[[x - w, y - w], [x + w, y - w], [x + w, y + w], [x - w, y + w], [x - w, y - w]]]);
  }
  return fitas;
}

/** Corta o pasto pelas linhas (menos as áreas internas): cada peça conexa é uma divisão, em ordem de leitura (oeste → leste, norte → sul). */
export function divisoesDasLinhas(g: GeoJSON.Polygon, linhas: readonly LinhaDeCorte[], internas: readonly Pick<AreaInterna, 'geojson'>[] = []): Divisao[] {
  const cena = cenaDe(g, internas);
  if (!cena.trabalho.length) return [];
  const lp = resolverNoPlano(linhas.map(l => noPlano(l, cena.plano)), cena);
  const fitas = lp.flatMap((pts, i) => fitasDaLinha(pts, obstaculos(cena, lp, i)));
  const pedacos = (fitas.length ? difference(cena.trabalho, ...fitas) : cena.trabalho)
    .filter(p => p.length && p[0].length >= 4 && areaPlanaM2(p) >= AREA_MINIMA_M2);
  const poligonos: GeoJSON.Polygon[] = pedacos.map(p => ({ type: 'Polygon', coordinates: p.map(anel => anel.map(q => doPlano(cena.plano, q))) }));
  return emOrdemDeLeitura(poligonos).map((geojson, coluna) => ({ linha: 0, coluna, geojson, areaHa: areaDoBancoHa(geojson), partes: 1 }));
}

// --- a grade vira linhas -----------------------------------------------------------------------------------------------------------
/** As linhas iniciais de uma grade L × C (N iguais = 1 × N): cada corte de faixa vai de borda a borda; cada corte de coluna vai da linha (ou
 *  borda) de cima à de baixo da SUA faixa — junção em T. */
export function linhasDaGrade(m: Montagem, c: Cortes): LinhaDeCorte[] {
  const ext = m.poli[0];
  const sd = (p: readonly number[]) => p[0] * m.d[0] + p[1] * m.d[1];
  const un = (p: readonly number[]) => p[0] * m.n[0] + p[1] * m.n[1];
  const pt = (s: number, u: number): Ponto => doPlano(m.plano, [m.d[0] * s + m.n[0] * u, m.d[1] * s + m.n[1] * u]);
  const nasBordas = (valor: number, eixo: (p: readonly number[]) => number, outro: (p: readonly number[]) => number): number[] => {
    const achados: number[] = [];
    for (let i = 0; i + 1 < ext.length; i++) {
      const v1 = eixo(ext[i]), v2 = eixo(ext[i + 1]);
      if (v1 !== v2 && (v1 - valor) * (v2 - valor) <= 0) achados.push(outro(ext[i]) + ((valor - v1) / (v2 - v1)) * (outro(ext[i + 1]) - outro(ext[i])));
    }
    return achados;
  };
  const saida: LinhaDeCorte[] = [];
  c.linhas.forEach((u, i) => {
    const ss = nasBordas(u, un, sd);
    saida.push({ id: `f${i + 1}`, pontos: [pt(ss.length ? Math.min(...ss) : m.sMin, u), pt(ss.length ? Math.max(...ss) : m.sMax, u)] });
  });
  const nl = c.linhas.length + 1;
  for (let r = 0; r < nl; r++) {
    (c.colunas[r] ?? []).forEach((s, i) => {
      const us = nasBordas(s, sd, un);
      const topo = r === 0 ? (us.length ? Math.min(...us) : m.uMin) : c.linhas[r - 1];
      const base = r === nl - 1 ? (us.length ? Math.max(...us) : m.uMax) : c.linhas[r];
      saida.push({ id: `c${r + 1}-${i + 1}`, pontos: [pt(s, topo), pt(s, base)] });
    });
  }
  return saida;
}

// --- editar a linha ----------------------------------------------------------------------------------------------------------------
/** O ponto mais perto da borda do pasto (e das áreas internas), em graus. */
export function projetarNaBorda(g: GeoJSON.Polygon, internas: readonly Pick<AreaInterna, 'geojson'>[], p: readonly number[]): Ponto {
  const cena = cenaDe(g, internas);
  const q = paraPlano(cena.plano, p);
  let melhor: { q: P2; dist: number } | null = null;
  for (const o of cena.aneis.flatMap(segsDoAnel)) {
    const r = maisPerto(q, o.a, o.b);
    if (!melhor || r.dist < melhor.dist) melhor = { q: r.q, dist: r.dist };
  }
  return doPlano(cena.plano, melhor ? melhor.q : q);
}

/** Desliza a linha INTEIRA paralela à corda (primeiro → último ponto) `desloc` metros (positivo = à esquerda de quem vai do primeiro ao
 *  último). A ponta que estava na borda continua na borda: reprojetada onde a reta do último trecho encontra a borda. */
export function deslizarParalela(g: GeoJSON.Polygon, internas: readonly Pick<AreaInterna, 'geojson'>[], linha: LinhaDeCorte, desloc: number): LinhaDeCorte {
  const cena = cenaDe(g, internas);
  const pts = noPlano(linha, cena.plano);
  if (pts.length < 2) return linha;
  const a = pts[0], b = pts[pts.length - 1];
  const len = d2(a, b);
  if (len === 0) return linha;
  const nx = (-(b[1] - a[1]) / len) * desloc, ny = ((b[0] - a[0]) / len) * desloc;
  const borda = cena.aneis.flatMap(segsDoAnel);
  const estavaNaBorda = [pertoDe(pts[0], borda, 0.5), pertoDe(pts[pts.length - 1], borda, 0.5)];
  const novos = pts.map(p => [p[0] + nx, p[1] + ny] as P2);
  [0, pts.length - 1].forEach((i, k) => {
    if (!estavaNaBorda[k]) return;
    const j = i === 0 ? 1 : i - 1;
    const e = novos[i], vizinho = novos[j];
    let melhor: P2 | null = null;
    for (const o of borda) {
      const x = cruza(e, vizinho, o.a, o.b);
      if (!x || x.u < -1e-9 || x.u > 1 + 1e-9) continue;
      const q: P2 = [e[0] + x.t * (vizinho[0] - e[0]), e[1] + x.t * (vizinho[1] - e[1])];
      if (!melhor || d2(q, e) < d2(melhor, e)) melhor = q;
    }
    if (!melhor) {
      let perto: { q: P2; dist: number } | null = null;
      for (const o of borda) { const r = maisPerto(e, o.a, o.b); if (!perto || r.dist < perto.dist) perto = { q: r.q, dist: r.dist }; }
      melhor = perto ? perto.q : e;
    }
    novos[i] = melhor;
  });
  return { id: linha.id, pontos: emGraus(novos, cena.plano) };
}

/** Acrescenta um ponto no trecho mais perto de `p` (a forma não muda: o ponto cai em cima da linha). */
export function comPontoNaLinha(linha: LinhaDeCorte, p: Ponto): LinhaDeCorte {
  let melhor = { i: 0, dist: Infinity, q: p };
  linha.pontos.slice(0, -1).forEach((a, i) => {
    const r = maisPerto(p, a, linha.pontos[i + 1]);
    if (r.dist < melhor.dist) melhor = { i, dist: r.dist, q: [r.q[0], r.q[1]] };
  });
  const pontos = [...linha.pontos.slice(0, melhor.i + 1), melhor.q, ...linha.pontos.slice(melhor.i + 1)];
  return { id: linha.id, pontos };
}
export function comPontoMovido(linha: LinhaDeCorte, i: number, p: Ponto): LinhaDeCorte {
  return { id: linha.id, pontos: linha.pontos.map((q, k) => (k === i ? p : q)) };
}
/** Tira o ponto i; a linha precisa de pelo menos 2 pontos (senão devolve null). */
export function semPontoDaLinha(linha: LinhaDeCorte, i: number): LinhaDeCorte | null {
  if (linha.pontos.length <= 2) return null;
  return { id: linha.id, pontos: linha.pontos.filter((_q, k) => k !== i) };
}

// --- pontos dentro das divisões ----------------------------------------------------------------------------------------------------
const aneisDe = (g: GeoJSON.Polygon | GeoJSON.MultiPolygon): number[][][][] => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

/** O ponto está DENTRO da divisão (os furos valem)? */
export function pontoDentro(g: GeoJSON.Polygon | GeoJSON.MultiPolygon | null, p: readonly number[]): boolean {
  if (!g) return false;
  return aneisDe(g).some(poli => poli.length > 0 && dentroDoAnel(p, poli[0]) && !poli.slice(1).some(f => dentroDoAnel(p, f)));
}

/** Um ponto bem no interior da divisão (o meio do trecho mais largo de uma varredura horizontal): o nome e a ligação ficam presos a ele. */
export function pontoInterior(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): Ponto {
  const partes = aneisDe(g);
  const area = (poli: number[][][]) => areaDoBancoHa({ type: 'Polygon', coordinates: poli });
  const poli = partes.reduce((a, b) => (area(b) > area(a) ? b : a));
  const ys = poli[0].map(p => p[1]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  let melhor: { x: number; y: number; w: number } | null = null;
  /* do meio para as bordas: com faixas de mesma largura (um quadrante), ganha a do meio — a etiqueta fica no centro da divisão, não na borda */
  for (const k of [5, 4, 6, 3, 7, 2, 8, 1, 9, 0, 10]) {
    const y = y0 + ((k + 0.5) / 11) * (y1 - y0);
    const xs: number[] = [];
    for (const anel of poli) {
      for (let i = 0; i + 1 < anel.length; i++) {
        const a = anel[i], b = anel[i + 1];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (!melhor || w > melhor.w) melhor = { x: (xs[i] + xs[i + 1]) / 2, y, w };
    }
  }
  return melhor ? [melhor.x, melhor.y] : [poli[0][0][0], poli[0][0][1]];
}

// --- área desejada deslizando uma linha ---------------------------------------------------------------------------------------------
export type ResultadoDaArea = { ok: true; linhas: LinhaDeCorte[]; linhaId: string } | { ok: false; motivo: string };

const haBr = (ha: number) => (Math.round(ha * 100) / 100).toFixed(2).replace('.', ',');

/** A linha que mais faz divisa com a divisão (amostras ao longo das linhas a até 10 cm do contorno dela). */
function linhaDeDivisa(g: GeoJSON.Polygon, divisao: GeoJSON.Polygon | GeoJSON.MultiPolygon, linhas: readonly LinhaDeCorte[]): string | null {
  const plano = planoDe(g);
  const segs = polisDe(divisao, plano).flatMap(p => p.flatMap(segsDoAnel));
  let melhor: { id: string; n: number } | null = null;
  for (const l of linhas) {
    const pts = noPlano(l, plano);
    let n = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const len = d2(pts[i], pts[i + 1]);
      const passos = Math.max(2, Math.ceil(len / 2));
      for (let k = 0; k < passos; k++) {
        const t = (k + 0.5) / passos;
        const q: P2 = [pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])];
        if (segs.some(s => maisPerto(q, s.a, s.b).dist <= 0.1)) n++;
      }
    }
    if (n > 0 && (!melhor || n > melhor.n)) melhor = { id: l.id, n };
  }
  return melhor ? melhor.id : null;
}

/** "Área desejada" na divisão `indice`: por bisseção, desliza paralela a linha SELECIONADA (ou, sem seleção, a que mais faz divisa com a
 *  divisão) até a área bater. Não dá = recusa com frase. */
export function comAreaDesejadaPelaLinha(g: GeoJSON.Polygon, linhas: readonly LinhaDeCorte[], internas: readonly Pick<AreaInterna, 'geojson'>[],
  indice: number, desejadaHa: number, linhaId: string | null): ResultadoDaArea {
  const divs = divisoesDasLinhas(g, linhas, internas);
  const alvo = divs[indice];
  if (!alvo || !alvo.geojson) return { ok: false, motivo: 'Esta divisão não existe mais.' };
  if (!(desejadaHa > 0)) return { ok: false, motivo: 'Digite a área desejada em hectares.' };
  const resolvidas = resolverLinhas(g, linhas, internas);
  const id = linhaId && linhas.some(l => l.id === linhaId) ? linhaId : linhaDeDivisa(g, alvo.geojson, resolvidas);
  const linha = id ? linhas.find(l => l.id === id) : null;
  if (!id || !linha) return { ok: false, motivo: 'Esta divisão não tem linha de divisa para deslizar: risque uma linha antes.' };
  const plano = planoDe(g);
  const ref = paraPlano(plano, pontoInterior(alvo.geojson));
  const pts = noPlano(resolvidas.find(l => l.id === id) ?? linha, plano);
  const a = pts[0], b = pts[pts.length - 1];
  const len = d2(a, b);
  const d0 = ((b[0] - a[0]) * (ref[1] - a[1]) - (b[1] - a[1]) * (ref[0] - a[0])) / (len || 1); // distância (com sinal) da divisão à corda
  const ext = g.coordinates[0].map(p => paraPlano(plano, p));
  const xs = ext.map(p => p[0]), ys = ext.map(p => p[1]);
  const tMax = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const lo = d0 > 0 ? -tMax : d0 + 0.5, hi = d0 > 0 ? d0 - 0.5 : tMax;
  const base = resolvidas.map(l => ({ ...l }));
  const comLinha = (t: number): LinhaDeCorte[] => base.map(l => (l.id === id ? deslizarParalela(g, internas, l, t) : l));
  const refGraus = pontoInterior(alvo.geojson);
  const areaCom = (t: number): number => {
    const ds = divisoesDasLinhas(g, comLinha(t), internas);
    const d = ds.find(x => pontoDentro(x.geojson, refGraus));
    return d ? d.areaHa - desejadaHa : NaN;
  };
  const N = 12;
  let ant = { t: lo, f: areaCom(lo) };
  for (let k = 1; k <= N; k++) {
    const t = lo + ((hi - lo) * k) / N;
    const f = areaCom(t);
    if (Number.isFinite(ant.f) && Number.isFinite(f) && (ant.f === 0 || (ant.f < 0) !== (f < 0))) {
      let x0 = ant.t, x1 = t, f0 = ant.f;
      for (let i = 0; i < 26; i++) {
        const m = (x0 + x1) / 2, fm = areaCom(m);
        if (!Number.isFinite(fm)) break;
        if ((fm < 0) === (f0 < 0)) { x0 = m; f0 = fm; } else x1 = m;
      }
      const tFinal = (x0 + x1) / 2;
      const final = areaCom(tFinal);
      if (Number.isFinite(final) && Math.abs(final) <= 0.005) return { ok: true, linhas: comLinha(tFinal), linhaId: id };
      return { ok: false, motivo: `Não consegui chegar a ${haBr(desejadaHa)} ha deslizando a linha.` };
    }
    ant = { t, f };
  }
  return { ok: false, motivo: `Não dá para chegar a ${haBr(desejadaHa)} ha deslizando esta linha: tente outra linha ou outro valor.` };
}

// --- encaixe -----------------------------------------------------------------------------------------------------------------------
export interface AlvosDeEncaixe {
  pontos: { p: Ponto; de: string | null }[];
  segmentos: { a: Ponto; b: Ponto; de: string | null }[];
}

const aneisDaGeometria = (geo: GeoJSON.Geometry): number[][][] =>
  (geo.type === 'Polygon' ? geo.coordinates : geo.type === 'MultiPolygon' ? geo.coordinates.flat() : []);

/** Tudo em que o operador encaixa: cantos e bordas do pasto e das áreas internas, pontos e trechos das linhas, pontos dos polígonos vizinhos. */
export function alvosDeEncaixe(g: GeoJSON.Polygon, linhas: readonly LinhaDeCorte[], internas: readonly Pick<AreaInterna, 'geojson'>[],
  vizinhos: readonly GeoJSON.Geometry[] = []): AlvosDeEncaixe {
  const pontos: AlvosDeEncaixe['pontos'] = [];
  const segmentos: AlvosDeEncaixe['segmentos'] = [];
  const doAnel = (anel: readonly (readonly number[])[], de: string | null, soPontos: boolean) => {
    anel.forEach((q, i) => {
      pontos.push({ p: [q[0], q[1]], de });
      if (!soPontos && i + 1 < anel.length) segmentos.push({ a: [q[0], q[1]], b: [anel[i + 1][0], anel[i + 1][1]], de });
    });
  };
  g.coordinates.forEach(anel => doAnel(anel, null, false));
  internas.forEach(a => aneisDaGeometria(a.geojson).forEach(anel => doAnel(anel, null, false)));
  linhas.forEach(l => doAnel(l.pontos, l.id, false));
  vizinhos.forEach(v => aneisDaGeometria(v).forEach(anel => doAnel(anel, null, true)));
  return { pontos, segmentos };
}

/** O encaixe do ponto `p`: primeiro o ponto (canto, ponta, vértice vizinho) a até `tolM`; senão o trecho mais perto. `ignorarDe` = a linha em edição. */
export function encaixar(p: Ponto, alvos: AlvosDeEncaixe, tolM: number, ignorarDe: string | null = null): { ponto: Ponto; tipo: 'ponto' | 'trecho' } | null {
  const kx = 111320 * Math.cos(rad(p[1])), ky = 110540;
  const m = (q: readonly number[]): P2 => [(q[0] - p[0]) * kx, (q[1] - p[1]) * ky];
  let ponto: { p: Ponto; dist: number } | null = null;
  for (const a of alvos.pontos) {
    if (ignorarDe && a.de === ignorarDe) continue;
    const dist = Math.hypot(...m(a.p));
    if (dist <= tolM && (!ponto || dist < ponto.dist)) ponto = { p: a.p, dist };
  }
  if (ponto) return { ponto: ponto.p, tipo: 'ponto' };
  let trecho: { p: Ponto; dist: number } | null = null;
  for (const s of alvos.segmentos) {
    if (ignorarDe && s.de === ignorarDe) continue;
    const r = maisPerto([0, 0], m(s.a), m(s.b));
    if (r.dist <= tolM && (!trecho || r.dist < trecho.dist)) trecho = { p: [s.a[0] + r.k * (s.b[0] - s.a[0]), s.a[1] + r.k * (s.b[1] - s.a[1])], dist: r.dist };
  }
  return trecho ? { ponto: trecho.p, tipo: 'trecho' } : null;
}

// --- a régua -----------------------------------------------------------------------------------------------------------------------
export interface SegmentoDaRegua { p: Ponto; q: Ponto }

/** Os pontos onde o segmento a→b é cortado por `outros` (cruzamento de fato, ou ponta de outro em cima dele), em ordem ao longo de a→b. */
function cortesNoSegmento(a: P2, b: P2, outros: readonly Obst[]): { t: number; p: P2 }[] {
  const len = d2(a, b);
  const achados: { t: number; p: P2 }[] = [];
  for (const o of outros) {
    const x = cruza(a, b, o.a, o.b);
    if (x && x.t > 0 && x.t < 1 && x.u >= -1e-9 && x.u <= 1 + 1e-9) achados.push({ t: x.t, p: [a[0] + x.t * (b[0] - a[0]), a[1] + x.t * (b[1] - a[1])] });
    for (const e of [o.a, o.b]) {
      const r = maisPerto(e, a, b);
      if (r.dist <= TOL_M && r.k > 0 && r.k < 1 && len * Math.min(r.k, 1 - r.k) > TOL_M) achados.push({ t: r.k, p: r.q });
    }
  }
  achados.sort((x, y) => x.t - y.t);
  return achados.filter((c, i) => i === 0 || (c.t - achados[i - 1].t) * len > 0.05);
}

const chaveDoSegmento = (p: readonly number[], q: readonly number[]) => {
  const k = (x: readonly number[]) => `${Math.round(x[0] * 1e6)},${Math.round(x[1] * 1e6)}`;
  const [u, v] = [k(p), k(q)].sort();
  return `${u}|${v}`;
};

/** Tira os segmentos repetidos (o mesmo lado visto de duas divisões, ou duas linhas por cima uma da outra). */
export function deduplicarSegmentos(segs: readonly SegmentoDaRegua[]): SegmentoDaRegua[] {
  const vistos = new Set<string>();
  return segs.filter(s => {
    const k = chaveDoSegmento(s.p, s.q);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/** Os lados da régua SEM repetir o lado comum: os lados do contorno (pasto e áreas internas) partidos onde as linhas encostam, e os trechos
 *  de cada linha entre cruzamentos (só o que fica no pasto, fora da praça e do corredor). */
export function segmentosDaRegua(g: GeoJSON.Polygon, linhas: readonly LinhaDeCorte[], internas: readonly Pick<AreaInterna, 'geojson'>[] = []): SegmentoDaRegua[] {
  const cena = cenaDe(g, internas);
  const lp = resolverNoPlano(linhas.map(l => noPlano(l, cena.plano)), cena);
  const borda = cena.aneis.flatMap(segsDoAnel);
  const daLinha = lp.flatMap(segsDaLinha);
  const saida: { a: P2; b: P2 }[] = [];
  const parte = (s: Obst, outros: readonly Obst[], soDentro: boolean) => {
    const cortes = cortesNoSegmento(s.a, s.b, outros);
    const pts = [s.a, ...cortes.map(c => c.p), s.b];
    for (let i = 0; i + 1 < pts.length; i++) {
      const meio: P2 = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
      if (!soDentro || dentroDe(meio, cena.trabalho)) saida.push({ a: pts[i], b: pts[i + 1] });
    }
  };
  borda.forEach(s => parte(s, daLinha, false));
  lp.forEach((pts, i) => {
    const outras = [...borda, ...lp.flatMap((l, j) => (j === i ? [] : segsDaLinha(l)))];
    segsDaLinha(pts).forEach(s => parte(s, outras, true));
  });
  return deduplicarSegmentos(saida.map(s => ({ p: doPlano(cena.plano, s.a), q: doPlano(cena.plano, s.b) })));
}

/** A linha `linhaId`: o comprimento total e o de cada trecho entre os cruzamentos com as outras linhas e a borda (só o que fica no pasto). */
export function trechosDaLinha(g: GeoJSON.Polygon, linhas: readonly LinhaDeCorte[], internas: readonly Pick<AreaInterna, 'geojson'>[], linhaId: string): { totalM: number; trechosM: number[] } | null {
  const cena = cenaDe(g, internas);
  const k = linhas.findIndex(l => l.id === linhaId);
  if (k < 0) return null;
  const lp = resolverNoPlano(linhas.map(l => noPlano(l, cena.plano)), cena);
  const pts = lp[k];
  const outros = obstaculos(cena, lp, k);
  const caminho = (de: P2[]) => de.slice(1).reduce((s, q, i) => s + distanciaM(doPlano(cena.plano, de[i]), doPlano(cena.plano, q)), 0);
  const trechos: number[] = [];
  let atual: P2[] = [pts[0]];
  const fecha = (fim: P2, anexar = true) => {
    // MAPA-CRIAR-PIQUETES-01 fatia 2a: no último trecho `atual` já termina na ponta da linha (antes o ponto entrava duas vezes e o trecho sumia)
    const sub = anexar ? [...atual, fim] : atual;
    const meio = sub[Math.floor(sub.length / 2)];
    const a = sub[Math.floor((sub.length - 1) / 2)];
    const ponto: P2 = sub.length % 2 === 0 ? [(a[0] + meio[0]) / 2, (a[1] + meio[1]) / 2] : meio;
    if (dentroDe(ponto, cena.trabalho)) trechos.push(caminho(sub));
    atual = [fim];
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    cortesNoSegmento(pts[i], pts[i + 1], outros).forEach(c => fecha(c.p));
    atual.push(pts[i + 1]);
  }
  if (atual.length > 1) fecha(pts[pts.length - 1], false);
  return { totalM: caminho(pts), trechosM: trechos };
}

/** "Linha 3: 645 m · trechos 167 · 133 · 345 m" (fatia 2a: o `rotulo` troca para "Cerca" nas cercas da praça) */
export function fraseDaLinha(numero: number, totalM: number, trechosM: readonly number[], rotulo = 'Linha'): string {
  const n = (m: number) => Math.round(m).toLocaleString('pt-BR');
  return trechosM.length > 1 ? `${rotulo} ${numero}: ${textoM(totalM)} · trechos ${trechosM.map(n).join(' · ')} m` : `${rotulo} ${numero}: ${textoM(totalM)}`;
}

/** A régua livre: o parcial de cada trecho e o total (nada se grava). */
export function reguaLivre(pontos: readonly Ponto[]): { parciaisM: number[]; totalM: number } {
  const parciaisM = pontos.slice(1).map((q, i) => distanciaM(pontos[i], q));
  return { parciaisM, totalM: parciaisM.reduce((s, x) => s + x, 0) };
}

// --- áreas internas: praça e corredor ----------------------------------------------------------------------------------------------
const fechaAnel = (anel: readonly Ponto[]): Ponto[] => {
  const a = anel.map(p => [p[0], p[1]] as Ponto);
  if (a.length && (a[0][0] !== a[a.length - 1][0] || a[0][1] !== a[a.length - 1][1])) a.push([a[0][0], a[0][1]]);
  return a;
};

/** A praça por pontos (3 ou mais). */
export function novaPraca(id: string, nome: string, anel: readonly Ponto[]): AreaInterna | null {
  if (anel.length < 3) return null;
  return { id, tipo: 'praca', nome, geojson: { type: 'Polygon', coordinates: [fechaAnel(anel)] } };
}

/** O círculo da praça: o centro e o raio em metros, aproximado por `lados` lados (48). */
export function circuloEmPoligono(centro: Ponto, raioM: number, lados = 48): Ponto[] {
  const kx = 111320 * Math.cos(rad(centro[1])), ky = 110540;
  return Array.from({ length: lados }, (_x, i) => {
    const a = (2 * Math.PI * i) / lados;
    return [centro[0] + (raioM * Math.cos(a)) / kx, centro[1] + (raioM * Math.sin(a)) / ky] as Ponto;
  });
}
export function novaPracaRedonda(id: string, nome: string, centro: Ponto, raioM: number): AreaInterna | null {
  return raioM > 0 ? novaPraca(id, nome, circuloEmPoligono(centro, raioM)) : null;
}

/** O corredor: a faixa de `larguraM` ao redor do eixo (pontas retas; nas dobras, a junção simples, sem buraco). */
export function corredorDoEixo(eixo: readonly Ponto[], larguraM: number): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (eixo.length < 2 || !(larguraM > 0)) return null;
  const ref = eixo[0];
  const kx = 111320 * Math.cos(rad(ref[1])), ky = 110540;
  const pl: P2[] = eixo.map(p => [(p[0] - ref[0]) * kx, (p[1] - ref[1]) * ky]);
  const h = larguraM / 2;
  const partes: Poli2[] = [];
  const normais: P2[] = [];
  for (let i = 0; i + 1 < pl.length; i++) {
    const a = pl[i], b = pl[i + 1];
    const len = d2(a, b);
    if (len < 1e-9) { normais.push([0, 0]); continue; }
    const n: P2 = [(-(b[1] - a[1]) / len) * h, ((b[0] - a[0]) / len) * h];
    normais.push(n);
    partes.push([[[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]], [a[0] + n[0], a[1] + n[1]]]]);
  }
  for (let i = 1; i + 1 < pl.length; i++) {
    const v = pl[i], n1 = normais[i - 1], n2 = normais[i];
    for (const s of [1, -1]) {
      partes.push([[[v[0], v[1]], [v[0] + s * n1[0], v[1] + s * n1[1]], [v[0] + s * n2[0], v[1] + s * n2[1]], [v[0], v[1]]]]);
    }
  }
  if (!partes.length) return null;
  const unida = union(partes[0], ...partes.slice(1));
  const graus = unida.filter(p => p.length && p[0].length >= 4).map(p => p.map(anel => anel.map(q => [ref[0] + q[0] / kx, ref[1] + q[1] / ky])));
  if (!graus.length) return null;
  return graus.length === 1 ? { type: 'Polygon', coordinates: graus[0] } : { type: 'MultiPolygon', coordinates: graus };
}

export function novoCorredor(id: string, nome: string, eixo: readonly Ponto[], larguraM: number): AreaInterna | null {
  const geojson = corredorDoEixo(eixo, larguraM);
  return geojson ? { id, tipo: 'corredor', nome, geojson, eixo: eixo.map(p => [p[0], p[1]] as Ponto), larguraM } : null;
}

/** Os pontos que a área deixa mexer: os vértices da praça (sem repetir o fecho) ou os do eixo do corredor. */
export function pontosDaArea(a: AreaInterna): Ponto[] {
  if (a.tipo === 'corredor') return a.eixo ?? [];
  const anel = a.geojson.type === 'Polygon' ? a.geojson.coordinates[0] : a.geojson.coordinates[0][0];
  return anel.slice(0, -1).map(p => [p[0], p[1]] as Ponto);
}
function refeita(a: AreaInterna, pontos: readonly Ponto[], larguraM: number | undefined): AreaInterna | null {
  if (a.tipo === 'corredor') return novoCorredor(a.id, a.nome, pontos, larguraM ?? a.larguraM ?? 6);
  return novaPraca(a.id, a.nome, pontos);
}
export const areaComPontoMovido = (a: AreaInterna, i: number, p: Ponto): AreaInterna =>
  refeita(a, pontosDaArea(a).map((q, k) => (k === i ? p : q)), undefined) ?? a;
export const areaSemPonto = (a: AreaInterna, i: number): AreaInterna | null => {
  const pts = pontosDaArea(a);
  if (pts.length <= (a.tipo === 'corredor' ? 2 : 3)) return null;
  return refeita(a, pts.filter((_q, k) => k !== i), undefined);
};
export const areaComLargura = (a: AreaInterna, larguraM: number): AreaInterna => (a.tipo === 'corredor' ? refeita(a, pontosDaArea(a), larguraM) ?? a : a);
export const areaComPontoNovo = (a: AreaInterna, p: Ponto): AreaInterna => {
  const pts = pontosDaArea(a);
  const anel = a.tipo === 'corredor' ? pts : [...pts, pts[0]];
  let melhor = { i: 0, dist: Infinity, q: p };
  anel.slice(0, -1).forEach((x, i) => {
    const r = maisPerto(p, x, anel[i + 1]);
    if (r.dist < melhor.dist) melhor = { i, dist: r.dist, q: [r.q[0], r.q[1]] };
  });
  return refeita(a, [...pts.slice(0, melhor.i + 1), melhor.q, ...pts.slice(melhor.i + 1)], undefined) ?? a;
};

export const areaDaAreaHa = (a: AreaInterna) => areaDoBancoHa(a.geojson);

export const NOME_DA_PRACA = 'Praça de alimentação';
export const NOME_DO_CORREDOR = 'Corredor';

/** O que vai ao banco em `p_areas` (MAPA-CRIAR-PIQUETES-01 fatia 2a, P3): a praça é `benfeitoria` ("Praça de alimentação"), o corredor é
 *  `estrada` ("Corredor"); a RPC recebe `[{ nome, tipo, geojson }]`. */
export interface AreaParaGravar { nome: string; tipo: 'benfeitoria' | 'estrada'; geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon }
export function areasParaGravar(areas: readonly AreaInterna[]): AreaParaGravar[] {
  return areas.map((a): AreaParaGravar => (a.tipo === 'corredor'
    ? { nome: NOME_DO_CORREDOR, tipo: 'estrada', geojson: a.geojson }
    : { nome: NOME_DA_PRACA, tipo: 'benfeitoria', geojson: a.geojson }));
}

/** O que vai em `p_infra`: o cocho, um PONTO no centro da praça. */
export interface InfraParaGravar { tipo: 'cocho'; nome: string; ponto: Ponto }
export function infraParaGravar(centroDaPraca: Ponto | null, cocho: boolean): InfraParaGravar[] {
  return centroDaPraca && cocho ? [{ tipo: 'cocho', nome: 'Cocho', ponto: [centroDaPraca[0], centroDaPraca[1]] }] : [];
}

/** Os lados das áreas internas (praça e corredor) para a régua. */
export function ladosDasAreas(areas: readonly AreaInterna[]): SegmentoDaRegua[] {
  const segs: SegmentoDaRegua[] = [];
  for (const a of areas) {
    for (const anel of aneisDaGeometria(a.geojson)) {
      anel.slice(0, -1).forEach((p, i) => segs.push({ p: [p[0], p[1]], q: [anel[i + 1][0], anel[i + 1][1]] }));
    }
  }
  return deduplicarSegmentos(segs);
}
