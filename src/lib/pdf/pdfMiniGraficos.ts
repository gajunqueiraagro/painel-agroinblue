/**
 * pdfMiniGraficos — desenhos nativos jsPDF para o PDF Executivo (sem html2canvas).
 * PR-FIN-V2-PDF-EXECUTIVO-01 (FASE 2B).
 *
 * SOMENTE apresentação (vetorial). Nenhuma regra/cálculo — recebe dados já agregados.
 */
import type jsPDF from 'jspdf';

export type RGB = [number, number, number];
export interface Box { x: number; y: number; w: number; h: number; }

/** Mini-linha do saldo acumulado: moldura leve, linha-zero (se cruzar), polilinha e 3 marcadores. */
export function desenharMiniLinhaSaldo(
  doc: jsPDF,
  serie: { dia: string; saldo: number }[],
  box: Box,
  fmt: (v: number) => string,
  cor: RGB = [30, 58, 95],
): void {
  if (serie.length < 2) return;
  const saldos = serie.map((p) => p.saldo);
  let min = Math.min(...saldos), max = Math.max(...saldos);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;
  const xAt = (i: number) => box.x + (i / (serie.length - 1)) * box.w;
  const yAt = (v: number) => box.y + box.h - ((v - min) / (max - min)) * box.h;

  doc.setDrawColor(217, 226, 236); doc.setLineWidth(0.1);
  doc.rect(box.x, box.y, box.w, box.h, 'S');

  if (min < 0 && max > 0) {
    const yz = yAt(0);
    doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.2);
    doc.line(box.x, yz, box.x + box.w, yz);
  }

  doc.setDrawColor(cor[0], cor[1], cor[2]); doc.setLineWidth(0.5);
  for (let i = 1; i < serie.length; i++) {
    doc.line(xAt(i - 1), yAt(serie[i - 1].saldo), xAt(i), yAt(serie[i].saldo));
  }

  const idxMenor = saldos.reduce((mi, v, i, a) => (v < a[mi] ? i : mi), 0);
  const marcos: { i: number; abaixo?: boolean }[] = [
    { i: 0 }, { i: idxMenor, abaixo: true }, { i: serie.length - 1 },
  ];
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(cor[0], cor[1], cor[2]);
  doc.setFillColor(cor[0], cor[1], cor[2]);
  for (const m of marcos) {
    const x = xAt(m.i), yv = yAt(serie[m.i].saldo);
    doc.circle(x, yv, 0.7, 'F');
    const xt = Math.min(Math.max(x, box.x + 10), box.x + box.w - 10);
    doc.text(fmt(serie[m.i].saldo), xt, m.abaixo ? yv + 3.2 : yv - 1.6, { align: 'center' });
  }
  doc.setTextColor(0, 0, 0);
}

/** Evolução composta (linguagem da tela): barras de movimentação (verde/vermelho) +
 *  linha do saldo acumulado (azul) + linha-zero + marcadores (inicial/menor/final) + legenda. */
