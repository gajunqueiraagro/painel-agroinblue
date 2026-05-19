/**
 * FluxoCaixaGrafico3Trilhos — gráfico de saldo acumulado mês a mês.
 *
 * 3 séries:
 *   - Real 2025 (cinza, Jan→Dez sempre)
 *   - Meta 2026 (laranja, Jan→Dez sempre)
 *   - Real 2026 = duas séries internas sem overlap visual:
 *     · "Real 2026" (sólida): valores em [0..mesAlvo-1], null em [mesAlvo..11]
 *     · "Real 2026 (projeção)" (tracejada): valor em mesAlvo-1 (mesmo da sólida,
 *       para conectar visualmente) + valores em [mesAlvo..mesHorizonteInclusivo],
 *       null fora desse range.
 *
 * O Tooltip filtra duplicação no ponto de transição (mesAlvo-1) — só mostra
 * o valor da sólida.
 *
 * Linha vertical em mesAlvo marca o corte realizado/projetado nos modos
 * 'confirmado'/'estimado'.
 */

import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ModoToggle, SerieAno12 } from '@/v2/lib/fluxoCaixaModalTypes';

interface Props {
  real2025: SerieAno12 | null;
  meta2026: SerieAno12 | null;
  real2026: SerieAno12 | null;
  modo: ModoToggle;
  mesAlvo: number;
  /** 0-based inclusive — limite superior da projeção do trilho Real 2026
   *  nos modos 'confirmado'/'estimado'. Em 'realizado' = mesAlvo - 1. */
  mesHorizonteInclusivo: number;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ─── EXCEÇÃO ARQUITETURAL — hex direto para Recharts ────────────────
// Recharts não consome CSS variables nos props `stroke`/`fill` das séries
// (consumidor é SVG nativo do React, não browser CSSOM). Em todos os outros
// pontos do projeto onde Recharts é usado a mesma exceção vale —
// ver LinhaExecutivaExecutivoModal.tsx:43-44 (mesmas constantes) e
// BlocoResumoExecutivo.tsx:117-119,128-129 (mesma paleta).
// Tokens visuais oficiais Tailwind: orange-500 (meta), gray-400 (ano-1),
// sky-600 (ano corrente). Quando o projeto adotar `getComputedStyle` para
// resolver `hsl(var(--*))` antes de passar a Recharts, migrar para
// padrão único. Por ora, hex literal alinhado ao precedente já estabelecido.
const COR_REAL_2025 = '#9ca3af'; // gray-400 — idêntico ao stroke de REAL 2025 em BlocoResumoExecutivo.tsx:503
const COR_META_2026 = '#f97316'; // orange-500 — idêntico a BlocoResumoExecutivo.tsx:511
const COR_REAL_2026 = '#0284c7'; // sky-600 — idêntico a BlocoResumoExecutivo.tsx:520 / :127

function fmtBRLCompacto(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `R$ ${(v / 1e9).toFixed(1).replace('.', ',')}B`;
  if (abs >= 1e6) return `R$ ${(v / 1e6).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

function fmtBRLCheio(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(v);
}

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number;
  name?: string;
  color?: string;
}

function GraficoTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  // Filtra duplicação no ponto de transição: se "Real 2026" e "Real 2026 (projeção)"
  // têm o mesmo valor (ponto de conexão), mostra apenas a sólida.
  const solid = payload.find((p) => p.dataKey === 'Real 2026');
  const dashed = payload.find((p) => p.dataKey === 'Real 2026 (projeção)');
  const filtered = payload.filter((p) => {
    if (
      p.dataKey === 'Real 2026 (projeção)' &&
      solid &&
      dashed &&
      typeof solid.value === 'number' &&
      typeof dashed.value === 'number' &&
      solid.value === dashed.value
    ) {
      return false;
    }
    return true;
  });
  return (
    <div className="rounded-md border border-border/50 bg-background/90 backdrop-blur-sm px-2.5 py-1.5 shadow-sm text-[11px]">
      <div className="font-semibold text-foreground mb-0.5">{label}</div>
      {filtered.map((p) => {
        const dk = String(p.dataKey);
        const v = typeof p.value === 'number' ? fmtBRLCheio(p.value) : '—';
        return (
          <div key={dk} className="flex items-center gap-2 tabular-nums">
            <span style={{ color: p.color }} className="font-medium">{dk}:</span>
            <span style={{ color: p.color }}>{v}</span>
          </div>
        );
      })}
    </div>
  );
}

export function FluxoCaixaGrafico3Trilhos({
  real2025,
  meta2026,
  real2026,
  modo,
  mesAlvo,
  mesHorizonteInclusivo,
}: Props) {
  const mostrarProjecao = modo !== 'realizado';
  const idxAlvo = mesAlvo - 1; // 0-based

  // chartData: 1 dataset com 4 séries.
  //   - Real 2026 (sólida): valor em [0..idxAlvo], null em [idxAlvo+1..11]
  //   - Real 2026 (projeção): null em [0..idxAlvo-1],
  //                            valor em [idxAlvo..mesHorizonteInclusivo]
  //                            (idxAlvo é o ponto de conexão com a sólida —
  //                            mesmo valor para evitar gap visual),
  //                            null em [mesHorizonteInclusivo+1..11]
  const chartData = MESES.map((mes, i) => {
    const row: Record<string, number | string | null> = { mes };

    // Real 2025 (Jan→Dez sempre)
    row['Real 2025'] =
      real2025 && Number.isFinite(real2025.meses[i]) ? real2025.meses[i] : null;

    // Meta 2026 (Jan→Dez sempre)
    row['Meta 2026'] =
      meta2026 && Number.isFinite(meta2026.meses[i]) ? meta2026.meses[i] : null;

    // Real 2026 — duas séries sem overlap:
    if (real2026) {
      const v = real2026.meses[i];
      const valido = Number.isFinite(v);
      // Sólida: até idxAlvo (inclusive). Null após.
      if (valido && i <= idxAlvo) {
        row['Real 2026'] = v;
      } else {
        row['Real 2026'] = null;
      }
      // Tracejada: começa em idxAlvo (mesmo ponto da sólida — valor igual
      // garante conexão visual sem gap) e vai até mesHorizonteInclusivo.
      if (
        mostrarProjecao &&
        valido &&
        i >= idxAlvo &&
        i <= mesHorizonteInclusivo
      ) {
        row['Real 2026 (projeção)'] = v;
      } else {
        row['Real 2026 (projeção)'] = null;
      }
    } else {
      row['Real 2026'] = null;
      row['Real 2026 (projeção)'] = null;
    }

    return row;
  });

  return (
    <div className="border border-border rounded-md p-2 h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={fmtBRLCompacto}
            width={64}
          />
          <Tooltip
            content={<GraficoTooltip />}
            cursor={{ stroke: 'hsl(var(--muted-foreground) / 0.3)', strokeWidth: 1 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {mostrarProjecao && (
            <ReferenceLine
              x={MESES[idxAlvo]}
              stroke="hsl(var(--muted-foreground) / 0.4)"
              strokeDasharray="2 2"
              label={{
                value: 'corte',
                position: 'top',
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 10,
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="Real 2025"
            stroke={COR_REAL_2025}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="Meta 2026"
            stroke={COR_META_2026}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="Real 2026"
            stroke={COR_REAL_2026}
            strokeWidth={2.5}
            dot={{ r: 3, fill: COR_REAL_2026 }}
            activeDot={{ r: 4 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          {mostrarProjecao && (
            <Line
              type="monotone"
              dataKey="Real 2026 (projeção)"
              stroke={COR_REAL_2026}
              strokeWidth={2}
              strokeDasharray="5 4"
              // dot=false no ponto inicial (idxAlvo) para evitar overlap com
              // o dot da sólida no mesmo ponto. Demais pontos da projeção
              // recebem dot levemente menor.
              dot={(props: { cx?: number; cy?: number; payload?: { mes?: string }; index?: number }) => {
                const idx = props.index ?? -1;
                if (idx === idxAlvo) return <g />;
                if (props.cx == null || props.cy == null) return <g />;
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={2.5}
                    fill={COR_REAL_2026}
                    fillOpacity={0.6}
                  />
                );
              }}
              connectNulls={false}
              isAnimationActive={false}
              legendType="none"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
