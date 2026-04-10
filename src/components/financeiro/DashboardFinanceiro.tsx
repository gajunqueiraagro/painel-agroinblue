// Dashboard financeiro — versão executiva.
// Base: somente lançamentos realizados, data_pagamento, tipo_operacao 1-Entradas / 2-Saídas.
import { useMemo, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown, TrendingUp, Building2, AlertTriangle, BarChart3, Users, Target } from 'lucide-react';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_NOMES } from '@/lib/calculos/labels';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { StandardTooltip } from '@/lib/chartConfig';
import {
  type FinanceiroLancamento,
  type RateioADM,
} from '@/hooks/useFinanceiro';
import {
  isRealizado as isRealizadoCentral,
  isEntrada as isEntradaCentral,
  isSaida as isSaidaCentral,
  datePagtoAnoMes as datePagtoAnoMesCentral,
  classificarEntrada as classificarEntradaCentral,
  classificarSaida as classificarSaidaCentral,
  isDesembolsoProdutivo as isDesembolsoProdutivoCentral,
  CATEGORIAS_ENTRADA,
  CATEGORIAS_SAIDA,
} from '@/lib/financeiro/classificacao';
import { useFazenda } from '@/contexts/FazendaContext';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const isRealizado = (l: FinanceiroLancamento) => isRealizadoCentral(l);
const isEntrada = (l: FinanceiroLancamento) => isEntradaCentral(l);
const isSaida = (l: FinanceiroLancamento) => isSaidaCentral(l);
const datePagtoAnoMes = (l: FinanceiroLancamento) => datePagtoAnoMesCentral(l);

// Pie chart colors
const PIE_COLORS_ENTRADAS = ['hsl(142, 60%, 40%)', 'hsl(142, 45%, 55%)', 'hsl(160, 50%, 45%)', 'hsl(80, 40%, 50%)', 'hsl(190, 45%, 50%)', 'hsl(120, 30%, 60%)'];
const PIE_COLORS_SAIDAS = ['hsl(0, 60%, 50%)', 'hsl(15, 55%, 50%)', 'hsl(30, 50%, 50%)', 'hsl(340, 50%, 50%)', 'hsl(280, 40%, 50%)', 'hsl(210, 45%, 50%)', 'hsl(45, 50%, 50%)'];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DrillDownPayload {
  categoria: string;
  tipo: 'entrada' | 'saida';
  periodo: 'mes' | 'acum';
}

interface Props {
  lancamentos: FinanceiroLancamento[];
  indicadores: any;
  lancamentosPecuarios?: Lancamento[];
  saldosIniciais?: SaldoInicial[];
  rateioADM?: RateioADM[];
  isGlobal?: boolean;
  fazendasSemArea?: string[];
  pastos?: any[];
  categorias?: any[];
  fazendaId?: string;
  ano: number;
  mesAte: number;
  onDrillDown?: (payload: DrillDownPayload) => void;
}

