/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a (Gabriel 02/11/2026, mock-praca-central-v1) — a conta pura do "Praça central": o desenho típico dos módulos
 * é uma CRUZ/RADIAL com uma praça de alimentação no centro, 4 (às vezes 6 ou 8) piquetes que se encontram nela.
 *   - A praça é um POLÍGONO REGULAR com um vértice por divisão (4 → losango, 6 → hexágono, 8 → octógono), de tamanho pela DIAGONAL (ou pelo
 *     lado); círculo (48 lados) por raio; ou desenhado ponto a ponto. Ela sai de todas as divisões (área interna do `linhasDosPiquetes`).
 *   - Cada CERCA liga um vértice da praça à borda do pasto. A sugestão sai RADIAL do vértice (na cruz de 4, paralela ao lado de referência).
 *     Girar a cerca (pela ponta da borda) move o vértice dela na praça; arrastar um vértice leva a cerca; ponto no meio = cerca quebrada.
 *   - Cerca mexida à mão fica FIXA (cadeado); "Igualar áreas" gira só as não fixas, por bisseção no ângulo, com a área do banco.
 * Puro: nada de mapa nem de banco aqui.
 */
import { areaDoBancoHa, doPlano, paraPlano, type Plano } from '@/lib/mapa/criarPiquetes';
import { distanciaM, type Ponto } from '@/lib/mapa/edicaoDoPoligono';
import {
  bordaNoRaio, deslizarParalela, divisoesDasLinhas, novaPraca, NOME_DA_PRACA, planoDoPasto, pontoDentro, pontoInterior, projetarNaBorda,
  type AreaInterna, type LinhaDeCorte,
} from '@/lib/mapa/linhasDosPiquetes';

export type FormatoDaPraca = 'regular' | 'circulo' | 'livre';
export type MedidaDaPraca = { tipo: 'diagonal' | 'lado' | 'raio'; metros: number };
export interface Cerca { id: string; vertice: number; pontos: Ponto[]; fixa: boolean }
export interface PracaCentral { formato: FormatoDaPraca; centro: Ponto; vertices: Ponto[]; cercas: Cerca[] }
/** O que mais corta o pasto e entra na conta das áreas (as linhas riscadas e o corredor). */
export interface ContextoDasCercas { linhas: readonly LinhaDeCorte[]; internas: readonly AreaInterna[] }

export const LADOS_DO_CIRCULO = 48;
export const DIAGONAL_PADRAO_M = 60;
const DOIS_PI = 2 * Math.PI;
const norm = (a: number) => ((a % DOIS_PI) + DOIS_PI) % DOIS_PI;

type P2 = [number, number];
const noPlano = (pl: Plano, p: readonly number[]): P2 => paraPlano(pl, p);
const emGraus = (pl: Plano, q: readonly number[]): Ponto => doPlano(pl, q);
const dist2 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Um ponto a `r` metros DO PLANO de `c`, no ângulo `ang` (só para achar pontos de referência). */
const pontoNoRaio = (pl: Plano, c: P2, r: number, ang: number): Ponto => emGraus(pl, [c[0] + r * Math.cos(ang), c[1] + r * Math.sin(ang)]);

/* Os metros da praça são os do MAPA (a mesma esfera do `distanciaM`, que escreve os lados): o plano local tem escala própria (ky 110540), e
   uma praça de "60 m" sairia com 60,4 m lida na régua. O ângulo continua o do plano (a cruz fica paralela ao lado do pasto). */
const M_POR_GRAU = 111195;
const radGraus = (g: number) => (g * Math.PI) / 180;
function noRaioReal(pl: Plano, centro: Ponto, rReal: number, ang: number): Ponto {
  const escala = M_POR_GRAU * Math.hypot((Math.cos(ang) / pl.kx) * Math.cos(radGraus(centro[1])), Math.sin(ang) / pl.ky);
  const c = noPlano(pl, centro);
  const rp = rReal / escala;
  return emGraus(pl, [c[0] + rp * Math.cos(ang), c[1] + rp * Math.sin(ang)]);
}
const anguloDe = (pl: Plano, de: Ponto, para: readonly number[]): number => {
  const a = noPlano(pl, de), b = noPlano(pl, para);
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
};

