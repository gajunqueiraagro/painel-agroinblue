/**
 * MAPA-IMPRESSAO-01 — a FOLHA do mapa para imprimir (A3/A1/A0 paisagem): tudo em milímetros da folha, conta pura (sem React, sem PDF).
 * - O mapa é desenhado em UTM SIRGAS 2000, fuso automático (D3): a grade E/N é reta e a escala é a mesma na folha inteira.
 * - A escala é a maior "redonda" em que a fazenda cabe no quadro; a grade e a escala gráfica saem dela.
 * - A1 e A0 são a A3 ampliada (`s` = largura ÷ 420): margens, painel e letras crescem junto — o mapa de parede se lê de longe.
 */
import { pontoMaisInterno, distanciaABorda, arrumarRotulos, type Aneis, type CandidatoRotulo, type ModoDoRotulo } from '@/lib/mapa/rotulosDoMapa';
import { convergencia, fusoDe, paraUtm, type Fuso } from './utm';

export type TamanhoDaFolha = 'A3' | 'A1' | 'A0';
export const TAMANHOS: readonly TamanhoDaFolha[] = ['A3', 'A1', 'A0'];
const MEDIDAS: Record<TamanhoDaFolha, { largura: number; altura: number }> = {
  A3: { largura: 420, altura: 297 },
  A1: { largura: 841, altura: 594 },
  A0: { largura: 1189, altura: 841 },
};

export interface Caixa { x: number; y: number; w: number; h: number }
export interface LayoutDaFolha { tamanho: TamanhoDaFolha; largura: number; altura: number; s: number; quadro: Caixa; painel: Caixa }

/** A folha deitada: o quadro do mapa à esquerda e o painel (identificação, legenda, resumo) à direita. */
export function layoutDaFolha(tamanho: TamanhoDaFolha): LayoutDaFolha {
  const { largura, altura } = MEDIDAS[tamanho];
  const s = largura / 420;
  const m = 8 * s;
  const painelW = 106 * s;
  const gap = 6 * s;
  const quadro = { x: m, y: m, w: largura - 2 * m - gap - painelW, h: altura - 2 * m };
  return { tamanho, largura, altura, s, quadro, painel: { x: quadro.x + quadro.w + gap, y: m, w: painelW, h: altura - 2 * m } };
}

/** As escalas "redondas" de mapa (o denominador). */
export const ESCALAS = [1000, 2000, 2500, 5000, 7500, 10000, 12500, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000,
  150000, 200000, 250000, 500000, 1000000] as const;

/** A maior escala (o MENOR denominador) em que a extensão cabe no quadro, com 2% de folga de cada lado. */
export function escolherEscala(larguraM: number, alturaM: number, quadro: Caixa, folga = 0.04): number {
  const precisa = Math.max(larguraM / (quadro.w * (1 - folga)), alturaM / (quadro.h * (1 - folga))) * 1000;
  return ESCALAS.find((e) => e >= precisa) ?? ESCALAS[ESCALAS.length - 1];
}

// --- geometria --------------------------------------------------------------------------------------------------------------------
type Coord = readonly number[];
/** Uma geometria GeoJSON como vem do banco (só Polygon/MultiPolygon viram desenho; o resto é ignorado). */
export interface Geometria { type: string; coordinates?: unknown }

const ehPonto = (v: unknown): v is number[] => Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
const ehAnel = (v: unknown): v is number[][] => Array.isArray(v) && v.length >= 3 && v.every(ehPonto);
const ehPoligono = (v: unknown): v is number[][][] => Array.isArray(v) && v.length >= 1 && v.every(ehAnel);

/** Os polígonos (cada um: anel externo + furos) de uma geometria; o que não é área (ou vem torto) fica de fora. */
export function poligonosDe(g: Geometria): Coord[][][] {
  const c = g.coordinates;
  if (g.type === 'Polygon' && ehPoligono(c)) return [c];
  if (g.type === 'MultiPolygon' && Array.isArray(c)) return c.filter(ehPoligono);
  return [];
}

export interface Enquadramento {
  fuso: Fuso;
  escala: number;
  /** o centro do quadro, em UTM */
  centro: { e: number; n: number };
  /** o que o quadro mostra, em UTM (metros) */
  extensao: { e0: number; n0: number; e1: number; n1: number };
  /** metros do terreno por mm da folha */
  mPorMm: number;
  /** a convergência meridiana no centro (graus; ver `convergencia`) */
  convergencia: number;
}

