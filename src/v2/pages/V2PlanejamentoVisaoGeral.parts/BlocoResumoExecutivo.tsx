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
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Info } from 'lucide-react';
// Aliases para evitar shadowing do `Tooltip` do recharts.
import {
  Tooltip as ShTooltip,
  TooltipContent as ShTooltipContent,
  TooltipProvider as ShTooltipProvider,
  TooltipTrigger as ShTooltipTrigger,
} from '@/components/ui/tooltip';
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
  /** Callback ao clicar numa linha drilldown-friendly. Pai decide qual modal abrir.
   *  Linhas TOTAL ENTRADAS / TOTAL SAÍDAS NÃO disparam o callback (não têm modal). */
  onLinhaClick?: (id: LinhaModalKey) => void;
  /** Modo de uso do bloco. 'planejamento' (default) usa título "Fluxo de Caixa Previsto";
   *  'fechamento' usa "Fluxo de Caixa Realizado" com subtítulo de regime de caixa. */
  modo?: 'planejamento' | 'fechamento';
  /** Mês alvo do filtro (1..12). Usado APENAS para cortar a linha REAL 2026
   *  do gráfico (após mesAlvo vira null → Recharts quebra a linha). Os
   *  totais escalares já chegam prorated pelo builder. */
  mesAlvo?: number;
  /** Quando definida, o header do bloco vira clicável e abre o Modal Fluxo
   *  de Caixa Realizado. Sem prop → comportamento atual preservado. */
  onAnalisarFluxo?: () => void;
  /** Quando definido, header NÃO fica clicável e exibe Info + Tooltip
   *  com a mensagem do motivo. Mutuamente exclusivo com onAnalisarFluxo
   *  (no fluxo normal apenas um vem definido por vez). */
  motivoFluxoBloqueado?: string;
}

// Mantido sincronizado com V2PlanejamentoVisaoGeral.tsx (não importa para
// preservar desacoplamento — qualquer página que use o Bloco pode passar
// callbacks com este union literal).
export type LinhaModalKey =
  | 'receitaPecuaria' | 'receitaAgricultura' | 'outrasReceitas' | 'entradasFinanceiras'
  | 'custeioPecuaria' | 'custeioAgricultura'
  | 'jurosPecuaria' | 'jurosAgricultura'
  | 'investimentoPecuaria' | 'investimentoAgricultura'
  | 'reposicaoBovinos'
  | 'amortizacaoPecuaria' | 'amortizacaoAgricultura'
  | 'dividendos' | 'deducoesReceita';

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

function montarLinhaSaldoFinal(
  data: BlocoResumoExecutivoData,
  modo: 'planejamento' | 'fechamento' = 'planejamento',
): LinhaExecutiva {
  // Builder entrega valores prontos via saldoCaixaFinalMeta /
  // saldoCaixaFinalReal — zero cálculo aqui.
  if (modo === 'fechamento') {
    const meta = data.saldoCaixaFinalReal ?? 0;
    return { label: 'Saldo Caixa Final', meta, real: 0, delta: 0 };
  }
  const meta = data.saldoCaixaFinalMeta;
  const real = data.serieReal[11];
  return { label: 'Saldo Caixa Final', meta, real, delta: calcDeltaLocal(meta, real) };
}

function montarLinhaDifAno(
  data: BlocoResumoExecutivoData,
  saldoInicialMeta: number,
  saldoInicialReal: number,
  mesAlvo?: number,
): LinhaExecutiva {
  // Quando mesAlvo é fornecido (modo Fechamento), a diferença é Jan→mesAlvo
  // (saldo final do período − saldo inicial). Sem mesAlvo, mantém variação
  // anual (Dez − Dez/N-1) — comportamento legado do Planejamento.
  const idx = Math.max(0, Math.min(11, (mesAlvo ?? 12) - 1));
  const meta = (data.serieMeta[idx] ?? 0) - saldoInicialMeta;
  const real = Number.isFinite(saldoInicialReal)
    ? (data.serieReal[idx] ?? NaN) - saldoInicialReal
    : NaN;
  return { label: 'Dif. Caixa no Ano', meta, real, delta: calcDeltaLocal(meta, real) };
}

