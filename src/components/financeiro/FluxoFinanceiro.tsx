/**
 * Fluxo de Caixa Global — tabela 12 linhas, jan-dez + coluna Total.
 * Modo único: Amplo — drill-down fiel ao plano de contas oficial:
 *             Macro → Grupo → Centro → Subcentro
 * Base: data_pagamento + Realizado.
 * SEMPRE GLOBAL — independente da fazenda selecionada.
 *
 * Drill-down: abre modal de auditoria in-page (não navega para outra tela).
 *
 * REGRA ESTRUTURAL: cada nó da árvore carrega lancamentoIds[].
 * O modal abre por esses IDs — nunca refaz filtro textual.
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
import { isDividendoSubcentro } from '@/lib/financeiro/planoContasBuilder';
import type { FinanceiroLancamento, RateioADM } from '@/hooks/useFinanceiro';
import { FluxoAuditoriaModal } from './FluxoAuditoriaModal';

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
// Row definitions for summary rows (Saldo, Totais)
// ---------------------------------------------------------------------------

interface RowDef {
  id: string;
  label: string;
  key: keyof FluxoMensal;
  bold?: boolean;
  indent?: number;
  tipo?: 'entrada' | 'saida' | 'saldo';
  nivel?: 1 | 2 | 3;
}

const ROWS_SUMMARY: RowDef[] = [
  { id: 'saldoInicial', label: 'Saldo Inicial', key: 'saldoInicial', tipo: 'saldo' },
  { id: 'totalEntradas', label: 'Total Entradas', key: 'totalEntradas', bold: true, tipo: 'entrada', nivel: 1 },
  { id: 'totalSaidas', label: 'Total Saídas', key: 'totalSaidas', bold: true, tipo: 'saida', nivel: 1 },
  { id: 'saldoFinal', label: 'Saldo Final', key: 'saldoFinal', tipo: 'saldo', bold: true, nivel: 1 },
  { id: 'saldoAcumulado', label: 'Saldo Acumulado', key: 'saldoAcumulado', bold: true, tipo: 'saldo', nivel: 1 },
];

const QUARTER_END = new Set([3, 6, 9]);

// ---------------------------------------------------------------------------
// Inconsistency types
// ---------------------------------------------------------------------------

export type InconsistenciaTipo =
  | 'sem_macro'
  | 'macro_sem_grupo'
  | 'grupo_sem_centro'
  | 'centro_sem_subcentro'
  | 'subcentro_fora_plano';

export interface Inconsistencia {
  tipo: InconsistenciaTipo;
  lancamentoId: string;
}

function detectarInconsistencia(l: FluxoLancRaw): InconsistenciaTipo | null {
  const macro = (l.macro_custo || '').trim();
  const grupo = (l.grupo_custo || '').trim();
  const centro = (l.centro_custo || '').trim();
  const sub = (l.subcentro || '').trim();

  if (!macro) return 'sem_macro';
  if (!grupo) return 'macro_sem_grupo';
  if (!centro) return 'grupo_sem_centro';
  if (!sub) return 'centro_sem_subcentro';
  return null;
}

// ---------------------------------------------------------------------------
// Dynamic tree builder from real lancamentos
// ---------------------------------------------------------------------------

interface FluxoLancRaw extends LancamentoClassificavel {
  id: string;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
}

export interface TreeNode {
  id: string;
  label: string;
  monthValues: number[];
  total: number;
  tipo: 'entrada' | 'saida';
  depth: number;
  children: TreeNode[];
  macro: string;
  grupo?: string;
  centro?: string;
  subcentro?: string;
  /** IDs dos lançamentos por mês (index 0-11) + index 12 = todos */
  lancamentoIdsByMonth: string[][];
  /** Inconsistências encontradas nos lançamentos deste nó */
  inconsistencias: Inconsistencia[];
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

  // Structure: macro -> grupo -> centro -> sub -> { months, ids by month, inconsistencias }
  interface LeafData {
    months: number[];
    idsByMonth: string[][]; // 0-11
    inconsistencias: Inconsistencia[];
  }

  const macroMap = new Map<string, Map<string, Map<string, Map<string, LeafData>>>>();

  for (const l of realizados) {
    let macro = l.macro_custo || '(sem macro)';
    let grupo = l.grupo_custo || '(sem grupo)';
    let centro = l.centro_custo || '(sem centro)';
    const sub = l.subcentro || '(sem subcentro)';

    // ── Dividend normalization: force correct hierarchy ──
    if (isDividendoSubcentro(sub)) {
      macro = 'Distribuição';
      grupo = 'Dividendos';
      centro = 'Pessoas';
    }

    const m = datePagtoMesClass(l)!;
    const val = Math.abs(l.valor);

    if (!macroMap.has(macro)) macroMap.set(macro, new Map());
    const gMap = macroMap.get(macro)!;
    if (!gMap.has(grupo)) gMap.set(grupo, new Map());
    const cMap = gMap.get(grupo)!;
    if (!cMap.has(centro)) cMap.set(centro, new Map());
    const sMap = cMap.get(centro)!;
    if (!sMap.has(sub)) {
      sMap.set(sub, {
        months: new Array(12).fill(0),
        idsByMonth: Array.from({ length: 12 }, () => []),
        inconsistencias: [],
      });
    }
    const leaf = sMap.get(sub)!;
    leaf.months[m - 1] += val;
    leaf.idsByMonth[m - 1].push(l.id);

    const inc = detectarInconsistencia(l);
    if (inc) {
      leaf.inconsistencias.push({ tipo: inc, lancamentoId: l.id });
    }
  }

  const MACRO_ORDER_ENTRADA: string[] = ['receita operacional', 'entradas financeiras'];
  const MACRO_ORDER_SAIDA: string[] = [
    'dedu', 'custeio', 'investimento', 'saída', 'amortiza', 'distribuição', 'dividendo',
  ];
  const orderList = tipoFilter === 'entrada' ? MACRO_ORDER_ENTRADA : MACRO_ORDER_SAIDA;

  const emptyIdsByMonth = (): string[][] => Array.from({ length: 13 }, () => []);

  const roots: TreeNode[] = [];

  for (const [macroLabel, grupoMap] of macroMap) {
    const macroNode: TreeNode = {
      id: `m_${tipoFilter}_${macroLabel}`, label: macroLabel,
      monthValues: new Array(12).fill(0), total: 0,
      tipo: tipoFilter, depth: 0, children: [], macro: macroLabel,
      lancamentoIdsByMonth: emptyIdsByMonth(),
      inconsistencias: [],
    };

    for (const [grupoLabel, centroMap] of grupoMap) {
      const grupoNode: TreeNode = {
        id: `g_${tipoFilter}_${macroLabel}_${grupoLabel}`, label: grupoLabel,
        monthValues: new Array(12).fill(0), total: 0,
        tipo: tipoFilter, depth: 1, children: [],
        macro: macroLabel, grupo: grupoLabel,
        lancamentoIdsByMonth: emptyIdsByMonth(),
        inconsistencias: [],
      };

      for (const [centroLabel, subMap] of centroMap) {
        const centroNode: TreeNode = {
          id: `c_${tipoFilter}_${macroLabel}_${grupoLabel}_${centroLabel}`, label: centroLabel,
          monthValues: new Array(12).fill(0), total: 0,
          tipo: tipoFilter, depth: 2, children: [],
          macro: macroLabel, grupo: grupoLabel, centro: centroLabel,
          lancamentoIdsByMonth: emptyIdsByMonth(),
          inconsistencias: [],
        };

        for (const [subLabel, leaf] of subMap) {
          const subTotal = leaf.months.reduce((a, b) => a + b, 0);
          const subIdsByMonth = [...leaf.idsByMonth, leaf.idsByMonth.flat()];
          const subNode: TreeNode = {
            id: `s_${tipoFilter}_${macroLabel}_${grupoLabel}_${centroLabel}_${subLabel}`,
            label: subLabel, monthValues: [...leaf.months], total: subTotal,
            tipo: tipoFilter, depth: 3, children: [],
            macro: macroLabel, grupo: grupoLabel, centro: centroLabel, subcentro: subLabel,
            lancamentoIdsByMonth: subIdsByMonth,
            inconsistencias: [...leaf.inconsistencias],
          };
          centroNode.children.push(subNode);
          for (let i = 0; i < 12; i++) {
            centroNode.monthValues[i] += leaf.months[i];
            centroNode.lancamentoIdsByMonth[i].push(...leaf.idsByMonth[i]);
          }
          centroNode.lancamentoIdsByMonth[12].push(...leaf.idsByMonth.flat());
          centroNode.total += subTotal;
          centroNode.inconsistencias.push(...leaf.inconsistencias);
        }
        centroNode.children.sort((a, b) => b.total - a.total);
        grupoNode.children.push(centroNode);
        for (let i = 0; i < 12; i++) {
          grupoNode.monthValues[i] += centroNode.monthValues[i];
          grupoNode.lancamentoIdsByMonth[i].push(...centroNode.lancamentoIdsByMonth[i]);
        }
        grupoNode.lancamentoIdsByMonth[12].push(...centroNode.lancamentoIdsByMonth[12]);
        grupoNode.total += centroNode.total;
        grupoNode.inconsistencias.push(...centroNode.inconsistencias);
      }
      grupoNode.children.sort((a, b) => b.total - a.total);
      macroNode.children.push(grupoNode);
      for (let i = 0; i < 12; i++) {
        macroNode.monthValues[i] += grupoNode.monthValues[i];
        macroNode.lancamentoIdsByMonth[i].push(...grupoNode.lancamentoIdsByMonth[i]);
      }
      macroNode.lancamentoIdsByMonth[12].push(...grupoNode.lancamentoIdsByMonth[12]);
      macroNode.total += grupoNode.total;
      macroNode.inconsistencias.push(...grupoNode.inconsistencias);
    }
    macroNode.children.sort((a, b) => b.total - a.total);
    roots.push(macroNode);
  }

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
// Exported types
// ---------------------------------------------------------------------------