/** O enquadramento: o fuso pelo centro das geometrias, a escala que cabe e a extensão do quadro. `null` = nada para desenhar. */
export function enquadrar(geometrias: readonly Geometria[], layout: LayoutDaFolha): Enquadramento | null {
  let lo0 = Infinity; let lo1 = -Infinity; let la0 = Infinity; let la1 = -Infinity;
  for (const g of geometrias) for (const p of poligonosDe(g)) for (const c of p[0] ?? []) {
    lo0 = Math.min(lo0, c[0]); lo1 = Math.max(lo1, c[0]); la0 = Math.min(la0, c[1]); la1 = Math.max(la1, c[1]);
  }
  if (!Number.isFinite(lo0)) return null;
  const fuso = fusoDe((lo0 + lo1) / 2, (la0 + la1) / 2);
  let e0 = Infinity; let e1 = -Infinity; let n0 = Infinity; let n1 = -Infinity;
  for (const g of geometrias) for (const p of poligonosDe(g)) for (const c of p[0] ?? []) {
    const u = paraUtm(c[0], c[1], fuso);
    e0 = Math.min(e0, u.e); e1 = Math.max(e1, u.e); n0 = Math.min(n0, u.n); n1 = Math.max(n1, u.n);
  }
  const escala = escolherEscala(e1 - e0, n1 - n0, layout.quadro);
  const mPorMm = escala / 1000;
  const centro = { e: (e0 + e1) / 2, n: (n0 + n1) / 2 };
  const { w, h } = layout.quadro;
  return {
    fuso, escala, centro, mPorMm,
    extensao: { e0: centro.e - (w / 2) * mPorMm, e1: centro.e + (w / 2) * mPorMm, n0: centro.n - (h / 2) * mPorMm, n1: centro.n + (h / 2) * mPorMm },
    convergencia: convergencia((lo0 + lo1) / 2, (la0 + la1) / 2, fuso),
  };
}

/** UTM → mm da folha. */
export function naFolha(enq: Enquadramento, layout: LayoutDaFolha, e: number, n: number): [number, number] {
  return [layout.quadro.x + (e - enq.extensao.e0) / enq.mPorMm, layout.quadro.y + (enq.extensao.n1 - n) / enq.mPorMm];
}

/** Uma geometria (lon/lat) → os polígonos em mm da folha. */
export function geometriaNaFolha(g: Geometria, enq: Enquadramento, layout: LayoutDaFolha): Aneis[] {
  return poligonosDe(g).map((p) => p.map((anel) => anel.map((c) => {
    const u = paraUtm(c[0], c[1], enq.fuso);
    return naFolha(enq, layout, u.e, u.n);
  })));
}

/** O caminho SVG (mm) de polígonos já na folha: um subcaminho por anel (os furos ficam vazios com `fill-rule: evenodd`). */
export function caminhoSvg(poligonos: readonly Aneis[]): string {
  return poligonos.flatMap((p) => p.map((anel) => `M${anel.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`)).join('');
}

// --- grade E/N, escala gráfica ----------------------------------------------------------------------------------------------------
const INTERVALOS = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000] as const;

export interface LinhaDaGrade { eixo: 'E' | 'N'; valor: number; pos: number; rotulo: string }

const milhar = (v: number) => Math.round(v).toLocaleString('pt-BR');

/** A grade: o menor intervalo redondo com no máximo 7 linhas no lado maior do quadro. `pos` = x (linhas E) ou y (linhas N) na folha. */
export function gradeDaFolha(enq: Enquadramento, layout: LayoutDaFolha): { intervalo: number; linhas: LinhaDaGrade[] } {
  const { e0, e1, n0, n1 } = enq.extensao;
  const maior = Math.max(e1 - e0, n1 - n0);
  const intervalo = INTERVALOS.find((i) => maior / i <= 7) ?? INTERVALOS[INTERVALOS.length - 1];
  const linhas: LinhaDaGrade[] = [];
  for (let v = Math.ceil(e0 / intervalo) * intervalo; v <= e1; v += intervalo) {
    linhas.push({ eixo: 'E', valor: v, pos: naFolha(enq, layout, v, n1)[0], rotulo: `E ${milhar(v)}` });
  }
  for (let v = Math.ceil(n0 / intervalo) * intervalo; v <= n1; v += intervalo) {
    linhas.push({ eixo: 'N', valor: v, pos: naFolha(enq, layout, e0, v)[1], rotulo: `N ${milhar(v)}` });
  }
  return { intervalo, linhas };
}

const COMPRIMENTOS = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000] as const;

export interface EscalaGrafica { metros: number; mm: number; marcas: { pos: number; rotulo: string }[] }

