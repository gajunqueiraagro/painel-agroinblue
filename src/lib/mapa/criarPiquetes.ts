/**
 * MAPA-CRIAR-PIQUETES-01 (fatia 1, Gabriel 01/11/2026) — a conta do "Criar piquetes": cortar o polígono de um pasto em N partes iguais
 * (uma fila) ou numa grade L × C, com as linhas PARALELAS ao lado mais longo (as da fila) e perpendiculares a ele (as de cada faixa).
 *   - A área é a do BANCO (D4): `areaDoBancoHa` é o espelho da `_fn_area_geodesica_ha` (raio 6.378.137 m, anel externo menos os furos).
 *   - O FURO (a manga, o redondel) é respeitado: cada corte é a interseção (polyclip) com o polígono INTEIRO, anéis internos incluídos;
 *     a divisão que contém o furo o leva como anel interno e a área dela é sem ele.
 *   - Áreas iguais por BISSEÇÃO no deslocamento da linha (no plano local em metros; a área mostrada é a do banco).
 *   - "Área desejada" numa divisão: a linha dela se ajusta e as outras da mesma faixa dividem o resto em partes iguais.
 *   - As alças: cada linha desliza paralela a si mesma, presa entre as vizinhas.
 * Puro: nada de mapa nem de banco aqui.
 */
import { intersection } from 'polyclip-ts';

type P = [number, number];
type Anel = P[];
type Poli = Anel[];

// --- a área do banco ---------------------------------------------------------------------------------------------------------------
const RAIO_DO_BANCO_M = 6378137;
const rad = (g: number) => (g * Math.PI) / 180;

/** Espelho do anel da `_fn_area_geodesica_ha` (m², sem sinal). O anel vem fechado (último = primeiro). */
function areaDoAnelBancoM2(anel: readonly (readonly number[])[]): number {
  const n = anel.length - 1;
  if (n <= 2) return 0;
  let t = 0;
  for (let i = 0; i < n; i++) {
    const lo = anel[i];
    const mi = anel[i + 1 === n ? 0 : i + 1];
    const up = anel[i + 2 >= n ? (i + 2) % n : i + 2];
    t += (rad(up[0]) - rad(lo[0])) * Math.sin(rad(mi[1]));
  }
  return Math.abs((t * RAIO_DO_BANCO_M * RAIO_DO_BANCO_M) / 2);
}

const fechado = (anel: readonly (readonly number[])[]): number[][] => {
  const a = anel.map(p => [p[0], p[1]]);
  if (a.length && (a[0][0] !== a[a.length - 1][0] || a[0][1] !== a[a.length - 1][1])) a.push([a[0][0], a[0][1]]);
  return a;
};

/** A área do banco em hectares (sem arredondar): o anel externo menos os furos; MultiPolygon soma as partes. */
export function areaDoBancoHa(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  const doPoligono = (aneis: readonly (readonly (readonly number[])[])[]) =>
    aneis.reduce((s, anel, i) => s + (i === 0 ? 1 : -1) * areaDoAnelBancoM2(fechado(anel)), 0);
  const m2 = g.type === 'Polygon' ? doPoligono(g.coordinates) : g.coordinates.reduce((s, p) => s + doPoligono(p), 0);
  return m2 / 10000;
}

/** Como o banco grava: 2 casas. */
export const haDoBanco = (ha: number) => Math.round(ha * 100) / 100;

// --- o plano local (metros) --------------------------------------------------------------------------------------------------------
interface Plano { lon0: number; lat0: number; kx: number; ky: number }
const paraPlano = (pl: Plano, p: readonly number[]): P => [(p[0] - pl.lon0) * pl.kx, (p[1] - pl.lat0) * pl.ky];
const doPlano = (pl: Plano, q: readonly number[]): P => [q[0] / pl.kx + pl.lon0, q[1] / pl.ky + pl.lat0];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1];

