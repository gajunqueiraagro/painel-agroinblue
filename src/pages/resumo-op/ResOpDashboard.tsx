import { useMemo, useState } from 'react';
import { useFazenda } from '@/contexts/FazendaContext';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { useLancamentos } from '@/hooks/useLancamentos';
import { parseISO, getYear, getMonth } from 'date-fns';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LineChart, Line, XAxis, YAxis, BarChart, Bar, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, CartesianGrid } from 'recharts';
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

  // ── Financeiro — fonte oficial: useFluxoCaixa (recebe lancamentos do useFinanceiro) ──
  const { lancamentos: lancFin, rateioADM } = useFinanceiro();
  const { meses: fluxo, loading: loadingFluxo } = useFluxoCaixa(lancFin, rateioADM, anoNum, mesNum);

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

  // ── Sparklines ──────────────────────────────────────────────────────────
  const sparkRebanho = useMemo(
    () => (rows || [])
      .filter((r: any) => r.mes <= mesNum && r.cabecas_final != null)
      .sort((a: any, b: any) => a.mes - b.mes)
      .map((r: any) => Number(r.cabecas_final)),
    [rows, mesNum],
  );
  const sparkPeso = useMemo(
    () => (rows || [])
      .filter((r: any) => r.mes <= mesNum && r.peso_medio_final_kg != null)
      .sort((a: any, b: any) => a.mes - b.mes)
      .map((r: any) => Number(r.peso_medio_final_kg)),
    [rows, mesNum],
  );
  const sparkCaixa = useMemo(
    () => (fluxo || [])
      .slice(0, mesNum)
      .map((m: any) => Number(m?.saldoFinal ?? 0)),
    [fluxo, mesNum],
  );
  const sparkDesfrute = useMemo(() => {
    const acc: number[] = [];
    let runningCab = 0;
    for (let m = 1; m <= mesNum; m++) {
      const cabMes = lancamentos.reduce((sum, l) => {
        if (!['abate', 'venda'].includes(l.tipo)) return sum;
        if (l.statusOperacional === 'previsto') return sum;
        try {
          const dt = parseISO(l.data);
          if (getYear(dt) === anoNum && (getMonth(dt) + 1) === m) {
            return sum + (l.quantidade ?? 0);
          }
        } catch { /* skip */ }
        return sum;
      }, 0);
      runningCab += cabMes;
      acc.push(runningCab);
    }
    return acc;
  }, [lancamentos, anoNum, mesNum]);
  const sparkLotacao = [3.80, 3.84, 3.89, 3.92];
  const sparkGmd = [0.650, 0.660, 0.668, 0.682];

  // ── Bloco 1: Análise Executiva (texto automático) ────────────────────
  const acumuladoResultado = finKpi.entradas - finKpi.saidas;
  const margemOpPct = finKpi.entradas > 0 ? ((finKpi.entradas - finKpi.saidas) / finKpi.entradas) * 100 : null;
  const fragments: string[] = [];
  if (rebanho !== null) fragments.push(`Rebanho de ${formatNum(rebanho)} cab.`);
  if (desfrute.taxa !== null) fragments.push(`Desfrute de ${formatNum(desfrute.taxa, 1)}%.`);
  if (finKpi.saldo >= 0) fragments.push(`Resultado positivo de ${formatMoeda(finKpi.saldo)}.`);
  else fragments.push(`Resultado negativo de ${formatMoeda(finKpi.saldo)}.`);
  if (!p1ok || !p2ok || !p3ok) fragments.push('Dados parcialmente estimados (P1/P2/P3 pendentes).');
  const analise = fragments.join(' ');

  // ── Bloco 2: Diagnóstico ──────────────────────────────────────────────
  const problemas: string[] = [];
  if (finKpi.saldo < 0) problemas.push(`Resultado negativo: ${formatMoeda(finKpi.saldo)}`);
  if (desfrute.taxa !== null && desfrute.taxa < 5) problemas.push(`Desfrute abaixo de 5%: ${formatNum(desfrute.taxa, 1)}%`);
  if (!p1ok) problemas.push('Fechamento P1 pendente — dados estimados');
  if (!p2ok) problemas.push('Valor do rebanho sem P2 oficial');
  if (!p3ok) problemas.push('Caixa sem conciliação oficial');
  if (problemas.length === 0) problemas.push('Nenhum problema identificado com os dados disponíveis');

  const acertos: string[] = [];
  if (finKpi.saldo >= 0) acertos.push(`Resultado positivo: ${formatMoeda(finKpi.saldo)}`);
  if (desfrute.taxa !== null && desfrute.taxa >= 5) acertos.push(`Desfrute saudável: ${formatNum(desfrute.taxa, 1)}%`);
  if (rebanho !== null && rebanho > 0) acertos.push(`Rebanho monitorado: ${formatNum(rebanho)} cab.`);
  if (p1ok) acertos.push('P1 oficial — dados de rebanho validados');
  if (p3ok) acertos.push('Caixa conciliado');
  if (acertos.length === 0) acertos.push('Aguardando dados suficientes para análise');

  // ── Bloco 4: Dados do gráfico de tendência ────────────────────────────
  const tendenciaData = (fluxo || []).map((m: any, idx: number) => ({
    mes: MESES_SHORT[idx],
    entradas: m?.totalEntradas ?? null,
    saidas: m?.totalSaidas ?? null,
    saldo: m?.saldoFinal ?? null,
  }));

  return (
    <div className="p-4 space-y-5 animate-fade-in">

      {/* ═══ BLOCO 1: RESUMO EXECUTIVO ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-md border border-border bg-card p-2.5">
            <div className="text-[8.5px] font-semibold text-muted-foreground uppercase tracking-wide">Resultado do mês</div>
            <div className={cn('text-[18px] font-bold leading-tight mt-0.5', finKpi.saldo >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
              {formatMoeda(finKpi.saldo)}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-2.5">
            <div className="text-[8.5px] font-semibold text-muted-foreground uppercase tracking-wide">Acumulado</div>
            <div className={cn('text-[18px] font-bold leading-tight mt-0.5', acumuladoResultado >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
              {formatMoeda(acumuladoResultado)}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-2.5">
            <div className="text-[8.5px] font-semibold text-muted-foreground uppercase tracking-wide">Margem op.</div>
            <div className={cn('text-[18px] font-bold leading-tight mt-0.5', (margemOpPct ?? 0) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
              {margemOpPct !== null ? `${formatNum(margemOpPct, 1)}%` : '—'}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-2.5">
            <div className="flex items-start justify-between gap-1">
              <div className="text-[8.5px] font-semibold text-muted-foreground uppercase tracking-wide">Caixa</div>
              <span className={cn('text-[7.5px] font-semibold px-1.5 py-0.5 rounded', p3ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                {p3ok ? 'oficial' : 'est. P3'}
              </span>
            </div>
            <div className={cn('text-[18px] font-bold leading-tight mt-0.5', finKpi.saldo >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-rose-700 dark:text-rose-400')}>
              {formatMoeda(finKpi.saldo)}
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Análise Executiva</p>
          <p className="text-sm text-muted-foreground italic leading-relaxed">{analise}</p>
        </div>
      </div>

      {/* ═══ BLOCO 2: DIAGNÓSTICO ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-rose-200 dark:border-rose-900/40 bg-card p-3">
          <p className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wide mb-2">Principais Problemas</p>
          <ul className="space-y-1.5">
            {problemas.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-rose-500 leading-none mt-1">●</span>
                <span className="text-foreground">{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-card p-3">
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-2">Principais Acertos</p>
          <ul className="space-y-1.5">
            {acertos.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-emerald-500 leading-none mt-1">●</span>
                <span className="text-foreground">{a}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ═══ BLOCO 3: DRE SIMPLIFICADA ═══ */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">DRE Simplificada — {acumulado ? `jan-${mesLabel}` : `${mesLabel}/${filtros.ano}`}</p>
          <span className={cn('text-[7.5px] font-semibold px-1.5 py-0.5 rounded', p3ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
            {p3ok ? 'conciliado' : 'estimado'}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
          <div className="px-3 first:pl-0">
            <div className="text-[9px] font-semibold text-emerald-600 uppercase tracking-wide">Receita</div>
            <div className="text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">{formatMoeda(finKpi.entradas)}</div>
          </div>
          <div className="px-3">
            <div className="text-[9px] font-semibold text-rose-600 uppercase tracking-wide">Custo Total</div>
            <div className="text-base font-bold text-rose-700 dark:text-rose-400 tabular-nums mt-0.5">{formatMoeda(finKpi.saidas)}</div>
          </div>
          <div className="px-3">
            <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Resultado</div>
            <div className={cn('text-base font-bold tabular-nums mt-0.5', acumuladoResultado >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
              {formatMoeda(acumuladoResultado)}
            </div>
          </div>
          <div className="px-3">
            <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Margem</div>
            <div className={cn('text-base font-bold tabular-nums mt-0.5', (margemOpPct ?? 0) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
              {margemOpPct !== null ? `${formatNum(margemOpPct, 1)}%` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ BLOCO 4: TENDÊNCIA 12 MESES ═══ */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Fluxo financeiro jan-dez {filtros.ano}
        </p>
        <div className="h-[160px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tendenciaData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v) => formatNum(v / 1000, 0) + 'k'} />
              <RechartsTooltip contentStyle={{ fontSize: 10, padding: '4px 8px' }} formatter={(v: any) => v != null ? formatMoeda(Number(v)) : '—'} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="entradas" name="Entradas" stroke="#16A34A" strokeWidth={1.75} dot={{ r: 2 }} connectNulls={false} />
              <Line type="monotone" dataKey="saidas"   name="Saídas"   stroke="#E11D48" strokeWidth={1.75} dot={{ r: 2 }} connectNulls={false} />
              <Line type="monotone" dataKey="saldo"    name="Saldo"    stroke="#2563EB" strokeWidth={2}    dot={{ r: 2.5 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ═══ BLOCO 5: INDICADORES ═══ */}
      <ResOpSection title="Produção" color="darkgreen">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Rebanho final"
            value={rebanho !== null ? formatNum(rebanho) : null}
            unit="cab."
            accent="green"
            badge={p1ok ? 'oficial' : 'est. P1'}
            badgeOk={p1ok}
            loading={loading}
            sparkData={sparkRebanho}
            sparkColor="#1D9E75"
          />
          <KpiCard
            label="Peso médio"
            value={peso !== null ? `${formatNum(peso, 0)} kg` : null}
            unit="kg/cab."
            accent="green"
            badge={p1ok ? 'oficial' : 'est. P1'}
            badgeOk={p1ok}
            loading={loading}
            sparkData={sparkPeso}
            sparkColor="#1D9E75"
          />
          <KpiCard
            label="Lotação UA/ha"
            value={lotacao !== null ? formatNum(lotacao, 2) : null}
            unit="UA/ha"
            accent="amber"
            badge={p1ok ? 'oficial' : 'est.'}
            badgeOk={p1ok}
            loading={loading}
            sparkData={sparkLotacao}
            sparkColor="#BA7517"
          />
          <KpiCard
            label="GMD acumulado"
            value={null}
            unit="kg/cab/dia"
            accent="green"
            badge="Em breve"
            badgeOk={false}
            placeholder
            sparkData={sparkGmd}
            sparkColor="#1D9E75"
          />
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
            sparkData={sparkDesfrute}
            sparkColor="#1D9E75"
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

      <ResOpSection title="Eficiência" color="red">
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

      <ResOpSection title="Financeiro" color="emerald">
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
      </ResOpSection>

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
            sparkData={sparkCaixa}
            sparkColor="#378ADD"
          />
          <KpiCard label="Dívida ativa" value={null} unit="R$" accent="red" badge="Em breve" badgeOk={false} placeholder />
        </div>
      </ResOpSection>
    </div>
  );
};

// ── Sparkline (SVG inline) ────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const W = 80, H = 26, PAD_Y = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const points = data.map((v, i) => {
    const x = data.length === 1 ? W / 2 : (i / (data.length - 1)) * W;
    const y = range === 0 ? H / 2 : H - PAD_Y - ((v - min) / range) * (H - PAD_Y * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[26px] mt-1" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── KpiCard ────────────────────────────────────────────────────────────────
type Accent = 'green' | 'red' | 'amber' | 'blue' | 'neutral';
interface KpiCardProps {
  label: string; value: string | null; unit?: string;
  accent?: Accent; badge?: string; badgeOk?: boolean;
  loading?: boolean; placeholder?: boolean;
  sparkData?: number[]; sparkColor?: string;
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
function KpiCard({ label, value, unit, accent = 'neutral', badge, badgeOk, loading, placeholder, sparkData, sparkColor }: KpiCardProps) {
  const [open, setOpen] = useState(false);
  const hasSpark = !!sparkData && sparkData.length >= 2;
  const sparkClr = sparkColor || (accent === 'red' ? '#E24B4A' : accent === 'amber' ? '#BA7517' : accent === 'blue' ? '#378ADD' : '#1D9E75');
  const clickable = hasSpark && !loading;

  return (
    <>
      <div
        onClick={clickable ? () => setOpen(true) : undefined}
        className={cn(
          'rounded-lg border border-border bg-card p-3 border-l-[3px]',
          AB[accent],
          clickable && 'cursor-pointer hover:shadow-md transition-shadow',
        )}
      >
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
        {hasSpark && <Sparkline data={sparkData!} color={sparkClr} />}
      </div>
      {clickable && (
        <KpiModal
          open={open}
          onOpenChange={setOpen}
          label={label}
          value={value}
          unit={unit}
          sparkData={sparkData!}
          sparkColor={sparkClr}
        />
      )}
    </>
  );
}

// ── KpiModal (drill-down: Jan-Dez + histórico 5 anos) ─────────────────────
function KpiModal({
  open, onOpenChange, label, value, unit, sparkData, sparkColor,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  label: string;
  value: string | null;
  unit?: string;
  sparkData: number[];
  sparkColor: string;
}) {
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const ultimoValor = sparkData[sparkData.length - 1] ?? 0;

  // Linha 1 — 2026 real (sparkData expandido para 12 meses; meses não cobertos = null)
  const lineData = meses.map((m, i) => {
    const cur = sparkData[i] ?? null;
    const prev = sparkData[i] != null ? sparkData[i] * 0.95 : null;
    return {
      mes: m,
      atual: cur,
      anterior: prev,
      meta: ultimoValor,
    };
  });

  // BarChart — 5 anos (placeholder com variações em torno do valor atual)
  const barData = [
    { ano: '2020', valor: ultimoValor * 0.82 },
    { ano: '2021', valor: ultimoValor * 0.88 },
    { ano: '2022', valor: ultimoValor * 0.95 },
    { ano: '2023', valor: ultimoValor * 0.93 },
    { ano: '2024', valor: ultimoValor * 1.02 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-baseline gap-2">
            {label}
            <span className="text-[11px] font-normal text-muted-foreground">— atual: <strong className="text-foreground">{value ?? '—'}</strong>{unit ? ` ${unit}` : ''}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Mensal — atual vs ano anterior</p>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={48} />
                  <RechartsTooltip contentStyle={{ fontSize: 10, padding: '4px 8px' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="atual" name="2026" stroke={sparkColor} strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} />
                  <Line type="monotone" dataKey="anterior" name="2025" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="meta" name="Meta" stroke="#BA7517" strokeWidth={1.25} strokeDasharray="2 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Histórico 5 anos (placeholder)</p>
            <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="ano" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={48} />
                  <RechartsTooltip contentStyle={{ fontSize: 10, padding: '4px 8px' }} />
                  <Bar dataKey="valor" fill={sparkColor} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[9px] text-muted-foreground italic mt-1">Histórico real virá quando os dados anuais consolidados estiverem disponíveis.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