// --- o pasto -----------------------------------------------------------------------------------------------------------------------
/** O lado do anel externo do pasto: os dois pontos. */
export function ladosDoPasto(g: GeoJSON.Polygon): { a: Ponto; b: Ponto }[] {
  const anel = g.coordinates[0];
  return anel.slice(0, -1).map((p, i) => ({ a: [p[0], p[1]], b: [anel[i + 1][0], anel[i + 1][1]] }));
}
/** O lado mais longo do pasto (a referência padrão da cruz). */
export function ladoMaisLongo(g: GeoJSON.Polygon): number {
  const pl = planoDoPasto(g);
  let melhor = { i: 0, len: -1 };
  ladosDoPasto(g).forEach((l, i) => { const len = dist2(noPlano(pl, l.a), noPlano(pl, l.b)); if (len > melhor.len) melhor = { i, len }; });
  return melhor.i;
}
/** O ângulo (rad, no plano local; 0 = leste) do lado `i` do pasto. */
export function anguloDoLado(g: GeoJSON.Polygon, i: number): number {
  const l = ladosDoPasto(g)[i];
  if (!l) return 0;
  const pl = planoDoPasto(g);
  const a = noPlano(pl, l.a), b = noPlano(pl, l.b);
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}
/** O lado do pasto mais perto de `p` (para o clique que troca o lado de referência). */
export function ladoMaisPerto(g: GeoJSON.Polygon, p: readonly number[]): number {
  const pl = planoDoPasto(g);
  const q = noPlano(pl, p);
  let melhor = { i: 0, d: Infinity };
  ladosDoPasto(g).forEach((l, i) => {
    const a = noPlano(pl, l.a), b = noPlano(pl, l.b);
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    const k = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2));
    const d = dist2(q, [a[0] + k * dx, a[1] + k * dy]);
    if (d < melhor.d) melhor = { i, d };
  });
  return melhor.i;
}
/** O centro do pasto: o centroide do anel externo; se cair fora (ou num furo), um ponto interior. */
export function centroideDoPasto(g: GeoJSON.Polygon): Ponto {
  const pl = planoDoPasto(g);
  const anel = g.coordinates[0].map(p => noPlano(pl, p));
  let a2 = 0, cx = 0, cy = 0;
  for (let i = 0; i + 1 < anel.length; i++) {
    const f = anel[i][0] * anel[i + 1][1] - anel[i + 1][0] * anel[i][1];
    a2 += f; cx += (anel[i][0] + anel[i + 1][0]) * f; cy += (anel[i][1] + anel[i + 1][1]) * f;
  }
  const c: Ponto = a2 === 0 ? pontoInterior(g) : emGraus(pl, [cx / (3 * a2), cy / (3 * a2)]);
  return pontoDentro(g, c) ? c : pontoInterior(g);
}

// --- a praça ------------------------------------------------------------------------------------------------------------------------
export function raioDaMedida(n: number, m: MedidaDaPraca): number {
  if (m.tipo === 'diagonal') return m.metros / 2;
  if (m.tipo === 'lado') return m.metros / (2 * Math.sin(Math.PI / n));
  return m.metros;
}

export function centroDe(vertices: readonly Ponto[]): Ponto {
  return [vertices.reduce((s, p) => s + p[0], 0) / vertices.length, vertices.reduce((s, p) => s + p[1], 0) / vertices.length];
}

