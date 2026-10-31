/**
 * MAPA-02a-fix1 (2) — os RÓTULOS dos pastos no mapa.
 * - Posição: o ponto mais interno do polígono (o "polo de inacessibilidade", o algoritmo do polylabel: a busca em quadtree pelo ponto
 *   mais distante da borda), nunca o centro do retângulo — num pasto em L ou comprido e torto o centro cai fora ou na beirada.
 * - Colisão: dois rótulos nunca se sobrepõem. Em ordem de prioridade (o pasto maior primeiro): cabe nome + kg/ha → os dois; senão, só o
 *   nome; senão, nada (o nome fica no hover). "Cabe" = não encosta em rótulo já posto E fica dentro do pasto (largura até a do pasto na
 *   tela; meia altura até a folga do ponto interno; os 4 cantos da caixa dentro do polígono). Tudo em pixels da tela: o tamanho do rótulo é fixo em qualquer zoom, então a conta
 *   se refaz a cada zoom.
 */

export type Ponto = [number, number];
/** Um polígono: o anel externo e os buracos, cada anel uma lista de pontos. */
export type Aneis = Ponto[][];

/** A distância (com sinal: positiva dentro) do ponto à borda do polígono. */
export function distanciaABorda(x: number, y: number, aneis: Aneis): number {
  let dentro = false;
  let minD2 = Infinity;
  for (const anel of aneis) {
    for (let i = 0, n = anel.length, j = n - 1; i < n; j = i++) {
      const [ax, ay] = anel[i];
      const [bx, by] = anel[j];
      if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) dentro = !dentro;
      minD2 = Math.min(minD2, distSegmento2(x, y, ax, ay, bx, by));
    }
  }
  return (dentro ? 1 : -1) * Math.sqrt(minD2);
}

function distSegmento2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  let x = ax; let y = ay;
  let dx = bx - x; let dy = by - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = bx; y = by; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x; dy = py - y;
  return dx * dx + dy * dy;
}

interface Celula { x: number; y: number; h: number; d: number; max: number }
const celula = (x: number, y: number, h: number, aneis: Aneis): Celula => {
  const d = distanciaABorda(x, y, aneis);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
};

/** O centróide do anel externo (ponto de partida da busca). */
function centroide(aneis: Aneis): Celula | null {
  const anel = aneis[0];
  let area = 0; let cx = 0; let cy = 0;
  for (let i = 0, n = anel.length, j = n - 1; i < n; j = i++) {
    const [ax, ay] = anel[i];
    const [bx, by] = anel[j];
    const f = ax * by - bx * ay;
    cx += (ax + bx) * f; cy += (ay + by) * f; area += f * 3;
  }
  if (area === 0) return null;
  return celula(cx / area, cy / area, 0, aneis);
}

/**
 * O polo de inacessibilidade: o ponto de dentro mais longe da borda e essa distância (a folga). `precisao` em unidades das coordenadas
 * (pixels: 1). Polígono degenerado: o primeiro ponto, folga 0.
 */
export function pontoMaisInterno(aneis: Aneis, precisao = 1): { x: number; y: number; folga: number } {
  const externo = aneis[0] ?? [];
  if (externo.length < 3) return { x: externo[0]?.[0] ?? 0, y: externo[0]?.[1] ?? 0, folga: 0 };
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [x, y] of externo) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const w = maxX - minX; const hgt = maxY - minY;
  const tam = Math.min(w, hgt);
  if (tam === 0) return { x: minX, y: minY, folga: 0 };
  let h = tam / 2;
  const fila: Celula[] = [];
  for (let x = minX; x < maxX; x += tam) for (let y = minY; y < maxY; y += tam) fila.push(celula(x + h, y + h, h, aneis));
  let melhor = centroide(aneis) ?? celula(minX + w / 2, minY + hgt / 2, 0, aneis);
  const meio = celula(minX + w / 2, minY + hgt / 2, 0, aneis);
  if (meio.d > melhor.d) melhor = meio;
  let guarda = 0;
  while (fila.length && guarda++ < 20000) {
    let iMax = 0;
    for (let i = 1; i < fila.length; i++) if (fila[i].max > fila[iMax].max) iMax = i;
    const c = fila.splice(iMax, 1)[0];
    if (c.d > melhor.d) melhor = c;
    if (c.max - melhor.d <= precisao) continue;
    h = c.h / 2;
    fila.push(celula(c.x - h, c.y - h, h, aneis), celula(c.x + h, c.y - h, h, aneis), celula(c.x - h, c.y + h, h, aneis), celula(c.x + h, c.y + h, h, aneis));
  }
  return { x: melhor.x, y: melhor.y, folga: Math.max(0, melhor.d) };
}

