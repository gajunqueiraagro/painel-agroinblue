import { useMemo } from 'react';
import { useFazenda } from '@/contexts/FazendaContext';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { formatNum } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import type { ResOpFilters } from '../ResumoOperacionalPage';

interface Props { filtros: ResOpFilters; }

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export const ResOpZootecnico = ({ filtros }: Props) => {
  const { fazendaAtual, isGlobal } = useFazenda();
  const anoNum = Number(filtros.ano);
  const mesNum = filtros.mes;
  const anoMes = `${filtros.ano}-${String(mesNum).padStart(2, '0')}`;

  const { rawFazenda: rows, loading } = useRebanhoOficial({ ano: anoNum, cenario: 'realizado' });
  const fazendaId = isGlobal ? undefined : fazendaAtual?.id;
  const { status: pilares } = useStatusPilares(fazendaId, anoMes);

  const p1ok = pilares?.p1_mapa_pastos?.status === 'oficial';
  const badge = p1ok ? 'P1 oficial' : 'est. P1';

  const mesDado = useMemo(() => (rows || []).find((r: any) => r.mes === mesNum), [rows, mesNum]);

  const evolucaoMensal = useMemo(() => {
    return Array.from({ length: mesNum }, (_, i) => {
      const m = i + 1;
      const r: any = (rows || []).find((x: any) => x.mes === m);
      const cabFinal = r?.cabecas_final ?? null;
      const cabInicio = r?.cabecas_inicio ?? null;
      const variacao = (cabFinal != null && cabInicio != null) ? cabFinal - cabInicio : null;
      return {
        mes: m,
        label: MESES_SHORT[i],
        cabecas: cabFinal,
        peso: r?.peso_medio_final_kg ?? null,
        gmd: r?.gmd_kg_cab_dia ?? null,
        lotacao: r?.lotacao_ua_ha ?? null,
        variacao,
      };
    });
  }, [rows, mesNum]);

  const cabecasFinal = (mesDado as any)?.cabecas_final ?? null;
  const pesoMedio = (mesDado as any)?.peso_medio_final_kg ?? null;
  const gmd = (mesDado as any)?.gmd_kg_cab_dia ?? null;
  const uaMedia = (mesDado as any)?.ua_media ?? null;
  const lotacao = (mesDado as any)?.lotacao_ua_ha ?? null;

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Zootécnico — {MESES_SHORT[mesNum - 1]}/{filtros.ano}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Rebanho final"
          value={cabecasFinal != null ? formatNum(cabecasFinal) : null}
          unit="cab."
          accent="green"
          badge={badge}
          badgeOk={p1ok}
          loading={loading}
        />
        <KpiCard
          label="Peso médio"
          value={pesoMedio != null ? `${formatNum(pesoMedio, 0)} kg` : null}
          unit="kg/cab."
          accent="green"
          badge={badge}
          badgeOk={p1ok}
          loading={loading}
        />
        <KpiCard
          label="GMD"
          value={gmd != null ? formatNum(gmd, 3) : null}
          unit="kg/cab/dia"
          accent={gmd != null && gmd < 0 ? 'red' : 'green'}
          loading={loading}
        />
        <KpiCard
          label="UA total"
          value={uaMedia != null ? formatNum(uaMedia, 1) : null}
          unit="UA"
          accent="amber"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard
          label="Lotação"
          value={lotacao != null ? formatNum(lotacao, 2) : null}
          unit="UA/ha"
          accent="amber"
          badge={badge}
          badgeOk={p1ok}
          loading={loading}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
          Evolução mensal — {filtros.ano}
        </p>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground w-12">Mês</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Rebanho</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Δ cab.</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Peso médio</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">GMD</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Lotação</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-4 text-center text-muted-foreground text-[11px]">Carregando...</td></tr>
              ) : evolucaoMensal.map(row => (
                <tr key={row.mes} className={cn(
                  'border-b border-border/50 hover:bg-muted/30',
                  row.mes === mesNum && 'bg-emerald-50 dark:bg-emerald-950/20 font-semibold',
                )}>
                  <td className="py-1 px-2">{row.label}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{row.cabecas != null ? formatNum(row.cabecas) : '—'}</td>
                  <td className={cn('py-1 px-2 text-right tabular-nums',
                    row.variacao != null && row.variacao > 0 ? 'text-emerald-600' :
                    row.variacao != null && row.variacao < 0 ? 'text-rose-600' : '')}>
                    {row.variacao != null ? (row.variacao > 0 ? `+${formatNum(row.variacao)}` : formatNum(row.variacao)) : '—'}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums">{row.peso != null ? `${formatNum(row.peso, 0)} kg` : '—'}</td>
                  <td className={cn('py-1 px-2 text-right tabular-nums',
                    row.gmd != null && row.gmd < 0 ? 'text-rose-600' :
                    row.gmd != null && row.gmd >= 0.5 ? 'text-emerald-700' : '')}>
                    {row.gmd != null ? formatNum(row.gmd, 3) : '—'}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums">{row.lotacao != null ? formatNum(row.lotacao, 2) : '—'}</td>
                </tr>
              ))}
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
