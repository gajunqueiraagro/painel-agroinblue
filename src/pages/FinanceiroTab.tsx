import { useState, useMemo, useEffect } from 'react';
import { getStatusBadge } from '@/lib/statusOperacional';
import { Lancamento, CATEGORIAS } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { parseISO, format } from 'date-fns';
import { DollarSign, Info, ArrowLeft, Filter } from 'lucide-react';
import { LancamentoDetalhe } from '@/components/LancamentoDetalhe';
import { FinanceiroExportMenu } from '@/components/FinanceiroExportMenu';
import { ChuvasTab } from './ChuvasTab';
import { useFazenda } from '@/contexts/FazendaContext';
import { fmtValor } from '@/lib/calculos/formatters';
import { MESES_OPTIONS } from '@/lib/calculos/labels';
import { calcIndicadoresLancamento } from '@/lib/calculos/economicos';

type StatusFiltro = 'todos' | 'realizado' | 'programado' | 'previsto';

interface Props {
  lancamentos: Lancamento[];
  onEditar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover: (id: string) => void;
  subAbaInicial?: SubAba;
  /** Modo compacto para aba Movimentações: sem "Todas"/"Chuvas", filtros menores, header sticky */
  modoMovimentacao?: boolean;
  /** Filtro de ano inicial (quando vem de drill-down) */
  filtroAnoInicial?: string;
  /** Filtro de mês inicial (quando vem de drill-down) — formato '01'-'12' ou 'todos' */
  filtroMesInicial?: string;
  /** Callback para voltar à tela anterior (drill-down) */
  onBack?: () => void;
  /** Label do filtro aplicado (drill-down) */
  drillDownLabel?: string;
  /** Callback para editar abate no formulário completo (navega para LancamentosTab) */
  onEditarAbate?: (lancamento: Lancamento) => void;
}

export type SubAba = 'nascimento' | 'compra' | 'transferencia_entrada' | 'abate' | 'venda' | 'transferencia_saida' | 'consumo' | 'morte';

type TopTab = 'todas' | 'entradas' | 'saidas' | 'chuvas';

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
};

/**
 * Tabela unificada de movimentações com indicadores econômicos.
 * NOTA: Lógica econômica/competência do rebanho — não é módulo financeiro de caixa.
 */
/** Returns the contextual column header for fazenda info based on tipo */
function getFazendaColumnHeader(tipo: string): string {
  switch (tipo) {
    case 'nascimento': return 'Destino';
    case 'compra':
    case 'transferencia_entrada':
    case 'transferencia_saida': return 'Origem e Destino';
    case 'abate':
    case 'venda':
    case 'consumo': return 'Origem';
    case 'morte': return 'Origem e Motivo';
    default: return 'Fazenda';
  }
}

/** Returns fazenda cell value based on tipo */
function getFazendaCellValue(l: Lancamento, fazendaMap: Map<string, string>): string {
  const fazNome = l.fazendaId ? (fazendaMap.get(l.fazendaId) || '') : '';
  switch (l.tipo) {
    case 'nascimento':
      return fazNome || '-';
    case 'compra':
    case 'transferencia_entrada':
    case 'transferencia_saida': {
      const parts = [l.fazendaOrigem || fazNome, l.fazendaDestino].filter(Boolean);
      return parts.length > 0 ? parts.join(' → ') : '-';
    }
    case 'abate':
    case 'venda':
    case 'consumo':
      return fazNome || l.fazendaOrigem || '-';
    case 'morte': {
      const origem = fazNome || l.fazendaOrigem || '';
      const motivo = l.fazendaDestino || '';
      const parts2 = [origem, motivo].filter(Boolean);
      return parts2.length > 0 ? parts2.join(' / ') : '-';
    }
    default:
      return fazNome || '-';
  }
}

