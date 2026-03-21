import { useMemo, useState } from 'react';
import { Lancamento, SaldoInicial, kgToArrobas } from '@/types/cattle';
import { parseISO, format } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
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
const COLORS = ['#dc2626', '#ea580c', '#d97706', '#8b5cf6', '#64748b', '#2563eb', '#16a34a'];

const TIPOS_DESFRUTE = ['abate', 'venda', 'consumo'] as const;
const TIPOS_DESFRUTE_LABELS: Record<string, string> = {
  abate: 'Abate',
  venda: 'Venda em Pé',
  consumo: 'Consumo',
};

function isDesfrute(tipo: string): boolean {
  return TIPOS_DESFRUTE.includes(tipo as any);
}

function calcArrobas(l: Lancamento): number {
  // Se tem peso de carcaça (peso morto), usa /15
  if (l.pesoCarcacaKg && l.pesoCarcacaKg > 0) {
    return (l.pesoCarcacaKg / 15) * l.quantidade;
  }
  // Se tem pesoMedioArrobas preenchido diretamente, usa ele
  if (l.pesoMedioArrobas && l.pesoMedioArrobas > 0) {
    return l.pesoMedioArrobas * l.quantidade;
  }
  // Se tem peso em kg, verifica tipo de peso
  if (l.pesoMedioKg && l.pesoMedioKg > 0) {
    const divisor = l.tipoPeso === 'morto' ? 15 : 30;
    return (l.pesoMedioKg / divisor) * l.quantidade;
  }
  return 0;
}