export interface CandidatoRotulo {
  id: string;
  /** O ponto mais interno do pasto, em pixels da tela. */
  x: number;
  y: number;
  /** A folga do ponto (distância à borda), em pixels. */
  folga: number;
  /** A largura do pasto na tela (retângulo envolvente), em pixels. */
  larguraDoPasto: number;
  larguraNome: number;
  alturaNome: number;
  /** null = não há segunda linha. */
  larguraSub: number | null;
  alturaSub: number;
  /** Maior primeiro (a área do pasto). */
  prioridade: number;
  /** O ponto da tela está dentro do pasto? Com ele, os 4 cantos da caixa do rótulo têm de estar dentro (pasto torto ou em L). */
  dentro?: (x: number, y: number) => boolean;
}

export type ModoDoRotulo = 'completo' | 'nome' | 'oculto';

interface Caixa { x0: number; y0: number; x1: number; y1: number }
const FOLGA_ENTRE = 2;

/** Decide, para cada rótulo, o que aparece: nome + kg/ha, só o nome ou nada (o nome fica no hover). Nunca dois se sobrepõem. */
export function arrumarRotulos(candidatos: readonly CandidatoRotulo[]): Map<string, ModoDoRotulo> {
  const postas: Caixa[] = [];
  const modo = new Map<string, ModoDoRotulo>();
  const ordem = [...candidatos].sort((a, b) => b.prioridade - a.prioridade || a.id.localeCompare(b.id));
  const caixaDe = (c: CandidatoRotulo, largura: number, altura: number): Caixa =>
    ({ x0: c.x - largura / 2, y0: c.y - altura / 2, x1: c.x + largura / 2, y1: c.y + altura / 2 });
  const cabeNoPasto = (c: CandidatoRotulo, largura: number, altura: number) => {
    if (largura > c.larguraDoPasto || altura / 2 > c.folga + FOLGA_ENTRE) return false;
    if (!c.dentro) return true;
    const dx = largura / 2; const dy = altura / 2;
    return c.dentro(c.x - dx, c.y - dy) && c.dentro(c.x + dx, c.y - dy) && c.dentro(c.x - dx, c.y + dy) && c.dentro(c.x + dx, c.y + dy);
  };
  const livre = (k: Caixa) => postas.every(p =>
    k.x1 + FOLGA_ENTRE <= p.x0 || p.x1 + FOLGA_ENTRE <= k.x0 || k.y1 + FOLGA_ENTRE <= p.y0 || p.y1 + FOLGA_ENTRE <= k.y0);
  for (const c of ordem) {
    if (c.larguraSub != null) {
      const largura = Math.max(c.larguraNome, c.larguraSub);
      const altura = c.alturaNome + c.alturaSub;
      const k = caixaDe(c, largura, altura);
      if (cabeNoPasto(c, largura, altura) && livre(k)) { postas.push(k); modo.set(c.id, 'completo'); continue; }
    }
    const k = caixaDe(c, c.larguraNome, c.alturaNome);
    if (cabeNoPasto(c, c.larguraNome, c.alturaNome) && livre(k)) { postas.push(k); modo.set(c.id, 'nome'); continue; }
    modo.set(c.id, 'oculto');
  }
  return modo;
}
