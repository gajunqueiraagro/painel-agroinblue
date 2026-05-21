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
  ano: number;
  /**
   * F2.2 — Quando true, renderiza 7 colunas:
   *   Real {ano-1} | Real {ano} | Meta {ano} | Δ Ano Ant R$ | Δ Ano Ant % | Δ Meta R$ | Δ Meta %
   * Default (false ou ausente) → comportamento atual (4 colunas).
   * Planejamento Visão Geral atual NÃO passa esta prop (preserva visual).
   * Fechamento de Período passará `mostrarAnoCorrente=true`.
   */
  mostrarAnoCorrente?: boolean;
}

// Templates de grid:
//   Legado (4 cols após label): Real ano-1 | Meta | Δ R$ | Δ%
//   Fechamento 3 valores (5 cols após label): Real ano-1 | Meta | Real ano | Δ Ano Ant % | Δ Meta %
// Ordem da Fase 1 Marco 2.5: passado → planejado → atual, apenas deltas percentuais
// (cabe sem cortar; deltas R$ removidos para leitura executiva).
const GRID_4_COLS = 'grid-cols-[minmax(220px,420px)_110px_110px_110px_70px]';
// Fechamento — grid compacto: descrições mais próximas dos números,
// colunas estreitas, sem whitespace lateral exagerado.
const GRID_5_COLS = 'grid-cols-[minmax(180px,1fr)_95px_95px_95px_72px_72px]';

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

// Cor semântica das colunas Real ano-1 e META.
// Despesa é exibida com sinal '−' prefixo (formatBRLDespesa), portanto sempre destructive.
// Demais linhas: pelo sinal real do valor.
function corValor(v: number | null, tipoSinal: TipoSinal): string {
  if (v == null || !Number.isFinite(v) || v === 0) return 'text-muted-foreground';
  if (tipoSinal === 'despesa') return 'text-destructive';
  return v > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-destructive';
}

// Cor semântica das colunas Δ R$ e Δ% — padrão alinhado com corValor:
// positivo → azul, negativo → destructive, zero/null → muted.
// (LEGADO Planejamento — preserva visual atual quando mostrarAnoCorrente=false.)
function corDelta(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v === 0) return 'text-muted-foreground';
  return v > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-destructive';
}

// Cor semântica IGUAL ao Fluxo de Caixa (Fechamento mostrarAnoCorrente=true).
// Receitas/resultados: positivo = verde (bom), negativo = vermelho (ruim).
// Despesas: positivo = vermelho (gastou mais = ruim), negativo = verde (economizou).
function corDeltaSemantico(v: number | null, tipoSinal: TipoSinal): string {
  if (v == null || !Number.isFinite(v) || Math.abs(v) < 0.0001) return 'text-muted-foreground';
  const positivo = v > 0;
  const ehDespesa = tipoSinal === 'despesa';
  const bom = ehDespesa ? !positivo : positivo;
  return bom
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-red-700 dark:text-red-300';
}

// Pill suave para deltas no modo Fechamento. Background sutil + texto colorido.
// Quando muted (zero/null), retorna apenas texto sem background.
function pillDelta(v: number | null, tipoSinal: TipoSinal): string {
  if (v == null || !Number.isFinite(v) || Math.abs(v) < 0.0001) {
    return 'text-muted-foreground';
  }
  const positivo = v > 0;
  const ehDespesa = tipoSinal === 'despesa';
  const bom = ehDespesa ? !positivo : positivo;
  return bom
    ? 'inline-flex items-center justify-end px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold'
    : 'inline-flex items-center justify-end px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-[10px] font-semibold';
}

