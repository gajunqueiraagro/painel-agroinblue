import { useState, useMemo, useEffect, useCallback } from 'react';
import { getStatusBadge } from '@/lib/statusOperacional';
import { Lancamento, CATEGORIAS, TODOS_TIPOS, isEntrada, isReclassificacao } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DollarSign, Info, ArrowLeft, Filter, ArrowUpDown, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react';
import { LancamentoDetalhe } from '@/components/LancamentoDetalhe';
import { FinanceiroExportMenu } from '@/components/FinanceiroExportMenu';
import { ChuvasTab } from './ChuvasTab';
import { useFazenda } from '@/contexts/FazendaContext';
import { fmtValor, formatMoeda, formatKg, formatArroba, formatPercent, formatCabecas } from '@/lib/calculos/formatters';
import { MESES_OPTIONS } from '@/lib/calculos/labels';
import { calcIndicadoresLancamento } from '@/lib/calculos/economicos';
import { useAnosDisponiveis } from '@/hooks/useAnosDisponiveis';

type StatusFiltro = 'todos' | 'realizado' | 'programado' | 'meta';
type SortDir = 'asc' | 'desc' | null;

interface Props {
  lancamentos: Lancamento[];
  onEditar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover: (id: string) => void;
  subAbaInicial?: SubAba;
  modoMovimentacao?: boolean;
  filtroAnoInicial?: string;
  filtroMesInicial?: string;
  filtroStatusInicial?: string;
  onBack?: () => void;
  drillDownLabel?: string;
  onEditarAbate?: (lancamento: Lancamento, context?: { subAba: SubAba; statusFiltro: string; anoFiltro: string; mesFiltro: string }) => void;
  onEditarVenda?: (lancamento: Lancamento, context?: { subAba: SubAba; statusFiltro: string; anoFiltro: string; mesFiltro: string }) => void;
  onEditarCompra?: (lancamento: Lancamento, context?: { subAba: SubAba; statusFiltro: string; anoFiltro: string; mesFiltro: string }) => void;
  onEditarTransferencia?: (lancamento: Lancamento, context?: { subAba: SubAba; statusFiltro: string; anoFiltro: string; mesFiltro: string }) => void;
  onEditarReclass?: (lancamento: Lancamento, context?: { subAba: SubAba; statusFiltro: string; anoFiltro: string; mesFiltro: string }) => void;
  onEditarMorte?: (lancamento: Lancamento, context?: { subAba: SubAba; statusFiltro: string; anoFiltro: string; mesFiltro: string }) => void;
  onEditarConsumo?: (lancamento: Lancamento, context?: { subAba: SubAba; statusFiltro: string; anoFiltro: string; mesFiltro: string }) => void;
}

export type SubAba = 'nascimento' | 'compra' | 'transferencia_entrada' | 'abate' | 'venda' | 'transferencia_saida' | 'consumo' | 'morte' | 'historico';

type TopTab = 'todas' | 'entradas' | 'saidas' | 'chuvas' | 'historico';

const ENTRY_TYPES: SubAba[] = ['nascimento', 'compra', 'transferencia_entrada'];
const EXIT_TYPES: SubAba[] = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'];

const SUB_ABA_LABELS: Record<SubAba, { label: string; icon: string }> = {
  nascimento: { label: 'Nasc.', icon: '🐄' },
  compra: { label: 'Compras', icon: '🛒' },
  transferencia_entrada: { label: 'T.Ent.', icon: '📥' },
  abate: { label: 'Abates', icon: '🔪' },
  venda: { label: 'Vendas', icon: '💰' },
  transferencia_saida: { label: 'T.Saí.', icon: '📤' },
  consumo: { label: 'Cons.', icon: '🍖' },
  morte: { label: 'Mortes', icon: '💀' },
  historico: { label: 'Evol. Cat.', icon: '🔄' },
};

const TABLE_HEAD_CELL = 'px-[3px] py-1 text-[8px] font-bold uppercase tracking-[0.02em] whitespace-nowrap select-none';
const TABLE_BODY_CELL = 'px-[3px] py-[3px] align-middle whitespace-nowrap overflow-hidden text-ellipsis';
const TABLE_FOOT_CELL = 'px-[3px] py-1.5 whitespace-nowrap text-[10px] font-bold';

function normalizeStatusFiltro(value?: string): StatusFiltro {
  if (value === 'previsto') return 'meta';
  if (value === 'realizado' || value === 'programado' || value === 'meta') return value;
  return 'todos';
}

function normalizeZooLancamento(lancamento: Lancamento): Lancamento {
  if (lancamento.cenario === 'meta' || lancamento.statusOperacional === 'previsto') {
    return {
      ...lancamento,
      cenario: 'meta',
      statusOperacional: null,
    };
  }

  return lancamento;
}

function getStatusFiltroLabel(statusFiltro: StatusFiltro): string {
  switch (statusFiltro) {
    case 'realizado':
      return 'Realizado';
    case 'programado':
      return 'Programado';
    case 'meta':
      return 'Meta';
    default:
      return 'Todos';
  }
}

function getStatusOrdenacao(lancamento: Lancamento): 'realizado' | 'programado' | 'meta' {
  if (lancamento.cenario === 'meta') return 'meta';
  if (lancamento.statusOperacional === 'programado') return 'programado';
  return 'realizado';
}

function getFazendaColumnHeader(tipo: string): string {
  switch (tipo) {
    case 'compra': return 'Destino';
    case 'transferencia_entrada':
    case 'transferencia_saida': return 'Origem e Destino';
    case 'abate': return 'Frigorífico';
    case 'venda': return 'Origem';
    case 'consumo':
    case 'morte': return 'Fazenda';
    default: return 'Fazenda';
  }
}

function getFazendaCellValue(l: Lancamento, fazendaMap: Map<string, string>): string {
  const fazNome = l.fazendaId ? (fazendaMap.get(l.fazendaId) || '') : '';
  switch (l.tipo) {
    case 'transferencia_entrada':
    case 'transferencia_saida': {
      const parts = [l.fazendaOrigem || fazNome, l.fazendaDestino].filter(Boolean);
      return parts.join(' → ') || '-';
    }
    default: return fazNome || '-';
  }
}

