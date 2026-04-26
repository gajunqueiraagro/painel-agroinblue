import { useMemo } from 'react';
import { useFazenda } from '@/contexts/FazendaContext';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { useLancamentos } from '@/hooks/useLancamentos';
import { parseISO, getYear, getMonth } from 'date-fns';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import type { ResOpFilters } from '../ResumoOperacionalPage';

interface Props { filtros: ResOpFilters; }

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export const ResOpDashboard = ({ filtros }: Props) => {
  const { fazendaAtual, isGlobal } = useFazenda();
  const anoNum = Number(filtros.ano);
  const mesNum = filtros.mes;
  const acumulado = filtros.visao === 'acumulado';

  // ── Zoo KPIs — fonte única oficial: useRebanhoOficial ──────────────
  const { rawFazenda: rows, loading: loadingZoo } = useRebanhoOficial({ ano: anoNum, cenario: 'realizado' });

  const mesDado = useMemo(() => (rows || []).find(r => r.mes === mesNum), [rows, mesNum]);

  const rebanho  = mesDado?.cabecas_final       ?? null;
  const peso     = mesDado?.peso_medio_final_kg ?? null;

  const lotacao = useMemo(() => {
    const pesoTotal = (mesDado as any)?.peso_total_final_kg ?? 0;
    const area      = (mesDado as any)?.area_produtiva_ha   ?? 0;
    return pesoTotal > 0 && area > 0 ? pesoTotal / area : null;
  }, [mesDado]);

  // ── Financeiro — fonte oficial: useFluxoCaixa ──────────────────────
  // Os dois primeiros arrays são ignorados pelo hook (parâmetros legados)
  const { meses: fluxo, loading: loadingFluxo } = useFluxoCaixa([], [], anoNum, mesNum);

  const finKpi = useMemo(() => {
    if (!fluxo || fluxo.length === 0) return { entradas: 0, saidas: 0, saldo: 0 };
    const slice = acumulado ? fluxo.slice(0, mesNum) : [fluxo[mesNum - 1]].filter(Boolean);
    return {
      entradas: slice.reduce((s, m) => s + ((m as any)?.totalEntradas ?? 0), 0),
      saidas:   slice.reduce((s, m) => s + ((m as any)?.totalSaidas   ?? 0), 0),
      saldo:    (fluxo[mesNum - 1] as any)?.saldoFinal ?? 0,
    };
  }, [fluxo, mesNum, acumulado]);

  // ── Desfrute — contagem via lancamentos (sem hook complexo) ─────────
  // NOTA: Arrays em useMemo são seguros — a regra de useRef aplica-se apenas a useEffect
  const { lancamentos } = useLancamentos();

  const desfrute = useMemo(() => {
    const saidas = lancamentos.filter(l => {
      if (!['abate', 'venda'].includes(l.tipo)) return false;
      if (l.statusOperacional === 'previsto') return false;
      try {
        const dt = parseISO(l.data);
        const a  = getYear(dt);
        const m  = getMonth(dt) + 1;
        return a === anoNum && (acumulado ? m <= mesNum : m === mesNum);
      } catch { return false; }
    });
    const cab = saidas.reduce((s, l) => s + (l.quantidade ?? 0), 0);
    const reb = rebanho ?? 0;
    return { cab, taxa: reb > 0 ? (cab / reb) * 100 : null };
  }, [lancamentos, anoNum, mesNum, acumulado, rebanho]);

  // ── Status pilares ──────────────────────────────────────────────────
  const fazendaId = isGlobal ? undefined : fazendaAtual?.id;
  const anoMes    = `${filtros.ano}-${String(mesNum).padStart(2, '0')}`;
  const { status: pilares } = useStatusPilares(fazendaId, anoMes);

  const p1ok = pilares.p1_mapa_pastos.status       === 'oficial';
  const p2ok = pilares.p2_valor_rebanho.status      === 'oficial';
  const p3ok = pilares.p3_financeiro_caixa.status   === 'oficial';

  const loading = loadingZoo || loadingFluxo;
  const mesLabel = MESES_SHORT[mesNum - 1] || '';

  return (
    <div className="p-4 space-y-5 animate-fade-in">

      {/* ── ZOOTÉCNICO ─────────────────────────────────── */}
      <ResOpSection title="Zootécnico" color="emerald">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Rebanho final"
            value={rebanho !== null ? formatNum(rebanho) : null}
            unit="cab."
            accent="green"
            badge={p1ok ? 'oficial' : 'est. P1'}
            badgeOk={p1ok}
            loading={loading}
          />
          <KpiCard
            label="Peso médio"
            value={peso !== null ? `${formatNum(peso, 0)} kg` : null}
            unit="kg/cab."
            accent="green"
            badge={p1ok ? 'oficial' : 'est. P1'}
            badgeOk={p1ok}
            loading={loading}
          />
          <KpiCard
            label="Lotação UA/ha"
            value={lotacao !== null ? formatNum(lotacao, 2) : null}
            unit="UA/ha"
            accent="amber"
            badge={p1ok ? 'oficial' : 'est.'}
            badgeOk={p1ok}
            loading={loading}
          />
          <KpiCard
            label="GMD acumulado"
            value={null}
            unit="kg/cab/dia"
            accent="green"
            badge="Em breve"
            badgeOk={false}
            placeholder
          />
        </div>
      </ResOpSection>

      {/* ── PRODUÇÃO ───────────────────────────────────── */}
      <ResOpSection title="Produção" color="darkgreen">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard
            label="@ produzidas"
            value={null}
            unit="arrobas"
            accent="green"
            badge="Em breve"
            badgeOk={false}
            placeholder
          />
          <KpiCard
            label="Desfrute acum."
            value={desfrute.taxa !== null ? `${formatNum(desfrute.taxa, 1)}%` : null}
            unit={`${desfrute.cab} cab.`}
            accent="green"
            badge={acumulado ? 'acumulado' : 'mensal'}
            badgeOk
          />
          <KpiCard
            label="Mortalidade"
            value={null}
            unit="%"
            accent="neutral"
            badge="dependência"
            badgeOk={false}
            placeholder
          />
        </div>
      </ResOpSection>

      {/* ── OPERACIONAL ────────────────────────────────── */}
      <ResOpSection title="Operacional" color="red">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard label="Custo/cab/mês" value={null} unit="R$/cab" accent="red" badge="Em breve" badgeOk={false} placeholder />
          <KpiCard label="Custo/arroba"  value={null} unit="R$/@"   accent="red" badge="Em breve" badgeOk={false} placeholder />
          <KpiCard
            label="Resultado op."
            value={finKpi.saldo !== 0 ? formatMoeda(finKpi.saldo) : null}
            unit="R$ — caixa"
            accent={finKpi.saldo >= 0 ? 'green' : 'red'}
            badge={p3ok ? 'caixa oficial' : 'est. P3'}
            badgeOk={p3ok}
            loading={loadingFluxo}
          />
        </div>
      </ResOpSection>

      {/* ── PATRIMÔNIO ─────────────────────────────────── */}
      <ResOpSection title="Patrimônio" color="blue">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard label="Valor rebanho" value={null} unit="R$" accent="blue" badge={p2ok ? 'P2 oficial' : 'sem P2'} badgeOk={p2ok} placeholder />
          <KpiCard
            label="Caixa"
            value={finKpi.saldo !== 0 ? formatMoeda(finKpi.saldo) : null}
            unit="R$"
            accent="blue"
            badge={p3ok ? 'conciliado' : 'est.'}
            badgeOk={p3ok}
            loading={loadingFluxo}
          />
          <KpiCard label="Dívida ativa" value={null} unit="R$" accent="red" badge="Em breve" badgeOk={false} placeholder />
        </div>
      </ResOpSection>

      {/* ── Sumários ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SummaryCard title={`Fluxo financeiro ${acumulado ? `jan-${mesLabel}` : `${mesNum}/${filtros.ano}`}`}>
          <SummaryRow label="Entradas" value={formatMoeda(finKpi.entradas)} color="text-emerald-600" />
          <SummaryRow label="Saídas"   value={formatMoeda(finKpi.saidas)}   color="text-rose-600" />
          <div className="border-t border-border pt-1.5 mt-1 flex justify-between">
            <span className="text-xs font-medium">Saldo em caixa</span>
            <span className={cn('text-sm font-bold', finKpi.saldo >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
              {formatMoeda(finKpi.saldo)}
            </span>
          </div>
        </SummaryCard>
        <SummaryCard title={`Desfrute ${acumulado ? 'acumulado' : 'mensal'}`}>
          <SummaryRow label="Cabeças desfrutadas" value={desfrute.cab > 0 ? formatNum(desfrute.cab) : '—'} />
          <SummaryRow label="@ produzidas"        value="— (Em breve)" />
          <div className="border-t border-border pt-1.5 mt-1 flex justify-between">
            <span className="text-xs font-medium">Taxa desfrute</span>
            <span className="text-sm font-bold">
              {desfrute.taxa !== null ? `${formatNum(desfrute.taxa, 1)}%` : '—'}
            </span>
          </div>
        </SummaryCard>
      </div>
    </div>
  );
};

// ── KpiCard ────────────────────────────────────────────────────────────────
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

// ── ResOpSection ───────────────────────────────────────────────────────────
function ResOpSection({ title, color, children }: { title: string; color: 'emerald' | 'darkgreen' | 'red' | 'blue'; children: React.ReactNode }) {
  const clr = {
    emerald:   'text-emerald-700 dark:text-emerald-400',
    darkgreen: 'text-green-800 dark:text-green-500',
    red:       'text-rose-700 dark:text-rose-400',
    blue:      'text-blue-700 dark:text-blue-400',
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={cn('text-[9px] font-bold uppercase tracking-widest', clr[color])}>{title}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      {children}
    </div>
  );
}

// ── SummaryCard / SummaryRow ───────────────────────────────────────────────
function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function SummaryRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-xs font-semibold', color || 'text-foreground')}>{value}</span>
    </div>
  );
}
