import { useState, useMemo } from 'react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
}

const TIPOS_MOVIMENTACAO = [
  { value: '__todos__', label: 'Todos os tipos' },
  { value: 'nascimento', label: 'Nascimento' },
  { value: 'compra', label: 'Compra' },
  { value: 'transferencia_entrada', label: 'Transf. Entrada' },
  { value: 'abate', label: 'Abate' },
  { value: 'venda', label: 'Venda em Pé' },
  { value: 'transferencia_saida', label: 'Transf. Saída' },
  { value: 'consumo', label: 'Consumo' },
  { value: 'morte', label: 'Morte' },
  { value: 'reclassificacao', label: 'Reclassificação' },
];

const MESES = [
  { value: '__todos__', label: 'Todos' },
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Fev' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Abr' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Ago' },
  { value: '09', label: 'Set' },
  { value: '10', label: 'Out' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dez' },
];

const TIPO_LABELS: Record<string, string> = {
  nascimento: 'Nascimento',
  compra: 'Compra',
  transferencia_entrada: 'Transf. Entrada',
  abate: 'Abate',
  venda: 'Venda em Pé',
  transferencia_saida: 'Transf. Saída',
  consumo: 'Consumo',
  morte: 'Morte',
  reclassificacao: 'Reclassificação',
};

export function MovimentacaoTab({ lancamentos, saldosIniciais }: Props) {
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
  const [filtroTipo, setFiltroTipo] = useState('__todos__');

  const lancamentosFiltrados = useMemo(() => {
    return lancamentos
      .filter(l => {
        try {
          const d = parseISO(l.data);
          const ano = format(d, 'yyyy');
          const mes = format(d, 'MM');
          if (ano !== filtroAno) return false;
          if (filtroMes !== '__todos__' && mes !== filtroMes) return false;
          if (filtroTipo !== '__todos__' && l.tipo !== filtroTipo) return false;
          return true;
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [lancamentos, filtroAno, filtroMes, filtroTipo]);

  const totalQtd = lancamentosFiltrados.reduce((s, l) => s + l.quantidade, 0);

  const formatData = (data: string) => {
    try {
      return format(parseISO(data), 'dd/MM/yy');
    } catch {
      return data;
    }
  };

  const formatValor = (v: number | null | undefined) => {
    if (v == null || v === 0) return '-';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const formatPeso = (v: number | null | undefined) => {
    if (v == null || v === 0) return '-';
    return `${v.toFixed(0)} kg`;
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4 animate-fade-in pb-20">
      {/* Filtros */}
      <div className="grid grid-cols-3 gap-2">
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="text-xs h-9">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            {TIPOS_MOVIMENTACAO.map(t => (
              <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroAno} onValueChange={setFiltroAno}>
          <SelectTrigger className="text-xs h-9">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroMes} onValueChange={setFiltroMes}>
          <SelectTrigger className="text-xs h-9">
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
        <span>{lancamentosFiltrados.length} lançamento(s)</span>
        <span className="font-bold text-foreground">Total: {totalQtd} cab.</span>
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-primary/10">
              <th className="text-left px-2 py-2 font-bold text-foreground sticky left-0 bg-primary/10">Data</th>
              <th className="text-left px-2 py-2 font-bold text-foreground">Tipo</th>
              <th className="text-left px-2 py-2 font-bold text-foreground">Categoria</th>
              <th className="text-right px-2 py-2 font-bold text-foreground">Qtd</th>
              <th className="text-right px-2 py-2 font-bold text-foreground">Peso</th>
              <th className="text-right px-2 py-2 font-bold text-foreground">Valor</th>
              <th className="text-left px-2 py-2 font-bold text-foreground">Obs</th>
            </tr>
          </thead>
          <tbody>
            {lancamentosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum lançamento encontrado para os filtros selecionados
                </td>
              </tr>
            ) : (
              lancamentosFiltrados.map((l, i) => (
                <tr key={l.id} className={i % 2 === 0 ? '' : 'bg-muted/30'}>
                  <td className={`px-2 py-1.5 font-medium text-foreground sticky left-0 whitespace-nowrap ${i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}`}>
                    {formatData(l.data)}
                  </td>
                  <td className="px-2 py-1.5 text-foreground whitespace-nowrap">
                    {TIPO_LABELS[l.tipo] || l.tipo}
                  </td>
                  <td className="px-2 py-1.5 text-foreground whitespace-nowrap">
                    {l.categoria}
                    {l.categoria_destino ? ` → ${l.categoria_destino}` : ''}
                  </td>
                  <td className="px-2 py-1.5 text-right font-bold text-foreground">{l.quantidade}</td>
                  <td className="px-2 py-1.5 text-right text-foreground">{formatPeso(l.peso_medio_kg)}</td>
                  <td className="px-2 py-1.5 text-right text-foreground whitespace-nowrap">{formatValor(l.valor_total)}</td>
                  <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[120px]">{l.observacao || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
          {lancamentosFiltrados.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-primary/10">
                <td colSpan={3} className="px-2 py-2 font-bold text-foreground sticky left-0 bg-primary/10">Total</td>
                <td className="px-2 py-2 text-right font-extrabold text-foreground">{totalQtd}</td>
                <td className="px-2 py-2"></td>
                <td className="px-2 py-2 text-right font-bold text-foreground whitespace-nowrap">
                  {formatValor(lancamentosFiltrados.reduce((s, l) => s + (l.valor_total || 0), 0))}
                </td>
                <td className="px-2 py-2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