function UnifiedTable({ lancamentos, onEdit, showTipo, subTipo, isGlobal, fazendaMap }: { lancamentos: Lancamento[]; onEdit: (l: Lancamento) => void; showTipo?: boolean; subTipo?: string; isGlobal?: boolean; fazendaMap?: Map<string, string> }) {
  const TIPOS_COM_DESTINO = ['venda', 'transferencia_entrada', 'transferencia_saida', 'consumo', 'morte'];
  const showDestino = !isGlobal && (showTipo ? true : (subTipo ? TIPOS_COM_DESTINO.includes(subTipo) : false));
  const isMorte = subTipo === 'morte';
  const showLiqKg = showTipo ? true : (subTipo ? TIPOS_COM_DESTINO.includes(subTipo) : false);
  const fMap = fazendaMap || new Map<string, string>();
  // For global + single subTipo, use that tipo's header; for global + showTipo (todas), use generic "Fazenda"
  const globalColHeader = isGlobal ? (subTipo ? getFazendaColumnHeader(subTipo) : 'Fazenda') : '';
  if (lancamentos.length === 0) return <p className="text-center text-muted-foreground py-6">Nenhum registro no período</p>;

  return (
    <div>
      <table className="w-full text-[10px] border-collapse">
         <thead className="sticky top-0 z-10">
          <tr className="border-b border-border">
            <th className="px-1 py-0.5 text-left font-bold text-[9px] uppercase tracking-wide bg-background">Data</th>
            {showTipo && <th className="px-1 py-0.5 text-left font-bold text-[9px] uppercase tracking-wide bg-background">Tipo</th>}
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide bg-background">Qtd</th>
            <th className="px-1 py-0.5 text-left font-bold text-[9px] uppercase tracking-wide bg-background">Categoria</th>
            {showDestino && <th className="px-1 py-0.5 text-left font-bold text-[9px] uppercase tracking-wide bg-background">{isMorte ? 'Motivo' : 'Destino'}</th>}
            {isGlobal && <th className="px-1 py-0.5 text-left font-bold text-[9px] uppercase tracking-wide bg-background">{showTipo ? 'Fazenda' : globalColHeader}</th>}
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide bg-background">P.Vivo</th>
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide bg-background">P.@</th>
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide text-primary bg-background">Total</th>
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide bg-background">R$/líq @</th>
            {showLiqKg && <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide bg-background">R$/Kg Líq</th>}
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide bg-background">Líq/Cab</th>
            <th className="px-1 py-0.5 text-center font-bold text-[9px] uppercase tracking-wide bg-background">Status</th>
            <th className="px-1 py-0.5 w-6 bg-background"></th>
          </tr>
        </thead>
        <tbody>
          {lancamentos.map(l => {
            const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
            const c = calcIndicadoresLancamento(l);
            const tipoInfo = SUB_ABA_LABELS[l.tipo as SubAba];
            return (
              <tr key={l.id} className="border-b hover:bg-muted/30 leading-none">
                <td className="px-1 py-[3px] whitespace-nowrap">{format(parseISO(l.data), 'dd/MM/yy')}</td>
                {showTipo && <td className="px-1 py-[3px] text-[10px]">{tipoInfo?.icon} {tipoInfo?.label || l.tipo}</td>}
                <td className="px-1 py-[3px] text-right font-bold">{l.quantidade}</td>
                <td className="px-1 py-[3px]">{cat}</td>
                {showDestino && <td className="px-1 py-[3px] truncate max-w-[80px]">{(l.tipo === 'morte' ? l.fazendaDestino : (l.fazendaDestino || l.fazendaOrigem)) || '-'}</td>}
                {isGlobal && <td className="px-1 py-[3px] truncate max-w-[100px]">{showTipo ? (fMap.get(l.fazendaId || '') || '-') : getFazendaCellValue(l, fMap)}</td>}
                <td className="px-1 py-[3px] text-right">{l.pesoMedioKg != null ? l.pesoMedioKg.toFixed(2) : '-'}</td>
                <td className="px-1 py-[3px] text-right text-muted-foreground">{c.pesoArroba ? c.pesoArroba.toFixed(2) : '-'}</td>
                <td className="px-1 py-[3px] text-right font-bold text-primary">{fmtValor(c.valorFinal)}</td>
                <td className="px-1 py-[3px] text-right">{fmtValor(c.liqArroba)}</td>
                {showLiqKg && <td className="px-1 py-[3px] text-right">{fmtValor(c.liqKg)}</td>}
                <td className="px-1 py-[3px] text-right">{fmtValor(c.liqCabeca)}</td>
                <td className="px-1 py-[3px] text-center">
                  {(() => {
                    const cfg = getStatusBadge(l);
                    return <span className={`text-[8px] font-bold px-1 py-px rounded ${cfg.cls}`}>{cfg.label}</span>;
                  })()}
                </td>
                <td className="px-1 py-[3px]">
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onEdit(l)}>
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
              <tr className="border-t-2 border-primary/40 bg-muted/30 font-bold text-[10px]">
                <td className="px-1 py-[3px]">TOTAL</td>
                {showTipo && <td className="px-1 py-[3px]"></td>}
                <td className="px-1 py-[3px] text-right">{totals.qtd}</td>
                <td className="px-1 py-[3px]"></td>
                {showDestino && <td className="px-1 py-[3px]"></td>}
                {isGlobal && <td className="px-1 py-[3px]"></td>}
                <td className="px-1 py-[3px] text-right">{fmtValor(pesoVivoMedio)}</td>
                <td className="px-1 py-[3px] text-right text-muted-foreground">{fmtValor(arrobaMedio)}</td>
                <td className="px-1 py-[3px] text-right text-primary">{fmtValor(totals.valorTotal)}</td>
                <td className="px-1 py-[3px] text-right">{fmtValor(liqArroba)}</td>
                {showLiqKg && <td className="px-1 py-[3px] text-right">{fmtValor(liqKgTotal)}</td>}
                <td className="px-1 py-[3px] text-right">{fmtValor(liqCabeca)}</td>
                <td className="px-1 py-[3px]"></td>
                <td className="px-1 py-[3px]"></td>
              </tr>
            </tfoot>
          );
        })()}
      </table>
    </div>
  );
}

