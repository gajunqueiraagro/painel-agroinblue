/**
 * Análises — container com sub-abas: Indicadores | Gráficos | DRE
 * Segue o padrão visual da tela Econômico (AnaliseEconomica).
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { MESES_NOMES, MESES_COLS } from '@/lib/calculos/labels';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { calcSaldoPorCategoriaLegado, calcPesoMedioPonderado, calcUA, calcUAHa, calcAreaProdutivaPecuaria } from '@/lib/calculos/zootecnicos';
import { calcArrobasSafe } from '@/lib/calculos/economicos';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { useFinanceiro, type FinanceiroLancamento, type RateioADM } from '@/hooks/useFinanceiro';
import { useArrobasGlobal } from '@/hooks/useArrobasGlobal';
import { usePastos } from '@/hooks/usePastos';
import { useFazenda } from '@/contexts/FazendaContext';
import { supabase } from '@/integrations/supabase/client';
import { KpiCard } from '@/components/indicadores/KpiCard';
import { GmdDetalheSheet } from '@/components/indicadores/GmdDetalheSheet';
import { DREAtividade } from '@/components/financeiro/AnaliseDRE';
import { calcCabMediasMensais } from '@/components/financeiro/AnaliseEconomica';
import {
  isConciliado as isConciliadoClass,
  isEntrada as isEntradaClass,
  isSaida as isSaidaClass,
  getEscopo,
  classificarSaidaFluxo,
  datePagtoAno,
  datePagtoMes,
} from '@/lib/financeiro/classificacao';
import { isDesembolsoProdutivo, isReceita as isReceitaMacro } from '@/lib/financeiro/classificacao';
import { TabId } from '@/components/BottomNav';
import {
  AlertTriangle, TrendingUp, FileBarChart, ChevronRight, Info, ClipboardCheck,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, Legend, ReferenceLine,
  ComposedChart,
} from 'recharts';
import { StandardTooltip } from '@/lib/chartConfig';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

type Bloco = 'indicadores' | 'dre';
type Vista = 'mes' | 'acumulado';
type Cenario = 'realizado' | 'previsto';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  filtroGlobal?: { ano: string; mes: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatMoedaCompacto(val: number): string {
  if (val >= 1_000_000) return `R$ ${formatNum(val / 1_000_000, 2)}M`;
  if (val >= 1_000) return `R$ ${formatNum(val / 1_000, 1)}mil`;
  return formatMoeda(val);
}

const TIPOS_SAIDA_DESFRUTE = ['abate', 'venda', 'consumo', 'transferencia_saida'];

const isConciliado = (l: FinanceiroLancamento) =>
  (l.status_transacao || '').toLowerCase() === 'realizado';

const datePagtoAnoMes = (l: FinanceiroLancamento): string | null => {
  if (!l.data_pagamento || l.data_pagamento.length < 7) return null;
  return l.data_pagamento.substring(0, 7);
};

// ---------------------------------------------------------------------------
// Financial helpers for Indicadores blocks
// ---------------------------------------------------------------------------

/** Receita Pecuária conciliada no período (acumulado jan→mesFiltro) */
function calcReceitaPecuaria(lancFin: FinanceiroLancamento[], ano: number, ateMes: number): number {
  let total = 0;
  for (const l of lancFin) {
    if (!isConciliado(l)) continue;
    const a = datePagtoAno(l);
    const m = datePagtoMes(l);
    if (a !== ano || m === null || m > ateMes) continue;
    if (!isReceitaMacro(l)) continue;
    if (!isEntradaClass(l)) continue;
    const escopo = getEscopo(l);
    if (escopo !== 'pec') continue;
    total += Math.abs(l.valor);
  }
  return total;
}

/** Desembolso Produtivo Pecuário conciliado no período */
function calcDesembolsoProdPec(lancFin: FinanceiroLancamento[], rateioADM: RateioADM[], ano: number, ateMes: number, isGlobal: boolean): number {
  let total = 0;
  for (const l of lancFin) {
    if (!isConciliado(l)) continue;
    const a = datePagtoAno(l);
    const m = datePagtoMes(l);
    if (a !== ano || m === null || m > ateMes) continue;
    if (!isSaidaClass(l)) continue;
    if (!isDesembolsoProdutivo(l)) continue;
    const escopo = getEscopo(l);
    if (escopo !== 'pec' && escopo !== 'outras') continue;
    total += Math.abs(l.valor);
  }
  // Add rateio ADM if per-fazenda
  if (!isGlobal) {
    for (const r of rateioADM) {
      const [rAnoStr, rMesStr] = r.anoMes.split('-');
      if (Number(rAnoStr) === ano && Number(rMesStr) <= ateMes) {
        total += r.valorRateado;
      }
    }
  }
  return total;
}

