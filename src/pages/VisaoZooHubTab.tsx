/**
 * Análises — container com sub-abas: Indicadores | Gráficos | DRE
 * Segue o padrão visual da tela Econômico (AnaliseEconomica).
 */
import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { MESES_NOMES, MESES_COLS } from '@/lib/calculos/labels';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { calcSaldoPorCategoriaLegado, calcPesoMedioPonderado, calcUA, calcUAHa, calcAreaProdutivaPecuaria } from '@/lib/calculos/zootecnicos';
import { calcArrobasSafe } from '@/lib/calculos/economicos';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { useFinanceiro, type FinanceiroLancamento } from '@/hooks/useFinanceiro';
import { useArrobasGlobal } from '@/hooks/useArrobasGlobal';
import { usePastos } from '@/hooks/usePastos';
import { useFazenda } from '@/contexts/FazendaContext';
import { KpiCard } from '@/components/indicadores/KpiCard';
import { GmdDetalheSheet } from '@/components/indicadores/GmdDetalheSheet';
import { DREAtividade } from '@/components/financeiro/AnaliseDRE';
import { calcCabMediasMensais } from '@/components/financeiro/AnaliseEconomica';
import { TabId } from '@/components/BottomNav';
import {
  AlertTriangle, TrendingUp, FileBarChart, ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, Legend, ReferenceLine,
  ComposedChart,
} from 'recharts';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

type Bloco = 'indicadores' | 'graficos' | 'dre';
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
  (l.status_transacao || '').toLowerCase() === 'conciliado';

