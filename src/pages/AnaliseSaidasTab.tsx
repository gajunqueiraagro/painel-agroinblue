import { useMemo, useState } from 'react';
import { Lancamento, SaldoInicial, CATEGORIAS } from '@/types/cattle';
import { parseISO, format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TabId } from '@/components/BottomNav';
import { MESES_NOMES, MESES_OPTIONS_ACUMULADO } from '@/lib/calculos/labels';
import { isSaida } from '@/lib/calculos/zootecnicos';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId) => void;
}

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_OPTIONS = [
  { value: '12', label: 'Ano todo' },
  { value: '01', label: 'Até Janeiro' },
  { value: '02', label: 'Até Fevereiro' },
  { value: '03', label: 'Até Março' },
  { value: '04', label: 'Até Abril' },
  { value: '05', label: 'Até Maio' },
  { value: '06', label: 'Até Junho' },
  { value: '07', label: 'Até Julho' },
  { value: '08', label: 'Até Agosto' },
  { value: '09', label: 'Até Setembro' },
  { value: '10', label: 'Até Outubro' },
  { value: '11', label: 'Até Novembro' },
];
const COLORS = ['#dc2626', '#ea580c', '#d97706', '#8b5cf6', '#64748b', '#2563eb', '#16a34a', '#0891b2', '#ec4899'];

const TIPOS_SAIDA_LABELS: Record<string, string> = {
  abate: 'Abate',
  venda: 'Venda',
  transferencia_saida: 'Transf. Saída',
  consumo: 'Consumo',
  morte: 'Morte',
};

function isSaida(tipo: string): boolean {
  return ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(tipo);
}