/** A escala gráfica: o maior comprimento redondo que cabe em ~18% da largura do quadro; 4 trechos. */
export function escalaGrafica(enq: Enquadramento, layout: LayoutDaFolha): EscalaGrafica {
  const alvo = layout.quadro.w * 0.18 * enq.mPorMm;
  const metros = [...COMPRIMENTOS].reverse().find((c) => c <= alvo) ?? COMPRIMENTOS[0];
  const mm = metros / enq.mPorMm;
  const km = metros >= 1000;
  const fmt = (m: number) => (km ? (m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : String(Math.round(m)));
  const marcas = [0, 1, 2, 3, 4].map((i) => ({ pos: (mm * i) / 4, rotulo: fmt((metros * i) / 4) + (i === 4 ? (km ? ' km' : ' m') : '') }));
  return { metros, mm, marcas };
}

/** "1:40.000" */
export const textoDaEscala = (escala: number) => `1:${escala.toLocaleString('pt-BR')}`;

// --- rótulos ----------------------------------------------------------------------------------------------------------------------
export interface PedidoDeRotulo { id: string; poligonos: Aneis[]; nome: string; sub: string | null; prioridade: number }
export interface RotuloNaFolha { id: string; x: number; y: number; modo: ModoDoRotulo; nome: string; sub: string | null }

/** Largura aproximada do texto (Liberation Sans/Helvetica: ~0,55 da altura por letra; negrito um pouco mais). */
export const larguraDoTexto = (texto: string, corpo: number, negrito = false) => texto.length * corpo * (negrito ? 0.6 : 0.54);

/** Os rótulos na folha, pela MESMA regra do Gestor (`pontoMaisInterno` + `arrumarRotulos`): nunca dois se sobrepõem; o que não cabe
 *  fica 'oculto' e o painel diz quais (no papel não há "passe o mouse"). Corpo das letras em mm. */
export function arrumarNaFolha(pedidos: readonly PedidoDeRotulo[], corpoNome: number, corpoSub: number): RotuloNaFolha[] {
  const base = pedidos.map((p) => {
    const maior = [...p.poligonos].sort((a, b) => larguraDe(b[0]) * alturaDe(b[0]) - larguraDe(a[0]) * alturaDe(a[0]))[0];
    const pt = maior ? pontoMaisInterno(maior, corpoSub / 4) : { x: 0, y: 0, folga: 0 };
    return { p, maior, pt };
  });
  const candidatos: CandidatoRotulo[] = base.filter((b) => b.maior).map(({ p, maior, pt }) => ({
    id: p.id, x: pt.x, y: pt.y, folga: pt.folga, larguraDoPasto: larguraDe(maior[0]),
    larguraNome: larguraDoTexto(p.nome, corpoNome, true), alturaNome: corpoNome * 1.15,
    larguraSub: p.sub == null ? null : larguraDoTexto(p.sub, corpoSub), alturaSub: corpoSub * 1.15,
    prioridade: p.prioridade, dentro: (x: number, y: number) => distanciaABorda(x, y, maior) >= 0,
  }));
  const modos = arrumarRotulos(candidatos);
  return base.map(({ p, pt }) => ({ id: p.id, x: pt.x, y: pt.y, modo: modos.get(p.id) ?? 'oculto', nome: p.nome, sub: p.sub }));
}

const larguraDe = (anel: readonly (readonly number[])[]) => {
  let a = Infinity; let b = -Infinity;
  for (const c of anel) { a = Math.min(a, c[0]); b = Math.max(b, c[0]); }
  return b - a;
};
const alturaDe = (anel: readonly (readonly number[])[]) => {
  let a = Infinity; let b = -Infinity;
  for (const c of anel) { a = Math.min(a, c[1]); b = Math.max(b, c[1]); }
  return b - a;
};

/**
 * A hachura a 45° JÁ RECORTADA pelo polígono (o @react-pdf não recorta grupo por `clipPath`): cada linha x + y = c corta as arestas
 * de todos os anéis; os pontos de corte, em ordem, se pareiam (dentro/fora, par-ímpar: o furo fica sem hachura).
 */
export function hachura(poligonos: readonly Aneis[], passo: number): [number, number, number, number][] {
  let lo = Infinity; let hi = -Infinity;
  for (const p of poligonos) for (const anel of p) for (const [x, y] of anel) { lo = Math.min(lo, x + y); hi = Math.max(hi, x + y); }
  if (!Number.isFinite(lo) || passo <= 0) return [];
  const linhas: [number, number, number, number][] = [];
  for (let c = Math.ceil(lo / passo) * passo + passo / 2; c < hi; c += passo) {
    for (const p of poligonos) {
      const xs: number[] = [];
      for (const anel of p) {
        for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
          const [ax, ay] = anel[j]; const [bx, by] = anel[i];
          const sa = ax + ay - c; const sb = bx + by - c;
          if ((sa < 0) !== (sb < 0)) xs.push(ax + ((bx - ax) * sa) / (sa - sb));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) linhas.push([xs[k], c - xs[k], xs[k + 1], c - xs[k + 1]]);
    }
  }
  return linhas;
}