/* ── Sortable header cell ── */
function SortableHeader({ label, align, sortKey, currentKey, currentDir, onSort, sticky = false }: {
  label: string; align: string; sortKey: string;
  currentKey: string | null; currentDir: SortDir;
  onSort: (key: string) => void;
  sticky?: boolean;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={`${TABLE_HEAD_CELL} ${align} cursor-pointer hover:bg-primary-foreground/10 transition-colors ${sticky ? 'sticky left-0 z-30 border-r border-primary-foreground/15 md:static md:border-r-0' : ''}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && currentDir === 'asc' && <ArrowUp className="h-2.5 w-2.5 opacity-90" />}
        {active && currentDir === 'desc' && <ArrowDown className="h-2.5 w-2.5 opacity-90" />}
        {!active && <ArrowUpDown className="h-2 w-2 opacity-30" />}
      </span>
    </th>
  );
}

/* ── Summary panel ── */
function ResumoLateral({ lancamentos, subAba, anoFiltro, mesFiltro, statusFiltro, categoriaFiltro }: {
  lancamentos: Lancamento[];
  subAba: SubAba;
  anoFiltro: string;
  mesFiltro: string;
  statusFiltro: StatusFiltro;
  categoriaFiltro: string;
}) {
  const statusLabel = getStatusFiltroLabel(statusFiltro);
  const mesLabel = mesFiltro === 'todos' ? 'Todos' : (MESES_OPTIONS.find(m => m.value === mesFiltro)?.label || mesFiltro);
  const tipoLabel = SUB_ABA_LABELS[subAba]?.label || subAba;
  const catLabel = categoriaFiltro === 'todas' ? 'Todas' : (CATEGORIAS.find(c => c.value === categoriaFiltro)?.label || categoriaFiltro);

  const stats = useMemo(() => {
    const totals = lancamentos.reduce((acc, l) => {
      const c = calcIndicadoresLancamento(l);
      acc.qtd += l.quantidade;
      acc.pesoVivoTotal += (l.pesoMedioKg ?? 0) * l.quantidade;
      acc.arrobasTotal += c.pesoTotalArrobas;
      acc.valorTotal += c.valorFinal;
      acc.rendSum += c.rendimento * l.quantidade;
      return acc;
    }, { qtd: 0, pesoVivoTotal: 0, arrobasTotal: 0, valorTotal: 0, rendSum: 0 });

    const pesoMedio = totals.qtd > 0 ? totals.pesoVivoTotal / totals.qtd : 0;
    const arrobaMedio = totals.qtd > 0 ? totals.arrobasTotal / totals.qtd : 0;
    const rendMedio = totals.qtd > 0 ? totals.rendSum / totals.qtd : 0;
    const liqArroba = totals.arrobasTotal > 0 ? totals.valorTotal / totals.arrobasTotal : 0;
    const liqCabeca = totals.qtd > 0 ? totals.valorTotal / totals.qtd : 0;
    return { ...totals, pesoMedio, arrobaMedio, rendMedio, liqArroba, liqCabeca };
  }, [lancamentos]);

  const kpiItems: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'Qtde', value: formatCabecas(stats.qtd) },
    { label: 'Peso médio', value: formatKg(stats.pesoMedio) },
    ...(subAba === 'abate' ? [{ label: 'RC%', value: stats.rendMedio ? formatPercent(stats.rendMedio) : '-' }] : []),
    { label: 'Peso @', value: formatArroba(stats.arrobaMedio) },
    { label: 'Valor total', value: formatMoeda(stats.valorTotal), highlight: true },
    { label: 'R$/Líq @', value: formatMoeda(stats.liqArroba) },
    { label: 'Líq/Cab', value: formatMoeda(stats.liqCabeca) },
  ];

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden sticky top-2">
      {/* Header */}
      <div className="bg-primary px-3 py-2.5">
        <h3 className="text-[11px] font-bold text-primary-foreground tracking-wide uppercase">{tipoLabel}</h3>
      </div>
      {/* Filters applied */}
      <div className="px-3 py-2 bg-muted/40 border-b border-border">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
          <div className="text-muted-foreground">Ano</div>
          <div className="font-bold text-foreground">{anoFiltro}</div>
          <div className="text-muted-foreground">Mês</div>
          <div className="font-bold text-foreground">{mesLabel}</div>
          <div className="text-muted-foreground">Categoria</div>
          <div className="font-bold text-foreground">{catLabel}</div>
          <div className="text-muted-foreground">Status</div>
          <div className="font-bold text-foreground">{statusLabel}</div>
        </div>
      </div>
      {/* KPIs */}
      <div className="px-3 py-2 space-y-1.5">
        {kpiItems.map((kpi) => (
          <div key={kpi.label} className="flex items-baseline justify-between">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{kpi.label}</span>
            <span className={`font-bold tabular-nums ${kpi.highlight ? 'text-[13px] text-primary' : 'text-[11px] text-foreground'}`}>
              {kpi.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Sort helper ── */
function useSortableTable() {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const toggleSort = useCallback((key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') { setSortKey(null); setSortDir(null); }
      else { setSortDir('asc'); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey, sortDir]);

  const sortRows = useCallback((rows: { l: Lancamento; c: ReturnType<typeof calcIndicadoresLancamento> }[]) => {
    if (!sortKey || !sortDir) return rows;
    const sorted = [...rows].sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortKey) {
        case 'data': va = a.l.data; vb = b.l.data; break;
        case 'qtd': va = a.l.quantidade; vb = b.l.quantidade; break;
        case 'categoria': va = a.l.categoria; vb = b.l.categoria; break;
        case 'destino': va = a.l.fazendaDestino || ''; vb = b.l.fazendaDestino || ''; break;
        case 'pesoVivo': va = a.l.pesoMedioKg ?? 0; vb = b.l.pesoMedioKg ?? 0; break;
        case 'rend': va = a.c.rendimento; vb = b.c.rendimento; break;
        case 'pesoArroba': va = a.c.pesoArroba; vb = b.c.pesoArroba; break;
        case 'total': va = a.c.valorFinal; vb = b.c.valorFinal; break;
        case 'liqArroba': va = a.c.liqArroba; vb = b.c.liqArroba; break;
        case 'liqKg': va = a.c.liqKg; vb = b.c.liqKg; break;
        case 'liqCab': va = a.c.liqCabeca; vb = b.c.liqCabeca; break;
        case 'status': va = getStatusOrdenacao(a.l); vb = getStatusOrdenacao(b.l); break;
      }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return sorted;
  }, [sortKey, sortDir]);

  return { sortKey, sortDir, toggleSort, sortRows };
}

/* ── Tables ── */

function UnifiedTable({ lancamentos, onEdit, showTipo, subTipo, isGlobal, fazendaMap }: { lancamentos: Lancamento[]; onEdit: (l: Lancamento) => void; showTipo?: boolean; subTipo?: string; isGlobal?: boolean; fazendaMap?: Map<string, string> }) {
  const isCompra = subTipo === 'compra';
  const showFornecedorCol = ['abate', 'venda'].includes(subTipo || '');
  const showMotivoCol = ['morte', 'consumo'].includes(subTipo || '');
  const showLiqKg = showTipo || ['abate', 'venda', 'compra', 'transferencia_entrada', 'transferencia_saida', 'consumo', 'morte'].includes(subTipo || '');
  const fMap = fazendaMap || new Map<string, string>();
  const globalColHeader = isGlobal ? (subTipo ? getFazendaColumnHeader(subTipo) : 'Fazenda') : '';

  const { sortKey, sortDir, toggleSort, sortRows } = useSortableTable();

  const rows = useMemo(() => {
    const base = lancamentos.map(l => ({ l, c: calcIndicadoresLancamento(l) }));
    return sortRows(base);
  }, [lancamentos, sortRows]);

  if (lancamentos.length === 0) return <p className="text-center text-muted-foreground py-6">Nenhum registro no período</p>;

  const hp = { currentKey: sortKey, currentDir: sortDir, onSort: toggleSort };

  return (
    <table className="w-full min-w-[760px] md:min-w-0 table-auto border-collapse text-[10px]">
      <thead className="financeiro-table-head print:static">
        <tr className="border-b border-primary-foreground/15">
          <SortableHeader label="Data" align="text-left" sortKey="data" sticky {...hp} />
          {showTipo && <th className={`${TABLE_HEAD_CELL} text-left`}>Tipo</th>}
          <SortableHeader label="Qtd" align="text-right" sortKey="qtd" {...hp} />
          <SortableHeader label="Categoria" align="text-left" sortKey="categoria" {...hp} />
          {isCompra && <th className={`${TABLE_HEAD_CELL} text-left`}>Fornecedor</th>}
          {showFornecedorCol && <th className={`${TABLE_HEAD_CELL} text-left`} style={{ minWidth: '90px' }}>{subTipo === 'abate' ? 'Frigorífico' : 'Destino'}</th>}
          {showMotivoCol && <th className={`${TABLE_HEAD_CELL} text-left`} style={{ minWidth: '90px' }}>Motivo</th>}
          {isGlobal && <th className={`${TABLE_HEAD_CELL} text-left`}>{showTipo ? 'Fazenda' : globalColHeader}</th>}
          <SortableHeader label="P.Vivo" align="text-right" sortKey="pesoVivo" {...hp} />
          <SortableHeader label="P.@" align="text-right" sortKey="pesoArroba" {...hp} />
          <SortableHeader label="Total" align="text-right" sortKey="total" {...hp} />
          <SortableHeader label="R$/líq @" align="text-right" sortKey="liqArroba" {...hp} />
          {showLiqKg && <SortableHeader label="R$/Kg Líq" align="text-right" sortKey="liqKg" {...hp} />}
          <SortableHeader label="Líq/Cab" align="text-right" sortKey="liqCab" {...hp} />
          <SortableHeader label="Status" align="text-center" sortKey="status" {...hp} />
          <th className={`${TABLE_HEAD_CELL} text-center w-6`}></th>
        </tr>
      </thead>
      <tbody className="bg-card">
        {rows.map(({ l, c }) => {
          const cat = CATEGORIAS.find(ca => ca.value === l.categoria)?.label ?? l.categoria;
          const tipoInfo = SUB_ABA_LABELS[l.tipo as SubAba];
          return (
            <tr key={l.id} className="border-b border-border/70 leading-none hover:bg-muted/30">
              <td className={`${TABLE_BODY_CELL} text-[9px] sticky left-0 z-20 bg-card border-r border-border/60 md:static md:border-r-0`}>{format(parseISO(l.data), 'dd/MM/yy')}</td>
              {showTipo && <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{tipoInfo?.icon} {tipoInfo?.label || l.tipo}</td>}
              <td className={`${TABLE_BODY_CELL} text-right font-bold text-[9px]`}>{l.quantidade}</td>
              <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{cat}</td>
              {isCompra && <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{l.fazendaOrigem || l.compradorFornecedor || '—'}</td>}
              {showFornecedorCol && <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{l.compradorFornecedor || '—'}</td>}
              {showMotivoCol && <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{(l as any).motivo || l.observacao || '—'}</td>}
              {isGlobal && <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{showTipo ? (fMap.get(l.fazendaId || '') || '-') : getFazendaCellValue(l, fMap)}</td>}
              <td className={`${TABLE_BODY_CELL} text-right text-[9px]`}>{l.pesoMedioKg != null ? l.pesoMedioKg.toFixed(2) : '-'}</td>
              <td className={`${TABLE_BODY_CELL} text-right text-[9px] text-muted-foreground`}>{c.pesoArroba ? c.pesoArroba.toFixed(2) : '-'}</td>
              <td className={`${TABLE_BODY_CELL} text-right font-bold text-[9px] text-primary`}>{fmtValor(c.valorFinal)}</td>
              <td className={`${TABLE_BODY_CELL} text-right text-[9px]`}>{fmtValor(c.liqArroba)}</td>
              {showLiqKg && <td className={`${TABLE_BODY_CELL} text-right text-[9px]`}>{fmtValor(c.liqKg)}</td>}
              <td className={`${TABLE_BODY_CELL} text-right text-[9px]`}>{fmtValor(c.liqCabeca)}</td>
              <td className={`${TABLE_BODY_CELL} text-center`}>
                {(() => {
                  const cfg = getStatusBadge(l);
                  return <span className={`inline-flex max-w-full items-center justify-center truncate rounded px-1 py-px text-[8px] font-bold ${cfg.cls}`}>{cfg.label}</span>;
                })()}
              </td>
              <td className={`${TABLE_BODY_CELL} text-center`}>
                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => onEdit(l)}>
                  <Info className="h-2.5 w-2.5" />
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
      {lancamentos.length > 1 && (() => {
         const totals = lancamentos.reduce((acc, l) => {
          const c = calcIndicadoresLancamento(l);
          acc.qtd += l.quantidade;
          acc.pesoVivoTotal += (l.pesoMedioKg ?? 0) * l.quantidade;
          acc.arrobasTotal += c.pesoTotalArrobas;
          acc.valorTotal += c.valorFinal;
          return acc;
        }, { qtd: 0, pesoVivoTotal: 0, arrobasTotal: 0, valorTotal: 0 });
        const pesoVivoMedio = totals.qtd > 0 ? totals.pesoVivoTotal / totals.qtd : 0;
        const arrobaMedio = totals.qtd > 0 ? totals.arrobasTotal / totals.qtd : 0;
        const liqArroba = totals.arrobasTotal > 0 ? totals.valorTotal / totals.arrobasTotal : 0;
        const liqCabeca = totals.qtd > 0 ? totals.valorTotal / totals.qtd : 0;
        const liqKgTotal = totals.pesoVivoTotal > 0 ? totals.valorTotal / totals.pesoVivoTotal : 0;
        return (
           <tfoot>
            <tr className="bg-primary text-primary-foreground">
              <td className={`${TABLE_FOOT_CELL} sticky left-0 z-20 bg-primary border-r border-primary-foreground/15 md:static md:border-r-0`}>TOTAL</td>
              {showTipo && <td className={TABLE_FOOT_CELL}></td>}
              <td className={`${TABLE_FOOT_CELL} text-right`}>{totals.qtd}</td>
              <td className={TABLE_FOOT_CELL}></td>
              {isCompra && <td className={TABLE_FOOT_CELL}></td>}
              {showFornecedorCol && <td className={TABLE_FOOT_CELL}></td>}
              {showMotivoCol && <td className={TABLE_FOOT_CELL}></td>}
              {isGlobal && <td className={TABLE_FOOT_CELL}></td>}
              <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(pesoVivoMedio)}</td>
              <td className={`${TABLE_FOOT_CELL} text-right opacity-80`}>{fmtValor(arrobaMedio)}</td>
              <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(totals.valorTotal)}</td>
              <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(liqArroba)}</td>
              {showLiqKg && <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(liqKgTotal)}</td>}
              <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(liqCabeca)}</td>
              <td className={TABLE_FOOT_CELL}></td>
              <td className={TABLE_FOOT_CELL}></td>
            </tr>
          </tfoot>
        );
      })()}
    </table>
  );
}

function AbateTable({ lancamentos, onEdit, isGlobal, fazendaMap }: { lancamentos: Lancamento[]; onEdit: (l: Lancamento) => void; isGlobal?: boolean; fazendaMap?: Map<string, string> }) {
  const fMap = fazendaMap || new Map<string, string>();
  const { sortKey, sortDir, toggleSort, sortRows } = useSortableTable();

  const rows = useMemo(() => {
    const base = lancamentos.map(l => ({ l, c: calcIndicadoresLancamento(l) }));
    return sortRows(base);
  }, [lancamentos, sortRows]);

  if (lancamentos.length === 0) return <p className="text-center text-muted-foreground py-6">Nenhum abate no período</p>;

  const hp = { currentKey: sortKey, currentDir: sortDir, onSort: toggleSort };

  return (
    <table className="w-full min-w-[720px] md:min-w-0 table-auto border-collapse text-[10px]">
      <thead className="financeiro-table-head print:static">
        <tr className="border-b border-primary-foreground/15">
          <SortableHeader label="Data" align="text-left" sortKey="data" sticky {...hp} />
          <SortableHeader label="Qtd" align="text-right" sortKey="qtd" {...hp} />
          <SortableHeader label="Categoria" align="text-left" sortKey="categoria" {...hp} />
          <SortableHeader label="Destino" align="text-left" sortKey="destino" {...hp} />
          {isGlobal && <th className={`${TABLE_HEAD_CELL} text-left`}>Origem</th>}
          <SortableHeader label="P.Vivo" align="text-right" sortKey="pesoVivo" {...hp} />
          <SortableHeader label="Rend." align="text-right" sortKey="rend" {...hp} />
          <SortableHeader label="P.@" align="text-right" sortKey="pesoArroba" {...hp} />
          <SortableHeader label="Total" align="text-right" sortKey="total" {...hp} />
          <SortableHeader label="R$/líq @" align="text-right" sortKey="liqArroba" {...hp} />
          <SortableHeader label="Líq/Cab" align="text-right" sortKey="liqCab" {...hp} />
          <SortableHeader label="Status" align="text-center" sortKey="status" {...hp} />
          <th className={`${TABLE_HEAD_CELL} text-center w-6`}></th>
        </tr>
      </thead>
      <tbody className="bg-card">
        {rows.map(({ l, c }) => {
          const cat = CATEGORIAS.find(ca => ca.value === l.categoria)?.label ?? l.categoria;
          return (
            <tr key={l.id} className="border-b border-border/70 leading-none hover:bg-muted/30">
              <td className={`${TABLE_BODY_CELL} text-[9px] sticky left-0 z-20 bg-card border-r border-border/60 md:static md:border-r-0`}>{format(parseISO(l.data), 'dd/MM/yy')}</td>
              <td className={`${TABLE_BODY_CELL} text-right font-bold text-[9px]`}>{l.quantidade}</td>
              <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{cat}</td>
              <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{l.fazendaDestino || '-'}</td>
              {isGlobal && <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{fMap.get(l.fazendaId || '') || '-'}</td>}
              <td className={`${TABLE_BODY_CELL} text-right text-[9px]`}>{l.pesoMedioKg != null ? l.pesoMedioKg.toFixed(2) : '-'}</td>
              <td className={`${TABLE_BODY_CELL} text-right text-[9px] text-muted-foreground`}>{c.rendimento ? c.rendimento.toFixed(1) + '%' : '-'}</td>
              <td className={`${TABLE_BODY_CELL} text-right text-[9px]`}>{c.pesoArroba ? c.pesoArroba.toFixed(2) : '-'}</td>
              <td className={`${TABLE_BODY_CELL} text-right font-bold text-[9px] text-primary`}>{fmtValor(c.valorFinal)}</td>
              <td className={`${TABLE_BODY_CELL} text-right text-[9px]`}>{fmtValor(c.liqArroba)}</td>
              <td className={`${TABLE_BODY_CELL} text-right text-[9px]`}>{fmtValor(c.liqCabeca)}</td>
              <td className={`${TABLE_BODY_CELL} text-center`}>
                {(() => {
                  const cfg = getStatusBadge(l);
                  return <span className={`inline-flex max-w-full items-center justify-center truncate rounded px-1 py-px text-[8px] font-bold ${cfg.cls}`}>{cfg.label}</span>;
                })()}
              </td>
              <td className={`${TABLE_BODY_CELL} text-center`}>
                <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => onEdit(l)}>
                  <Info className="h-2.5 w-2.5" />
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
      {lancamentos.length > 1 && (() => {
        const totals = lancamentos.reduce((acc, l) => {
          const c = calcIndicadoresLancamento(l);
          acc.qtd += l.quantidade;
          acc.pesoVivoTotal += (l.pesoMedioKg ?? 0) * l.quantidade;
          acc.arrobasTotal += c.pesoTotalArrobas;
          acc.valorTotal += c.valorFinal;
          acc.rendSum += c.rendimento * l.quantidade;
          return acc;
        }, { qtd: 0, pesoVivoTotal: 0, arrobasTotal: 0, valorTotal: 0, rendSum: 0 });
        const pesoVivoMedio = totals.qtd > 0 ? totals.pesoVivoTotal / totals.qtd : 0;
        const arrobaMedio = totals.qtd > 0 ? totals.arrobasTotal / totals.qtd : 0;
        const rendMedio = totals.qtd > 0 ? totals.rendSum / totals.qtd : 0;
        const liqArroba = totals.arrobasTotal > 0 ? totals.valorTotal / totals.arrobasTotal : 0;
        const liqCabeca = totals.qtd > 0 ? totals.valorTotal / totals.qtd : 0;
        return (
          <tfoot>
            <tr className="bg-primary text-primary-foreground">
              <td className={`${TABLE_FOOT_CELL} sticky left-0 z-20 bg-primary border-r border-primary-foreground/15 md:static md:border-r-0`}>TOTAL</td>
              <td className={`${TABLE_FOOT_CELL} text-right`}>{totals.qtd}</td>
              <td className={TABLE_FOOT_CELL}></td>
              <td className={TABLE_FOOT_CELL}></td>
              {isGlobal && <td className={TABLE_FOOT_CELL}></td>}
              <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(pesoVivoMedio)}</td>
              <td className={`${TABLE_FOOT_CELL} text-right opacity-80`}>{rendMedio ? rendMedio.toFixed(1) + '%' : '-'}</td>
              <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(arrobaMedio)}</td>
              <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(totals.valorTotal)}</td>
              <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(liqArroba)}</td>
              <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(liqCabeca)}</td>
              <td className={TABLE_FOOT_CELL}></td>
              <td className={TABLE_FOOT_CELL}></td>
            </tr>
          </tfoot>
        );
      })()}
    </table>
  );
}

const FINANCIAL_TYPES: SubAba[] = ['abate', 'compra', 'venda'];

function getTopTabFromSubAba(subAba?: SubAba): TopTab {
  if (!subAba) return 'entradas';
  if (subAba === 'historico') return 'historico';
  if (ENTRY_TYPES.includes(subAba)) return 'entradas';
  if (EXIT_TYPES.includes(subAba)) return 'saidas';
  return 'entradas';
}

export function FinanceiroTab({ lancamentos, onEditar, onRemover, subAbaInicial, modoMovimentacao, filtroAnoInicial, filtroMesInicial, filtroStatusInicial, onBack, drillDownLabel, onEditarAbate, onEditarVenda, onEditarCompra, onEditarTransferencia, onEditarReclass, onEditarMorte, onEditarConsumo }: Props) {
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const fazendaMap = useMemo(() => {
    const m = new Map<string, string>();
    fazendas.forEach(f => m.set(f.id, f.nome));
    return m;
  }, [fazendas]);
  const lancamentosNormalizados = useMemo(
    () => lancamentos.map(normalizeZooLancamento),
    [lancamentos],
  );
  const [topTab, setTopTab] = useState<TopTab>(subAbaInicial ? getTopTabFromSubAba(subAbaInicial) : 'entradas');
  const [subAba, setSubAba] = useState<SubAba>(subAbaInicial || 'abate');
  const [detalheId, setDetalheId] = useState<string | null>(null);

  useEffect(() => {
    if (subAbaInicial) {
      setTopTab(getTopTabFromSubAba(subAbaInicial));
      setSubAba(subAbaInicial);
    }
  }, [subAbaInicial]);

  const { data: anosDisponiveis = [String(new Date().getFullYear())] } = useAnosDisponiveis();

  const [anoFiltro, setAnoFiltro] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState(filtroMesInicial || 'todos');
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>(normalizeStatusFiltro(filtroStatusInicial));
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');

  useEffect(() => {
    if (filtroAnoInicial) setAnoFiltro(filtroAnoInicial);
    if (filtroMesInicial) setMesFiltro(filtroMesInicial);
    if (filtroStatusInicial) setStatusFiltro(normalizeStatusFiltro(filtroStatusInicial));
  }, [filtroAnoInicial, filtroMesInicial, filtroStatusInicial]);

  const filtrados = useMemo(() => {
    let tiposFilter: string[] = [];
    if (topTab === 'todas') {
      tiposFilter = [...ENTRY_TYPES, ...EXIT_TYPES];
    } else if (topTab === 'entradas') {
      tiposFilter = [subAba];
    } else if (topTab === 'saidas') {
      tiposFilter = [subAba];
    }

    return lancamentosNormalizados
      .filter(l => {
        try {
          const d = parseISO(l.data);
          if (format(d, 'yyyy') !== anoFiltro) return false;
          if (mesFiltro !== 'todos' && format(d, 'MM') !== mesFiltro) return false;
          if (!tiposFilter.includes(l.tipo)) return false;
          const st = l.statusOperacional || 'realizado';
          if (statusFiltro === 'realizado' && (l.cenario !== 'realizado' || st !== 'realizado')) return false;
          if (statusFiltro === 'programado' && (l.cenario !== 'realizado' || st !== 'programado')) return false;
          if (statusFiltro === 'meta' && l.cenario !== 'meta') return false;
          if (categoriaFiltro !== 'todas' && l.categoria !== categoriaFiltro) return false;
          return true;
        } catch { return false; }
      })
      .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  }, [lancamentosNormalizados, anoFiltro, mesFiltro, topTab, subAba, statusFiltro, categoriaFiltro]);

  /* Categories available in current type */
  const categoriasDisponiveis = useMemo(() => {
    let tiposFilter: string[] = [];
    if (topTab === 'todas') tiposFilter = [...ENTRY_TYPES, ...EXIT_TYPES];
    else tiposFilter = [subAba];
    const cats = new Set<string>();
    lancamentosNormalizados.forEach(l => {
      if (tiposFilter.includes(l.tipo)) cats.add(l.categoria);
    });
    return CATEGORIAS.filter(c => cats.has(c.value));
  }, [lancamentosNormalizados, topTab, subAba]);

  const isFinancial = FINANCIAL_TYPES.includes(subAba);

  const historicoFiltrado = useMemo(() => {
    return lancamentosNormalizados.filter(l => {
      try {
        const d = parseISO(l.data);
        if (format(d, 'yyyy') !== anoFiltro) return false;
        if (mesFiltro !== 'todos' && format(d, 'MM') !== mesFiltro) return false;
        return true;
      } catch { return false; }
    });
  }, [lancamentosNormalizados, anoFiltro, mesFiltro]);

  const MESES_HIST = [
    { value: 'todos', label: 'Todos' },
    { value: '01', label: 'Jan' }, { value: '02', label: 'Fev' },
    { value: '03', label: 'Mar' }, { value: '04', label: 'Abr' },
    { value: '05', label: 'Mai' }, { value: '06', label: 'Jun' },
    { value: '07', label: 'Jul' }, { value: '08', label: 'Ago' },
    { value: '09', label: 'Set' }, { value: '10', label: 'Out' },
    { value: '11', label: 'Nov' }, { value: '12', label: 'Dez' },
  ];

  const allTopTabs: { id: TopTab; label: string; icon: string }[] = [
    { id: 'entradas', label: 'Entradas', icon: '📥' },
    { id: 'saidas', label: 'Saídas', icon: '📤' },
    { id: 'historico', label: 'Evol. Cat.', icon: '🔄' },
    { id: 'chuvas', label: 'Chuvas', icon: '☁️' },
  ];
  const topTabs = modoMovimentacao
    ? allTopTabs.filter(t => t.id !== 'chuvas')
    : allTopTabs;

  const subTypes = topTab === 'entradas' ? ENTRY_TYPES : topTab === 'saidas' ? EXIT_TYPES : [];

  if (topTab === 'historico') {
    const reclassFiltrados = historicoFiltrado
      .filter(l => isReclassificacao(l.tipo))
      .filter(l => {
        const st = l.statusOperacional || 'realizado';
        if (statusFiltro === 'realizado' && (l.cenario !== 'realizado' || st !== 'realizado')) return false;
        if (statusFiltro === 'programado' && (l.cenario !== 'realizado' || st !== 'programado')) return false;
        if (statusFiltro === 'meta' && l.cenario !== 'meta') return false;
        if (categoriaFiltro !== 'todas' && l.categoria !== categoriaFiltro) return false;
        return true;
      })
      .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

    const reclassStats = (() => {
      let qtd = 0;
      let pesoTotal = 0;
      reclassFiltrados.forEach(l => {
        qtd += l.quantidade;
        pesoTotal += (l.pesoMedioKg ?? 0) * l.quantidade;
      });
      const pesoMedio = qtd > 0 ? pesoTotal / qtd : 0;
      return { qtd, pesoMedio };
    })();

    const reclassCatsDisponiveis = (() => {
      const cats = new Set<string>();
      historicoFiltrado.filter(l => isReclassificacao(l.tipo)).forEach(l => cats.add(l.categoria));
      return CATEGORIAS.filter(c => cats.has(c.value));
    })();

    const mesLabelHist = mesFiltro === 'todos' ? 'Todos' : (MESES_OPTIONS.find(m => m.value === mesFiltro)?.label || mesFiltro);
    const catLabelHist = categoriaFiltro === 'todas' ? 'Todas' : (CATEGORIAS.find(c => c.value === categoriaFiltro)?.label || categoriaFiltro);
    const statusLabelHist = getStatusFiltroLabel(statusFiltro);

    return (
      <div className="w-full max-w-full animate-fade-in pb-20">
        <div className="bg-primary text-primary-foreground px-3 py-2 space-y-1.5">
          {/* Top tabs */}
          <div className={`grid gap-0.5 rounded-md bg-card p-0.5 max-w-md grid-cols-${topTabs.length}`}>
            {topTabs.map(t => (
              <button
                key={t.id}
                onClick={() => { setTopTab(t.id); if (t.id === 'entradas') setSubAba('nascimento'); if (t.id === 'saidas') setSubAba('abate'); }}
                className={`py-1 px-1 text-[11px] rounded font-bold transition-colors ${
                  topTab === t.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-1">
            <Select value={anoFiltro} onValueChange={setAnoFiltro}>
              <SelectTrigger className="h-6 text-[10px] font-bold w-[68px] bg-card text-foreground border-border"><SelectValue placeholder="Ano" /></SelectTrigger>
              <SelectContent side="bottom">{anosDisponiveis.map(a => <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={mesFiltro} onValueChange={setMesFiltro}>
              <SelectTrigger className="h-6 text-[10px] font-bold w-[110px] bg-card text-foreground border-border"><SelectValue placeholder="Mês" /></SelectTrigger>
              <SelectContent side="bottom">{MESES_OPTIONS.map(m => <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger className="h-6 text-[10px] font-bold w-[100px] bg-card text-foreground border-border"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent side="bottom">
                <SelectItem value="todas" className="text-sm">Todas</SelectItem>
                {reclassCatsDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-sm">{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-px rounded border border-primary-foreground/20 bg-primary-foreground/5 p-px">
              {([
                { value: 'realizado' as StatusFiltro, label: 'Realizado', activeClass: 'bg-success text-success-foreground' },
                { value: 'programado' as StatusFiltro, label: 'Programado', activeClass: 'bg-secondary text-secondary-foreground' },
                { value: 'meta' as StatusFiltro, label: 'Meta', activeClass: 'bg-warning text-warning-foreground' },
              ]).map(s => (
                <button
                  key={s.value}
                  onClick={() => setStatusFiltro(s.value === statusFiltro ? 'todos' : s.value)}
                  className={`px-2 py-px rounded text-[9px] font-bold transition-colors ${
                    statusFiltro === s.value ? s.activeClass : 'text-primary-foreground/70 hover:bg-primary-foreground/10'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="flex gap-3 px-2 pt-1.5 pb-4">
          {/* Table */}
          <div className="flex-[7] min-w-0 rounded-md border border-border/70 bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-[9px]">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className={`${TABLE_HEAD_CELL} text-left`}>DATA</th>
                  <th className={`${TABLE_HEAD_CELL} text-right`}>QTD</th>
                  <th className={`${TABLE_HEAD_CELL} text-left`}>CAT. ORIGEM</th>
                  <th className={`${TABLE_HEAD_CELL} text-left`}>CAT. DESTINO</th>
                  <th className={`${TABLE_HEAD_CELL} text-right`}>P.VIVO</th>
                  <th className={`${TABLE_HEAD_CELL} text-center`}>STATUS</th>
                  <th className={`${TABLE_HEAD_CELL} text-center w-6`}></th>
                </tr>
              </thead>
              <tbody>
                {reclassFiltrados.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-muted-foreground py-8 text-[12px]">Nenhuma evolução no período</td></tr>
                ) : reclassFiltrados.map(l => {
                  const catOrigem = CATEGORIAS.find(c => c.value === l.categoria)?.label || l.categoria;
                  const catDestino = l.categoriaDestino ? (CATEGORIAS.find(c => c.value === l.categoriaDestino)?.label || l.categoriaDestino) : '-';
                  const cfg = getStatusBadge(l);
                  return (
                    <tr key={l.id} onClick={() => setDetalheId(l.id)} className="border-b border-border/70 leading-none hover:bg-muted/30 cursor-pointer transition-colors">
                      <td className={`${TABLE_BODY_CELL} text-[9px]`}>{format(parseISO(l.data), 'dd/MM/yy')}</td>
                      <td className={`${TABLE_BODY_CELL} text-right font-bold text-[9px]`}>{l.quantidade}</td>
                      <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{catOrigem}</td>
                      <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{catDestino}</td>
                      <td className={`${TABLE_BODY_CELL} text-right text-[9px]`}>{l.pesoMedioKg ? `${Number(l.pesoMedioKg).toFixed(2)}` : '-'}</td>
                      <td className={`${TABLE_BODY_CELL} text-center`}>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${cfg.cls}`}>{cfg.label}</span>
                      </td>
                      <td className={`${TABLE_BODY_CELL} text-center`}><Info className="h-3 w-3 text-muted-foreground inline" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary panel */}
          <div className="flex-[3] min-w-[180px] max-w-[260px] flex-shrink-0 hidden md:block">
            <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden sticky top-2">
              <div className="bg-primary px-3 py-2.5">
                <h3 className="text-[11px] font-bold text-primary-foreground tracking-wide uppercase">EVOLUÇÕES</h3>
              </div>
              <div className="px-3 py-2 bg-muted/40 border-b border-border">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
                  <div className="text-muted-foreground">Ano</div>
                  <div className="font-bold text-foreground">{anoFiltro}</div>
                  <div className="text-muted-foreground">Mês</div>
                  <div className="font-bold text-foreground">{mesLabelHist}</div>
                  <div className="text-muted-foreground">Categoria</div>
                  <div className="font-bold text-foreground">{catLabelHist}</div>
                  <div className="text-muted-foreground">Status</div>
                  <div className="font-bold text-foreground">{statusLabelHist}</div>
                </div>
              </div>
              <div className="px-3 py-2 space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Qtde</span>
                  <span className="font-bold tabular-nums text-[11px] text-foreground">{formatCabecas(reclassStats.qtd)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Peso médio</span>
                  <span className="font-bold tabular-nums text-[11px] text-foreground">{formatKg(reclassStats.pesoMedio)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detail modal */}
        {(() => {
          const lancamentoDetalhe = detalheId ? lancamentosNormalizados.find(l => l.id === detalheId) : null;
          return lancamentoDetalhe ? (
            <LancamentoDetalhe
              lancamento={lancamentoDetalhe}
              open={!!detalheId}
              onClose={() => setDetalheId(null)}
              onEditar={(id, dados) => { onEditar(id, dados); setDetalheId(null); }}
              onRemover={(id) => { onRemover(id); setDetalheId(null); }}
              onEditarReclass={onEditarReclass ? (l) => { setDetalheId(null); onEditarReclass(l, { subAba: 'historico' as SubAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
              onEditarAbate={onEditarAbate ? (l) => { setDetalheId(null); onEditarAbate(l, { subAba: subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
              onEditarVenda={onEditarVenda ? (l) => { setDetalheId(null); onEditarVenda(l, { subAba: subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
              onEditarCompra={onEditarCompra ? (l) => { setDetalheId(null); onEditarCompra(l, { subAba: subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
              onEditarTransferencia={onEditarTransferencia ? (l) => { setDetalheId(null); onEditarTransferencia(l, { subAba: subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
              onEditarMorte={onEditarMorte ? (l) => { setDetalheId(null); onEditarMorte(l, { subAba: subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
              onEditarConsumo={onEditarConsumo ? (l) => { setDetalheId(null); onEditarConsumo(l, { subAba: subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
            />
          ) : null;
        })()}
      </div>
    );
  }

  if (topTab === 'chuvas') {
    return (
      <div className="animate-fade-in pb-20">
        <div className="p-4 pb-0">
          <div className={`grid gap-0.5 bg-muted rounded-md p-0.5 max-w-md grid-cols-${topTabs.length}`}>
            {topTabs.map(t => (
              <button
                key={t.id}
                onClick={() => { setTopTab(t.id); if (t.id === 'entradas') setSubAba('nascimento'); if (t.id === 'saidas') setSubAba('abate'); }}
                className={`py-1 px-1 rounded font-bold transition-colors text-[11px] ${
                  topTab === t.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
        <ChuvasTab />
      </div>
    );
  }

  return (
    <div className="w-full max-w-full animate-fade-in pb-20">
      {/* ── Top panel ── */}
      <div className="bg-primary text-primary-foreground px-3 py-2 space-y-1.5">
        {(onBack || drillDownLabel) && (
          <div className="space-y-1.5 border-b border-primary-foreground/10 pb-2">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-80"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar
              </button>
            )}
            {drillDownLabel && (
              <div className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground">
                <Filter className="h-3 w-3 text-primary" />
                {drillDownLabel}
              </div>
            )}
          </div>
        )}

        {/* Top tabs */}
        <div className={`grid gap-0.5 rounded-md bg-card p-0.5 max-w-md ${modoMovimentacao ? 'grid-cols-2' : `grid-cols-${topTabs.length}`}`}>
          {topTabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setTopTab(t.id); if (t.id === 'entradas') setSubAba('nascimento'); if (t.id === 'saidas') setSubAba('abate'); }}
              className={`${modoMovimentacao ? 'py-1 px-1.5 text-[11px]' : 'py-1 px-1 text-[11px]'} rounded font-bold transition-colors ${
                topTab === t.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Sub-type tabs */}
        {subTypes.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {subTypes.map(st => {
              const info = SUB_ABA_LABELS[st];
              return (
                <button
                  key={st}
                  onClick={() => setSubAba(st)}
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap transition-colors ${
                    subAba === st ? 'border-primary-foreground bg-primary-foreground/15 text-primary-foreground shadow-sm' : 'border-primary-foreground/20 text-primary-foreground/60 hover:text-primary-foreground'
                  }`}
                >
                  {info.icon} {info.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-1">
          <Select value={anoFiltro} onValueChange={setAnoFiltro}>
            <SelectTrigger className="h-6 text-[10px] font-bold w-[68px] bg-card text-foreground border-border">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent side="bottom">
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={mesFiltro} onValueChange={setMesFiltro}>
            <SelectTrigger className="h-6 text-[10px] font-bold w-[110px] bg-card text-foreground border-border">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent side="bottom">
              {MESES_OPTIONS.map(m => (
                <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Category filter */}
          <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
            <SelectTrigger className="h-6 text-[10px] font-bold w-[100px] bg-card text-foreground border-border">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent side="bottom">
              <SelectItem value="todas" className="text-sm">Todas</SelectItem>
              {categoriasDisponiveis.map(c => (
                <SelectItem key={c.value} value={c.value} className="text-sm">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter buttons */}
          <div className="flex gap-px rounded border border-primary-foreground/20 bg-primary-foreground/5 p-px">
            {([
              { value: 'realizado' as StatusFiltro, label: 'Realizado', activeClass: 'bg-success text-success-foreground' },
              { value: 'programado' as StatusFiltro, label: 'Programado', activeClass: 'bg-secondary text-secondary-foreground' },
              { value: 'meta' as StatusFiltro, label: 'Meta', activeClass: 'bg-warning text-warning-foreground' },
            ]).map(s => (
              <button
                key={s.value}
                onClick={() => setStatusFiltro(s.value === statusFiltro ? 'todos' : s.value)}
                className={`px-2 py-px rounded text-[9px] font-bold transition-colors ${
                  statusFiltro === s.value
                    ? s.activeClass
                    : 'text-primary-foreground/70 hover:bg-primary-foreground/10'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Export — always visible for financial types */}
          {isFinancial && topTab !== 'todas' && (
            <div className="[&_button]:text-foreground [&_button]:bg-card [&_button]:border-border [&_button]:font-bold">
              <FinanceiroExportMenu
                lancamentos={filtrados}
                subAba={subAba as 'abate' | 'compra' | 'venda'}
                ano={anoFiltro}
                fazendaNome={fazendaAtual?.nome}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Content area: table (left ~70%) + summary panel (right ~30%) ── */}
      <div className="flex gap-3 px-2 pt-1.5 pb-4">
        {/* Table column */}
        <div className="flex-[7] min-w-0 rounded-md border border-border/70 bg-card shadow-sm overflow-x-auto">
          {topTab === 'todas' ? (
            <UnifiedTable lancamentos={filtrados} onEdit={(l) => setDetalheId(l.id)} showTipo isGlobal={isGlobal} fazendaMap={fazendaMap} />
          ) : subAba === 'abate' ? (
            <UnifiedTable lancamentos={filtrados} onEdit={(l) => setDetalheId(l.id)} subTipo="abate" isGlobal={isGlobal} fazendaMap={fazendaMap} />
          ) : (
            <UnifiedTable lancamentos={filtrados} onEdit={(l) => setDetalheId(l.id)} subTipo={subAba} isGlobal={isGlobal} fazendaMap={fazendaMap} />
          )}
        </div>

        {/* Summary panel */}
        <div className="flex-[3] min-w-[180px] max-w-[260px] flex-shrink-0 hidden md:block">
          <ResumoLateral
            lancamentos={filtrados}
            subAba={subAba}
            anoFiltro={anoFiltro}
            mesFiltro={mesFiltro}
            statusFiltro={statusFiltro}
            categoriaFiltro={categoriaFiltro}
          />
        </div>
      </div>

      {/* Detail modal */}
      {(() => {
        const lancamentoDetalhe = detalheId ? lancamentosNormalizados.find(l => l.id === detalheId) : null;
        return lancamentoDetalhe ? (
          <LancamentoDetalhe
            lancamento={lancamentoDetalhe}
            open={!!detalheId}
            onClose={() => setDetalheId(null)}
            onEditar={(id, dados) => { onEditar(id, dados); setDetalheId(null); }}
            onRemover={(id) => { onRemover(id); setDetalheId(null); }}
            onEditarAbate={onEditarAbate ? (l) => { setDetalheId(null); onEditarAbate(l, { subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
            onEditarVenda={onEditarVenda ? (l) => { setDetalheId(null); onEditarVenda(l, { subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
            onEditarCompra={onEditarCompra ? (l) => { setDetalheId(null); onEditarCompra(l, { subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
            onEditarTransferencia={onEditarTransferencia ? (l) => { setDetalheId(null); onEditarTransferencia(l, { subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
            onEditarReclass={onEditarReclass ? (l) => { setDetalheId(null); onEditarReclass(l, { subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
            onEditarMorte={onEditarMorte ? (l) => { setDetalheId(null); onEditarMorte(l, { subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
            onEditarConsumo={onEditarConsumo ? (l) => { setDetalheId(null); onEditarConsumo(l, { subAba, statusFiltro, anoFiltro, mesFiltro }); } : undefined}
          />
        ) : null;
      })()}
    </div>
  );
}
