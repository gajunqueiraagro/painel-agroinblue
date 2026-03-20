import { useState, useMemo } from 'react';
import { Lancamento, CATEGORIAS, kgToArrobas } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DollarSign } from 'lucide-react';

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

function formatCurrency(v?: number) {
  if (v === undefined || v === null) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function EditableCell({ value, onChange, placeholder, type = 'number' }: {
  value?: number;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value ?? ''));

  if (editing) {
    return (
      <Input
        type={type}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const num = parseFloat(local);
          onChange(isNaN(num) ? undefined : num);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        autoFocus
        className="h-7 text-xs w-20 px-1"
        placeholder={placeholder}
      />
    );
  }

  return (
    <button
      onClick={() => { setLocal(String(value ?? '')); setEditing(true); }}
      className="text-xs text-right w-full min-w-[60px] px-1 py-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
      title="Clique para editar"
    >
      {value !== undefined && value !== null ? formatCurrency(value) : <span className="text-muted-foreground">-</span>}
    </button>
  );
}

function AbateTable({ lancamentos, onEditar }: { lancamentos: Lancamento[]; onEditar: Props['onEditar'] }) {
  const handleChange = (id: string, field: string, value: number | undefined) => {
    onEditar(id, { [field]: value ?? null } as any);
  };

  // Calculate derived values for abate
  const calcAbate = (l: Lancamento) => {
    const pesoCarcaca = l.pesoCarcacaKg ?? 0;
    const pesoArroba = pesoCarcaca ? Number((pesoCarcaca / 15).toFixed(2)) : 0;
    const precoArroba = l.precoArroba ?? 0;
    const qtd = l.quantidade;
    const bonusTotal = (l.bonusPrecoce ?? 0) + (l.bonusQualidade ?? 0) + (l.bonusListaTrace ?? 0);
    const descontoTotal = (l.descontoQualidade ?? 0) + (l.descontoFunrural ?? 0) + (l.outrosDescontos ?? 0);
    const valorBruto = pesoArroba * precoArroba * qtd;
    const valorFinal = valorBruto + bonusTotal - descontoTotal;
    const liqCabeca = qtd > 0 ? valorFinal / qtd : 0;
    const totalArrobas = pesoArroba * qtd;
    const liqArroba = totalArrobas > 0 ? valorFinal / totalArrobas : 0;
    return { pesoArroba, valorFinal, liqCabeca, liqArroba };
  };

  if (lancamentos.length === 0) return <p className="text-center text-muted-foreground py-6">Nenhum abate no período</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-1 text-left font-bold">Data</th>
            <th className="p-1 text-right font-bold">Qtd</th>
            <th className="p-1 text-left font-bold">Cat.</th>
            <th className="p-1 text-left font-bold">Destino</th>
            <th className="p-1 text-right font-bold">P.Vivo</th>
            <th className="p-1 text-right font-bold">P.Carc.</th>
            <th className="p-1 text-right font-bold">P.@</th>
            <th className="p-1 text-right font-bold">R$/@</th>
            <th className="p-1 text-right font-bold">B.Prec.</th>
            <th className="p-1 text-right font-bold">B.Qual.</th>
            <th className="p-1 text-right font-bold">B.Trace</th>
            <th className="p-1 text-right font-bold">D.Qual.</th>
            <th className="p-1 text-right font-bold">D.Funr.</th>
            <th className="p-1 text-right font-bold">Outros D.</th>
            <th className="p-1 text-right font-bold">Total</th>
            <th className="p-1 text-right font-bold">Líq/Cab</th>
            <th className="p-1 text-right font-bold">Líq/@</th>
          </tr>
        </thead>
        <tbody>
          {lancamentos.map(l => {
            const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
            const calc = calcAbate(l);
            return (
              <tr key={l.id} className="border-b hover:bg-muted/30">
                <td className="p-1 whitespace-nowrap">{format(parseISO(l.data), 'dd/MM/yy')}</td>
                <td className="p-1 text-right font-bold">{l.quantidade}</td>
                <td className="p-1">{cat}</td>
                <td className="p-1 truncate max-w-[80px]">{l.fazendaDestino || '-'}</td>
                <td className="p-1"><EditableCell value={l.pesoMedioKg} onChange={v => handleChange(l.id, 'pesoMedioKg', v)} /></td>
                <td className="p-1"><EditableCell value={l.pesoCarcacaKg} onChange={v => handleChange(l.id, 'pesoCarcacaKg', v)} /></td>
                <td className="p-1 text-right text-muted-foreground">{calc.pesoArroba || '-'}</td>
                <td className="p-1"><EditableCell value={l.precoArroba} onChange={v => handleChange(l.id, 'precoArroba', v)} /></td>
                <td className="p-1"><EditableCell value={l.bonusPrecoce} onChange={v => handleChange(l.id, 'bonusPrecoce', v)} /></td>
                <td className="p-1"><EditableCell value={l.bonusQualidade} onChange={v => handleChange(l.id, 'bonusQualidade', v)} /></td>
                <td className="p-1"><EditableCell value={l.bonusListaTrace} onChange={v => handleChange(l.id, 'bonusListaTrace', v)} /></td>
                <td className="p-1"><EditableCell value={l.descontoQualidade} onChange={v => handleChange(l.id, 'descontoQualidade', v)} /></td>
                <td className="p-1"><EditableCell value={l.descontoFunrural} onChange={v => handleChange(l.id, 'descontoFunrural', v)} /></td>
                <td className="p-1"><EditableCell value={l.outrosDescontos} onChange={v => handleChange(l.id, 'outrosDescontos', v)} /></td>
                <td className="p-1 text-right font-bold text-primary">{formatCurrency(calc.valorFinal) || '-'}</td>
                <td className="p-1 text-right">{formatCurrency(calc.liqCabeca) || '-'}</td>
                <td className="p-1 text-right">{formatCurrency(calc.liqArroba) || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompraVendaTable({ lancamentos, onEditar, tipo }: { lancamentos: Lancamento[]; onEditar: Props['onEditar']; tipo: 'compra' | 'venda' }) {
  const handleChange = (id: string, field: string, value: number | undefined) => {
    onEditar(id, { [field]: value ?? null } as any);
  };

  const calc = (l: Lancamento) => {
    const pesoVivo = l.pesoMedioKg ?? 0;
    const pesoArroba = pesoVivo ? Number((pesoVivo / 30).toFixed(2)) : 0;
    const precoArroba = l.precoArroba ?? 0;
    const qtd = l.quantidade;
    const valorBruto = pesoArroba * precoArroba * qtd;
    const valorFinal = valorBruto + (l.acrescimos ?? 0) - (l.deducoes ?? 0);
    const liqCabeca = qtd > 0 ? valorFinal / qtd : 0;
    const totalArrobas = pesoArroba * qtd;
    const liqArroba = totalArrobas > 0 ? valorFinal / totalArrobas : 0;
    const totalKg = pesoVivo * qtd;
    const liqKg = totalKg > 0 ? valorFinal / totalKg : 0;
    return { pesoArroba, valorFinal, liqCabeca, liqArroba, liqKg };
  };

  const campoLocal = tipo === 'compra' ? 'Origem' : 'Destino';

  if (lancamentos.length === 0) return <p className="text-center text-muted-foreground py-6">Nenhum registro no período</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-1 text-left font-bold">Data</th>
            <th className="p-1 text-right font-bold">Qtd</th>
            <th className="p-1 text-left font-bold">Cat.</th>
            <th className="p-1 text-left font-bold">{campoLocal}</th>
            <th className="p-1 text-right font-bold">P.Vivo</th>
            <th className="p-1 text-right font-bold">P.@</th>
            <th className="p-1 text-right font-bold">R$/@</th>
            <th className="p-1 text-right font-bold">Acrésc.</th>
            <th className="p-1 text-right font-bold">Deduções</th>
            <th className="p-1 text-right font-bold">Total</th>
            <th className="p-1 text-right font-bold">Líq/Cab</th>
            <th className="p-1 text-right font-bold">Líq/@</th>
            <th className="p-1 text-right font-bold">Líq/kg</th>
          </tr>
        </thead>
        <tbody>
          {lancamentos.map(l => {
            const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
            const c = calc(l);
            const local = tipo === 'compra' ? l.fazendaOrigem : l.fazendaDestino;
            return (
              <tr key={l.id} className="border-b hover:bg-muted/30">
                <td className="p-1 whitespace-nowrap">{format(parseISO(l.data), 'dd/MM/yy')}</td>
                <td className="p-1 text-right font-bold">{l.quantidade}</td>
                <td className="p-1">{cat}</td>
                <td className="p-1 truncate max-w-[80px]">{local || '-'}</td>
                <td className="p-1"><EditableCell value={l.pesoMedioKg} onChange={v => handleChange(l.id, 'pesoMedioKg', v)} /></td>
                <td className="p-1 text-right text-muted-foreground">{c.pesoArroba || '-'}</td>
                <td className="p-1"><EditableCell value={l.precoArroba} onChange={v => handleChange(l.id, 'precoArroba', v)} /></td>
                <td className="p-1"><EditableCell value={l.acrescimos} onChange={v => handleChange(l.id, 'acrescimos', v)} /></td>
                <td className="p-1"><EditableCell value={l.deducoes} onChange={v => handleChange(l.id, 'deducoes', v)} /></td>
                <td className="p-1 text-right font-bold text-primary">{formatCurrency(c.valorFinal) || '-'}</td>
                <td className="p-1 text-right">{formatCurrency(c.liqCabeca) || '-'}</td>
                <td className="p-1 text-right">{formatCurrency(c.liqArroba) || '-'}</td>
                <td className="p-1 text-right">{formatCurrency(c.liqKg) || '-'}</td>
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
    return lancamentos.filter(l => {
      try {
        const d = parseISO(l.data);
        if (format(d, 'yyyy') !== anoFiltro) return false;
        return l.tipo === subAba;
      } catch { return false; }
    });
  }, [lancamentos, anoFiltro, subAba]);

  return (
    <div className="p-4 max-w-full mx-auto space-y-4 animate-fade-in pb-20">
      {/* Sub-abas */}
      <div className="grid grid-cols-3 gap-1 bg-muted rounded-lg p-1">
        {SUB_ABAS.map(a => (
          <button
            key={a.id}
            onClick={() => setSubAba(a.id)}
            className={`py-2 px-1 rounded-md text-xs font-bold transition-colors touch-target ${
              subAba === a.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      {/* Filtro ano */}
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

      {/* Totais rápidos */}
      <div className="bg-card rounded-lg p-3 shadow-sm border flex items-center gap-3">
        <DollarSign className="h-5 w-5 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground font-semibold">{filtrados.length} registros</p>
          <p className="text-sm font-bold text-foreground">
            {filtrados.reduce((s, l) => s + l.quantidade, 0)} cabeças
          </p>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-lg shadow-sm border overflow-hidden">
        {subAba === 'abate' ? (
          <AbateTable lancamentos={filtrados} onEditar={onEditar} />
        ) : (
          <CompraVendaTable lancamentos={filtrados} onEditar={onEditar} tipo={subAba} />
        )}
      </div>
    </div>
  );
}
