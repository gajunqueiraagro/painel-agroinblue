import { useMemo } from 'react';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import type { ResOpFilters } from '../ResumoOperacionalPage';

interface Props { filtros: ResOpFilters; }

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

interface LinhaNut {
  subcentro: string;
  total: number;
}

function isNutricao(l: any): boolean {
  const sub = (l?.subcentro || '').toString().toLowerCase();
  const centro = (l?.centro_custo || '').toString().toLowerCase();
  return sub.includes('nutri') || centro === 'nutrição' || centro === 'nutricao';
}

export const ResOpNutricao = ({ filtros }: Props) => {
  const anoNum = Number(filtros.ano);
  const mesNum = filtros.mes;
  const acumulado = filtros.visao === 'acumulado';

  const { lancamentosGlobais, loading: loadingFluxo } = useFluxoCaixa([], [], anoNum, mesNum);
  const { rawFazenda: rebanhoRows, loading: loadingZoo } = useRebanhoOficial({ ano: anoNum, cenario: 'realizado' });

  const mesDado: any = useMemo(
    () => (rebanhoRows || []).find((r: any) => r.mes === mesNum),
    [rebanhoRows, mesNum],
  );
  const rebanhoMedio = useMemo(() => {
    const ini = mesDado?.cabecas_inicio ?? null;
    const fim = mesDado?.cabecas_final ?? null;
    if (ini == null || fim == null) return null;
    return (ini + fim) / 2;
  }, [mesDado]);

  const { totalNutricao, totalSaidasGeral, breakdown } = useMemo(() => {
    if (!lancamentosGlobais) return { totalNutricao: 0, totalSaidasGeral: 0, breakdown: [] as LinhaNut[] };
    const map = new Map<string, number>();
    let nutTotal = 0;
    let saidaTotal = 0;
    for (const l of lancamentosGlobais) {
      if ((l as any).tipo_operacao !== '2-Saídas') continue;
      const dpStr = (l as any).data_pagamento;
      if (!dpStr) continue;
      const dt = new Date(dpStr);
      if (isNaN(dt.getTime())) continue;
      if (dt.getFullYear() !== anoNum) continue;
      const m = dt.getMonth() + 1;
      if (acumulado ? m > mesNum : m !== mesNum) continue;

      const valor = Math.abs(Number((l as any).valor) || 0);
      saidaTotal += valor;
      if (!isNutricao(l)) continue;
      nutTotal += valor;
      const sub = ((l as any).subcentro || (l as any).centro_custo || 'Nutrição').trim() || 'Nutrição';
      map.set(sub, (map.get(sub) || 0) + valor);
    }
    return {
      totalNutricao: nutTotal,
      totalSaidasGeral: saidaTotal,
      breakdown: Array.from(map.entries()).map(([subcentro, total]) => ({ subcentro, total })).sort((a, b) => b.total - a.total),
    };
  }, [lancamentosGlobais, anoNum, mesNum, acumulado]);

  const pctDoCustoTotal = totalSaidasGeral > 0 ? (totalNutricao / totalSaidasGeral) * 100 : null;
  const custoPorCab = rebanhoMedio && rebanhoMedio > 0 ? totalNutricao / rebanhoMedio : null;

  const periodoLabel = acumulado ? `Acumulado jan-${MESES_SHORT[mesNum - 1]}` : `${MESES_SHORT[mesNum - 1]}/${filtros.ano}`;

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-rose-700 dark:text-rose-400">
          Nutrição — {periodoLabel}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard
          label="Total nutrição"
          value={totalNutricao > 0 ? formatMoeda(totalNutricao) : null}
          unit="R$"
          accent="red"
          loading={loadingFluxo}
        />
        <KpiCard
          label="% do custo total"
          value={pctDoCustoTotal != null ? `${formatNum(pctDoCustoTotal, 1)}%` : null}
          unit="das saídas"
          accent="amber"
          loading={loadingFluxo}
        />
        <KpiCard
          label="R$ / cabeça"
          value={custoPorCab != null ? formatMoeda(custoPorCab) : null}
          unit={rebanhoMedio != null ? `${formatNum(rebanhoMedio, 0)} cab. médias` : 'rebanho indisp.'}
          accent="amber"
          loading={loadingFluxo || loadingZoo}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
          Breakdown por categoria de nutrição
        </p>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">Subcentro / Categoria</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Valor R$</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground w-20">% do total nutr.</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">R$/cab</th>
              </tr>
            </thead>
            <tbody>
              {loadingFluxo ? (
                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground text-[11px]">Carregando...</td></tr>
              ) : breakdown.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground text-[11px]">Nenhum lançamento de nutrição no período.</td></tr>
              ) : breakdown.map(row => {
                const pct = totalNutricao > 0 ? (row.total / totalNutricao) * 100 : 0;
                const porCab = rebanhoMedio && rebanhoMedio > 0 ? row.total / rebanhoMedio : null;
                return (
                  <tr key={row.subcentro} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-1 px-2 font-medium">{row.subcentro}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{formatMoeda(row.total)}</td>
                    <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{formatNum(pct, 1)}%</td>
                    <td className="py-1 px-2 text-right tabular-nums">{porCab != null ? formatMoeda(porCab) : '—'}</td>
                  </tr>
                );
              })}
              {!loadingFluxo && breakdown.length > 0 && (
                <tr className="border-t-2 border-border font-semibold bg-muted/20">
                  <td className="py-1.5 px-2">Total</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{formatMoeda(totalNutricao)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">100%</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{custoPorCab != null ? formatMoeda(custoPorCab) : '—'}</td>
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
