import { useState, useMemo, useEffect } from 'react';
import { Lancamento, CATEGORIAS } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { parseISO, format } from 'date-fns';
import { DollarSign, Info } from 'lucide-react';
import { FinanceiroEditDialog } from '@/components/FinanceiroEditDialog';
import { FinanceiroExportMenu } from '@/components/FinanceiroExportMenu';
import { ChuvasTab } from './ChuvasTab';
import { useFazenda } from '@/contexts/FazendaContext';
import { fmtValor } from '@/lib/calculos/formatters';
import { MESES_OPTIONS } from '@/lib/calculos/labels';
import { calcIndicadoresLancamento } from '@/lib/calculos/economicos';

interface Props {
  lancamentos: Lancamento[];
  onEditar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover: (id: string) => void;
  subAbaInicial?: SubAba;
  /** Modo compacto para aba Movimentações: sem "Todas"/"Chuvas", filtros menores, header sticky */
  modoMovimentacao?: boolean;
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
function UnifiedTable({ lancamentos, onEdit, showTipo, subTipo }: { lancamentos: Lancamento[]; onEdit: (l: Lancamento) => void; showTipo?: boolean; subTipo?: string }) {
  const TIPOS_COM_DESTINO = ['venda', 'transferencia_entrada', 'transferencia_saida', 'consumo', 'morte'];
  const showDestino = showTipo ? true : (subTipo ? TIPOS_COM_DESTINO.includes(subTipo) : false);
  const isMorte = subTipo === 'morte';
  const showLiqKg = showTipo ? true : (subTipo ? TIPOS_COM_DESTINO.includes(subTipo) : false);
  if (lancamentos.length === 0) return <p className="text-center text-muted-foreground py-6">Nenhum registro no período</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
         <thead className="sticky top-0 z-10">
          <tr className="border-b bg-muted/50">
            <th className="p-1.5 text-left font-bold bg-muted/50">Data</th>
            {showTipo && <th className="p-1.5 text-left font-bold bg-muted/50">Tipo</th>}
            <th className="p-1.5 text-right font-bold bg-muted/50">Qtd</th>
            <th className="p-1.5 text-left font-bold bg-muted/50">Categoria</th>
            <th className="p-1.5 text-right font-bold bg-muted/50">P.Vivo</th>
            <th className="p-1.5 text-right font-bold bg-muted/50">P.@</th>
            <th className="p-1.5 text-right font-bold text-primary bg-muted/50">Total</th>
            <th className="p-1.5 text-right font-bold bg-muted/50">R$/líq @</th>
            <th className="p-1.5 text-right font-bold bg-muted/50">Líq/Cab</th>
            <th className="p-1.5 w-8 bg-muted/50"></th>
          </tr>
        </thead>
        <tbody>
          {lancamentos.map(l => {
            const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
            const c = calcIndicadoresLancamento(l);
            const tipoInfo = SUB_ABA_LABELS[l.tipo as SubAba];
            return (
              <tr key={l.id} className="border-b hover:bg-muted/30">
                <td className="p-1.5 whitespace-nowrap">{format(parseISO(l.data), 'dd/MM/yy')}</td>
                {showTipo && <td className="p-1.5 text-xs">{tipoInfo?.icon} {tipoInfo?.label || l.tipo}</td>}
                <td className="p-1.5 text-right font-bold">{l.quantidade}</td>
                <td className="p-1.5">{cat}</td>
                <td className="p-1.5 text-right">{l.pesoMedioKg != null ? l.pesoMedioKg.toFixed(2) : '-'}</td>
                <td className="p-1.5 text-right text-muted-foreground">{c.pesoArroba ? c.pesoArroba.toFixed(2) : '-'}</td>
                <td className="p-1.5 text-right font-bold text-primary">{fmtValor(c.valorFinal)}</td>
                <td className="p-1.5 text-right">{fmtValor(c.liqArroba)}</td>
                <td className="p-1.5 text-right">{fmtValor(c.liqCabeca)}</td>
                <td className="p-1.5">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(l)}>
                    <Info className="h-3 w-3" />
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
          return (
            <tfoot>
              <tr className="border-t-2 border-primary/40 bg-muted/30 font-bold">
                <td className="p-1.5">TOTAL</td>
                {showTipo && <td className="p-1.5"></td>}
                <td className="p-1.5 text-right">{totals.qtd}</td>
                <td className="p-1.5"></td>
                <td className="p-1.5 text-right">{fmtValor(pesoVivoMedio)}</td>
                <td className="p-1.5 text-right text-muted-foreground">{fmtValor(arrobaMedio)}</td>
                <td className="p-1.5 text-right text-primary">{fmtValor(totals.valorTotal)}</td>
                <td className="p-1.5 text-right">{fmtValor(liqArroba)}</td>
                <td className="p-1.5 text-right">{fmtValor(liqCabeca)}</td>
                <td className="p-1.5"></td>
              </tr>
            </tfoot>
          );
        })()}
      </table>
    </div>
  );
}

