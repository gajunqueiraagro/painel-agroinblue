/**
 * Modal executivo de drilldown de uma LinhaExecutiva do BlocoResumoExecutivo.
 * Componente BURRO: recebe LinhaExecutivaModalData pronto e apenas renderiza.
 * Não classifica, não filtra, não roteia.
 *
 * Genérico — o caller passa `titulo` e `composicaoOficialLabel` específicos da
 * linha (ex.: "Receita Pecuária" / 'grupo_custo = "Receita Pecuária"').
 *
 * Invariante visual: banner de divergência VISÍVEL quando soma do breakdown
 * não bate com a linha consolidada do DTO (data.conciliado === false).
 */
import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Area, AreaChart,
  Bar, BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis, YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import type { LinhaExecutivaModalData, DeltaSeguro } from '@/v2/lib/linhaExecutivaModalTypes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: LinhaExecutivaModalData;
  /** Título do modal (ex.: "Receita Pecuária"). */
  titulo: string;
  /** Texto da composição oficial exibido no disclaimer
   *  (ex.: 'grupo_custo = "Receita Pecuária"'). */
  composicaoOficialLabel: string;
  /** Callback opcional. Quando undefined, botão "Ver detalhes" fica oculto. */
  onVerDetalhes?: () => void;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Cores oficiais do modal.
const COR_META = '#f97316'; // orange-500
const COR_REAL = '#94a3b8'; // slate-400 (azul-cinza claro)

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(v);

const fmtPct = (d: DeltaSeguro): string => {
  if (d === null || !Number.isFinite(d)) return '—';
  const pct = d * 100;
  const sinal = pct >= 0 ? '+' : '';
  return `${sinal}${pct.toFixed(1)}%`;
};

// Regra única de cor para Δ% em TODOS os lugares (header + tabela + cards):
// positivo blue-700, negativo rose-700, zero/null muted.
const corDelta = (d: DeltaSeguro): string => {
  if (d === null || !Number.isFinite(d) || d === 0) return 'text-muted-foreground';
  return d > 0 ? 'text-blue-700' : 'text-rose-700';
};

const corDeltaHeader = corDelta;

// Cor da Diferença/Δ% nos CARDS de top impacto.
const corImpactoCard = (impactoAbs: number): string => {
  if (impactoAbs > 0) return 'text-blue-700 dark:text-blue-300';
  if (impactoAbs < 0) return 'text-rose-700 dark:text-rose-300';
  return 'text-muted-foreground';
};

// Formatador compacto para eixo Y (R$ 1,2 mi / R$ 850 mil etc).
const fmtBRLCompacto = (v: number): string => {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toFixed(1).replace('.', ',')} bi`;
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toFixed(0)} mil`;
  return fmtBRL(v);
};

interface TooltipItem { dataKey?: string | number; value?: number; name?: string }