export function desenharEvolucao(
  doc: jsPDF,
  serie: { dia: string; mov: number; saldo: number }[],
  box: Box,
  fmt: (v: number) => string,
  opts?: { corteIdx?: number; temProjetado?: boolean },
): void {
  if (serie.length < 2) return;
  const vals = serie.flatMap((p) => [p.saldo, p.mov]);
  let min = Math.min(...vals, 0), max = Math.max(...vals, 0);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12; min -= pad; max += pad;
  const n = serie.length;
  const xAt = (i: number) => box.x + (i / (n - 1)) * box.w;
  const yAt = (v: number) => box.y + box.h - ((v - min) / (max - min)) * box.h;
  const barW = Math.max(0.6, (box.w / n) * 0.45);
  const corte = opts?.temProjetado && opts.corteIdx != null ? Math.max(0, Math.min(opts.corteIdx, n - 1)) : n - 1;

  doc.setDrawColor(217, 226, 236); doc.setLineWidth(0.1); doc.rect(box.x, box.y, box.w, box.h, 'S');
  const yz = yAt(0);
  doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.2); doc.line(box.x, yz, box.x + box.w, yz);

  // barras de movimentação (verde entrada / vermelho saída)
  for (let i = 0; i < n; i++) {
    const mv = serie[i].mov;
    if (!mv) continue;
    const x = xAt(i) - barW / 2;
    const yv = yAt(mv);
    if (mv >= 0) doc.setFillColor(34, 120, 74); else doc.setFillColor(185, 28, 28);
    doc.rect(x, Math.min(yz, yv), barW, Math.abs(yv - yz), 'F');
  }

  // linha do saldo: realizado (azul contínuo) até o corte; projetado (laranja pontilhado) depois
  doc.setLineWidth(0.5);
  doc.setDrawColor(30, 58, 95);
  for (let i = 1; i <= corte; i++) doc.line(xAt(i - 1), yAt(serie[i - 1].saldo), xAt(i), yAt(serie[i].saldo));
  if (corte < n - 1) {
    doc.setDrawColor(217, 119, 6); doc.setLineDashPattern([1, 1], 0);
    for (let i = corte + 1; i < n; i++) doc.line(xAt(i - 1), yAt(serie[i - 1].saldo), xAt(i), yAt(serie[i].saldo));
    doc.setLineDashPattern([], 0);
    // marcador do ponto de corte (fim do realizado / início do projetado)
    doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.2);
    doc.line(xAt(corte), box.y, xAt(corte), box.y + box.h);
  }

  // marcadores inicial / menor / final
  const saldos = serie.map((p) => p.saldo);
  const idxMenor = saldos.reduce((mi, v, i, a) => (v < a[mi] ? i : mi), 0);
  const marcos: { i: number; abaixo?: boolean }[] = [{ i: 0 }, { i: idxMenor, abaixo: true }, { i: n - 1 }];
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 95); doc.setFillColor(30, 58, 95);
  for (const m of marcos) {
    const x = xAt(m.i), yv = yAt(serie[m.i].saldo);
    doc.circle(x, yv, 0.8, 'F');
    doc.text(fmt(serie[m.i].saldo), Math.min(Math.max(x, box.x + 12), box.x + box.w - 12), m.abaixo ? yv + 3.4 : yv - 1.8, { align: 'center' });
  }

  // legenda inferior
  const ly = box.y + box.h + 4;
  const leg: { c: RGB; t: string }[] = [{ c: [34, 120, 74], t: 'Entradas' }, { c: [185, 28, 28], t: 'Saídas' }, { c: [30, 58, 95], t: 'Saldo realizado' }];
  if (corte < n - 1) leg.push({ c: [217, 119, 6], t: 'Saldo projetado' });
  let lx = box.x;
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  for (const it of leg) {
    doc.setFillColor(it.c[0], it.c[1], it.c[2]); doc.rect(lx, ly - 2, 2.4, 2.4, 'F');
    doc.setTextColor(90, 90, 90); doc.text(it.t, lx + 3.4, ly);
    lx += 6 + doc.getTextWidth(it.t) + 4;
  }
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
}

/** Donut nativo (setores por triângulos a partir do centro + furo central branco). */
export function desenharDonut(
  doc: jsPDF,
  segmentos: { valor: number; cor: RGB }[],
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
): void {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  if (total <= 0) return;
  const step = Math.PI / 90; // ~2° por triângulo (borda suave)
  let ang = -Math.PI / 2;    // começa no topo
  for (const seg of segmentos) {
    if (seg.valor <= 0) continue;
    const a1 = ang + (seg.valor / total) * Math.PI * 2;
    doc.setFillColor(seg.cor[0], seg.cor[1], seg.cor[2]);
    for (let a = ang; a < a1 - 1e-9; a += step) {
      const aa = Math.min(a + step, a1);
      doc.triangle(cx, cy, cx + rOuter * Math.cos(a), cy + rOuter * Math.sin(a), cx + rOuter * Math.cos(aa), cy + rOuter * Math.sin(aa), 'F');
    }
    ang = a1;
  }
  // Furo central → donut. Anel branco fino nas bordas dos setores fica implícito pelo furo.
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, rInner, 'F');
}

/** Barra horizontal 100% proporcional: segmentos coloridos lado a lado (com separador branco). */
export function desenharBarraProporcional(
  doc: jsPDF,
  segmentos: { valor: number; cor: RGB }[],
  box: Box,
): void {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  if (total <= 0) return;
  let x = box.x;
  for (const seg of segmentos) {
    const w = (seg.valor / total) * box.w;
    doc.setFillColor(seg.cor[0], seg.cor[1], seg.cor[2]);
    doc.rect(x, box.y, w, box.h, 'F');
    x += w;
  }
  // separadores brancos entre segmentos
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.4);
  let xs = box.x;
  for (let i = 0; i < segmentos.length - 1; i++) {
    xs += (segmentos[i].valor / total) * box.w;
    doc.line(xs, box.y, xs, box.y + box.h);
  }
}