function cercaRadial(g: GeoJSON.Polygon, pl: Plano, centro: Ponto, vertices: readonly Ponto[], vertice: number, id: string): Cerca {
  const v = vertices[vertice];
  const ang = anguloDe(pl, centro, v);
  const fim = bordaNoRaio(g, v, ang) ?? noRaioReal(pl, v, 10, ang);
  return { id, vertice, pontos: [[v[0], v[1]], fim], fixa: false };
}

export interface OpcoesDaPraca { centro: Ponto; n: number; formato: 'regular' | 'circulo'; medida: MedidaDaPraca; anguloRad: number }

/** A praça nova: regular (um vértice por divisão) ou círculo (48 lados, as cercas saem de `n` vértices igualmente espaçados). */
export function novaPracaCentral(g: GeoJSON.Polygon, o: OpcoesDaPraca): PracaCentral | null {
  const pl = planoDoPasto(g);
  const lados = o.formato === 'circulo' ? LADOS_DO_CIRCULO : o.n;
  const raio = raioDaMedida(lados, o.medida);
  if (!(raio > 0) || o.n < 2) return null;
  const vertices = Array.from({ length: lados }, (_x, k) => noRaioReal(pl, o.centro, raio, o.anguloRad + (DOIS_PI * k) / lados));
  const indices = o.formato === 'circulo' ? Array.from({ length: o.n }, (_x, k) => Math.round((k * LADOS_DO_CIRCULO) / o.n)) : vertices.map((_v, k) => k);
  return { formato: o.formato, centro: [o.centro[0], o.centro[1]], vertices, cercas: indices.map((v, k) => cercaRadial(g, pl, o.centro, vertices, v, `cerca-${k + 1}`)) };
}

/** A praça desenhada ponto a ponto (3 ou mais): uma cerca por vértice. */
export function pracaDesenhada(g: GeoJSON.Polygon, pontos: readonly Ponto[]): PracaCentral | null {
  if (pontos.length < 3) return null;
  const pl = planoDoPasto(g);
  const vertices = pontos.map((p): Ponto => [p[0], p[1]]);
  const centro = centroDe(vertices);
  return { formato: 'livre', centro, vertices, cercas: vertices.map((_v, k) => cercaRadial(g, pl, centro, vertices, k, `cerca-${k + 1}`)) };
}

export function areaDaPraca(p: PracaCentral): AreaInterna {
  return novaPraca('praca', NOME_DA_PRACA, p.vertices) ?? { id: 'praca', tipo: 'praca', nome: NOME_DA_PRACA, geojson: { type: 'Polygon', coordinates: [] } };
}
export const cercasComoLinhas = (p: PracaCentral): LinhaDeCorte[] => p.cercas.map(c => ({ id: c.id, pontos: c.pontos }));

export interface MedidasDaPraca { raioM: number; diagonalM: number; ladoM: number; areaHa: number; ladosM: number[] }
/** As medidas AO VIVO: a diagonal é o dobro do raio médio dos vértices; o lado, o do 1º vértice ao 2º; os lados de verdade, um a um. */
export function medidasDaPraca(g: GeoJSON.Polygon, p: PracaCentral): MedidasDaPraca {
  void g;
  const raioM = p.vertices.reduce((s, v) => s + distanciaM(v, p.centro), 0) / (p.vertices.length || 1);
  const ladosM = p.vertices.map((v, i) => distanciaM(v, p.vertices[(i + 1) % p.vertices.length]));
  return { raioM, diagonalM: 2 * raioM, ladoM: ladosM[0] ?? 0, ladosM, areaHa: areaDoBancoHa(areaDaPraca(p).geojson) };
}

/** PIQUETES-PRACA-CONCAVO-01: as pontas da praça fora do pasto (o mapa as marca) e se caem num FURO do pasto (o centro parece dentro: o
 *  P19A da Pureza tinha um furo de 0,51 ha onde ficava a praça antiga, e o aviso não dizia onde). */
