// Dashboard financeiro — versão executiva compacta.
// Base: somente lançamentos realizados, data_pagamento, tipo_operacao 1-Entradas / 2-Saídas.
import { useMemo, useState } from 'react';
import type { FluxoMensal } from '@/hooks/useFluxoCaixa';
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
  isDesembolsoProdutivo as isDesembolsoProdutivoCentral,
} from '@/lib/financeiro/classificacao';

// ---------------------------------------------------------------------------
// Agrupamento por macro_custo oficial (plano de contas)
// ---------------------------------------------------------------------------
const MACROS_ENTRADA = ['Receita Operacional', 'Entrada Financeira'];
const MACROS_SAIDA = ['Custeio Produção', 'Investimento na Fazenda', 'Investimento em Bovinos', 'Deduções de Receitas', 'Saída Financeira', 'Dividendos'];

const NOMES_OFICIAIS = new Set([
  ...MACROS_ENTRADA,
  ...MACROS_SAIDA,
]);

/** Retorna macro_custo se é nome oficial, senão 'Não classificado' */
function normMacroDisplay(macro: string | null | undefined): string {
  const trimmed = (macro || '').trim();
  if (NOMES_OFICIAIS.has(trimmed)) return trimmed;
  return 'Não classificado';
}
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

const MACROS_EXCLUIDOS_DRE = new Set(['Transferências', 'Entre Contas']);
/** Lançamento elegível para DRE (exclui transferências e não classificados) */
const isDRE = (l: FinanceiroLancamento) =>
  l.macro_custo != null && !MACROS_EXCLUIDOS_DRE.has(l.macro_custo.trim());

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
  modo?: 'mes' | 'acum';
  saldoInicialAno?: number;
  mesesFluxo?: FluxoMensal[];
  onDrillDown?: (payload: DrillDownPayload) => void;
  onMacroDrillDown?: (macro: string) => void;
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
function renderPieLabel() { return null; }

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
  onMacroDrillDown,
  modo,
  saldoInicialAno = 0,
  mesesFluxo = [],
}: Props) {
  const resolvedModo = modo ?? 'mes';
  const [activeEntrada, setActiveEntrada] = useState<number | null>(null);
  const [activeSaida, setActiveSaida] = useState<number | null>(null);

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

  const entradasListMes = useMemo(() => filtradosMes.filter(l => isEntrada(l) && isDRE(l)), [filtradosMes]);
  const saidasListMes = useMemo(() => filtradosMes.filter(l => isSaida(l) && isDRE(l)), [filtradosMes]);

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

    const entradasAcum = lancamentos.filter(l => filtroAcum(l) && isEntrada(l) && isDRE(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
    const saidasAcum = lancamentos.filter(l => filtroAcum(l) && isSaida(l) && isDRE(l)).reduce((s, l) => s + Math.abs(l.valor), 0);

    // Decomposição entradas — agrupamento por macro_custo oficial
    const entradaDecomp = { mes: new Map<string, number>(), acum: new Map<string, number>() };
    for (const cat of MACROS_ENTRADA) { entradaDecomp.mes.set(cat, 0); entradaDecomp.acum.set(cat, 0); }
    for (const l of entradasListMes) {
      const cat = normMacroDisplay(l.macro_custo);
      entradaDecomp.mes.set(cat, (entradaDecomp.mes.get(cat) || 0) + Math.abs(l.valor));
    }
    lancamentos.filter(l => filtroAcum(l) && isEntrada(l) && isDRE(l)).forEach(l => {
      const cat = normMacroDisplay(l.macro_custo);
      entradaDecomp.acum.set(cat, (entradaDecomp.acum.get(cat) || 0) + Math.abs(l.valor));
    });

    // Decomposição saídas — agrupamento por macro_custo oficial
    const saidaDecomp = { mes: new Map<string, number>(), acum: new Map<string, number>() };
    for (const cat of MACROS_SAIDA) { saidaDecomp.mes.set(cat, 0); saidaDecomp.acum.set(cat, 0); }
    for (const l of saidasListMes) {
      const cat = normMacroDisplay(l.macro_custo);
      saidaDecomp.mes.set(cat, (saidaDecomp.mes.get(cat) || 0) + Math.abs(l.valor));
    }
    lancamentos.filter(l => filtroAcum(l) && isSaida(l) && isDRE(l)).forEach(l => {
      const cat = normMacroDisplay(l.macro_custo);
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
      categoriasEntrada: [...MACROS_ENTRADA],
      categoriasSaida: [...MACROS_SAIDA],
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
    const limite = mesLimite && mesLimite > 0 ? mesLimite : 12;
    for (let m = 1; m <= limite; m++) monthMap.set(String(m).padStart(2, '0'), { entradas: 0, saidas: 0 });
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
    // Saldo acumulado via mesesFluxo (fonte oficial)
    return Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => {
      const mesNum = Number(mes);
      const fluxoMes = mesesFluxo?.find(m => m.mes === mesNum);
      const saldoAcum = fluxoMes?.saldoAcumulado ?? NaN;
      return {
        mes: (MESES_NOMES[mesNum - 1] || mes).substring(0, 3),
        Entradas: v.entradas,
        Saídas: v.saidas,
        'Saldo Acum.': saldoAcum
      };
    });
  }, [lancamentos, anoFiltro, mesLimite, mesesFluxo]);

  // PIE DATA
  const pieEntradas = useMemo(() => {
    const map = resolvedModo === 'mes' ? ind.entradaDecomp.mes : ind.entradaDecomp.acum;
    return Array.from(map.entries()).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [ind, resolvedModo]);

  const pieSaidas = useMemo(() => {
    const map = resolvedModo === 'mes' ? ind.saidaDecomp.mes : ind.saidaDecomp.acum;
    return Array.from(map.entries()).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [ind, resolvedModo]);

  // Mapas de cor por nome — garante que bullet do plano de contas use a mesma cor do slice da pizza.
  const entradaColorByName = useMemo(() => {
    const m = new Map<string, string>();
    pieEntradas.forEach((item, i) => m.set(item.name, PIE_COLORS_ENTRADAS[i % PIE_COLORS_ENTRADAS.length]));
    return m;
  }, [pieEntradas]);
  const saidaColorByName = useMemo(() => {
    const m = new Map<string, string>();
    pieSaidas.forEach((item, i) => m.set(item.name, PIE_COLORS_SAIDAS[i % PIE_COLORS_SAIDAS.length]));
    return m;
  }, [pieSaidas]);

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

  const totalEntradasDisplay = resolvedModo === 'mes' ? ind.totalEntradas : ind.entradasAcum;
  const totalSaidasDisplay = resolvedModo === 'mes' ? ind.saidasComRateio : (ind.saidasAcum + (isGlobal ? 0 : ind.rateioAcumVal));
  // Saldo Líquido — fonte oficial do Fluxo de Caixa
  const saldoLiquido = (() => {
    if (resolvedModo === 'mes' && mesAte && mesesFluxo.length > 0) {
      const mesData = mesesFluxo.find(m => m.mes === mesAte);
      if (mesData != null) return mesData.saldoFinal;
    }
    if (resolvedModo === 'acum' || mesAte === 0) {
      return saldoInicialAno
        + (ind.entradasAcum ?? 0)
        - ((ind.saidasAcum ?? 0) + (isGlobal ? 0 : (ind.rateioAcumVal ?? 0)));
    }
    return NaN;
  })();

  const topFornecedores = resolvedModo === 'mes' ? ind.topFornecedoresMes : ind.topFornecedoresAcum;
  const totalRefForn = resolvedModo === 'mes' ? ind.saidasComRateio : (ind.saidasAcum + (isGlobal ? 0 : ind.rateioAcumVal));

  return (
    <div className="w-full min-w-0 space-y-2">
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
      {/* LINHA 1 — Cards executivos (Entradas / Saídas / Saldo) — alinhamento por items-stretch */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 items-stretch mb-2 min-w-0 [&>*]:min-w-0">
        {/* Entradas */}
        <Card className="flex flex-col border-l-4" style={{ borderLeftColor: 'hsl(142, 50%, 38%)' }}>
          <CardContent className="p-2 flex flex-col flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: 'hsl(142, 50%, 35%)' }}>
                <TrendingUp className="h-3 w-3" /> Entradas
              </div>
            </div>
            <p className="text-xl font-black tabular-nums leading-tight" style={{ color: 'hsl(142, 50%, 35%)' }}>
              {formatMoeda(totalEntradasDisplay)}
            </p>
            <div className="space-y-0 mt-1">
              {ind.categoriasEntrada.map((cat: string) => {
                const val = (resolvedModo === 'mes' ? ind.entradaDecomp.mes : ind.entradaDecomp.acum).get(cat) || 0;
                if (val === 0) return null;
                const bulletColor = entradaColorByName.get(cat) ?? 'hsl(142, 35%, 50%)';
                return (
                  <div key={cat} className="flex items-center justify-between text-[9px] leading-tight cursor-pointer hover:bg-muted/50 rounded px-0.5"
                    onClick={() => onMacroDrillDown?.(cat)}>
                    <span className="flex items-center min-w-0 mr-1">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 flex-shrink-0" style={{ background: bulletColor }} />
                      <span className="text-muted-foreground truncate">{cat}</span>
                    </span>
                    <span className="font-mono font-semibold italic whitespace-nowrap" style={{ color: 'hsl(142, 40%, 40%)' }}>{formatMoeda(val)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Saídas */}
        <Card className="flex flex-col border-l-4" style={{ borderLeftColor: 'hsl(0, 55%, 48%)' }}>
          <CardContent className="p-2 flex flex-col flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1 text-[10px] font-bold text-destructive">
                <TrendingDown className="h-3 w-3" /> Saídas
              </div>
            </div>
            <p className="text-xl font-black text-destructive tabular-nums leading-tight">
              {formatMoeda(totalSaidasDisplay)}
            </p>
            <div className="space-y-0 mt-1">
              {ind.categoriasSaida.map((cat: string) => {
                const val = (resolvedModo === 'mes' ? ind.saidaDecomp.mes : ind.saidaDecomp.acum).get(cat) || 0;
                if (val === 0) return null;
                const bulletColor = saidaColorByName.get(cat) ?? 'hsl(0, 35%, 55%)';
                return (
                  <div key={cat} className="flex items-center justify-between text-[9px] leading-tight cursor-pointer hover:bg-muted/50 rounded px-0.5"
                    onClick={() => onMacroDrillDown?.(cat)}>
                    <span className="flex items-center min-w-0 mr-1">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 flex-shrink-0" style={{ background: bulletColor }} />
                      <span className="text-muted-foreground truncate">{cat}</span>
                    </span>
                    <span className="font-mono font-semibold italic whitespace-nowrap text-destructive">{formatMoeda(val)}</span>
                  </div>
                );
              })}
              {!isGlobal && (resolvedModo === 'mes' ? ind.rateioMes : ind.rateioAcumVal) > 0 && (
                <div className="border-t pt-0.5 mt-0.5">
                  <div className="flex justify-between text-[9px] leading-tight">
                    <span style={{ color: 'hsl(40, 70%, 45%)' }}>Rateio ADM</span>
                    <span className="font-mono font-bold italic" style={{ color: 'hsl(40, 70%, 45%)' }}>{formatMoeda(resolvedModo === 'mes' ? ind.rateioMes : ind.rateioAcumVal)}</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Saldo líquido */}
        <div className="relative">
          <div className={isGlobal ? '' : 'blur-sm pointer-events-none opacity-60'}>
        <Card className="flex flex-col border-l-4" style={{ borderLeftColor: saldoLiquido >= 0 ? 'hsl(210, 60%, 48%)' : 'hsl(30, 70%, 48%)' }}>
          <CardContent className="p-2 flex flex-col flex-1">
            <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground mb-0.5">
              <BarChart3 className="h-3 w-3" /> Saldo Líquido
            </div>
            <p className={`text-xl font-black tabular-nums leading-tight ${saldoLiquido >= 0 ? 'text-primary' : ''}`} style={saldoLiquido < 0 ? { color: 'hsl(30, 70%, 48%)' } : undefined}>
              {formatMoeda(saldoLiquido)}
            </p>
            <div className="mt-1 space-y-0 text-[9px] leading-tight">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo Inicial</span>
                <span className="font-mono font-semibold italic text-muted-foreground">{
                  (() => {
                    const v = resolvedModo === 'mes' && mesAte
                      ? (mesesFluxo.find(m => m.mes === mesAte)?.saldoInicial ?? NaN)
                      : saldoInicialAno;
                    return isNaN(v) ? '—' : formatMoeda(v);
                  })()
                }</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entradas</span>
                <span className="font-mono font-semibold italic" style={{ color: 'hsl(142, 40%, 40%)' }}>{formatMoeda(totalEntradasDisplay)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saídas</span>
                <span className="font-mono font-semibold italic text-destructive">{formatMoeda(totalSaidasDisplay)}</span>
              </div>
              <div className="flex justify-between border-t border-border/40 pt-0.5 mt-0.5">
                <span className="font-semibold">Saldo Final</span>
                <span className={`font-mono font-black italic ${
                  isNaN(saldoLiquido) ? 'text-muted-foreground' :
                  saldoLiquido >= 0 ? 'text-primary' : 'text-destructive'
                }`}>{isNaN(saldoLiquido) ? '—' : formatMoeda(saldoLiquido)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
          </div>
          {!isGlobal && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 rounded">
              <span className="text-xs text-muted-foreground text-center px-3">
                Fluxo disponível apenas no modo global.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* LINHA 2 — Pizzas (sem título/legenda) + gráfico Entradas vs Saídas */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 items-stretch min-w-0 [&>*]:min-w-0">
        {/* Pie Entradas — centralizada, maior, sem título/legenda */}
        <Card className="flex flex-col">
          <CardContent className="flex items-center justify-center p-3 flex-1">
            {pieEntradas.length === 0 ? (
              <p className="text-center text-muted-foreground text-[9px] py-4">Sem entradas</p>
            ) : (
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieEntradas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={35}
                      label={false} labelLine={false} strokeWidth={1} style={{ fontSize: 8 }}
                      onMouseEnter={(_, index) => setActiveEntrada(index)}
                      onMouseLeave={() => setActiveEntrada(null)}>
                      {pieEntradas.map((_, i) => <Cell key={i} fill={PIE_COLORS_ENTRADAS[i % PIE_COLORS_ENTRADAS.length]} />)}
                    </Pie>

                    {activeEntrada !== null && pieEntradas[activeEntrada] && (
                      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: 18, fontWeight: 700, fill: 'var(--color-text-primary)' }}>
                        {`${((pieEntradas[activeEntrada].value / pieEntradas.reduce((s,p)=>s+p.value,0))*100).toFixed(0)}%`}
                      </text>
                    )}
                    {activeEntrada !== null && pieEntradas[activeEntrada] && (
                      <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: 8, fill: 'var(--color-text-secondary)' }}>
                        {pieEntradas[activeEntrada].name}
                      </text>
                    )}
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pie Saídas — centralizada, maior, sem título/legenda */}
        <Card className="flex flex-col">
          <CardContent className="flex items-center justify-center p-3 flex-1">
            {pieSaidas.length === 0 ? (
              <p className="text-center text-muted-foreground text-[9px] py-4">Sem saídas</p>
            ) : (
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieSaidas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={35}
                      label={false} labelLine={false} strokeWidth={1} style={{ fontSize: 8 }}
                      onMouseEnter={(_, index) => setActiveSaida(index)}
                      onMouseLeave={() => setActiveSaida(null)}>
                      {pieSaidas.map((_, i) => <Cell key={i} fill={PIE_COLORS_SAIDAS[i % PIE_COLORS_SAIDAS.length]} />)}
                    </Pie>

                    {activeSaida !== null && pieSaidas[activeSaida] && (
                      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: 18, fontWeight: 700, fill: 'var(--color-text-primary)' }}>
                        {`${((pieSaidas[activeSaida].value / pieSaidas.reduce((s,p)=>s+p.value,0))*100).toFixed(0)}%`}
                      </text>
                    )}
                    {activeSaida !== null && pieSaidas[activeSaida] && (
                      <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: 8, fill: 'var(--color-text-secondary)' }}>
                        {pieSaidas[activeSaida].name}
                      </text>
                    )}
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico Entradas vs Saídas — preservado */}
        <div className="relative">
          <div className={isGlobal ? '' : 'blur-sm pointer-events-none opacity-60'}>
        <Card className="flex flex-col">
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
          {!isGlobal && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 rounded">
              <span className="text-xs text-muted-foreground text-center px-3">
                Fluxo disponível apenas no modo global.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* 3. BLOCOS ANALÍTICOS — 3 colunas: CC + Custo/Rebanho + Fornecedores */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5 min-w-0 [&>*]:min-w-0">
        {/* Bloco A — Ranking centros de custo */}
        <CentroCustoRanking ccMes={ind.ccMes} ccAcum={ind.ccAcum} totalSaidasMes={ind.saidasComRateio} totalSaidasAcum={ind.saidasAcum + (isGlobal ? 0 : ind.rateioAcumVal)} modo={resolvedModo} />


        {/* Bloco C — Maiores Desembolsos (com toggle Mês/Acum) */}
        <Card>
          <CardContent className="p-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                <Users className="h-3 w-3" /> Maiores Desembolsos
              </div>
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
function CentroCustoRanking({ ccMes, ccAcum, totalSaidasMes, totalSaidasAcum, modo }: {
  ccMes: { nome: string; valor: number }[];
  ccAcum: { nome: string; valor: number }[];
  totalSaidasMes: number;
  totalSaidasAcum: number;
  modo: 'mes' | 'acum';
}) {
  const items = modo === 'mes' ? ccMes : ccAcum;
  const totalRef = modo === 'mes' ? totalSaidasMes : totalSaidasAcum;
  const top = items.slice(0, 10);

  return (
    <Card>
      <CardContent className="p-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <BarChart3 className="h-3 w-3" /> Saídas por Centro de Custo
          </div>
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
