/**
 * FluxoCaixaKPIs — 4 cards de KPI do Modal Fluxo de Caixa Realizado.
 *
 * Componente puro: consome `KPIHeader` + labels pré-formatados pelo builder.
 * Zero cálculo aqui.
 *
 * Card 4 vem com label/valor/sufixo prontos do builder conforme modo:
 *   - 'realizado'   → "Saldo Final"     + saldo[mesAlvo-1]
 *   - 'confirmado'  → "Saldo Previsto"  + saldo[mesHorizonteInclusivo]
 *   - 'estimado'    → "Menor Saldo"     + min(saldo[mesAlvo..horizonte])
 *
 * Prop `layout`:
 *   - 'horizontal' (default): grid 2×2 / 4×1 — uso em headers compactos.
 *   - 'vertical': flex coluna — uso na coluna direita do modal (sticky).
 */

import { cn } from '@/lib/utils';
import type { KPIHeader } from '@/v2/lib/fluxoCaixaModalTypes';

interface Props {
  kpis: KPIHeader | null;
  labelCard1: string;
  labelCard2: string;
  layout?: 'horizontal' | 'vertical';
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtBRLCurto(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `R$ ${(v / 1e9).toFixed(1).replace('.', ',')}B`;
  if (abs >= 1e6) return `R$ ${(v / 1e6).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return fmtBRL(v);
}

function fmtPct(d: number | null | undefined): string {
  if (d == null || !Number.isFinite(d)) return '—';
  const sign = d > 0 ? '+' : '';
  return `${sign}${Math.round(d)}%`;
}

function Card({
  titulo,
  sublabel,
  valor,
  subValor,
  destaque,
}: {
  titulo: string;
  sublabel?: string;
  valor: string;
  subValor?: string;
  destaque?: 'positivo' | 'negativo' | 'neutro';
}) {
  const destaqueCls =
    destaque === 'positivo'
      ? 'text-emerald-700 dark:text-emerald-300'
      : destaque === 'negativo'
        ? 'text-rose-700 dark:text-rose-300'
        : 'text-foreground';
  return (
    <div className="border border-border bg-card rounded-md p-2.5 flex flex-col gap-0.5 min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
        {titulo}
      </div>
      {sublabel && (
        <div className="text-[10px] text-muted-foreground truncate">{sublabel}</div>
      )}
      <div className={cn('text-base font-bold tabular-nums truncate leading-tight', destaqueCls)}>
        {valor}
      </div>
      {subValor && (
        <div className="text-[10px] text-muted-foreground truncate">{subValor}</div>
      )}
    </div>
  );
}

export function FluxoCaixaKPIs({ kpis, labelCard1, labelCard2, layout = 'horizontal' }: Props) {
  const containerCls =
    layout === 'vertical'
      ? 'flex flex-col gap-2'
      : 'grid grid-cols-2 lg:grid-cols-4 gap-2';

  if (!kpis) {
    return (
      <div className={containerCls}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border border-border bg-muted/30 rounded-md p-2.5 h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  const deltaDestaque: 'positivo' | 'negativo' | 'neutro' =
    kpis.deltaAbs != null && kpis.deltaAbs > 0
      ? 'positivo'
      : kpis.deltaAbs != null && kpis.deltaAbs < 0
        ? 'negativo'
        : 'neutro';

  return (
    <div className={containerCls}>
      <Card titulo={labelCard1} valor={fmtBRLCurto(kpis.realizadoPeriodo)} />
      <Card titulo={labelCard2} valor={fmtBRLCurto(kpis.metaPeriodo)} />
      <Card
        titulo="Δ Real vs Meta"
        valor={fmtBRLCurto(kpis.deltaAbs)}
        subValor={fmtPct(kpis.deltaPct)}
        destaque={deltaDestaque}
      />
      <Card
        titulo={kpis.card4.label}
        valor={fmtBRLCurto(kpis.card4.valor)}
        subValor={kpis.card4.sufixo}
      />
    </div>
  );
}
