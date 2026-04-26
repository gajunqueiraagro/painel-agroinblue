import { useMemo } from 'react';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { parseISO, getYear, getMonth } from 'date-fns';
import { formatNum } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import type { Lancamento } from '@/types/cattle';
import type { ResOpFilters } from '../ResumoOperacionalPage';

interface Props { filtros: ResOpFilters; }

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function passaFiltros(l: Lancamento): boolean {
  if (l.cenario === 'meta') return false;
  if (l.statusOperacional === 'previsto') return false;
  if ((l as any).cancelado === true) return false;
  return true;
}

function arrobasProduzidas(lancamentos: Lancamento[], anoNum: number, mesNum: number, acumulado: boolean): { cab: number; arrobas: number } {
  let cab = 0, arrobas = 0;
  for (const l of lancamentos) {
    if (!passaFiltros(l)) continue;
    if (!['abate','venda'].includes(l.tipo)) continue;
    try {
      const dt = parseISO(l.data);
      const a = getYear(dt);
      const m = getMonth(dt) + 1;
      if (a !== anoNum) continue;
      if (acumulado ? m > mesNum : m !== mesNum) continue;
      const qtd = l.quantidade ?? 0;
      cab += qtd;
      if (l.pesoMedioArrobas && qtd > 0) {
        arrobas += l.pesoMedioArrobas * qtd;
      } else if (l.pesoMedioKg && qtd > 0) {
        arrobas += (l.pesoMedioKg * qtd) / 30;
      }
    } catch { /* skip */ }
  }
  return { cab, arrobas };
}