/** Saldo bancário disponível (último mês com dados) */
async function fetchSaldoBancario(fazendaIds: string[], anoMes: string): Promise<number | null> {
  if (fazendaIds.length === 0) return null;
  const { data } = await supabase
    .from('financeiro_saldos_bancarios')
    .select('saldo_final')
    .in('fazenda_id', fazendaIds)
    .eq('ano_mes', anoMes);
  if (!data || data.length === 0) return null;
  return data.reduce((s, r) => s + (Number(r.saldo_final) || 0), 0);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function VisaoZooHubTab({ lancamentos, saldosIniciais, onTabChange, filtroGlobal }: Props) {
  const { fazendaAtual, fazendas } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;
  const { lancamentos: lancFin, rateioADM, isGlobal } = useFinanceiro();

  const [bloco, setBloco] = useState<Bloco>('indicadores');
  const [cenario, setCenario] = useState<Cenario>('realizado');
  const [vista, setVista] = useState<Vista>('mes');

  const globalFazendaIds = useMemo(() => {
    if (fazendaId !== '__global__') return undefined;
    return fazendas.filter(f => f.tem_pecuaria !== false).map(f => f.id);
  }, [fazendaId, fazendas]);

  // Anos
  const anosDisp = useMemo(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { set.add(l.data.substring(0, 4)); } catch {} });
    saldosIniciais.forEach(s => set.add(String(s.ano)));
    return Array.from(set).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(filtroGlobal?.ano || String(new Date().getFullYear()));
  const anoNum = Number(anoFiltro);
  const mesDefault = filtroGlobal?.mes || (anoNum === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  const [mesFiltro, setMesFiltro] = useState(mesDefault);

  useEffect(() => {
    if (filtroGlobal?.ano) setAnoFiltro(filtroGlobal.ano);
    if (filtroGlobal?.mes) setMesFiltro(filtroGlobal.mes);
  }, [filtroGlobal]);

  const handleAnoChange = (val: string) => {
    setAnoFiltro(val);
    const n = Number(val);
    setMesFiltro(n === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  };

  // Filter lancamentos by cenario
  const lancsFiltrados = useMemo(() => {
    const statusMatch = cenario === 'realizado' ? 'realizado' : 'previsto';
    return lancamentos.filter(l => (l.statusOperacional || 'realizado') === statusMatch);
  }, [lancamentos, cenario]);

  const zoo = useIndicadoresZootecnicos(fazendaId, anoNum, mesFiltro, lancsFiltrados, saldosIniciais, pastos, categorias, globalFazendaIds);

  const mesLabel = MESES_COLS.find(m => m.key === String(mesFiltro).padStart(2, '0'))?.label || '';

  // Peso / kg/ha
  const pesoTotalKg = zoo.saldoFinalMes > 0 && zoo.pesoMedioRebanhoKg !== null
    ? zoo.saldoFinalMes * zoo.pesoMedioRebanhoKg : null;
  const kgHa = pesoTotalKg && zoo.areaProdutiva > 0 ? pesoTotalKg / zoo.areaProdutiva : null;

  // kg/ha comparisons
  const kgHaComps = useMemo(() => {
    const buildComp = (atual: number | null, ref: number | null) => {
      if (atual === null || ref === null || (atual === 0 && ref === 0)) return null;
      const diff = atual - ref;
      const pct = ref !== 0 ? (diff / Math.abs(ref)) * 100 : null;
      return { diferencaPercentual: pct, disponivel: true } as any;
    };
    const mesAntMes = mesFiltro > 1 ? mesFiltro - 1 : 12;
    const mesAntAno = mesFiltro > 1 ? anoNum : anoNum - 1;
    const sMapAnt = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, mesAntAno, mesAntMes);
    const cabAnt = Array.from(sMapAnt.values()).reduce((s, v) => s + v, 0);
    const pmAnt = calcPesoMedioPonderado(Array.from(sMapAnt.entries()).filter(([,q]) => q > 0).map(([cat, q]) => {
      const si = saldosIniciais.find(s => s.ano === mesAntAno && s.categoria === cat);
      return { quantidade: q, pesoKg: si?.pesoMedioKg ?? null };
    }));
    const kgHaAnt = cabAnt > 0 && pmAnt && zoo.areaProdutiva > 0 ? (cabAnt * pmAnt) / zoo.areaProdutiva : null;

    const sMapYoY = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoNum - 1, mesFiltro);
    const cabYoY = Array.from(sMapYoY.values()).reduce((s, v) => s + v, 0);
    const pmYoY = calcPesoMedioPonderado(Array.from(sMapYoY.entries()).filter(([,q]) => q > 0).map(([cat, q]) => {
      const si = saldosIniciais.find(s => s.ano === anoNum - 1 && s.categoria === cat);
      return { quantidade: q, pesoKg: si?.pesoMedioKg ?? null };
    }));
    const kgHaYoY = cabYoY > 0 && pmYoY && zoo.areaProdutiva > 0 ? (cabYoY * pmYoY) / zoo.areaProdutiva : null;
    return { mensal: buildComp(kgHa, kgHaAnt), anual: buildComp(kgHa, kgHaYoY) };
  }, [kgHa, saldosIniciais, lancamentos, anoNum, mesFiltro, zoo.areaProdutiva]);

  // Acumulado
  const acumulado = useMemo(() => {
    type Snap = { cab: number; pesoMedio: number | null; kgTotal: number; area: number; ua: number };
    const buildSnapshots = (ano: number, ateMes: number): Snap[] => {
      const snaps: Snap[] = [];
      for (let m = 1; m <= ateMes; m++) {
        const sMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, m);
        const cab = Array.from(sMap.values()).reduce((s, v) => s + v, 0);
        const itensPeso = Array.from(sMap.entries()).filter(([, q]) => q > 0).map(([cat, q]) => {
          const si = saldosIniciais.find(s => s.ano === ano && s.categoria === cat);
          return { quantidade: q, pesoKg: si?.pesoMedioKg ?? null };
        });
        const pm = calcPesoMedioPonderado(itensPeso);
        const kgTot = cab * (pm || 0);
        const area = calcAreaProdutivaPecuaria(pastos);
        const ua = calcUA(cab, pm);
        snaps.push({ cab, pesoMedio: pm, kgTotal: kgTot, area, ua });
      }
      return snaps;
    };
    const calcAvgs = (snaps: Snap[]) => {
      const n = snaps.length;
      if (n === 0) return { cabMedia: 0, pesoMedioFinal: null as number | null, areaMedia: 0, uaHaMedio: null as number | null, kgHaMedio: null as number | null };
      const cabMedia = snaps.reduce((s, v) => s + v.cab, 0) / n;
      const totalCabPeso = snaps.reduce((s, v) => s + (v.pesoMedio !== null ? v.cab : 0), 0);
      const totalPesoPond = snaps.reduce((s, v) => s + (v.pesoMedio !== null ? v.cab * v.pesoMedio! : 0), 0);
      const pesoMedioFinal = totalCabPeso > 0 ? totalPesoPond / totalCabPeso : null;
      const areaMedia = snaps.reduce((s, v) => s + v.area, 0) / n;
      const uaMedia = snaps.reduce((s, v) => s + v.ua, 0) / n;
      const kgTotalMedia = snaps.reduce((s, v) => s + v.kgTotal, 0) / n;
      const uaHaMedio = areaMedia > 0 ? uaMedia / areaMedia : null;
      const kgHaMedio = areaMedia > 0 ? kgTotalMedia / areaMedia : null;
      return { cabMedia, pesoMedioFinal, areaMedia, uaHaMedio, kgHaMedio };
    };
    const comp = (atual: number | null, ref: number | null) => {
      if (atual === null || ref === null || (atual === 0 && ref === 0)) return null;
      const diff = atual - ref;
      const pct = ref !== 0 ? (diff / Math.abs(ref)) * 100 : null;
      return { diferencaPercentual: pct, disponivel: true } as any;
    };
    const atual = calcAvgs(buildSnapshots(anoNum, mesFiltro));
    const mom = mesFiltro > 1 ? calcAvgs(buildSnapshots(anoNum, mesFiltro - 1)) : null;
    const yoy = calcAvgs(buildSnapshots(anoNum - 1, mesFiltro));
    return {
      ...atual,
      compCab: { mensal: comp(atual.cabMedia, mom?.cabMedia ?? null), anual: comp(atual.cabMedia, yoy.cabMedia) },
      compPeso: { mensal: comp(atual.pesoMedioFinal, mom?.pesoMedioFinal ?? null), anual: comp(atual.pesoMedioFinal, yoy.pesoMedioFinal) },
      compArea: { mensal: comp(atual.areaMedia, mom?.areaMedia ?? null), anual: comp(atual.areaMedia, yoy.areaMedia) },
      compUaHa: { mensal: comp(atual.uaHaMedio, mom?.uaHaMedio ?? null), anual: comp(atual.uaHaMedio, yoy.uaHaMedio) },
      compKgHa: { mensal: comp(atual.kgHaMedio, mom?.kgHaMedio ?? null), anual: comp(atual.kgHaMedio, yoy.kgHaMedio) },
    };
  }, [saldosIniciais, lancamentos, anoNum, mesFiltro, pastos]);

  // DRE data: lancamentos financeiros conciliados por mês
  const lancConciliadosPorMes = useMemo(() => {
    const map = new Map<string, FinanceiroLancamento[]>();
    for (const l of lancFin) {
      if (!isConciliado(l)) continue;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) continue;
      const mesKey = am.substring(5, 7);
      const arr = map.get(mesKey) || [];
      arr.push(l);
      map.set(mesKey, arr);
    }
    return map;
  }, [lancFin, anoFiltro]);

  // Arrobas for DRE
  const fazendaIdsReais = useMemo(
    () => fazendas.filter(f => f.id !== '__global__').map(f => f.id),
    [fazendas],
  );
  const arrobasGlobal = useArrobasGlobal(
    isGlobal, lancamentos, saldosIniciais, categorias,
    anoNum, mesFiltro, fazendaIdsReais,
  );
  const arrobasProduzidasAcum = isGlobal
    ? arrobasGlobal.somaArrobas
    : zoo.arrobasProduzidasAcumulado;

  // Meses options
  const mesesOpt = MESES_COLS.map((m, i) => ({ value: i + 1, label: m.label }));

  const blocos: { id: Bloco | 'graficos_nav'; label: string }[] = [
    { id: 'indicadores', label: '📊 Indicadores' },
    { id: 'graficos_nav', label: '📈 Gráficos' },
    { id: 'dre', label: '📋 DRE' },
  ];

  const isAdministrativa = fazendaAtual && fazendaAtual.id !== '__global__' && fazendaAtual.tem_pecuaria === false;

  if (isAdministrativa) {
    return (
      <div className="w-full animate-fade-in pb-20 px-4 sm:px-6 lg:px-8">
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-6 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
            <h2 className="text-lg font-bold text-foreground">Sem dados zootécnicos</h2>
            <p className="text-sm text-muted-foreground">
              A fazenda <strong>{fazendaAtual.nome}</strong> é classificada como administrativa e não possui dados de rebanho.
            </p>
            <p className="text-xs text-muted-foreground">
              Para visualizar indicadores zootécnicos, selecione uma fazenda com pecuária ativa.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full animate-fade-in pb-20">
      {/* Sticky filters */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 sm:px-6 lg:px-8 py-1.5 space-y-1">
        {/* Linha 1: Ano + Mês + Mês|Acumulado + Realizado|Previsto */}
        <div className="flex gap-1.5 items-center">
          <Select value={anoFiltro} onValueChange={handleAnoChange}>
            <SelectTrigger className="w-[68px] h-6 text-[11px] font-bold px-2"><SelectValue /></SelectTrigger>
            <SelectContent side="bottom">
              {anosDisp.map(a => <SelectItem key={a} value={a} className="text-[11px]">{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
            <SelectTrigger className="w-[80px] h-6 text-[11px] font-bold px-2"><SelectValue /></SelectTrigger>
            <SelectContent side="bottom">
              {mesesOpt.map(m => (
                <SelectItem key={m.value} value={String(m.value)} className="text-[11px]">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {bloco === 'indicadores' && (
            <div className="flex bg-muted rounded p-0.5">
              <button
                onClick={() => setVista('mes')}
                className={`px-2 text-[10px] font-bold py-0.5 rounded transition-colors ${vista === 'mes' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {mesLabel}
              </button>
              <button
                onClick={() => setVista('acumulado')}
                className={`px-2 text-[10px] font-bold py-0.5 rounded transition-colors ${vista === 'acumulado' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                Acumulado
              </button>
            </div>
          )}

          <div className="flex bg-muted rounded p-0.5 ml-auto">
            <button
              onClick={() => setCenario('realizado')}
              className={`px-2 text-[10px] font-bold py-0.5 rounded transition-colors ${cenario === 'realizado' ? 'bg-green-700 text-white shadow-sm' : 'text-muted-foreground'}`}
            >
              Realizado
            </button>
            <button
              onClick={() => setCenario('previsto')}
              className={`px-2 text-[10px] font-bold py-0.5 rounded transition-colors ${cenario === 'previsto' ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground'}`}
            >
              Previsto
            </button>
          </div>
        </div>

        {/* Linha 2: Blocos */}
        <div className="grid grid-cols-3 bg-muted rounded p-0.5">
          {blocos.map(b => (
            <button
              key={b.id}
              onClick={() => {
                if (b.id === 'graficos_nav') {
                  onTabChange('graficos_analise', { ano: anoFiltro, mes: mesFiltro });
                } else {
                  setBloco(b.id);
                }
              }}
              className={`py-1 px-1 rounded text-[10px] font-bold transition-colors ${
                b.id !== 'graficos_nav' && bloco === b.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-4">
        {bloco === 'indicadores' && (
          <IndicadoresContent
            zoo={zoo}
            vista={vista}
            mesLabel={mesLabel}
            mesFiltro={mesFiltro}
            anoFiltro={anoFiltro}
            kgHa={kgHa}
            kgHaComps={kgHaComps}
            acumulado={acumulado}
            lancFin={lancFin}
            rateioADM={rateioADM}
            isGlobal={isGlobal}
            arrobasProduzidasAcum={arrobasProduzidasAcum}
          />
        )}

        {bloco === 'dre' && (
          <DREAtividade
            lancConciliadosPorMes={lancConciliadosPorMes}
            lancamentosPecuarios={lancamentos}
            saldosIniciais={saldosIniciais}
            rateioADM={rateioADM}
            anoFiltro={anoFiltro}
            mesLimite={mesFiltro}
            isGlobal={isGlobal}
            fazendaId={fazendaId}
            categorias={categorias}
            pastos={pastos}
          />
        )}

        {/* Cards: Fechamento Executivo + Análise do Consultor */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          <button
            onClick={() => onTabChange('fechamento_executivo')}
            className="flex items-center gap-2.5 rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-4 min-h-[80px] transition-all hover:border-primary hover:shadow-md active:scale-[0.98] group"
          >
            <div className="rounded-full p-2 bg-primary/10 shrink-0">
              <FileBarChart className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground">Fechamento Executivo</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Relatório mensal com IA e PDF</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
          </button>

          <button
            onClick={() => onTabChange('analise_consultor')}
            className="flex items-center gap-2.5 rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-4 min-h-[80px] transition-all hover:border-primary hover:shadow-md active:scale-[0.98] group"
          >
            <div className="rounded-full p-2 bg-primary/10 shrink-0">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground">Análise do Consultor</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Área técnica para observações</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
          </button>

          <button
            onClick={() => onTabChange('preco_mercado')}
            className="flex items-center gap-2.5 rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-4 min-h-[80px] transition-all hover:border-primary hover:shadow-md active:scale-[0.98] group"
          >
            <div className="rounded-full p-2 bg-primary/10 shrink-0">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground">Preço de Mercado</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Preços base mensais do rebanho</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
          </button>

          <button
            onClick={() => onTabChange('painel_consultor_hub')}
            className="flex items-center gap-2.5 rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-4 min-h-[80px] transition-all hover:border-primary hover:shadow-md active:scale-[0.98] group"
          >
            <div className="rounded-full p-2 bg-primary/10 shrink-0">
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground">Painel do Consultor</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Auditoria, metas e cenário previsto</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Card wrapper
// ---------------------------------------------------------------------------
function SectionCard({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon: string; children: React.ReactNode }) {
  return (
    <Card className="h-full">
      <CardContent className="p-4 space-y-3 h-full">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <span>{icon}</span> {title}
          {subtitle && <span className="font-normal normal-case tracking-normal text-muted-foreground/70">({subtitle})</span>}
        </h3>
        {children}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Indicadores Content — 6 blocos temáticos
// ---------------------------------------------------------------------------
interface IndicadoresContentProps {
  zoo: ReturnType<typeof useIndicadoresZootecnicos>;
  vista: Vista;
  mesLabel: string;
  mesFiltro: number;
  anoFiltro: string;
  kgHa: number | null;
  kgHaComps: any;
  acumulado: any;
  lancFin: FinanceiroLancamento[];
  rateioADM: RateioADM[];
  isGlobal: boolean;
  arrobasProduzidasAcum: number | null;
}

function IndicadoresContent({ zoo, vista, mesLabel, mesFiltro, anoFiltro, kgHa, kgHaComps, acumulado, lancFin, rateioADM, isGlobal, arrobasProduzidasAcum }: IndicadoresContentProps) {
  const isMes = vista === 'mes';
  const periodoLabel = isMes ? mesLabel : `Média Jan → ${mesLabel}`;
  const anoNum = Number(anoFiltro);

  const { fazendas } = useFazenda();
  const allFazendaIds = useMemo(() => fazendas.filter(f => f.id !== '__global__').map(f => f.id), [fazendas]);

  // ── Financial KPIs ──
  const finProd = useMemo(() => {
    const buildComp = (atual: number | null, ref: number | null) => {
      if (atual === null || ref === null || (atual === 0 && ref === 0)) return null;
      if (ref === 0) return null;
      const pct = ((atual - ref) / Math.abs(ref)) * 100;
      return { diferencaPercentual: pct, disponivel: true } as any;
    };

    const arrobas = arrobasProduzidasAcum ?? 0;
    const receitaPec = calcReceitaPecuaria(lancFin, anoNum, mesFiltro);
    const desembolsoPec = calcDesembolsoProdPec(lancFin, rateioADM, anoNum, mesFiltro, isGlobal);

    const receitaPorArroba = arrobas > 0 ? receitaPec / arrobas : null;
    const custoPorArroba = arrobas > 0 ? desembolsoPec / arrobas : null;
    const margemPorArroba = receitaPorArroba !== null && custoPorArroba !== null
      ? receitaPorArroba - custoPorArroba : null;
    const resultadoOp = receitaPec - desembolsoPec;

    // vs mês anterior (acumulado até mesFiltro-1)
    const mesAnt = mesFiltro > 1 ? mesFiltro - 1 : null;
    const recMesAnt = mesAnt ? calcReceitaPecuaria(lancFin, anoNum, mesAnt) : null;
    const desMesAnt = mesAnt ? calcDesembolsoProdPec(lancFin, rateioADM, anoNum, mesAnt, isGlobal) : null;
    // For MoM we compare incremental (current month only)
    const recMesAtual = mesAnt ? receitaPec - (recMesAnt || 0) : receitaPec;
    const desMesAtual = mesAnt ? desembolsoPec - (desMesAnt || 0) : desembolsoPec;
    // vs ano anterior (same period)
    const recAnoAnt = calcReceitaPecuaria(lancFin, anoNum - 1, mesFiltro);
    const desAnoAnt = calcDesembolsoProdPec(lancFin, rateioADM, anoNum - 1, mesFiltro, isGlobal);
    const arrobasAnoAnt = zoo.historico?.find(h => h.ano === anoNum - 1)?.meses[mesFiltro - 1]?.arrobasProduzidasAcum ?? null;
    const recPorArrAnoAnt = arrobasAnoAnt && arrobasAnoAnt > 0 ? recAnoAnt / arrobasAnoAnt : null;
    const cusPorArrAnoAnt = arrobasAnoAnt && arrobasAnoAnt > 0 ? desAnoAnt / arrobasAnoAnt : null;
    const margemAnoAnt = recPorArrAnoAnt !== null && cusPorArrAnoAnt !== null ? recPorArrAnoAnt - cusPorArrAnoAnt : null;
    const resultadoOpAnoAnt = recAnoAnt - desAnoAnt;

    const temDados = lancFin.length > 0 && (receitaPec > 0 || desembolsoPec > 0);

    return {
      receitaPorArroba, custoPorArroba, margemPorArroba,
      desembolsoPec, resultadoOp, temDados,
      compRecArr: { mensal: null, anual: buildComp(receitaPorArroba, recPorArrAnoAnt) },
      compCusArr: { mensal: null, anual: buildComp(custoPorArroba, cusPorArrAnoAnt) },
      compMargArr: { mensal: null, anual: buildComp(margemPorArroba, margemAnoAnt) },
      compDesemp: { mensal: buildComp(desembolsoPec, desMesAnt), anual: buildComp(desembolsoPec, desAnoAnt) },
      compResult: { mensal: null, anual: buildComp(resultadoOp, resultadoOpAnoAnt) },
    };
  }, [lancFin, rateioADM, anoNum, mesFiltro, isGlobal, arrobasProduzidasAcum, zoo.historico]);

  // ── Saldo Bancário (Caixa Disponível) ──
  const [saldoBancario, setSaldoBancario] = useState<number | null>(null);
  const [saldoBancarioAnt, setSaldoBancarioAnt] = useState<number | null>(null);
  const [saldoBancarioAnoAnt, setSaldoBancarioAnoAnt] = useState<number | null>(null);

  useEffect(() => {
    const anoMes = `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}`;
    const mesAntNum = mesFiltro > 1 ? mesFiltro - 1 : 12;
    const anoAntMes = mesFiltro > 1 ? anoFiltro : String(anoNum - 1);
    const anoMesAnt = `${anoAntMes}-${String(mesAntNum).padStart(2, '0')}`;
    const anoMesYoY = `${anoNum - 1}-${String(mesFiltro).padStart(2, '0')}`;

    Promise.all([
      fetchSaldoBancario(allFazendaIds, anoMes),
      fetchSaldoBancario(allFazendaIds, anoMesAnt),
      fetchSaldoBancario(allFazendaIds, anoMesYoY),
    ]).then(([atual, ant, yoy]) => {
      setSaldoBancario(atual);
      setSaldoBancarioAnt(ant);
      setSaldoBancarioAnoAnt(yoy);
    });
  }, [allFazendaIds.join(','), anoFiltro, mesFiltro, anoNum]);

  const compCaixa = useMemo(() => {
    const buildComp = (atual: number | null, ref: number | null) => {
      if (atual === null || ref === null || (atual === 0 && ref === 0)) return null;
      if (ref === 0) return null;
      return { diferencaPercentual: ((atual - ref) / Math.abs(ref)) * 100, disponivel: true } as any;
    };
    return {
      mensal: buildComp(saldoBancario, saldoBancarioAnt),
      anual: buildComp(saldoBancario, saldoBancarioAnoAnt),
    };
  }, [saldoBancario, saldoBancarioAnt, saldoBancarioAnoAnt]);

  return (
    <>
      {/* ── Grid principal: 6 blocos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* 1. PRODUÇÃO */}
        <SectionCard title="Produção" subtitle="o que a fazenda entregou" icon="🐂">
          <div className="grid grid-cols-2 gap-2">
            <KpiCard label="Cabeças"
              valor={isMes ? formatNum(zoo.saldoFinalMes) : formatNum(acumulado.cabMedia, 0)}
              unidade="cab"
              compMensal={isMes ? zoo.comparacoes.saldoFinalMes.mensal : acumulado.compCab.mensal}
              compAnual={isMes ? zoo.comparacoes.saldoFinalMes.anual : acumulado.compCab.anual} />
            <KpiCard label="Peso Médio Final"
              valor={isMes
                ? (zoo.pesoMedioRebanhoKg !== null ? formatNum(zoo.pesoMedioRebanhoKg, 1) : '—')
                : (acumulado.pesoMedioFinal !== null ? formatNum(acumulado.pesoMedioFinal, 1) : '—')}
              unidade="kg"
              estimado={isMes ? zoo.qualidade.pesoMedioEstimado : false}
              compMensal={isMes ? zoo.comparacoes.pesoMedioRebanhoKg.mensal : acumulado.compPeso.mensal}
              compAnual={isMes ? zoo.comparacoes.pesoMedioRebanhoKg.anual : acumulado.compPeso.anual}
              semBase={isMes ? zoo.pesoMedioRebanhoKg === null : acumulado.pesoMedioFinal === null} />
            <KpiCard label="@ produzidas"
              valor={isMes
                ? (zoo.arrobasProduzidasMes !== null ? formatNum(zoo.arrobasProduzidasMes, 1) : '—')
                : (zoo.arrobasProduzidasAcumulado !== null ? formatNum(zoo.arrobasProduzidasAcumulado, 1) : '—')}
              unidade="@"
              compMensal={!isMes ? zoo.comparacoes.arrobasProduzidasAcumulado.mensal : null}
              compAnual={!isMes ? zoo.comparacoes.arrobasProduzidasAcumulado.anual : null}
              semBase={isMes ? zoo.arrobasProduzidasMes === null : zoo.arrobasProduzidasAcumulado === null} />
            <KpiCard label="Desfrute cab."
              valor={isMes
                ? (zoo.desfruteCabecasMes !== null ? formatNum(zoo.desfruteCabecasMes, 1) : '—')
                : (zoo.desfruteCabecasAcumulado !== null ? formatNum(zoo.desfruteCabecasAcumulado, 1) : '—')}
              unidade="%"
              compAnual={!isMes ? zoo.comparacoes.desfruteCabecasAcumulado.anual : null}
              semBase={isMes ? zoo.desfruteCabecasMes === null : zoo.desfruteCabecasAcumulado === null} />
            <KpiCard label="GMD"
              valor={isMes
                ? (zoo.gmdMes !== null ? formatNum(zoo.gmdMes, 3) : '—')
                : (zoo.gmdAcumulado !== null ? formatNum(zoo.gmdAcumulado, 3) : '—')}
              unidade="kg/dia"
              compMensal={isMes ? zoo.comparacoes.gmdMes.mensal : zoo.comparacoes.gmdAcumulado.mensal}
              compAnual={isMes ? zoo.comparacoes.gmdMes.anual : zoo.comparacoes.gmdAcumulado.anual} />
            <KpiCard label="Valor Rebanho"
              valor={zoo.valorRebanho !== null ? formatMoedaCompacto(zoo.valorRebanho) : '—'}
              compMensal={zoo.comparacoes.valorRebanho.mensal}
              compAnual={zoo.comparacoes.valorRebanho.anual}
              semBase={zoo.valorRebanho === null} />
          </div>
          {zoo.qualidade.gmdDisponivel && (
            <GmdDetalheSheet abertura={zoo.gmdAberturaMes} mesLabel={mesLabel} anoLabel={anoFiltro} />
          )}
        </SectionCard>

        {/* 2. EFICIÊNCIA */}
        <SectionCard title="Eficiência" subtitle="do uso da área" icon="📐">
          <div className="grid grid-cols-2 gap-2">
            <KpiCard label="Área Produtiva"
              valor={isMes ? formatNum(zoo.areaProdutiva, 1) : formatNum(acumulado.areaMedia, 1)}
              unidade="ha"
              estimado={isMes ? zoo.qualidade.areaProdutivaEstimativa : false}
              compMensal={!isMes ? acumulado.compArea.mensal : null}
              compAnual={!isMes ? acumulado.compArea.anual : null} />
            <KpiCard label="UA/ha"
              valor={isMes
                ? (zoo.uaHa !== null ? formatNum(zoo.uaHa, 2) : '—')
                : (acumulado.uaHaMedio !== null ? formatNum(acumulado.uaHaMedio, 2) : '—')}
              compMensal={isMes ? zoo.comparacoes.uaHa.mensal : acumulado.compUaHa.mensal}
              compAnual={isMes ? zoo.comparacoes.uaHa.anual : acumulado.compUaHa.anual}
              semBase={isMes ? zoo.uaHa === null : acumulado.uaHaMedio === null} />
            <KpiCard label="Kg/ha"
              valor={isMes
                ? (kgHa !== null ? formatNum(kgHa, 2) : '—')
                : (acumulado.kgHaMedio !== null ? formatNum(acumulado.kgHaMedio, 2) : '—')}
              compMensal={isMes ? kgHaComps.mensal : acumulado.compKgHa.mensal}
              compAnual={isMes ? kgHaComps.anual : acumulado.compKgHa.anual}
              semBase={isMes ? kgHa === null : acumulado.kgHaMedio === null} />
            <KpiCard label="@/ha"
              valor={isMes
                ? (zoo.arrobasProduzidasMes !== null && zoo.areaProdutiva > 0 ? formatNum(zoo.arrobasProduzidasMes / zoo.areaProdutiva, 2) : '—')
                : (zoo.arrobasProduzidasAcumulado !== null && zoo.areaProdutiva > 0 ? formatNum(zoo.arrobasProduzidasAcumulado / zoo.areaProdutiva, 2) : '—')}
              semBase={isMes
                ? (zoo.arrobasProduzidasMes === null || zoo.areaProdutiva <= 0)
                : (zoo.arrobasProduzidasAcumulado === null || zoo.areaProdutiva <= 0)} />
          </div>
        </SectionCard>

        {/* 3. FINANCEIRO PRODUTIVO */}
        <SectionCard title="Financeiro Produtivo" subtitle="receita × custo por @" icon="💰">
          {finProd.temDados ? (
            <div className="grid grid-cols-2 gap-2">
              <KpiCard label="Receita por @"
                valor={finProd.receitaPorArroba !== null ? formatMoeda(finProd.receitaPorArroba) : '—'}
                unidade="R$/@"
                compAnual={finProd.compRecArr.anual}
                semBase={finProd.receitaPorArroba === null} />
              <KpiCard label="Custo por @"
                valor={finProd.custoPorArroba !== null ? formatMoeda(finProd.custoPorArroba) : '—'}
                unidade="R$/@"
                compAnual={finProd.compCusArr.anual}
                semBase={finProd.custoPorArroba === null} />
              <KpiCard label="Margem por @"
                valor={finProd.margemPorArroba !== null ? formatMoeda(finProd.margemPorArroba) : '—'}
                unidade="R$/@"
                compAnual={finProd.compMargArr.anual}
                semBase={finProd.margemPorArroba === null} />
              <KpiCard label="Desembolso total"
                valor={formatMoedaCompacto(finProd.desembolsoPec)}
                compMensal={finProd.compDesemp.mensal}
                compAnual={finProd.compDesemp.anual} />
              <KpiCard label="Resultado operacional"
                valor={formatMoedaCompacto(finProd.resultadoOp)}
                compAnual={finProd.compResult.anual} />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Info className="h-4 w-4 shrink-0" />
              <span>Aguardando integração — importe lançamentos financeiros para ativar</span>
            </div>
          )}
        </SectionCard>

        {/* 4. ESTRUTURA FINANCEIRA */}
        <SectionCard title="Estrutura Financeira" subtitle="posição patrimonial" icon="🏦">
          <div className="grid grid-cols-2 gap-2">
            <KpiCard label="Caixa disponível"
              valor={saldoBancario !== null ? formatMoedaCompacto(saldoBancario) : '—'}
              compMensal={compCaixa.mensal}
              compAnual={compCaixa.anual}
              semBase={saldoBancario === null} />
            <KpiCard label="Valor Rebanho"
              valor={zoo.valorRebanho !== null ? formatMoedaCompacto(zoo.valorRebanho) : '—'}
              compMensal={zoo.comparacoes.valorRebanho.mensal}
              compAnual={zoo.comparacoes.valorRebanho.anual}
              semBase={zoo.valorRebanho === null} />
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Info className="h-3 w-3 shrink-0" />
              <span><strong>Endividamento</strong> — Aguardando integração da fórmula (Dívida total / Valor do rebanho)</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Info className="h-3 w-3 shrink-0" />
              <span><strong>Dívida / Rebanho</strong> — Aguardando integração da fórmula</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Info className="h-3 w-3 shrink-0" />
              <span><strong>Curto vs Longo prazo</strong> — Aguardando integração da fórmula (composição da dívida por prazo)</span>
            </div>
          </div>
        </SectionCard>

        {/* 5. EVOLUÇÃO */}
        <SectionCard title="Evolução" icon="📊">
          <div className="grid grid-cols-2 gap-2">
            <KpiCard label="Desfrute @"
              valor={isMes
                ? (zoo.desfruteArrobasMes !== null ? formatNum(zoo.desfruteArrobasMes, 1) : '—')
                : (zoo.desfruteArrobasAcumulado !== null ? formatNum(zoo.desfruteArrobasAcumulado, 1) : '—')}
              unidade="%"
              compAnual={!isMes ? zoo.comparacoes.desfruteArrobasAcumulado.anual : null}
              semBase={isMes ? zoo.desfruteArrobasMes === null : zoo.desfruteArrobasAcumulado === null} />
            <KpiCard label="@ desfrutadas"
              valor={isMes ? formatNum(zoo.arrobasSaidasMes, 1) : formatNum(zoo.arrobasSaidasAcumuladoAno, 1)}
              unidade="@"
              compMensal={isMes ? zoo.comparacoes.arrobasSaidasMes.mensal : zoo.comparacoes.arrobasDesfrutadasAcum.mensal}
              compAnual={isMes ? zoo.comparacoes.arrobasSaidasMes.anual : zoo.comparacoes.arrobasDesfrutadasAcum.anual} />
            <KpiCard label="vs Meta" valor="—" semBase />
            <KpiCard label="Classificação" valor="—" semBase />
          </div>
        </SectionCard>

        {/* 6. ALERTAS */}
        <SectionCard title="Alertas" icon="🚨">
          <div className="space-y-2">
            {zoo.qualidade.pesoMedioEstimado && (
              <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Peso médio estimado — realize fechamento de pastos para maior precisão</span>
              </div>
            )}
            {zoo.areaProdutiva <= 0 && (
              <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Área produtiva não cadastrada — indicadores de lotação indisponíveis</span>
              </div>
            )}
            {zoo.saldoFinalMes === 0 && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Sem rebanho registrado para o período selecionado</span>
              </div>
            )}
            {!zoo.qualidade.pesoMedioEstimado && zoo.areaProdutiva > 0 && zoo.saldoFinalMes > 0 && (
              <p className="text-[10px] text-muted-foreground italic text-center py-2">Nenhum alerta no momento ✓</p>
            )}
          </div>
        </SectionCard>

      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Gráficos Content (Estoque + Produção combined)
// ---------------------------------------------------------------------------
interface GraficosContentProps {
  zoo: ReturnType<typeof useIndicadoresZootecnicos>;
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  anoNum: number;
  mesFiltro: number;
  pastos: any[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))'];
const DOT_STYLE = { r: 2, strokeWidth: 1.5, fill: 'hsl(var(--background))' };
const ACTIVE_DOT_STYLE = { r: 4, strokeWidth: 2, fill: 'hsl(var(--primary))' };

function GraficosContent({ zoo, lancamentos, saldosIniciais, anoNum, mesFiltro, pastos }: GraficosContentProps) {
  const chartData = useMemo(() => {
    const buildYear = (ano: number) => {
      const data: any[] = [];
      for (let m = 1; m <= 12; m++) {
        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, m);
        const cab = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);
        const itens = Array.from(saldoMap.entries()).filter(([, q]) => q > 0).map(([cat, q]) => {
          const si = saldosIniciais.find(s => s.ano === ano && s.categoria === cat);
          return { quantidade: q, pesoKg: si?.pesoMedioKg ?? null };
        });
        const pm = calcPesoMedioPonderado(itens);
        const areaPec = calcAreaProdutivaPecuaria(pastos);
        const kgha = pm && areaPec > 0 ? (cab * pm) / areaPec : null;
        const mesStr = `${ano}-${String(m).padStart(2, '0')}`;
        const saidasMes = lancamentos.filter(l => l.data.startsWith(mesStr) && TIPOS_SAIDA_DESFRUTE.includes(l.tipo));
        const arrobasSaidas = saidasMes.reduce((s, l) => s + calcArrobasSafe(l), 0);
        data.push({ mes: MESES_NOMES[m - 1], cabecas: cab, kgHa: kgha ? Math.round(kgha) : null, arrobasSaidas: Math.round(arrobasSaidas) });
      }
      return data;
    };
    const atual = buildYear(anoNum);
    const anterior = buildYear(anoNum - 1);
    return MESES_NOMES.map((mes, i) => {
      const isFuturo = i + 1 > mesFiltro;
      return {
        mes,
        [`cab_${anoNum}`]: isFuturo ? null : (atual[i]?.cabecas ?? 0),
        [`cab_${anoNum - 1}`]: anterior[i]?.cabecas ?? 0,
        [`kgHa_${anoNum}`]: isFuturo ? null : atual[i]?.kgHa,
        [`kgHa_${anoNum - 1}`]: anterior[i]?.kgHa,
      };
    });
  }, [lancamentos, saldosIniciais, anoNum, mesFiltro, pastos]);

  const prodData = useMemo(() => {
    if (!zoo.historico || zoo.historico.length < 2) return [];
    const anoAtual = zoo.historico.find(h => h.ano === anoNum);
    const anoAnt = zoo.historico.find(h => h.ano === anoNum - 1);
    if (!anoAtual) return [];
    const mensal = (meses: typeof anoAtual.meses, i: number, field: 'arrobasProduzidasAcum' | 'gmdAcumulado') => {
      const cur = meses[i]?.[field];
      if (cur === null || cur === undefined) return null;
      if (field === 'gmdAcumulado') return cur;
      if (i === 0) return cur;
      const prev = meses[i - 1]?.[field];
      if (prev === null || prev === undefined) return cur;
      return cur - prev;
    };
    return MESES_NOMES.map((mes, i) => {
      const m = anoAtual.meses[i];
      const mAnt = anoAnt?.meses[i];
      const isFuturo = i + 1 > mesFiltro;
      return {
        mes,
        [`arrProdMes_${anoNum}`]: isFuturo ? null : mensal(anoAtual.meses, i, 'arrobasProduzidasAcum'),
        [`arrProdMes_${anoNum - 1}`]: anoAnt ? mensal(anoAnt.meses, i, 'arrobasProduzidasAcum') : null,
        [`arrProd_${anoNum}`]: isFuturo ? null : (m?.arrobasProduzidasAcum ? Math.round(m.arrobasProduzidasAcum) : null),
        [`arrProd_${anoNum - 1}`]: mAnt?.arrobasProduzidasAcum ? Math.round(mAnt.arrobasProduzidasAcum) : null,
        [`gmdMes_${anoNum}`]: isFuturo ? null : mensal(anoAtual.meses, i, 'gmdAcumulado'),
        [`gmdMes_${anoNum - 1}`]: anoAnt ? mensal(anoAnt.meses, i, 'gmdAcumulado') : null,
        [`desfCab_${anoNum}`]: isFuturo ? null : (m?.desfruteCabAcum ?? null),
        [`desfCab_${anoNum - 1}`]: mAnt?.desfruteCabAcum ?? null,
      };
    });
  }, [zoo.historico, anoNum, mesFiltro]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Rebanho Final do mês (cab)" subtitle="Quantidade de cabeças no final do mês" data={chartData}
        keys={[`cab_${anoNum}`, `cab_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
        type="area" mesFiltro={mesFiltro} />
      <ChartCard title="Lotação: Kg vivo por ha (Kg/ha)" subtitle="Quantidade de Kg sobre cada hectare produtivo, no final do mês" data={chartData}
        keys={[`kgHa_${anoNum}`, `kgHa_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
        type="line" mesFiltro={mesFiltro} />
      {prodData.length > 0 && (
        <>
          <ChartCard title="Arrobas Produzidas por mês" subtitle="Quantidade de arrobas produzidas por mês" data={prodData}
            keys={[`arrProdMes_${anoNum}`, `arrProdMes_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="bar" decimals={0} mesFiltro={mesFiltro} />
          <ChartCard title="Arrobas Produzidas acumulado" subtitle="Quantidade de arrobas produzidas no acumulado do ano" data={prodData}
            keys={[`arrProd_${anoNum}`, `arrProd_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="line" decimals={0} mesFiltro={mesFiltro} />
          <ChartCard title="GMD médio (kg/dia)" subtitle="Kg médio ganho por cabeça, por dia" data={prodData}
            keys={[`gmdMes_${anoNum}`, `gmdMes_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="bar" decimals={3} mesFiltro={mesFiltro}
            averageKey={`gmdMes_${anoNum}`} averageLabel="kg/dia" />
          <ChartCard title="Desfrute Cab. acumulado (%)" subtitle="% de animais desfrutados (vendidos) em cabeças, em comparação com o saldo do início do ano" data={prodData}
            keys={[`desfCab_${anoNum}`, `desfCab_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="line" decimals={1} mesFiltro={mesFiltro} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic Chart Card
// ---------------------------------------------------------------------------
interface ChartCardProps {
  title: string;
  subtitle?: string;
  data: any[];
  keys: string[];
  labels: string[];
  type: 'area' | 'line' | 'bar';
  decimals?: number;
  mesFiltro: number;
  averageKey?: string;
  averageLabel?: string;
}

function ChartCard({ title, subtitle, data, keys, labels, type, decimals = 0, mesFiltro, averageKey, averageLabel }: ChartCardProps) {
  const comparisons = useMemo(() => {
    if (!data || data.length === 0 || keys.length < 2) return { mom: null, yoy: null };
    const mesIdx = mesFiltro - 1;
    const mesAntIdx = mesFiltro > 1 ? mesFiltro - 2 : null;
    const valAtual = data[mesIdx]?.[keys[0]];
    const valMesAnt = mesAntIdx !== null ? data[mesAntIdx]?.[keys[0]] : null;
    const valAnoAnt = data[mesIdx]?.[keys[1]];
    const calcPct = (cur: any, ref: any) => {
      if (cur === null || cur === undefined || ref === null || ref === undefined) return null;
      if (typeof cur !== 'number' || typeof ref !== 'number') return null;
      if (cur === 0 && ref === 0) return null;
      if (ref === 0) return null;
      return ((cur - ref) / Math.abs(ref)) * 100;
    };
    return { mom: calcPct(valAtual, valMesAnt), yoy: calcPct(valAtual, valAnoAnt) };
  }, [data, keys, mesFiltro]);

  const avgValue = useMemo(() => {
    if (!averageKey || !data || data.length === 0) return null;
    const vals: number[] = [];
    for (let i = 0; i < mesFiltro && i < data.length; i++) {
      const v = data[i]?.[averageKey];
      if (typeof v === 'number') vals.push(v);
    }
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [data, averageKey, mesFiltro]);

  const renderComp = (pct: number | null, label: string) => {
    if (pct === null) return null;
    const isPositive = pct >= 0;
    return (
      <span className={`flex items-center gap-0.5 text-[10px] font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
        <TrendingUp className={`h-3 w-3 ${!isPositive ? 'rotate-180' : ''}`} />
        {isPositive ? '+' : ''}{pct.toFixed(1)}% {label}
      </span>
    );
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-0.5">{title}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground/70">{subtitle}</p>}
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
            {avgValue !== null && (
              <span className="text-sm font-bold text-foreground">
                {avgValue.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
                {averageLabel && <span className="text-[10px] font-normal text-muted-foreground ml-1">{averageLabel}</span>}
              </span>
            )}
            {renderComp(comparisons.mom, 'vs mês')}
            {renderComp(comparisons.yoy, 'vs ano ant.')}
          </div>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            {type === 'bar' ? (
              avgValue !== null ? (
                <ComposedChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<StandardTooltip formatter={(v) => typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: decimals }) : '—'} />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {keys.map((k, i) => (
                    <Bar key={k} dataKey={k} name={labels[i]} fill={COLORS[i]} fillOpacity={i === 0 ? 1 : 0.4} radius={[3, 3, 0, 0]} />
                  ))}
                  <ReferenceLine y={avgValue} stroke="hsl(var(--primary))" strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value: `Média: ${avgValue.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`, position: 'insideTopRight', fontSize: 9, fill: 'hsl(var(--primary))' }} />
                </ComposedChart>
              ) : (
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<StandardTooltip formatter={(v) => typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: decimals }) : '—'} />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {keys.map((k, i) => (
                    <Bar key={k} dataKey={k} name={labels[i]} fill={COLORS[i]} fillOpacity={i === 0 ? 1 : 0.4} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              )
            ) : type === 'area' ? (
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip content={<StandardTooltip formatter={(v) => typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: decimals }) : '—'} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {keys.map((k, i) => (
                  <Area key={k} type="monotone" dataKey={k} name={labels[i]}
                    stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={i === 0 ? 0.3 : 0.1}
                    strokeWidth={i === 0 ? 2.5 : 1.5} strokeDasharray={i > 0 ? '4 2' : undefined}
                    dot={DOT_STYLE} activeDot={ACTIVE_DOT_STYLE} />
                ))}
              </AreaChart>
            ) : (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip content={<StandardTooltip formatter={(v) => typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: decimals }) : '—'} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {keys.map((k, i) => (
                  <Line key={k} type="monotone" dataKey={k} name={labels[i]}
                    stroke={COLORS[i]} strokeWidth={i === 0 ? 2.5 : 1.5}
                    strokeDasharray={i > 0 ? '4 2' : undefined}
                    dot={DOT_STYLE} activeDot={ACTIVE_DOT_STYLE} connectNulls />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
