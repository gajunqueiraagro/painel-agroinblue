import { useMemo, useState } from 'react';
import { Lancamento, SaldoInicial, CATEGORIAS, isEntrada } from '@/types/cattle';
import { parseISO, format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TabId } from '@/components/BottomNav';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId) => void;
}

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const COLORS = ['#2563eb', '#16a34a', '#ea580c', '#8b5cf6', '#dc2626', '#0891b2', '#d97706', '#64748b', '#ec4899'];

const TIPOS_ENTRADA_LABELS: Record<string, string> = {
  nascimento: 'Nascimento',
  compra: 'Compra',
  transferencia_entrada: 'Transf. Entrada',
};

export function AnaliseEntradasTab({ lancamentos, saldosIniciais, onTabChange }: Props) {
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {} });
    return Array.from(anos).sort().reverse();
  }, [lancamentos]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const anoAnterior = String(Number(anoFiltro) - 1);

  const entradasAno = useMemo(() =>
    lancamentos.filter(l => {
      try { return format(parseISO(l.data), 'yyyy') === anoFiltro && isEntrada(l.tipo); } catch { return false; }
    }), [lancamentos, anoFiltro]);

  const entradasAnoAnterior = useMemo(() =>
    lancamentos.filter(l => {
      try { return format(parseISO(l.data), 'yyyy') === anoAnterior && isEntrada(l.tipo); } catch { return false; }
    }), [lancamentos, anoAnterior]);

  // Bar chart by month (YoY)
  const barData = MESES_NOMES.map((nome, i) => {
    const mesNum = String(i + 1).padStart(2, '0');
    const atual = entradasAno.filter(l => { try { return format(parseISO(l.data), 'MM') === mesNum; } catch { return false; } })
      .reduce((s, l) => s + l.quantidade, 0);
    const anterior = entradasAnoAnterior.filter(l => { try { return format(parseISO(l.data), 'MM') === mesNum; } catch { return false; } })
      .reduce((s, l) => s + l.quantidade, 0);
    return { mes: nome, [anoFiltro]: atual, [anoAnterior]: anterior };
  });

  // Pie by category
  const porCategoria = CATEGORIAS.map(cat => ({
    name: cat.label,
    value: entradasAno.filter(l => l.categoria === cat.value).reduce((s, l) => s + l.quantidade, 0),
  })).filter(c => c.value > 0);

  // Pie by tipo
  const porTipo = Object.entries(TIPOS_ENTRADA_LABELS).map(([tipo, label]) => ({
    name: label,
    value: entradasAno.filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade, 0),
  })).filter(c => c.value > 0);

  const totalEntradas = entradasAno.reduce((s, l) => s + l.quantidade, 0);
  const totalAnterior = entradasAnoAnterior.reduce((s, l) => s + l.quantidade, 0);
  const variacao = totalAnterior > 0 ? (((totalEntradas - totalAnterior) / totalAnterior) * 100).toFixed(1) : null;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => onTabChange('analise')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">Análise de Entradas</h1>
      </div>

      <Select value={anoFiltro} onValueChange={setAnoFiltro}>
        <SelectTrigger className="touch-target text-base font-bold">
          <SelectValue placeholder="Ano" />
        </SelectTrigger>
        <SelectContent>
          {anosDisponiveis.map(a => (
            <SelectItem key={a} value={a} className="text-base">{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Resumo YoY */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">{anoFiltro}</p>
          <p className="text-xl font-extrabold text-foreground">{totalEntradas}</p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">{anoAnterior}</p>
          <p className="text-xl font-extrabold text-foreground">{totalAnterior}</p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Variação</p>
          <p className={`text-xl font-extrabold ${variacao && Number(variacao) >= 0 ? 'text-success' : 'text-destructive'}`}>
            {variacao ? `${Number(variacao) >= 0 ? '+' : ''}${variacao}%` : '-'}
          </p>
        </div>
      </div>

      {/* Bar chart mensal YoY */}
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">Entradas por Mês</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey={anoFiltro} fill="hsl(142, 76%, 36%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey={anoAnterior} fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} opacity={0.5} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie por categoria */}
      {porCategoria.length > 0 && (
        <div className="bg-card rounded-lg p-4 shadow-sm border">
          <h2 className="font-bold text-foreground mb-3">Entradas por Categoria</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={porCategoria} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {porCategoria.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pie por tipo */}
      {porTipo.length > 0 && (
        <div className="bg-card rounded-lg p-4 shadow-sm border">
          <h2 className="font-bold text-foreground mb-3">Entradas por Tipo</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={porTipo} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {porTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
