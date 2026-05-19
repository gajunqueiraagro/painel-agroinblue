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

type ModoModal = 'planejamento' | 'fechamento';

interface CfgModo {
  labelReal: string;      // "REAL 25" / "REAL 26" — header KPI compacto
  labelMeta: string;      // "META 26" — header KPI (mesmo nos 2 modos)
  labelRealLong: string;  // "REAL 2025" / "REAL 2026" — tabela, gráficos, top cards
  labelMetaLong: string;  // "META 2026" — idem
  corReal: string;        // '#94a3b8' (slate-400) / '#0284c7' (sky-600)
  corMeta: string;        // '#f97316' (orange-500) — mesmo nos 2 modos
}

const CFG_MODOS: Record<ModoModal, CfgModo> = {
  planejamento: {
    labelReal: 'REAL 25',
    labelMeta: 'META 26',
    labelRealLong: 'REAL 2025',
    labelMetaLong: 'META 2026',
    corReal: '#94a3b8',
    corMeta: '#f97316',
  },
  fechamento: {
    labelReal: 'REAL 26',
    labelMeta: 'META 26',
    labelRealLong: 'REAL 2026',
    labelMetaLong: 'META 2026',
    corReal: '#0284c7',
    corMeta: '#f97316',
  },
};

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
  /** Modo de uso do modal. Default 'planejamento' (mantém comportamento atual).
   *  'fechamento' inverte ordem visual (META | REAL | Δ), troca cor do REAL
   *  para sky-600, troca labels REAL 2025 → REAL 2026, e usa
   *  realAnoCorrente/deltaAnoCorrente da LinhaExecutiva como base do REAL. */
  modo?: ModoModal;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_CURTOS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;

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

