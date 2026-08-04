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