// ---------------------------------------------------------------------------
// Toggle button
// ---------------------------------------------------------------------------
function ToggleGroup({ value, onChange }: { value: 'mes' | 'acum'; onChange: (v: 'mes' | 'acum') => void }) {
  return (
    <div className="flex gap-0.5">
      {(['mes', 'acum'] as const).map(t => (
        <button key={t} onClick={() => onChange(t)}
          className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${value === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground bg-muted'}`}>
          {t === 'mes' ? 'Mês' : 'Acumulado'}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom pie label
// ---------------------------------------------------------------------------
function renderPieLabel({ name, percent }: any) {
  if (percent < 0.03) return null;
  return `${(percent * 100).toFixed(0)}%`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function DashboardFinanceiro({
  lancamentos,
  indicadores,
  lancamentosPecuarios = [],
  saldosIniciais = [],
  rateioADM = [],
  isGlobal = false,
  fazendasSemArea = [],
  fazendaId,
  ano,
  mesAte,
  onDrillDown,
}: Props) {
  const isMobile = useIsMobile();
  const [entradaTab, setEntradaTab] = useState<'mes' | 'acum'>('mes');
  const [saidaTab, setSaidaTab] = useState<'mes' | 'acum'>('mes');

  const anoFiltro = String(ano);
  const mesLimite = mesAte;
  const periodoMes = `${anoFiltro}-${String(mesAte).padStart(2, '0')}`;

  // =========================================================================
  // FINANCEIRO — filtros
  // =========================================================================
  const filtradosMes = useMemo(() =>
    lancamentos.filter(l => {
      if (!isRealizado(l)) return false;
      return datePagtoAnoMes(l) === periodoMes;
    }), [lancamentos, periodoMes]);

  const entradasListMes = useMemo(() => filtradosMes.filter(isEntrada), [filtradosMes]);
  const saidasListMes = useMemo(() => filtradosMes.filter(isSaida), [filtradosMes]);

  // Rateio
  const rateioFiltradoMes = useMemo(() => rateioADM.filter(r => r.anoMes === periodoMes), [rateioADM, periodoMes]);
  const totalRateioMes = useMemo(() => rateioFiltradoMes.reduce((s, r) => s + r.valorRateado, 0), [rateioFiltradoMes]);
  const rateioAcumVal = useMemo(() =>
    rateioADM
      .filter(r => r.anoMes.startsWith(anoFiltro) && Number(r.anoMes.substring(5, 7)) <= mesLimite)
      .reduce((s, r) => s + r.valorRateado, 0),
    [rateioADM, anoFiltro, mesLimite]);

  // =========================================================================
  // INDICADORES CALCULADOS
  // =========================================================================
  const ind = useMemo(() => {
    const totalEntradas = entradasListMes.reduce((s, l) => s + Math.abs(l.valor), 0);
    const totalSaidas = saidasListMes.reduce((s, l) => s + Math.abs(l.valor), 0);
    const saidasComRateio = totalSaidas + totalRateioMes;

    // Acumulados
    const entradasAcum = lancamentos
      .filter(l => {
        if (!isRealizado(l) || !isEntrada(l)) return false;
        const am = datePagtoAnoMes(l);
        if (!am || !am.startsWith(anoFiltro)) return false;
        return Number(am.substring(5, 7)) <= mesLimite;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    const saidasAcum = lancamentos
      .filter(l => {
        if (!isRealizado(l) || !isSaida(l)) return false;
        const am = datePagtoAnoMes(l);
        if (!am || !am.startsWith(anoFiltro)) return false;
        return Number(am.substring(5, 7)) <= mesLimite;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    // Decomposição entradas
    const entradaDecomp = { mes: new Map<string, number>(), acum: new Map<string, number>() };
    for (const cat of CATEGORIAS_ENTRADA) { entradaDecomp.mes.set(cat, 0); entradaDecomp.acum.set(cat, 0); }
    for (const l of entradasListMes) {
      const cat = classificarEntradaCentral(l);
      entradaDecomp.mes.set(cat, (entradaDecomp.mes.get(cat) || 0) + Math.abs(l.valor));
    }
    lancamentos.filter(l => {
      if (!isRealizado(l) || !isEntrada(l)) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).forEach(l => {
      const cat = classificarEntradaCentral(l);
      entradaDecomp.acum.set(cat, (entradaDecomp.acum.get(cat) || 0) + Math.abs(l.valor));
    });

    // Decomposição saídas
    const saidaDecomp = { mes: new Map<string, number>(), acum: new Map<string, number>() };
    for (const cat of CATEGORIAS_SAIDA) { saidaDecomp.mes.set(cat, 0); saidaDecomp.acum.set(cat, 0); }
    for (const l of saidasListMes) {
      const cat = classificarSaidaCentral(l);
      saidaDecomp.mes.set(cat, (saidaDecomp.mes.get(cat) || 0) + Math.abs(l.valor));
    }
    lancamentos.filter(l => {
      if (!isRealizado(l) || !isSaida(l)) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).forEach(l => {
      const cat = classificarSaidaCentral(l);
      saidaDecomp.acum.set(cat, (saidaDecomp.acum.get(cat) || 0) + Math.abs(l.valor));
    });

    // Centro de custo ranking (all exits, not just desembolso produtivo)
    const ccMesMap = new Map<string, number>();
    const ccAcumMap = new Map<string, number>();
    for (const l of saidasListMes) {
      const cc = (l.centro_custo || l.grupo_custo || 'Não classificado').trim();
      ccMesMap.set(cc, (ccMesMap.get(cc) || 0) + Math.abs(l.valor));
    }
    lancamentos.filter(l => {
      if (!isRealizado(l) || !isSaida(l)) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).forEach(l => {
      const cc = (l.centro_custo || l.grupo_custo || 'Não classificado').trim();
      ccAcumMap.set(cc, (ccAcumMap.get(cc) || 0) + Math.abs(l.valor));
    });
    if (!isGlobal && totalRateioMes > 0) ccMesMap.set('Rateio ADM', totalRateioMes);
    if (!isGlobal && rateioAcumVal > 0) ccAcumMap.set('Rateio ADM', rateioAcumVal);
    const ccMes = Array.from(ccMesMap.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
    const ccAcum = Array.from(ccAcumMap.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);

    // Top fornecedores (mês)
    const fornMesMap = new Map<string, number>();
    for (const l of saidasListMes) {
      const forn = (l.fornecedor || l.descricao || 'Sem fornecedor').trim();
      fornMesMap.set(forn, (fornMesMap.get(forn) || 0) + Math.abs(l.valor));
    }
    const topFornecedores = Array.from(fornMesMap.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    return {
      totalEntradas, totalSaidas, saidasComRateio,
      entradasAcum, saidasAcum,
      rateioMes: totalRateioMes, rateioAcumVal,
      entradaDecomp, saidaDecomp,
      categoriasEntrada: [...CATEGORIAS_ENTRADA],
      categoriasSaida: [...CATEGORIAS_SAIDA],
      ccMes, ccAcum,
      topFornecedores,
    };
  }, [entradasListMes, saidasListMes, filtradosMes, lancamentos, anoFiltro, mesLimite, totalRateioMes, rateioADM, isGlobal, rateioAcumVal]);

  // =========================================================================
  // CHART DATA — Jan → Dez
  // =========================================================================
  const chartData = useMemo(() => {
    const monthMap = new Map<string, { entradas: number; saidas: number }>();
    for (let m = 1; m <= 12; m++) monthMap.set(String(m).padStart(2, '0'), { entradas: 0, saidas: 0 });
    for (const l of lancamentos) {
      if (!isRealizado(l)) continue;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) continue;
      const m = am.substring(5);
      const entry = monthMap.get(m);
      if (!entry) continue;
      if (isEntrada(l)) entry.entradas += Math.abs(l.valor);
      if (isSaida(l)) entry.saidas += Math.abs(l.valor);
    }
    let saldoAcum = 0;
    return Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => {
      saldoAcum += v.entradas - v.saidas;
      return { mes: MESES_NOMES[Number(mes) - 1] || mes, Entradas: v.entradas, Saídas: v.saidas, 'Saldo Acum.': saldoAcum };
    });
  }, [lancamentos, anoFiltro]);

  // PIE DATA
  const pieEntradas = useMemo(() => {
    const map = entradaTab === 'mes' ? ind.entradaDecomp.mes : ind.entradaDecomp.acum;
    return Array.from(map.entries()).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [ind, entradaTab]);

  const pieSaidas = useMemo(() => {
    const map = saidaTab === 'mes' ? ind.saidaDecomp.mes : ind.saidaDecomp.acum;
    return Array.from(map.entries()).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [ind, saidaTab]);

  // =========================================================================
  // EMPTY STATE
  // =========================================================================
  if (lancamentos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-bold">Nenhum dado financeiro</p>
        <p className="text-sm">Importe um Excel na aba Importação para começar.</p>
      </div>
    );
  }

  const totalEntradasDisplay = entradaTab === 'mes' ? ind.totalEntradas : ind.entradasAcum;
  const totalSaidasDisplay = saidaTab === 'mes' ? ind.saidasComRateio : (ind.saidasAcum + (isGlobal ? 0 : ind.rateioAcumVal));
  const saldoLiquido = totalEntradasDisplay - totalSaidasDisplay;

  return (
    <div className="space-y-3">
      {/* Warning banners only */}
      {!isGlobal && fazendasSemArea && fazendasSemArea.length > 0 && (
        <div className="flex items-start gap-2 text-xs bg-destructive/5 border border-destructive/30 rounded-md px-2.5 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            <span className="font-bold text-destructive">Rateio ADM incompleto:</span>{' '}
            {fazendasSemArea.join(', ')} sem rebanho cadastrado no período.
          </span>
        </div>
      )}

      {/* ================================================================= */}
      {/* 1. CARDS EXECUTIVOS — Entradas / Saídas / Saldo */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Entradas */}
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(142, 60%, 40%)' }}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'hsl(142, 60%, 35%)' }}>
                <TrendingUp className="h-4 w-4" /> Entradas em Caixa
              </div>
              <ToggleGroup value={entradaTab} onChange={setEntradaTab} />
            </div>
            <p className="text-2xl font-black tabular-nums" style={{ color: 'hsl(142, 60%, 35%)' }}>
              {formatMoeda(totalEntradasDisplay)}
            </p>
            <div className="space-y-0.5 mt-2">
              {ind.categoriasEntrada.map((cat: string) => {
                const val = (entradaTab === 'mes' ? ind.entradaDecomp.mes : ind.entradaDecomp.acum).get(cat) || 0;
                if (val === 0) return null;
                return (
                  <div key={cat} className="flex justify-between text-[11px] cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
                    onClick={() => onDrillDown?.({ categoria: cat, tipo: 'entrada', periodo: entradaTab })}>
                    <span className="text-muted-foreground truncate mr-2">{cat}</span>
                    <span className="font-mono font-semibold whitespace-nowrap" style={{ color: 'hsl(142, 50%, 40%)' }}>{formatMoeda(val)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Saídas */}
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(0, 65%, 50%)' }}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-destructive">
                <TrendingDown className="h-4 w-4" /> Saídas em Caixa
              </div>
              <ToggleGroup value={saidaTab} onChange={setSaidaTab} />
            </div>
            <p className="text-2xl font-black text-destructive tabular-nums">
              {formatMoeda(totalSaidasDisplay)}
            </p>
            <div className="space-y-0.5 mt-2">
              {ind.categoriasSaida.map((cat: string) => {
                const val = (saidaTab === 'mes' ? ind.saidaDecomp.mes : ind.saidaDecomp.acum).get(cat) || 0;
                if (val === 0) return null;
                return (
                  <div key={cat} className="flex justify-between text-[11px] cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
                    onClick={() => onDrillDown?.({ categoria: cat, tipo: 'saida', periodo: saidaTab })}>
                    <span className="text-muted-foreground truncate mr-2">{cat}</span>
                    <span className="font-mono font-semibold whitespace-nowrap text-destructive">{formatMoeda(val)}</span>
                  </div>
                );
              })}
              {!isGlobal && (saidaTab === 'mes' ? ind.rateioMes : ind.rateioAcumVal) > 0 && (
                <div className="border-t pt-0.5 mt-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-amber-600">Rateio ADM</span>
                    <span className="font-mono font-bold text-amber-600">{formatMoeda(saidaTab === 'mes' ? ind.rateioMes : ind.rateioAcumVal)}</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Saldo líquido */}
        <Card className="border-l-4" style={{ borderLeftColor: saldoLiquido >= 0 ? 'hsl(210, 70%, 50%)' : 'hsl(30, 80%, 50%)' }}>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground mb-1">
              <BarChart3 className="h-4 w-4" /> Saldo Líquido
            </div>
            <p className={`text-2xl font-black tabular-nums ${saldoLiquido >= 0 ? 'text-primary' : 'text-amber-600'}`}>
              {formatMoeda(saldoLiquido)}
            </p>
            <div className="mt-2 space-y-0.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entradas</span>
                <span className="font-mono font-semibold" style={{ color: 'hsl(142, 50%, 40%)' }}>{formatMoeda(totalEntradasDisplay)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saídas</span>
                <span className="font-mono font-semibold text-destructive">{formatMoeda(totalSaidasDisplay)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================= */}
      {/* 2. PIE CHARTS — Entradas / Saídas */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Pie Entradas */}
        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-bold" style={{ color: 'hsl(142, 60%, 35%)' }}>
              Composição das Entradas — {entradaTab === 'mes' ? MESES_NOMES[mesAte - 1] : 'Acumulado'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {pieEntradas.length === 0 ? (
              <p className="text-center text-muted-foreground text-xs py-6">Sem entradas no período</p>
            ) : (
              <div className="flex items-center gap-2">
                <div className="h-40 w-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieEntradas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={30}
                        label={renderPieLabel} labelLine={false} strokeWidth={1}>
                        {pieEntradas.map((_, i) => <Cell key={i} fill={PIE_COLORS_ENTRADAS[i % PIE_COLORS_ENTRADAS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatMoeda(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-0.5 min-w-0">
                  {pieEntradas.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-1.5 text-[10px]">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS_ENTRADAS[i % PIE_COLORS_ENTRADAS.length] }} />
                      <span className="truncate text-muted-foreground">{item.name}</span>
                      <span className="ml-auto font-mono font-bold whitespace-nowrap">{formatMoeda(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pie Saídas */}
        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-bold text-destructive">
              Composição das Saídas — {saidaTab === 'mes' ? MESES_NOMES[mesAte - 1] : 'Acumulado'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {pieSaidas.length === 0 ? (
              <p className="text-center text-muted-foreground text-xs py-6">Sem saídas no período</p>
            ) : (
              <div className="flex items-center gap-2">
                <div className="h-40 w-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieSaidas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={30}
                        label={renderPieLabel} labelLine={false} strokeWidth={1}>
                        {pieSaidas.map((_, i) => <Cell key={i} fill={PIE_COLORS_SAIDAS[i % PIE_COLORS_SAIDAS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatMoeda(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-0.5 min-w-0">
                  {pieSaidas.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-1.5 text-[10px]">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS_SAIDAS[i % PIE_COLORS_SAIDAS.length] }} />
                      <span className="truncate text-muted-foreground">{item.name}</span>
                      <span className="ml-auto font-mono font-bold whitespace-nowrap">{formatMoeda(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================= */}
      {/* 3. GRÁFICO — Entradas vs Saídas anual */}
      {/* ================================================================= */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs font-bold text-muted-foreground">Entradas vs Saídas — {anoFiltro}</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<StandardTooltip isCurrency />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar yAxisId="left" dataKey="Entradas" fill="hsl(142, 50%, 40%)" radius={[2, 2, 0, 0]} />
                <Bar yAxisId="left" dataKey="Saídas" fill="hsl(0, 60%, 50%)" radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="Saldo Acum." stroke="hsl(210, 70%, 50%)" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* 4. BLOCOS ANALÍTICOS — Centro de Custo + Top Fornecedores */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Bloco A — Ranking centros de custo */}
        <CentroCustoRanking ccMes={ind.ccMes} ccAcum={ind.ccAcum} totalSaidasMes={ind.saidasComRateio} totalSaidasAcum={ind.saidasAcum + (isGlobal ? 0 : ind.rateioAcumVal)} />

        {/* Bloco B — Maiores fornecedores / desembolsos */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              <Users className="h-3 w-3" /> Maiores Desembolsos — {MESES_NOMES[mesAte - 1]}
            </div>
            {ind.topFornecedores.length === 0 ? (
              <p className="text-center text-muted-foreground text-xs py-4">Sem saídas no mês</p>
            ) : (
              <div className="space-y-1">
                {ind.topFornecedores.map((item: { nome: string; valor: number }, idx: number) => {
                  const pct = ind.saidasComRateio > 0 ? (item.valor / ind.saidasComRateio) * 100 : 0;
                  return (
                    <div key={item.nome} className="relative">
                      <div className="absolute inset-y-0 left-0 bg-destructive/8 rounded-sm" style={{ width: `${Math.min(pct, 100)}%` }} />
                      <div className="relative flex items-center justify-between text-[11px] py-0.5 px-1">
                        <span className="truncate max-w-[55%] mr-1.5 font-medium">
                          <span className="text-muted-foreground mr-1">{idx + 1}.</span>
                          {item.nome}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-mono font-bold text-destructive">{formatMoeda(item.valor)}</span>
                          <span className="text-muted-foreground text-[9px] w-8 text-right">{formatNum(pct, 1)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub: Centro de Custo Ranking
// ---------------------------------------------------------------------------
function CentroCustoRanking({ ccMes, ccAcum, totalSaidasMes, totalSaidasAcum }: {
  ccMes: { nome: string; valor: number }[];
  ccAcum: { nome: string; valor: number }[];
  totalSaidasMes: number;
  totalSaidasAcum: number;
}) {
  const [tab, setTab] = useState<'mes' | 'acum'>('mes');
  const items = tab === 'mes' ? ccMes : ccAcum;
  const totalRef = tab === 'mes' ? totalSaidasMes : totalSaidasAcum;
  const top = items.slice(0, 12);

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <BarChart3 className="h-3 w-3" /> Saídas por Centro de Custo
          </div>
          <ToggleGroup value={tab} onChange={setTab} />
        </div>
        {top.length === 0 ? (
          <p className="text-center text-muted-foreground text-xs py-4">Sem dados</p>
        ) : (
          <div className="space-y-1">
            {top.map((item, idx) => {
              const pct = totalRef > 0 ? (item.valor / totalRef) * 100 : 0;
              const isRateio = item.nome === 'Rateio ADM';
              return (
                <div key={item.nome} className="relative">
                  <div className="absolute inset-y-0 left-0 rounded-sm" style={{
                    width: `${Math.min(pct, 100)}%`,
                    backgroundColor: isRateio ? 'hsla(40, 80%, 50%, 0.1)' : 'hsla(0, 60%, 50%, 0.08)',
                  }} />
                  <div className={`relative flex items-center justify-between text-[11px] py-0.5 px-1 ${isRateio ? 'text-amber-600' : ''}`}>
                    <span className="truncate max-w-[50%] mr-1.5 font-medium">
                      <span className="text-muted-foreground mr-1">{idx + 1}.</span>
                      {item.nome}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`font-mono font-bold ${isRateio ? 'text-amber-600' : 'text-destructive'}`}>{formatMoeda(item.valor)}</span>
                      <span className="text-muted-foreground text-[9px] w-8 text-right">{formatNum(pct, 1)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
