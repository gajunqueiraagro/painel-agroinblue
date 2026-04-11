/**
 * Fluxo de Caixa Global — tabela 12 linhas, jan-dez + coluna Total.
 * Duas visualizações:
 *   Resumido — executivo, linhas fixas.
 *   Amplo   — linhas expansíveis: clique na linha para revelar filhos.
 *             Nível 2 → Nível 3 (estáticos). Nível 3 → subcentros (dinâmicos).
 * Base: data_pagamento + Realizado.
 * SEMPRE GLOBAL — independente da fazenda selecionada.
 */
import { useState, useMemo, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFluxoCaixa, type FluxoMensal } from '@/hooks/useFluxoCaixa';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react';
import {
  isRealizado,
  isEntrada as isEntradaClass,
  isSaida as isSaidaClass,
  classificarEntrada,
  classificarSaida,
  datePagtoMes as datePagtoMesClass,
  datePagtoAno as datePagtoAnoClass,
  type LancamentoClassificavel,
} from '@/lib/financeiro/classificacao';
import type { FinanceiroLancamento, RateioADM } from '@/hooks/useFinanceiro';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FmtMode = 'compact' | 'full';

const fmtK = (v: number): string => {
  if (v === 0) return '-';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
};

const fmtFull = (v: number): string => {
  if (v === 0) return '-';
  return Math.round(v).toLocaleString('pt-BR');
};

const fmtVal = (v: number, mode: FmtMode): string =>
  mode === 'compact' ? fmtK(v) : fmtFull(v);

// ---------------------------------------------------------------------------
// Row definitions
// ---------------------------------------------------------------------------

type VisaoFluxo = 'resumido' | 'amplo';

interface RowDef {
  id: string;
  label: string;
  key: keyof FluxoMensal;
  bold?: boolean;
  indent?: number;
  tipo?: 'entrada' | 'saida' | 'saldo';
  nivel?: 1 | 2 | 3;
  parentId?: string; // which nivel-2 row is the parent
  /** For nivel-3 rows, the dashboard classification label used to match lancamentos */
  classLabel?: string;
}

const ROWS: RowDef[] = [
  { id: 'saldoInicial', label: 'Saldo Inicial', key: 'saldoInicial', tipo: 'saldo' },

  { id: 'totalEntradas', label: 'Total Entradas', key: 'totalEntradas', bold: true, tipo: 'entrada', nivel: 1 },
  { id: 'receitas', label: 'Receitas', key: 'receitas', indent: 1, tipo: 'entrada', nivel: 2 },
  { id: 'receitasPec', label: 'Receitas Pecuárias', key: 'receitasPec', indent: 2, tipo: 'entrada', parentId: 'receitas', nivel: 3, classLabel: 'Receitas Pecuárias' },
  { id: 'receitasAgri', label: 'Receitas Agricultura', key: 'receitasAgri', indent: 2, tipo: 'entrada', parentId: 'receitas', nivel: 3, classLabel: 'Receitas Agricultura' },
  { id: 'receitasOutras', label: 'Outras Receitas', key: 'receitasOutras', indent: 2, tipo: 'entrada', parentId: 'receitas', nivel: 3, classLabel: 'Outras Receitas' },

  { id: 'outrasEntradas', label: 'Outras Entradas', key: 'outrasEntradas', indent: 1, tipo: 'entrada', nivel: 2 },
  { id: 'captacaoPec', label: 'Captação Financ. Pec.', key: 'captacaoPec', indent: 2, tipo: 'entrada', parentId: 'outrasEntradas', nivel: 3, classLabel: 'Captação Financ. Pec.' },
  { id: 'captacaoAgri', label: 'Captação Financ. Agri.', key: 'captacaoAgri', indent: 2, tipo: 'entrada', parentId: 'outrasEntradas', nivel: 3, classLabel: 'Captação Financ. Agri.' },
  { id: 'aportes', label: 'Aportes Pessoais', key: 'aportes', indent: 2, tipo: 'entrada', parentId: 'outrasEntradas', nivel: 3, classLabel: 'Aportes Pessoais' },

  { id: 'totalSaidas', label: 'Total Saídas', key: 'totalSaidas', bold: true, tipo: 'saida', nivel: 1 },
  { id: 'deducaoReceitas', label: 'Dedução de Receitas', key: 'deducaoReceitas', indent: 1, tipo: 'saida', nivel: 2 },
  { id: 'desembolsoProdutivo', label: 'Desemb. Produtivo', key: 'desembolsoProdutivo', indent: 1, tipo: 'saida', nivel: 2 },
  { id: 'desembolsoPec', label: 'Desemb. Produtivo Pec.', key: 'desembolsoPec', indent: 2, tipo: 'saida', parentId: 'desembolsoProdutivo', nivel: 3, classLabel: 'Desemb. Produtivo Pec.' },
  { id: 'desembolsoAgri', label: 'Desemb. Produtivo Agri.', key: 'desembolsoAgri', indent: 2, tipo: 'saida', parentId: 'desembolsoProdutivo', nivel: 3, classLabel: 'Desemb. Produtivo Agri.' },
  { id: 'reposicao', label: 'Reposição Bovinos', key: 'reposicao', indent: 1, tipo: 'saida', nivel: 2 },
  { id: 'amortizacoes', label: 'Amortizações', key: 'amortizacoes', indent: 1, tipo: 'saida', nivel: 2 },
  { id: 'amortizacoesPec', label: 'Amortizações Fin. Pec.', key: 'amortizacoesPec', indent: 2, tipo: 'saida', parentId: 'amortizacoes', nivel: 3, classLabel: 'Amortizações Fin. Pec.' },
  { id: 'amortizacoesAgri', label: 'Amortizações Fin. Agri.', key: 'amortizacoesAgri', indent: 2, tipo: 'saida', parentId: 'amortizacoes', nivel: 3, classLabel: 'Amortizações Fin. Agri.' },
  { id: 'dividendos', label: 'Dividendos', key: 'dividendos', indent: 1, tipo: 'saida', nivel: 2 },

  { id: 'saldoFinal', label: 'Saldo Final', key: 'saldoFinal', tipo: 'saldo', bold: true, nivel: 1 },
  { id: 'saldoAcumulado', label: 'Saldo Acumulado', key: 'saldoAcumulado', bold: true, tipo: 'saldo', nivel: 1 },
];