export function pontasForaDaPraca(g: GeoJSON.Polygon, p: PracaCentral): { indices: number[]; noFuro: boolean } {
  const indices = p.vertices.flatMap((v, i) => (pontoDentro(g, v) ? [] : [i]));
  const externo: GeoJSON.Polygon = { type: 'Polygon', coordinates: [g.coordinates[0]] };
  return { indices, noFuro: indices.length > 0 && indices.every(i => pontoDentro(externo, p.vertices[i])) };
}

/** O que impede a praça: ponta fora do pasto (quantas e onde: no furo ou além da borda). */
export function motivoDaPraca(g: GeoJSON.Polygon, p: PracaCentral): string | null {
  const { indices, noFuro } = pontasForaDaPraca(g, p);
  if (!indices.length) return null;
  const n = indices.length;
  const onde = noFuro ? `no furo do pasto` : `além da borda`;
  return `A praça precisa ficar toda dentro do pasto: ${n} ${n === 1 ? 'ponta' : 'pontas'} ${onde} (em vermelho). Arraste o centro ou diminua a diagonal.`;
}

// --- mexer na praça ----------------------------------------------------------------------------------------------------------------
function cercasDe(g: GeoJSON.Polygon, pl: Plano, p: PracaCentral, vertices: readonly Ponto[], centro: Ponto): Cerca[] {
  return p.cercas.map(c => (c.fixa
    ? { ...c, pontos: [[vertices[c.vertice][0], vertices[c.vertice][1]], ...c.pontos.slice(1)] }
    : cercaRadial(g, pl, centro, vertices, c.vertice, c.id)));
}

/** A praça inteira anda: o centro vai para `novo`; as cercas não fixas saem de novo (radiais); as fixas só levam a ponta da praça. */
export function moverCentro(g: GeoJSON.Polygon, p: PracaCentral, novo: Ponto): PracaCentral {
  const pl = planoDoPasto(g);
  const a = noPlano(pl, p.centro), b = noPlano(pl, novo);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const vertices = p.vertices.map(v => { const q = noPlano(pl, v); return emGraus(pl, [q[0] + dx, q[1] + dy]); });
  const centro: Ponto = p.formato === 'livre' ? centroDe(vertices) : [novo[0], novo[1]];
  return { ...p, centro, vertices, cercas: cercasDe(g, pl, p, vertices, centro) };
}

/** O vértice `i` vai para `novo` e a cerca ligada acompanha (e fica fixa: foi mão). */
export function moverVertice(g: GeoJSON.Polygon, p: PracaCentral, i: number, novo: Ponto): PracaCentral {
  if (i < 0 || i >= p.vertices.length) return p;
  const vertices = p.vertices.map((v, k): Ponto => (k === i ? [novo[0], novo[1]] : v));
  void g;
  return {
    ...p, vertices, centro: p.formato === 'livre' ? centroDe(vertices) : p.centro,
    cercas: p.cercas.map(c => (c.vertice === i ? { ...c, pontos: [[novo[0], novo[1]], ...c.pontos.slice(1)], fixa: true } : c)),
  };
}

function nasCoisas(g: GeoJSON.Polygon, p: PracaCentral) {
  const pl = planoDoPasto(g);
  return { pl, c: noPlano(pl, p.centro) };
}

/** Gira a cerca `id` pela ponta da BORDA: a ponta é presa à borda do pasto e o vértice dela na praça vai para o mesmo ângulo, no raio que já tinha. */
export function girarCerca(g: GeoJSON.Polygon, p: PracaCentral, id: string, pBorda: Ponto): PracaCentral {
  const cerca = p.cercas.find(c => c.id === id);
  if (!cerca) return p;
  const { pl } = nasCoisas(g, p);
  const fim = projetarNaBorda(g, [], pBorda);
  const ang = anguloDe(pl, p.centro, fim);
  const v = noRaioReal(pl, p.centro, distanciaM(p.centro, p.vertices[cerca.vertice]), ang);
  return {
    ...p, vertices: p.vertices.map((x, k): Ponto => (k === cerca.vertice ? v : x)), centro: p.formato === 'livre' ? centroDe(p.vertices.map((x, k) => (k === cerca.vertice ? v : x))) : p.centro,
    cercas: p.cercas.map(x => (x.id === id ? { ...x, pontos: [v, ...x.pontos.slice(1, -1), fim], fixa: true } : x)),
  };
}

