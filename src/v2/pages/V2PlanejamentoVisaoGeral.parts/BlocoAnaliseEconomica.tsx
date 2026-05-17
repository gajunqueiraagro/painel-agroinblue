/**
 * BLOCO 3 — Análise Econômica META (DRE Pecuária).
 * Componente puro: zero cálculo, apenas renderização do DTO.
 * Em modo individual (desfocar=true), aplica opacity-40 +
 * pointer-events-none e mostra placeholder de indisponibilidade.
 */
import { cn } from '@/lib/utils';
import type {
  Bloco3AnaliseEconomica,
  AnaliseEconomicaLinha,
  AnaliseEconomicaGrupo,
} from '@/v2/lib/planejamentoVisaoGeralTypes';

interface Props {
  data: Bloco3AnaliseEconomica;
  desfocar: boolean;
}

const fmtBRLAbs = (v: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Math.abs(v));

function formatBRL(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = v < 0 ? '−' : '';
  return sign + fmtBRLAbs(v);
}

// Para linhas de dedução/custo: envolve em parênteses (valor sempre positivo no DTO).
function formatBRLDespesa(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `(${fmtBRLAbs(v)})`;
}

function formatDeltaRs(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v === 0) return 'R$ 0';
  const sign = v > 0 ? '+' : '−';
  return sign + fmtBRLAbs(v);
}

function formatPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v === 0) return '0%';
  const sign = v > 0 ? '+' : '−';
  return `${sign}${Math.abs(v).toFixed(0)}%`;
}

type TipoSinal = 'receita' | 'despesa' | 'variacao' | 'subtotal';

function corPctSubtotal(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v === 0) return 'text-muted-foreground';
  return v > 0 ? 'text-emerald-700' : 'text-rose-700';
}

function LinhaRow({
  linha,
  tipoSinal,
  indentado = false,
  destaque = false,
  destaqueFinal = false,
  italic = false,
}: {
  linha: AnaliseEconomicaLinha;
  tipoSinal: TipoSinal;
  indentado?: boolean;
  destaque?: boolean;
  destaqueFinal?: boolean;
  italic?: boolean;
}) {
  // tipoSinal define a formatação da coluna META e Real ano-1
  const fmt = tipoSinal === 'despesa' ? formatBRLDespesa : formatBRL;

  const valorClass = cn(
    'text-right tabular-nums',
    destaque ? 'font-medium' : '',
    destaqueFinal ? 'font-bold' : '',
  );

  const labelClass = cn(
    'truncate',
    indentado ? 'pl-6 text-[12px] text-muted-foreground' : '',
    destaque ? 'font-medium text-[13px]' : '',
    destaqueFinal ? 'font-bold text-[14px] text-blue-900' : '',
    !indentado && !destaque && !destaqueFinal ? 'text-[13px]' : '',
    italic ? 'italic' : '',
  );

  const rowClass = cn(
    'grid grid-cols-[minmax(0,1fr)_110px_110px_110px_70px] gap-1 items-center px-3 py-[5px]',
    destaque ? 'bg-slate-100 dark:bg-slate-800/40' : '',
    destaqueFinal ? 'bg-blue-50 dark:bg-blue-950/30 border-y border-blue-200 dark:border-blue-900/50' : '',
    !destaque && !destaqueFinal ? 'border-t border-border/40' : '',
  );

  const deltaPctClass = cn(
    'text-right tabular-nums text-[11px]',
    destaque || destaqueFinal ? corPctSubtotal(linha.deltaPct) : 'text-muted-foreground',
    destaque ? 'font-medium' : '',
    destaqueFinal ? 'font-bold' : '',
  );

  return (
    <div className={rowClass}>
      <div className={labelClass}>{linha.label}</div>
      <div className={valorClass}>{fmt(linha.valorAnoAnt)}</div>
      <div className={valorClass}>{fmt(linha.valor)}</div>
      <div className={cn('text-right tabular-nums text-[11px]', destaque || destaqueFinal ? '' : 'text-muted-foreground', destaque ? 'font-medium' : '', destaqueFinal ? 'font-bold' : '')}>
        {formatDeltaRs(linha.deltaRs)}
      </div>
      <div className={deltaPctClass}>{formatPct(linha.deltaPct)}</div>
    </div>
  );
}

