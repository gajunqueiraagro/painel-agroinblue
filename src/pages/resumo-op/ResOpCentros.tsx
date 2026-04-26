import { useMemo } from 'react';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import type { ResOpFilters } from '../ResumoOperacionalPage';

interface Props { filtros: ResOpFilters; }

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

interface Linha {
  subcentro: string;
  macro: string;
  grupo: string;
  total: number;
}

export const ResOpCentros = ({ filtros }: Props) => {
  const anoNum = Number(filtros.ano);
  const mesNum = filtros.mes;
  const acumulado = filtros.visao === 'acumulado';

  const { lancamentosGlobais, loading } = useFluxoCaixa([], [], anoNum, mesNum);

  const ranking = useMemo<Linha[]>(() => {
    if (!lancamentosGlobais) return [];
    const map = new Map<string, Linha>();
    for (const l of lancamentosGlobais) {
      if ((l as any).tipo_operacao !== '2-Saídas') continue;
      const dpStr = (l as any).data_pagamento;
      if (!dpStr) continue;
      const dt = new Date(dpStr);
      if (isNaN(dt.getTime())) continue;
      if (dt.getFullYear() !== anoNum) continue;
      const m = dt.getMonth() + 1;
      if (acumulado ? m > mesNum : m !== mesNum) continue;

      const subcentro = ((l as any).subcentro || (l as any).grupo_custo || (l as any).macro_custo || 'Sem classificação').trim() || 'Sem classificação';
      const macro = (l as any).macro_custo || '—';
      const grupo = (l as any).grupo_custo || '—';
      const valor = Math.abs(Number((l as any).valor) || 0);

      const cur = map.get(subcentro) || { subcentro, macro, grupo, total: 0 };
      cur.total += valor;
      map.set(subcentro, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 20);
  }, [lancamentosGlobais, anoNum, mesNum, acumulado]);

  const totalGeral = useMemo(() => ranking.reduce((s, r) => s + r.total, 0), [ranking]);
  const periodoLabel = acumulado ? `Acumulado jan-${MESES_SHORT[mesNum - 1]}` : `${MESES_SHORT[mesNum - 1]}/${filtros.ano}`;

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-rose-700 dark:text-rose-400">
          Centros de custo — {periodoLabel}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          label="Total das saídas"
          value={totalGeral > 0 ? formatMoeda(totalGeral) : null}
          unit={`top ${ranking.length} subcentros`}
          accent="red"
          loading={loading}
        />
        <KpiCard
          label="Subcentro #1"
          value={ranking[0] ? formatMoeda(ranking[0].total) : null}
          unit={ranking[0]?.subcentro}
          accent="amber"
          loading={loading}
        />
        <KpiCard
          label="Subcentros únicos"
          value={ranking.length > 0 ? formatNum(ranking.length) : null}
          unit="no período"
          accent="blue"
          loading={loading}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
          Ranking de subcentros — top 20
        </p>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground w-6">#</th>
                <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">Subcentro</th>
                <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground hidden md:table-cell">Macro</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Valor R$</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground w-16">% total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-4 text-center text-muted-foreground text-[11px]">Carregando...</td></tr>
              ) : ranking.length === 0 ? (
                <tr><td colSpan={5} className="py-4 text-center text-muted-foreground text-[11px]">Nenhum lançamento de saída no período.</td></tr>
              ) : ranking.map((r, i) => {
                const pct = totalGeral > 0 ? (r.total / totalGeral) * 100 : 0;
                return (
                  <tr key={r.subcentro} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-1 px-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-1 px-2 font-medium">{r.subcentro}</td>
                    <td className="py-1 px-2 text-muted-foreground hidden md:table-cell">{r.macro}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{formatMoeda(r.total)}</td>
                    <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{formatNum(pct, 1)}%</td>
                  </tr>
                );
              })}
              {!loading && ranking.length > 0 && (
                <tr className="border-t-2 border-border font-semibold bg-muted/20">
                  <td className="py-1.5 px-2" colSpan={3}>TOTAL</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{formatMoeda(totalGeral)}</td>
                  <td className="py-1.5 px-2 text-right">100%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── KpiCard inline (replicado de ResOpDashboard.tsx) ──
type Accent = 'green' | 'red' | 'amber' | 'blue' | 'neutral';
interface KpiCardProps {
  label: string; value: string | null; unit?: string;
  accent?: Accent; badge?: string; badgeOk?: boolean;
  loading?: boolean; placeholder?: boolean;
}
const AB: Record<Accent, string> = {
  green: 'border-l-emerald-500', red: 'border-l-rose-500',
  amber: 'border-l-amber-500',  blue: 'border-l-blue-500', neutral: 'border-l-border',
};
const AV: Record<Accent, string> = {
  green: 'text-emerald-700 dark:text-emerald-400', red: 'text-rose-700 dark:text-rose-400',
  amber: 'text-amber-700 dark:text-amber-400',     blue: 'text-blue-700 dark:text-blue-400',
  neutral: 'text-foreground',
};
function KpiCard({ label, value, unit, accent = 'neutral', badge, badgeOk, loading, placeholder }: KpiCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-3 border-l-[3px]', AB[accent])}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight">{label}</span>
        {badge && (
          <span className={cn('text-[7.5px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0',
            badgeOk    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
            : placeholder ? 'bg-muted text-muted-foreground'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400')}>
            {badge}
          </span>
        )}
      </div>
      {loading ? (
        <div className="h-7 w-20 bg-muted animate-pulse rounded mb-0.5" />
      ) : (
        <div className={cn('text-[22px] font-bold leading-none mb-0.5',
          value !== null ? AV[accent] : 'text-muted-foreground/30')}>
          {value ?? '—'}
        </div>
      )}
      {unit && <div className="text-[8.5px] text-muted-foreground">{unit}</div>}
    </div>
  );
}