function calcValorTotal(l: Lancamento): number {
  if (l.valorTotal) return l.valorTotal;
  if (l.precoArroba && l.pesoMedioArrobas) return l.precoArroba * l.pesoMedioArrobas * l.quantidade;
  if (l.precoMedioCabeca) return l.precoMedioCabeca * l.quantidade;
  return 0;
}

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DesfrunteTab({ lancamentos, saldosIniciais, onTabChange }: Props) {
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

  const saldoInicialAno = useMemo(() =>
    saldosIniciais.filter(s => s.ano === Number(anoFiltro)).reduce((sum, s) => sum + s.quantidade, 0),
    [saldosIniciais, anoFiltro]);

  const arrobasInicioAno = useMemo(() =>
    saldosIniciais
      .filter(s => s.ano === Number(anoFiltro))
      .reduce((sum, s) => sum + s.quantidade * kgToArrobas(s.pesoMedioKg || 0), 0),
    [saldosIniciais, anoFiltro]);

  const filterAcumulado = (list: Lancamento[]) =>
    list.filter(l => {
      try { return Number(format(parseISO(l.data), 'MM')) <= mesLimite; } catch { return false; }
    });

  const desfrAnoAll = useMemo(() =>
    lancamentos.filter(l => {
      try { return format(parseISO(l.data), 'yyyy') === anoFiltro && isDesfrute(l.tipo); } catch { return false; }
    }), [lancamentos, anoFiltro]);

  const desfrAnoAntAll = useMemo(() =>
    lancamentos.filter(l => {
      try { return format(parseISO(l.data), 'yyyy') === anoAnterior && isDesfrute(l.tipo); } catch { return false; }
    }), [lancamentos, anoAnterior]);

  const desfrAno = useMemo(() => filterAcumulado(desfrAnoAll), [desfrAnoAll, mesLimite]);
  const desfrAnoAnt = useMemo(() => filterAcumulado(desfrAnoAntAll), [desfrAnoAntAll, mesLimite]);

  const periodoLabel = mesLimite === 12 ? 'Ano todo' : `Jan–${MESES_NOMES[mesLimite - 1]}`;

  // Totais acumulados
  const totalCab = desfrAno.reduce((s, l) => s + l.quantidade, 0);
  const totalCabAnt = desfrAnoAnt.reduce((s, l) => s + l.quantidade, 0);
  const difCab = totalCab - totalCabAnt;
  const varCab = totalCabAnt > 0 ? (((totalCab - totalCabAnt) / totalCabAnt) * 100).toFixed(1) : null;

  const totalArrobas = desfrAno.reduce((s, l) => s + calcArrobas(l), 0);
  const totalArrobasAnt = desfrAnoAnt.reduce((s, l) => s + calcArrobas(l), 0);
  const difArrobas = totalArrobas - totalArrobasAnt;

  const totalValor = desfrAno.reduce((s, l) => s + calcValorTotal(l), 0);
  const totalValorAnt = desfrAnoAnt.reduce((s, l) => s + calcValorTotal(l), 0);

  const precoMedioArroba = totalArrobas > 0 ? totalValor / totalArrobas : 0;
  const precoMedioArrobaAnt = totalArrobasAnt > 0 ? totalValorAnt / totalArrobasAnt : 0;

  const pesoMedioKg = totalCab > 0
    ? desfrAno.reduce((s, l) => s + (l.pesoMedioKg || 0) * l.quantidade, 0) / totalCab
    : 0;
  const pesoMedioKgAnt = totalCabAnt > 0
    ? desfrAnoAnt.reduce((s, l) => s + (l.pesoMedioKg || 0) * l.quantidade, 0) / totalCabAnt
    : 0;

  // Gráfico barras: quantidade por mês YoY
  const barData = MESES_NOMES.slice(0, mesLimite).map((nome, i) => {
    const mesNum = String(i + 1).padStart(2, '0');
    const atual = desfrAnoAll.filter(l => { try { return format(parseISO(l.data), 'MM') === mesNum; } catch { return false; } })
      .reduce((s, l) => s + l.quantidade, 0);
    const anterior = desfrAnoAntAll.filter(l => { try { return format(parseISO(l.data), 'MM') === mesNum; } catch { return false; } })
      .reduce((s, l) => s + l.quantidade, 0);
    return { mes: nome, [anoFiltro]: atual, [anoAnterior]: anterior };
  });

  // Pie: tipo de desfrute
  const porTipo = Object.entries(TIPOS_DESFRUTE_LABELS).map(([tipo, label]) => ({
    name: label,
    value: desfrAno.filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade, 0),
  })).filter(c => c.value > 0);

  // Linha acumulada: arrobas YoY
  const lineArrobasData = MESES_NOMES.slice(0, mesLimite).map((nome, i) => {
    const mesNum = i + 1;
    const acumAtual = desfrAnoAll
      .filter(l => { try { return Number(format(parseISO(l.data), 'MM')) <= mesNum; } catch { return false; } })
      .reduce((s, l) => s + calcArrobas(l), 0);
    const acumAnt = desfrAnoAntAll
      .filter(l => { try { return Number(format(parseISO(l.data), 'MM')) <= mesNum; } catch { return false; } })
      .reduce((s, l) => s + calcArrobas(l), 0);
    return { mes: nome, [anoFiltro]: Number(acumAtual.toFixed(1)), [anoAnterior]: Number(acumAnt.toFixed(1)) };
  });

  // Linha acumulada: valor faturado YoY
  const lineValorData = MESES_NOMES.slice(0, mesLimite).map((nome, i) => {
    const mesNum = i + 1;
    const acumAtual = desfrAnoAll
      .filter(l => { try { return Number(format(parseISO(l.data), 'MM')) <= mesNum; } catch { return false; } })
      .reduce((s, l) => s + calcValorTotal(l), 0);
    const acumAnt = desfrAnoAntAll
      .filter(l => { try { return Number(format(parseISO(l.data), 'MM')) <= mesNum; } catch { return false; } })
      .reduce((s, l) => s + calcValorTotal(l), 0);
    return { mes: nome, [anoFiltro]: Number(acumAtual.toFixed(2)), [anoAnterior]: Number(acumAnt.toFixed(2)) };
  });

  // Linha acumulada: preço médio R$/@ YoY
  const linePrecoData = MESES_NOMES.slice(0, mesLimite).map((nome, i) => {
    const mesNum = i + 1;
    const filtAtual = desfrAnoAll.filter(l => { try { return Number(format(parseISO(l.data), 'MM')) <= mesNum; } catch { return false; } });
    const filtAnt = desfrAnoAntAll.filter(l => { try { return Number(format(parseISO(l.data), 'MM')) <= mesNum; } catch { return false; } });
    const arrobAtual = filtAtual.reduce((s, l) => s + calcArrobas(l), 0);
    const valAtual = filtAtual.reduce((s, l) => s + calcValorTotal(l), 0);
    const arrobAnt = filtAnt.reduce((s, l) => s + calcArrobas(l), 0);
    const valAnt = filtAnt.reduce((s, l) => s + calcValorTotal(l), 0);
    return {
      mes: nome,
      [anoFiltro]: arrobAtual > 0 ? Number((valAtual / arrobAtual).toFixed(2)) : 0,
      [anoAnterior]: arrobAnt > 0 ? Number((valAnt / arrobAnt).toFixed(2)) : 0,
    };
  });

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => onTabChange('analise')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">Desfrute</h1>
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

      {/* Cards resumo - com YoY inline */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Cab. {anoFiltro}</p>
          <p className="text-xl font-extrabold text-foreground">{totalCab}</p>
          <p className={`text-[10px] font-semibold ${difCab >= 0 ? 'text-success' : 'text-destructive'}`}>
            {difCab >= 0 ? '+' : ''}{difCab} cab. YoY
          </p>
          <p className={`text-[10px] font-semibold ${varCab && Number(varCab) >= 0 ? 'text-success' : 'text-destructive'}`}>
            {varCab ? `${Number(varCab) >= 0 ? '+' : ''}${varCab}% YoY` : '-'}
          </p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Cab. {anoAnterior}</p>
          <p className="text-xl font-extrabold text-foreground">{totalCabAnt}</p>
          <p className="text-[10px] text-muted-foreground">{periodoLabel}</p>
        </div>
      </div>

      {/* Arrobas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Arrobas {anoFiltro}</p>
          <p className="text-lg font-extrabold text-foreground">{fmt(totalArrobas)}</p>
          <p className={`text-[10px] font-semibold ${difArrobas >= 0 ? 'text-success' : 'text-destructive'}`}>
            {difArrobas >= 0 ? '+' : ''}{fmt(difArrobas)} @ YoY
          </p>
          {totalArrobasAnt > 0 && (
            <p className={`text-[10px] font-semibold ${difArrobas >= 0 ? 'text-success' : 'text-destructive'}`}>
              {difArrobas >= 0 ? '+' : ''}{((difArrobas / totalArrobasAnt) * 100).toFixed(1)}% YoY
            </p>
          )}
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Arrobas {anoAnterior}</p>
          <p className="text-lg font-extrabold text-foreground">{fmt(totalArrobasAnt)}</p>
          <p className="text-[10px] text-muted-foreground">{periodoLabel}</p>
        </div>
      </div>

      {/* Peso e Preço */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">P.Médio (kg)</p>
          <p className="text-lg font-extrabold text-foreground">{fmt(pesoMedioKg)}</p>
          {pesoMedioKgAnt > 0 && (
            <p className={`text-[10px] font-semibold ${pesoMedioKg >= pesoMedioKgAnt ? 'text-success' : 'text-destructive'}`}>
              {pesoMedioKg >= pesoMedioKgAnt ? '+' : ''}{fmt(pesoMedioKg - pesoMedioKgAnt)} kg YoY
            </p>
          )}
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">R$/@</p>
          <p className="text-lg font-extrabold text-foreground">{fmt(precoMedioArroba)}</p>
          {precoMedioArrobaAnt > 0 && (
            <p className={`text-[10px] font-semibold ${precoMedioArroba >= precoMedioArrobaAnt ? 'text-success' : 'text-destructive'}`}>
              {precoMedioArroba >= precoMedioArrobaAnt ? '+' : ''}{fmt(precoMedioArroba - precoMedioArrobaAnt)} YoY
            </p>
          )}
        </div>
      </div>

      {/* Faturado */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">% Desfrute (cab.)</p>
          <p className="text-xl font-extrabold text-foreground">
            {saldoInicialAno > 0 ? ((totalCab / saldoInicialAno) * 100).toFixed(1) : '0.0'}%
          </p>
          <p className="text-[10px] text-muted-foreground">{totalCab} / {saldoInicialAno} cab.</p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">% Desfrute (@)</p>
          <p className="text-xl font-extrabold text-foreground">
            {arrobasInicioAno > 0 ? ((totalArrobas / arrobasInicioAno) * 100).toFixed(1) : '0.0'}%
          </p>
          <p className="text-[10px] text-muted-foreground">{fmt(totalArrobas)} / {fmt(arrobasInicioAno)} @</p>
        </div>
      </div>

      {/* Faturado */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Faturado {anoFiltro}</p>
          <p className="text-base font-extrabold text-foreground">R$ {fmt(totalValor)}</p>
          {totalValorAnt > 0 && (
            <>
              <p className={`text-[10px] font-semibold ${totalValor >= totalValorAnt ? 'text-success' : 'text-destructive'}`}>
                {totalValor >= totalValorAnt ? '+' : ''}R$ {fmt(totalValor - totalValorAnt)} YoY
              </p>
              <p className={`text-[10px] font-semibold ${totalValor >= totalValorAnt ? 'text-success' : 'text-destructive'}`}>
                {totalValor >= totalValorAnt ? '+' : ''}{(((totalValor - totalValorAnt) / totalValorAnt) * 100).toFixed(1)}% YoY
              </p>
            </>
          )}
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Faturado {anoAnterior}</p>
          <p className="text-base font-extrabold text-foreground">R$ {fmt(totalValorAnt)}</p>
          <p className="text-[10px] text-muted-foreground">{periodoLabel}</p>
        </div>
      </div>

      {/* Barras: quantidade por mês YoY */}
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">Desfrute por Mês (cab.)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey={anoFiltro} fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            <Bar dataKey={anoAnterior} fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} opacity={0.5} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie: tipos de desfrute */}
      {porTipo.length > 0 && (
        <div className="bg-card rounded-lg p-4 shadow-sm border">
          <h2 className="font-bold text-foreground mb-3">Tipos de Desfrute</h2>
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

      {/* Linha: arrobas acumuladas YoY */}
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">Arrobas Acumuladas (@)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={lineArrobasData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey={anoFiltro} stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey={anoAnterior} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Linha: valor faturado acumulado YoY */}
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">Faturamento Acumulado (R$)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={lineValorData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => [`R$ ${fmt(v)}`, '']} />
            <Legend />
            <Line type="monotone" dataKey={anoFiltro} stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey={anoAnterior} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Linha: preço médio acumulado R$/@ YoY */}
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">Preço Médio Acumulado (R$/@)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={linePrecoData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => [`R$ ${fmt(v)}`, '']} />
            <Legend />
            <Line type="monotone" dataKey={anoFiltro} stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey={anoAnterior} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