export function AnaliseSaidasTab({ lancamentos, saldosIniciais, onTabChange }: Props) {
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {} });
    return Array.from(anos).sort().reverse();
  }, [lancamentos]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState('12');
  const anoAnterior = String(Number(anoFiltro) - 1);
  const mesLimite = Number(mesFiltro);

  const filterAcumulado = (list: Lancamento[]) =>
    list.filter(l => {
      try { return Number(format(parseISO(l.data), 'MM')) <= mesLimite; } catch { return false; }
    });

  const saidasAnoAll = useMemo(() =>
    lancamentos.filter(l => {
      try { return format(parseISO(l.data), 'yyyy') === anoFiltro && isSaida(l.tipo); } catch { return false; }
    }), [lancamentos, anoFiltro]);

  const saidasAnoAnteriorAll = useMemo(() =>
    lancamentos.filter(l => {
      try { return format(parseISO(l.data), 'yyyy') === anoAnterior && isSaida(l.tipo); } catch { return false; }
    }), [lancamentos, anoAnterior]);

  const saidasAno = useMemo(() => filterAcumulado(saidasAnoAll), [saidasAnoAll, mesLimite]);
  const saidasAnoAnterior = useMemo(() => filterAcumulado(saidasAnoAnteriorAll), [saidasAnoAnteriorAll, mesLimite]);

  const barData = MESES_NOMES.slice(0, mesLimite).map((nome, i) => {
    const mesNum = String(i + 1).padStart(2, '0');
    const atual = saidasAnoAll.filter(l => { try { return format(parseISO(l.data), 'MM') === mesNum; } catch { return false; } })
      .reduce((s, l) => s + l.quantidade, 0);
    const anterior = saidasAnoAnteriorAll.filter(l => { try { return format(parseISO(l.data), 'MM') === mesNum; } catch { return false; } })
      .reduce((s, l) => s + l.quantidade, 0);
    return { mes: nome, [anoFiltro]: atual, [anoAnterior]: anterior };
  });

  const porCategoria = CATEGORIAS.map(cat => ({
    name: cat.label,
    value: saidasAno.filter(l => l.categoria === cat.value).reduce((s, l) => s + l.quantidade, 0),
  })).filter(c => c.value > 0);

  const porTipo = Object.entries(TIPOS_SAIDA_LABELS).map(([tipo, label]) => ({
    name: label,
    value: saidasAno.filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade, 0),
  })).filter(c => c.value > 0);

  const totalSaidas = saidasAno.reduce((s, l) => s + l.quantidade, 0);
  const totalAnterior = saidasAnoAnterior.reduce((s, l) => s + l.quantidade, 0);
  const diferencaCab = totalSaidas - totalAnterior;
  const variacao = totalAnterior > 0 ? (((totalSaidas - totalAnterior) / totalAnterior) * 100).toFixed(1) : null;

  const arrobasAtual = saidasAno.reduce((s, l) => s + (l.pesoMedioArrobas || 0) * l.quantidade, 0);
  const arrobasAnterior = saidasAnoAnterior.reduce((s, l) => s + (l.pesoMedioArrobas || 0) * l.quantidade, 0);
  const diferencaArrobas = arrobasAtual - arrobasAnterior;
  const variacaoArrobas = arrobasAnterior > 0 ? (((arrobasAtual - arrobasAnterior) / arrobasAnterior) * 100).toFixed(1) : null;

  const periodoLabel = mesLimite === 12 ? 'Ano todo' : `Jan–${MESES_NOMES[mesLimite - 1]}`;

  // Stacked bar by tipo per month
  const TIPOS_SAIDA_KEYS = Object.keys(TIPOS_SAIDA_LABELS);
  const barTipoData = MESES_NOMES.slice(0, mesLimite).map((nome, i) => {
    const mesNum = String(i + 1).padStart(2, '0');
    const row: Record<string, string | number> = { mes: nome };
    TIPOS_SAIDA_KEYS.forEach(tipo => {
      row[TIPOS_SAIDA_LABELS[tipo]] = saidasAnoAll
        .filter(l => { try { return format(parseISO(l.data), 'MM') === mesNum && l.tipo === tipo; } catch { return false; } })
        .reduce((s, l) => s + l.quantidade, 0);
    });
    return row;
  });

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => onTabChange('analise')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">Análise de Saídas</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
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
        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="touch-target text-base font-bold">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            {MESES_OPTIONS.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-base">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resumo YoY - Cabeças */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">{anoFiltro}</p>
          <p className="text-xl font-extrabold text-foreground">{totalSaidas}</p>
          <p className="text-[10px] text-muted-foreground">cab. ({periodoLabel})</p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">{anoAnterior}</p>
          <p className="text-xl font-extrabold text-foreground">{totalAnterior}</p>
          <p className="text-[10px] text-muted-foreground">cab. ({periodoLabel})</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Diferença</p>
          <p className={`text-xl font-extrabold ${diferencaCab <= 0 ? 'text-success' : 'text-destructive'}`}>
            {diferencaCab >= 0 ? '+' : ''}{diferencaCab} cab.
          </p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Variação %</p>
          <p className={`text-xl font-extrabold ${variacao && Number(variacao) <= 0 ? 'text-success' : 'text-destructive'}`}>
            {variacao ? `${Number(variacao) >= 0 ? '+' : ''}${variacao}%` : '-'}
          </p>
        </div>
      </div>

      {/* Resumo YoY - Arrobas */}
      {(arrobasAtual > 0 || arrobasAnterior > 0) && (<>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
            <p className="text-xs text-muted-foreground font-semibold">{anoFiltro} @</p>
            <p className="text-lg font-extrabold text-foreground">{arrobasAtual.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground">arrobas</p>
          </div>
          <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
            <p className="text-xs text-muted-foreground font-semibold">{anoAnterior} @</p>
            <p className="text-lg font-extrabold text-foreground">{arrobasAnterior.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground">arrobas</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
            <p className="text-xs text-muted-foreground font-semibold">Diferença @</p>
            <p className={`text-lg font-extrabold ${diferencaArrobas <= 0 ? 'text-success' : 'text-destructive'}`}>
              {diferencaArrobas >= 0 ? '+' : ''}{diferencaArrobas.toFixed(1)}
            </p>
          </div>
          <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
            <p className="text-xs text-muted-foreground font-semibold">Variação @</p>
            <p className={`text-lg font-extrabold ${variacaoArrobas && Number(variacaoArrobas) >= 0 ? 'text-success' : 'text-destructive'}`}>
              {variacaoArrobas ? `${Number(variacaoArrobas) >= 0 ? '+' : ''}${variacaoArrobas}%` : '-'}
            </p>
          </div>
        </div>
      </>)}

      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">Saídas por Mês</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey={anoFiltro} fill="hsl(0, 72%, 51%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey={anoAnterior} fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} opacity={0.5} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stacked bar by tipo per month */}
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">Tipo de Saída por Mês</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barTipoData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            {Object.values(TIPOS_SAIDA_LABELS).map((label, i) => (
              <Bar key={label} dataKey={label} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === Object.values(TIPOS_SAIDA_LABELS).length - 1 ? [3, 3, 0, 0] : undefined} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {porCategoria.length > 0 && (
        <div className="bg-card rounded-lg p-4 shadow-sm border">
          <h2 className="font-bold text-foreground mb-3">Saídas por Categoria</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={porCategoria} cx="50%" cy="45%" outerRadius={70} innerRadius={30} dataKey="value" label={false} labelLine={false}>
                {porCategoria.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                formatter={(value: string) => {
                  const item = porCategoria.find(c => c.name === value);
                  const total = porCategoria.reduce((s, c) => s + c.value, 0);
                  const pct = item && total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;
                  return `${value} ${pct}%`;
                }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {porTipo.length > 0 && (
        <div className="bg-card rounded-lg p-4 shadow-sm border">
          <h2 className="font-bold text-foreground mb-3">Saídas por Tipo</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={porTipo} cx="50%" cy="45%" outerRadius={70} innerRadius={30} dataKey="value" label={false} labelLine={false}>
                {porTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                formatter={(value: string) => {
                  const item = porTipo.find(c => c.name === value);
                  const total = porTipo.reduce((s, c) => s + c.value, 0);
                  const pct = item && total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;
                  return `${value} ${pct}%`;
                }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}