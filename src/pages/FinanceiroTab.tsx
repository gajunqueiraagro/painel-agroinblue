import { useState, useMemo } from 'react';
import { Lancamento, CATEGORIAS } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { parseISO, format } from 'date-fns';
import { DollarSign, Pencil } from 'lucide-react';
import { FinanceiroEditDialog } from '@/components/FinanceiroEditDialog';
import { FinanceiroExportMenu } from '@/components/FinanceiroExportMenu';

interface Props {
  lancamentos: Lancamento[];
  onEditar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
}

type SubAba = 'abate' | 'compra' | 'venda';

const SUB_ABAS: { id: SubAba; label: string; icon: string }[] = [
  { id: 'abate', label: 'Abates', icon: '🔪' },
  { id: 'compra', label: 'Compras', icon: '🛒' },
  { id: 'venda', label: 'Vendas', icon: '💰' },
];

function fmt(v?: number) {
  if (v === undefined || v === null || isNaN(v) || v === 0) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AbateTable({ lancamentos, onEdit }: { lancamentos: Lancamento[]; onEdit: (l: Lancamento) => void }) {
  const calcAbate = (l: Lancamento) => {
    const pesoCarcaca = l.pesoCarcacaKg ?? 0;
    const pesoVivo = l.pesoMedioKg ?? 0;
    const pesoArroba = pesoCarcaca > 0 ? pesoCarcaca / 15 : 0;
    const qtd = l.quantidade;
    const precoArroba = l.precoArroba ?? 0;
    const pesoTotalKg = pesoVivo * qtd;
    const pesoTotalArrobas = pesoArroba * qtd;
    const bonusTotal = (l.bonusPrecoce ?? 0) + (l.bonusQualidade ?? 0) + (l.bonusListaTrace ?? 0);
    const descontoTotal = (l.descontoQualidade ?? 0) + (l.descontoFunrural ?? 0) + (l.outrosDescontos ?? 0);
    const valorBruto = pesoTotalArrobas * precoArroba;
    const valorFinal = valorBruto + bonusTotal - descontoTotal;
    const rendimento = pesoVivo > 0 && pesoCarcaca > 0 ? (pesoCarcaca / pesoVivo) * 100 : 0;
    const liqCabeca = qtd > 0 ? valorFinal / qtd : 0;
    const liqArroba = pesoTotalArrobas > 0 ? valorFinal / pesoTotalArrobas : 0;
    const liqKgVivo = pesoTotalKg > 0 ? valorFinal / pesoTotalKg : 0;
    return { pesoArroba, rendimento, valorFinal, liqCabeca, liqArroba, liqKgVivo };
  };

  if (lancamentos.length === 0) return <p className="text-center text-muted-foreground py-6">Nenhum abate no período</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-1.5 text-left font-bold">Data</th>
            <th className="p-1.5 text-right font-bold">Qtd</th>
            <th className="p-1.5 text-left font-bold">Cat.</th>
            <th className="p-1.5 text-left font-bold">Destino</th>
            <th className="p-1.5 text-right font-bold">Rend.</th>
            <th className="p-1.5 text-right font-bold">P.@</th>
            <th className="p-1.5 text-right font-bold">R$/@</th>
            <th className="p-1.5 text-right font-bold text-primary">Total</th>
            <th className="p-1.5 text-right font-bold">Líq/@</th>
            <th className="p-1.5 text-right font-bold">Líq/Cab</th>
            <th className="p-1.5 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {lancamentos.map(l => {
            const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
            const c = calcAbate(l);
            return (
              <tr key={l.id} className="border-b hover:bg-muted/30">
                <td className="p-1.5 whitespace-nowrap">{format(parseISO(l.data), 'dd/MM/yy')}</td>
                <td className="p-1.5 text-right font-bold">{l.quantidade}</td>
                <td className="p-1.5">{cat}</td>
                <td className="p-1.5 truncate max-w-[80px]">{l.fazendaDestino || '-'}</td>
                <td className="p-1.5 text-right text-muted-foreground">{c.rendimento ? c.rendimento.toFixed(1) + '%' : '-'}</td>
                <td className="p-1.5 text-right">{c.pesoArroba ? c.pesoArroba.toFixed(2) : '-'}</td>
                <td className="p-1.5 text-right">{fmt(l.precoArroba)}</td>
                <td className="p-1.5 text-right font-bold text-primary">{fmt(c.valorFinal)}</td>
                <td className="p-1.5 text-right">{fmt(c.liqArroba)}</td>
                <td className="p-1.5 text-right">{fmt(c.liqCabeca)}</td>
                <td className="p-1.5">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(l)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompraVendaTable({ lancamentos, onEdit, tipo }: { lancamentos: Lancamento[]; onEdit: (l: Lancamento) => void; tipo: 'compra' | 'venda' }) {
  const calc = (l: Lancamento) => {
    const pesoVivo = l.pesoMedioKg ?? 0;
    const pesoArroba = pesoVivo > 0 ? pesoVivo / 30 : 0;
    const qtd = l.quantidade;
    const precoArroba = l.precoArroba ?? 0;
    const pesoTotalKg = pesoVivo * qtd;
    const pesoTotalArrobas = pesoArroba * qtd;
    const valorBruto = pesoTotalArrobas * precoArroba;
    const valorFinal = valorBruto + (l.acrescimos ?? 0) - (l.deducoes ?? 0);
    const liqCabeca = qtd > 0 ? valorFinal / qtd : 0;
    const liqArroba = pesoTotalArrobas > 0 ? valorFinal / pesoTotalArrobas : 0;
    const liqKg = pesoTotalKg > 0 ? valorFinal / pesoTotalKg : 0;
    return { pesoArroba, valorFinal, liqCabeca, liqArroba, liqKg };
  };

  const campoLocal = tipo === 'compra' ? 'Origem' : 'Destino';

  if (lancamentos.length === 0) return <p className="text-center text-muted-foreground py-6">Nenhum registro no período</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-1.5 text-left font-bold">Data</th>
            <th className="p-1.5 text-right font-bold">Qtd</th>
            <th className="p-1.5 text-left font-bold">Cat.</th>
            <th className="p-1.5 text-left font-bold">{campoLocal}</th>
            <th className="p-1.5 text-right font-bold">P.Vivo</th>
            <th className="p-1.5 text-right font-bold">P.@</th>
            <th className="p-1.5 text-right font-bold">R$/@</th>
            <th className="p-1.5 text-right font-bold text-primary">Total</th>
            <th className="p-1.5 text-right font-bold">Líq/Cab</th>
            <th className="p-1.5 text-right font-bold">Líq/kg</th>
            <th className="p-1.5 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {lancamentos.map(l => {
            const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
            const c = calc(l);
            const local = tipo === 'compra' ? l.fazendaOrigem : l.fazendaDestino;
            return (
              <tr key={l.id} className="border-b hover:bg-muted/30">
                <td className="p-1.5 whitespace-nowrap">{format(parseISO(l.data), 'dd/MM/yy')}</td>
                <td className="p-1.5 text-right font-bold">{l.quantidade}</td>
                <td className="p-1.5">{cat}</td>
                <td className="p-1.5 truncate max-w-[80px]">{local || '-'}</td>
                <td className="p-1.5 text-right">{l.pesoMedioKg ?? '-'}</td>
                <td className="p-1.5 text-right text-muted-foreground">{c.pesoArroba ? c.pesoArroba.toFixed(2) : '-'}</td>
                <td className="p-1.5 text-right">{fmt(l.precoArroba)}</td>
                <td className="p-1.5 text-right font-bold text-primary">{fmt(c.valorFinal)}</td>
                <td className="p-1.5 text-right">{fmt(c.liqCabeca)}</td>
                <td className="p-1.5 text-right">{fmt(c.liqKg)}</td>
                <td className="p-1.5">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(l)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FinanceiroTab({ lancamentos, onEditar }: Props) {
  const [subAba, setSubAba] = useState<SubAba>('abate');
  const [editando, setEditando] = useState<Lancamento | null>(null);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => {
      try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {}
    });
    return Array.from(anos).sort().reverse();
  }, [lancamentos]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));

  const filtrados = useMemo(() => {
    return lancamentos
      .filter(l => {
        try {
          const d = parseISO(l.data);
          if (format(d, 'yyyy') !== anoFiltro) return false;
          return l.tipo === subAba;
        } catch { return false; }
      })
      .sort((a, b) => a.data.localeCompare(b.data)); // oldest first
  }, [lancamentos, anoFiltro, subAba]);

  return (
    <div className="p-4 max-w-full mx-auto space-y-4 animate-fade-in pb-20">
      <div className="grid grid-cols-3 gap-1 bg-muted rounded-lg p-1">
        {SUB_ABAS.map(a => (
          <button
            key={a.id}
            onClick={() => setSubAba(a.id)}
            className={`py-2 px-1 rounded-md text-xs font-bold transition-colors touch-target ${
              subAba === a.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      <Select value={anoFiltro} onValueChange={setAnoFiltro}>
        <SelectTrigger className="touch-target text-base font-bold w-32">
          <SelectValue placeholder="Ano" />
        </SelectTrigger>
        <SelectContent>
          {anosDisponiveis.map(a => (
            <SelectItem key={a} value={a} className="text-base">{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="bg-card rounded-lg p-3 shadow-sm border flex items-center gap-3">
        <DollarSign className="h-5 w-5 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground font-semibold">{filtrados.length} registros</p>
          <p className="text-sm font-bold text-foreground">{filtrados.reduce((s, l) => s + l.quantidade, 0)} cabeças</p>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow-sm border overflow-hidden">
        {subAba === 'abate' ? (
          <AbateTable lancamentos={filtrados} onEdit={setEditando} />
        ) : (
          <CompraVendaTable lancamentos={filtrados} onEdit={setEditando} tipo={subAba} />
        )}
      </div>

      <FinanceiroEditDialog
        lancamento={editando}
        open={!!editando}
        onClose={() => setEditando(null)}
        onSave={onEditar}
      />
    </div>
  );
}