/** Desliza a cerca inteira paralela a si mesma `desloc` metros; o vértice dela acompanha (a praça muda de forma) e a cerca fica fixa. */
export function deslizarCerca(g: GeoJSON.Polygon, p: PracaCentral, id: string, desloc: number): PracaCentral {
  const cerca = p.cercas.find(c => c.id === id);
  if (!cerca) return p;
  const nova = deslizarParalela(g, [], { id, pontos: cerca.pontos }, desloc);
  return {
    ...p, vertices: p.vertices.map((x, k): Ponto => (k === cerca.vertice ? nova.pontos[0] : x)),
    cercas: p.cercas.map(x => (x.id === id ? { ...x, pontos: nova.pontos, fixa: true } : x)),
  };
}

/** Troca os pontos de uma cerca (mexida à mão: ponto no meio, ponto movido ou tirado): o 1º é o vértice da praça; ela fica fixa. */
export function cercaComPontos(p: PracaCentral, id: string, pontos: Ponto[]): PracaCentral {
  const cerca = p.cercas.find(c => c.id === id);
  if (!cerca) return p;
  return {
    ...p, vertices: p.vertices.map((x, k): Ponto => (k === cerca.vertice ? pontos[0] : x)),
    cercas: p.cercas.map(c => (c.id === id ? { ...c, pontos, fixa: true } : c)),
  };
}

export const comFixa = (p: PracaCentral, id: string, fixa: boolean): PracaCentral => ({ ...p, cercas: p.cercas.map(c => (c.id === id ? { ...c, fixa } : c)) });
export const semCerca = (p: PracaCentral, id: string): PracaCentral => ({ ...p, cercas: p.cercas.filter(c => c.id !== id) });

/** Aumenta ou diminui a praça (escala em volta do centro): as não fixas saem de novo, as fixas só levam a ponta da praça. */
export function comMedida(g: GeoJSON.Polygon, p: PracaCentral, medida: MedidaDaPraca): PracaCentral {
  const { pl } = nasCoisas(g, p);
  const atual = medidasDaPraca(g, p).raioM;
  const alvo = raioDaMedida(p.vertices.length, medida);
  if (!(alvo > 0) || !(atual > 0)) return p;
  const f = alvo / atual;
  const vertices = p.vertices.map(v => noRaioReal(pl, p.centro, distanciaM(p.centro, v) * f, anguloDe(pl, p.centro, v)));
  return { ...p, vertices, cercas: cercasDe(g, pl, p, vertices, p.centro) };
}

/** Reorienta o polígono regular (ou o círculo) para o ângulo `theta` (o 1º vértice cai nele) mantendo o raio médio; as cercas não fixas saem de novo. */
export function comOrientacao(g: GeoJSON.Polygon, p: PracaCentral, theta: number): PracaCentral {
  if (p.formato === 'livre') return p;
  const { pl } = nasCoisas(g, p);
  const raio = medidasDaPraca(g, p).raioM;
  const n = p.vertices.length;
  const vertices = Array.from({ length: n }, (_x, k) => noRaioReal(pl, p.centro, raio, theta + (DOIS_PI * k) / n));
  return { ...p, vertices, cercas: cercasDe(g, pl, p, vertices, p.centro) };
}