const QUARTER_END = new Set([3, 6, 9]);

// ---------------------------------------------------------------------------
// Dynamic sub-row: aggregated from raw lancamentos by subcentro
// ---------------------------------------------------------------------------

interface DynRow {
  label: string;
  monthValues: number[]; // index 0 = Jan … 11 = Dec
  total: number;
  tipo: 'entrada' | 'saida';
}

interface FluxoLancRaw extends LancamentoClassificavel {
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
}

function buildDynamicRows(
  lancamentos: FluxoLancRaw[],
  classLabel: string,
  tipo: 'entrada' | 'saida',
  ano: number,
  mesAte: number,
): DynRow[] {
  const realizados = lancamentos.filter(l => {
    if (!isRealizado(l)) return false;
    if (datePagtoAnoClass(l) !== ano) return false;
    const m = datePagtoMesClass(l);
    if (!m || m > mesAte) return false;

    // Match classification
    if (tipo === 'entrada' && isEntradaClass(l)) {
      return classificarEntrada(l) === classLabel;
    }
    if (tipo === 'saida' && isSaidaClass(l)) {
      return classificarSaida(l) === classLabel;
    }
    return false;
  });

  if (realizados.length === 0) return [];

  // Group by subcentro (or centro_custo if subcentro is empty)
  const map = new Map<string, number[]>();
  for (const l of realizados) {
    const key = l.subcentro || l.centro_custo || '(sem classificação)';
    if (!map.has(key)) map.set(key, new Array(12).fill(0));
    const m = datePagtoMesClass(l)!;
    map.get(key)![m - 1] += Math.abs(l.valor);
  }

  return [...map.entries()]
    .map(([label, monthValues]) => ({
      label,
      monthValues,
      total: monthValues.reduce((a, b) => a + b, 0),
      tipo,
    }))
    .sort((a, b) => b.total - a.total);
}

