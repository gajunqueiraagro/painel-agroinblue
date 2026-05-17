/**
 * BLOCO 1 — Fluxo de Caixa Previsto.
 * META 2026 (planejamento_financeiro) vs Real 2025 (financeiro_lancamentos_v2).
 * Zero cálculo aqui — recebe DTO pronto de buildBlocoResumoExecutivo.
 *
 * Helpers locais (`calcDeltaLocal`, `montarLinhaSaldoFinal`, `montarLinhaDifAno`)
 * apenas selecionam elementos de array já presentes no DTO e replicam a
 * mesma fórmula de delta do builder. Pendência registrada: extrair para
 * util compartilhada em sessão separada.
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import type {
  BlocoResumoExecutivoData,
  LinhaExecutiva,
} from '@/v2/lib/blocoResumoExecutivoTypes';

interface Props {
  data: BlocoResumoExecutivoData | null;
  /** Saldo bancário consolidado Dez/N-1 — fonte: planFin.saldoInicial. */
  saldoInicialMeta: number;
  /** Saldo bancário consolidado Dez/N-2 — fonte: pc100.caixaIndicador.serieAnoAnt[0]. */
  saldoInicialReal: number;
  /**
   * Quando true, embaça o gráfico de Fluxo de Caixa + cards "Saldo Caixa
   * Final Meta" e "Dif. Caixa no Ano - Meta" (visões Administrativo/Fazenda).
   * Cards Total Entradas/Saídas + tabelas Entradas/Saídas continuam nítidos.
   */
  desfocarDashboard?: boolean;
  /** Callback ao clicar numa linha drilldown-friendly. Pai decide qual modal abrir. */
  onLinhaClick?: (id: 'receitaPecuaria') => void;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(v);

const fmtPct = (v: number): string => {
  const pct = v * 100;
  const sinal = pct >= 0 ? '+' : '';
  return `${sinal}${pct.toFixed(1)}%`;
};

// ─── Helpers locais (replicam regra calcDelta do builder) ─────────────

function calcDeltaLocal(meta: number, real: number): number {
  if (!Number.isFinite(meta) || !Number.isFinite(real)) return 0;
  if (meta <= 0 && real <= 0) return 0;
  return (meta - real) / (real || 1);
}

function montarLinhaSaldoFinal(data: BlocoResumoExecutivoData): LinhaExecutiva {
  const meta = data.serieMeta[11];
  const real = data.serieReal[11];
  return { label: 'Saldo Caixa Final', meta, real, delta: calcDeltaLocal(meta, real) };
}

function montarLinhaDifAno(
  data: BlocoResumoExecutivoData,
  saldoInicialMeta: number,
  saldoInicialReal: number,
): LinhaExecutiva {
  const meta = data.serieMeta[11] - saldoInicialMeta;
  const real = Number.isFinite(saldoInicialReal)
    ? data.serieReal[11] - saldoInicialReal
    : NaN;
  return { label: 'Dif. Caixa no Ano', meta, real, delta: calcDeltaLocal(meta, real) };
}

// ─── Sub-componentes ──────────────────────────────────────────────────

// Cores das séries do gráfico — espelham strokes dos <Area>.
const COR_META = '#f97316'; // laranja (mesma da linha META no gráfico)
const COR_REAL = '#374151'; // gray-700 (mais escuro que o stroke #9ca3af, melhor contraste no tooltip)

// Classe utilitária para a coluna META 2026 — identidade laranja do
// Planejamento (espelha COR_META=#f97316 = orange-500). Aplicada no header
// da coluna e em todos os valores. REAL 2025 e Δ% NÃO usam esta classe.
const META_COLUNA = 'text-orange-500 dark:text-orange-400';

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number;
  name?: string;
}

function FluxoCaixaTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-md border border-border/50 bg-background/80 backdrop-blur-sm px-2.5 py-2 shadow-sm text-[11px]"
      style={{ WebkitBackdropFilter: 'blur(4px)' }}
    >
      <div className="text-foreground font-medium mb-1">{label}</div>
      {payload.map(p => {
        const isMeta = p.dataKey === 'META 2026';
        const color = isMeta ? COR_META : COR_REAL;
        return (
          <div key={String(p.dataKey)} className="flex items-center gap-2 tabular-nums">
            <span style={{ color }} className={isMeta ? 'font-bold' : 'font-semibold'}>
              {String(p.dataKey)}:
            </span>
            <span style={{ color }} className={isMeta ? 'font-bold' : 'font-medium'}>
              {typeof p.value === 'number' ? fmtBRL(p.value) : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  const positivo = delta >= 0;
  const cls = positivo
    ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40'
    : 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/40';
  return (
    <span
      className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums ${cls}`}
    >
      {fmtPct(delta)}
    </span>
  );
}

function LinhaRow({ linha, destaque = false, onClick }: { linha: LinhaExecutiva; destaque?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_110px_110px_70px] gap-1 items-center py-[2px] border-b border-border/30 last:border-0',
        destaque && 'bg-muted/40 font-bold border-b-2 border-foreground/20 py-[4px]',
        onClick && 'cursor-pointer hover:bg-muted/40 transition-colors',
      )}
    >
      <div className={cn('text-[11px] truncate', destaque ? 'text-foreground uppercase tracking-wide' : 'text-foreground')}>
        {linha.label}
      </div>
      <div className={cn('text-[11px] tabular-nums text-right font-semibold', META_COLUNA)}>
        {fmtBRL(linha.meta)}
      </div>
      <div className={cn('text-[11px] tabular-nums text-right', destaque ? 'text-foreground/80' : 'text-muted-foreground')}>
        {fmtBRL(linha.real)}
      </div>
      <div className="text-right">
        <DeltaBadge delta={linha.delta} />
      </div>
    </div>
  );
}

type CardVariant = 'sky' | 'rose' | 'neutral';

function CardTotal({
  titulo,
  linha,
  variant = 'neutral',
  metaOnly = false,
}: {
  titulo: string;
  linha: LinhaExecutiva;
  variant?: CardVariant;
  /** Quando true, esconde linha "Real …" e badge Δ% — card META-only. */
  metaOnly?: boolean;
}) {
  const variantCls: Record<CardVariant, { card: string; label: string }> = {
    sky: {
      card: 'bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-900/50',
      label: 'text-sky-800 dark:text-sky-200',
    },
    rose: {
      card: 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50',
      label: 'text-rose-800 dark:text-rose-200',
    },
    neutral: {
      card: 'bg-card border-border',
      label: 'text-muted-foreground',
    },
  };
  const v = variantCls[variant];

  return (
    <div className={cn('border rounded-md p-2.5 flex flex-col gap-1 min-w-0', v.card)}>
      <div className={cn('text-[10px] font-semibold uppercase tracking-wide truncate', v.label)}>
        {titulo}
      </div>
      <div className="text-base font-bold text-foreground tabular-nums truncate leading-tight">
        {fmtBRL(linha.meta)}
      </div>
      {!metaOnly && (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] text-muted-foreground truncate">
            Real {fmtBRL(linha.real)}
          </span>
          <DeltaBadge delta={linha.delta} />
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────

export function BlocoResumoExecutivo({ data, saldoInicialMeta, saldoInicialReal, desfocarDashboard = false, onLinhaClick }: Props) {
  if (!data) {
    return (
      <section className="bg-card border border-border rounded-lg p-4 mb-4">
        <div className="text-sm text-muted-foreground py-8 text-center">
          Carregando resumo executivo…
        </div>
      </section>
    );
  }

  const linhasEntrada: LinhaExecutiva[] = [
    data.receitaPecuaria,
    data.receitaAgricultura,
    data.outrasReceitas,
    data.entradasFinanceiras,
  ];

  const linhasSaida: LinhaExecutiva[] = [
    data.custeioPecuaria,
    data.custeioAgricultura,
    data.jurosPecuaria,
    data.jurosAgricultura,
    data.investimentoPecuaria,
    data.investimentoAgricultura,
    data.reposicaoBovinos,
    data.amortizacaoPecuaria,
    data.amortizacaoAgricultura,
    data.dividendos,
    data.deducoesReceita,
  ];

  const chartData = MESES.map((nome, i) => ({
    mes: nome,
    'META 2026': data.serieMeta[i] ?? 0,
    'REAL 2025': data.serieReal[i] ?? 0,
  }));

  return (
    <section className="bg-card border border-border rounded-lg p-4 mb-4">
      <h2 className="text-base font-bold text-foreground mb-1">Fluxo de Caixa Previsto</h2>
      <p className="text-xs text-muted-foreground mb-3">
        META 2026 (planejamento financeiro) vs Real 2025 (financeiro lançamentos).
        Gráfico: saldo acumulado projetado mês a mês.
      </p>

      {!data.conciliado && (
        <div className="mb-3 p-2 rounded border border-rose-300 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30 text-[11px] text-rose-800 dark:text-rose-200">
          Planejamento não conciliado: diferença de {fmtBRL(data.diferencaMeta)}. Verificar
          classificação.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 mb-4">
        <div
          className={cn(
            'lg:col-span-3 border border-border rounded-md p-2 h-72 relative',
            desfocarDashboard && 'overflow-hidden',
          )}
        >
          <div className={cn(desfocarDashboard && 'blur-md pointer-events-none select-none', 'w-full h-full')}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="g-meta" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="g-real" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9ca3af" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#9ca3af" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) =>
                  new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
                    .format(v)
                }
                width={56}
              />
              <Tooltip
                content={<FluxoCaixaTooltip />}
                cursor={{ stroke: 'hsl(var(--muted-foreground) / 0.3)', strokeWidth: 1 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="META 2026"
                stroke="#f97316"
                strokeWidth={2}
                fill="url(#g-meta)"
              />
              <Area
                type="monotone"
                dataKey="REAL 2025"
                stroke="#9ca3af"
                strokeWidth={2}
                fill="url(#g-real)"
              />
            </AreaChart>
          </ResponsiveContainer>
          </div>
          {desfocarDashboard && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[2px]">
              <span className="text-xs font-semibold text-foreground/70 bg-background/80 border border-border rounded-md px-3 py-1.5">
                Indisponível neste escopo
              </span>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 flex flex-col gap-2">
          <CardTotal titulo="Total Entradas META" linha={data.totalEntradas} variant="sky" />
          <CardTotal titulo="Total Saídas META" linha={data.totalSaidas} variant="rose" />
          <div className={cn('grid grid-cols-2 gap-2 relative')}>
            <div className={cn(desfocarDashboard && 'blur-md pointer-events-none select-none')}>
              <CardTotal titulo="Saldo Caixa Final Meta" linha={montarLinhaSaldoFinal(data)} variant="neutral" metaOnly />
            </div>
            <div className={cn(desfocarDashboard && 'blur-md pointer-events-none select-none')}>
              <CardTotal
                titulo="Dif. Caixa no Ano - Meta"
                linha={montarLinhaDifAno(data, saldoInicialMeta, saldoInicialReal)}
                variant="neutral"
                metaOnly
              />
            </div>
            {desfocarDashboard && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[10px] font-semibold text-foreground/70 bg-background/80 border border-border rounded px-2 py-0.5">
                  Indisponível
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
            Entradas
          </h3>
          <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_70px] gap-1 items-center pb-1 border-b border-border text-[10px] font-semibold uppercase text-muted-foreground">
            <div></div>
            <div className={cn('text-right', META_COLUNA)}>META 2026</div>
            <div className="text-right">REAL 2025</div>
            <div className="text-right">Δ%</div>
          </div>
          <LinhaRow linha={data.totalEntradas} destaque />
          {linhasEntrada.map(l => (
            <LinhaRow
              key={l.label}
              linha={l}
              onClick={l === data.receitaPecuaria && onLinhaClick ? () => onLinhaClick('receitaPecuaria') : undefined}
            />
          ))}
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
            Saídas
          </h3>
          <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_70px] gap-1 items-center pb-1 border-b border-border text-[10px] font-semibold uppercase text-muted-foreground">
            <div></div>
            <div className={cn('text-right', META_COLUNA)}>META 2026</div>
            <div className="text-right">REAL 2025</div>
            <div className="text-right">Δ%</div>
          </div>
          <LinhaRow linha={data.totalSaidas} destaque />
          {linhasSaida.map(l => (
            <LinhaRow key={l.label} linha={l} />
          ))}
        </div>
      </div>
    </section>
  );
}