/** "Alinhar praça": reorienta o polígono regular pelas cercas — o giro que melhor casa os ângulos delas com os dos vértices (média circular). */
export function alinharPraca(g: GeoJSON.Polygon, p: PracaCentral): PracaCentral {
  if (p.formato === 'livre' || !p.cercas.length) return p;
  const { pl, c } = nasCoisas(g, p);
  const n = p.vertices.length;
  let sx = 0, sy = 0;
  for (const cerca of p.cercas) {
    const f = noPlano(pl, cerca.pontos[cerca.pontos.length - 1]);
    const r = Math.atan2(f[1] - c[1], f[0] - c[0]) - (DOIS_PI * cerca.vertice) / n;
    sx += Math.cos(r); sy += Math.sin(r);
  }
  return comOrientacao(g, p, Math.atan2(sy, sx));
}

// --- as cercas por ângulo ----------------------------------------------------------------------------------------------------------
function anguloDaCerca(pl: Plano, c: P2, cerca: Cerca): number {
  const f = noPlano(pl, cerca.pontos[cerca.pontos.length - 1]);
  return norm(Math.atan2(f[1] - c[1], f[0] - c[0]));
}
/** Os ids das cercas em ordem de ângulo (anti-horário a partir do leste). */
export function cercasEmOrdem(g: GeoJSON.Polygon, p: PracaCentral): string[] {
  const { pl, c } = nasCoisas(g, p);
  return [...p.cercas].sort((a, b) => anguloDaCerca(pl, c, a) - anguloDaCerca(pl, c, b)).map(x => x.id);
}

/** A cerca `id` radial no ângulo `ang`: o vértice vai para o ângulo (no raio dele) e a ponta vai à borda; null = o raio não acha a borda. */
function praçaComCercaEm(g: GeoJSON.Polygon, p: PracaCentral, id: string, ang: number): PracaCentral | null {
  const cerca = p.cercas.find(c => c.id === id);
  if (!cerca) return null;
  const { pl } = nasCoisas(g, p);
  const v = noRaioReal(pl, p.centro, distanciaM(p.centro, p.vertices[cerca.vertice]), ang);
  const fim = bordaNoRaio(g, v, ang);
  if (!fim) return null;
  return {
    ...p, vertices: p.vertices.map((x, k): Ponto => (k === cerca.vertice ? v : x)),
    cercas: p.cercas.map(x => (x.id === id ? { ...x, pontos: [v, fim] } : x)),
  };
}

/** A área (do banco) da divisão que contém `ref`, com a praça e o que mais corta o pasto; NaN = o ponto não caiu em divisão nenhuma. */
function areaNoPonto(g: GeoJSON.Polygon, p: PracaCentral, ctx: ContextoDasCercas, ref: Ponto): number {
  const ds = divisoesDasLinhas(g, [...cercasComoLinhas(p), ...ctx.linhas], [areaDaPraca(p), ...ctx.internas]);
  const d = ds.find(x => pontoDentro(x.geojson, ref));
  return d ? d.areaHa : NaN;
}

/** Um ponto dentro do "gomo" entre os ângulos a e b (b > a): no meio do ângulo, entre a praça e a borda. */
function pontoDoGomo(g: GeoJSON.Polygon, p: PracaCentral, a: number, b: number): Ponto {
  const { pl, c } = nasCoisas(g, p);
  const meio = (a + b) / 2;
  const rMax = Math.max(...p.vertices.map(v => dist2(noPlano(pl, v), c)));
  const borda = bordaNoRaio(g, p.centro, meio);
  const rBorda = borda ? dist2(noPlano(pl, borda), c) : rMax + 20;
  return pontoNoRaio(pl, c, (rMax + Math.max(rMax + 1, rBorda)) / 2, meio);
}

const depois = (a: number, b: number) => { let x = b; while (x <= a + 1e-9) x += DOIS_PI; return x; };