function AbateTable({ lancamentos, onEdit }: { lancamentos: Lancamento[]; onEdit: (l: Lancamento) => void }) {
  if (lancamentos.length === 0) return <p className="text-center text-muted-foreground py-6">Nenhum abate no período</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
         <thead className="sticky top-0 z-10">
          <tr className="border-b bg-muted/50">
            <th className="p-1.5 text-left font-bold bg-muted/50">Data</th>
            <th className="p-1.5 text-right font-bold bg-muted/50">Qtd</th>
            <th className="p-1.5 text-left font-bold bg-muted/50">Categoria</th>
            <th className="p-1.5 text-left font-bold bg-muted/50">Destino</th>
            <th className="p-1.5 text-right font-bold bg-muted/50">P.Vivo</th>
            <th className="p-1.5 text-right font-bold bg-muted/50">Rend.</th>
            <th className="p-1.5 text-right font-bold bg-muted/50">P.@</th>
            <th className="p-1.5 text-right font-bold text-primary bg-muted/50">Total</th>
            <th className="p-1.5 text-right font-bold bg-muted/50">R$/líq @</th>
            <th className="p-1.5 text-right font-bold bg-muted/50">Líq/Cab</th>
            <th className="p-1.5 w-8 bg-muted/50"></th>
          </tr>
        </thead>
        <tbody>
          {lancamentos.map(l => {
            const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
            const c = calcIndicadoresLancamento(l);
            return (
              <tr key={l.id} className="border-b hover:bg-muted/30">
                <td className="p-1.5 whitespace-nowrap">{format(parseISO(l.data), 'dd/MM/yy')}</td>
                <td className="p-1.5 text-right font-bold">{l.quantidade}</td>
                <td className="p-1.5">{cat}</td>
                <td className="p-1.5 truncate max-w-[80px]">{l.fazendaDestino || '-'}</td>
                <td className="p-1.5 text-right">{l.pesoMedioKg != null ? l.pesoMedioKg.toFixed(2) : '-'}</td>
                <td className="p-1.5 text-right text-muted-foreground">{c.rendimento ? c.rendimento.toFixed(1) + '%' : '-'}</td>
                <td className="p-1.5 text-right">{c.pesoArroba ? c.pesoArroba.toFixed(2) : '-'}</td>
                <td className="p-1.5 text-right font-bold text-primary">{fmtValor(c.valorFinal)}</td>
                <td className="p-1.5 text-right">{fmtValor(c.liqArroba)}</td>
                <td className="p-1.5 text-right">{fmtValor(c.liqCabeca)}</td>
                <td className="p-1.5">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(l)}>
                    <Info className="h-3 w-3" />
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
              <tr className="border-t-2 border-primary/40 bg-muted/30 font-bold">
                <td className="p-1.5">TOTAL</td>
                <td className="p-1.5 text-right">{totals.qtd}</td>
                <td className="p-1.5"></td>
                <td className="p-1.5"></td>
                <td className="p-1.5 text-right">{fmtValor(pesoVivoMedio)}</td>
                <td className="p-1.5 text-right text-muted-foreground">{rendMedio ? rendMedio.toFixed(1) + '%' : '-'}</td>
                <td className="p-1.5 text-right">{fmtValor(arrobaMedio)}</td>
                <td className="p-1.5 text-right text-primary">{fmtValor(totals.valorTotal)}</td>
                <td className="p-1.5 text-right">{fmtValor(liqArroba)}</td>
                <td className="p-1.5 text-right">{fmtValor(liqCabeca)}</td>
                <td className="p-1.5"></td>
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
  if (!subAba) return 'todas';
  if (ENTRY_TYPES.includes(subAba)) return 'entradas';
  if (EXIT_TYPES.includes(subAba)) return 'saidas';
  return 'todas';
}

export function FinanceiroTab({ lancamentos, onEditar, onRemover, subAbaInicial, modoMovimentacao }: Props) {
  const { fazendaAtual } = useFazenda();
  const [topTab, setTopTab] = useState<TopTab>(subAbaInicial ? getTopTabFromSubAba(subAbaInicial) : (modoMovimentacao ? 'entradas' : 'todas'));
  const [subAba, setSubAba] = useState<SubAba>(subAbaInicial || 'abate');
  const [editando, setEditando] = useState<Lancamento | null>(null);

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

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState('todos');

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
          return tiposFilter.includes(l.tipo);
        } catch { return false; }
      })
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [lancamentos, anoFiltro, mesFiltro, topTab, subAba]);

  const isFinancial = FINANCIAL_TYPES.includes(subAba);

  const allTopTabs: { id: TopTab; label: string; icon: string }[] = [
    { id: 'todas', label: 'Todas', icon: '📋' },
    { id: 'entradas', label: 'Entradas', icon: '📥' },
    { id: 'saidas', label: 'Saídas', icon: '📤' },
    { id: 'chuvas', label: 'Chuvas', icon: '☁️' },
  ];
  const topTabs = modoMovimentacao
    ? allTopTabs.filter(t => t.id !== 'todas' && t.id !== 'chuvas')
    : allTopTabs;

  const subTypes = topTab === 'entradas' ? ENTRY_TYPES : topTab === 'saidas' ? EXIT_TYPES : [];

  if (topTab === 'chuvas') {
    return (
      <div className="animate-fade-in pb-20">
        {/* Top tabs */}
        <div className="p-4 pb-0">
          <div className="grid grid-cols-4 gap-1 bg-muted rounded-lg p-1">
            {topTabs.map(t => (
              <button
                key={t.id}
                onClick={() => { setTopTab(t.id); if (t.id === 'entradas') setSubAba('nascimento'); if (t.id === 'saidas') setSubAba('abate'); }}
                className={`py-2 px-1 rounded-md text-xs font-bold transition-colors touch-target ${
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
    <div className="p-4 max-w-full mx-auto space-y-3 animate-fade-in pb-20">
      {/* Top tabs */}
      <div className={`grid gap-1 bg-muted rounded-lg p-1 ${modoMovimentacao ? 'grid-cols-2' : `grid-cols-${topTabs.length}`}`}>
        {topTabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setTopTab(t.id); if (t.id === 'entradas') setSubAba('nascimento'); if (t.id === 'saidas') setSubAba('abate'); }}
            className={`${modoMovimentacao ? 'py-1.5 px-2 text-[11px]' : 'py-2 px-1 text-xs'} rounded-md font-bold transition-colors touch-target ${
              topTab === t.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Sub-type tabs for Entradas/Saídas */}
      {subTypes.length > 0 && (
        <div className="flex gap-1 overflow-x-auto">
          {subTypes.map(st => {
            const info = SUB_ABA_LABELS[st];
            return (
              <button
                key={st}
                onClick={() => setSubAba(st)}
                className={`py-1.5 px-3 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
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
      <div className="flex gap-2">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="touch-target text-base font-bold w-28">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-base">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="touch-target text-base font-bold flex-1">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {MESES_OPTIONS.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-base">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isFinancial && topTab !== 'todas' && (
          <FinanceiroExportMenu
            lancamentos={filtrados}
            subAba={subAba as 'abate' | 'compra' | 'venda'}
            ano={anoFiltro}
            fazendaNome={fazendaAtual?.nome}
          />
        )}
      </div>

      {/* Content */}
      {topTab === 'todas' ? (
        <UnifiedTable lancamentos={filtrados} onEdit={setEditando} showTipo />
      ) : subAba === 'abate' ? (
        <AbateTable lancamentos={filtrados} onEdit={setEditando} />
      ) : (
        <UnifiedTable lancamentos={filtrados} onEdit={setEditando} />
      )}

      {/* Edit dialog */}
      {editando && (
        <FinanceiroEditDialog
          lancamento={editando}
          open={!!editando}
          onClose={() => setEditando(null)}
          onSave={(id, dados) => { onEditar(id, dados); setEditando(null); }}
          onDelete={(id) => { onRemover(id); setEditando(null); }}
        />
      )}
    </div>
  );
}
