/**
 * PdfFluxoCaixa — gráfico de Evolução do Caixa VETORIAL (react-pdf Svg), espelhando a tela:
 * barras verde/vermelho com valores, linha do saldo (azul), região negativa rosa-clara,
 * marcadores (inicial/menor/final) e resumo analítico abaixo. PR-PDF-EXECUTIVO-03.3.
 * Só desenha — deriva tudo da MESMA série da tela (pontos[0]=Início; índice = dia).
 */
import { View, Text, Svg, Line, Rect, Polyline, Circle, G } from '@react-pdf/renderer';
import { COR } from '@/lib/pdf/analise/estilos';
import { formatMoeda } from '@/lib/calculos/formatters';

interface Ponto { dia: string; mov: number; saldo: number; }

const fmtEixo = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1000) return `${v < 0 ? '-' : ''}${(a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: a >= 100000 ? 0 : 1 })}k`;
  return `${v < 0 ? '-' : ''}${Math.round(a)}`;
};
// Sinal único e determinístico (não depende do locale): negativo "-R$ x", positivo "R$ x".
const sgn = (v: number): string => `${v < 0 ? '-' : ''}${formatMoeda(Math.abs(v))}`;

const COR_ROSA = '#f6d2da'; // região negativa (tom discreto, como a tela)