function LinhaRow({
  linha,
  tipoSinal,
  indentado = false,
  destaque = false,
  destaqueFinal = false,
  italic = false,
  mostrarAnoCorrente = false,
}: {
  linha: AnaliseEconomicaLinha;
  tipoSinal: TipoSinal;
  indentado?: boolean;
  destaque?: boolean;
  destaqueFinal?: boolean;
  italic?: boolean;
  mostrarAnoCorrente?: boolean;
}) {
  // tipoSinal define a formatação das colunas de valor (Real ano-1, Real ano, Meta)
  const fmt = tipoSinal === 'despesa' ? formatBRLDespesa : formatBRL;

  const valorClass = cn(
    'text-right tabular-nums',
    indentado ? 'text-[10px]' : 'text-[11px]',
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
    'grid gap-1 items-center px-2 py-[3px] border-b border-border/30 last:border-0',
    mostrarAnoCorrente ? GRID_5_COLS : GRID_4_COLS,
    destaque ? 'bg-muted/40 border-t border-border/40' : '',
    // Linha final "Lucro Líquido" no Fechamento: fundo azul escuro + texto branco.
    destaqueFinal && mostrarAnoCorrente
      ? 'bg-primary text-primary-foreground border-t border-primary py-1.5'
      : destaqueFinal
        ? 'bg-muted/60 border-t border-border'
        : '',
  );

  // Fase 1 Marco 2.5 — Δ Ano Ant %: compara Real ano vs Real ano-1.
  //                   Δ Meta %: compara Real ano vs Meta. Propaga null estrita.
  // Deltas R$ removidos no modo 3 valores (decisão executiva: percentuais
  // são suficientes; espaço da tela mais importante).
  const deltaAnoAntPct = (linha.valorAnoCorrente != null && Number.isFinite(linha.valorAnoCorrente)
    && linha.valorAnoAnt != null && Number.isFinite(linha.valorAnoAnt) && linha.valorAnoAnt > 0)
    ? ((linha.valorAnoCorrente - linha.valorAnoAnt) / linha.valorAnoAnt) * 100
    : null;
  const deltaMetaPct = (linha.valorAnoCorrente != null && Number.isFinite(linha.valorAnoCorrente)
    && linha.valor != null && Number.isFinite(linha.valor) && linha.valor > 0)
    ? ((linha.valorAnoCorrente - linha.valor) / linha.valor) * 100
    : null;

  // Cores fixas por coluna no modo Fechamento (3 valores):
  //   Real ano-1 → muted/cinza (passado, referência histórica)
  //   Meta ano   → laranja (referência planejada, mesmo tom do header)
  //   Real ano   → semântica (azul positivo / vermelho negativo) preserva
  //                significado financeiro do valor atual
  // Linha final "Lucro Líquido" no Fechamento: fundo azul + texto branco
  // (sobrescreve as cores semânticas atuais).
  const ehLinhaFinalFechamento = destaqueFinal && mostrarAnoCorrente;
  const realAnoAntClass = ehLinhaFinalFechamento
    ? cn(valorClass, 'text-primary-foreground/80')
    : mostrarAnoCorrente
      ? cn(valorClass, 'text-muted-foreground')
      : cn(valorClass, corValor(linha.valorAnoAnt, tipoSinal));
  const metaClass = ehLinhaFinalFechamento
    ? cn(valorClass, 'text-orange-200')
    : mostrarAnoCorrente
      ? cn(valorClass, 'text-orange-600 dark:text-orange-400')
      : cn(valorClass, corValor(linha.valor, tipoSinal));
  const realAnoCorrClass = ehLinhaFinalFechamento
    ? cn(valorClass, 'text-primary-foreground font-bold')
    : cn(valorClass, corValor(linha.valorAnoCorrente, tipoSinal));

  const deltaRsClassLegado = cn('text-right tabular-nums text-[10px] font-medium', corDelta(linha.deltaRs));
  const deltaPctClassLegado = cn('text-right tabular-nums text-[10px] font-medium', corDelta(linha.deltaPct));
  // Modo Fechamento: deltas viram pills coloridas (semântica igual Fluxo Caixa).
  // Quando linha final "Lucro Líquido" (destaqueFinal + fundo azul), usar
  // versão neutra clara — pills coloridas perdem contraste sobre azul.
  const wrapDelta = (v: number | null): string => destaqueFinal && mostrarAnoCorrente
    ? cn('text-right tabular-nums text-[10px] font-bold', corDeltaSemantico(v, tipoSinal))
    : cn('text-right', pillDelta(v, tipoSinal));
  const deltaPctClassAnoAnt = wrapDelta(deltaAnoAntPct);
  const deltaPctClassMeta = wrapDelta(deltaMetaPct);

  return (
    <div className={rowClass}>
      <div className={labelClass}>{linha.label}</div>
      {mostrarAnoCorrente ? (
        <>
          <div className={realAnoAntClass}>{fmt(linha.valorAnoAnt)}</div>
          <div className={metaClass}>{fmt(linha.valor)}</div>
          <div className={realAnoCorrClass}>{fmt(linha.valorAnoCorrente)}</div>
          {destaqueFinal ? (
            <>
              <div className={deltaPctClassAnoAnt}>{formatPct(deltaAnoAntPct)}</div>
              <div className={deltaPctClassMeta}>{formatPct(deltaMetaPct)}</div>
            </>
          ) : (
            <>
              <div className="flex justify-end"><span className={deltaPctClassAnoAnt}>{formatPct(deltaAnoAntPct)}</span></div>
              <div className="flex justify-end"><span className={deltaPctClassMeta}>{formatPct(deltaMetaPct)}</span></div>
            </>
          )}
        </>
      ) : (
        <>
          <div className={realAnoAntClass}>{fmt(linha.valorAnoAnt)}</div>
          <div className={metaClass}>{fmt(linha.valor)}</div>
          <div className={deltaRsClassLegado}>{formatDeltaRs(linha.deltaRs)}</div>
          <div className={deltaPctClassLegado}>{formatPct(linha.deltaPct)}</div>
        </>
      )}
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
  mostrarAnoCorrente = false,
}: {
  grupo: AnaliseEconomicaGrupo;
  tipoSinal: TipoSinal;
  mostrarAnoCorrente?: boolean;
}) {
  return (
    <>
      <LinhaRow linha={{ ...grupo.total, label: grupo.label }} tipoSinal={tipoSinal} mostrarAnoCorrente={mostrarAnoCorrente} />
      {grupo.detalhes.map((d, i) => (
        <LinhaRow key={i} linha={d} tipoSinal={tipoSinal} indentado mostrarAnoCorrente={mostrarAnoCorrente} />
      ))}
    </>
  );
}

