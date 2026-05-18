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

// Para linhas de dedução/custo: prefixa sinal negativo (valor sempre positivo no DTO).
function formatBRLDespesa(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `−${fmtBRLAbs(v)}`;
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
    'text-right tabular-nums text-[11px]',
    destaque ? 'font-semibold' : '',
    destaqueFinal ? 'font-bold' : '',
  );

  const labelClass = cn(
    'truncate',
    indentado ? 'pl-6 text-[10px] text-muted-foreground' : '',
    destaque ? 'font-medium text-[11px]' : '',
    destaqueFinal ? 'font-bold text-[11px] tracking-wide' : '',
    !indentado && !destaque && !destaqueFinal ? 'text-[11px]' : '',
    italic ? 'italic' : '',
  );

  const rowClass = cn(
    'grid grid-cols-[minmax(0,1fr)_110px_110px_110px_70px] gap-1 items-center px-2 py-[2px] border-b border-border/30 last:border-0',
    destaque ? 'bg-muted/40 border-t border-border/40' : '',
    destaqueFinal ? 'bg-muted/60 border-t border-border' : '',
  );

  const deltaPctClass = cn(
    'text-right tabular-nums text-[10px] font-medium',
    destaque || destaqueFinal ? corPctSubtotal(linha.deltaPct) : 'text-muted-foreground',
  );

  return (
    <div className={rowClass}>
      <div className={labelClass}>{linha.label}</div>
      <div className={valorClass}>{fmt(linha.valorAnoAnt)}</div>
      <div className={valorClass}>{fmt(linha.valor)}</div>
      <div className={cn('text-right tabular-nums text-[10px] font-medium', destaque || destaqueFinal ? '' : 'text-muted-foreground')}>
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
    <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_110px_70px] gap-1 items-center px-2 py-[2px] border-b border-border/30">
      <div className="truncate text-[11px] italic text-muted-foreground">
        {label} <span className="text-[10px]">(aguarda plano de contas)</span>
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
        <h2 className="text-sm font-semibold text-foreground">
          Análise Econômica META
        </h2>
        <span className="text-[10px] text-muted-foreground">
          Pecuária · regime de competência
        </span>
      </div>

      {desfocar ? (
        <p className="text-[10px] text-muted-foreground mb-2">
          Disponível apenas em modo Global.
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground mb-2">
          DRE pecuária. Tributos serão calculados após reestruturação
          do plano de contas.
        </p>
      )}

      {/* Header da tabela */}
      <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_110px_70px] gap-1 items-center px-2 py-1 bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
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
