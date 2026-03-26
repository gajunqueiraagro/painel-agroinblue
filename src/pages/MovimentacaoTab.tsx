import { useState, useMemo } from 'react';
import { Lancamento, SaldoInicial, TODOS_TIPOS, isEntrada } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { LancamentoDetalhe } from '@/components/LancamentoDetalhe';
import { Pencil } from 'lucide-react';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onEditar?: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover?: (id: string) => void;
}

type GrupoFiltro = 'todas' | 'entradas' | 'saidas' | 'chuvas';

const GRUPOS: { value: GrupoFiltro; label: string; icon: string }[] = [
  { value: 'todas', label: 'Todas', icon: '📋' },
  { value: 'entradas', label: 'Entradas', icon: '🐄' },
  { value: 'saidas', label: 'Saídas', icon: '🚚' },
  { value: 'chuvas', label: 'Chuvas', icon: '🌧' },
];

const SUBTIPOS_ENTRADA = [
  { value: 'nascimento', label: 'Nasc.', icon: '🐄' },
  { value: 'compra', label: 'Compras', icon: '🛒' },
  { value: 'transferencia_entrada', label: 'T.Ent.', icon: '📥' },
];

const SUBTIPOS_SAIDA = [
  { value: 'abate', label: 'Abates', icon: '🔪' },
  { value: 'venda', label: 'Vendas', icon: '💰' },
  { value: 'transferencia_saida', label: 'T.Saída', icon: '📤' },
  { value: 'consumo', label: 'Consumo', icon: '🍖' },
  { value: 'morte', label: 'Mortes', icon: '💀' },
];