/**
 * Placeholder para Tributos Patrimoniais e Impostos sobre Lucro
 * (aguardam reestruturação do plano de contas).
 */
function LinhaPlaceholder({ label, mostrarAnoCorrente = false }: { label: string; mostrarAnoCorrente?: boolean }) {
  const valorMuted = 'text-right tabular-nums text-[11px] text-muted-foreground';
  const deltaMuted = 'text-right tabular-nums text-[10px] font-medium text-muted-foreground';
  return (
    <div className={cn(
      'grid gap-1 items-center px-2 py-[2px] border-b border-border/30 last:border-0',
      mostrarAnoCorrente ? GRID_5_COLS : GRID_4_COLS,
    )}>
      <div className="truncate text-[11px]">
        {label} <span className="text-[10px] italic text-muted-foreground">(aguarda plano de contas)</span>
      </div>
      {mostrarAnoCorrente ? (
        <>
          <div className={valorMuted}>—</div>
          <div className={valorMuted}>—</div>
          <div className={valorMuted}>—</div>
          <div className={deltaMuted}>—</div>
          <div className={deltaMuted}>—</div>
        </>
      ) : (
        <>
          <div className={valorMuted}>—</div>
          <div className={valorMuted}>—</div>
          <div className={deltaMuted}>—</div>
          <div className={deltaMuted}>—</div>
        </>
      )}
    </div>
  );
}