export interface FluxoDrillPayload {
  origem: 'fluxo_caixa_amplo';
  ano: number;
  mes: number | null;
  tipo: 'entrada' | 'saida';
  /** IDs dos lançamentos que compõem o valor clicado — FONTE ÚNICA */
  lancamentoIds: string[];
  /** Inconsistências do nó clicado */
  inconsistencias: Inconsistencia[];
  /** Label hierarchy for display */
  hierarquia: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  lancamentos: FinanceiroLancamento[];
  rateioADM: RateioADM[];
  ano: number;
  mesAte: number;
  fazendaAtualNome?: string;
  onEditLancamento?: (lancamento: FinanceiroLancamento) => void;
  // Lifted modal state
  modalOpen?: boolean;
  modalPayload?: FluxoDrillPayload | null;
  modalValorClicado?: number;
  onModalOpen?: (payload: FluxoDrillPayload, valorClicado: number) => void;
  onModalClose?: () => void;
  /** Expose reload so parent can trigger it after edits */
  onFluxoReloadRef?: (reload: () => void) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FluxoFinanceiro({ lancamentos, rateioADM, ano, mesAte, fazendaAtualNome, onEditLancamento }: Props) {
  const isMobile = useIsMobile();
  const [fmtMode, setFmtMode] = useState<FmtMode>('compact');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPayload, setModalPayload] = useState<FluxoDrillPayload | null>(null);
  const [modalValorClicado, setModalValorClicado] = useState(0);

