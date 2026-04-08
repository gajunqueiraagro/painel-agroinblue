import { useMemo, useState } from 'react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { parseISO, format } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import { StandardTooltip } from '@/lib/chartConfig';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TabId } from '@/components/BottomNav';
import { MESES_NOMES, MESES_OPTIONS_ACUMULADO } from '@/lib/calculos/labels';
import { fmtValor, formatMoeda, formatPercent, formatArroba, formatCabecas } from '@/lib/calculos/formatters';
import {
  calcArrobasSafe,
  calcValorTotal,
  calcArrobasIniciais,
  calcDesfrute,
  calcDesfruteArrobas,
  TIPOS_DESFRUTE_GLOBAL,
  TIPOS_DESFRUTE_FAZENDA,
  TIPOS_DESFRUTE_LABELS,
} from '@/lib/calculos/economicos';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId) => void;
  isGlobal?: boolean;
}

const COLORS = ['#dc2626', '#ea580c', '#d97706', '#8b5cf6', '#64748b', '#2563eb', '#16a34a'];

export function DesfrunteTab({ lancamentos, saldosIniciais, onTabChange, isGlobal = false }: Props) {
  const tiposDesfrute = isGlobal ? TIPOS_DESFRUTE_GLOBAL : TIPOS_DESFRUTE_FAZENDA;
  const isDesfrute = (tipo: string) => (tiposDesfrute as readonly string[]).includes(tipo);
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

  // FONTE OFICIAL: useRebanhoOficial para saldo inicial do ano
  const rebanhoOf = useRebanhoOficial({ ano: Number(anoFiltro), cenario: 'realizado', global: isGlobal });
  const saldoInicialAno = useMemo(() => {
    const faz = rebanhoOf.getFazendaMes(1);
    return faz?.cabecasInicio ?? saldosIniciais.filter(s => s.ano === Number(anoFiltro)).reduce((sum, s) => sum + s.quantidade, 0);
  }, [rebanhoOf.loading, rebanhoOf.getFazendaMes, saldosIniciais, anoFiltro]);

  const arrobasInicioAno = useMemo(() =>
    calcArrobasIniciais(saldosIniciais, Number(anoFiltro)),
    [saldosIniciais, anoFiltro]);

  const filterAcumulado = (list: Lancamento[]) =>
    list.filter(l => {
      try { return Number(format(parseISO(l.data), 'MM')) <= mesLimite; } catch { return false; }
    });

  const desfrAnoAll = useMemo(() =>
    lancamentos.filter(l => {
      try { return format(parseISO(l.data), 'yyyy') === anoFiltro && isDesfrute(l.tipo); } catch { return false; }
    }), [lancamentos, anoFiltro, tiposDesfrute]);

  const desfrAnoAntAll = useMemo(() =>
    lancamentos.filter(l => {
      try { return format(parseISO(l.data), 'yyyy') === anoAnterior && isDesfrute(l.tipo); } catch { return false; }
    }), [lancamentos, anoAnterior, tiposDesfrute]);

  const desfrAno = useMemo(() => filterAcumulado(desfrAnoAll), [desfrAnoAll, mesLimite]);
  const desfrAnoAnt = useMemo(() => filterAcumulado(desfrAnoAntAll), [desfrAnoAntAll, mesLimite]);

  const periodoLabel = mesLimite === 12 ? 'Ano todo' : `Jan–${MESES_NOMES[mesLimite - 1]}`;

  // Totais acumulados — usando lib central
  const totalCab = desfrAno.reduce((s, l) => s + l.quantidade, 0);
  const totalCabAnt = desfrAnoAnt.reduce((s, l) => s + l.quantidade, 0);
  const difCab = totalCab - totalCabAnt;
  const varCab = totalCabAnt > 0 ? (((totalCab - totalCabAnt) / totalCabAnt) * 100).toFixed(1) : null;

  const totalArrobas = desfrAno.reduce((s, l) => s + calcArrobasSafe(l), 0);
  const totalArrobasAnt = desfrAnoAnt.reduce((s, l) => s + calcArrobasSafe(l), 0);
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

  // Desfrute via lib central
  const desfruteCab = calcDesfrute(totalCab, saldoInicialAno);
  const desfruteArrobas = calcDesfruteArrobas(totalArrobas, arrobasInicioAno);

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
  const porTipo = (tiposDesfrute as readonly string[]).map(tipo => ({
    name: TIPOS_DESFRUTE_LABELS[tipo] || tipo,
    value: desfrAno.filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade, 0),
  })).filter(c => c.value > 0);

  // Linha acumulada: arrobas YoY
  const lineArrobasData = MESES_NOMES.slice(0, mesLimite).map((nome, i) => {
    const mesNum = i + 1;
    const acumAtual = desfrAnoAll
      .filter(l => { try { return Number(format(parseISO(l.data), 'MM')) <= mesNum; } catch { return false; } })
      .reduce((s, l) => s + calcArrobasSafe(l), 0);
    const acumAnt = desfrAnoAntAll
      .filter(l => { try { return Number(format(parseISO(l.data), 'MM')) <= mesNum; } catch { return false; } })
      .reduce((s, l) => s + calcArrobasSafe(l), 0);
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
    const arrobAtual = filtAtual.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const valAtual = filtAtual.reduce((s, l) => s + calcValorTotal(l), 0);
    const arrobAnt = filtAnt.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const valAnt = filtAnt.reduce((s, l) => s + calcValorTotal(l), 0);
    return {
      mes: nome,
      [anoFiltro]: arrobAtual > 0 ? Number((valAtual / arrobAtual).toFixed(2)) : 0,
      [anoAnterior]: arrobAnt > 0 ? Number((valAnt / arrobAnt).toFixed(2)) : 0,
    };
  });

  return (
    <div className="p-4 w-full space-y-4 animate-fade-in pb-20">
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
            {MESES_OPTIONS_ACUMULADO.map(m => (
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
          <p className="text-lg font-extrabold text-foreground">{fmtValor(totalArrobas)}</p>
          <p className={`text-[10px] font-semibold ${difArrobas >= 0 ? 'text-success' : 'text-destructive'}`}>
            {difArrobas >= 0 ? '+' : ''}{fmtValor(difArrobas)} @ YoY
          </p>
          {totalArrobasAnt > 0 && (
            <p className={`text-[10px] font-semibold ${difArrobas >= 0 ? 'text-success' : 'text-destructive'}`}>
              {difArrobas >= 0 ? '+' : ''}{((difArrobas / totalArrobasAnt) * 100).toFixed(1)}% YoY
            </p>
          )}
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Arrobas {anoAnterior}</p>
          <p className="text-lg font-extrabold text-foreground">{fmtValor(totalArrobasAnt)}</p>
          <p className="text-[10px] text-muted-foreground">{periodoLabel}</p>
        </div>
      </div>

      {/* Peso e Preço */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">P.Médio (kg)</p>
          <p className="text-lg font-extrabold text-foreground">{fmtValor(pesoMedioKg)}</p>
          {pesoMedioKgAnt > 0 && (
            <p className={`text-[10px] font-semibold ${pesoMedioKg >= pesoMedioKgAnt ? 'text-success' : 'text-destructive'}`}>
              {pesoMedioKg >= pesoMedioKgAnt ? '+' : ''}{fmtValor(pesoMedioKg - pesoMedioKgAnt)} kg YoY
            </p>
          )}
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">R$/líq @</p>
          <p className="text-lg font-extrabold text-foreground">{fmtValor(precoMedioArroba)}</p>
          {precoMedioArrobaAnt > 0 && (
            <p className={`text-[10px] font-semibold ${precoMedioArroba >= precoMedioArrobaAnt ? 'text-success' : 'text-destructive'}`}>
              {precoMedioArroba >= precoMedioArrobaAnt ? '+' : ''}{fmtValor(precoMedioArroba - precoMedioArrobaAnt)} YoY
            </p>
          )}
        </div>
      </div>

      {/* Desfrute */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">% Desfrute (cab.)</p>
          <p className="text-xl font-extrabold text-foreground">
            {desfruteCab !== null ? formatPercent(desfruteCab) : '0,0%'}
          </p>
          <p className="text-[10px] text-muted-foreground">{formatCabecas(totalCab)} / {formatCabecas(saldoInicialAno)}</p>
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">% Desfrute (@)</p>
          <p className="text-xl font-extrabold text-foreground">
            {desfruteArrobas !== null ? formatPercent(desfruteArrobas) : '0,0%'}
          </p>
          <p className="text-[10px] text-muted-foreground">{formatArroba(totalArrobas)} / {formatArroba(arrobasInicioAno)}</p>
        </div>
      </div>

      {/* Faturado */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Faturado {anoFiltro}</p>
          <p className="text-base font-extrabold text-foreground">R$ {fmtValor(totalValor)}</p>
          {totalValorAnt > 0 && (
            <>
              <p className={`text-[10px] font-semibold ${totalValor >= totalValorAnt ? 'text-success' : 'text-destructive'}`}>
                {totalValor >= totalValorAnt ? '+' : ''}R$ {fmtValor(totalValor - totalValorAnt)} YoY
              </p>
              <p className={`text-[10px] font-semibold ${totalValor >= totalValorAnt ? 'text-success' : 'text-destructive'}`}>
                {totalValor >= totalValorAnt ? '+' : ''}{(((totalValor - totalValorAnt) / totalValorAnt) * 100).toFixed(1)}% YoY
              </p>
            </>
          )}
        </div>
        <div className="bg-card rounded-lg p-3 text-center shadow-sm border">
          <p className="text-xs text-muted-foreground font-semibold">Faturado {anoAnterior}</p>
          <p className="text-base font-extrabold text-foreground">R$ {fmtValor(totalValorAnt)}</p>
          <p className="text-[10px] text-muted-foreground">{periodoLabel}</p>
        </div>
      </div>

      {/* Barras: quantidade por mês YoY */}
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">Desfrute por Mês (cab.)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip content={<StandardTooltip />} />
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
              <Tooltip content={<StandardTooltip />} />
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

      {/* Linha acumulada: arrobas */}
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">Arrobas Acumuladas</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={lineArrobasData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip content={<StandardTooltip />} />
            <Legend />
            <Line type="monotone" dataKey={anoFiltro} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey={anoAnterior} stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Linha acumulada: valor faturado */}
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">Valor Faturado Acumulado</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={lineValorData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<StandardTooltip formatter={(v) => typeof v === 'number' ? formatMoeda(v) : '—'} />} />
            <Legend />
            <Line type="monotone" dataKey={anoFiltro} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey={anoAnterior} stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Linha acumulada: preço médio R$/@ */}
      <div className="bg-card rounded-lg p-4 shadow-sm border">
        <h2 className="font-bold text-foreground mb-3">R$/líq @ Acumulado</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={linePrecoData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip content={<StandardTooltip formatter={(v) => typeof v === 'number' ? formatMoeda(v) : '—'} />} />
            <Legend />
            <Line type="monotone" dataKey={anoFiltro} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey={anoAnterior} stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