/**
 * Renderiza um GRUPO: linha total + sub-linhas indentadas com os detalhes.
 * tipoSinal aplica em todas as sub-linhas do grupo.
 */
function GrupoRow({
  grupo,
  tipoSinal,
}: {
  grupo: AnaliseEconomicaGrupo;
  tipoSinal: TipoSinal;
}) {
  return (
    <>
      <LinhaRow linha={{ ...grupo.total, label: grupo.label }} tipoSinal={tipoSinal} />
      {grupo.detalhes.map((d, i) => (
        <LinhaRow key={i} linha={d} tipoSinal={tipoSinal} indentado />
      ))}
    </>
  );
}

/**
 * Placeholder para Tributos Patrimoniais e Impostos sobre Lucro
 * (aguardam reestruturação do plano de contas).
 */
function LinhaPlaceholder({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_110px_70px] gap-1 items-center px-3 py-[5px] border-t border-border/40">
      <div className="truncate text-[13px] italic text-muted-foreground">
        {label} <span className="text-[11px]">(aguarda plano de contas)</span>
      </div>
      <div className="text-right text-muted-foreground">—</div>
      <div className="text-right text-muted-foreground">—</div>
      <div className="text-right text-muted-foreground">—</div>
      <div className="text-right text-muted-foreground">—</div>
    </div>
  );
}

export function BlocoAnaliseEconomica({ data, desfocar }: Props) {
  return (
    <section
      className={cn(
        'bg-card border border-border rounded-lg p-4 mb-4',
        desfocar && 'opacity-40 pointer-events-none',
      )}
    >
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h2 className="text-base font-bold text-foreground">
          Análise Econômica META
        </h2>
        <span className="text-xs text-muted-foreground">
          Pecuária · regime de competência
        </span>
      </div>

      {desfocar ? (
        <p className="text-xs text-muted-foreground mb-2">
          Disponível apenas em modo Global.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mb-3">
          DRE pecuária. Tributos serão calculados após reestruturação
          do plano de contas.
        </p>
      )}

      {/* Header da tabela */}
      <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_110px_70px] gap-1 items-center px-3 py-2 bg-muted/60 text-[10px] uppercase tracking-[0.3px] font-medium text-muted-foreground rounded-t-md">
        <div></div>
        <div className="text-right">Real ano-1</div>
        <div className="text-right text-orange-500">META</div>
        <div className="text-right">Δ R$</div>
        <div className="text-right">Δ%</div>
      </div>

      {/* Estrutura DRE */}
      <div className="border-x border-b border-border/40 rounded-b-md overflow-hidden">
        <GrupoRow grupo={data.faturamento} tipoSinal="receita" />
        <GrupoRow grupo={data.deducoes} tipoSinal="despesa" />
        <LinhaRow linha={data.receitaLiquida} tipoSinal="subtotal" destaque />
        <GrupoRow grupo={data.custeioPecuaria} tipoSinal="despesa" />
        <LinhaRow linha={data.resultadoBruto} tipoSinal="subtotal" destaque />
        <LinhaRow linha={data.investimentoFazendaPec} tipoSinal="despesa" />
        <LinhaRow linha={data.resultadoComInvestimento} tipoSinal="subtotal" destaque />
        <LinhaRow linha={data.reposicaoBovinos} tipoSinal="despesa" />
        <LinhaRow linha={data.variacaoEstoqueGado} tipoSinal="variacao" />
        <LinhaRow linha={data.resultadoOperacional} tipoSinal="subtotal" destaque />
        <GrupoRow grupo={data.resultadoFinanceiro} tipoSinal="despesa" />
        <LinhaRow linha={data.resultadoAntesTributos} tipoSinal="subtotal" destaque />
        {data.tributosPatrimoniais
          ? <GrupoRow grupo={data.tributosPatrimoniais} tipoSinal="despesa" />
          : <LinhaPlaceholder label="8. (−) Tributos Patrimoniais" />}
        {data.impostosSobreLucro
          ? <GrupoRow grupo={data.impostosSobreLucro} tipoSinal="despesa" />
          : <LinhaPlaceholder label="9. (−) Impostos sobre Lucro" />}
        <LinhaRow linha={data.lucroLiquido} tipoSinal="subtotal" destaqueFinal />
      </div>
    </section>
  );
}