function areaPlanaM2(partes: Poli[]): number {
  let s = 0;
  for (const poli of partes) {
    poli.forEach((anel, i) => {
      let a = 0;
      for (let k = 0; k < anel.length - 1; k++) a += anel[k][0] * anel[k + 1][1] - anel[k + 1][0] * anel[k][1];
      s += (i === 0 ? 1 : -1) * Math.abs(a / 2);
    });
  }
  return s;
}

/** O polígono preparado para cortar: o plano, os eixos (d = ao longo do lado mais longo, n = perpendicular) e as extensões. */
export interface Montagem {
  plano: Plano;
  d: P; n: P;
  poli: Poli;
  uMin: number; uMax: number; sMin: number; sMax: number;
  totalHa: number;
}

export function montar(g: GeoJSON.Polygon, girado = false): Montagem {
  const externo = g.coordinates[0];
  const lons = externo.map(p => p[0]), lats = externo.map(p => p[1]);
  const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2, lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const plano: Plano = { lon0, lat0, kx: 111320 * Math.cos(rad(lat0)), ky: 110540 };
  const poli: Poli = g.coordinates.map(anel => fechado(anel).map(p => paraPlano(plano, p)));
  // o lado mais longo do anel externo dá a direção das linhas da fila
  let melhor = 0; let d: P = [1, 0];
  const ext = poli[0];
  for (let i = 0; i < ext.length - 1; i++) {
    const dx = ext[i + 1][0] - ext[i][0], dy = ext[i + 1][1] - ext[i][1];
    const len = Math.hypot(dx, dy);
    if (len > melhor) { melhor = len; d = [dx / len, dy / len]; }
  }
  if (girado) d = [-d[1], d[0]];
  const n: P = [-d[1], d[0]];
  const us = ext.map(p => dot(p, n)), ss = ext.map(p => dot(p, d));
  return { plano, d, n, poli, uMin: Math.min(...us), uMax: Math.max(...us), sMin: Math.min(...ss), sMax: Math.max(...ss), totalHa: areaDoBancoHa(g) };
}

/** O retângulo do plano entre u0..u1 (ao longo de n) e s0..s1 (ao longo de d); null = sem limite daquele lado. */
function faixa(m: Montagem, u0: number | null, u1: number | null, s0: number | null, s1: number | null): Poli {
  const folga = (m.uMax - m.uMin + m.sMax - m.sMin) * 2 + 10;
  const ua = u0 ?? m.uMin - folga, ub = u1 ?? m.uMax + folga, sa = s0 ?? m.sMin - folga, sb = s1 ?? m.sMax + folga;
  const pt = (s: number, u: number): P => [m.d[0] * s + m.n[0] * u, m.d[1] * s + m.n[1] * u];
  return [[pt(sa, ua), pt(sb, ua), pt(sb, ub), pt(sa, ub), pt(sa, ua)]];
}

const recorte = (a: Poli | Poli[], b: Poli): Poli[] => intersection(a, b);

// --- os cortes ---------------------------------------------------------------------------------------------------------------------
/** As linhas: `linhas` = as posições (u) entre as faixas da fila; `colunas[r]` = as posições (s) entre as divisões da faixa r. */
export interface Cortes { linhas: number[]; colunas: number[][] }

function bissecao(f: (x: number) => number, alvo: number, a: number, b: number): number {
  let lo = a, hi = b;
  for (let i = 0; i < 40; i++) {
    const meio = (lo + hi) / 2;
    if (f(meio) < alvo) lo = meio; else hi = meio;
  }
  return (lo + hi) / 2;
}

const iguais = (k: number) => Array.from({ length: k }, () => 1 / k);

