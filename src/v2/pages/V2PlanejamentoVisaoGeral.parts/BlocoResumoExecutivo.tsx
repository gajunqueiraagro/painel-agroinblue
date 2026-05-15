/**
 * BLOCO 1 — Resumo Macro Executivo MVP.
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

function LinhaRow({ linha, destaque = false }: { linha: LinhaExecutiva; destaque?: boolean }) {
  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center py-0.5 border-b border-border/30 last:border-0',
        destaque && 'bg-muted/40 font-bold border-b-2 border-foreground/20 py-1',
      )}
    >
      <div className={cn('text-xs truncate', destaque ? 'text-foreground uppercase tracking-wide text-[11px]' : 'text-foreground')}>
        {linha.label}
      </div>
      <div className={cn('text-xs tabular-nums text-right', destaque ? 'text-foreground' : 'text-foreground/80')}>
        {fmtBRL(linha.meta)}
      </div>
      <div className={cn('text-xs tabular-nums text-right', destaque ? 'text-foreground/80' : 'text-muted-foreground')}>
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
}: {
  titulo: string;
  linha: LinhaExecutiva;
  variant?: CardVariant;
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
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[10px] text-muted-foreground truncate">
          Real {fmtBRL(linha.real)}
        </span>
        <DeltaBadge delta={linha.delta} />
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────

export function BlocoResumoExecutivo({ data, saldoInicialMeta, saldoInicialReal }: Props) {
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
      <h2 className="text-base font-bold text-foreground mb-1">Resumo Macro Executivo</h2>
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
        <div className="lg:col-span-3 border border-border rounded-md p-2 h-72">
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
                formatter={(v: number) => fmtBRL(v)}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{ fontSize: 11 }}
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

        <div className="lg:col-span-2 flex flex-col gap-2">
          <CardTotal titulo="Total Entradas" linha={data.totalEntradas} variant="sky" />
          <CardTotal titulo="Total Saídas" linha={data.totalSaidas} variant="rose" />
          <div className="grid grid-cols-2 gap-2">
            <CardTotal titulo="Saldo Caixa Final" linha={montarLinhaSaldoFinal(data)} variant="neutral" />
            <CardTotal
              titulo="Dif. Caixa no Ano"
              linha={montarLinhaDifAno(data, saldoInicialMeta, saldoInicialReal)}
              variant="neutral"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
            Entradas
          </h3>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center pb-1 border-b border-border text-[10px] font-semibold uppercase text-muted-foreground">
            <div></div>
            <div className="text-right">META 2026</div>
            <div className="text-right">REAL 2025</div>
            <div className="text-right">Δ%</div>
          </div>
          <LinhaRow linha={data.totalEntradas} destaque />
          {linhasEntrada.map(l => (
            <LinhaRow key={l.label} linha={l} />
          ))}
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
            Saídas
          </h3>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center pb-1 border-b border-border text-[10px] font-semibold uppercase text-muted-foreground">
            <div></div>
            <div className="text-right">META 2026</div>
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