/** Bisseção do ângulo da cerca `id`, entre os vizinhos, até a divisão `refDoGomo(φ)` ter `alvoHa`. */
function acharAngulo(g: GeoJSON.Polygon, p: PracaCentral, ctx: ContextoDasCercas, id: string, antes: string, apos: string,
  gomo: (phi: number) => [number, number], alvoHa: number): PracaCentral | null {
  const { pl, c } = nasCoisas(g, p);
  const porId = (x: string) => p.cercas.find(k => k.id === x);
  const cAntes = porId(antes), cApos = porId(apos);
  if (!cAntes || !cApos) return null;
  const a0 = anguloDaCerca(pl, c, cAntes);
  const a1 = depois(a0, anguloDaCerca(pl, c, cApos));
  const eps = 0.002;
  const f = (phi: number): number => {
    const q = praçaComCercaEm(g, p, id, phi);
    if (!q) return NaN;
    const [ga, gb] = gomo(phi);
    return areaNoPonto(g, q, ctx, pontoDoGomo(g, q, ga, gb)) - alvoHa;
  };
  let lo = a0 + eps, hi = a1 - eps;
  const flo = f(lo), fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || (flo < 0) === (fhi < 0)) return null;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2, fm = f(m);
    if (!Number.isFinite(fm)) return null;
    if ((fm < 0) === (flo < 0)) lo = m; else hi = m;
  }
  const phi = (lo + hi) / 2;
  const fim = f(phi);
  return Number.isFinite(fim) && Math.abs(fim) <= 0.002 ? praçaComCercaEm(g, p, id, phi) : null;
}

export type ResultadoDaPraca = { ok: true; praca: PracaCentral } | { ok: false; motivo: string };

/** As áreas (do banco) das divisões entre cada par de cercas seguidas de `seq`; null = alguma não caiu em divisão. */
function areasDaSequencia(g: GeoJSON.Polygon, p: PracaCentral, ctx: ContextoDasCercas, seq: readonly string[]): number[] | null {
  const { pl, c } = nasCoisas(g, p);
  const angulo = (id: string) => anguloDaCerca(pl, c, p.cercas.find(k => k.id === id) ?? p.cercas[0]);
  const areas: number[] = [];
  for (let k = 0; k + 1 < seq.length; k++) {
    const a = angulo(seq[k]), b = depois(a, angulo(seq[k + 1]));
    const area = areaNoPonto(g, p, ctx, pontoDoGomo(g, p, a, b));
    if (!Number.isFinite(area)) return null;
    areas.push(area);
  }
  return areas;
}

const FRASE_NAO_MEDI = 'Não consegui medir as divisões: confira se a praça e as cercas estão dentro do pasto.';
const FRASE_NAO_IGUALEI = 'Não consegui igualar: uma cerca fixa ou o desenho da praça impede. Destrave uma cerca ou ajuste a praça.';

/** "Igualar áreas": entre duas cercas fixas (ou a volta inteira, com uma só) as divisões ficam iguais, girando SÓ as cercas não fixas. Sem
 *  nenhuma fixa, a 1ª (a de menor ângulo) é o pivô. Girar o vértice muda a praça (e o que sobra para dividir): por isso várias passadas
 *  até as áreas de cada trecho ficarem a menos de 0,004 ha uma da outra. */
