import { useMemo } from 'react';
import { useLancamentos } from '@/hooks/useLancamentos';
import { parseISO, getYear, getMonth } from 'date-fns';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import type { Lancamento } from '@/types/cattle';
import type { ResOpFilters } from '../ResumoOperacionalPage';

interface Props { filtros: ResOpFilters; }

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

interface AggTipo {
  tipo: string;
  cab: number;
  valor: number;
  pesoTotalKg: number;
  pesoMedio: number | null;
  arrobas: number;
}

const TIPOS_LABEL: Record<string, string> = {
  abate: 'Abates',
  venda: 'Vendas',
  nascimento: 'Nascimentos',
  compra: 'Compras',
  morte: 'Mortes',
  consumo: 'Consumo',
  transferencia_entrada: 'Transferência Entrada',
  transferencia_saida: 'Transferência Saída',
  reclassificacao: 'Reclassificações',
};

function passaFiltros(l: Lancamento): boolean {
  if (l.cenario === 'meta') return false;
  if (l.statusOperacional === 'previsto') return false;
  if ((l as any).cancelado === true) return false;
  return true;
}

function inPeriodo(l: Lancamento, anoNum: number, mesNum: number, acumulado: boolean): boolean {
  try {
    const dt = parseISO(l.data);
    const a = getYear(dt);
    const m = getMonth(dt) + 1;
    return a === anoNum && (acumulado ? m <= mesNum : m === mesNum);
  } catch {
    return false;
  }
}

function aggByTipo(lancamentos: Lancamento[], tipos: string[]): AggTipo[] {
  const map = new Map<string, { cab: number; valor: number; pesoTotalKg: number; arrobas: number }>();
  for (const t of tipos) map.set(t, { cab: 0, valor: 0, pesoTotalKg: 0, arrobas: 0 });

  for (const l of lancamentos) {
    if (!tipos.includes(l.tipo)) continue;
    const slot = map.get(l.tipo)!;
    const qtd = l.quantidade ?? 0;
    slot.cab += qtd;
    slot.valor += l.valorTotal ?? 0;
    if (l.pesoMedioKg && qtd > 0) {
      slot.pesoTotalKg += l.pesoMedioKg * qtd;
    }
    if (l.pesoMedioArrobas && qtd > 0) {
      slot.arrobas += l.pesoMedioArrobas * qtd;
    } else if (l.pesoMedioKg && qtd > 0) {
      slot.arrobas += (l.pesoMedioKg * qtd) / 30;
    }
  }

  return tipos.map(t => {
    const s = map.get(t)!;
    return {
      tipo: t,
      cab: s.cab,
      valor: s.valor,
      pesoTotalKg: s.pesoTotalKg,
      pesoMedio: s.cab > 0 && s.pesoTotalKg > 0 ? s.pesoTotalKg / s.cab : null,
      arrobas: s.arrobas,
    };
  });
}

export const ResOpMovimentacoes = ({ filtros }: Props) => {
  const { lancamentos } = useLancamentos();
  const anoNum = Number(filtros.ano);
  const mesNum = filtros.mes;
  const acumulado = filtros.visao === 'acumulado';

  const filtrados = useMemo(
    () => lancamentos.filter(l => passaFiltros(l) && inPeriodo(l, anoNum, mesNum, acumulado)),
    [lancamentos, anoNum, mesNum, acumulado],
  );

  const agg = useMemo(
    () => aggByTipo(filtrados, ['abate','venda','nascimento','compra','morte','consumo']),
    [filtrados],
  );

  const get = (t: string) => agg.find(a => a.tipo === t)!;
  const abate = get('abate');
  const venda = get('venda');
  const nascimento = get('nascimento');
  const compra = get('compra');
  const morte = get('morte');
  const consumo = get('consumo');

  const desfruteCab = abate.cab + venda.cab;
  const desfruteArrobas = abate.arrobas + venda.arrobas;

  const evolucaoMensal = useMemo(() => {
    return Array.from({ length: mesNum }, (_, i) => {
      const m = i + 1;
      const lancsMes = lancamentos.filter(l => passaFiltros(l) && inPeriodo(l, anoNum, m, false));
      const aggMes = aggByTipo(lancsMes, ['abate','venda']);
      const ab = aggMes.find(a => a.tipo === 'abate')!;
      const vd = aggMes.find(a => a.tipo === 'venda')!;
      return {
        mes: m,
        label: MESES_SHORT[i],
        saidasCab: ab.cab + vd.cab,
        saidasArrobas: ab.arrobas + vd.arrobas,
        valor: ab.valor + vd.valor,
      };
    });
  }, [lancamentos, anoNum, mesNum]);

  const periodoLabel = acumulado
    ? `Acumulado jan-${MESES_SHORT[mesNum - 1]}`
    : `${MESES_SHORT[mesNum - 1]}/${filtros.ano}`;

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Movimentações — {periodoLabel}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Desfrute"
          value={desfruteCab > 0 ? formatNum(desfruteCab) : null}
          unit={desfruteArrobas > 0 ? `${formatNum(desfruteArrobas, 0)} @` : 'cab.'}
          accent="green"
          badge="abate + venda"
          badgeOk
        />
        <KpiCard
          label="Nascimentos"
          value={nascimento.cab > 0 ? formatNum(nascimento.cab) : null}
          unit="cab."
          accent="green"
        />
        <KpiCard
          label="Compras"
          value={compra.cab > 0 ? formatNum(compra.cab) : null}
          unit={compra.valor > 0 ? formatMoeda(compra.valor) : 'cab.'}
          accent="amber"
        />
        <KpiCard
          label="Mortes"
          value={morte.cab > 0 ? formatNum(morte.cab) : null}
          unit="cab."
          accent={morte.cab > 0 ? 'red' : 'neutral'}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
          Resumo por tipo — {periodoLabel}
        </p>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">Tipo</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Cab.</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Peso médio</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">@ totais</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Valor R$</th>
              </tr>
            </thead>
            <tbody>
              {[abate, venda, nascimento, compra, morte, consumo].map(row => (
                <tr key={row.tipo} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1 px-2">{TIPOS_LABEL[row.tipo] || row.tipo}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{row.cab > 0 ? formatNum(row.cab) : '—'}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{row.pesoMedio != null ? `${formatNum(row.pesoMedio, 0)} kg` : '—'}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{row.arrobas > 0 ? formatNum(row.arrobas, 1) : '—'}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{row.valor > 0 ? formatMoeda(row.valor) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
          Saídas mês a mês — {filtros.ano}
        </p>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground w-12">Mês</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Cab. saídas</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">@ totais</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">Valor R$</th>
              </tr>
            </thead>
            <tbody>
              {evolucaoMensal.map(row => (
                <tr key={row.mes} className={cn(
                  'border-b border-border/50 hover:bg-muted/30',
                  row.mes === mesNum && 'bg-emerald-50 dark:bg-emerald-950/20 font-semibold',
                )}>
                  <td className="py-1 px-2">{row.label}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{row.saidasCab > 0 ? formatNum(row.saidasCab) : '—'}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{row.saidasArrobas > 0 ? formatNum(row.saidasArrobas, 1) : '—'}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{row.valor > 0 ? formatMoeda(row.valor) : '—'}</td>
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