/** As posições dos cortes da faixa `r` para as frações dadas (somam 1), por bisseção na área da própria faixa. */
function colunasDaFaixa(m: Montagem, cortesU: number[], r: number, fracoes: readonly number[]): number[] {
  const u0 = r === 0 ? null : cortesU[r - 1], u1 = r === cortesU.length ? null : cortesU[r];
  const tira = recorte(m.poli, faixa(m, u0, u1, null, null));
  const total = areaPlanaM2(tira);
  const saida: number[] = [];
  let acumulado = 0;
  for (let k = 0; k < fracoes.length - 1; k++) {
    acumulado += fracoes[k];
    saida.push(bissecao(s => areaPlanaM2(recorte(tira, faixa(m, null, null, null, s))), acumulado * total, m.sMin, m.sMax));
  }
  return saida;
}

/** Os cortes de uma grade L × C (N iguais = 1 × N) com áreas iguais. */
export function cortesIguais(m: Montagem, linhas: number, colunas: number): Cortes {
  const total = areaPlanaM2([m.poli]);
  const cortesU: number[] = [];
  let acumulado = 0;
  for (let k = 0; k < linhas - 1; k++) {
    acumulado += 1 / linhas;
    cortesU.push(bissecao(u => areaPlanaM2(recorte(m.poli, faixa(m, null, u, null, null))), acumulado * total, m.uMin, m.uMax));
  }
  return { linhas: cortesU, colunas: Array.from({ length: linhas }, (_x, r) => colunasDaFaixa(m, cortesU, r, iguais(colunas))) };
}

// --- as divisões -------------------------------------------------------------------------------------------------------------------
export interface Divisao {
  linha: number; coluna: number;
  /** null = a divisão ficou vazia (uma linha passou da outra) */
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  areaHa: number;
  /** quantas partes separadas (o polígono côncavo pode dar 2): só 1 grava */
  partes: number;
}

export function divisoesDosCortes(m: Montagem, c: Cortes): Divisao[] {
  const saida: Divisao[] = [];
  const nl = c.linhas.length + 1;
  for (let r = 0; r < nl; r++) {
    const u0 = r === 0 ? null : c.linhas[r - 1], u1 = r === nl - 1 ? null : c.linhas[r];
    const cs = c.colunas[r] ?? [];
    for (let k = 0; k <= cs.length; k++) {
      const s0 = k === 0 ? null : cs[k - 1], s1 = k === cs.length ? null : cs[k];
      const partes = recorte(m.poli, faixa(m, u0, u1, s0, s1)).filter(p => p.length && p[0].length >= 4);
      const emGraus = partes.map(p => p.map(anel => anel.map(q => doPlano(m.plano, q))));
      const geojson: Divisao['geojson'] = emGraus.length === 0 ? null
        : emGraus.length === 1 ? { type: 'Polygon', coordinates: emGraus[0] } : { type: 'MultiPolygon', coordinates: emGraus };
      saida.push({ linha: r, coluna: k, geojson, areaHa: geojson ? areaDoBancoHa(geojson) : 0, partes: emGraus.length });
    }
  }
  return saida;
}

// --- área desejada e alças ---------------------------------------------------------------------------------------------------------
export type ResultadoDaConta = { ok: true; cortes: Cortes } | { ok: false; motivo: string };

/** "Área desejada" na divisão (linha, coluna): a faixa dela se refaz — esta com a área pedida, as outras da faixa com partes iguais do resto. */
export function comAreaDesejada(m: Montagem, c: Cortes, linha: number, coluna: number, desejadaHa: number): ResultadoDaConta {
  const daFaixa = divisoesDosCortes(m, c).filter(d => d.linha === linha);
  const faixaHa = daFaixa.reduce((s, d) => s + d.areaHa, 0);
  const n = daFaixa.length;
  if (n < 2) return { ok: false, motivo: 'Esta faixa tem uma divisão só: mude a grade para pedir a área.' };
  if (!(desejadaHa > 0) || desejadaHa >= faixaHa - 0.01 * (n - 1)) {
    return { ok: false, motivo: `A área pedida precisa ficar abaixo de ${haDoBanco(faixaHa).toFixed(2).replace('.', ',')} ha (a faixa inteira).` };
  }
  const resto = (1 - desejadaHa / faixaHa) / (n - 1);
  const fracoes = daFaixa.map(d => (d.coluna === coluna ? desejadaHa / faixaHa : resto));
  const colunas = c.colunas.map((cs, r) => (r === linha ? colunasDaFaixa(m, c.linhas, r, fracoes) : cs));
  return { ok: true, cortes: { linhas: c.linhas, colunas } };
}

