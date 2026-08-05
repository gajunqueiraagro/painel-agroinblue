/**
 * PdfFluxoCaixa — gráfico de Evolução do Caixa VETORIAL (react-pdf Svg): barras de movimentação
 * (verde/vermelho) + linha do saldo (azul) + eixos X/Y + linha-zero + marcadores + legenda.
 * PR-FIN-V2-PDF-EXECUTIVO-03. Só desenha — recebe a série pronta (mesmos dados da tela).
 */
import { View, Text, Svg, Line, Rect, Polyline, Circle, G } from '@react-pdf/renderer';
import { COR } from '@/lib/pdf/analise/estilos';

interface Ponto { dia: string; mov: number; saldo: number; }
const fmtEixo = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1000) return `${v < 0 ? '-' : ''}${Math.round(a / 1000)}k`;
  return String(Math.round(v));
};

export function PdfFluxoCaixa({ serie, fmt }: { serie: Ponto[]; fmt: (v: number) => string }) {
  if (serie.length < 2) {
    return <Text style={{ fontSize: 9, color: COR.cinzaMedio, marginTop: 6 }}>Saldo inicial não informado — evolução indisponível.</Text>;
  }
  const W = 540, H = 335, padL = 52, padR = 12, padT = 12, padB = 26;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const vals = serie.flatMap((p) => [p.saldo, p.mov]);
  let min = Math.min(...vals, 0), max = Math.max(...vals, 0);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1; min -= pad; max += pad;
  const n = serie.length;
  const xAt = (i: number) => x0 + (i / (n - 1)) * (x1 - x0);
  const yAt = (v: number) => y1 - ((v - min) / (max - min)) * (y1 - y0);
  const barW = Math.max(1, ((x1 - x0) / n) * 0.5);
  const yz = yAt(0);
  const linePts = serie.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.saldo).toFixed(1)}`).join(' ');
  const yTicks = [0, 1, 2, 3].map((k) => min + ((max - min) * k) / 3);
  const xIdx = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => Math.min(n - 1, Math.round(f * (n - 1))));
  const idxMenor = serie.reduce((mi, p, i, a) => (p.saldo < a[mi].saldo ? i : mi), 0);
  const marcos = [{ i: 0, ab: false }, { i: idxMenor, ab: true }, { i: n - 1, ab: false }];

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {yTicks.map((v, i) => (
          <G key={`y${i}`}>
            <Line x1={x0} y1={yAt(v)} x2={x1} y2={yAt(v)} stroke={COR.separador} strokeWidth={0.3} />
            <Text x={x0 - 3} y={yAt(v) + 2} style={{ fontSize: 7.5 }} fill={COR.cinzaMedio} textAnchor="end">{fmtEixo(v)}</Text>
          </G>
        ))}
        <Line x1={x0} y1={yz} x2={x1} y2={yz} stroke="#8a8a8a" strokeWidth={0.6} />
        {serie.map((p, i) => (p.mov ? (
          <Rect key={`b${i}`} x={xAt(i) - barW / 2} y={Math.min(yz, yAt(p.mov))} width={barW} height={Math.abs(yAt(p.mov) - yz)} fill={p.mov >= 0 ? COR.verde : COR.vermelho} />
        ) : null))}
        <Polyline points={linePts} fill="none" stroke={COR.azul} strokeWidth={1.2} />
        {marcos.map((m, i) => (
          <G key={`m${i}`}>
            <Circle cx={xAt(m.i)} cy={yAt(serie[m.i].saldo)} r={1.8} fill={COR.azul} />
            <Text x={Math.min(Math.max(xAt(m.i), x0 + 16), x1 - 16)} y={m.ab ? yAt(serie[m.i].saldo) + 9 : yAt(serie[m.i].saldo) - 3.5} style={{ fontSize: 8, fontWeight: 700 }} fill={COR.azul} textAnchor="middle">{fmt(serie[m.i].saldo)}</Text>
          </G>
        ))}
        {xIdx.map((i, k) => (
          <Text key={`x${k}`} x={xAt(i)} y={y1 + 11} style={{ fontSize: 7.5 }} fill={COR.cinzaMedio} textAnchor="middle">{serie[i].dia}</Text>
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 2 }}>
        {[{ c: COR.verde, t: 'Entradas' }, { c: COR.vermelho, t: 'Saídas' }, { c: COR.azul, t: 'Saldo acumulado' }].map((l) => (
          <View key={l.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 7, height: 7, backgroundColor: l.c, borderRadius: 1 }} />
            <Text style={{ fontSize: 8, color: COR.cinzaMedio }}>{l.t}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