function calcVariacaoPct(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null) return null;
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export const ResOpProducao = ({ filtros }: Props) => {
  const { lancamentos } = useLancamentos();
  const anoNum = Number(filtros.ano);
  const mesNum = filtros.mes;
  const acumulado = filtros.visao === 'acumulado';

  const { rawFazenda: rowsAtual, loading: loadingAtual } = useRebanhoOficial({ ano: anoNum, cenario: 'realizado' });
  const { rawFazenda: rowsAnterior, loading: loadingAnterior } = useRebanhoOficial({ ano: anoNum - 1, cenario: 'realizado' });

  const mesDado: any = useMemo(() => (rowsAtual || []).find((r: any) => r.mes === mesNum), [rowsAtual, mesNum]);
  const mesDadoAnterior: any = useMemo(() => (rowsAnterior || []).find((r: any) => r.mes === mesNum), [rowsAnterior, mesNum]);

  const arrobasMes = useMemo(() => arrobasProduzidas(lancamentos, anoNum, mesNum, false), [lancamentos, anoNum, mesNum]);
  const arrobasAcum = useMemo(() => arrobasProduzidas(lancamentos, anoNum, mesNum, true), [lancamentos, anoNum, mesNum]);
  const arrobasAnterior = useMemo(() => arrobasProduzidas(lancamentos, anoNum - 1, mesNum, acumulado), [lancamentos, anoNum, mesNum, acumulado]);

  const arrobasExibidas = acumulado ? arrobasAcum : arrobasMes;

  const gmd = mesDado?.gmd_kg_cab_dia ?? null;
  const gmdAnterior = mesDadoAnterior?.gmd_kg_cab_dia ?? null;

  const lotacao = mesDado?.lotacao_ua_ha ?? null;
  const lotacaoAnterior = mesDadoAnterior?.lotacao_ua_ha ?? null;

  const cabecasMedia = useMemo(() => {
    const ini = mesDado?.cabecas_inicio ?? null;
    const fim = mesDado?.cabecas_final ?? null;
    if (ini == null || fim == null) return null;
    return (ini + fim) / 2;
  }, [mesDado]);

  const desfruteTaxa = useMemo(() => {
    if (cabecasMedia == null || cabecasMedia <= 0) return null;
    const cab = acumulado ? arrobasAcum.cab : arrobasMes.cab;
    return (cab / cabecasMedia) * 100;
  }, [cabecasMedia, arrobasMes.cab, arrobasAcum.cab, acumulado]);

  const cabMediaAnterior = useMemo(() => {
    const ini = mesDadoAnterior?.cabecas_inicio ?? null;
    const fim = mesDadoAnterior?.cabecas_final ?? null;
    if (ini == null || fim == null) return null;
    return (ini + fim) / 2;
  }, [mesDadoAnterior]);

  const desfruteAnterior = useMemo(() => {
    if (cabMediaAnterior == null || cabMediaAnterior <= 0) return null;
    return (arrobasAnterior.cab / cabMediaAnterior) * 100;
  }, [cabMediaAnterior, arrobasAnterior.cab]);

  const loading = loadingAtual || loadingAnterior;
  const periodoLabel = acumulado ? `Acumulado jan-${MESES_SHORT[mesNum - 1]}` : `${MESES_SHORT[mesNum - 1]}/${filtros.ano}`;

  const linhas: { label: string; atual: number | null; anterior: number | null; format: (v: number) => string; melhorMaior: boolean }[] = [
    {
      label: '@ produzidas',
      atual: arrobasExibidas.arrobas > 0 ? arrobasExibidas.arrobas : null,
      anterior: arrobasAnterior.arrobas > 0 ? arrobasAnterior.arrobas : null,
      format: (v) => `${formatNum(v, 1)} @`,
      melhorMaior: true,
    },
    { label: 'GMD (mês)', atual: gmd, anterior: gmdAnterior, format: (v) => formatNum(v, 3), melhorMaior: true },
    { label: 'Desfrute %', atual: desfruteTaxa, anterior: desfruteAnterior, format: (v) => `${formatNum(v, 1)}%`, melhorMaior: true },
    { label: 'Lotação UA/ha', atual: lotacao, anterior: lotacaoAnterior, format: (v) => formatNum(v, 2), melhorMaior: true },
  ];

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-green-800 dark:text-green-500">
          Produção — {periodoLabel}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={acumulado ? '@ produzidas (acum.)' : '@ produzidas (mês)'}
          value={arrobasExibidas.arrobas > 0 ? formatNum(arrobasExibidas.arrobas, 1) : null}
          unit={`${arrobasExibidas.cab} cab.`}
          accent="green"
        />
        <KpiCard
          label="GMD"
          value={gmd != null ? formatNum(gmd, 3) : null}
          unit="kg/cab/dia"
          accent={gmd != null && gmd < 0 ? 'red' : 'green'}
          loading={loading}
        />
        <KpiCard
          label="Taxa de desfrute"
          value={desfruteTaxa != null ? `${formatNum(desfruteTaxa, 1)}%` : null}
          unit={acumulado ? 'acumulado' : 'mensal'}
          accent="green"
        />
        <KpiCard
          label="Lotação UA/ha"
          value={lotacao != null ? formatNum(lotacao, 2) : null}
          unit="UA/ha"
          accent="amber"
          loading={loading}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
          Comparativo {anoNum} vs {anoNum - 1} — {periodoLabel}
        </p>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">Indicador</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">{anoNum}</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">{anoNum - 1}</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Δ %</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(row => {
                const variacao = calcVariacaoPct(row.atual, row.anterior);
                const positivo = variacao != null && (row.melhorMaior ? variacao > 0 : variacao < 0);
                const negativo = variacao != null && (row.melhorMaior ? variacao < 0 : variacao > 0);
                return (
                  <tr key={row.label} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-1 px-2">{row.label}</td>
                    <td className="py-1 px-2 text-right tabular-nums font-semibold">{row.atual != null ? row.format(row.atual) : '—'}</td>
                    <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{row.anterior != null ? row.format(row.anterior) : '—'}</td>
                    <td className={cn('py-1 px-2 text-right tabular-nums font-semibold',
                      positivo ? 'text-emerald-600' : negativo ? 'text-rose-600' : 'text-muted-foreground')}>
                      {variacao != null ? `${variacao > 0 ? '+' : ''}${formatNum(variacao, 1)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
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
