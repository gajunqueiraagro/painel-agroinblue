// Dashboard financeiro — versão executiva compacta.
// Base: somente lançamentos realizados, data_pagamento, tipo_operacao 1-Entradas / 2-Saídas.
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingDown, TrendingUp, AlertTriangle, BarChart3, Users, Wallet } from 'lucide-react';
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

// Pie chart colors — muted, system-consistent
const PIE_COLORS_ENTRADAS = ['hsl(142, 50%, 38%)', 'hsl(142, 35%, 50%)', 'hsl(160, 40%, 42%)', 'hsl(80, 35%, 48%)', 'hsl(190, 35%, 45%)', 'hsl(120, 25%, 55%)'];
const PIE_COLORS_SAIDAS = ['hsl(0, 50%, 48%)', 'hsl(15, 45%, 48%)', 'hsl(30, 42%, 48%)', 'hsl(340, 40%, 48%)', 'hsl(280, 32%, 48%)', 'hsl(210, 38%, 48%)', 'hsl(45, 42%, 48%)'];

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
          className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition-colors ${value === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground bg-muted'}`}>
          {t === 'mes' ? 'Mês' : 'Acum'}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom pie label
// ---------------------------------------------------------------------------
function renderPieLabel({ name, percent }: any) {
  if (percent < 0.04) return null;
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
  const [entradaTab, setEntradaTab] = useState<'mes' | 'acum'>('mes');
  const [saidaTab, setSaidaTab] = useState<'mes' | 'acum'>('mes');
  const [fornTab, setFornTab] = useState<'mes' | 'acum'>('mes');

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
    const filtroAcum = (l: FinanceiroLancamento) => {
      if (!isRealizado(l)) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    };

    const entradasAcum = lancamentos.filter(l => filtroAcum(l) && isEntrada(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
    const saidasAcum = lancamentos.filter(l => filtroAcum(l) && isSaida(l)).reduce((s, l) => s + Math.abs(l.valor), 0);

    // Decomposição entradas
    const entradaDecomp = { mes: new Map<string, number>(), acum: new Map<string, number>() };
    for (const cat of CATEGORIAS_ENTRADA) { entradaDecomp.mes.set(cat, 0); entradaDecomp.acum.set(cat, 0); }
    for (const l of entradasListMes) {
      const cat = classificarEntradaCentral(l);
      entradaDecomp.mes.set(cat, (entradaDecomp.mes.get(cat) || 0) + Math.abs(l.valor));
    }
    lancamentos.filter(l => filtroAcum(l) && isEntrada(l)).forEach(l => {
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
    lancamentos.filter(l => filtroAcum(l) && isSaida(l)).forEach(l => {
      const cat = classificarSaidaCentral(l);
      saidaDecomp.acum.set(cat, (saidaDecomp.acum.get(cat) || 0) + Math.abs(l.valor));
    });

    // Centro de custo ranking
    const ccMesMap = new Map<string, number>();
    const ccAcumMap = new Map<string, number>();
    for (const l of saidasListMes) {
      const cc = (l.centro_custo || l.grupo_custo || 'Não classificado').trim();
      ccMesMap.set(cc, (ccMesMap.get(cc) || 0) + Math.abs(l.valor));
    }
    lancamentos.filter(l => filtroAcum(l) && isSaida(l)).forEach(l => {
      const cc = (l.centro_custo || l.grupo_custo || 'Não classificado').trim();
      ccAcumMap.set(cc, (ccAcumMap.get(cc) || 0) + Math.abs(l.valor));
    });
    if (!isGlobal && totalRateioMes > 0) ccMesMap.set('Rateio ADM', totalRateioMes);
    if (!isGlobal && rateioAcumVal > 0) ccAcumMap.set('Rateio ADM', rateioAcumVal);
    const ccMes = Array.from(ccMesMap.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
    const ccAcum = Array.from(ccAcumMap.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);

    // Top fornecedores (mês + acum)
    const buildFornRanking = (list: FinanceiroLancamento[]) => {
      const map = new Map<string, number>();
      for (const l of list) {
        const forn = (l.fornecedor || l.descricao || 'Sem fornecedor').trim();
        map.set(forn, (map.get(forn) || 0) + Math.abs(l.valor));
      }
      return Array.from(map.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8);
    };
    const topFornecedoresMes = buildFornRanking(saidasListMes);
    const topFornecedoresAcum = buildFornRanking(lancamentos.filter(l => filtroAcum(l) && isSaida(l)));

    // Custo de Produção por Rebanho — desembolso produtivo vs rebanho
    const desembolsoMes = saidasListMes.filter(l => isDesembolsoProdutivoCentral(l)).reduce((s, l) => s + Math.abs(l.valor), 0) + totalRateioMes;
    const desembolsoAcum = lancamentos.filter(l => filtroAcum(l) && isSaida(l) && isDesembolsoProdutivoCentral(l)).reduce((s, l) => s + Math.abs(l.valor), 0) + (isGlobal ? 0 : rateioAcumVal);

    return {
      totalEntradas, totalSaidas, saidasComRateio,
      entradasAcum, saidasAcum,
      rateioMes: totalRateioMes, rateioAcumVal,
      entradaDecomp, saidaDecomp,
      categoriasEntrada: [...CATEGORIAS_ENTRADA],
      categoriasSaida: [...CATEGORIAS_SAIDA],
      ccMes, ccAcum,
      topFornecedoresMes, topFornecedoresAcum,
      desembolsoMes, desembolsoAcum,
    };
  }, [entradasListMes, saidasListMes, filtradosMes, lancamentos, anoFiltro, mesLimite, totalRateioMes, rateioADM, isGlobal, rateioAcumVal]);

  // =========================================================================
  // Custo por Rebanho — rebanho médio do período (from lancamentosPecuarios + saldosIniciais)
  // =========================================================================
  const custoRebanho = useMemo(() => {
    // Calculate rebanho from saldos iniciais + lancamentos pecuários
    // Saldo inicial for the year
    const siAno = saldosIniciais.filter(si => si.ano === Number(anoFiltro));
    const totalSI = siAno.reduce((s, si) => s + (si.quantidade || 0), 0);

    // Count entradas/saídas pecuárias by month to estimate rebanho médio
    const lancPecAno = lancamentosPecuarios.filter(l => {
      const d = l.data || '';
      return d.startsWith(anoFiltro) && Number(d.substring(5, 7)) <= mesLimite;
    });

    // Simple approach: saldo inicial + (entradas - saídas) for each month
    // Rebanho médio ≈ average of start and current
    const entradas = lancPecAno.filter(l => l.tipo === 'compra' || l.tipo === 'nascimento' || l.tipo === 'transferencia_entrada').reduce((s, l) => s + (l.quantidade || 0), 0);
    const saidas = lancPecAno.filter(l => l.tipo === 'venda' || l.tipo === 'morte' || l.tipo === 'abate' || l.tipo === 'transferencia_saida').reduce((s, l) => s + (l.quantidade || 0), 0);
    const rebanhoFinal = totalSI + entradas - saidas;
    const rebanhoMedio = totalSI > 0 ? Math.round((totalSI + rebanhoFinal) / 2) : rebanhoFinal;

    const custoCabMes = rebanhoMedio > 0 ? ind.desembolsoMes / rebanhoMedio : 0;
    const custoCabAcum = rebanhoMedio > 0 ? ind.desembolsoAcum / rebanhoMedio : 0;

    return { rebanhoMedio, rebanhoFinal, totalSI, custoCabMes, custoCabAcum, desembolsoMes: ind.desembolsoMes, desembolsoAcum: ind.desembolsoAcum };
  }, [saldosIniciais, lancamentosPecuarios, anoFiltro, mesLimite, ind.desembolsoMes, ind.desembolsoAcum]);

  // =========================================================================
  // CHART DATA — Jan → mesAte only (no future months)
  // =========================================================================
  const chartData = useMemo(() => {
    const monthMap = new Map<string, { entradas: number; saidas: number }>();
    for (let m = 1; m <= mesLimite; m++) monthMap.set(String(m).padStart(2, '0'), { entradas: 0, saidas: 0 });
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
      return { mes: (MESES_NOMES[Number(mes) - 1] || mes).substring(0, 3), Entradas: v.entradas, Saídas: v.saidas, 'Saldo Acum.': saldoAcum };
    });
  }, [lancamentos, anoFiltro, mesLimite]);

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
      <div className="text-center py-8 text-muted-foreground">
        <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="font-bold text-sm">Nenhum dado financeiro</p>
        <p className="text-xs">Importe um Excel na aba Importação.</p>
      </div>
    );
  }

  const totalEntradasDisplay = entradaTab === 'mes' ? ind.totalEntradas : ind.entradasAcum;
  const totalSaidasDisplay = saidaTab === 'mes' ? ind.saidasComRateio : (ind.saidasAcum + (isGlobal ? 0 : ind.rateioAcumVal));
  const saldoLiquido = totalEntradasDisplay - totalSaidasDisplay;

  const topFornecedores = fornTab === 'mes' ? ind.topFornecedoresMes : ind.topFornecedoresAcum;
  const totalRefForn = fornTab === 'mes' ? ind.saidasComRateio : (ind.saidasAcum + (isGlobal ? 0 : ind.rateioAcumVal));

  return (
    <div className="space-y-2">
      {/* Warning banners only */}
      {!isGlobal && fazendasSemArea && fazendasSemArea.length > 0 && (
        <div className="flex items-start gap-2 text-[10px] bg-destructive/5 border border-destructive/30 rounded px-2 py-1.5">
          <AlertTriangle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            <span className="font-bold text-destructive">Rateio ADM incompleto:</span>{' '}
            {fazendasSemArea.join(', ')} sem rebanho no período.
          </span>
        </div>
      )}

      {/* ================================================================= */}
      {/* 1. CARDS EXECUTIVOS — Entradas / Saídas / Saldo */}
      {/* ================================================================= */}
      <div className="grid grid-cols-3 gap-1.5">
        {/* Entradas */}
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(142, 50%, 38%)' }}>
          <CardContent className="p-2">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: 'hsl(142, 50%, 35%)' }}>
                <TrendingUp className="h-3 w-3" /> Entradas
              </div>
              <ToggleGroup value={entradaTab} onChange={setEntradaTab} />
            </div>
            <p className="text-xl font-black tabular-nums leading-tight" style={{ color: 'hsl(142, 50%, 35%)' }}>
              {formatMoeda(totalEntradasDisplay)}
            </p>
            <div className="space-y-0 mt-1">
              {ind.categoriasEntrada.map((cat: string) => {
                const val = (entradaTab === 'mes' ? ind.entradaDecomp.mes : ind.entradaDecomp.acum).get(cat) || 0;
                if (val === 0) return null;
                return (
                  <div key={cat} className="flex justify-between text-[9px] leading-tight cursor-pointer hover:bg-muted/50 rounded px-0.5"
                    onClick={() => onDrillDown?.({ categoria: cat, tipo: 'entrada', periodo: entradaTab })}>
                    <span className="text-muted-foreground truncate mr-1">{cat}</span>
                    <span className="font-mono font-semibold italic whitespace-nowrap" style={{ color: 'hsl(142, 40%, 40%)' }}>{formatMoeda(val)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Saídas */}
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(0, 55%, 48%)' }}>
          <CardContent className="p-2">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1 text-[10px] font-bold text-destructive">
                <TrendingDown className="h-3 w-3" /> Saídas
              </div>
              <ToggleGroup value={saidaTab} onChange={setSaidaTab} />
            </div>
            <p className="text-xl font-black text-destructive tabular-nums leading-tight">
              {formatMoeda(totalSaidasDisplay)}
            </p>
            <div className="space-y-0 mt-1">
              {ind.categoriasSaida.map((cat: string) => {
                const val = (saidaTab === 'mes' ? ind.saidaDecomp.mes : ind.saidaDecomp.acum).get(cat) || 0;
                if (val === 0) return null;
                return (
                  <div key={cat} className="flex justify-between text-[9px] leading-tight cursor-pointer hover:bg-muted/50 rounded px-0.5"
                    onClick={() => onDrillDown?.({ categoria: cat, tipo: 'saida', periodo: saidaTab })}>
                    <span className="text-muted-foreground truncate mr-1">{cat}</span>
                    <span className="font-mono font-semibold italic whitespace-nowrap text-destructive">{formatMoeda(val)}</span>
                  </div>
                );
              })}
              {!isGlobal && (saidaTab === 'mes' ? ind.rateioMes : ind.rateioAcumVal) > 0 && (
                <div className="border-t pt-0.5 mt-0.5">
                  <div className="flex justify-between text-[9px] leading-tight">
                    <span style={{ color: 'hsl(40, 70%, 45%)' }}>Rateio ADM</span>
                    <span className="font-mono font-bold italic" style={{ color: 'hsl(40, 70%, 45%)' }}>{formatMoeda(saidaTab === 'mes' ? ind.rateioMes : ind.rateioAcumVal)}</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Saldo líquido */}
        <Card className="border-l-4" style={{ borderLeftColor: saldoLiquido >= 0 ? 'hsl(210, 60%, 48%)' : 'hsl(30, 70%, 48%)' }}>
          <CardContent className="p-2">
            <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground mb-0.5">
              <BarChart3 className="h-3 w-3" /> Saldo Líquido
            </div>
            <p className={`text-xl font-black tabular-nums leading-tight ${saldoLiquido >= 0 ? 'text-primary' : ''}`} style={saldoLiquido < 0 ? { color: 'hsl(30, 70%, 48%)' } : undefined}>
              {formatMoeda(saldoLiquido)}
            </p>
            <div className="mt-1 space-y-0 text-[9px] leading-tight">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entradas</span>
                <span className="font-mono font-semibold italic" style={{ color: 'hsl(142, 40%, 40%)' }}>{formatMoeda(totalEntradasDisplay)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saídas</span>
                <span className="font-mono font-semibold italic text-destructive">{formatMoeda(totalSaidasDisplay)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================= */}
      {/* 2. PIE CHARTS + GRÁFICO BARRAS — 3 colunas */}
      {/* ================================================================= */}
      <div className="grid grid-cols-3 gap-1.5">
        {/* Pie Entradas */}
        <Card>
          <CardContent className="p-2">
            <div className="text-[9px] font-bold mb-1" style={{ color: 'hsl(142, 50%, 35%)' }}>
              Entradas — {entradaTab === 'mes' ? MESES_NOMES[mesAte - 1]?.substring(0, 3) : 'Acum'}
            </div>
            {pieEntradas.length === 0 ? (
              <p className="text-center text-muted-foreground text-[9px] py-4">Sem entradas</p>
            ) : (
              <>
                <div className="h-28 mx-auto" style={{ maxWidth: 130 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieEntradas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} innerRadius={22}
                        label={renderPieLabel} labelLine={false} strokeWidth={1} style={{ fontSize: 8 }}>
                        {pieEntradas.map((_, i) => <Cell key={i} fill={PIE_COLORS_ENTRADAS[i % PIE_COLORS_ENTRADAS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatMoeda(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-0 mt-1">
                  {pieEntradas.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-1 text-[8px] leading-tight">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS_ENTRADAS[i % PIE_COLORS_ENTRADAS.length] }} />
                      <span className="truncate text-muted-foreground flex-1">{item.name}</span>
                      <span className="font-mono font-bold italic whitespace-nowrap">{formatMoeda(item.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pie Saídas */}
        <Card>
          <CardContent className="p-2">
            <div className="text-[9px] font-bold text-destructive mb-1">
              Saídas — {saidaTab === 'mes' ? MESES_NOMES[mesAte - 1]?.substring(0, 3) : 'Acum'}
            </div>
            {pieSaidas.length === 0 ? (
              <p className="text-center text-muted-foreground text-[9px] py-4">Sem saídas</p>
            ) : (
              <>
                <div className="h-28 mx-auto" style={{ maxWidth: 130 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieSaidas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} innerRadius={22}
                        label={renderPieLabel} labelLine={false} strokeWidth={1} style={{ fontSize: 8 }}>
                        {pieSaidas.map((_, i) => <Cell key={i} fill={PIE_COLORS_SAIDAS[i % PIE_COLORS_SAIDAS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatMoeda(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-0 mt-1">
                  {pieSaidas.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-1 text-[8px] leading-tight">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS_SAIDAS[i % PIE_COLORS_SAIDAS.length] }} />
                      <span className="truncate text-muted-foreground flex-1">{item.name}</span>
                      <span className="font-mono font-bold italic whitespace-nowrap">{formatMoeda(item.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Gráfico Entradas vs Saídas — compacto */}
        <Card>
          <CardContent className="p-2">
            <div className="text-[9px] font-bold text-muted-foreground mb-1">
              Entradas vs Saídas — {anoFiltro}
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} barGap={1} margin={{ top: 2, right: 4, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 7, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} width={35} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 7, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} width={30} />
                  <Tooltip content={<StandardTooltip isCurrency />} />
                  <Legend wrapperStyle={{ fontSize: 8, paddingTop: 0 }} />
                  <Bar yAxisId="left" dataKey="Entradas" fill="hsl(142, 45%, 40%)" radius={[2, 2, 0, 0]} barSize={12} />
                  <Bar yAxisId="left" dataKey="Saídas" fill="hsl(0, 45%, 50%)" radius={[2, 2, 0, 0]} barSize={12} />
                  <Line yAxisId="right" type="monotone" dataKey="Saldo Acum." stroke="hsl(210, 50%, 55%)" strokeWidth={1.5} dot={{ r: 1.5 }} strokeOpacity={0.7} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================= */}
      {/* 3. BLOCOS ANALÍTICOS — 3 colunas: CC + Custo/Rebanho + Fornecedores */}
      {/* ================================================================= */}
      <div className="grid grid-cols-3 gap-1.5">
        {/* Bloco A — Ranking centros de custo */}
        <CentroCustoRanking ccMes={ind.ccMes} ccAcum={ind.ccAcum} totalSaidasMes={ind.saidasComRateio} totalSaidasAcum={ind.saidasAcum + (isGlobal ? 0 : ind.rateioAcumVal)} />

        {/* Bloco B — Custo de Produção por Rebanho */}
        <Card>
          <CardContent className="p-2">
            <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              <Wallet className="h-3 w-3" /> Custo / Rebanho
            </div>
            {custoRebanho.rebanhoMedio > 0 ? (
              <div className="space-y-1">
                <div className="bg-muted/30 rounded p-1.5">
                  <div className="text-[8px] text-muted-foreground">Rebanho Médio</div>
                  <div className="text-sm font-black tabular-nums">{formatNum(custoRebanho.rebanhoMedio, 0)} <span className="text-[8px] font-normal text-muted-foreground">cab</span></div>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <div className="bg-muted/20 rounded p-1">
                    <div className="text-[7px] text-muted-foreground uppercase">Custo Mês</div>
                    <div className="text-[10px] font-bold tabular-nums italic text-destructive">{formatMoeda(custoRebanho.desembolsoMes)}</div>
                    <div className="text-[8px] font-mono text-muted-foreground italic">{formatMoeda(custoRebanho.custoCabMes)}/cab</div>
                  </div>
                  <div className="bg-muted/20 rounded p-1">
                    <div className="text-[7px] text-muted-foreground uppercase">Custo Acum</div>
                    <div className="text-[10px] font-bold tabular-nums italic text-destructive">{formatMoeda(custoRebanho.desembolsoAcum)}</div>
                    <div className="text-[8px] font-mono text-muted-foreground italic">{formatMoeda(custoRebanho.custoCabAcum)}/cab</div>
                  </div>
                </div>
                <div className="border-t pt-1 mt-1">
                  <div className="flex justify-between text-[8px]">
                    <span className="text-muted-foreground">Saldo Inicial</span>
                    <span className="font-mono font-semibold">{formatNum(custoRebanho.totalSI, 0)} cab</span>
                  </div>
                  <div className="flex justify-between text-[8px]">
                    <span className="text-muted-foreground">Rebanho Atual</span>
                    <span className="font-mono font-semibold">{formatNum(custoRebanho.rebanhoFinal, 0)} cab</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground text-[9px] py-4">Sem dados de rebanho</p>
            )}
          </CardContent>
        </Card>

        {/* Bloco C — Maiores Desembolsos (com toggle Mês/Acum) */}
        <Card>
          <CardContent className="p-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                <Users className="h-3 w-3" /> Maiores Desembolsos
              </div>
              <ToggleGroup value={fornTab} onChange={setFornTab} />
            </div>
            {topFornecedores.length === 0 ? (
              <p className="text-center text-muted-foreground text-[9px] py-4">Sem saídas</p>
            ) : (
              <div className="space-y-0.5">
                {topFornecedores.map((item: { nome: string; valor: number }, idx: number) => {
                  const pct = totalRefForn > 0 ? (item.valor / totalRefForn) * 100 : 0;
                  return (
                    <div key={item.nome} className="relative">
                      <div className="absolute inset-y-0 left-0 bg-destructive/6 rounded-sm" style={{ width: `${Math.min(pct, 100)}%` }} />
                      <div className="relative flex items-center justify-between text-[9px] leading-tight py-px px-0.5">
                        <span className="truncate max-w-[50%] mr-1">
                          <span className="text-muted-foreground mr-0.5">{idx + 1}.</span>
                          <span className="font-medium">{item.nome}</span>
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-mono font-bold italic text-destructive">{formatMoeda(item.valor)}</span>
                          <span className="text-muted-foreground text-[7px] w-6 text-right">{formatNum(pct, 0)}%</span>
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
  const top = items.slice(0, 10);

  return (
    <Card>
      <CardContent className="p-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <BarChart3 className="h-3 w-3" /> Saídas por Centro de Custo
          </div>
          <ToggleGroup value={tab} onChange={setTab} />
        </div>
        {top.length === 0 ? (
          <p className="text-center text-muted-foreground text-[9px] py-4">Sem dados</p>
        ) : (
          <div className="space-y-0.5">
            {top.map((item, idx) => {
              const pct = totalRef > 0 ? (item.valor / totalRef) * 100 : 0;
              const isRateio = item.nome === 'Rateio ADM';
              return (
                <div key={item.nome} className="relative">
                  <div className="absolute inset-y-0 left-0 rounded-sm" style={{
                    width: `${Math.min(pct, 100)}%`,
                    backgroundColor: isRateio ? 'hsla(40, 70%, 48%, 0.08)' : 'hsla(0, 50%, 48%, 0.06)',
                  }} />
                  <div className={`relative flex items-center justify-between text-[9px] leading-tight py-px px-0.5`} style={isRateio ? { color: 'hsl(40, 70%, 45%)' } : undefined}>
                    <span className="truncate max-w-[45%] mr-1">
                      <span className="text-muted-foreground mr-0.5">{idx + 1}.</span>
                      <span className="font-medium">{item.nome}</span>
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`font-mono font-bold italic ${isRateio ? '' : 'text-destructive'}`}>{formatMoeda(item.valor)}</span>
                      <span className="text-muted-foreground text-[7px] w-6 text-right">{formatNum(pct, 0)}%</span>
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
