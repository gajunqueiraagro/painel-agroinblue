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
  modoMovimentacao?: boolean;
  filtroAnoInicial?: string;
  filtroMesInicial?: string;
  onBack?: () => void;
  drillDownLabel?: string;
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

const TABLE_HEAD_CELL = 'px-[3px] py-1 text-[8px] font-bold uppercase tracking-[0.02em] whitespace-nowrap';
const TABLE_BODY_CELL = 'px-[3px] py-[3px] align-middle whitespace-nowrap overflow-hidden text-ellipsis';
const TABLE_FOOT_CELL = 'px-[3px] py-[3px] whitespace-nowrap';

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

/* ── Summary panel ── */
function ResumoLateral({ lancamentos, subAba, anoFiltro, mesFiltro, statusFiltro }: {
  lancamentos: Lancamento[];
  subAba: SubAba;
  anoFiltro: string;
  mesFiltro: string;
  statusFiltro: StatusFiltro;
}) {
  const statusLabel = statusFiltro === 'todos' ? 'Todos' : statusFiltro === 'realizado' ? 'Realizado' : statusFiltro === 'programado' ? 'Programado' : 'Previsto';
  const mesLabel = mesFiltro === 'todos' ? 'Todos' : (MESES_OPTIONS.find(m => m.value === mesFiltro)?.label || mesFiltro);
  const tipoLabel = SUB_ABA_LABELS[subAba]?.label || subAba;

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
    { label: 'Qtde', value: `${stats.qtd} cab` },
    { label: 'Peso médio', value: `${stats.pesoMedio.toFixed(2)} kg` },
    ...(subAba === 'abate' ? [{ label: 'RC%', value: stats.rendMedio ? `${stats.rendMedio.toFixed(1)}%` : '-' }] : []),
    { label: 'Peso @', value: `${stats.arrobaMedio.toFixed(2)} @` },
    { label: 'Valor total', value: fmtValor(stats.valorTotal), highlight: true },
    { label: 'R$/Líq @', value: fmtValor(stats.liqArroba) },
    { label: 'Líq/Cab', value: fmtValor(stats.liqCabeca) },
  ];

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-primary px-4 py-3">
        <h3 className="text-sm font-bold text-primary-foreground">{tipoLabel}</h3>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-primary-foreground/80">
          <span>Ano: <strong className="text-primary-foreground">{anoFiltro}</strong></span>
          <span>Mês: <strong className="text-primary-foreground">{mesLabel}</strong></span>
          <span>Status: <strong className="text-primary-foreground">{statusLabel}</strong></span>
        </div>
      </div>
      {/* KPIs */}
      <div className="divide-y divide-border">
        {kpiItems.map((kpi) => (
          <div key={kpi.label} className="flex items-center justify-between px-4 py-2">
            <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
            <span className={`text-[12px] font-bold ${kpi.highlight ? 'text-primary text-[14px]' : 'text-foreground'}`}>
              {kpi.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tables ── */

function UnifiedTable({ lancamentos, onEdit, showTipo, subTipo, isGlobal, fazendaMap }: { lancamentos: Lancamento[]; onEdit: (l: Lancamento) => void; showTipo?: boolean; subTipo?: string; isGlobal?: boolean; fazendaMap?: Map<string, string> }) {
  const TIPOS_COM_DESTINO = ['venda', 'transferencia_entrada', 'transferencia_saida', 'consumo', 'morte'];
  const showDestino = !isGlobal && (showTipo ? true : (subTipo ? TIPOS_COM_DESTINO.includes(subTipo) : false));
  const isMorte = subTipo === 'morte';
  const showLiqKg = showTipo ? true : (subTipo ? TIPOS_COM_DESTINO.includes(subTipo) : false);
  const fMap = fazendaMap || new Map<string, string>();
  const globalColHeader = isGlobal ? (subTipo ? getFazendaColumnHeader(subTipo) : 'Fazenda') : '';

  if (lancamentos.length === 0) return <p className="text-center text-muted-foreground py-6">Nenhum registro no período</p>;

  return (
    <table className="w-full table-auto border-collapse text-[10px]">
      <thead className="financeiro-table-head print:static">
        <tr className="border-b border-primary-foreground/15">
          <th className={`${TABLE_HEAD_CELL} text-left`}>Data</th>
          {showTipo && <th className={`${TABLE_HEAD_CELL} text-left`}>Tipo</th>}
          <th className={`${TABLE_HEAD_CELL} text-right`}>Qtd</th>
          <th className={`${TABLE_HEAD_CELL} text-left`}>Categoria</th>
          {showDestino && <th className={`${TABLE_HEAD_CELL} text-left`}>{isMorte ? 'Motivo' : 'Destino'}</th>}
          {isGlobal && <th className={`${TABLE_HEAD_CELL} text-left`}>{showTipo ? 'Fazenda' : globalColHeader}</th>}
          <th className={`${TABLE_HEAD_CELL} text-right`}>P.Vivo</th>
          <th className={`${TABLE_HEAD_CELL} text-right`}>P.@</th>
          <th className={`${TABLE_HEAD_CELL} text-right`}>Total</th>
          <th className={`${TABLE_HEAD_CELL} text-right`}>R$/líq @</th>
          {showLiqKg && <th className={`${TABLE_HEAD_CELL} text-right`}>R$/Kg Líq</th>}
          <th className={`${TABLE_HEAD_CELL} text-right`}>Líq/Cab</th>
          <th className={`${TABLE_HEAD_CELL} text-center`}>Status</th>
          <th className={`${TABLE_HEAD_CELL} text-center w-6`}></th>
        </tr>
      </thead>
      <tbody className="bg-card">
        {lancamentos.map(l => {
          const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
          const c = calcIndicadoresLancamento(l);
          const tipoInfo = SUB_ABA_LABELS[l.tipo as SubAba];
          return (
            <tr key={l.id} className="border-b border-border/70 leading-none hover:bg-muted/30">
              <td className={`${TABLE_BODY_CELL} text-[9px]`}>{format(parseISO(l.data), 'dd/MM/yy')}</td>
              {showTipo && <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{tipoInfo?.icon} {tipoInfo?.label || l.tipo}</td>}
              <td className={`${TABLE_BODY_CELL} text-right font-bold text-[9px]`}>{l.quantidade}</td>
              <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{cat}</td>
              {showDestino && <td className={`${TABLE_BODY_CELL} truncate text-[9px]`}>{(l.tipo === 'morte' ? l.fazendaDestino : (l.fazendaDestino || l.fazendaOrigem)) || '-'}</td>}
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
           <tfoot className="financeiro-table-foot print:static">
            <tr className="border-t-2 border-primary/25 font-bold text-[10px]">
              <td className={TABLE_FOOT_CELL}>TOTAL</td>
              {showTipo && <td className={TABLE_FOOT_CELL}></td>}
              <td className={`${TABLE_FOOT_CELL} text-right`}>{totals.qtd}</td>
              <td className={TABLE_FOOT_CELL}></td>
              {showDestino && <td className={TABLE_FOOT_CELL}></td>}
              {isGlobal && <td className={TABLE_FOOT_CELL}></td>}
              <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(pesoVivoMedio)}</td>
              <td className={`${TABLE_FOOT_CELL} text-right text-muted-foreground`}>{fmtValor(arrobaMedio)}</td>
              <td className={`${TABLE_FOOT_CELL} text-right text-primary`}>{fmtValor(totals.valorTotal)}</td>
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

  if (lancamentos.length === 0) return <p className="text-center text-muted-foreground py-6">Nenhum abate no período</p>;

  return (
    <table className="w-full table-auto border-collapse text-[10px]">
      <thead className="financeiro-table-head print:static">
        <tr className="border-b border-primary-foreground/15">
          <th className={`${TABLE_HEAD_CELL} text-left`}>Data</th>
          <th className={`${TABLE_HEAD_CELL} text-right`}>Qtd</th>
          <th className={`${TABLE_HEAD_CELL} text-left`}>Categoria</th>
          <th className={`${TABLE_HEAD_CELL} text-left`}>Destino</th>
          {isGlobal && <th className={`${TABLE_HEAD_CELL} text-left`}>Origem</th>}
          <th className={`${TABLE_HEAD_CELL} text-right`}>P.Vivo</th>
          <th className={`${TABLE_HEAD_CELL} text-right`}>Rend.</th>
          <th className={`${TABLE_HEAD_CELL} text-right`}>P.@</th>
          <th className={`${TABLE_HEAD_CELL} text-right`}>Total</th>
          <th className={`${TABLE_HEAD_CELL} text-right`}>R$/líq @</th>
          <th className={`${TABLE_HEAD_CELL} text-right`}>Líq/Cab</th>
          <th className={`${TABLE_HEAD_CELL} text-center`}>Status</th>
          <th className={`${TABLE_HEAD_CELL} text-center w-6`}></th>
        </tr>
      </thead>
      <tbody className="bg-card">
        {lancamentos.map(l => {
          const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
          const c = calcIndicadoresLancamento(l);
          return (
            <tr key={l.id} className="border-b border-border/70 leading-none hover:bg-muted/30">
              <td className={`${TABLE_BODY_CELL} text-[9px]`}>{format(parseISO(l.data), 'dd/MM/yy')}</td>
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
          <tfoot className="financeiro-table-foot print:static">
            <tr className="border-t-2 border-primary/25 font-bold text-[10px]">
              <td className={TABLE_FOOT_CELL}>TOTAL</td>
              <td className={`${TABLE_FOOT_CELL} text-right`}>{totals.qtd}</td>
              <td className={TABLE_FOOT_CELL}></td>
              <td className={TABLE_FOOT_CELL}></td>
              {isGlobal && <td className={TABLE_FOOT_CELL}></td>}
              <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(pesoVivoMedio)}</td>
              <td className={`${TABLE_FOOT_CELL} text-right text-muted-foreground`}>{rendMedio ? rendMedio.toFixed(1) + '%' : '-'}</td>
              <td className={`${TABLE_FOOT_CELL} text-right`}>{fmtValor(arrobaMedio)}</td>
              <td className={`${TABLE_FOOT_CELL} text-right text-primary`}>{fmtValor(totals.valorTotal)}</td>
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
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');

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
          const st = l.statusOperacional || 'conciliado';
          if (statusFiltro === 'realizado' && st !== 'conciliado') return false;
          if (statusFiltro === 'programado' && st !== 'confirmado') return false;
          if (statusFiltro === 'previsto' && st !== 'previsto') return false;
          if (categoriaFiltro !== 'todas' && l.categoria !== categoriaFiltro) return false;
          return true;
        } catch { return false; }
      })
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [lancamentos, anoFiltro, mesFiltro, topTab, subAba, statusFiltro, categoriaFiltro]);

  /* Categories available in current type */
  const categoriasDisponiveis = useMemo(() => {
    let tiposFilter: string[] = [];
    if (topTab === 'todas') tiposFilter = [...ENTRY_TYPES, ...EXIT_TYPES];
    else tiposFilter = [subAba];
    const cats = new Set<string>();
    lancamentos.forEach(l => {
      if (tiposFilter.includes(l.tipo)) cats.add(l.categoria);
    });
    return CATEGORIAS.filter(c => cats.has(c.value));
  }, [lancamentos, topTab, subAba]);

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
    <div className="flex h-[calc(100vh-120px)] w-full max-w-full flex-col animate-fade-in">
      {/* ── Sticky top panel ── */}
      <div className="financeiro-sticky-panel flex-none">
        {(onBack || drillDownLabel) && (
          <div className="space-y-1.5 border-b border-primary-foreground/10 px-3 py-2">
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
        <div className="space-y-1.5 px-3 py-2">
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
                      subAba === st ? 'border-primary bg-card text-primary shadow-sm' : 'border-border bg-card text-muted-foreground hover:text-foreground'
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
            <div className="flex gap-px rounded border border-border bg-card p-px">
              {([
                { value: 'realizado' as StatusFiltro, label: 'Realizado', activeClass: 'bg-success text-success-foreground' },
                { value: 'programado' as StatusFiltro, label: 'Programado', activeClass: 'bg-secondary text-secondary-foreground' },
                { value: 'previsto' as StatusFiltro, label: 'Previsto', activeClass: 'bg-warning text-warning-foreground' },
              ]).map(s => (
                <button
                  key={s.value}
                  onClick={() => setStatusFiltro(s.value === statusFiltro ? 'todos' : s.value)}
                  className={`px-2 py-px rounded text-[9px] font-bold transition-colors ${
                    statusFiltro === s.value
                      ? s.activeClass
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Export — always visible for financial types */}
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
      </div>

      {/* ── Content area: table (left ~70%) + summary panel (right ~30%) ── */}
      <div className="flex flex-1 min-h-0 gap-3 px-2 pb-2 pt-1.5">
        {/* Table column */}
        <div className="flex-[7] min-w-0 overflow-auto rounded-md border border-border/70 bg-card shadow-sm">
          {topTab === 'todas' ? (
            <UnifiedTable lancamentos={filtrados} onEdit={(l) => setDetalheId(l.id)} showTipo isGlobal={isGlobal} fazendaMap={fazendaMap} />
          ) : subAba === 'abate' ? (
            <AbateTable lancamentos={filtrados} onEdit={(l) => setDetalheId(l.id)} isGlobal={isGlobal} fazendaMap={fazendaMap} />
          ) : (
            <UnifiedTable lancamentos={filtrados} onEdit={(l) => setDetalheId(l.id)} subTipo={subAba} isGlobal={isGlobal} fazendaMap={fazendaMap} />
          )}
        </div>

        {/* Summary panel */}
        <div className="flex-[3] min-w-[220px] max-w-[320px] flex-shrink-0 hidden lg:block">
          <ResumoLateral
            lancamentos={filtrados}
            subAba={subAba}
            anoFiltro={anoFiltro}
            mesFiltro={mesFiltro}
            statusFiltro={statusFiltro}
          />
        </div>
      </div>

      {/* Detail modal */}
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
  );
}