const datePagtoAnoMes = (l: FinanceiroLancamento): string | null => {
  if (!l.data_pagamento || l.data_pagamento.length < 7) return null;
  return l.data_pagamento.substring(0, 7);
};

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
    const statusMatch = cenario === 'realizado' ? 'conciliado' : 'previsto';
    return lancamentos.filter(l => (l.statusOperacional || 'conciliado') === statusMatch);
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

  const blocos: { id: Bloco; label: string }[] = [
    { id: 'indicadores', label: '📊 Indicadores' },
    { id: 'graficos', label: '📈 Gráficos' },
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
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 pt-2 pb-2 space-y-1.5">
        {/* Linha 1: Ano + Mês + Realizado|Previsto */}
        <div className="flex gap-1.5 items-center">
          <Select value={anoFiltro} onValueChange={handleAnoChange}>
            <SelectTrigger className="w-20 h-7 text-xs font-bold"><SelectValue /></SelectTrigger>
            <SelectContent side="bottom">
              {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
            <SelectTrigger className="w-24 h-7 text-xs font-bold"><SelectValue /></SelectTrigger>
            <SelectContent side="bottom">
              {mesesOpt.map(m => (
                <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex bg-muted rounded-md p-0.5 ml-auto">
            <button
              onClick={() => setCenario('realizado')}
              className={`px-2.5 text-[11px] font-bold py-1 rounded transition-colors ${cenario === 'realizado' ? 'bg-green-700 text-white shadow-sm' : 'text-muted-foreground'}`}
            >
              Realizado
            </button>
            <button
              onClick={() => setCenario('previsto')}
              className={`px-2.5 text-[11px] font-bold py-1 rounded transition-colors ${cenario === 'previsto' ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground'}`}
            >
              Previsto
            </button>
          </div>
        </div>

        {/* Linha 2: Mês | Acumulado (compact) */}
        {bloco === 'indicadores' && (
          <div className="flex bg-muted rounded-md p-0.5 max-w-[200px]">
            <button
              onClick={() => setVista('mes')}
              className={`flex-1 text-[11px] font-bold py-1 rounded transition-colors ${vista === 'mes' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              {mesLabel}
            </button>
            <button
              onClick={() => setVista('acumulado')}
              className={`flex-1 text-[11px] font-bold py-1 rounded transition-colors ${vista === 'acumulado' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              Acumulado
            </button>
          </div>
        )}

        {/* Linha 3: Blocos */}
        <div className="grid grid-cols-3 bg-muted rounded-md p-0.5">
          {blocos.map(b => (
            <button
              key={b.id}
              onClick={() => setBloco(b.id)}
              className={`py-1.5 px-1 rounded text-[10px] sm:text-xs font-bold transition-colors ${
                bloco === b.id
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
      <div className="p-4 space-y-4">
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
          />
        )}

        {bloco === 'graficos' && (
          <GraficosContent
            zoo={zoo}
            lancamentos={lancamentos}
            saldosIniciais={saldosIniciais}
            anoNum={anoNum}
            mesFiltro={mesFiltro}
            pastos={pastos}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => onTabChange('fechamento_executivo')}
            className="flex items-center gap-2.5 rounded-xl border-2 border-primary/30 bg-primary/5 px-3 py-3 transition-all hover:border-primary hover:shadow-md active:scale-[0.98] group"
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
            className="flex items-center gap-2.5 rounded-xl border-2 border-primary/30 bg-primary/5 px-3 py-3 transition-all hover:border-primary hover:shadow-md active:scale-[0.98] group"
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
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indicadores Content
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
}

function IndicadoresContent({ zoo, vista, mesLabel, mesFiltro, anoFiltro, kgHa, kgHaComps, acumulado }: IndicadoresContentProps) {
  return (
    <>
      {/* Estoque + Lotação */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            {vista === 'mes' ? `Indicadores Zootécnicos ${mesLabel}` : `Indicadores Zootécnicos — Média Jan → ${mesLabel}`}
          </h3>

          {vista === 'mes' ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <KpiCard label="Cabeças no mês" valor={formatNum(zoo.saldoFinalMes)} unidade="cab"
                  compMensal={zoo.comparacoes.saldoFinalMes.mensal} compAnual={zoo.comparacoes.saldoFinalMes.anual} />
                <KpiCard label="Peso Final no mês"
                  valor={zoo.pesoMedioRebanhoKg !== null ? formatNum(zoo.pesoMedioRebanhoKg, 1) : '—'}
                  unidade="kg" estimado={zoo.qualidade.pesoMedioEstimado}
                  compMensal={zoo.comparacoes.pesoMedioRebanhoKg.mensal} compAnual={zoo.comparacoes.pesoMedioRebanhoKg.anual}
                  semBase={zoo.pesoMedioRebanhoKg === null} />
                <KpiCard label="Valor Rebanho"
                  valor={zoo.valorRebanho !== null ? formatMoedaCompacto(zoo.valorRebanho) : '—'}
                  compMensal={zoo.comparacoes.valorRebanho.mensal} compAnual={zoo.comparacoes.valorRebanho.anual}
                  semBase={zoo.valorRebanho === null} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <KpiCard label="Área Prod. no mês" valor={formatNum(zoo.areaProdutiva, 1)} unidade="ha"
                  estimado={zoo.qualidade.areaProdutivaEstimativa} />
                <KpiCard label="UA/ha no mês"
                  valor={zoo.uaHa !== null ? formatNum(zoo.uaHa, 2) : '—'}
                  compMensal={zoo.comparacoes.uaHa.mensal} compAnual={zoo.comparacoes.uaHa.anual}
                  semBase={zoo.uaHa === null} />
                <KpiCard label="Kg/ha no mês"
                  valor={kgHa !== null ? formatNum(kgHa, 2) : '—'}
                  compMensal={kgHaComps.mensal} compAnual={kgHaComps.anual}
                  semBase={kgHa === null} />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <KpiCard label="Cabeças na média" valor={formatNum(acumulado.cabMedia, 0)} unidade="cab"
                  compMensal={acumulado.compCab.mensal} compAnual={acumulado.compCab.anual} />
                <KpiCard label="Peso Médio Final"
                  valor={acumulado.pesoMedioFinal !== null ? formatNum(acumulado.pesoMedioFinal, 1) : '—'}
                  unidade="kg"
                  compMensal={acumulado.compPeso.mensal} compAnual={acumulado.compPeso.anual}
                  semBase={acumulado.pesoMedioFinal === null} />
                <KpiCard label="Valor Rebanho"
                  valor={zoo.valorRebanho !== null ? formatMoedaCompacto(zoo.valorRebanho) : '—'}
                  compMensal={zoo.comparacoes.valorRebanho.mensal} compAnual={zoo.comparacoes.valorRebanho.anual}
                  semBase={zoo.valorRebanho === null} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <KpiCard label="Área Prod. média" valor={formatNum(acumulado.areaMedia, 1)} unidade="ha"
                  compMensal={acumulado.compArea.mensal} compAnual={acumulado.compArea.anual} />
                <KpiCard label="UA/ha médio"
                  valor={acumulado.uaHaMedio !== null ? formatNum(acumulado.uaHaMedio, 2) : '—'}
                  compMensal={acumulado.compUaHa.mensal} compAnual={acumulado.compUaHa.anual}
                  semBase={acumulado.uaHaMedio === null} />
                <KpiCard label="Kg/ha médio"
                  valor={acumulado.kgHaMedio !== null ? formatNum(acumulado.kgHaMedio, 2) : '—'}
                  compMensal={acumulado.compKgHa.mensal} compAnual={acumulado.compKgHa.anual}
                  semBase={acumulado.kgHaMedio === null} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Produção */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Produção {vista === 'mes' ? mesLabel : 'Acumulado'}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="@ produzidas"
              valor={vista === 'mes'
                ? (zoo.arrobasProduzidasMes !== null ? formatNum(zoo.arrobasProduzidasMes, 1) : '—')
                : (zoo.arrobasProduzidasAcumulado !== null ? formatNum(zoo.arrobasProduzidasAcumulado, 1) : '—')}
              unidade="@"
              compMensal={vista === 'acumulado' ? zoo.comparacoes.arrobasProduzidasAcumulado.mensal : null}
              compAnual={vista === 'acumulado' ? zoo.comparacoes.arrobasProduzidasAcumulado.anual : null}
              semBase={vista === 'mes' ? zoo.arrobasProduzidasMes === null : zoo.arrobasProduzidasAcumulado === null} />
            <KpiCard label="@/ha"
              valor={vista === 'mes'
                ? (zoo.arrobasProduzidasMes !== null && zoo.areaProdutiva > 0 ? formatNum(zoo.arrobasProduzidasMes / zoo.areaProdutiva, 2) : '—')
                : (zoo.arrobasProduzidasAcumulado !== null && zoo.areaProdutiva > 0 ? formatNum(zoo.arrobasProduzidasAcumulado / zoo.areaProdutiva, 2) : '—')}
              semBase={vista === 'mes'
                ? (zoo.arrobasProduzidasMes === null || zoo.areaProdutiva <= 0)
                : (zoo.arrobasProduzidasAcumulado === null || zoo.areaProdutiva <= 0)} />
            <KpiCard label="GMD"
              valor={vista === 'mes'
                ? (zoo.gmdMes !== null ? formatNum(zoo.gmdMes, 3) : '—')
                : (zoo.gmdAcumulado !== null ? formatNum(zoo.gmdAcumulado, 3) : '—')}
              unidade="kg/dia"
              compMensal={vista === 'mes' ? zoo.comparacoes.gmdMes.mensal : zoo.comparacoes.gmdAcumulado.mensal}
              compAnual={vista === 'mes' ? zoo.comparacoes.gmdMes.anual : zoo.comparacoes.gmdAcumulado.anual} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Desfrute cab."
              valor={vista === 'mes'
                ? (zoo.desfruteCabecasMes !== null ? formatNum(zoo.desfruteCabecasMes, 1) : '—')
                : (zoo.desfruteCabecasAcumulado !== null ? formatNum(zoo.desfruteCabecasAcumulado, 1) : '—')}
              unidade="%"
              compAnual={vista === 'acumulado' ? zoo.comparacoes.desfruteCabecasAcumulado.anual : null}
              semBase={vista === 'mes' ? zoo.desfruteCabecasMes === null : zoo.desfruteCabecasAcumulado === null} />
            <KpiCard label="Desfrute @"
              valor={vista === 'mes'
                ? (zoo.desfruteArrobasMes !== null ? formatNum(zoo.desfruteArrobasMes, 1) : '—')
                : (zoo.desfruteArrobasAcumulado !== null ? formatNum(zoo.desfruteArrobasAcumulado, 1) : '—')}
              unidade="%"
              compAnual={vista === 'acumulado' ? zoo.comparacoes.desfruteArrobasAcumulado.anual : null}
              semBase={vista === 'mes' ? zoo.desfruteArrobasMes === null : zoo.desfruteArrobasAcumulado === null} />
            <KpiCard label="@ desfrutadas"
              valor={vista === 'mes'
                ? formatNum(zoo.arrobasSaidasMes, 1)
                : formatNum(zoo.arrobasSaidasAcumuladoAno, 1)}
              unidade="@"
              compMensal={vista === 'mes' ? zoo.comparacoes.arrobasSaidasMes.mensal : zoo.comparacoes.arrobasDesfrutadasAcum.mensal}
              compAnual={vista === 'mes' ? zoo.comparacoes.arrobasSaidasMes.anual : zoo.comparacoes.arrobasDesfrutadasAcum.anual} />
          </div>
          {zoo.qualidade.gmdDisponivel && (
            <GmdDetalheSheet abertura={zoo.gmdAberturaMes} mesLabel={mesLabel} anoLabel={anoFiltro} />
          )}
        </CardContent>
      </Card>

      {zoo.qualidade.pesoMedioEstimado && (
        <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Peso médio estimado — realize fechamento de pastos para maior precisão</span>
        </div>
      )}
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
const DOT_STYLE = { r: 3, strokeWidth: 2 };
const ACTIVE_DOT_STYLE = { r: 5, strokeWidth: 2 };

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
    <>
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
    </>
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
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: decimals }) : '—'} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {keys.map((k, i) => (
                    <Bar key={k} dataKey={k} name={labels[i]} fill={COLORS[i]} fillOpacity={i === 0 ? 1 : 0.4} radius={[3, 3, 0, 0]} />
                  ))}
                  <ReferenceLine y={avgValue} stroke="hsl(var(--primary))" strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value: `Média: ${avgValue.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`, position: 'insideTopRight', fontSize: 9, fill: 'hsl(var(--primary))' }} />
                </ComposedChart>
              ) : (
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: decimals }) : '—'} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {keys.map((k, i) => (
                    <Bar key={k} dataKey={k} name={labels[i]} fill={COLORS[i]} fillOpacity={i === 0 ? 1 : 0.4} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              )
            ) : type === 'area' ? (
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: decimals }) : '—'} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {keys.map((k, i) => (
                  <Area key={k} type="monotone" dataKey={k} name={labels[i]}
                    stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={i === 0 ? 0.3 : 0.1}
                    strokeWidth={i === 0 ? 2 : 1} strokeDasharray={i > 0 ? '4 2' : undefined}
                    dot={DOT_STYLE} activeDot={ACTIVE_DOT_STYLE} />
                ))}
              </AreaChart>
            ) : (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: decimals }) : '—'} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {keys.map((k, i) => (
                  <Line key={k} type="monotone" dataKey={k} name={labels[i]}
                    stroke={COLORS[i]} strokeWidth={i === 0 ? 2 : 1}
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
