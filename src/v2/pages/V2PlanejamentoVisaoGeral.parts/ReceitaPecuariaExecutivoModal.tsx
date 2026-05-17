/**
 * Modal executivo "Receita Pecuária" — drilldown da linha consolidada do
 * BlocoResumoExecutivo. Componente BURRO: recebe ReceitaPecuariaModalData
 * pronto e apenas renderiza. Não classifica, não filtra, não roteia.
 *
 * Invariante visual: banner de divergência VISÍVEL quando soma do breakdown
 * não bate com a linha consolidada do DTO (data.conciliado === false).
 */
import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Bar, BarChart,
  CartesianGrid,
  Legend,
  Line, LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis, YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import type { ReceitaPecuariaModalData, DeltaSeguro } from '@/v2/lib/receitaPecuariaModalTypes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReceitaPecuariaModalData;
  /** Callback opcional. Nesta entrega NÃO é cabeado — botão "Ver detalhes" fica oculto. */
  onVerDetalhes?: () => void;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Cores idênticas às do BlocoResumoExecutivo
const COR_META = '#f97316'; // orange-500
const COR_REAL = '#374151'; // gray-700

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

const corDelta = (d: DeltaSeguro): string => {
  if (d === null || !Number.isFinite(d)) return 'text-muted-foreground';
  return d >= 0 ? 'text-emerald-600' : 'text-rose-600';
};

// Cor do Δ% no HEADER do modal: negativo=rose-700, positivo=blue-700,
// zero=neutro, null=neutro. Distinto de corDelta (que pinta linhas).
const corDeltaHeader = (d: DeltaSeguro): string => {
  if (d === null || !Number.isFinite(d) || d === 0) return 'text-foreground';
  return d > 0 ? 'text-blue-700' : 'text-rose-700';
};

// Cor da Diferença/Δ% nos CARDS de top impacto: blue=positivo, rose=negativo, neutro=zero.
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
    <div className="rounded-md border border-border/50 bg-background/85 backdrop-blur-sm px-2.5 py-1.5 shadow-sm text-[11px]">
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

export function ReceitaPecuariaExecutivoModal({ open, onOpenChange, data, onVerDetalhes }: Props) {
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {data.linha.label}
          </DialogTitle>
          <div className="flex flex-col gap-0.5 tabular-nums text-sm mt-1">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1.5">REAL 2025</span>
              <span className="text-foreground font-semibold">{fmtBRL(data.linha.real)}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1.5">META 2026</span>
              <span className="text-orange-500 font-semibold">{fmtBRL(data.linha.meta)}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1.5">Δ%</span>
              <span className={cn('font-semibold', corDeltaHeader(data.linha.delta as DeltaSeguro))}>
                {fmtPct(data.linha.delta as DeltaSeguro)}
              </span>
            </div>
          </div>
        </DialogHeader>

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
          Composição oficial: grupo_custo = "Receita Pecuária"
        </div>

        {/* Grid 50/50 topo: tabela hierárquica à esquerda, top 3 impactos à direita */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Tabela hierárquica centro → subcentros */}
          <div className="border border-border rounded-md overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_70px] gap-1 items-center px-3 py-1.5 bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div></div>
              <div className="text-right">REAL 2025</div>
              <div className="text-right text-orange-500">META 2026</div>
              <div className="text-right">Δ%</div>
            </div>
            {/* Centros */}
            {data.porCentro.map((centro) => (
              <div key={centro.centro_custo} className="border-t border-border/60 first:border-t-0">
                <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_70px] gap-1 items-center px-3 py-1.5 bg-muted/20 font-semibold text-[12px]">
                  <div className="truncate">{centro.centro_custo}</div>
                  <div className="text-right tabular-nums">{fmtBRL(centro.realTotal)}</div>
                  <div className="text-right tabular-nums text-orange-500">{fmtBRL(centro.metaTotal)}</div>
                  <div className={cn('text-right text-[11px] font-semibold tabular-nums', corDelta(centro.delta))}>
                    {fmtPct(centro.delta)}
                  </div>
                </div>
                {centro.subcentros.map((sub) => (
                  <div
                    key={sub.subcentro}
                    className="grid grid-cols-[minmax(0,1fr)_110px_110px_70px] gap-1 items-center px-3 py-[3px] text-[11px] border-t border-border/30"
                  >
                    <div className="pl-4 truncate text-foreground/80">{sub.subcentro}</div>
                    <div className="text-right tabular-nums text-muted-foreground">{fmtBRL(sub.realTotal)}</div>
                    <div className="text-right tabular-nums text-orange-500">{fmtBRL(sub.metaTotal)}</div>
                    <div className={cn('text-right tabular-nums font-semibold', corDelta(sub.delta))}>
                      {fmtPct(sub.delta)}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Top 3 maiores impactos — coluna direita, empilhados verticalmente */}
          {data.topImpactos.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Maiores impactos na variação
              </div>
              {data.topImpactos.map((sub) => {
                const cardCls =
                  sub.impactoAbs > 0
                    ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50'
                    : sub.impactoAbs < 0
                      ? 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50'
                      : 'bg-muted border-border';
                const corValor = corImpactoCard(sub.impactoAbs);
                return (
                  <div key={sub.subcentro} className={cn('border rounded-md p-2.5 flex flex-col gap-1 min-w-0', cardCls)}>
                    <div className="text-[12px] font-semibold truncate">{sub.subcentro}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{sub.centro_custo}</div>
                    <div className="text-[11px] tabular-nums text-muted-foreground">REAL 2025 {fmtBRL(sub.realTotal)}</div>
                    <div className="text-[11px] tabular-nums text-orange-500">META 26 {fmtBRL(sub.metaTotal)}</div>
                    <div className="text-[11px] tabular-nums">
                      Diferença <span className={cn('font-semibold', corValor)}>{fmtBRL(sub.impactoAbs)}</span>
                    </div>
                    <div className={cn('text-[11px] tabular-nums font-semibold', corValor)}>
                      Δ% {fmtPct(sub.delta)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <div />}
        </div>

        {/* 2 gráficos lado a lado: Mensal (barras) + Acumulado (linhas) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mensal — barras agrupadas REAL/META */}
          <div className="border border-border rounded-md p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Mensal
            </h3>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosMensais} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtBRLCompacto} axisLine={false} tickLine={false} width={80} />
                  <Tooltip content={<GraficoTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="real" name="REAL 2025" fill={COR_REAL} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="meta" name="META 2026" fill={COR_META} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Acumulado Jan→Dez — linhas REAL/META */}
          <div className="border border-border rounded-md p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Acumulado
            </h3>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dadosAcumulado} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtBRLCompacto} axisLine={false} tickLine={false} width={80} />
                  <Tooltip content={<GraficoTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="realAcum" name="REAL 2025" stroke={COR_REAL} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="metaAcum" name="META 2026" stroke={COR_META} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

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
      </DialogContent>
    </Dialog>
  );
}
