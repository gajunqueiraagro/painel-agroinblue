/**
 * FluxoCaixaKPIs — 4 cards de KPI do Modal Fluxo de Caixa Realizado.
 *
 * Componente puro: consome `KPIHeader` pronto do builder. Zero cálculo aqui.
 * Card 4 condiciona ao modo:
 *   - 'realizado'/'confirmado': "Saldo Final"
 *   - 'estimado': "Menor Saldo Projetado" + mês onde ocorre
 */

import { cn } from '@/lib/utils';
import type { KPIHeader, ModoToggle } from '@/v2/lib/fluxoCaixaModalTypes';

interface Props {
  kpis: KPIHeader | null;
  modo: ModoToggle;
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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
  valor,
  subValor,
  destaque,
}: {
  titulo: string;
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
      <div className={cn('text-base font-bold tabular-nums truncate leading-tight', destaqueCls)}>
        {valor}
      </div>
      {subValor && (
        <div className="text-[10px] text-muted-foreground truncate">{subValor}</div>
      )}
    </div>
  );
}

export function FluxoCaixaKPIs({ kpis, modo }: Props) {
  if (!kpis) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
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

  const card4 =
    modo === 'estimado' && kpis.menorSaldoProjetado != null
      ? {
          titulo: 'Menor Saldo Projetado',
          valor: fmtBRLCurto(kpis.menorSaldoProjetado),
          subValor:
            kpis.mesMenorSaldo != null
              ? `em ${MESES_CURTOS[kpis.mesMenorSaldo - 1] ?? '—'}`
              : undefined,
        }
      : {
          titulo: 'Saldo Final',
          valor: fmtBRLCurto(kpis.saldoFinalReal),
          subValor:
            kpis.saldoFinalMeta != null ? `Meta: ${fmtBRLCurto(kpis.saldoFinalMeta)}` : undefined,
        };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <Card titulo="Fluxo Real (período)" valor={fmtBRLCurto(kpis.realizadoPeriodo)} />
      <Card titulo="Fluxo Meta (período)" valor={fmtBRLCurto(kpis.metaPeriodo)} />
      <Card
        titulo="Δ Real vs Meta"
        valor={fmtBRLCurto(kpis.deltaAbs)}
        subValor={fmtPct(kpis.deltaPct)}
        destaque={deltaDestaque}
      />
      <Card titulo={card4.titulo} valor={card4.valor} subValor={card4.subValor} />
    </div>
  );
}
