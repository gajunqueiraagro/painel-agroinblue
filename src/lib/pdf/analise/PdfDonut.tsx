/**
 * PdfDonut — donut VETORIAL (react-pdf Svg Path: setores + furo central). PR-FIN-V2-PDF-EXECUTIVO-03.
 * Só desenha (recebe segmentos prontos).
 */
import { Svg, Path, Circle } from '@react-pdf/renderer';

export interface SegmentoDonut { valor: number; cor: string; }

function arco(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

export function PdfDonut({ segmentos, size = 86, inner = 0.56 }: { segmentos: SegmentoDonut[]; size?: number; inner?: number }) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  if (total <= 0) return <Svg width={size} height={size} />;
  const cx = size / 2, cy = size / 2, r = size / 2 - 1, ri = r * inner;
  let a = -Math.PI / 2;
  const paths: { d: string; cor: string }[] = [];
  for (const seg of segmentos) {
    if (seg.valor <= 0) continue;
    const a1 = a + (seg.valor / total) * Math.PI * 2;
    paths.push({ d: arco(cx, cy, r, a, a1), cor: seg.cor });
    a = a1;
  }
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths.map((p, i) => <Path key={i} d={p.d} fill={p.cor} stroke="#ffffff" strokeWidth={0.6} />)}
      <Circle cx={cx} cy={cy} r={ri} fill="#ffffff" />
    </Svg>
  );
}
