/**
 * BlocoMovimentacoesRebanhoFechamento.tsx — FASE 3 / PR3.1
 *
 * 6 cards de movimentação do rebanho no período (Jan→mesAlvo):
 * Reposição, Desfrute, Compras, Abates, Vendas, Mortes.
 *
 * Fonte: useMovimentacoesAgregadas (viewMode='periodo').
 * PR3.1 = estrutura básica (cards + cab + deltas vs Meta e vs Ano Ant).
 * PR3.2 = tabela DRE-like. PR3.3 = split dinâmica/econômica.
 * PR3.4 = gráficos Recharts. PR3.5 = drill via MovimentacaoHistoricoModal.
 */
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { ExecutiveSlide } from '@/v2/components/executive/ExecutiveSlide';
import { cn } from '@/lib/utils';
import {
  useMovimentacoesAgregadas,
  type TipoMov,
} from '@/v2/hooks/useMovimentacoesAgregadas';

interface Props {
  ano: number;
  mes: number;
  viewMode: 'mes' | 'periodo';
  isGlobal: boolean;
}

interface CardDef {
  tipo: TipoMov;
  label: string;
  /** true = queda é boa (despesa), false = alta é boa (receita) */
  ehDespesa: boolean;
  corValor: string;
}

const CARDS: CardDef[] = [
  { tipo: 'reposicao', label: 'Reposição',  ehDespesa: false, corValor: 'text-sky-600' },
  { tipo: 'desfrute',  label: 'Desfrute',   ehDespesa: false, corValor: 'text-emerald-600' },
  { tipo: 'compras',   label: 'Compras',    ehDespesa: false, corValor: 'text-sky-600' },
  { tipo: 'abates',    label: 'Abates',     ehDespesa: false, corValor: 'text-emerald-600' },
  { tipo: 'vendas',    label: 'Vendas',     ehDespesa: false, corValor: 'text-emerald-600' },
  { tipo: 'mortes',    label: 'Mortes',     ehDespesa: true,  corValor: 'text-red-600' },
];

export function fmtCab(v: number | null): string {
  if (v === null || !isFinite(v)) return '—';
  return Math.round(v).toLocaleString('pt-BR');
}

export function calcDeltaPct(real: number | null, ref: number | null): number | null {
  if (real === null || ref === null || ref === 0) return null;
  return ((real - ref) / ref) * 100;
}

