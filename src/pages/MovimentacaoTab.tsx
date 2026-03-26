import { useState, useMemo } from 'react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { LancamentoDetalhe } from '@/components/LancamentoDetalhe';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onEditar?: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover?: (id: string) => void;
}

type TipoFiltro = 'nascimento' | 'compra' | 'transferencia_entrada' | 'abate' | 'venda' | 'transferencia_saida' | 'consumo' | 'morte';

const TIPOS_FILTRO: { value: TipoFiltro; label: string; icon: string }[] = [
  { value: 'nascimento', label: 'Nascimentos', icon: '🐄' },
  { value: 'compra', label: 'Compras', icon: '🛒' },
  { value: 'transferencia_entrada', label: 'Transf. Ent.', icon: '📥' },
  { value: 'abate', label: 'Abates', icon: '🔪' },
  { value: 'venda', label: 'Vendas', icon: '💰' },
  { value: 'transferencia_saida', label: 'Transf. Saída', icon: '📤' },
  { value: 'consumo', label: 'Consumo', icon: '🍖' },
  { value: 'morte', label: 'Mortes', icon: '💀' },
];

const MESES = [
  { value: '__todos__', label: 'Todos' },
  { value: '01', label: 'Jan' }, { value: '02', label: 'Fev' }, { value: '03', label: 'Mar' },
  { value: '04', label: 'Abr' }, { value: '05', label: 'Mai' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Ago' }, { value: '09', label: 'Set' },
  { value: '10', label: 'Out' }, { value: '11', label: 'Nov' }, { value: '12', label: 'Dez' },
];

// Future-ready: status operacional
// type StatusOperacional = 'previsto' | 'confirmado' | 'realizado';

interface ColumnDef {
  key: string;
  label: string;
  align?: 'left' | 'right';
  render: (l: Lancamento) => string;
}

function fmtData(data: string) {
  try { return format(parseISO(data), 'dd/MM/yy'); } catch { return data; }
}

function fmtPesoKg(v?: number | null) {
  if (!v) return '-';
  return `${v.toFixed(0)}`;
}

function fmtPesoArroba(v?: number | null) {
  if (!v) return '-';
  return v.toFixed(1);
}

function fmtValor(v?: number | null) {
  if (!v) return '-';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDecimal(v?: number | null, dec = 2) {
  if (!v) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function calcRcPercent(l: Lancamento): string {
  if (!l.pesoCarcacaKg || !l.pesoMedioKg || l.pesoMedioKg === 0) return '-';
  return ((l.pesoCarcacaKg / l.pesoMedioKg) * 100).toFixed(1) + '%';
}

function calcPrecoArrobaLiq(l: Lancamento): string {
  const arrobas = l.pesoMedioArrobas ? l.pesoMedioArrobas * l.quantidade : null;
  if (!arrobas || !l.valorTotal) return '-';
  return fmtDecimal(l.valorTotal / arrobas);
}

function calcPrecoKgLiq(l: Lancamento): string {
  const kgTotal = l.pesoMedioKg ? l.pesoMedioKg * l.quantidade : null;
  if (!kgTotal || !l.valorTotal) return '-';
  return fmtDecimal(l.valorTotal / kgTotal);
}

function calcPrecoCabeca(l: Lancamento): string {
  if (!l.valorTotal || !l.quantidade) return '-';
  return fmtValor(l.valorTotal / l.quantidade);
}

function getColumnsForType(tipo: TipoFiltro): ColumnDef[] {
  const colData: ColumnDef = { key: 'data', label: 'Data', render: l => fmtData(l.data) };
  const colQtde: ColumnDef = { key: 'qtde', label: 'Qtde', align: 'right', render: l => String(l.quantidade) };
  const colCategoria: ColumnDef = { key: 'cat', label: 'Categoria', render: l => l.categoria };
  const colPesoKg: ColumnDef = { key: 'pesoKg', label: 'Peso kg', align: 'right', render: l => fmtPesoKg(l.pesoMedioKg) };
  const colObs: ColumnDef = { key: 'obs', label: 'Obs.', render: l => l.observacao || '-' };
  const colOrigem: ColumnDef = { key: 'origem', label: 'Origem', render: l => l.fazendaOrigem || '-' };
  const colDestino: ColumnDef = { key: 'destino', label: 'Destino', render: l => l.fazendaDestino || '-' };
  const colMotivo: ColumnDef = { key: 'motivo', label: 'Motivo', render: l => l.fazendaDestino || l.observacao || '-' };
  const colValorLiq: ColumnDef = { key: 'valorLiq', label: 'R$ Líq.', align: 'right', render: l => fmtValor(l.valorTotal) };
  const colPrecoArrobaLiq: ColumnDef = { key: 'precoArrLiq', label: 'R$/@Líq.', align: 'right', render: calcPrecoArrobaLiq };
  const colPrecoKgLiq: ColumnDef = { key: 'precoKgLiq', label: 'R$/kg', align: 'right', render: calcPrecoKgLiq };
  const colPrecoCab: ColumnDef = { key: 'precoCab', label: 'R$/cab.', align: 'right', render: calcPrecoCabeca };
  const colPesoArroba: ColumnDef = { key: 'pesoArr', label: 'Peso @', align: 'right', render: l => fmtPesoArroba(l.pesoMedioArrobas) };
  const colRc: ColumnDef = { key: 'rc', label: 'RC%', align: 'right', render: calcRcPercent };

  switch (tipo) {
    case 'nascimento':
      return [colData, colQtde, colCategoria, colPesoKg, colObs];
    case 'compra':
    case 'transferencia_entrada':
      return [colData, colQtde, colCategoria, colOrigem, colPesoKg, colValorLiq, colPrecoArrobaLiq, colPrecoKgLiq, colPrecoCab];
    case 'abate':
      return [colData, colQtde, colCategoria, colDestino, colPesoKg, colPesoArroba, colRc, colValorLiq, colPrecoArrobaLiq, colPrecoCab];
    case 'venda':
    case 'transferencia_saida':
    case 'consumo':
      return [colData, colQtde, colCategoria, colDestino, colPesoKg, colValorLiq, colPrecoArrobaLiq, colPrecoKgLiq, colPrecoCab];
    case 'morte':
      return [colData, colQtde, colCategoria, colMotivo, colPesoKg, colValorLiq, colPrecoArrobaLiq, colPrecoKgLiq, colPrecoCab];
  }
}

export function MovimentacaoTab({ lancamentos, saldosIniciais, onEditar, onRemover }: Props) {
  const [filtroTipo, setFiltroTipo] = useState<TipoFiltro>('nascimento');
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

  const lancamentosFiltrados = useMemo(() => {
    return lancamentos
      .filter(l => {
        try {
          if (l.tipo !== filtroTipo) return false;
          const d = parseISO(l.data);
          if (format(d, 'yyyy') !== filtroAno) return false;
          if (filtroMes !== '__todos__' && format(d, 'MM') !== filtroMes) return false;
          return true;
        } catch { return false; }
      })
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [lancamentos, filtroAno, filtroMes, filtroTipo]);

  const columns = useMemo(() => getColumnsForType(filtroTipo), [filtroTipo]);
  const totalQtd = lancamentosFiltrados.reduce((s, l) => s + l.quantidade, 0);
  const totalValor = lancamentosFiltrados.reduce((s, l) => s + (l.valorTotal || 0), 0);

  return (
    <div className="p-3 max-w-4xl mx-auto space-y-3 animate-fade-in pb-20">
      {/* Filtros por tipo — botões visuais */}
      <div className="grid grid-cols-4 gap-1.5">
        {TIPOS_FILTRO.map(t => (
          <button
            key={t.value}
            onClick={() => setFiltroTipo(t.value)}
            className={cn(
              'flex flex-col items-center justify-center rounded-lg border px-1 py-2 text-[10px] font-medium transition-all',
              filtroTipo === t.value
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <span className="text-base leading-none mb-0.5">{t.icon}</span>
            <span className="leading-tight text-center">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Filtros complementares */}
      <div className="grid grid-cols-2 gap-2">
        <Select value={filtroAno} onValueChange={setFiltroAno}>
          <SelectTrigger className="text-xs h-8">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroMes} onValueChange={setFiltroMes}>
          <SelectTrigger className="text-xs h-8">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {MESES.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resumo */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{lancamentosFiltrados.length} registro(s)</span>
        <span className="font-bold text-foreground">Total: {totalQtd} cab.</span>
      </div>

      {/* Tabela dinâmica */}
      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b bg-primary/10">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={cn(
                    'px-1.5 py-2 font-bold text-foreground whitespace-nowrap',
                    col.key === 'data' && 'sticky left-0 bg-primary/10',
                    col.align === 'right' ? 'text-right' : 'text-left'
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lancamentosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum lançamento encontrado
                </td>
              </tr>
            ) : (
              lancamentosFiltrados.map((l, i) => (
                <tr key={l.id} className={i % 2 === 0 ? '' : 'bg-muted/30'}>
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-1.5 py-1.5 whitespace-nowrap',
                        col.key === 'data' && `font-medium sticky left-0 ${i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}`,
                        col.key === 'obs' && 'truncate max-w-[100px]',
                        col.align === 'right' ? 'text-right' : 'text-left',
                        col.key === 'qtde' && 'font-bold'
                      )}
                    >
                      {col.render(l)}
                    </td>
                  ))}
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
                      'px-1.5 py-2 font-bold text-foreground whitespace-nowrap',
                      idx === 0 && 'sticky left-0 bg-primary/10',
                      col.align === 'right' ? 'text-right' : 'text-left'
                    )}
                  >
                    {idx === 0 && 'Total'}
                    {col.key === 'qtde' && totalQtd}
                    {col.key === 'valorLiq' && fmtValor(totalValor)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