function AbateTable({ lancamentos, onEdit, isGlobal, fazendaMap }: { lancamentos: Lancamento[]; onEdit: (l: Lancamento) => void; isGlobal?: boolean; fazendaMap?: Map<string, string> }) {
  const fMap = fazendaMap || new Map<string, string>();
  if (lancamentos.length === 0) return <p className="text-center text-muted-foreground py-6">Nenhum abate no período</p>;

  return (
    <div>
      <table className="w-full text-[10px] border-collapse">
         <thead className="sticky top-0 z-10">
          <tr className="border-b border-border">
            <th className="px-1 py-0.5 text-left font-bold text-[9px] uppercase tracking-wide bg-background">Data</th>
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide bg-background">Qtd</th>
            <th className="px-1 py-0.5 text-left font-bold text-[9px] uppercase tracking-wide bg-background">Categoria</th>
            <th className="px-1 py-0.5 text-left font-bold text-[9px] uppercase tracking-wide bg-background">Destino</th>
            {isGlobal && <th className="px-1 py-0.5 text-left font-bold text-[9px] uppercase tracking-wide bg-background">Origem</th>}
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide bg-background">P.Vivo</th>
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide bg-background">Rend.</th>
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide bg-background">P.@</th>
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide text-primary bg-background">Total</th>
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide bg-background">R$/líq @</th>
            <th className="px-1 py-0.5 text-right font-bold text-[9px] uppercase tracking-wide bg-background">Líq/Cab</th>
            <th className="px-1 py-0.5 text-center font-bold text-[9px] uppercase tracking-wide bg-background">Status</th>
            <th className="px-1 py-0.5 w-6 bg-background"></th>
          </tr>
        </thead>
        <tbody>
          {lancamentos.map(l => {
            const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
            const c = calcIndicadoresLancamento(l);
            return (
              <tr key={l.id} className="border-b hover:bg-muted/30 leading-none">
                <td className="px-1 py-[3px] whitespace-nowrap">{format(parseISO(l.data), 'dd/MM/yy')}</td>
                <td className="px-1 py-[3px] text-right font-bold">{l.quantidade}</td>
                <td className="px-1 py-[3px]">{cat}</td>
                <td className="px-1 py-[3px] truncate max-w-[80px]">{l.fazendaDestino || '-'}</td>
                {isGlobal && <td className="px-1 py-[3px] truncate max-w-[100px]">{fMap.get(l.fazendaId || '') || '-'}</td>}
                <td className="px-1 py-[3px] text-right">{l.pesoMedioKg != null ? l.pesoMedioKg.toFixed(2) : '-'}</td>
                <td className="px-1 py-[3px] text-right text-muted-foreground">{c.rendimento ? c.rendimento.toFixed(1) + '%' : '-'}</td>
                <td className="px-1 py-[3px] text-right">{c.pesoArroba ? c.pesoArroba.toFixed(2) : '-'}</td>
                <td className="px-1 py-[3px] text-right font-bold text-primary">{fmtValor(c.valorFinal)}</td>
                <td className="px-1 py-[3px] text-right">{fmtValor(c.liqArroba)}</td>
                <td className="px-1 py-[3px] text-right">{fmtValor(c.liqCabeca)}</td>
                <td className="px-1 py-[3px] text-center">
                  {(() => {
                    const cfg = getStatusBadge(l);
                    return <span className={`text-[8px] font-bold px-1 py-px rounded ${cfg.cls}`}>{cfg.label}</span>;
                  })()}
                </td>
                <td className="px-1 py-[3px]">
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onEdit(l)}>
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
              <tr className="border-t-2 border-primary/40 bg-muted/30 font-bold text-[10px]">
                <td className="px-1 py-[3px]">TOTAL</td>
                <td className="px-1 py-[3px] text-right">{totals.qtd}</td>
                <td className="px-1 py-[3px]"></td>
                <td className="px-1 py-[3px]"></td>
                {isGlobal && <td className="px-1 py-[3px]"></td>}
                <td className="px-1 py-[3px] text-right">{fmtValor(pesoVivoMedio)}</td>
                <td className="px-1 py-[3px] text-right text-muted-foreground">{rendMedio ? rendMedio.toFixed(1) + '%' : '-'}</td>
                <td className="px-1 py-[3px] text-right">{fmtValor(arrobaMedio)}</td>
                <td className="px-1 py-[3px] text-right text-primary">{fmtValor(totals.valorTotal)}</td>
                <td className="px-1 py-[3px] text-right">{fmtValor(liqArroba)}</td>
                <td className="px-1 py-[3px] text-right">{fmtValor(liqCabeca)}</td>
                <td className="px-1 py-[3px]"></td>
                <td className="px-1 py-[3px]"></td>
              </tr>
            </tfoot>
          );
        })()}
      </table>
    </div>
  );
}