export function igualarAreas(g: GeoJSON.Polygon, p: PracaCentral, ctx: ContextoDasCercas = { linhas: [], internas: [] }): ResultadoDaPraca {
  if (p.cercas.length < 2) return { ok: false, motivo: 'Precisa de pelo menos 2 cercas para igualar.' };
  let atual = p;
  const ordem = cercasEmOrdem(g, p);
  const n = ordem.length;
  const ehFixa = (id: string) => !!p.cercas.find(c => c.id === id)?.fixa;
  let ancoras = ordem.map((id, i) => (ehFixa(id) ? i : -1)).filter(i => i >= 0);
  if (!ancoras.length) ancoras = [0];
  const corridas = ancoras.map((inicio, ai) => {
    const proxima = ancoras[(ai + 1) % ancoras.length];
    const corrida: string[] = [];
    for (let i = (inicio + 1) % n; i !== proxima && corrida.length < n; i = (i + 1) % n) corrida.push(ordem[i]);
    return { seq: [ordem[inicio], ...corrida, ordem[proxima]], corrida };
  }).filter(x => x.corrida.length > 0);
  for (let passada = 0; passada < 6; passada++) {
    for (const { seq, corrida } of corridas) {
      const areas = areasDaSequencia(g, atual, ctx, seq);
      if (!areas) return { ok: false, motivo: FRASE_NAO_MEDI };
      const porDivisao = areas.reduce((s, x) => s + x, 0) / areas.length;
      for (let j = 1; j <= corrida.length; j++) {
        const antes = seq[j - 1], cur = seq[j], apos = seq[j + 1];
        const { pl, c } = nasCoisas(g, atual);
        const aAntes = anguloDaCerca(pl, c, atual.cercas.find(k => k.id === antes) ?? atual.cercas[0]);
        const r = acharAngulo(g, atual, ctx, cur, antes, apos, phi => [aAntes, depois(aAntes, phi)], porDivisao);
        if (!r) return { ok: false, motivo: FRASE_NAO_IGUALEI };
        atual = r;
      }
    }
    let pior = 0;
    for (const { seq } of corridas) {
      const areas = areasDaSequencia(g, atual, ctx, seq);
      if (!areas) return { ok: false, motivo: FRASE_NAO_MEDI };
      pior = Math.max(pior, Math.max(...areas) - Math.min(...areas));
    }
    if (pior <= 0.004) return { ok: true, praca: atual };
  }
  return { ok: true, praca: atual };
}

/** "Área desejada" na divisão que contém `ref`: gira a cerca não fixa que a limita (a de trás ou a da frente) até a área bater; ela fica fixa. */
export function areaDesejadaNaPraca(g: GeoJSON.Polygon, p: PracaCentral, ctx: ContextoDasCercas, ref: Ponto, desejadaHa: number): ResultadoDaPraca {
  if (!(desejadaHa > 0)) return { ok: false, motivo: 'Digite a área desejada em hectares.' };
  if (p.cercas.length < 2) return { ok: false, motivo: 'Precisa de pelo menos 2 cercas.' };
  const { pl, c } = nasCoisas(g, p);
  const r = noPlano(pl, ref);
  const th = norm(Math.atan2(r[1] - c[1], r[0] - c[0]));
  const ordem = cercasEmOrdem(g, p);
  const ang = (id: string) => anguloDaCerca(pl, c, p.cercas.find(k => k.id === id) ?? p.cercas[0]);
  let iApos = ordem.findIndex(id => ang(id) > th);
  if (iApos < 0) iApos = 0;
  const n = ordem.length;
  const iAntes = (iApos - 1 + n) % n;
  const idAntes = ordem[iAntes], idApos = ordem[iApos];
  const fixa = (id: string) => !!p.cercas.find(k => k.id === id)?.fixa;
  const aAntes = ang(idAntes), aApos = ang(idApos);
  const ordemDeTentativa = [idApos, idAntes].filter(id => !fixa(id));
  if (!ordemDeTentativa.length) return { ok: false, motivo: 'As cercas desta divisão estão fixas: destrave uma (cadeado) para pedir a área.' };
  for (const id of ordemDeTentativa) {
    const girando = id === idApos;
    const antes = ordem[(ordem.indexOf(id) - 1 + n) % n], apos = ordem[(ordem.indexOf(id) + 1) % n];
    const q = acharAngulo(g, p, ctx, id, antes, apos, phi => (girando ? [aAntes, depois(aAntes, phi)] : [phi, depois(phi, aApos)]), desejadaHa);
    if (q) return { ok: true, praca: comFixa(q, id, true) };
  }
  return { ok: false, motivo: 'Não dá para chegar a essa área girando as cercas desta divisão: tente outro valor.' };
}

/** O ponto do cocho: o centro da praça. */
export const centroDaPraca = (p: PracaCentral): Ponto => [p.centro[0], p.centro[1]];