export function DeltaTag({ delta, ehDespesa }: { delta: number | null; ehDespesa: boolean }) {
  if (delta === null || !isFinite(delta)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const bom = ehDespesa ? delta < 0 : delta > 0;
  const cls = bom ? 'text-emerald-600' : 'text-red-600';
  const sinal = delta >= 0 ? '+' : '';
  return <span className={cls}>{sinal}{delta.toFixed(1)}%</span>;
}

export const MESES_CURTOS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export interface RowDef {
  label: string;
  tipo: TipoMov | null;
  sinal: 'entrada' | 'saida' | null;
}

export function buildLinhas(isGlobal: boolean): RowDef[] {
  return [
    { label: 'Saldo Início',      tipo: null,             sinal: null },
    { label: 'Nascimentos',       tipo: 'nascimentos',    sinal: 'entrada' },
    { label: 'Compras',           tipo: 'compras',        sinal: 'entrada' },
    ...(!isGlobal ? [{ label: 'Transf. Entrada', tipo: 'transf_entradas' as TipoMov, sinal: 'entrada' as const }] : []),
    { label: 'Abates',            tipo: 'abates',         sinal: 'saida' },
    { label: 'Vendas',            tipo: 'vendas',         sinal: 'saida' },
    { label: 'Consumos',          tipo: 'consumos',       sinal: 'saida' },
    { label: 'Mortes',            tipo: 'mortes',         sinal: 'saida' },
    ...(!isGlobal ? [{ label: 'Transf. Saída', tipo: 'transf_saidas' as TipoMov, sinal: 'saida' as const }] : []),
    { label: 'Saldo Final',       tipo: null,             sinal: null },
  ];
}

export function corSinal(sinal: 'entrada' | 'saida' | null): string {
  if (sinal === 'entrada') return 'text-emerald-700';
  if (sinal === 'saida')   return 'text-red-600';
  return 'font-semibold text-foreground';
}

/**
 * Gera frase executiva curta sobre a dinâmica do rebanho no período.
 * Regra simples (sem IA): compara entradas, saídas e variação líquida.
 * Tolerância 0.0001 para evitar ruído de ponto flutuante.
 */
function gerarFraseExecutiva(
  entradas: number | null,
  saidas: number | null,
  saldoIni: number,
  saldoFim: number,
  mortes: number | null,
): string {
  const variacao = saldoFim - saldoIni;
  const variacaoZero = Math.abs(variacao) < 0.0001;
  const e = entradas ?? 0;
  const s = saidas ?? 0;
  const m = mortes ?? 0;

  const semMov = variacaoZero && e === 0 && s === 0;
  if (semMov) {
    return 'Período sem movimentações registradas no rebanho.';
  }

  const fmt = (v: number) => Math.abs(Math.round(v)).toLocaleString('pt-BR');

  if (variacao < 0 && !variacaoZero) {
    const causaPrincipal = m > e
      ? 'mortes acima das entradas'
      : s > e * 2
        ? 'aumento de saídas produtivas'
        : 'ausência de reposição';
    return `O rebanho encerrou o período com redução líquida de ${fmt(variacao)} cabeças, puxada principalmente por ${causaPrincipal}.`;
  }

  if (variacao > 0 && !variacaoZero) {
    return `O rebanho encerrou o período com crescimento líquido de ${fmt(variacao)} cabeças — entradas superaram as saídas produtivas.`;
  }

  return `As entradas compensaram integralmente as saídas, mantendo estabilidade do estoque (${fmt(saldoFim)} cabeças).`;
}

// ─── PainelComposicaoHistorico ───────────────────────────────────────
// Card visual: donut (composição) + barchart (histórico) + comparativos.
// Cores e variantes (emerald/red) determinam identidade Entradas vs Saídas.
// Zero cálculo aqui — recebe dados pré-agregados do componente pai.

interface ItemComposicao { nome: string; valor: number; cor: string }
interface ItemHistorico { label: string; valor: number; cor: string }

function PainelComposicaoHistorico({
  titulo,
  icone,
  variantCor,
  composicao,
  historico,
  vsMetaDelta,
  vsAnoAntDelta,
  anoAnt,
  pctDoFluxo,
  ehDespesaMeta = false,
  ehDespesaAnoAnt = false,
}: {
  titulo: string;
  icone: string;
  variantCor: 'emerald' | 'red';
  composicao: ItemComposicao[];
  historico: ItemHistorico[];
  vsMetaDelta: number | null;
  vsAnoAntDelta: number | null;
  anoAnt: number;
  pctDoFluxo: number | null;
  ehDespesaMeta?: boolean;
  ehDespesaAnoAnt?: boolean;
}) {
  const totalComp = composicao.reduce((s, c) => s + c.valor, 0);

  const variantCls = variantCor === 'emerald'
    ? {
        borda: 'border-emerald-200 dark:border-emerald-800',
        bg: 'bg-emerald-50/40 dark:bg-emerald-950/20',
        headerBg: 'bg-emerald-100/70 dark:bg-emerald-950/40',
        headerTxt: 'text-emerald-700 dark:text-emerald-300',
        footerBg: 'bg-emerald-50/30 dark:bg-emerald-950/10',
      }
    : {
        borda: 'border-red-200 dark:border-red-800',
        bg: 'bg-red-50/30 dark:bg-red-950/20',
        headerBg: 'bg-red-100/60 dark:bg-red-950/40',
        headerTxt: 'text-red-700 dark:text-red-300',
        footerBg: 'bg-red-50/20 dark:bg-red-950/10',
      };

  return (
    <div className={cn('border rounded-lg overflow-hidden flex flex-col', variantCls.borda, variantCls.bg)}>
      {/* Header */}
      <div className={cn('px-3 py-1.5 border-b', variantCls.headerBg, variantCls.borda)}>
        <span className={cn('text-xs font-semibold uppercase tracking-wide', variantCls.headerTxt)}>
          {icone} {titulo.toUpperCase()} — composição e histórico
        </span>
      </div>

      {/* Corpo: donut+legenda | barchart */}
      <div className="grid grid-cols-2 gap-2 p-3 flex-1 min-h-0">
        {/* Esquerda — donut + legenda */}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="relative w-full h-28">
            {totalComp > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={composicao}
                    dataKey="valor"
                    nameKey="nome"
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={52}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {composicao.map((c, i) => (
                      <Cell key={i} fill={c.cor} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, name: string) => [`${fmtCab(v)} cab`, name]}
                    contentStyle={{ fontSize: 11, padding: '4px 8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] text-muted-foreground italic">Sem dados</span>
              </div>
            )}
            {/* Centro do donut: % do fluxo total */}
            {pctDoFluxo !== null && isFinite(pctDoFluxo) && totalComp > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-sm font-bold tabular-nums leading-none">
                  {pctDoFluxo.toFixed(0)}%
                </span>
                <span className="text-[9px] text-muted-foreground leading-none mt-0.5">
                  do fluxo
                </span>
              </div>
            )}
          </div>
          {/* Legenda compacta — overflow-hidden + min-w-0 + text-[10px]
              evitam que labels longos (Compras/Reposicao) invadam grafico. */}
          <div className="flex flex-col gap-0.5 text-[10px] leading-tight min-w-0 overflow-hidden">
            {composicao.map((c) => {
              const pct = totalComp > 0 ? (c.valor / totalComp) * 100 : 0;
              return (
                <div key={c.nome} className="flex items-center gap-1 min-w-0">
                  <span
                    className="inline-block w-2 h-2 rounded-sm shrink-0"
                    style={{ background: c.cor }}
                  />
                  <span className="truncate min-w-0">{c.nome}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Direita — barchart histórico */}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Histórico (cabeças)
          </div>
          <div className="w-full h-36 flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={historico} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Bar dataKey="valor" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {historico.map((d, i) => (
                    <Cell key={i} fill={d.cor} />
                  ))}
                  <LabelList
                    dataKey="valor"
                    position="top"
                    formatter={(v: number) => fmtCab(v)}
                    style={{ fontSize: 10, fontWeight: 600, fill: '#475569' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Rodapé — comparativos */}
      <div className={cn('grid grid-cols-2 border-t', variantCls.borda, variantCls.footerBg)}>
        <div className={cn('px-3 py-1.5 text-center border-r', variantCls.borda)}>
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">vs Meta</div>
          <div className="text-xs font-semibold mt-0.5">
            <DeltaTag delta={vsMetaDelta} ehDespesa={ehDespesaMeta} />
          </div>
        </div>
        <div className="px-3 py-1.5 text-center">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            vs {anoAnt}
          </div>
          <div className="text-xs font-semibold mt-0.5">
            <DeltaTag delta={vsAnoAntDelta} ehDespesa={ehDespesaAnoAnt} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BlocoMovimentacoesRebanhoFechamento({ ano, mes, viewMode, isGlobal }: Props) {
  const { loading, porTipo, saldoInicialAnual } = useMovimentacoesAgregadas({
    ano,
    mes,
    viewMode,
    isGlobal,
  });

  // Saldo chain — encadeia saldoInicialAnual com movimentos Jan→12
  const { saldoInicial, saldoFinal } = useMemo(() => {
    const si: number[] = [0];
    const sf: number[] = [0];
    let cur = saldoInicialAnual;
    for (let m = 1; m <= 12; m++) {
      const ent = porTipo['soma_entradas']?.seriesJanDez.cab.real[m] ?? 0;
      const sai = porTipo['soma_saidas']?.seriesJanDez.cab.real[m] ?? 0;
      si.push(cur);
      sf.push(cur + ent - sai);
      cur = cur + ent - sai;
    }
    return { saldoInicial: si, saldoFinal: sf };
  }, [saldoInicialAnual, porTipo]);

  // Sempre Jan→Dez. Meses > mesAlvo ficam visualmente vazios (cinza).
  const colunas = Array.from({ length: 12 }, (_, i) => i + 1);
  const linhas  = buildLinhas(isGlobal);

  if (loading) {
    return (
      <div className="my-6 p-4 text-sm text-muted-foreground">
        Carregando movimentações…
      </div>
    );
  }

  // Frase executiva — calculada antes do return para estabilidade.
  const fraseExec = gerarFraseExecutiva(
    porTipo['soma_entradas']?.mesAtual.cab ?? null,
    porTipo['soma_saidas']?.mesAtual.cab ?? null,
    saldoInicial[1] ?? 0,
    saldoFinal[mes] ?? 0,
    porTipo['mortes']?.mesAtual.cab ?? null,
  );

  return (
    <ExecutiveSlide
      title="Movimentações do Rebanho"
      subtitle={`Jan a ${String(mes).padStart(2, '0')}/${ano} · Narrativa executiva`}
      className="my-6"
      footer={`Fonte: lançamentos realizados · ${viewMode === 'periodo' ? 'Período acumulado' : 'Mês selecionado'} · Detalhe mês a mês na próxima prancha`}
    >
      <div className="flex flex-col gap-3 h-full">

        {/* ── FRASE EXECUTIVA ── */}
        <div className="bg-muted/30 border-l-4 border-primary rounded-r-md px-3 py-2 shrink-0">
          <p className="text-sm text-foreground leading-snug">
            {fraseExec}
          </p>
        </div>

        {/* ── TOPO — 5 indicadores executivos (responsivo) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 shrink-0">
          {([
            {
              label: 'Σ Entradas',
              valor:  porTipo['soma_entradas']?.mesAtual.cab ?? null,
              meta:   porTipo['soma_entradas']?.meta.cab ?? null,
              anoAnt: porTipo['soma_entradas']?.mesAnoAnt.cab ?? null,
              fmt: (v: number | null) => `${fmtCab(v)} cab`,
              cor: 'text-emerald-700',
              bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
              ehDespesa: false,
              modoComparativo: 'meta-anoant' as const,
            },
            {
              // Σ Saídas = saídas produtivas (desfrute). NÃO é despesa.
              // Menos saída produtiva que a meta = ruim (vermelho).
              // Mais saída produtiva que a meta = bom (verde).
              label: 'Σ Saídas',
              valor:  porTipo['soma_saidas']?.mesAtual.cab ?? null,
              meta:   porTipo['soma_saidas']?.meta.cab ?? null,
              anoAnt: porTipo['soma_saidas']?.mesAnoAnt.cab ?? null,
              fmt: (v: number | null) => `${fmtCab(v)} cab`,
              cor: 'text-red-700',
              bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
              ehDespesa: false,
              modoComparativo: 'meta-anoant' as const,
            },
            {
              label: 'Desfrute',
              valor:  porTipo['desfrute_pct']?.mesAtual.cab ?? null,
              meta:   porTipo['desfrute_pct']?.meta.cab ?? null,
              anoAnt: porTipo['desfrute_pct']?.mesAnoAnt.cab ?? null,
              fmt: (v: number | null) =>
                v !== null && isFinite(v) ? `${v.toFixed(1)}%` : '—',
              cor: 'text-foreground',
              bg: 'bg-muted/40 border-border',
              ehDespesa: false,
              modoComparativo: 'meta-anoant' as const,
            },
            {
              // Mortes: única métrica onde menor é melhor.
              label: 'Mortalidade',
              valor:  porTipo['mortes']?.mesAtual.cab ?? null,
              meta:   porTipo['mortes']?.meta.cab ?? null,
              anoAnt: porTipo['mortes']?.mesAnoAnt.cab ?? null,
              fmt: (v: number | null) => `${fmtCab(v)} cab`,
              cor: 'text-red-600',
              bg: 'bg-muted/40 border-border',
              ehDespesa: true,
              modoComparativo: 'meta-anoant' as const,
            },
            {
              // Saldo Final: compara vs inicio do periodo E vs Meta de saldo
              // final (saldoInicial + meta entradas - meta saidas). Derivacao
              // simples de valores ja presentes no hook.
              label: 'Saldo Final',
              valor:  saldoFinal[mes] ?? null,
              meta:   saldoInicial[1] ?? null,   // reutiliza slot 'meta' como referência de "início"
              anoAnt: (saldoInicial[1] ?? 0)
                + ((porTipo['soma_entradas']?.meta.cab) ?? 0)
                - ((porTipo['soma_saidas']?.meta.cab) ?? 0),  // reutiliza slot 'anoAnt' como Meta Saldo Final
              fmt: (v: number | null) => `${fmtCab(v)} cab`,
              cor: 'text-foreground font-semibold',
              bg: 'bg-card border-border',
              ehDespesa: false,
              modoComparativo: 'inicio-meta' as const,
            },
          ] as const).map(({ label, valor, meta, anoAnt, fmt, cor, bg, ehDespesa, modoComparativo }) => (
            <div key={label} className={`border rounded-lg px-2.5 py-2 ${bg}`}>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                {label}
              </div>
              <div className={`text-base font-bold tabular-nums leading-tight ${cor}`}>
                {fmt(valor)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 space-y-0.5">
                {modoComparativo === 'inicio-meta' ? (
                  <>
                    <div>
                      vs início{' '}
                      <DeltaTag delta={calcDeltaPct(valor, meta)} ehDespesa={ehDespesa} />
                    </div>
                    <div>
                      vs Meta{' '}
                      {anoAnt !== null
                        ? <DeltaTag delta={calcDeltaPct(valor, anoAnt)} ehDespesa={ehDespesa} />
                        : <span className="opacity-50">—</span>}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      vs Meta{' '}
                      {meta !== null
                        ? <DeltaTag delta={calcDeltaPct(valor, meta)} ehDespesa={ehDespesa} />
                        : <span className="opacity-50">—</span>}
                    </div>
                    <div>
                      vs {ano - 1}{' '}
                      {anoAnt !== null
                        ? <DeltaTag delta={calcDeltaPct(valor, anoAnt)} ehDespesa={ehDespesa} />
                        : <span className="opacity-50">—</span>}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── PAINÉIS — Composição + Histórico (Entradas / Saídas) ──
            Dados disponíveis no hook (audited): mesAtual.cab (Real ano),
            mesAnoAnt.cab (Real ano-1), meta.cab (Meta ano). Histórico
            multi-ano (2022-2024) NÃO está no hook — barras = 3 (Ano-1, Meta, Real). */}
        {(() => {
          const totalEntradas = porTipo['soma_entradas']?.mesAtual.cab ?? 0;
          const totalSaidas = porTipo['soma_saidas']?.mesAtual.cab ?? 0;
          const totalFluxo = totalEntradas + totalSaidas;
          const pctEntradas = totalFluxo > 0 ? (totalEntradas / totalFluxo) * 100 : null;
          const pctSaidas = totalFluxo > 0 ? (totalSaidas / totalFluxo) * 100 : null;

          const composicaoEntradas: ItemComposicao[] = [
            { nome: 'Nascimentos',         valor: porTipo['nascimentos']?.mesAtual.cab ?? 0, cor: '#059669' },
            { nome: 'Compras / Reposição', valor: porTipo['compras']?.mesAtual.cab ?? 0,     cor: '#2563eb' },
            ...(!isGlobal
              ? [{ nome: 'Transf. Entrada', valor: porTipo['transf_entradas']?.mesAtual.cab ?? 0, cor: '#7c3aed' }]
              : []),
          ].filter((c) => c.valor > 0);

          const composicaoSaidas: ItemComposicao[] = [
            { nome: 'Abates',   valor: porTipo['abates']?.mesAtual.cab   ?? 0, cor: '#dc2626' },
            { nome: 'Vendas',   valor: porTipo['vendas']?.mesAtual.cab   ?? 0, cor: '#f97316' },
            { nome: 'Consumo',  valor: porTipo['consumos']?.mesAtual.cab ?? 0, cor: '#06b6d4' },
            { nome: 'Mortes',   valor: porTipo['mortes']?.mesAtual.cab   ?? 0, cor: '#9ca3af' },
            ...(!isGlobal
              ? [{ nome: 'Transf. Saída', valor: porTipo['transf_saidas']?.mesAtual.cab ?? 0, cor: '#a855f7' }]
              : []),
          ].filter((c) => c.valor > 0);

          // Histórico: 3 barras (Ano-1 cinza, Meta dourado, Real azul/vermelho).
          // TODO multi-year: hook só carrega ano-1; queries para 2022-2024
          // exigiriam expansão do useLancamentos (fora de escopo deste PR).
          const histEntradas: ItemHistorico[] = [
            { label: String(ano - 1), valor: porTipo['soma_entradas']?.mesAnoAnt.cab ?? 0, cor: '#9ca3af' },
            { label: 'Meta',          valor: porTipo['soma_entradas']?.meta.cab     ?? 0, cor: '#fbbf24' },
            { label: 'Real',          valor: porTipo['soma_entradas']?.mesAtual.cab ?? 0, cor: '#2563eb' },
          ];
          const histSaidas: ItemHistorico[] = [
            { label: String(ano - 1), valor: porTipo['soma_saidas']?.mesAnoAnt.cab ?? 0, cor: '#9ca3af' },
            { label: 'Meta',          valor: porTipo['soma_saidas']?.meta.cab     ?? 0, cor: '#fbbf24' },
            { label: 'Real',          valor: porTipo['soma_saidas']?.mesAtual.cab ?? 0, cor: '#dc2626' },
          ];

          const vsMetaEntradas = calcDeltaPct(
            porTipo['soma_entradas']?.mesAtual.cab ?? null,
            porTipo['soma_entradas']?.meta.cab ?? null,
          );
          const vsAnoAntEntradas = calcDeltaPct(
            porTipo['soma_entradas']?.mesAtual.cab ?? null,
            porTipo['soma_entradas']?.mesAnoAnt.cab ?? null,
          );
          const vsMetaSaidas = calcDeltaPct(
            porTipo['soma_saidas']?.mesAtual.cab ?? null,
            porTipo['soma_saidas']?.meta.cab ?? null,
          );
          const vsAnoAntSaidas = calcDeltaPct(
            porTipo['soma_saidas']?.mesAtual.cab ?? null,
            porTipo['soma_saidas']?.mesAnoAnt.cab ?? null,
          );

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0">
              <PainelComposicaoHistorico
                titulo="Entradas"
                icone="↑"
                variantCor="emerald"
                composicao={composicaoEntradas}
                historico={histEntradas}
                vsMetaDelta={vsMetaEntradas}
                vsAnoAntDelta={vsAnoAntEntradas}
                anoAnt={ano - 1}
                pctDoFluxo={pctEntradas}
              />
              <PainelComposicaoHistorico
                titulo="Saídas"
                icone="↓"
                variantCor="red"
                composicao={composicaoSaidas}
                historico={histSaidas}
                vsMetaDelta={vsMetaSaidas}
                vsAnoAntDelta={vsAnoAntSaidas}
                anoAnt={ano - 1}
                pctDoFluxo={pctSaidas}
              />
            </div>
          );
        })()}

      </div>
    </ExecutiveSlide>
  );
}