  const handleDrillDown = useCallback((payload: FluxoDrillPayload, valorClicado: number) => {
    setModalPayload(payload);
    setModalValorClicado(valorClicado);
    setModalOpen(true);
  }, []);

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

      {/* saldoInicialAusente silenced — info only in console */}
      {saldoInicialAusente && (() => { console.debug(`[FluxoCaixa] Saldo inicial ausente — Dez/${ano - 1}`); return null; })()}

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
            </div>
          </div>

          <FluxoTable
            meses={meses}
            mesAte={mesAte}
            isMobile={isMobile}
            fmtMode={fmtMode}
            lancamentosGlobais={lancamentosGlobais as FluxoLancRaw[]}
            ano={ano}
            onDrillDown={handleDrillDown}
          />
        </CardContent>
      </Card>

      <FluxoAuditoriaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        payload={modalPayload}
        lancamentos={lancamentos}
        valorClicado={modalValorClicado}
        onEditLancamento={onEditLancamento}
      />
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

const DEPTH_INDENT = [4, 16, 28, 40];
const DEPTH_FONT = [
  'font-semibold text-[9px]',
  'font-medium text-[9px]',
  'font-normal text-[9px]',
  'font-normal text-[8px] italic',
];
const DEPTH_BG = (depth: number, idx: number) => {
  if (depth === 0) return BG_NIVEL2;
  if (depth === 1) return BG_ZEBRA;
  if (depth === 2) return BG_DYN;
  return idx % 2 === 0 ? BG_CARD : BG_DYN;
};

function FluxoTable({
  meses, mesAte, isMobile, fmtMode, lancamentosGlobais, ano, onDrillDown,
}: {
  meses: FluxoMensal[];
  mesAte: number;
  isMobile: boolean;
  fmtMode: FmtMode;
  lancamentosGlobais: FluxoLancRaw[];
  ano: number;
  onDrillDown: (payload: FluxoDrillPayload, valorClicado: number) => void;
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

  const entradaTree = useMemo(() =>
    buildPlanoTree(lancamentosGlobais, ano, mesAte, 'entrada'),
    [lancamentosGlobais, ano, mesAte]);

  const saidaTree = useMemo(() =>
    buildPlanoTree(lancamentosGlobais, ano, mesAte, 'saida'),
    [lancamentosGlobais, ano, mesAte]);

  const totals = useMemo(() => {
    const upTo = meses.filter(m => m.mes <= mesAte);
    const result: Record<string, number> = {};
    for (const row of ROWS_SUMMARY) {
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

  type RenderItem =
    | { type: 'static'; row: RowDef }
    | { type: 'tree'; node: TreeNode };

  const renderRows = useMemo((): RenderItem[] => {
    const result: RenderItem[] = [];

    // Saldo Inicial
    result.push({ type: 'static', row: ROWS_SUMMARY[0] });

    // Total Entradas
    result.push({ type: 'static', row: ROWS_SUMMARY[1] });
    if (expanded.has('totalEntradas')) {
      for (const node of flattenTree(entradaTree)) {
        result.push({ type: 'tree', node });
      }
    }

    // Total Saídas
    result.push({ type: 'static', row: ROWS_SUMMARY[2] });
    if (expanded.has('totalSaidas')) {
      for (const node of flattenTree(saidaTree)) {
        result.push({ type: 'tree', node });
      }
    }

    // Saldo Final + Acumulado
    result.push({ type: 'static', row: ROWS_SUMMARY[3] });
    result.push({ type: 'static', row: ROWS_SUMMARY[4] });

    return result;
  }, [expanded, entradaTree, saidaTree, flattenTree]);

  const isStaticExpandable = (rowId: string) =>
    rowId === 'totalEntradas' || rowId === 'totalSaidas';

  return (
    <div className="overflow-auto -mx-1 max-h-[70vh]" style={{ scrollbarGutter: 'stable' }}>
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
            const hasInconsistencias = node.inconsistencias.length > 0;

            const buildHierarchy = (): string =>
              [node.macro, node.grupo, node.centro, node.subcentro].filter(Boolean).join(' › ');

            const handleCellClick = (mes: number | null, val: number) => {
              if (val === 0) return;
              const monthIdx = mes ? mes - 1 : 12;
              const ids = node.lancamentoIdsByMonth[monthIdx] || [];
              // Filter inconsistencias for this month
              const incIds = mes
                ? new Set(ids)
                : new Set(node.lancamentoIdsByMonth[12]);
              const incs = node.inconsistencias.filter(i => incIds.has(i.lancamentoId));

              onDrillDown({
                origem: 'fluxo_caixa_amplo',
                ano,
                mes,
                tipo: node.tipo,
                lancamentoIds: ids,
                inconsistencias: incs,
                hierarquia: buildHierarchy(),
              }, val);
            };

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
                    {hasInconsistencias && (
                      <AlertTriangle className="h-2.5 w-2.5 text-amber-500 shrink-0 ml-0.5" />
                    )}
                  </span>
                </td>
                {meses.map(m => {
                  const val = node.monthValues[m.mes - 1] || 0;
                  const isAfter = m.mes > mesAte;
                  const color = isAfter ? 'text-muted-foreground/30' : val === 0 ? 'text-muted-foreground/40' : getValueColor(val, node.tipo);
                  const clickable = !isAfter && val !== 0;
                  return (
                    <td
                      key={m.mes}
                      className={`px-1 py-[1.5px] text-right leading-tight ${fontCls} ${color} ${QUARTER_END.has(m.mes) ? 'border-r-2 border-border' : ''} ${clickable ? 'cursor-pointer hover:underline hover:opacity-80' : ''}`}
                      style={{ background: bg }}
                      onClick={clickable ? () => handleCellClick(m.mes, val) : undefined}
                    >
                      {isAfter ? '-' : fmtVal(val, fmtMode)}
                    </td>
                  );
                })}
                <td
                  className={`px-1 py-[1.5px] text-right leading-tight ${fontCls} border-l-2 border-border ${getValueColor(node.total, node.tipo)} ${node.total !== 0 ? 'cursor-pointer hover:underline hover:opacity-80' : ''}`}
                  style={{ background: BG_MUTED }}
                  onClick={node.total !== 0 ? () => handleCellClick(null, node.total) : undefined}
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
