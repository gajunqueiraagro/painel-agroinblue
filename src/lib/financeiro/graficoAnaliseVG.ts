/**
 * P100 — o desenho do GRÁFICO do modal de análise da Visão Geral, sem React (testável): a curva das linhas e o lugar de cada rótulo.
 *   · CURVA MONOTÔNICA (Fritsch–Carlson, a "monotoneX"): passa EXATAMENTE pelos pontos do banco e, entre dois meses, fica entre os
 *     dois valores — nunca inventa uma "barriga" (um pico ou vale que não existe). Mês sem ponto quebra a linha em trechos.
 *   · RÓTULOS sem sobrepor: cada rótulo tem candidatos de lugar, em ordem de preferência; fica no 1º que cabe na área do gráfico e
 *     não encosta em nenhum já posto. Nenhum cabe → não se escreve (o valor segue no title da coluna).
 */
export type Ponto = [number, number];
export interface Caixa { x: number; y: number; w: number; h: number }

/** a caixa estimada de um texto (a fonte do gráfico, tabular): ~0,62 da fonte por caractere + 1px de cada lado; a altura é a da
    linha desenhada (~1,25 da fonte) — o gate mede o desenho de verdade (`rotulosSvg`) */
export const larguraTexto = (t: string, fonte: number) => t.length * fonte * 0.62 + 2;
export const alturaTexto = (fonte: number) => fonte * 1.25;

/** o caminho SVG da curva monotônica pelos pontos (x crescente) */
export function curvaMonotona(p: Ponto[]): string {
  const n = p.length;
  if (n === 0) return '';
  if (n === 1) return `M${p[0][0]},${p[0][1]}`;
  const dx = p.slice(1).map((q, i) => q[0] - p[i][0]);
  const ds = p.slice(1).map((q, i) => (q[1] - p[i][1]) / (dx[i] || 1));
  /* tangentes: nas pontas, a inclinação do trecho; dentro, a média harmônica (zero onde o sentido troca — o ponto é pico ou vale) */
  const m = p.map((_, i) => {
    if (i === 0) return ds[0];
    if (i === n - 1) return ds[n - 2];
    const a = ds[i - 1], b = ds[i];
    if (a * b <= 0) return 0;
    const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
    return (w1 + w2) / (w1 / a + w2 / b);
  });
  /* Fritsch–Carlson: limita a tangente para o trecho não passar dos dois pontos */
  for (let i = 0; i < n - 1; i += 1) {
    if (ds[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / ds[i], b = m[i + 1] / ds[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * ds[i]; m[i + 1] = t * b * ds[i]; }
  }
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    d += ` C${p[i][0] + h},${p[i][1] + m[i] * h} ${p[i + 1][0] - h},${p[i + 1][1] - m[i + 1] * h} ${p[i + 1][0]},${p[i + 1][1]}`;
  }
  return d;
}

/** os trechos de uma série com buracos (nulo quebra a linha) */
export function trechos(pts: (Ponto | null)[]): Ponto[][] {
  const out: Ponto[][] = [];
  let atual: Ponto[] = [];
  for (const q of pts) { if (q) atual.push(q); else if (atual.length) { out.push(atual); atual = []; } }
  if (atual.length) out.push(atual);
  return out;
}

export const encostam = (a: Caixa, b: Caixa, folga = 0.5) =>
  a.x < b.x + b.w + folga && b.x < a.x + a.w + folga && a.y < b.y + b.h + folga && b.y < a.y + a.h + folga;
export const dentro = (a: Caixa, area: Caixa) =>
  a.x >= area.x - 0.01 && a.y >= area.y - 0.01 && a.x + a.w <= area.x + area.w + 0.01 && a.y + a.h <= area.y + area.h + 0.01;

/** o 1º candidato que cabe na área e não encosta em nenhum posto; põe ele na lista dos postos */
export function posicionar(candidatos: Caixa[], postos: Caixa[], area: Caixa): number {
  const i = candidatos.findIndex((c) => dentro(c, area) && !postos.some((p) => encostam(c, p)));
  if (i >= 0) postos.push(candidatos[i]);
  return i;
}
