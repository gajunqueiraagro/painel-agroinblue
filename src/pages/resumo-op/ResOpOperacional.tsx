import { useMemo } from 'react';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import type { ResOpFilters } from '../ResumoOperacionalPage';

interface Props { filtros: ResOpFilters; }

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

interface MacroAgg { macro: string; valor: number }

export const ResOpOperacional = ({ filtros }: Props) => {
  const anoNum = Number(filtros.ano);
  const mesNum = filtros.mes;
  const acumulado = filtros.visao === 'acumulado';

  const { meses, lancamentosGlobais, loading } = useFluxoCaixa([], [], anoNum, mesNum);

  const fluxoSlice = useMemo(() => {
    if (!meses || meses.length === 0) return [];
    return acumulado ? meses.slice(0, mesNum) : [meses[mesNum - 1]].filter(Boolean);
  }, [meses, mesNum, acumulado]);

  const entradas = useMemo(() => fluxoSlice.reduce((s, m) => s + (m?.totalEntradas ?? 0), 0), [fluxoSlice]);
  const saidas = useMemo(() => fluxoSlice.reduce((s, m) => s + (m?.totalSaidas ?? 0), 0), [fluxoSlice]);
  const resultado = entradas - saidas;
  const saldoFinal = (meses?.[mesNum - 1] as any)?.saldoFinal ?? 0;

  const resultadoAcum = useMemo(() => {
    if (!meses) return 0;
    const slice = meses.slice(0, mesNum);
    return slice.reduce((s, m) => s + ((m?.totalEntradas ?? 0) - (m?.totalSaidas ?? 0)), 0);
  }, [meses, mesNum]);

  const macroAgg: MacroAgg[] = useMemo(() => {
    if (!lancamentosGlobais) return [];
    const map = new Map<string, number>();
    for (const l of lancamentosGlobais) {
      if ((l as any).tipo_operacao !== '2-Saídas') continue;
      const dpStr = (l as any).data_pagamento;
      if (!dpStr) continue;
      const dt = new Date(dpStr);
      if (isNaN(dt.getTime())) continue;
      if (dt.getFullYear() !== anoNum) continue;
      const m = dt.getMonth() + 1;
      if (acumulado ? m > mesNum : m !== mesNum) continue;
      const macro = ((l as any).macro_custo || 'Sem macro').trim() || 'Sem macro';
      const valor = Math.abs(Number((l as any).valor) || 0);
      map.set(macro, (map.get(macro) || 0) + valor);
    }
    return Array.from(map.entries())
      .map(([macro, valor]) => ({ macro, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [lancamentosGlobais, anoNum, mesNum, acumulado]);

  const totalSaidasMacros = useMemo(() => macroAgg.reduce((s, m) => s + m.valor, 0), [macroAgg]);
  const periodoLabel = acumulado ? `Acumulado jan-${MESES_SHORT[mesNum - 1]}` : `${MESES_SHORT[mesNum - 1]}/${filtros.ano}`;

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-rose-700 dark:text-rose-400">
          Operacional — {periodoLabel}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Entradas"
          value={entradas > 0 ? formatMoeda(entradas) : null}
          unit="R$"
          accent="green"
          loading={loading}
        />
        <KpiCard
          label="Saídas"
          value={saidas > 0 ? formatMoeda(saidas) : null}
          unit="R$"
          accent="red"
          loading={loading}
        />
        <KpiCard
          label="Resultado op."
          value={resultado !== 0 ? formatMoeda(resultado) : null}
          unit={acumulado ? 'acumulado' : 'mensal'}
          accent={resultado >= 0 ? 'green' : 'red'}
          loading={loading}
        />
        <KpiCard
          label="Saldo de caixa"
          value={saldoFinal !== 0 ? formatMoeda(saldoFinal) : null}
          unit="R$ — fim do mês"
          accent={saldoFinal >= 0 ? 'blue' : 'red'}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <KpiCard
          label="Resultado acumulado"
          value={resultadoAcum !== 0 ? formatMoeda(resultadoAcum) : null}
          unit={`jan-${MESES_SHORT[mesNum - 1]}`}
          accent={resultadoAcum >= 0 ? 'green' : 'red'}
          loading={loading}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
          Saídas por macro-custo — {periodoLabel}
        </p>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">Macro-custo</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Valor R$</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground w-16">% do total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="py-4 text-center text-muted-foreground text-[11px]">Carregando...</td></tr>
              ) : macroAgg.length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-center text-muted-foreground text-[11px]">Sem saídas no período.</td></tr>
              ) : macroAgg.map(row => {
                const pct = totalSaidasMacros > 0 ? (row.valor / totalSaidasMacros) * 100 : 0;
                return (
                  <tr key={row.macro} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-1 px-2">{row.macro}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{formatMoeda(row.valor)}</td>
                    <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{formatNum(pct, 1)}%</td>
                  </tr>
                );
              })}
              {macroAgg.length > 0 && (
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="py-1.5 px-2">Total</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{formatMoeda(totalSaidasMacros)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">100%</td>
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