/** Onde fica a alça de cada linha (no meio dela) e o que ela move. */
export interface Alca { tipo: 'linha' | 'coluna'; linha: number; indice: number; ponto: [number, number] }

export function alcasDosCortes(m: Montagem, c: Cortes): Alca[] {
  const pt = (s: number, u: number) => doPlano(m.plano, [m.d[0] * s + m.n[0] * u, m.d[1] * s + m.n[1] * u]);
  const sMeio = (m.sMin + m.sMax) / 2;
  const saida: Alca[] = c.linhas.map((u, i) => ({ tipo: 'linha', linha: i, indice: i, ponto: pt(sMeio, u) }));
  const nl = c.linhas.length + 1;
  for (let r = 0; r < nl; r++) {
    const u0 = r === 0 ? m.uMin : c.linhas[r - 1], u1 = r === nl - 1 ? m.uMax : c.linhas[r];
    (c.colunas[r] ?? []).forEach((s, i) => saida.push({ tipo: 'coluna', linha: r, indice: i, ponto: pt(s, (u0 + u1) / 2) }));
  }
  return saida;
}

/** A alça arrastada até `p` ([lng, lat]): a linha desliza paralela, presa entre as vizinhas (com 1 m de folga). */
export function moverAlca(m: Montagem, c: Cortes, a: Pick<Alca, 'tipo' | 'linha' | 'indice'>, p: readonly number[]): Cortes {
  const q = paraPlano(m.plano, p);
  const folga = 1;
  if (a.tipo === 'linha') {
    const lo = a.indice === 0 ? m.uMin : c.linhas[a.indice - 1], hi = a.indice === c.linhas.length - 1 ? m.uMax : c.linhas[a.indice + 1];
    const u = Math.min(hi - folga, Math.max(lo + folga, dot(q, m.n)));
    return { linhas: c.linhas.map((x, i) => (i === a.indice ? u : x)), colunas: c.colunas };
  }
  const cs = c.colunas[a.linha];
  const lo = a.indice === 0 ? m.sMin : cs[a.indice - 1], hi = a.indice === cs.length - 1 ? m.sMax : cs[a.indice + 1];
  const s = Math.min(hi - folga, Math.max(lo + folga, dot(q, m.d)));
  return { linhas: c.linhas, colunas: c.colunas.map((x, r) => (r === a.linha ? x.map((y, i) => (i === a.indice ? s : y)) : x)) };
}

// --- os nomes ----------------------------------------------------------------------------------------------------------------------
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** O nome sugerido da divisão i: "<pasto>-A", "<pasto>-B"… (depois de Z: "-AA"…). */
export function nomeSugerido(pai: string, i: number): string {
  const letra = i < 26 ? LETRAS[i] : `${LETRAS[Math.floor(i / 26) - 1]}${LETRAS[i % 26]}`;
  return `${pai}-${letra}`;
}

/** Para o grupo que já existe: os membros sem desenho na ordem em que melhor casam com o nome da divisão (o mesmo nome primeiro — sem
 *  acento, caixa nem pontuação —, depois o que termina com a mesma letra, depois a ordem alfabética). */
export function membrosPorParecenca<T extends { nome: string }>(nomeDaDivisao: string, membros: readonly T[]): T[] {
  const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const alvo = chave(nomeDaDivisao);
  const nota = (m: T) => { const k = chave(m.nome); return k === alvo ? 0 : k.slice(-1) === alvo.slice(-1) ? 1 : 2; };
  return [...membros].sort((a, b) => nota(a) - nota(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
