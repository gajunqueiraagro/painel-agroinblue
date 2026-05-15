/**
 * BLOCO 1 — Resumo Macro Executivo MVP.
 * META 2026 (planejamento_financeiro) vs Real 2025 (financeiro_lancamentos_v2).
 * Zero cálculo aqui — recebe DTO pronto de buildBlocoResumoExecutivo.
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
import type {
  BlocoResumoExecutivoData,
  LinhaExecutiva,
} from '@/v2/lib/blocoResumoExecutivoTypes';

interface Props {
  data: BlocoResumoExecutivoData | null;
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

function LinhaRow({ linha }: { linha: LinhaExecutiva }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center py-1 border-b border-border/30 last:border-0">
      <div className="text-xs text-foreground truncate">{linha.label}</div>
      <div className="text-xs text-foreground/80 tabular-nums text-right">{fmtBRL(linha.meta)}</div>
      <div className="text-xs text-muted-foreground tabular-nums text-right">
        {fmtBRL(linha.real)}
      </div>
      <div className="text-right">
        <DeltaBadge delta={linha.delta} />
      </div>
    </div>
  );
}

function CardTotal({ titulo, linha }: { titulo: string; linha: LinhaExecutiva }) {
  return (
    <div className="bg-card border border-border rounded-md p-3 flex flex-col gap-1.5 min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
        {titulo}
      </div>
      <div className="text-lg font-bold text-foreground tabular-nums truncate">
        {fmtBRL(linha.meta)}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] text-muted-foreground truncate">
          Real 2025: {fmtBRL(linha.real)}
        </span>
        <DeltaBadge delta={linha.delta} />
      </div>
    </div>
  );
}

export function BlocoResumoExecutivo({ data }: Props) {
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
    'META linear': data.serieMetaLinear[i] ?? 0,
  }));

  return (
    <section className="bg-card border border-border rounded-lg p-4 mb-4">
      <h2 className="text-base font-bold text-foreground mb-1">Resumo Macro Executivo</h2>
      <p className="text-xs text-muted-foreground mb-3">
        META 2026 (planejamento financeiro) vs Real 2025 (financeiro lançamentos).
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
              <Area
                type="monotone"
                dataKey="META linear"
                stroke="#9a3412"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                fill="none"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-2">
          <CardTotal titulo="Total Entradas" linha={data.totalEntradas} />
          <CardTotal titulo="Total Saídas" linha={data.totalSaidas} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-2">
            Entradas
          </h3>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center pb-1 border-b border-border text-[10px] font-semibold uppercase text-muted-foreground">
            <div></div>
            <div className="text-right">META 2026</div>
            <div className="text-right">REAL 2025</div>
            <div className="text-right">Δ%</div>
          </div>
          {linhasEntrada.map(l => (
            <LinhaRow key={l.label} linha={l} />
          ))}
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-2">
            Saídas
          </h3>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center pb-1 border-b border-border text-[10px] font-semibold uppercase text-muted-foreground">
            <div></div>
            <div className="text-right">META 2026</div>
            <div className="text-right">REAL 2025</div>
            <div className="text-right">Δ%</div>
          </div>
          {linhasSaida.map(l => (
            <LinhaRow key={l.label} linha={l} />
          ))}
        </div>
      </div>
    </section>
  );
}