function GraficoTooltip({
  active, payload, label,
}: { active?: boolean; payload?: TooltipItem[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border/50 bg-background/90 backdrop-blur-sm px-2.5 py-1.5 shadow-sm text-[11px]">
      <div className="font-semibold text-foreground mb-0.5">{label}</div>
      {payload.map((p, i) => {
        const isMeta = String(p.dataKey ?? '').toLowerCase().includes('meta');
        return (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: isMeta ? COR_META : COR_REAL }}
            />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="tabular-nums text-foreground">
              {fmtBRL(p.value ?? 0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Legenda com dots vazados (círculo branco com borda colorida) e texto na cor da série.
interface LegendItem { value?: string; color?: string }
function GraficoLegend({ payload }: { payload?: LegendItem[] }) {
  if (!payload || payload.length === 0) return null;
  return (
    <div className="flex justify-center gap-4 mt-2 text-[11px]">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="3.75" fill="white" stroke={entry.color} strokeWidth="1.5" />
          </svg>
          <span style={{ color: entry.color }} className="font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function LinhaExecutivaExecutivoModal({
  open,
  onOpenChange,
  data,
  titulo,
  composicaoOficialLabel,
  onVerDetalhes,
}: Props) {
  // Série mensal consolidada (soma vertical de todos os subcentros).
  const dadosMensais = useMemo(() => {
    const out = Array.from({ length: 12 }, (_, i) => ({
      mes: MESES[i],
      real: 0,
      meta: 0,
    }));
    for (const c of data.porCentro) {
      for (const s of c.subcentros) {
        for (let i = 0; i < 12; i++) {
          out[i].real += s.realMeses[i] ?? 0;
          out[i].meta += s.metaMeses[i] ?? 0;
        }
      }
    }
    return out;
  }, [data.porCentro]);

  // Série acumulada Jan→Dez (running sum).
  const dadosAcumulado = useMemo(() => {
    let realAc = 0;
    let metaAc = 0;
    return dadosMensais.map(d => {
      realAc += d.real;
      metaAc += d.meta;
      return { mes: d.mes, realAcum: realAc, metaAcum: metaAc };
    });
  }, [dadosMensais]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {/* ── Header sticky 1 linha ── */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-3.5">
          <DialogHeader className="space-y-0">
            <div className="flex items-center gap-4 flex-wrap">
              <DialogTitle className="text-[17px] font-semibold m-0">
                {titulo}
              </DialogTitle>
              <div className="flex items-center gap-3 flex-wrap tabular-nums text-sm">
                <div>
                  <span className="text-[11px] uppercase tracking-[0.3px] text-muted-foreground mr-1.5">REAL 2025</span>
                  <span className="font-semibold text-foreground">{fmtBRL(data.linha.real)}</span>
                </div>
                <span className="text-muted-foreground/40">·</span>
                <div>
                  <span className="text-[11px] uppercase tracking-[0.3px] text-muted-foreground mr-1.5">META 2026</span>
                  <span className="font-semibold text-orange-500">{fmtBRL(data.linha.meta)}</span>
                </div>
                <span className="text-muted-foreground/40">·</span>
                <div>
                  <span className="text-[11px] uppercase tracking-[0.3px] text-muted-foreground mr-1.5">Δ%</span>
                  <span className={cn('font-semibold', corDeltaHeader(data.linha.delta as DeltaSeguro))}>
                    {fmtPct(data.linha.delta as DeltaSeguro)}
                  </span>
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* ── Corpo (padding interno) ── */}
        <div className="px-5 pb-5 space-y-4">

        {/* Banner de divergência (invariante numérica) */}
        {!data.conciliado && (
          <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-800 px-3 py-2 text-[12px] dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-200">
            <div className="font-semibold mb-0.5">⚠️ Divergência detectada</div>
            <div>Breakdown não bate com o card.</div>
            <div>
              META: diff de <span className="font-semibold tabular-nums">{fmtBRL(data.diferencaMeta)}</span>.
              {' '}REAL: diff de <span className="font-semibold tabular-nums">{fmtBRL(data.diferencaReal)}</span>.
            </div>
          </div>
        )}

        {/* Banner de centros fora da ordem oficial */}
        {data.centrosForaDaOrdemOficial.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-[12px] dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-200">
            <div className="font-semibold mb-0.5">⚠️ Centros fora da ordem oficial</div>
            <div>
              {data.centrosForaDaOrdemOficial.join(', ')}. Pode indicar mudança recente no plano de contas.
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="text-[11px] text-muted-foreground">
          Composição oficial: {composicaoOficialLabel}
        </div>

        {/* ── Tabela hierárquica COMPACTA + CENTRALIZADA (max 720px) ── */}
        <div className="border border-border rounded-lg overflow-hidden max-w-[720px] mx-auto">
          {/* Header */}
          <div className="grid grid-cols-[minmax(0,1fr)_140px_140px_80px] gap-1 items-center px-3.5 py-[9px] bg-muted text-[11px] uppercase tracking-[0.3px] font-medium">
            <div></div>
            <div className="text-right text-muted-foreground">REAL 2025</div>
            <div className="text-right text-orange-500">META 2026</div>
            <div className="text-right text-slate-400">Δ%</div>
          </div>
          {/* Centros */}
          {data.porCentro.map((centro) => (
            <div key={centro.centro_custo}>
              <div className="grid grid-cols-[minmax(0,1fr)_140px_140px_80px] gap-1 items-center px-3.5 py-[9px] border-t border-border text-[13px] font-semibold">
                <div className="truncate text-foreground">{centro.centro_custo}</div>
                <div className="text-right tabular-nums text-foreground">{fmtBRL(centro.realTotal)}</div>
                <div className="text-right tabular-nums text-orange-500">{fmtBRL(centro.metaTotal)}</div>
                <div className={cn('text-right tabular-nums font-semibold', corDelta(centro.delta))}>
                  {fmtPct(centro.delta)}
                </div>
              </div>
              {centro.subcentros.map((sub) => (
                <div
                  key={sub.subcentro}
                  className="grid grid-cols-[minmax(0,1fr)_140px_140px_80px] gap-1 items-center pl-7 pr-3.5 py-[3px] border-t border-border text-[11px] leading-[1.3] font-normal"
                >
                  <div className="truncate text-muted-foreground">{sub.subcentro}</div>
                  <div className="text-right tabular-nums text-muted-foreground">{fmtBRL(sub.realTotal)}</div>
                  <div className="text-right tabular-nums text-orange-500">{fmtBRL(sub.metaTotal)}</div>
                  <div className={cn('text-right tabular-nums', corDelta(sub.delta))}>
                    {fmtPct(sub.delta)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* ── 2 gráficos lado a lado ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mensal — barras agrupadas REAL/META encostadas */}
          <div className="border border-border rounded-md p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Mensal
            </h3>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosMensais} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={0} barCategoryGap="18%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={fmtBRLCompacto} axisLine={false} tickLine={false} width={80} />
                  <Tooltip content={<GraficoTooltip />} cursor={{ fill: 'hsl(var(--muted-foreground) / 0.08)' }} />
                  <Legend content={<GraficoLegend />} />
                  <Bar dataKey="real" name="REAL 2025" fill={COR_REAL} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="meta" name="META 2026" fill={COR_META} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Acumulado Jan→Dez — areas com gradient */}
          <div className="border border-border rounded-md p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Acumulado
            </h3>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dadosAcumulado} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COR_REAL} stopOpacity={0.30} />
                      <stop offset="100%" stopColor={COR_REAL} stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="gradMeta" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COR_META} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={COR_META} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={fmtBRLCompacto} axisLine={false} tickLine={false} width={80} />
                  <Tooltip content={<GraficoTooltip />} />
                  <Legend content={<GraficoLegend />} />
                  <Area type="monotone" dataKey="realAcum" name="REAL 2025" stroke={COR_REAL} strokeWidth={2.6} fill="url(#gradReal)" dot={false} />
                  <Area type="monotone" dataKey="metaAcum" name="META 2026" stroke={COR_META} strokeWidth={2.6} fill="url(#gradMeta)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Top 3 cards (full-width inferior, grid 3 colunas) ── */}
        {data.topImpactos.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.4px] text-muted-foreground font-medium mb-2">
              Maiores impactos na variação
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {data.topImpactos.map((sub) => {
                const cardCls =
                  sub.impactoAbs > 0
                    ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50'
                    : sub.impactoAbs < 0
                      ? 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50'
                      : 'bg-muted border-border';
                const corValor = corImpactoCard(sub.impactoAbs);
                return (
                  <div key={sub.subcentro} className={cn('border rounded-lg px-3 py-2.5 flex flex-col gap-0.5 min-w-0', cardCls)}>
                    <div className="text-[12px] font-semibold leading-[1.3] truncate text-foreground">{sub.subcentro}</div>
                    <div className="text-[10px] text-muted-foreground truncate mb-1.5">{sub.centro_custo}</div>
                    <div className="text-[11px] leading-[1.4] tabular-nums">
                      <span className="text-muted-foreground">REAL 2025 </span>
                      <span className="text-foreground">{fmtBRL(sub.realTotal)}</span>
                    </div>
                    <div className="text-[11px] leading-[1.4] tabular-nums text-orange-500">
                      META 26 {fmtBRL(sub.metaTotal)}
                    </div>
                    <div className="text-[11px] leading-[1.4] tabular-nums">
                      <span className="text-muted-foreground">Diferença </span>
                      <span className={cn('font-semibold', corValor)}>{fmtBRL(sub.impactoAbs)}</span>
                    </div>
                    <div className={cn('text-[11px] leading-[1.4] tabular-nums font-semibold', corValor)}>
                      Δ% {fmtPct(sub.delta)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer — botão "Ver detalhes" SOMENTE quando onVerDetalhes existe */}
        {onVerDetalhes && (
          <div className="flex justify-end pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => onVerDetalhes?.()}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Ver detalhes no Financeiro
            </button>
          </div>
        )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