// ─── Sub-componentes ──────────────────────────────────────────────────

// Cores das séries do gráfico — espelham strokes dos <Area>.
const COR_META = '#f97316'; // laranja (mesma da linha META no gráfico)
const COR_REAL = '#374151'; // gray-700 (mais escuro que o stroke #9ca3af, melhor contraste no tooltip)
const COR_REAL_2026 = '#0284c7'; // sky-600 (mesma do stroke da Area REAL 2026)

// Ordem das séries no tooltip — modo Fechamento prioriza REAL 2026.
const ORDEM_TOOLTIP_FECHAMENTO: ReadonlyArray<string> = ['REAL 2026', 'META 2026', 'REAL 2025'];

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
  modo = 'planejamento',
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  modo?: 'planejamento' | 'fechamento';
}) {
  if (!active || !payload || payload.length === 0) return null;
  // Em modo Fechamento, priorizar REAL 2026 → META 2026 → REAL 2025.
  // Itens fora da ordem nominal vão para o fim preservando ordem original.
  const itens = modo === 'fechamento'
    ? [...payload].sort((a, b) => {
        const ia = ORDEM_TOOLTIP_FECHAMENTO.indexOf(String(a.dataKey));
        const ib = ORDEM_TOOLTIP_FECHAMENTO.indexOf(String(b.dataKey));
        const ra = ia === -1 ? ORDEM_TOOLTIP_FECHAMENTO.length : ia;
        const rb = ib === -1 ? ORDEM_TOOLTIP_FECHAMENTO.length : ib;
        return ra - rb;
      })
    : payload;
  const corDe = (dataKey: string): string => {
    if (dataKey === 'META 2026') return COR_META;
    if (dataKey === 'REAL 2026') return COR_REAL_2026;
    return COR_REAL;
  };
  const destacar = (dataKey: string): boolean =>
    modo === 'fechamento' ? dataKey === 'REAL 2026' : dataKey === 'META 2026';
  return (
    <div
      className="rounded-md border border-border/50 bg-background/80 backdrop-blur-sm px-2.5 py-2 shadow-sm text-[11px]"
      style={{ WebkitBackdropFilter: 'blur(4px)' }}
    >
      <div className="text-foreground font-medium mb-1">{label}</div>
      {itens.map(p => {
        const dk = String(p.dataKey);
        const color = corDe(dk);
        const bold = destacar(dk);
        return (
          <div key={dk} className="flex items-center gap-2 tabular-nums">
            <span style={{ color }} className={bold ? 'font-bold' : 'font-semibold'}>
              {dk}:
            </span>
            <span style={{ color }} className={bold ? 'font-bold' : 'font-medium'}>
              {typeof p.value === 'number' ? fmtBRL(p.value) : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DeltaBadge({ delta, inverterSemantica = false }: { delta: number; inverterSemantica?: boolean }) {
  // inverterSemantica=true: usado em saídas no modo Fechamento, onde Real >
  // Meta (gastou mais do que planejado) é ruim — pinta de rose mesmo com
  // sinal positivo. Receitas mantêm comportamento padrão (positivo = bom).
  const positivo = delta >= 0;
  const bom = inverterSemantica ? !positivo : positivo;
  const cls = bom
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

// Classe utilitária para a coluna REAL 2026 no modo Fechamento — azul
// (espelha variant 'sky' dos cards). Aplicada no header e nos valores.
const REAL_ANO_CORRENTE_COLUNA = 'text-sky-700 dark:text-sky-300';

function LinhaRow({
  linha,
  destaque = false,
  onClick,
  modo = 'planejamento',
  inverterSemantica = false,
}: {
  linha: LinhaExecutiva;
  destaque?: boolean;
  onClick?: () => void;
  modo?: 'planejamento' | 'fechamento';
  inverterSemantica?: boolean;
}) {
  const isFechamento = modo === 'fechamento';
  const realAC = linha.realAnoCorrente ?? 0;
  const deltaAC = linha.deltaAnoCorrente ?? 0;
  return (
    <div
      onClick={onClick}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_110px_110px_70px] gap-1 items-center py-[2px] border-b border-border/30 last:border-0',
        // Modo Fechamento: rows mais compactas (leading-none remove
        // entrelinhas; py reduzido). TOTAL ENTRADAS / TOTAL SAÍDAS
        // mantêm py-[4px] e font-bold via destaque.
        isFechamento && !destaque && 'leading-none py-[1px]',
        isFechamento && destaque && 'leading-none py-[3px]',
        destaque && 'bg-muted/40 font-bold border-b-2 border-foreground/20',
        !isFechamento && destaque && 'py-[4px]',
        onClick && 'cursor-pointer hover:bg-muted/40 transition-colors',
      )}
    >
      <div className={cn('text-[11px] truncate', destaque ? 'text-foreground uppercase tracking-wide' : 'text-foreground')}>
        {linha.label}
      </div>
      {isFechamento ? (
        <>
          <div className={cn('text-[11px] tabular-nums text-right font-semibold', META_COLUNA)}>
            {fmtBRL(linha.meta)}
          </div>
          <div className={cn('text-[11px] tabular-nums text-right font-semibold', REAL_ANO_CORRENTE_COLUNA)}>
            {fmtBRL(realAC)}
          </div>
          <div className="text-right">
            <DeltaBadge delta={deltaAC} inverterSemantica={inverterSemantica} />
          </div>
        </>
      ) : (
        <>
          <div className={cn('text-[11px] tabular-nums text-right', destaque ? 'text-foreground/80' : 'text-muted-foreground')}>
            {fmtBRL(linha.real)}
          </div>
          <div className={cn('text-[11px] tabular-nums text-right font-semibold', META_COLUNA)}>
            {fmtBRL(linha.meta)}
          </div>
          <div className="text-right">
            <DeltaBadge delta={linha.delta} />
          </div>
        </>
      )}
    </div>
  );
}

type CardVariant = 'sky' | 'rose' | 'neutral';

function CardTotal({
  titulo,
  linha,
  variant = 'neutral',
  metaOnly = false,
  modo = 'planejamento',
  inverterSemantica = false,
}: {
  titulo: string;
  linha: LinhaExecutiva;
  variant?: CardVariant;
  /** Quando true, esconde linha "Real …" e badge Δ% — card META-only. */
  metaOnly?: boolean;
  /** 'fechamento': big value = realAnoCorrente, sublinha "Meta R$ X" + deltaAnoCorrente. */
  modo?: 'planejamento' | 'fechamento';
  inverterSemantica?: boolean;
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

  const isFechamento = modo === 'fechamento';
  const bigValor = isFechamento ? (linha.realAnoCorrente ?? 0) : linha.meta;
  const sublinhaLabel = isFechamento ? 'Meta' : 'Real';
  const sublinhaValor = isFechamento ? linha.meta : linha.real;
  const deltaUsado = isFechamento ? (linha.deltaAnoCorrente ?? 0) : linha.delta;

  return (
    <div className={cn('border rounded-md p-2.5 flex flex-col gap-1 min-w-0', v.card)}>
      <div className={cn('text-[10px] font-semibold uppercase tracking-wide truncate', v.label)}>
        {titulo}
      </div>
      <div className="text-base font-bold text-foreground tabular-nums truncate leading-tight">
        {fmtBRL(bigValor)}
      </div>
      {!metaOnly && (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] text-muted-foreground truncate">
            {sublinhaLabel} {fmtBRL(sublinhaValor)}
          </span>
          <DeltaBadge delta={deltaUsado} inverterSemantica={inverterSemantica} />
        </div>
      )}
    </div>
  );
}

// ─── Pizza Compacta (Bloco 2 — Detalhamento Fluxo de Caixa) ──────────
// Visual executivo: pizza ~112px + legenda lateral compacta.
// Zero cálculo: usa realAnoCorrente já presente em cada LinhaExecutiva.

interface PizzaItem { nome: string; valor: number; cor: string }

const CORES_PIZZA_ENTRADAS = ['#0284c7', '#16a34a', '#f59e0b', '#7c3aed'];
const CORES_PIZZA_SAIDAS = ['#dc2626', '#ea580c', '#f59e0b', '#84cc16', '#06b6d4', '#8b5cf6', '#ec4899', '#6b7280'];

function PizzaCompacta({ titulo, data, total }: { titulo: string; data: PizzaItem[]; total: number }) {
  // Container leve: sem border/shadow. Apenas layout flex+grid.
  // total === 0 → sem dados, placeholder discreto.
  if (data.length === 0 || total <= 0) {
    return (
      <div className="flex flex-col gap-1">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {titulo}
        </h4>
        <div className="flex items-center justify-center min-h-[160px]">
          <span className="text-[11px] text-muted-foreground italic">Sem dados</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h4>
      <div className="flex items-center gap-2">
        <div className="w-40 h-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="valor"
                nameKey="nome"
                cx="50%"
                cy="50%"
                outerRadius={72}
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.cor} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, name: string) => [fmtBRL(v), name]}
                contentStyle={{ fontSize: 11, padding: '4px 8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 flex flex-col gap-0.5 text-[11px] leading-tight min-w-0">
          {data.map((d) => {
            const pct = (d.valor / total) * 100;
            return (
              <div key={d.nome} className="flex items-center gap-1.5 min-w-0">
                <span
                  className="inline-block w-2 h-2 rounded-sm shrink-0"
                  style={{ background: d.cor }}
                />
                <span className="truncate min-w-0">{d.nome}</span>
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────

export function BlocoResumoExecutivo({ data, saldoInicialMeta, saldoInicialReal, desfocarDashboard = false, onLinhaClick, modo = 'planejamento', mesAlvo, onAnalisarFluxo, motivoFluxoBloqueado }: Props) {
  if (!data) {
    return (
      <section className="bg-card border border-border rounded-lg p-4 mb-4">
        <div className="text-sm text-muted-foreground py-8 text-center">
          Carregando resumo executivo…
        </div>
      </section>
    );
  }

  // Pares [linha, key] — a key vai pro callback onLinhaClick.
  // Adicionar/remover linhas → manter sincronizado com CONFIG_MODAIS_LINHA
  // no V2PlanejamentoVisaoGeral.tsx.
  const linhasEntrada: Array<[LinhaExecutiva, LinhaModalKey]> = [
    [data.receitaPecuaria, 'receitaPecuaria'],
    [data.receitaAgricultura, 'receitaAgricultura'],
    [data.outrasReceitas, 'outrasReceitas'],
    [data.entradasFinanceiras, 'entradasFinanceiras'],
  ];

  const linhasSaida: Array<[LinhaExecutiva, LinhaModalKey]> = [
    [data.custeioPecuaria, 'custeioPecuaria'],
    [data.custeioAgricultura, 'custeioAgricultura'],
    [data.jurosPecuaria, 'jurosPecuaria'],
    [data.jurosAgricultura, 'jurosAgricultura'],
    [data.investimentoPecuaria, 'investimentoPecuaria'],
    [data.investimentoAgricultura, 'investimentoAgricultura'],
    [data.reposicaoBovinos, 'reposicaoBovinos'],
    [data.amortizacaoPecuaria, 'amortizacaoPecuaria'],
    [data.amortizacaoAgricultura, 'amortizacaoAgricultura'],
    [data.dividendos, 'dividendos'],
    [data.deducoesReceita, 'deducoesReceita'],
  ];

  const isFechamento = modo === 'fechamento';

  // Pizzas de composição (Bloco 2 — Fechamento). Zero cálculo: usa
  // realAnoCorrente já presente em cada LinhaExecutiva. Filtra zeros para
  // não poluir o pie com fatias vazias.
  const pizzaEntradas: PizzaItem[] = isFechamento
    ? linhasEntrada
        .map(([l], i) => ({
          nome: l.label,
          valor: Math.max(0, l.realAnoCorrente ?? 0),
          cor: CORES_PIZZA_ENTRADAS[i % CORES_PIZZA_ENTRADAS.length],
        }))
        .filter((d) => d.valor > 0)
    : [];
  const pizzaSaidas: PizzaItem[] = isFechamento
    ? linhasSaida
        .map(([l], i) => ({
          nome: l.label,
          valor: Math.max(0, l.realAnoCorrente ?? 0),
          cor: CORES_PIZZA_SAIDAS[i % CORES_PIZZA_SAIDAS.length],
        }))
        .filter((d) => d.valor > 0)
    : [];
  const totalEntradasReal = Math.max(0, data.totalEntradas.realAnoCorrente ?? 0);
  const totalSaidasReal = Math.max(0, data.totalSaidas.realAnoCorrente ?? 0);

  // Limite do mesAlvo para cortar a linha REAL 2026 — Recharts trata null
  // como quebra de linha (a curva termina visualmente no mês alvo).
  const limiteMes = mesAlvo ?? 12;
  const mostrarReal2026 = modo === 'fechamento' && !!data.serieRealAnoCorrente;
  // Ponto de partida visual "Início" = Dez/N-1. Saldo absoluto de partida
  // antes de Jan, evitando a "queda artificial" do zero. REAL 2026 e META
  // 2026 partem do mesmo ponto (saldoInicialMeta = foto Dez/N-1); REAL 2025
  // parte de saldoInicialReal (Dez/N-2). Séries do builder permanecem 12 —
  // a injeção é puramente visual no chartData.
  const chartData = [
    {
      mes: 'Início',
      'REAL 2025': Number.isFinite(saldoInicialReal) ? saldoInicialReal : 0,
      'META 2026': saldoInicialMeta,
      ...(mostrarReal2026 && { 'REAL 2026': saldoInicialMeta }),
    },
    ...MESES.map((nome, i) => ({
      mes: nome,
      'META 2026': data.serieMeta[i] ?? 0,
      'REAL 2025': data.serieReal[i] ?? 0,
      ...(mostrarReal2026 && {
        'REAL 2026': i < limiteMes ? (data.serieRealAnoCorrente![i] ?? 0) : null,
      }),
    })),
  ];

  // Gradient bipartido azul/vermelho para REAL 2026 — transição exata no
  // ponto zero do range. Quando todos os valores >= 0 → azul puro;
  // quando todos <= 0 → vermelho puro; quando cruza → split no zero.
  let gradientRealAnoCorrente: JSX.Element | null = null;
  if (mostrarReal2026) {
    const valores = chartData
      .map((d) => (d as { 'REAL 2026'?: number | null })['REAL 2026'])
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (valores.length > 0) {
      const max = Math.max(...valores, 0);
      const min = Math.min(...valores, 0);
      const range = max - min;
      const offsetZero = range > 0 ? max / range : (max > 0 ? 1 : 0);
      gradientRealAnoCorrente = (
        <linearGradient id="g-real-2026" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0284c7" stopOpacity={0.55} />
          <stop offset={offsetZero} stopColor="#0284c7" stopOpacity={0.05} />
          <stop offset={offsetZero} stopColor="#dc2626" stopOpacity={0.08} />
          <stop offset="100%" stopColor="#dc2626" stopOpacity={0.35} />
        </linearGradient>
      );
    }
  }

  // Tabelas Entradas/Saídas — extraídas para reuso em Planejamento (dentro
  // da section única) e Fechamento (dentro da section "Detalhamento").
  const tabelasJsx = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1">
          Entradas
        </h3>
        <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_70px] gap-1 items-center pb-1 border-b border-border text-[10px] font-semibold uppercase text-muted-foreground">
          <div></div>
          {isFechamento ? (
            <>
              <div className={cn('text-right', META_COLUNA)}>META 2026</div>
              <div className={cn('text-right', REAL_ANO_CORRENTE_COLUNA)}>REAL 2026</div>
            </>
          ) : (
            <>
              <div className="text-right">REAL 2025</div>
              <div className={cn('text-right', META_COLUNA)}>META 2026</div>
            </>
          )}
          <div className="text-right">Δ%</div>
        </div>
        <LinhaRow linha={data.totalEntradas} destaque modo={modo} />
        {linhasEntrada.map(([l, key]) => (
          <LinhaRow
            key={key}
            linha={l}
            onClick={onLinhaClick ? () => onLinhaClick(key) : undefined}
            modo={modo}
          />
        ))}
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1">
          Saídas
        </h3>
        <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_70px] gap-1 items-center pb-1 border-b border-border text-[10px] font-semibold uppercase text-muted-foreground">
          <div></div>
          {isFechamento ? (
            <>
              <div className={cn('text-right', META_COLUNA)}>META 2026</div>
              <div className={cn('text-right', REAL_ANO_CORRENTE_COLUNA)}>REAL 2026</div>
            </>
          ) : (
            <>
              <div className="text-right">REAL 2025</div>
              <div className={cn('text-right', META_COLUNA)}>META 2026</div>
            </>
          )}
          <div className="text-right">Δ%</div>
        </div>
        <LinhaRow linha={data.totalSaidas} destaque modo={modo} inverterSemantica={isFechamento} />
        {linhasSaida.map(([l, key]) => (
          <LinhaRow
            key={key}
            linha={l}
            onClick={onLinhaClick ? () => onLinhaClick(key) : undefined}
            modo={modo}
            inverterSemantica={isFechamento}
          />
        ))}
      </div>
    </div>
  );

  return (
    <>
    <section className={cn(
      'bg-card border border-border rounded-lg',
      isFechamento ? 'p-3 mb-3' : 'p-4 mb-4',
    )}>
      <div
        className={cn(
          'flex items-center gap-2 flex-wrap mb-1',
          onAnalisarFluxo && 'cursor-pointer hover:opacity-80 transition-opacity',
        )}
        onClick={onAnalisarFluxo}
        role={onAnalisarFluxo ? 'button' : undefined}
        tabIndex={onAnalisarFluxo ? 0 : undefined}
      >
        <h2 className="text-base font-bold text-foreground">
          {modo === 'fechamento' ? 'Fluxo de Caixa Realizado' : 'Fluxo de Caixa Previsto'}
        </h2>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-900/60">
          Caixa
        </span>
        {/* Estado 1: clicável — header abre o Modal Fluxo (Global no Fechamento). */}
        {onAnalisarFluxo && (
          <span
            className="text-[10px] font-medium text-sky-700 dark:text-sky-300 underline-offset-2 hover:underline"
            aria-label="Analisar fluxo de caixa"
          >
            Analisar ↗
          </span>
        )}
        {/* Estado 2: bloqueado com motivo — Info + Tooltip (Individual no Fechamento). */}
        {motivoFluxoBloqueado && !onAnalisarFluxo && (
          <ShTooltipProvider delayDuration={150}>
            <ShTooltip>
              <ShTooltipTrigger asChild>
                <span
                  className="inline-flex items-center text-muted-foreground cursor-help"
                  tabIndex={0}
                  aria-label="Informação sobre análise indisponível"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-3.5 w-3.5" />
                </span>
              </ShTooltipTrigger>
              <ShTooltipContent side="bottom" className="max-w-xs text-xs">
                {motivoFluxoBloqueado}
              </ShTooltipContent>
            </ShTooltip>
          </ShTooltipProvider>
        )}
        {/* Estado 3: nenhum — Planejamento (header inerte como hoje). */}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {modo === 'fechamento'
          ? 'Regime de caixa • Fluxo financeiro acumulado'
          : 'Real 2025 (financeiro lançamentos) vs META 2026 (planejamento financeiro). Gráfico: saldo acumulado projetado mês a mês.'}
      </p>

      {!data.conciliado && (
        <div className="mb-3 p-2 rounded border border-rose-300 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30 text-[11px] text-rose-800 dark:text-rose-200">
          Planejamento não conciliado: diferença de {fmtBRL(data.diferencaMeta)}. Verificar
          classificação.
        </div>
      )}

      <div className={cn(
        'grid grid-cols-1 lg:grid-cols-5 gap-3',
        isFechamento ? 'mb-0' : 'mb-4',
      )}>
        <div
          className={cn(
            'lg:col-span-3 border border-border rounded-md p-2 relative',
            isFechamento ? 'h-64' : 'h-72',
            desfocarDashboard && 'overflow-hidden',
          )}
        >
          <div className={cn(desfocarDashboard && 'blur-md pointer-events-none select-none', 'w-full h-full')}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="g-meta" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="g-real" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9ca3af" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#9ca3af" stopOpacity={0.05} />
                </linearGradient>
                {gradientRealAnoCorrente}
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
                content={(props) => <FluxoCaixaTooltip {...(props as TooltipPayloadItem & { active?: boolean; payload?: TooltipPayloadItem[]; label?: string })} modo={modo} />}
                cursor={{ stroke: 'hsl(var(--muted-foreground) / 0.3)', strokeWidth: 1 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="REAL 2025"
                stroke="#9ca3af"
                strokeWidth={1.5}
                fill="url(#g-real)"
                fillOpacity={0.35}
              />
              <Area
                type="monotone"
                dataKey="META 2026"
                stroke="#f97316"
                strokeWidth={1.5}
                fill="url(#g-meta)"
                fillOpacity={0.35}
              />
              {mostrarReal2026 && (
                <Area
                  type="monotone"
                  dataKey="REAL 2026"
                  stroke="#0284c7"
                  strokeWidth={2.5}
                  fill="url(#g-real-2026)"
                  fillOpacity={1}
                  dot={{ r: 3, fill: '#0284c7' }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                  baseValue={0}
                />
              )}
            </ComposedChart>
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

        <div className={cn('lg:col-span-2 flex flex-col', isFechamento ? 'gap-1.5' : 'gap-2')}>
          <CardTotal
            titulo={modo === 'fechamento' ? 'Total Entradas Real' : 'Total Entradas META'}
            linha={data.totalEntradas}
            variant="sky"
            modo={modo}
          />
          <CardTotal
            titulo={modo === 'fechamento' ? 'Total Saídas Real' : 'Total Saídas META'}
            linha={data.totalSaidas}
            variant="rose"
            modo={modo}
            inverterSemantica={modo === 'fechamento'}
          />
          {/* PR5 — No modo Fechamento, card 'Dif. Caixa no Período - Meta' foi
              removido (valores estavam incorretos). Saldo Caixa Final Real fica
              sozinho ocupando toda a largura. No Planejamento, mantém o card
              'Dif. Caixa no Ano - Meta' (lógica Dez−Dez/N-1 ainda válida). */}
          <div className={cn(
            'grid gap-2 relative',
            modo === 'fechamento' ? 'grid-cols-1' : 'grid-cols-2',
          )}>
            <div className={cn(desfocarDashboard && 'blur-md pointer-events-none select-none')}>
              <CardTotal
                titulo={modo === 'fechamento' ? 'Saldo Caixa Final Real' : 'Saldo Caixa Final Meta'}
                linha={montarLinhaSaldoFinal(data, modo)}
                variant="neutral"
                metaOnly
              />
            </div>
            {modo !== 'fechamento' && (
              <div className={cn(desfocarDashboard && 'blur-md pointer-events-none select-none')}>
                <CardTotal
                  titulo="Dif. Caixa no Ano - Meta"
                  linha={montarLinhaDifAno(data, saldoInicialMeta, saldoInicialReal, mesAlvo)}
                  variant="neutral"
                  metaOnly
                />
              </div>
            )}
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

      {!isFechamento && tabelasJsx}
    </section>
    {isFechamento && (
      <section className="bg-card border border-border rounded-lg p-3 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
          <PizzaCompacta titulo="Entradas" data={pizzaEntradas} total={totalEntradasReal} />
          <PizzaCompacta titulo="Saídas" data={pizzaSaidas} total={totalSaidasReal} />
        </div>
        {tabelasJsx}
      </section>
    )}
    </>
  );
}