const FINANCIAL_TYPES: SubAba[] = ['abate', 'compra', 'venda'];

function getTopTabFromSubAba(subAba?: SubAba): TopTab {
  if (!subAba) return 'entradas';
  if (ENTRY_TYPES.includes(subAba)) return 'entradas';
  if (EXIT_TYPES.includes(subAba)) return 'saidas';
  return 'entradas';
}

export function FinanceiroTab({ lancamentos, onEditar, onRemover, subAbaInicial, modoMovimentacao, filtroAnoInicial, filtroMesInicial, onBack, drillDownLabel, onEditarAbate }: Props) {
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const fazendaMap = useMemo(() => {
    const m = new Map<string, string>();
    fazendas.forEach(f => m.set(f.id, f.nome));
    return m;
  }, [fazendas]);
  const [topTab, setTopTab] = useState<TopTab>(subAbaInicial ? getTopTabFromSubAba(subAbaInicial) : 'entradas');
  const [subAba, setSubAba] = useState<SubAba>(subAbaInicial || 'abate');
  const [detalheId, setDetalheId] = useState<string | null>(null);

  useEffect(() => {
    if (subAbaInicial) {
      setTopTab(getTopTabFromSubAba(subAbaInicial));
      setSubAba(subAbaInicial);
    }
  }, [subAbaInicial]);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => {
      try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {}
    });
    return Array.from(anos).sort().reverse();
  }, [lancamentos]);

  const [anoFiltro, setAnoFiltro] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState(filtroMesInicial || 'todos');
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('todos');

  useEffect(() => {
    if (filtroAnoInicial) setAnoFiltro(filtroAnoInicial);
    if (filtroMesInicial) setMesFiltro(filtroMesInicial);
  }, [filtroAnoInicial, filtroMesInicial]);

  const filtrados = useMemo(() => {
    let tiposFilter: string[] = [];
    if (topTab === 'todas') {
      tiposFilter = [...ENTRY_TYPES, ...EXIT_TYPES];
    } else if (topTab === 'entradas') {
      tiposFilter = [subAba];
    } else if (topTab === 'saidas') {
      tiposFilter = [subAba];
    }

    return lancamentos
      .filter(l => {
        try {
          const d = parseISO(l.data);
          if (format(d, 'yyyy') !== anoFiltro) return false;
          if (mesFiltro !== 'todos' && format(d, 'MM') !== mesFiltro) return false;
          if (!tiposFilter.includes(l.tipo)) return false;
          // Status filter using statusOperacional
          const st = l.statusOperacional || 'conciliado';
          if (statusFiltro === 'realizado' && st !== 'conciliado') return false;
          if (statusFiltro === 'programado' && st !== 'confirmado') return false;
          if (statusFiltro === 'previsto' && st !== 'previsto') return false;
          return true;
        } catch { return false; }
      })
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [lancamentos, anoFiltro, mesFiltro, topTab, subAba, statusFiltro]);

  const isFinancial = FINANCIAL_TYPES.includes(subAba);

  const allTopTabs: { id: TopTab; label: string; icon: string }[] = [
    { id: 'entradas', label: 'Entradas', icon: '📥' },
    { id: 'saidas', label: 'Saídas', icon: '📤' },
    { id: 'chuvas', label: 'Chuvas', icon: '☁️' },
  ];
  const topTabs = modoMovimentacao
    ? allTopTabs.filter(t => t.id !== 'chuvas')
    : allTopTabs;

  const subTypes = topTab === 'entradas' ? ENTRY_TYPES : topTab === 'saidas' ? EXIT_TYPES : [];

  if (topTab === 'chuvas') {
    return (
      <div className="animate-fade-in pb-20">
        {/* Top tabs */}
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
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-full mx-auto animate-fade-in">
      {/* Drill-down header */}
      {(onBack || drillDownLabel) && (
        <div className="sticky top-0 z-30 bg-background border-b border-border/50 shadow-sm px-3 py-2 space-y-1.5">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </button>
          )}
          {drillDownLabel && (
            <div className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-md px-2.5 py-1 text-xs font-bold w-fit">
              <Filter className="h-3 w-3" />
              {drillDownLabel}
            </div>
          )}
        </div>
      )}
      {/* Filter bar - fixed */}
      <div className="flex-none bg-background border-b border-border/50 shadow-sm px-3 py-1.5 space-y-1 z-20">
      {/* Top tabs */}
      <div className={`grid gap-0.5 bg-muted rounded-md p-0.5 max-w-md ${modoMovimentacao ? 'grid-cols-2' : `grid-cols-${topTabs.length}`}`}>
        {topTabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setTopTab(t.id); if (t.id === 'entradas') setSubAba('nascimento'); if (t.id === 'saidas') setSubAba('abate'); }}
            className={`${modoMovimentacao ? 'py-1 px-1.5 text-[11px]' : 'py-1 px-1 text-[11px]'} rounded font-bold transition-colors ${
              topTab === t.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Sub-type tabs + Filters in one row when possible */}
      {subTypes.length > 0 && (
        <div className="flex gap-0.5 overflow-x-auto">
          {subTypes.map(st => {
            const info = SUB_ABA_LABELS[st];
            return (
              <button
                key={st}
                onClick={() => setSubAba(st)}
                className={`py-0.5 px-2 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${
                  subAba === st ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-muted text-muted-foreground'
                }`}
              >
                {info.icon} {info.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1 items-center">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="h-6 text-[10px] font-bold w-[68px]">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent side="bottom">
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="h-6 text-[10px] font-bold w-[110px]">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent side="bottom">
            {MESES_OPTIONS.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-px bg-muted rounded p-px">
          {([
            { value: 'realizado', label: 'Realizado', activeClass: 'bg-green-700 text-white' },
            { value: 'programado', label: 'Programado', activeClass: 'bg-blue-500 text-white' },
            { value: 'previsto', label: 'Previsto', activeClass: 'bg-orange-500 text-white' },
          ] as { value: StatusFiltro; label: string; activeClass: string }[]).map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFiltro(s.value === statusFiltro ? 'todos' : s.value)}
              className={`px-2 py-px rounded text-[9px] font-bold transition-colors ${
                statusFiltro === s.value
                  ? s.activeClass
                  : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {isFinancial && topTab !== 'todas' && (
          <FinanceiroExportMenu
            lancamentos={filtrados}
            subAba={subAba as 'abate' | 'compra' | 'venda'}
            ano={anoFiltro}
            fazendaNome={fazendaAtual?.nome}
          />
        )}
      </div>
      </div>

      {/* Content */}
      <div className="p-4 pt-2">
      {topTab === 'todas' ? (
        <UnifiedTable lancamentos={filtrados} onEdit={(l) => setDetalheId(l.id)} showTipo isGlobal={isGlobal} fazendaMap={fazendaMap} />
      ) : subAba === 'abate' ? (
        <AbateTable lancamentos={filtrados} onEdit={(l) => setDetalheId(l.id)} isGlobal={isGlobal} fazendaMap={fazendaMap} />
      ) : (
        <UnifiedTable lancamentos={filtrados} onEdit={(l) => setDetalheId(l.id)} subTipo={subAba} isGlobal={isGlobal} fazendaMap={fazendaMap} />
      )}

      {/* Detail + Edit via LancamentoDetalhe */}
      {(() => {
        const lancamentoDetalhe = detalheId ? lancamentos.find(l => l.id === detalheId) : null;
        return lancamentoDetalhe ? (
          <LancamentoDetalhe
            lancamento={lancamentoDetalhe}
            open={!!detalheId}
            onClose={() => setDetalheId(null)}
            onEditar={(id, dados) => { onEditar(id, dados); setDetalheId(null); }}
            onRemover={(id) => { onRemover(id); setDetalheId(null); }}
            onEditarAbate={onEditarAbate ? (l) => { setDetalheId(null); onEditarAbate(l); } : undefined}
          />
        ) : null;
      })()}
      </div>
    </div>
  );
}
