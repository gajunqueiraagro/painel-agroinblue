/**
 * Fluxo de Caixa Global — tabela 12 linhas, jan-dez + coluna Total.
 * Duas visualizações:
 *   Resumido — executivo, linhas fixas.
 *   Amplo   — drill-down fiel ao plano de contas oficial:
 *             Macro → Grupo → Centro → Subcentro
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
// Row definitions for RESUMIDO
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
  parentId?: string;
}

const ROWS_RESUMIDO: RowDef[] = [
  { id: 'saldoInicial', label: 'Saldo Inicial', key: 'saldoInicial', tipo: 'saldo' },
  { id: 'totalEntradas', label: 'Total Entradas', key: 'totalEntradas', bold: true, tipo: 'entrada', nivel: 1 },
  { id: 'receitas', label: 'Receitas', key: 'receitas', indent: 1, tipo: 'entrada', nivel: 2 },
  { id: 'outrasEntradas', label: 'Outras Entradas', key: 'outrasEntradas', indent: 1, tipo: 'entrada', nivel: 2 },
  { id: 'totalSaidas', label: 'Total Saídas', key: 'totalSaidas', bold: true, tipo: 'saida', nivel: 1 },
  { id: 'deducaoReceitas', label: 'Dedução de Receitas', key: 'deducaoReceitas', indent: 1, tipo: 'saida', nivel: 2 },
  { id: 'desembolsoProdutivo', label: 'Desemb. Produtivo', key: 'desembolsoProdutivo', indent: 1, tipo: 'saida', nivel: 2 },
  { id: 'reposicao', label: 'Reposição Bovinos', key: 'reposicao', indent: 1, tipo: 'saida', nivel: 2 },
  { id: 'amortizacoes', label: 'Amortizações', key: 'amortizacoes', indent: 1, tipo: 'saida', nivel: 2 },
  { id: 'dividendos', label: 'Dividendos', key: 'dividendos', indent: 1, tipo: 'saida', nivel: 2 },
  { id: 'saldoFinal', label: 'Saldo Final', key: 'saldoFinal', tipo: 'saldo', bold: true, nivel: 1 },
  { id: 'saldoAcumulado', label: 'Saldo Acumulado', key: 'saldoAcumulado', bold: true, tipo: 'saldo', nivel: 1 },
];

const QUARTER_END = new Set([3, 6, 9]);

// ---------------------------------------------------------------------------
// Dynamic tree builder from real lancamentos
// ---------------------------------------------------------------------------

interface FluxoLancRaw extends LancamentoClassificavel {
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
}

interface TreeNode {
  id: string;
  label: string;
  monthValues: number[]; // 12 months
  total: number;
  tipo: 'entrada' | 'saida';
  depth: number; // 0=macro, 1=grupo, 2=centro, 3=subcentro
  children: TreeNode[];
  // Hierarchy for drill-down
  macro: string;
  grupo?: string;
  centro?: string;
  subcentro?: string;
}

function buildPlanoTree(
  lancamentos: FluxoLancRaw[],
  ano: number,
  mesAte: number,
  tipoFilter: 'entrada' | 'saida',
): TreeNode[] {
  const realizados = lancamentos.filter(l => {
    if (!isRealizado(l)) return false;
    if (datePagtoAnoClass(l) !== ano) return false;
    const m = datePagtoMesClass(l);
    if (!m || m > mesAte) return false;
    if (tipoFilter === 'entrada') return isEntradaClass(l);
    if (tipoFilter === 'saida') return isSaidaClass(l);
    return false;
  });

  // 4-level grouping: macro → grupo → centro → subcentro
  const macroMap = new Map<string, Map<string, Map<string, Map<string, number[]>>>>();

  for (const l of realizados) {
    const macro = l.macro_custo || '(sem macro)';
    const grupo = l.grupo_custo || '(sem grupo)';
    const centro = l.centro_custo || '(sem centro)';
    const sub = l.subcentro || '(sem subcentro)';
    const m = datePagtoMesClass(l)!;
    const val = Math.abs(l.valor);

    if (!macroMap.has(macro)) macroMap.set(macro, new Map());
    const gMap = macroMap.get(macro)!;
    if (!gMap.has(grupo)) gMap.set(grupo, new Map());
    const cMap = gMap.get(grupo)!;
    if (!cMap.has(centro)) cMap.set(centro, new Map());
    const sMap = cMap.get(centro)!;
    if (!sMap.has(sub)) sMap.set(sub, new Array(12).fill(0));
    sMap.get(sub)![m - 1] += val;
  }

  // Fixed executive order for macros
  const MACRO_ORDER_ENTRADA: string[] = [
    'receita operacional',
    'entradas financeiras',
  ];
  const MACRO_ORDER_SAIDA: string[] = [
    'dedu',           // matches Deduções, Dedução, Deduções de Receitas, etc.
    'custeio',        // Custeio Produção, Custeio Produtivo
    'investimento',   // Investimentos, Investimento na Fazenda, etc.
    'saída',          // Saídas Financeiras, Saída Financeira
    'amortiza',       // Amortizações Financeiras
    'distribuição',   // Distribuição
    'dividendo',      // Dividendos
  ];
  const orderList = tipoFilter === 'entrada' ? MACRO_ORDER_ENTRADA : MACRO_ORDER_SAIDA;

  // Build tree
  const roots: TreeNode[] = [];

  for (const [macroLabel, grupoMap] of macroMap) {
    const macroNode: TreeNode = {
      id: `m_${tipoFilter}_${macroLabel}`,
      label: macroLabel,
      monthValues: new Array(12).fill(0),
      total: 0,
      tipo: tipoFilter,
      depth: 0,
      children: [],
    };

    for (const [grupoLabel, centroMap] of grupoMap) {
      const grupoNode: TreeNode = {
        id: `g_${tipoFilter}_${macroLabel}_${grupoLabel}`,
        label: grupoLabel,
        monthValues: new Array(12).fill(0),
        total: 0,
        tipo: tipoFilter,
        depth: 1,
        children: [],
      };

      for (const [centroLabel, subMap] of centroMap) {
        const centroNode: TreeNode = {
          id: `c_${tipoFilter}_${macroLabel}_${grupoLabel}_${centroLabel}`,
          label: centroLabel,
          monthValues: new Array(12).fill(0),
          total: 0,
          tipo: tipoFilter,
          depth: 2,
          children: [],
        };

        for (const [subLabel, months] of subMap) {
          const subTotal = months.reduce((a, b) => a + b, 0);
          const subNode: TreeNode = {
            id: `s_${tipoFilter}_${macroLabel}_${grupoLabel}_${centroLabel}_${subLabel}`,
            label: subLabel,
            monthValues: [...months],
            total: subTotal,
            tipo: tipoFilter,
            depth: 3,
            children: [],
          };
          centroNode.children.push(subNode);
          for (let i = 0; i < 12; i++) centroNode.monthValues[i] += months[i];
          centroNode.total += subTotal;
        }

        centroNode.children.sort((a, b) => b.total - a.total);
        grupoNode.children.push(centroNode);
        for (let i = 0; i < 12; i++) grupoNode.monthValues[i] += centroNode.monthValues[i];
        grupoNode.total += centroNode.total;
      }

      grupoNode.children.sort((a, b) => b.total - a.total);
      macroNode.children.push(grupoNode);
      for (let i = 0; i < 12; i++) macroNode.monthValues[i] += grupoNode.monthValues[i];
      macroNode.total += grupoNode.total;
    }

    macroNode.children.sort((a, b) => b.total - a.total);
    roots.push(macroNode);
  }

  // Sort by fixed executive order; unknown macros go to end sorted by value
  roots.sort((a, b) => {
    const aKey = a.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const bKey = b.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const findPos = (k: string) => {
      const idx = orderList.findIndex(o => {
        const oNorm = o.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return k.startsWith(oNorm) || k.includes(oNorm);
      });
      return idx >= 0 ? idx : 999;
    };
    const aPos = findPos(aKey);
    const bPos = findPos(bKey);
    if (aPos !== bPos) return aPos - bPos;
    return b.total - a.total;
  });

  return roots;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FluxoDrillPayload {
  origem: 'fluxo_caixa_amplo';
  ano: number;
  mes: number | null; // null = Total column
  tipo: 'entrada' | 'saida';
  macro?: string;
  grupo?: string;
  centro?: string;
  subcentro?: string;
}

interface Props {
  lancamentos: FinanceiroLancamento[];
  rateioADM: RateioADM[];
  ano: number;
  mesAte: number;
  fazendaAtualNome?: string;
  onDrillDown?: (payload: FluxoDrillPayload) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FluxoFinanceiro({ lancamentos, rateioADM, ano, mesAte, fazendaAtualNome, onDrillDown }: Props) {
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
            onDrillDown={onDrillDown}
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

// Depth-based indentation and styling
const DEPTH_INDENT = [4, 16, 28, 40]; // px
const DEPTH_FONT = [
  'font-semibold text-[9px]',   // depth 0 = macro
  'font-medium text-[9px]',     // depth 1 = grupo
  'font-normal text-[9px]',     // depth 2 = centro
  'font-normal text-[8px] italic', // depth 3 = subcentro
];
const DEPTH_BG = (depth: number, idx: number) => {
  if (depth === 0) return BG_NIVEL2;
  if (depth === 1) return BG_ZEBRA;
  if (depth === 2) return BG_DYN;
  return idx % 2 === 0 ? BG_CARD : BG_DYN;
};

function FluxoTable({
  meses, mesAte, isMobile, visao, fmtMode, lancamentosGlobais, ano, onDrillDown,
}: {
  meses: FluxoMensal[];
  mesAte: number;
  isMobile: boolean;
  visao: VisaoFluxo;
  fmtMode: FmtMode;
  lancamentosGlobais: FluxoLancRaw[];
  ano: number;
  onDrillDown?: (payload: FluxoDrillPayload) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['totalEntradas', 'totalSaidas']));

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Build dynamic trees for Amplo mode
  const entradaTree = useMemo(() => {
    if (visao !== 'amplo') return [];
    return buildPlanoTree(lancamentosGlobais, ano, mesAte, 'entrada');
  }, [visao, lancamentosGlobais, ano, mesAte]);

  const saidaTree = useMemo(() => {
    if (visao !== 'amplo') return [];
    return buildPlanoTree(lancamentosGlobais, ano, mesAte, 'saida');
  }, [visao, lancamentosGlobais, ano, mesAte]);

  const totals = useMemo(() => {
    const upTo = meses.filter(m => m.mes <= mesAte);
    const result: Record<string, number> = {};
    for (const row of ROWS_RESUMIDO) {
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

  // Flatten tree nodes respecting expansion
  const flattenTree = useCallback((nodes: TreeNode[]): TreeNode[] => {
    const result: TreeNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (expanded.has(node.id) && node.children.length > 0) {
        result.push(...flattenTree(node.children));
      }
    }
    return result;
  }, [expanded]);

  // Build final render list
  type RenderItem =
    | { type: 'static'; row: RowDef }
    | { type: 'tree'; node: TreeNode };

  const renderRows = useMemo((): RenderItem[] => {
    if (visao === 'resumido') {
      return ROWS_RESUMIDO.map(r => ({ type: 'static' as const, row: r }));
    }

    // Amplo: static summary rows + tree nodes injected after Total Entradas / Total Saídas
    const result: RenderItem[] = [];
    const summaryRows: RowDef[] = [
      ROWS_RESUMIDO.find(r => r.id === 'saldoInicial')!,
      ROWS_RESUMIDO.find(r => r.id === 'totalEntradas')!,
    ];

    // Saldo Inicial
    result.push({ type: 'static', row: summaryRows[0] });

    // Total Entradas
    result.push({ type: 'static', row: summaryRows[1] });
    // Inject entrada tree
    if (expanded.has('totalEntradas')) {
      for (const node of flattenTree(entradaTree)) {
        result.push({ type: 'tree', node });
      }
    }

    // Total Saídas
    const totalSaidasRow = ROWS_RESUMIDO.find(r => r.id === 'totalSaidas')!;
    result.push({ type: 'static', row: totalSaidasRow });
    // Inject saida tree
    if (expanded.has('totalSaidas')) {
      for (const node of flattenTree(saidaTree)) {
        result.push({ type: 'tree', node });
      }
    }

    // Saldo Final + Acumulado
    result.push({ type: 'static', row: ROWS_RESUMIDO.find(r => r.id === 'saldoFinal')! });
    result.push({ type: 'static', row: ROWS_RESUMIDO.find(r => r.id === 'saldoAcumulado')! });

    return result;
  }, [visao, expanded, entradaTree, saidaTree, flattenTree]);

  // Which static rows are expandable in Amplo
  const isStaticExpandable = (rowId: string) => {
    if (visao !== 'amplo') return false;
    return rowId === 'totalEntradas' || rowId === 'totalSaidas';
  };

  return (
    <div className="overflow-auto -mx-1 max-h-[60vh]" style={{ scrollbarGutter: 'stable' }}>
      <table className="w-full min-w-[700px] text-[9px] tabular-nums border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: isMobile ? 100 : 180 }} />
          {meses.map(m => (
            <col key={m.mes} style={{ width: 58 }} />
          ))}
          <col style={{ width: 66 }} />
        </colgroup>

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

        <tbody>
          {renderRows.map((item, rowIdx) => {
            if (item.type === 'static') {
              const row = item.row;
              const nivel = row.nivel ?? 3;
              const bg = nivel === 1 ? BG_NIVEL1 : nivel === 2 ? BG_NIVEL2 : rowIdx % 2 === 1 ? BG_ZEBRA : BG_CARD;
              const expandable = isStaticExpandable(row.id);
              const isExp = expanded.has(row.id);
              const fontCls = nivel === 1 ? 'font-bold text-[9px]' : nivel === 2 ? 'font-semibold text-[9px]' : 'font-normal text-[9px]';
              const borderCls = nivel === 1 ? 'border-b border-border' : 'border-b border-border/30';
              const indentPx = row.indent === 2 ? 20 : row.indent === 1 ? 12 : 0;

              return (
                <tr key={row.id} className={borderCls}>
                  <td
                    className={`px-1 py-[2px] text-left leading-tight ${fontCls} text-card-foreground sticky left-0 z-10 truncate whitespace-nowrap ${expandable ? 'cursor-pointer select-none' : ''}`}
                    style={{ background: bg, paddingLeft: indentPx + 4 }}
                    onClick={expandable ? () => toggleExpand(row.id) : undefined}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {expandable && (
                        isExp
                          ? <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                          : <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                      )}
                      {row.label}
                    </span>
                  </td>
                  {meses.map(m => {
                    const val = m[row.key] as number;
                    const isAfter = m.mes > mesAte;
                    const colorClass = getValueColor(val, row.tipo, isAfter);
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
            }

            // Tree node row
            const node = item.node;
            const hasChildren = node.children.length > 0;
            const isExp = expanded.has(node.id);
            const bg = DEPTH_BG(node.depth, rowIdx);
            const fontCls = DEPTH_FONT[node.depth] || DEPTH_FONT[3];
            const indent = DEPTH_INDENT[node.depth] || 40;
            const textColor = node.depth <= 1 ? 'text-card-foreground' : 'text-muted-foreground';

            return (
              <tr key={node.id} className="border-b border-border/20">
                <td
                  className={`px-1 py-[1.5px] text-left leading-tight ${fontCls} ${textColor} sticky left-0 z-10 truncate whitespace-nowrap ${hasChildren ? 'cursor-pointer select-none' : ''}`}
                  style={{ background: bg, paddingLeft: indent }}
                  onClick={hasChildren ? () => toggleExpand(node.id) : undefined}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {hasChildren && (
                      isExp
                        ? <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                    )}
                    {node.label}
                  </span>
                </td>
                {meses.map(m => {
                  const val = node.monthValues[m.mes - 1] || 0;
                  const isAfter = m.mes > mesAte;
                  const color = isAfter ? 'text-muted-foreground/30' : val === 0 ? 'text-muted-foreground/40' : getValueColor(val, node.tipo);
                  return (
                    <td
                      key={m.mes}
                      className={`px-1 py-[1.5px] text-right leading-tight ${fontCls} ${color} ${QUARTER_END.has(m.mes) ? 'border-r-2 border-border' : ''}`}
                      style={{ background: bg }}
                    >
                      {isAfter ? '-' : fmtVal(val, fmtMode)}
                    </td>
                  );
                })}
                <td
                  className={`px-1 py-[1.5px] text-right leading-tight ${fontCls} border-l-2 border-border ${getValueColor(node.total, node.tipo)}`}
                  style={{ background: BG_MUTED }}
                >
                  {fmtVal(node.total, fmtMode)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
