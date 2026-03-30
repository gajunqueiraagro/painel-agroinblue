import { useMemo, useState } from 'react';
import { Lancamento, SaldoInicial, CATEGORIAS, isEntrada, isReclassificacao } from '@/types/cattle';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TabId } from '@/components/BottomNav';
import { parseISO, format } from 'date-fns';
import { calcSaldoMensalArray, calcSaldoPorCategoriaLegado } from '@/lib/calculos';
import { MESES_NOMES } from '@/lib/calculos/labels';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId) => void;
  isGlobal?: boolean;
}

const TIPOS_DESFRUTE_BASE = ['abate', 'venda', 'consumo'];
const TIPOS_DESFRUTE_FAZENDA = ['abate', 'venda', 'consumo', 'transferencia_saida'];

const COLORS = ['#2563eb', '#16a34a', '#ea580c', '#8b5cf6', '#dc2626', '#0891b2', '#d97706', '#64748b', '#ec4899'];

export function AnaliseTab({ lancamentos, saldosIniciais, onTabChange, isGlobal = false }: Props) {
  const TIPOS_DESFRUTE = isGlobal ? TIPOS_DESFRUTE_BASE : TIPOS_DESFRUTE_FAZENDA;
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {} });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const anoNum = Number(anoFiltro);
  const anoAnterior = String(anoNum - 1);
  const anoAntNum = anoNum - 1;

  // Saldo mensal via lib central
  const saldoMensalAtual = useMemo(() => calcSaldoMensalArray(saldosIniciais, lancamentos, anoNum), [saldosIniciais, lancamentos, anoNum]);
  const saldoMensalAnt = useMemo(() => calcSaldoMensalArray(saldosIniciais, lancamentos, anoAntNum), [saldosIniciais, lancamentos, anoAntNum]);

  const chartData = MESES_NOMES.map((nome, i) => ({
    mes: nome,
    [anoFiltro]: saldoMensalAtual[i].saldo,
    [anoAnterior]: saldoMensalAnt[i].saldo,
  }));

  // Pie chart: saldo atual por categoria via lib central
  const porCategoria = useMemo(() => {
    const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoNum);
    return CATEGORIAS
      .map(cat => ({ name: cat.label, value: saldoMap.get(cat.value) || 0, categoria: cat.value }))
      .filter(c => c.value > 0);
  }, [saldosIniciais, lancamentos, anoNum]);

  const totalRebanho = porCategoria.reduce((s, c) => s + c.value, 0);

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => onTabChange('resumo')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">Operação</h1>
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

      {/* Summary boxes */}
      {(() => {
        const lancAno = lancamentos.filter(l => {
          try { return format(parseISO(l.data), 'yyyy') === anoFiltro; } catch { return false; }
        });
        const entradas = lancAno.filter(l => isEntrada(l.tipo)).reduce((s, l) => s + l.quantidade, 0);
        const saidas = lancAno.filter(l => !isEntrada(l.tipo) && !isReclassificacao(l.tipo)).reduce((s, l) => s + l.quantidade, 0);
        const desfrute = lancAno.filter(l => TIPOS_DESFRUTE.includes(l.tipo)).reduce((s, l) => s + l.quantidade, 0);
        return (
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => onTabChange('analise_entradas')}
              className="bg-card rounded-lg p-4 shadow-sm border flex flex-col items-center gap-2 hover:bg-accent transition-colors"
            >
              <TrendingUp className="h-5 w-5 mx-auto text-success mb-1" />
              <p className="font-bold text-foreground text-sm">Entradas</p>
              <p className="text-xl font-extrabold text-foreground">+{entradas}</p>
            </button>
            <button
              onClick={() => onTabChange('analise_saidas')}
              className="bg-card rounded-lg p-4 shadow-sm border flex flex-col items-center gap-2 hover:bg-accent transition-colors"
            >
              <TrendingDown className="h-5 w-5 mx-auto text-destructive mb-1" />
              <p className="font-bold text-foreground text-sm">Saídas</p>
              <p className="text-xl font-extrabold text-foreground">-{saidas}</p>
            </button>
            <button
              onClick={() => onTabChange('desfrute')}
              className="bg-card rounded-lg p-4 shadow-sm border flex flex-col items-center gap-2 hover:bg-accent transition-colors"
            >
              <TrendingUp className="h-5 w-5 mx-auto text-amber-500" />
              <p className="font-bold text-foreground text-sm">Desfrute</p>
              <p className="text-xl font-extrabold text-foreground">{desfrute}</p>
            </button>
          </div>
        );
      })()}

      {/* Line chart */}
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">Saldo do Rebanho</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey={anoFiltro} stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name={anoFiltro} />
            <Line type="monotone" dataKey={anoAnterior} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name={anoAnterior} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-1 text-center">— {anoFiltro} vs ‐‐ {anoAnterior}</p>
      </div>

      {/* Pie chart */}
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">Composição do Rebanho</h2>
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={porCategoria}
              cx="50%"
              cy="45%"
              outerRadius={90}
              innerRadius={40}
              dataKey="value"
              label={false}
              labelLine={false}
            >
              {porCategoria.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => [`${value} cab. (${totalRebanho > 0 ? ((value / totalRebanho) * 100).toFixed(1) : 0}%)`, '']} />
            <Legend
              verticalAlign="bottom"
              formatter={(value: string) => {
                const item = porCategoria.find(c => c.name === value);
                const pct = item && totalRebanho > 0 ? ((item.value / totalRebanho) * 100).toFixed(0) : 0;
                return `${value} ${pct}%`;
              }}
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