export function PdfFluxoCaixa({ serie, fmt, projetado }: { serie: Ponto[]; fmt: (v: number) => string; projetado?: boolean }) {
  if (serie.length < 2) {
    return <Text style={{ fontSize: 9, color: COR.cinzaMedio, marginTop: 6 }}>Saldo inicial não informado — evolução indisponível.</Text>;
  }
  const W = 540, H = 246, padL = 46, padR = 14, padT = 16, padB = 20;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;

  const vals = serie.flatMap((p) => [p.saldo, p.mov]);
  const temNegativo = Math.min(...vals) < 0; // região rosa só quando há valor negativo real (não pelo padding)
  let min = Math.min(...vals, 0), max = Math.max(...vals, 0);
  if (min === max) { min -= 1; max += 1; }
  const padTop = (max - min) * 0.12, padBot = (max - min) * 0.14; // margem p/ rótulos das barras
  min -= padBot; max += padTop;

  const n = serie.length;
  const xAt = (i: number) => x0 + (i / (n - 1)) * (x1 - x0);
  const yAt = (v: number) => y1 - ((v - min) / (max - min)) * (y1 - y0);
  const barW = Math.max(1.2, ((x1 - x0) / n) * 0.55);
  const yz = yAt(0);
  const linePts = serie.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.saldo).toFixed(1)}`).join(' ');
  const yTicks = [0, 1, 2, 3].map((k) => min + ((max - min) * k) / 3);

  // Eixo X: "Início" (i=0) + dias PARES (índice = dia). Grade vertical pontilhada nesses pontos.
  const xTicks: number[] = [0];
  for (let i = 2; i <= n - 1; i += 2) xTicks.push(i);

  // Marcadores: inicial (azul), menor (vermelho), final (azul).
  const idxMenor = serie.reduce((mi, p, i, a) => (p.saldo < a[mi].saldo ? i : mi), 0);
  const inicial = serie[0].saldo, final = serie[n - 1].saldo, menor = serie[idxMenor];

  // Rótulos de valor nas barras — guloso por |mov| desc, sem sobreposição horizontal.
  const ocupado: { a: number; b: number }[] = [];
  const rotulosBarra: { i: number; mov: number; s: string }[] = [];
  for (const o of serie.map((p, i) => ({ i, mov: p.mov })).filter((o) => o.mov !== 0).sort((a, b) => Math.abs(b.mov) - Math.abs(a.mov))) {
    const s = fmtEixo(o.mov);
    const w = s.length * 3.0 + 2;
    const cx = xAt(o.i), a = cx - w / 2, b = cx + w / 2;
    if (ocupado.some((r) => !(b < r.a || a > r.b))) continue; // conflito → oculta só o rótulo (nunca a barra)
    ocupado.push({ a, b });
    rotulosBarra.push({ i: o.i, mov: o.mov, s });
  }

  const resumoCor = (v: number) => (v < 0 ? COR.vermelho : COR.verde);
  const termFinal = projetado ? 'Saldo projetado' : 'Saldo final';
  const termMenor = projetado ? 'Menor saldo projetado' : 'Menor saldo';

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Região negativa rosa-clara (entre a linha zero e o limite inferior) */}
        {temNegativo && <Rect x={x0} y={yz} width={x1 - x0} height={y1 - yz} fill={COR_ROSA} fillOpacity={0.45} />}

        {/* Grade horizontal + rótulos Y abreviados */}
        {yTicks.map((v, i) => (
          <G key={`y${i}`}>
            <Line x1={x0} y1={yAt(v)} x2={x1} y2={yAt(v)} stroke={COR.separador} strokeWidth={0.3} />
            <Text x={x0 - 3} y={yAt(v) + 2} style={{ fontSize: 7 }} fill={COR.cinzaMedio} textAnchor="end">{fmtEixo(v)}</Text>
          </G>
        ))}
        {/* Grade vertical pontilhada nos ticks do eixo X */}
        {xTicks.map((i, k) => (
          <Line key={`vx${k}`} x1={xAt(i)} y1={y0} x2={xAt(i)} y2={y1} stroke={COR.separador} strokeWidth={0.3} strokeDasharray="1 2" />
        ))}

        {/* Linha zero */}
        <Line x1={x0} y1={yz} x2={x1} y2={yz} stroke="#8a8a8a" strokeWidth={0.7} />

        {/* Barras */}
        {serie.map((p, i) => (p.mov ? (
          <Rect key={`b${i}`} x={xAt(i) - barW / 2} y={Math.min(yz, yAt(p.mov))} width={barW} height={Math.abs(yAt(p.mov) - yz)} fill={p.mov >= 0 ? COR.verde : COR.vermelho} />
        ) : null))}
        {/* Rótulos de valor nas barras (entradas acima, saídas abaixo) */}
        {rotulosBarra.map((r, k) => {
          const cx = xAt(r.i);
          const y = r.mov > 0 ? Math.max(y0 + 5, yAt(r.mov) - 2.5) : Math.min(H - 3, yAt(r.mov) + 6);
          return <Text key={`bl${k}`} x={cx} y={y} style={{ fontSize: 5.8, fontWeight: 700 }} fill={r.mov > 0 ? COR.verde : COR.vermelho} textAnchor="middle">{r.s}</Text>;
        })}

        {/* Linha do saldo acumulado */}
        <Polyline points={linePts} fill="none" stroke={COR.azul} strokeWidth={1.5} />

        {/* Marcadores + rótulos abreviados, reposicionados p/ não encostar/cruzar */}
        <G>
          <Circle cx={xAt(0)} cy={yAt(inicial)} r={2} fill={COR.azul} />
          <Text x={xAt(0) + 4} y={yAt(inicial) - 3} style={{ fontSize: 7.5, fontWeight: 700 }} fill={COR.azul} textAnchor="start">{fmt(inicial)}</Text>
        </G>
        <G>
          <Circle cx={xAt(idxMenor)} cy={yAt(menor.saldo)} r={2} fill={COR.vermelho} />
          <Text x={Math.min(Math.max(xAt(idxMenor), x0 + 14), x1 - 14)} y={Math.min(H - 3, yAt(menor.saldo) + 9)} style={{ fontSize: 7.5, fontWeight: 700 }} fill={COR.vermelho} textAnchor="middle">{fmt(menor.saldo)}</Text>
        </G>
        <G>
          <Circle cx={xAt(n - 1)} cy={yAt(final)} r={2} fill={COR.azul} />
          <Text x={xAt(n - 1) - 4} y={yAt(final) - 4} style={{ fontSize: 7.5, fontWeight: 700 }} fill={COR.azul} textAnchor="end">{fmt(final)}</Text>
        </G>

        {/* Eixo X: Início + dias pares */}
        {xTicks.map((i, k) => (
          <Text key={`x${k}`} x={xAt(i)} y={y1 + 10} style={{ fontSize: 7 }} fill={COR.cinzaMedio} textAnchor="middle">{serie[i].dia}</Text>
        ))}
      </Svg>

      {/* Resumo analítico abaixo do gráfico */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 3 }}>
        <Text style={{ fontSize: 8, color: COR.cinzaMedio }}>Saldo inicial: <Text style={{ color: COR.azul, fontWeight: 700 }}>{sgn(inicial)}</Text></Text>
        <Text style={{ fontSize: 8, color: COR.cinzaMedio }}>{termFinal}: <Text style={{ color: resumoCor(final), fontWeight: 700 }}>{sgn(final)}</Text></Text>
        <Text style={{ fontSize: 8, color: COR.cinzaMedio }}>{termMenor}: <Text style={{ color: resumoCor(menor.saldo), fontWeight: 700 }}>{sgn(menor.saldo)}</Text> · dia {menor.dia}</Text>
      </View>
    </View>
  );
}
