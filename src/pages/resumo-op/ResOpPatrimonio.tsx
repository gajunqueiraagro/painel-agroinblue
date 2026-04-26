import { useMemo } from 'react';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { useFinanciamentosPainel } from '@/hooks/useFinanciamentosPainel';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import type { ResOpFilters } from '../ResumoOperacionalPage';

interface Props { filtros: ResOpFilters; }

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export const ResOpPatrimonio = ({ filtros }: Props) => {
  const { fazendaAtual, isGlobal } = useFazenda();
  const anoNum = Number(filtros.ano);
  const mesNum = filtros.mes;
  const anoMes = `${filtros.ano}-${String(mesNum).padStart(2, '0')}`;

  const { meses, loading: loadingFluxo } = useFluxoCaixa([], [], anoNum, mesNum);
  const { kpis, dividaPorCredor, loading: loadingFin } = useFinanciamentosPainel(anoNum, 'todos', mesNum);

  const fazendaId = isGlobal ? undefined : fazendaAtual?.id;
  const { status: pilares } = useStatusPilares(fazendaId, anoMes);

  const p2ok = pilares?.p2_valor_rebanho?.status === 'oficial';
  const p3ok = pilares?.p3_financeiro_caixa?.status === 'oficial';

  const caixa = (meses?.[mesNum - 1] as any)?.saldoFinal ?? 0;
  const dividaTotal = kpis?.saldoDevedor?.total?.total ?? 0;

  // Valor do Rebanho — exige P2 oficial. Sem fonte direta aqui; placeholder honesto.
  const valorRebanho: number | null = null;

  const patrimonioLiquido = useMemo(() => {
    if (valorRebanho == null) return null;
    return valorRebanho + caixa - dividaTotal;
  }, [valorRebanho, caixa, dividaTotal]);

  const totalDivida = useMemo(() => (dividaPorCredor || []).reduce((s, c) => s + (c.valor || 0), 0), [dividaPorCredor]);
  const credoresOrdenados = useMemo(
    () => [...(dividaPorCredor || [])].sort((a, b) => (b.valor || 0) - (a.valor || 0)),
    [dividaPorCredor],
  );

  const periodoLabel = `${MESES_SHORT[mesNum - 1]}/${filtros.ano}`;

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-400">
          Patrimônio — {periodoLabel}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Valor do rebanho"
          value={valorRebanho != null ? formatMoeda(valorRebanho) : null}
          unit="R$"
          accent="blue"
          badge={p2ok ? 'P2 oficial' : 'sem P2'}
          badgeOk={p2ok}
          placeholder={!p2ok}
        />
        <KpiCard
          label="Caixa"
          value={caixa !== 0 ? formatMoeda(caixa) : null}
          unit="R$ — fim do mês"
          accent={caixa >= 0 ? 'blue' : 'red'}
          badge={p3ok ? 'P3 oficial' : 'est. P3'}
          badgeOk={p3ok}
          loading={loadingFluxo}
        />
        <KpiCard
          label="Dívida ativa"
          value={dividaTotal > 0 ? formatMoeda(dividaTotal) : null}
          unit="saldo devedor"
          accent={dividaTotal > 0 ? 'red' : 'neutral'}
          loading={loadingFin}
        />
        <KpiCard
          label="Patrimônio líquido"
          value={patrimonioLiquido != null ? formatMoeda(patrimonioLiquido) : null}
          unit="rebanho + caixa - dívida"
          accent={patrimonioLiquido != null && patrimonioLiquido >= 0 ? 'green' : patrimonioLiquido != null ? 'red' : 'neutral'}
          badge={p2ok ? undefined : 'requer P2'}
          placeholder={!p2ok}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
          Dívida por credor
        </p>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">Credor</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Saldo devedor R$</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground w-16">% do total</th>
              </tr>
            </thead>
            <tbody>
              {loadingFin ? (
                <tr><td colSpan={3} className="py-4 text-center text-muted-foreground text-[11px]">Carregando...</td></tr>
              ) : credoresOrdenados.length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-center text-muted-foreground text-[11px]">Sem dívidas ativas.</td></tr>
              ) : credoresOrdenados.map(row => {
                const pct = totalDivida > 0 ? (row.valor / totalDivida) * 100 : 0;
                return (
                  <tr key={row.credor} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-1 px-2">{row.credor || '—'}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{formatMoeda(row.valor)}</td>
                    <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{formatNum(pct, 1)}%</td>
                  </tr>
                );
              })}
              {credoresOrdenados.length > 0 && (
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="py-1.5 px-2">Total</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{formatMoeda(totalDivida)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">100%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!p2ok && (
        <p className="text-[10px] text-muted-foreground italic">
          Valor do rebanho e patrimônio líquido aparecem após fechar o pilar P2 (Valor do Rebanho) deste mês.
        </p>
      )}
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