// Rows for nivel-2 that have no static children (e.g. Dedução de Receitas, Reposição Bovinos, Dividendos)
// These expand directly to subcentros
const NIVEL2_DIRECT_EXPAND: Record<string, { classLabels: string[]; tipo: 'entrada' | 'saida' }> = {
  deducaoReceitas: { classLabels: ['Dedução de Receitas'], tipo: 'saida' },
  reposicao: { classLabels: ['Reposição Bovinos'], tipo: 'saida' },
  dividendos: { classLabels: ['Dividendos'], tipo: 'saida' },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  lancamentos: FinanceiroLancamento[];
  rateioADM: RateioADM[];
  ano: number;
  mesAte: number;
  fazendaAtualNome?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FluxoFinanceiro({ lancamentos, rateioADM, ano, mesAte, fazendaAtualNome }: Props) {
  const isMobile = useIsMobile();
  const [visao, setVisao] = useState<VisaoFluxo>('resumido');
  const [fmtMode, setFmtMode] = useState<FmtMode>('compact');

  const { meses, loading, saldoInicialAusente, lancamentosGlobais } =
    useFluxoCaixa(lancamentos, rateioADM, ano, mesAte);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-2 max-w-full mx-auto space-y-2 animate-fade-in">
      {fazendaAtualNome && (
        <div className="flex items-start gap-2 text-[10px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-1.5">
          <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
          <span className="text-amber-800 dark:text-amber-300">
            Fluxo de Caixa = <strong>caixa global consolidado</strong>.
          </span>
        </div>
      )}

      {saldoInicialAusente && (
        <div className="text-[9px] text-muted-foreground bg-muted rounded-md px-2 py-1">
          ⓘ Saldo inicial zerado — sem registros SALDO em Dez/{ano - 1}
        </div>
      )}

      <Card>
        <CardContent className="pt-2 pb-1">
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <h3 className="text-xs font-bold text-card-foreground">
              Fluxo de Caixa Global
            </h3>
            <div className="flex items-center gap-1.5">
              {/* Toggle formato valores */}
              <div className="flex rounded border border-border overflow-hidden">
                <button
                  onClick={() => setFmtMode('compact')}
                  className={`px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                    fmtMode === 'compact'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  k
                </button>
                <button
                  onClick={() => setFmtMode('full')}
                  className={`px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                    fmtMode === 'full'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  123
                </button>
              </div>
              {/* Toggle Resumido / Amplo */}
              <div className="flex rounded border border-border overflow-hidden">
                <button
                  onClick={() => setVisao('resumido')}
                  className={`px-2 py-0.5 text-[9px] font-medium transition-colors ${
                    visao === 'resumido'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Resumido
                </button>
                <button
                  onClick={() => setVisao('amplo')}
                  className={`px-2 py-0.5 text-[9px] font-medium transition-colors ${
                    visao === 'amplo'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Amplo
                </button>
              </div>
            </div>
          </div>

          <FluxoTable
            meses={meses}
            mesAte={mesAte}
            isMobile={isMobile}
            visao={visao}
            fmtMode={fmtMode}
            lancamentosGlobais={lancamentosGlobais as FluxoLancRaw[]}
            ano={ano}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------

function getValueColor(val: number, tipo?: 'entrada' | 'saida' | 'saldo', isAfter?: boolean): string {
  if (isAfter) return 'text-muted-foreground/30';
  if (val === 0) return 'text-muted-foreground';
  if (tipo === 'entrada') return 'text-green-600 dark:text-green-400';
  if (tipo === 'saida') return 'text-red-600 dark:text-red-400';
  return val >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
}

const BG_CARD = 'hsl(var(--card))';
const BG_MUTED = 'hsl(var(--muted))';
const BG_NIVEL1 = 'hsl(var(--muted))';
const BG_NIVEL2 = 'color-mix(in srgb, hsl(var(--muted)) 45%, hsl(var(--card)))';
const BG_ZEBRA = 'color-mix(in srgb, hsl(var(--muted)) 18%, hsl(var(--card)))';
const BG_DYN = 'color-mix(in srgb, hsl(var(--muted)) 10%, hsl(var(--card)))';

function FluxoTable({
  meses, mesAte, isMobile, visao, fmtMode, lancamentosGlobais, ano,
}: {
  meses: FluxoMensal[];
  mesAte: number;
  isMobile: boolean;
  visao: VisaoFluxo;
  fmtMode: FmtMode;
  lancamentosGlobais: FluxoLancRaw[];
  ano: number;
}) {
  // Expanded state: set of row IDs that are expanded
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // In resumido mode, show only rows without parentId and without amploOnly equivalent
  const baseRows = useMemo(() => {
    if (visao === 'resumido') {
      return ROWS.filter(r => !r.parentId);
    }
    // In amplo, show nivel 1 and nivel 2 always. Nivel 3 only if parent is expanded.
    return ROWS.filter(r => !r.parentId);
  }, [visao]);

  // Compute dynamic sub-rows for expanded nivel-3 rows
  const dynRowsCache = useMemo(() => {
    if (visao !== 'amplo') return {};
    const cache: Record<string, DynRow[]> = {};
    for (const row of ROWS) {
      if (row.nivel === 3 && row.classLabel && expanded.has(row.id)) {
        cache[row.id] = buildDynamicRows(
          lancamentosGlobais, row.classLabel, row.tipo as 'entrada' | 'saida', ano, mesAte,
        );
      }
    }
    // Direct-expand nivel-2 rows (no static children)
    for (const [rowId, cfg] of Object.entries(NIVEL2_DIRECT_EXPAND)) {
      if (expanded.has(rowId)) {
        const allDyn: DynRow[] = [];
        for (const cl of cfg.classLabels) {
          allDyn.push(...buildDynamicRows(lancamentosGlobais, cl, cfg.tipo, ano, mesAte));
        }
        cache[rowId] = allDyn;
      }
    }
    return cache;
  }, [visao, expanded, lancamentosGlobais, ano, mesAte]);

  const totals = useMemo(() => {
    const upTo = meses.filter(m => m.mes <= mesAte);
    const result: Record<string, number> = {};
    for (const row of ROWS) {
      if (row.key === 'saldoInicial') {
        result[row.key] = meses.length > 0 ? meses[0].saldoInicial : 0;
      } else if (row.key === 'saldoFinal') {
        result[row.key] = upTo.length > 0 ? upTo[upTo.length - 1].saldoFinal : 0;
      } else if (row.key === 'saldoAcumulado') {
        result[row.key] = upTo.length > 0 ? upTo[upTo.length - 1].saldoAcumulado : 0;
      } else {
        result[row.key] = upTo.reduce((s, m) => s + (m[row.key] as number), 0);
      }
    }
    return result;
  }, [meses, mesAte]);

  // Check if a nivel-2 row has static children
  const childrenOf = useCallback((parentId: string) => {
    return ROWS.filter(r => r.parentId === parentId);
  }, []);

  // Can a row be expanded?
  const isExpandable = useCallback((row: RowDef) => {
    if (visao !== 'amplo') return false;
    if (row.nivel === 2) {
      // Has static children or is a direct-expand row
      return childrenOf(row.id).length > 0 || NIVEL2_DIRECT_EXPAND[row.id];
    }
    if (row.nivel === 3 && row.classLabel) return true;
    return false;
  }, [visao, childrenOf]);

  const getBgForRow = (nivel: number, idx: number) => {
    if (nivel === 1) return BG_NIVEL1;
    if (nivel === 2) return BG_NIVEL2;
    return idx % 2 === 1 ? BG_ZEBRA : BG_CARD;
  };

  // Build flat render list
  const renderRows = useMemo(() => {
    const result: Array<{ type: 'static'; row: RowDef } | { type: 'dynamic'; dyn: DynRow; parentId: string }> = [];

    for (const row of baseRows) {
      result.push({ type: 'static', row });

      if (visao === 'amplo' && expanded.has(row.id)) {
        const staticChildren = childrenOf(row.id);
        if (staticChildren.length > 0) {
          // Show static children
          for (const child of staticChildren) {
            result.push({ type: 'static', row: child });
            // If this child is also expanded, show dynamic sub-rows
            if (expanded.has(child.id) && dynRowsCache[child.id]) {
              for (const dyn of dynRowsCache[child.id]) {
                result.push({ type: 'dynamic', dyn, parentId: child.id });
              }
            }
          }
        } else if (dynRowsCache[row.id]) {
          // Direct dynamic children (e.g. Dividendos → subcentros)
          for (const dyn of dynRowsCache[row.id]) {
            result.push({ type: 'dynamic', dyn, parentId: row.id });
          }
        }
      }
    }
    return result;
  }, [baseRows, visao, expanded, childrenOf, dynRowsCache]);

  return (
    <div className="overflow-auto -mx-1 max-h-[60vh]" style={{ scrollbarGutter: 'stable' }}>
      <table className="w-full min-w-[700px] text-[9px] tabular-nums border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: isMobile ? 100 : 160 }} />
          {meses.map(m => (
            <col key={m.mes} style={{ width: 58 }} />
          ))}
          <col style={{ width: 66 }} />
        </colgroup>

        {/* ── HEADER ── */}
        <thead className="sticky top-0 z-20">
          <tr className="border-b-2 border-border">
            <th
              className="px-1 py-[3px] text-left text-[9px] font-bold text-muted-foreground uppercase tracking-wider sticky left-0 z-30"
              style={{ background: BG_CARD }}
            />
            {meses.map(m => (
              <th
                key={m.mes}
                className={`px-1 py-[3px] text-right text-[9px] font-bold uppercase tracking-wider ${
                  m.mes > mesAte ? 'text-muted-foreground/40' : 'text-muted-foreground'
                } ${QUARTER_END.has(m.mes) ? 'border-r-2 border-border' : ''}`}
                style={{ background: BG_CARD }}
              >
                {m.label}
              </th>
            ))}
            <th
              className="px-1 py-[3px] text-right text-[9px] font-extrabold text-foreground uppercase tracking-wider border-l-2 border-border"
              style={{ background: BG_MUTED }}
            >
              Total
            </th>
          </tr>
        </thead>

        {/* ── BODY ── */}
        <tbody>
          {renderRows.map((item, rowIdx) => {
            if (item.type === 'dynamic') {
              return (
                <DynamicRowTr
                  key={`dyn-${item.parentId}-${item.dyn.label}`}
                  dyn={item.dyn}
                  meses={meses}
                  mesAte={mesAte}
                  fmtMode={fmtMode}
                  rowIdx={rowIdx}
                />
              );
            }

            const row = item.row;
            const nivel = row.nivel ?? 3;
            const bg = getBgForRow(nivel, rowIdx);
            const expandable = isExpandable(row);
            const isExpanded = expanded.has(row.id);

            const fontCls =
              nivel === 1 ? 'font-bold text-[9px]' :
              nivel === 2 ? 'font-semibold text-[9px]' :
              'font-normal text-[9px]';

            const borderCls = nivel === 1 ? 'border-b border-border' : 'border-b border-border/30';

            const indentPx =
              row.indent === 2 ? 20 :
              row.indent === 1 ? 12 : 0;

            return (
              <tr key={row.id} className={borderCls}>
                <td
                  className={`px-1 py-[2px] text-left leading-tight ${fontCls} ${
                    row.indent === 2 ? 'text-muted-foreground' : 'text-card-foreground'
                  } sticky left-0 z-10 truncate whitespace-nowrap ${expandable ? 'cursor-pointer select-none' : ''}`}
                  style={{ background: bg, paddingLeft: indentPx + 4 }}
                  onClick={expandable ? () => toggleExpand(row.id) : undefined}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {expandable && (
                      isExpanded
                        ? <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                    )}
                    {row.label}
                  </span>
                </td>

                {meses.map(m => {
                  const val = m[row.key] as number;
                  const isAfter = m.mes > mesAte;
                  const colorClass = (row.indent === 2 && val === 0)
                    ? 'text-muted-foreground/40'
                    : getValueColor(val, row.tipo, isAfter);

                  return (
                    <td
                      key={m.mes}
                      className={`px-1 py-[2px] text-right leading-tight ${fontCls} ${colorClass} ${QUARTER_END.has(m.mes) ? 'border-r-2 border-border' : ''}`}
                      style={{ background: bg }}
                    >
                      {isAfter ? '-' : fmtVal(val, fmtMode)}
                    </td>
                  );
                })}

                <td
                  className={`px-1 py-[2px] text-right leading-tight ${fontCls} border-l-2 border-border ${getValueColor(totals[row.key] || 0, row.tipo)}`}
                  style={{ background: nivel === 1 ? BG_NIVEL1 : BG_MUTED }}
                >
                  {fmtVal(totals[row.key] || 0, fmtMode)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dynamic row component (subcentro detail)
// ---------------------------------------------------------------------------

function DynamicRowTr({
  dyn, meses, mesAte, fmtMode, rowIdx,
}: {
  dyn: DynRow;
  meses: FluxoMensal[];
  mesAte: number;
  fmtMode: FmtMode;
  rowIdx: number;
}) {
  const bg = rowIdx % 2 === 1 ? BG_DYN : BG_CARD;

  return (
    <tr className="border-b border-border/20">
      <td
        className="px-1 py-[1px] text-left text-[8px] font-normal text-muted-foreground truncate whitespace-nowrap sticky left-0 z-10 italic"
        style={{ background: bg, paddingLeft: 32 }}
      >
        {dyn.label}
      </td>
      {meses.map(m => {
        const val = dyn.monthValues[m.mes - 1] || 0;
        const isAfter = m.mes > mesAte;
        const color = isAfter ? 'text-muted-foreground/30' : val === 0 ? 'text-muted-foreground/40' : getValueColor(val, dyn.tipo);
        return (
          <td
            key={m.mes}
            className={`px-1 py-[1px] text-right text-[8px] leading-tight ${color} ${QUARTER_END.has(m.mes) ? 'border-r-2 border-border' : ''}`}
            style={{ background: bg }}
          >
            {isAfter ? '-' : fmtVal(val, fmtMode)}
          </td>
        );
      })}
      <td
        className={`px-1 py-[1px] text-right text-[8px] leading-tight border-l-2 border-border ${getValueColor(dyn.total, dyn.tipo)}`}
        style={{ background: BG_MUTED }}
      >
        {fmtVal(dyn.total, fmtMode)}
      </td>
    </tr>
  );
}