const MESES = [
  { value: '__todos__', label: 'Todos os meses' },
  { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' }, { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' }, { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' }, { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' }, { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
];

function fmtData(data: string) {
  try { return format(parseISO(data), 'dd/MM/yy'); } catch { return data; }
}

function fmtDecimal(v?: number | null, dec = 2) {
  if (!v) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtValor(v?: number | null) {
  if (!v) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface ColumnDef {
  key: string;
  label: string;
  align?: 'left' | 'right';
  render: (l: Lancamento) => string;
}

function getColumns(tipo: string | null): ColumnDef[] {
  const colData: ColumnDef = { key: 'data', label: 'Data', render: l => fmtData(l.data) };
  const colQtd: ColumnDef = { key: 'qtd', label: 'Qtd', align: 'right', render: l => String(l.quantidade) };
  const colCat: ColumnDef = { key: 'cat', label: 'Cat.', render: l => l.categoria };
  const colPesoVivo: ColumnDef = { key: 'pVivo', label: 'P.Vivo', align: 'right', render: l => l.pesoMedioKg ? fmtDecimal(l.pesoMedioKg) : '-' };
  const colPesoArr: ColumnDef = { key: 'pArr', label: 'P.@', align: 'right', render: l => l.pesoMedioArrobas ? fmtDecimal(l.pesoMedioArrobas, 1) : '-' };
  const colTotal: ColumnDef = { key: 'total', label: 'Total', align: 'right', render: l => l.valorTotal ? fmtValor(l.valorTotal) : '-' };
  const colOrigem: ColumnDef = { key: 'origem', label: 'Origem', render: l => l.fazendaOrigem || '-' };
  const colDestino: ColumnDef = { key: 'destino', label: 'Destino', render: l => l.fazendaDestino || '-' };
  const colRcPct: ColumnDef = {
    key: 'rc', label: 'RC%', align: 'right',
    render: l => {
      if (!l.pesoCarcacaKg || !l.pesoMedioKg || l.pesoMedioKg === 0) return '-';
      return ((l.pesoCarcacaKg / l.pesoMedioKg) * 100).toFixed(1) + '%';
    }
  };
  const colLiqArr: ColumnDef = {
    key: 'liqArr', label: 'R$/líq @', align: 'right',
    render: l => {
      const arrobas = l.pesoMedioArrobas ? l.pesoMedioArrobas * l.quantidade : null;
      if (!arrobas || !l.valorTotal) return '-';
      return fmtDecimal(l.valorTotal / arrobas);
    }
  };
  const colLiqCab: ColumnDef = {
    key: 'liqCab', label: 'Líq/Cab', align: 'right',
    render: l => {
      if (!l.valorTotal || !l.quantidade) return '-';
      return fmtValor(l.valorTotal / l.quantidade);
    }
  };
  const colTipo: ColumnDef = {
    key: 'tipo', label: 'Tipo', render: l => {
      const t = TODOS_TIPOS.find(t => t.value === l.tipo);
      return t ? t.label : l.tipo;
    }
  };
  const colMotivo: ColumnDef = { key: 'motivo', label: 'Motivo', render: l => l.fazendaDestino || l.observacao || '-' };

  switch (tipo) {
    case 'nascimento':
      return [colData, colQtd, colCat, colPesoVivo, colPesoArr, colTotal, colLiqArr, colLiqCab];
    case 'compra':
    case 'transferencia_entrada':
      return [colData, colQtd, colCat, colOrigem, colPesoVivo, colPesoArr, colTotal, colLiqArr, colLiqCab];
    case 'abate':
      return [colData, colQtd, colCat, colDestino, colPesoVivo, colPesoArr, colRcPct, colTotal, colLiqArr, colLiqCab];
    case 'venda':
    case 'transferencia_saida':
    case 'consumo':
      return [colData, colQtd, colCat, colDestino, colPesoVivo, colPesoArr, colTotal, colLiqArr, colLiqCab];
    case 'morte':
      return [colData, colQtd, colCat, colMotivo, colPesoVivo, colPesoArr, colTotal, colLiqArr, colLiqCab];
    default:
      // "todas" — show tipo column
      return [colData, colTipo, colQtd, colCat, colPesoVivo, colTotal, colLiqCab];
  }
}

export function MovimentacaoTab({ lancamentos, saldosIniciais, onEditar, onRemover }: Props) {
  const [grupo, setGrupo] = useState<GrupoFiltro>('entradas');
  const [subtipo, setSubtipo] = useState<string | null>('nascimento');
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => {
      try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {}
    });
    return Array.from(anos).sort().reverse();
  }, [lancamentos]);

  const [filtroAno, setFiltroAno] = useState(String(new Date().getFullYear()));
  const [filtroMes, setFiltroMes] = useState('__todos__');

  const subtiposVisiveis = useMemo(() => {
    if (grupo === 'entradas') return SUBTIPOS_ENTRADA;
    if (grupo === 'saidas') return SUBTIPOS_SAIDA;
    return [];
  }, [grupo]);

  // Reset subtipo when changing grupo
  const handleGrupoChange = (g: GrupoFiltro) => {
    setGrupo(g);
    if (g === 'entradas') setSubtipo('nascimento');
    else if (g === 'saidas') setSubtipo('abate');
    else setSubtipo(null);
  };

  const tiposFiltrados = useMemo(() => {
    if (subtipo) return [subtipo];
    if (grupo === 'entradas') return SUBTIPOS_ENTRADA.map(s => s.value);
    if (grupo === 'saidas') return SUBTIPOS_SAIDA.map(s => s.value);
    return null; // todas
  }, [grupo, subtipo]);

  const lancamentosFiltrados = useMemo(() => {
    return lancamentos
      .filter(l => {
        try {
          if (grupo === 'chuvas') return false; // chuvas handled elsewhere
          if (tiposFiltrados && !tiposFiltrados.includes(l.tipo)) return false;
          const d = parseISO(l.data);
          if (format(d, 'yyyy') !== filtroAno) return false;
          if (filtroMes !== '__todos__' && format(d, 'MM') !== filtroMes) return false;
          return true;
        } catch { return false; }
      })
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [lancamentos, filtroAno, filtroMes, tiposFiltrados, grupo]);

  const activeType = subtipo || (grupo === 'todas' ? null : null);
  const columns = useMemo(() => getColumns(activeType), [activeType]);
  const totalQtd = lancamentosFiltrados.reduce((s, l) => s + l.quantidade, 0);
  const totalPesoVivo = lancamentosFiltrados.filter(l => l.pesoMedioKg).length > 0
    ? (lancamentosFiltrados.reduce((s, l) => s + (l.pesoMedioKg || 0) * l.quantidade, 0) / Math.max(totalQtd, 1))
    : null;
  const totalPesoArr = lancamentosFiltrados.filter(l => l.pesoMedioArrobas).length > 0
    ? (lancamentosFiltrados.reduce((s, l) => s + (l.pesoMedioArrobas || 0) * l.quantidade, 0) / Math.max(totalQtd, 1))
    : null;
  const totalValor = lancamentosFiltrados.reduce((s, l) => s + (l.valorTotal || 0), 0);

  return (
    <div className="p-3 max-w-4xl mx-auto space-y-3 animate-fade-in pb-20">
      {/* Grupo tabs */}
      <div className="flex rounded-xl border bg-card overflow-hidden">
        {GRUPOS.map(g => (
          <button
            key={g.value}
            onClick={() => handleGrupoChange(g.value)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold transition-all',
              grupo === g.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <span>{g.icon}</span>
            <span>{g.label}</span>
          </button>
        ))}
      </div>

      {/* Subtipo chips */}
      {subtiposVisiveis.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {subtiposVisiveis.map(s => (
            <button
              key={s.value}
              onClick={() => setSubtipo(subtipo === s.value ? null : s.value)}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all',
                subtipo === s.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:bg-accent'
              )}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filtros ano/mês */}
      <div className="grid grid-cols-2 gap-2">
        <Select value={filtroAno} onValueChange={setFiltroAno}>
          <SelectTrigger className="text-sm h-10 font-bold">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroMes} onValueChange={setFiltroMes}>
          <SelectTrigger className="text-sm h-10">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {MESES.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b bg-primary/10">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={cn(
                    'px-2 py-2.5 font-bold text-foreground whitespace-nowrap',
                    col.key === 'data' && 'sticky left-0 bg-primary/10',
                    col.align === 'right' ? 'text-right' : 'text-left'
                  )}
                >
                  {col.label}
                </th>
              ))}
              <th className="px-2 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lancamentosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum lançamento encontrado
                </td>
              </tr>
            ) : (
              lancamentosFiltrados.map((l, i) => (
                <tr
                  key={l.id}
                  className={cn(
                    'cursor-pointer hover:bg-primary/5 transition-colors',
                    i % 2 === 0 ? '' : 'bg-muted/30'
                  )}
                  onClick={() => setDetalheId(l.id)}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-2 py-2 whitespace-nowrap',
                        col.key === 'data' && `font-medium sticky left-0 ${i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}`,
                        col.align === 'right' ? 'text-right' : 'text-left',
                        col.key === 'qtd' && 'font-bold'
                      )}
                    >
                      {col.render(l)}
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {lancamentosFiltrados.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-primary/10">
                {columns.map((col, idx) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-2 py-2.5 font-bold text-foreground whitespace-nowrap',
                      idx === 0 && 'sticky left-0 bg-primary/10',
                      col.align === 'right' ? 'text-right' : 'text-left'
                    )}
                  >
                    {idx === 0 && 'TOTAL'}
                    {col.key === 'qtd' && totalQtd}
                    {col.key === 'pVivo' && totalPesoVivo ? fmtDecimal(totalPesoVivo) : col.key === 'pVivo' ? '' : ''}
                    {col.key === 'pArr' && totalPesoArr ? fmtDecimal(totalPesoArr, 1) : col.key === 'pArr' ? '' : ''}
                    {col.key === 'total' && totalValor ? fmtValor(totalValor) : col.key === 'total' ? '-' : ''}
                    {col.key === 'liqArr' && '-'}
                    {col.key === 'liqCab' && '-'}
                  </td>
                ))}
                <td className="px-2 py-2.5"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {detalheId && (() => {
        const lancamento = lancamentos.find(l => l.id === detalheId);
        if (!lancamento) return null;
        return (
          <LancamentoDetalhe
            lancamento={lancamento}
            open={!!detalheId}
            onClose={() => setDetalheId(null)}
            onEditar={onEditar || (() => {})}
            onRemover={onRemover || (() => {})}
          />
        );
      })()}
    </div>
  );
}