export function BlocoAnaliseEconomica({ data, desfocar, ano, mostrarAnoCorrente = false }: Props) {
  const m = mostrarAnoCorrente;
  return (
    <section
      className={cn(
        'bg-card border border-border rounded-lg p-4 mb-4',
        desfocar && 'opacity-40 pointer-events-none',
      )}
    >
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-foreground">
            {mostrarAnoCorrente ? 'Análise Econômica Realizada — DRE' : 'Análise Econômica META'}
          </h2>
          {mostrarAnoCorrente && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              Competência
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {mostrarAnoCorrente ? 'Regime de competência • Realizado vs Meta' : 'Pecuária · regime de competência'}
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

      {/* Header da tabela.
          Modo Fechamento (5 cols após label): Real ano-1 | Meta | Real ano | Δ Ano Ant % | Δ Meta %
          - Fechamento: cabeçalho azul escuro sólido + texto branco, max-width centralizado. */}
      <div className={cn('overflow-x-auto', m && 'min-w-0 max-w-5xl mx-auto')}>
      <div className={cn(
        'grid gap-1 items-center px-2.5 py-1.5 text-[10px] uppercase tracking-wide font-semibold rounded-t-md',
        m
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/40 text-muted-foreground',
        m ? GRID_5_COLS : GRID_4_COLS,
      )}>
        <div>{m ? 'Descrição' : ''}</div>
        <div className="text-center">Real {ano - 1}</div>
        <div className={cn('text-center', m ? 'text-orange-200' : 'text-orange-500')}>Meta {ano}</div>
        {m && <div className="text-center">Real {ano}</div>}
        {m ? (
          <>
            <div className="text-center">Δ Ano Ant</div>
            <div className="text-center">Δ Meta</div>
          </>
        ) : (
          <>
            <div className="text-center">Δ R$</div>
            <div className="text-center">Δ%</div>
          </>
        )}
      </div>

      {/* Estrutura DRE */}
      <div className="border-x border-b border-border/40 rounded-b-md overflow-hidden">
        <GrupoRow grupo={data.faturamento} tipoSinal="receita" mostrarAnoCorrente={m} />
        <LinhaRow linha={{ ...data.deducoes.total, label: data.deducoes.label }} tipoSinal="despesa" mostrarAnoCorrente={m} />
        <LinhaRow linha={data.receitaLiquida} tipoSinal="subtotal" destaque mostrarAnoCorrente={m} />
        <GrupoRow grupo={data.custeioPecuaria} tipoSinal="despesa" mostrarAnoCorrente={m} />
        <LinhaRow linha={data.resultadoBruto} tipoSinal="subtotal" destaque mostrarAnoCorrente={m} />
        <LinhaRow linha={data.investimentoFazendaPec} tipoSinal="despesa" mostrarAnoCorrente={m} />
        <LinhaRow linha={data.resultadoComInvestimento} tipoSinal="subtotal" destaque mostrarAnoCorrente={m} />
        <LinhaRow linha={data.reposicaoBovinos} tipoSinal="despesa" mostrarAnoCorrente={m} />
        <LinhaRow linha={data.variacaoEstoqueGado} tipoSinal="variacao" mostrarAnoCorrente={m} />
        <LinhaRow linha={data.resultadoOperacional} tipoSinal="subtotal" destaque mostrarAnoCorrente={m} />
        <LinhaRow linha={{ ...data.resultadoFinanceiro.total, label: '7. (−) Juros Pecuária' }} tipoSinal="despesa" mostrarAnoCorrente={m} />
        <LinhaRow linha={data.resultadoAntesTributos} tipoSinal="subtotal" destaque mostrarAnoCorrente={m} />
        {data.tributosPatrimoniais
          ? <GrupoRow grupo={data.tributosPatrimoniais} tipoSinal="despesa" mostrarAnoCorrente={m} />
          : <LinhaPlaceholder label="8. (−) Tributos Patrimoniais" mostrarAnoCorrente={m} />}
        {data.impostosSobreLucro
          ? <GrupoRow grupo={data.impostosSobreLucro} tipoSinal="despesa" mostrarAnoCorrente={m} />
          : <LinhaPlaceholder label="9. (−) Impostos sobre Lucro" mostrarAnoCorrente={m} />}
        <LinhaRow
          linha={m ? { ...data.lucroLiquido, label: 'Lucro Líquido' } : data.lucroLiquido}
          tipoSinal="subtotal"
          destaqueFinal
          mostrarAnoCorrente={m}
        />
      </div>
      {/* Legenda discreta — só no modo Fechamento. */}
      {m && (
        <div className="flex items-center justify-end gap-3 mt-1.5 text-[9px] text-muted-foreground italic">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            Variação favorável
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
            Variação desfavorável
          </span>
        </div>
      )}
      </div>
    </section>
  );
}
