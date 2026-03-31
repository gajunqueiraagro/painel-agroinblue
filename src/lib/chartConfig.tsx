/**
 * Global chart configuration — standardized tooltip, colors, axis, grid and dot styles.
 * Import these in every chart to ensure visual consistency across the system.
 */
import React from 'react';

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
export const CHART_COLORS = {
  primary: 'hsl(var(--primary))',
  muted: 'hsl(var(--muted-foreground))',
  accent: 'hsl(var(--accent-foreground))',
  destructive: 'hsl(var(--destructive))',
};

export const SERIES_COLORS = [CHART_COLORS.primary, CHART_COLORS.muted];

// ---------------------------------------------------------------------------
// Dot styles
// ---------------------------------------------------------------------------
export const DOT_STYLE = { r: 2, strokeWidth: 1.5, fill: 'hsl(var(--background))' };
export const ACTIVE_DOT_STYLE = { r: 4, strokeWidth: 2, fill: 'hsl(var(--primary))' };

// ---------------------------------------------------------------------------
// Axis / Grid common props
// ---------------------------------------------------------------------------
export const AXIS_TICK_STYLE = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };
export const GRID_PROPS = { strokeDasharray: '3 3', stroke: 'hsl(var(--border))', strokeOpacity: 0.5 };
export const LEGEND_STYLE = { fontSize: 10 };

// ---------------------------------------------------------------------------
// Line visual differentiation
// ---------------------------------------------------------------------------
export const primaryLineProps = {
  strokeWidth: 2.5,
  dot: DOT_STYLE,
  activeDot: ACTIVE_DOT_STYLE,
};

export const comparisonLineProps = {
  strokeWidth: 1.5,
  strokeDasharray: '4 2',
  strokeOpacity: 0.55,
  dot: { ...DOT_STYLE, r: 1.5 },
  activeDot: { ...ACTIVE_DOT_STYLE, r: 3 },
};

// ---------------------------------------------------------------------------
// Standard Tooltip
// ---------------------------------------------------------------------------
interface TooltipEntry {
  name: string;
  value: number | string;
  color: string;
  dataKey?: string;
}

interface StandardTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  formatter?: (value: number | string, name: string) => string;
  isCurrency?: boolean;
}

const defaultFormat = (v: number | string, _name: string, isCurrency?: boolean): string => {
  if (typeof v !== 'number') return String(v);
  if (isCurrency) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
  }
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
};

export function StandardTooltip({ active, payload, label, formatter, isCurrency }: StandardTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border/60 bg-popover/90 backdrop-blur-sm px-2.5 py-1.5 shadow-sm text-popover-foreground animate-in fade-in-0 zoom-in-95 duration-150">
      <p className="text-[9px] text-muted-foreground mb-0.5">{label}</p>
      {payload.map((entry, i) => {
        const formatted = formatter
          ? formatter(entry.value, entry.name)
          : defaultFormat(entry.value, entry.name, isCurrency);
        return (
          <div key={i} className="flex items-center gap-1.5 text-[11px] leading-tight">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className={i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
              {formatted}
            </span>
            <span className="text-[9px] text-muted-foreground/70 truncate">{entry.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// Convenience: build Recharts <Tooltip content={...} /> prop
export function renderStandardTooltip(opts?: { formatter?: StandardTooltipProps['formatter']; isCurrency?: boolean }) {
  return <StandardTooltip {...opts} />;
}