/** Δ R$ com sinal explícito. Não pinta — caller decide a cor. */
function formatDeltaReais(valor: number): string {
  if (valor === 0) return 'R$ 0';
  const sign = valor > 0 ? '+' : '-';
  const abs = Math.abs(valor);
  return sign + 'R$ ' + abs.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

// Eixo X: rótulos em 1 letra (J F M A M J J A S O N D).
const formatMesCurto = (v: string): string => {
  const idx = MESES.indexOf(v);
  return idx >= 0 ? MESES_CURTOS[idx] : v;
};

// Cor da Diferença/Δ% nos CARDS de top impacto (mantém regra por sinal).
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
  active, payload, label, corReal, corMeta,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string;
  corReal: string;
  corMeta: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border/50 bg-background/90 backdrop-blur-sm px-2.5 py-1.5 shadow-sm text-[11px]">
      <div className="font-semibold text-foreground mb-0.5">{label}</div>
      {payload.map((p, i) => {
        // Detecção por dataKey: 'meta'/'metaAcum' → cor meta; demais → cor real.
        // Label mantém substring 'meta' em ambos os modos (META 26 / META 2026).
        const isMeta = String(p.dataKey ?? '').toLowerCase().includes('meta');
        return (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: isMeta ? corMeta : corReal }}
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
  modo = 'planejamento',
}: Props) {
  const cfg = CFG_MODOS[modo];
  const isFechamento = modo === 'fechamento';
  // Em modo Fechamento, o "REAL" do header usa realAnoCorrente / deltaAnoCorrente
  // (campos opcionais do LinhaExecutiva populados quando lancFin2026 é passado
  // ao buildBlocoResumoExecutivo). Caller PRECISA garantir essa cobertura no
  // modo Fechamento; caso contrário, fallback para 0 evita NaN no render.
  const realHeader = isFechamento ? (data.linha.realAnoCorrente ?? 0) : data.linha.real;
  const deltaHeader: DeltaSeguro = isFechamento
    ? (data.linha.deltaAnoCorrente ?? null)
    : (data.linha.delta as DeltaSeguro);
  // Δ R$ Fechamento = Real - Meta; Planejamento = Meta - Real.
  const deltaRsHeader = isFechamento
    ? realHeader - data.linha.meta
    : data.linha.meta - data.linha.real;

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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        {/* ── Header sticky em 2 linhas ── */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-3.5">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-semibold m-0 leading-tight text-slate-900">
              {titulo}
            </DialogTitle>
            <div className="flex items-center gap-2 tabular-nums whitespace-nowrap overflow-x-auto">
              <div>
                <span className="text-[10px] uppercase text-slate-500 mr-1">{cfg.labelReal}</span>
                <span className="text-[12px] font-semibold" style={{ color: cfg.corReal }}>{fmtBRL(realHeader)}</span>
              </div>
              <span className="text-[10px] text-slate-300">·</span>
              <div>
                <span className="text-[10px] uppercase text-slate-500 mr-1">{cfg.labelMeta}</span>
                <span className="text-[12px] font-semibold" style={{ color: cfg.corMeta }}>{fmtBRL(data.linha.meta)}</span>
              </div>
              <span className="text-[10px] text-slate-300">·</span>
              <div>
                <span className="text-[10px] uppercase text-slate-500 mr-1">Δ R$</span>
                <span className="text-[12px] font-semibold text-slate-500">{formatDeltaReais(deltaRsHeader)}</span>
              </div>
              <span className="text-[10px] text-slate-300">·</span>
              <div>
                <span className="text-[10px] uppercase text-slate-500 mr-1">Δ%</span>
                <span className="text-[12px] font-semibold text-slate-500">{fmtPct(deltaHeader)}</span>
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
              {cfg.labelMeta}: diff de <span className="font-semibold tabular-nums">{fmtBRL(data.diferencaMeta)}</span>.
              {' '}{cfg.labelReal}: diff de <span className="font-semibold tabular-nums">{fmtBRL(data.diferencaReal)}</span>.
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
          {/* Header — cabeçalhos das colunas CENTRALIZADOS.
              Ordem dinâmica por modo: Planejamento = REAL | META; Fechamento = META | REAL. */}
          <div className="grid grid-cols-[minmax(0,1fr)_105px_105px_105px_70px] gap-1 items-center px-3.5 py-[9px] bg-muted text-[11px] uppercase tracking-[0.3px] font-medium">
            <div></div>
            {isFechamento ? (
              <>
                <div className="text-center" style={{ color: cfg.corMeta }}>{cfg.labelMetaLong}</div>
                <div className="text-center" style={{ color: cfg.corReal }}>{cfg.labelRealLong}</div>
              </>
            ) : (
              <>
                <div className="text-center text-muted-foreground">{cfg.labelRealLong}</div>
                <div className="text-center" style={{ color: cfg.corMeta }}>{cfg.labelMetaLong}</div>
              </>
            )}
            <div className="text-center text-slate-400">Δ R$</div>
            <div className="text-center text-slate-400">Δ%</div>
          </div>
          {/* Centros (cada centro = bloco executivo).
              Δ R$ — Planejamento = Meta - Real; Fechamento = Real - Meta. */}
          {data.porCentro.map((centro) => {
            const deltaRs = isFechamento
              ? centro.realTotal - centro.metaTotal
              : centro.metaTotal - centro.realTotal;
            const colReal = (
              <div className="text-right tabular-nums" style={{ color: cfg.corReal }}>{fmtBRL(centro.realTotal)}</div>
            );
            const colMeta = (
              <div className="text-right tabular-nums" style={{ color: cfg.corMeta }}>{fmtBRL(centro.metaTotal)}</div>
            );
            return (
              <div key={centro.centro_custo} className="mt-1 first:mt-0">
                <div className="grid grid-cols-[minmax(0,1fr)_105px_105px_105px_70px] gap-1 items-center px-3 py-2 bg-slate-200 dark:bg-slate-800 text-[12px] font-bold uppercase tracking-[0.2px]">
                  <div className="truncate text-foreground">{centro.centro_custo}</div>
                  {isFechamento ? (
                    <>
                      {colMeta}
                      {colReal}
                    </>
                  ) : (
                    <>
                      {colReal}
                      {colMeta}
                    </>
                  )}
                  <div className="text-right tabular-nums text-slate-500">{formatDeltaReais(deltaRs)}</div>
                  <div className="text-right tabular-nums text-slate-500">{fmtPct(centro.delta)}</div>
                </div>
                {centro.subcentros.map((sub) => {
                  const subReal = (
                    <div className="text-right tabular-nums" style={{ color: cfg.corReal }}>{fmtBRL(sub.realTotal)}</div>
                  );
                  const subMeta = (
                    <div className="text-right tabular-nums" style={{ color: cfg.corMeta }}>{fmtBRL(sub.metaTotal)}</div>
                  );
                  const impactoSub = isFechamento ? -sub.impactoAbs : sub.impactoAbs;
                  return (
                    <div
                      key={sub.subcentro}
                      className="grid grid-cols-[minmax(0,1fr)_105px_105px_105px_70px] gap-1 items-center pl-6 pr-3 py-[3px] border-t border-border/40 text-[11px] leading-[1.3] font-normal"
                    >
                      <div className="truncate text-muted-foreground">{sub.subcentro}</div>
                      {isFechamento ? (
                        <>
                          {subMeta}
                          {subReal}
                        </>
                      ) : (
                        <>
                          {subReal}
                          {subMeta}
                        </>
                      )}
                      <div className="text-right tabular-nums text-slate-400">{formatDeltaReais(impactoSub)}</div>
                      <div className="text-right tabular-nums text-slate-400">{fmtPct(sub.delta)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
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
                  <XAxis
                    dataKey="mes"
                    tickFormatter={formatMesCurto}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={fmtBRLCompacto} axisLine={false} tickLine={false} width={80} />
                  <Tooltip
                    content={(props) => <GraficoTooltip {...(props as { active?: boolean; payload?: TooltipItem[]; label?: string })} corReal={cfg.corReal} corMeta={cfg.corMeta} />}
                    cursor={{ fill: 'hsl(var(--muted-foreground) / 0.08)' }}
                  />
                  <Legend content={<GraficoLegend />} />
                  <Bar dataKey="real" name={cfg.labelRealLong} fill={cfg.corReal} radius={[2, 2, 0, 0]} opacity={0.55} />
                  <Bar dataKey="meta" name={cfg.labelMetaLong} fill={cfg.corMeta} radius={[2, 2, 0, 0]} opacity={0.55} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Acumulado Jan→Dez — areas finas + dots + gradient leve */}
          <div className="border border-border rounded-md p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Acumulado
            </h3>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dadosAcumulado} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradRealAc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cfg.corReal} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={cfg.corReal} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradMetaAc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cfg.corMeta} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={cfg.corMeta} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tickFormatter={formatMesCurto}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={fmtBRLCompacto} axisLine={false} tickLine={false} width={80} />
                  <Tooltip
                    content={(props) => <GraficoTooltip {...(props as { active?: boolean; payload?: TooltipItem[]; label?: string })} corReal={cfg.corReal} corMeta={cfg.corMeta} />}
                  />
                  <Legend content={<GraficoLegend />} />
                  <Area
                    type="monotone"
                    dataKey="realAcum"
                    name={cfg.labelRealLong}
                    stroke={cfg.corReal}
                    strokeWidth={1.5}
                    fill="url(#gradRealAc)"
                    dot={{ r: 2.5, fill: '#ffffff', stroke: cfg.corReal, strokeWidth: 1.4 }}
                    activeDot={{ r: 3.5, fill: '#ffffff', stroke: cfg.corReal, strokeWidth: 1.6 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="metaAcum"
                    name={cfg.labelMetaLong}
                    stroke={cfg.corMeta}
                    strokeWidth={1.5}
                    fill="url(#gradMetaAc)"
                    dot={{ r: 2.5, fill: '#ffffff', stroke: cfg.corMeta, strokeWidth: 1.4 }}
                    activeDot={{ r: 3.5, fill: '#ffffff', stroke: cfg.corMeta, strokeWidth: 1.6 }}
                  />
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
                // Fechamento: Δ = Real - Meta → inverte sinal do impactoAbs do builder
                // (que vem como Meta - Real). Cor/card seguem o sinal invertido.
                const impactoAbsAjustado = isFechamento ? -sub.impactoAbs : sub.impactoAbs;
                const cardCls =
                  impactoAbsAjustado > 0
                    ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50'
                    : impactoAbsAjustado < 0
                      ? 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50'
                      : 'bg-muted border-border';
                const corValor = corImpactoCard(impactoAbsAjustado);
                return (
                  <div key={sub.subcentro} className={cn('border rounded-lg px-3 py-2.5 flex flex-col gap-0.5 min-w-0', cardCls)}>
                    <div className="text-[12px] font-semibold leading-[1.3] truncate text-foreground">{sub.subcentro}</div>
                    <div className="text-[10px] text-muted-foreground truncate mb-1.5">{sub.centro_custo}</div>
                    <div className="text-[11px] leading-[1.4] tabular-nums">
                      <span className="text-muted-foreground">{cfg.labelRealLong} </span>
                      <span style={{ color: cfg.corReal }}>{fmtBRL(sub.realTotal)}</span>
                    </div>
                    <div className="text-[11px] leading-[1.4] tabular-nums" style={{ color: cfg.corMeta }}>
                      {cfg.labelMeta} {fmtBRL(sub.metaTotal)}
                    </div>
                    <div className="text-[11px] leading-[1.4] tabular-nums">
                      <span className="text-muted-foreground">Diferença </span>
                      <span className={cn('font-semibold', corValor)}>{fmtBRL(impactoAbsAjustado)}</span>
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
