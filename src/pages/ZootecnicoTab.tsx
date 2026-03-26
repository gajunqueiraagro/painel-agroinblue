/**
 * Indicadores Zootécnicos — KPIs de Estoque, Produção e Desempenho com gráficos.
 * (Antigo "Painel Zootécnico", agora focado apenas em indicadores)
 */
import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { MESES_NOMES, MESES_COLS } from '@/lib/calculos/labels';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { calcSaldoPorCategoriaLegado, calcPesoMedioPonderado, calcUA, calcUAHa, calcAreaProdutivaPecuaria } from '@/lib/calculos/zootecnicos';
import { calcArrobasSafe } from '@/lib/calculos/economicos';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { usePastos } from '@/hooks/usePastos';
import { useFazenda } from '@/contexts/FazendaContext';
import { KpiCard } from '@/components/indicadores/KpiCard';
import { GmdDetalheSheet } from '@/components/indicadores/GmdDetalheSheet';

import { TabId } from '@/components/BottomNav';
import {
  ArrowLeft, ChevronRight, AlertTriangle,
  BarChart2,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, Legend,
} from 'recharts';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack: () => void;
  onTabChange?: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

type Vista = 'mes' | 'acumulado';
type SubView = 'main' | 'graficos-estoque' | 'graficos-producao';

export function IndicadoresZooTab({ lancamentos, saldosIniciais, onBack, onTabChange, filtroAnoInicial, filtroMesInicial }: Props) {
  const { fazendaAtual, fazendas } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;

  const globalFazendaIds = useMemo(() => {
    if (fazendaId !== '__global__') return undefined;
    return fazendas.filter(f => f.tem_pecuaria !== false).map(f => f.id);
  }, [fazendaId, fazendas]);

  const anosDisp = useMemo(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { set.add(l.data.substring(0, 4)); } catch {} });
    saldosIniciais.forEach(s => set.add(String(s.ano)));
    return Array.from(set).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const anoNum = Number(anoFiltro);
  const mesDefault = filtroMesInicial || (anoNum === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  const [mesFiltro, setMesFiltro] = useState(mesDefault);
  const [vista, setVista] = useState<Vista>('mes');
  const [subView, setSubView] = useState<SubView>('main');

  useEffect(() => {
    if (filtroAnoInicial) setAnoFiltro(filtroAnoInicial);
    if (filtroMesInicial) setMesFiltro(filtroMesInicial);
  }, [filtroAnoInicial, filtroMesInicial]);

  const handleAnoChange = (val: string) => {
    setAnoFiltro(val);
    const n = Number(val);
    setMesFiltro(n === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  };

  const zoo = useIndicadoresZootecnicos(fazendaId, anoNum, mesFiltro, lancamentos, saldosIniciais, pastos, categorias, globalFazendaIds);

  const mesLabel = MESES_COLS.find(m => m.key === String(mesFiltro).padStart(2, '0'))?.label || '';

  // Peso total derived
  const pesoTotalKg = zoo.saldoFinalMes > 0 && zoo.pesoMedioRebanhoKg !== null
    ? zoo.saldoFinalMes * zoo.pesoMedioRebanhoKg : null;
  const arrobasTotalEstoque = pesoTotalKg ? pesoTotalKg / 30 : null;
  const kgHa = pesoTotalKg && zoo.areaProdutiva > 0 ? pesoTotalKg / zoo.areaProdutiva : null;
  const rsCab = zoo.valorRebanho !== null && zoo.saldoFinalMes > 0 ? zoo.valorRebanho / zoo.saldoFinalMes : null;
  const rsArroba = zoo.valorRebanho !== null && arrobasTotalEstoque ? zoo.valorRebanho / arrobasTotalEstoque : null;

  // Helpers for navigation — always carry current filter context
  const navTo = (tab: TabId) => {
    if (onTabChange) onTabChange(tab, { ano: anoFiltro, mes: mesFiltro });
  };

  // Sub-view: Graficos
  if (subView !== 'main') {
    return (
      <GraficosView
        subView={subView}
        onBack={() => setSubView('main')}
        zoo={zoo}
        lancamentos={lancamentos}
        saldosIniciais={saldosIniciais}
        anoNum={anoNum}
        mesFiltro={mesFiltro}
        pastos={pastos}
      />
    );
  }

  return (
    <div className="max-w-lg mx-auto animate-fade-in pb-20">
      {/* Sticky header + filters */}
      {/* Filtros */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 pt-3 pb-2">
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={anoFiltro} onValueChange={handleAnoChange}>
            <SelectTrigger className="w-24 text-base font-bold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
            <SelectTrigger className="w-28 text-sm font-bold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES_COLS.map((m, i) => (
                <SelectItem key={m.key} value={String(i + 1)}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-4 space-y-4">

      {/* Toggle Mês | Acumulado */}
      <div className="flex bg-muted rounded-lg p-0.5">
        <button
          onClick={() => setVista('mes')}
          className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors ${vista === 'mes' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          {mesLabel}
        </button>
        <button
          onClick={() => setVista('acumulado')}
          className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors ${vista === 'acumulado' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          Acumulado
        </button>
      </div>

      {/* ===== BLOCO 2: ESTOQUE + LOTAÇÃO ===== */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              Estoque {vista === 'mes' ? mesLabel : `Jan → ${mesLabel}`}
            </h3>
            <button
              onClick={() => setSubView('graficos-estoque')}
              className="text-[10px] text-primary font-bold flex items-center gap-0.5 hover:underline"
            >
              Ver gráficos <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Cabeças" valor={formatNum(zoo.saldoFinalMes)} unidade="cab"
              compMensal={zoo.comparacoes.saldoFinalMes.mensal} compAnual={zoo.comparacoes.saldoFinalMes.anual} />
            <KpiCard label="Peso Médio" 
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
            <KpiCard label="R$/cab"
              valor={rsCab !== null ? formatMoeda(rsCab) : '—'} small
              semBase={rsCab === null} />
            <KpiCard label="R$/@"
              valor={rsArroba !== null ? formatMoeda(rsArroba) : '—'} small
              semBase={rsArroba === null} />
            <KpiCard label="Área Prod."
              valor={formatNum(zoo.areaProdutiva, 1)} unidade="ha"
              estimado={zoo.qualidade.areaProdutivaEstimativa} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="UA/ha"
              valor={zoo.uaHa !== null ? formatNum(zoo.uaHa, 2) : '—'}
              compMensal={zoo.comparacoes.uaHa.mensal} compAnual={zoo.comparacoes.uaHa.anual}
              semBase={zoo.uaHa === null} />
            <KpiCard label="Kg/ha"
              valor={kgHa !== null ? formatNum(kgHa, 0) : '—'}
              semBase={kgHa === null} />
            <KpiCard label="UA/ha méd."
              valor={zoo.uaHaMediaAno !== null ? formatNum(zoo.uaHaMediaAno, 2) : '—'}
              compMensal={zoo.comparacoes.uaHaMediaAno.mensal} compAnual={zoo.comparacoes.uaHaMediaAno.anual}
              semBase={zoo.uaHaMediaAno === null} small />
          </div>
        </CardContent>
      </Card>

      {/* ===== BLOCO 3: PRODUÇÃO ===== */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              Produção {vista === 'mes' ? mesLabel : `Acumulado`}
            </h3>
            <button
              onClick={() => setSubView('graficos-producao')}
              className="text-[10px] text-primary font-bold flex items-center gap-0.5 hover:underline"
            >
              Ver gráficos <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {vista === 'mes' ? (
              <>
                <KpiCard label="@ produzidas"
                  valor={zoo.arrobasProduzidasMes !== null ? formatNum(zoo.arrobasProduzidasMes, 1) : '—'}
                  unidade="@" semBase={zoo.arrobasProduzidasMes === null} />
                <KpiCard label="GMD"
                  valor={zoo.gmdMes !== null ? formatNum(zoo.gmdMes, 3) : '—'}
                  unidade="kg/dia" compMensal={zoo.comparacoes.gmdMes.mensal} compAnual={zoo.comparacoes.gmdMes.anual} />
                <KpiCard label="@ saídas"
                  valor={formatNum(zoo.arrobasSaidasMes, 1)} unidade="@"
                  compMensal={zoo.comparacoes.arrobasSaidasMes.mensal} compAnual={zoo.comparacoes.arrobasSaidasMes.anual} />
              </>
            ) : (
              <>
                <KpiCard label="@ produzidas"
                  valor={zoo.arrobasProduzidasAcumulado !== null ? formatNum(zoo.arrobasProduzidasAcumulado, 1) : '—'}
                  unidade="@" compMensal={zoo.comparacoes.arrobasProduzidasAcumulado.mensal} compAnual={zoo.comparacoes.arrobasProduzidasAcumulado.anual}
                  semBase={zoo.arrobasProduzidasAcumulado === null} />
                <KpiCard label="@/ha"
                  valor={zoo.arrobasHaAcumuladoAno !== null ? formatNum(zoo.arrobasHaAcumuladoAno, 2) : '—'}
                  compMensal={zoo.comparacoes.arrobasHaAcumuladoAno.mensal} compAnual={zoo.comparacoes.arrobasHaAcumuladoAno.anual}
                  semBase={zoo.arrobasHaAcumuladoAno === null} />
                <KpiCard label="GMD acum."
                  valor={zoo.gmdAcumulado !== null ? formatNum(zoo.gmdAcumulado, 3) : '—'}
                  unidade="kg/dia" compMensal={zoo.comparacoes.gmdAcumulado.mensal} compAnual={zoo.comparacoes.gmdAcumulado.anual} />
              </>
            )}
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
              valor={formatNum(zoo.arrobasSaidasAcumuladoAno, 1)} unidade="@"
              compMensal={zoo.comparacoes.arrobasDesfrutadasAcum.mensal} compAnual={zoo.comparacoes.arrobasDesfrutadasAcum.anual} />
          </div>

          {/* GMD detail */}
          {zoo.qualidade.gmdDisponivel && (
            <GmdDetalheSheet abertura={zoo.gmdAberturaMes} mesLabel={mesLabel} anoLabel={anoFiltro} />
          )}
        </CardContent>
      </Card>

      {/* Histórico Comparativo movido para dentro de "Ver gráficos → Produção" */}

      {/* Alertas */}
      {zoo.qualidade.pesoMedioEstimado && (
        <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Peso médio estimado — realize fechamento de pastos para maior precisão</span>
        </div>
      )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function formatMoedaCompacto(val: number): string {
  if (val >= 1_000_000) return `R$ ${formatNum(val / 1_000_000, 2)}M`;
  if (val >= 1_000) return `R$ ${formatNum(val / 1_000, 1)}mil`;
  return formatMoeda(val);
}

// ---------------------------------------------------------------------------
// Gráficos Sub-View
// ---------------------------------------------------------------------------

interface GraficosProps {
  subView: SubView;
  onBack: () => void;
  zoo: ReturnType<typeof useIndicadoresZootecnicos>;
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  anoNum: number;
  mesFiltro: number;
  pastos: any[];
}

function GraficosView({ subView, onBack, zoo, lancamentos, saldosIniciais, anoNum, mesFiltro, pastos }: GraficosProps) {
  const isEstoque = subView === 'graficos-estoque';
  const TIPOS_SAIDA_DESFRUTE = ['abate', 'venda', 'consumo', 'transferencia_saida'];

  // Build monthly data for 2 years
  const chartData = useMemo(() => {
    const buildYear = (ano: number) => {
      const data: any[] = [];
      for (let m = 1; m <= 12; m++) {
        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, m);
        const cab = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);
        const itens = Array.from(saldoMap.entries())
          .filter(([, q]) => q > 0)
          .map(([cat, q]) => {
            const si = saldosIniciais.find(s => s.ano === ano && s.categoria === cat);
            return { quantidade: q, pesoKg: si?.pesoMedioKg ?? null };
          });
        const pm = calcPesoMedioPonderado(itens);
        const arrobas = pm ? (cab * pm) / 30 : null;
        const areaPec = calcAreaProdutivaPecuaria(pastos);
        const kgha = pm && areaPec > 0 ? (cab * pm) / areaPec : null;

        // Saídas do mês
        const mesStr = `${ano}-${String(m).padStart(2, '0')}`;
        const saidasMes = lancamentos
          .filter(l => l.data.startsWith(mesStr) && TIPOS_SAIDA_DESFRUTE.includes(l.tipo));
        const arrobasSaidas = saidasMes.reduce((s, l) => s + calcArrobasSafe(l), 0);

        data.push({
          mes: MESES_NOMES[m - 1],
          cabecas: cab,
          arrobas: arrobas ? Math.round(arrobas) : null,
          kgHa: kgha ? Math.round(kgha) : null,
          arrobasSaidas: Math.round(arrobasSaidas),
        });
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
        [`arrSaida_${anoNum}`]: isFuturo ? null : (atual[i]?.arrobasSaidas ?? 0),
        [`arrSaida_${anoNum - 1}`]: anterior[i]?.arrobasSaidas ?? 0,
      };
    });
  }, [lancamentos, saldosIniciais, anoNum, mesFiltro, pastos]);

  // GMD / desfrute from historico
  const gmdData = useMemo(() => {
    if (!zoo.historico || zoo.historico.length < 2) return [];
    const anoAtual = zoo.historico.find(h => h.ano === anoNum);
    const anoAnt = zoo.historico.find(h => h.ano === anoNum - 1);
    if (!anoAtual) return [];
    return MESES_NOMES.map((mes, i) => {
      const m = anoAtual.meses[i];
      const mAnt = anoAnt?.meses[i];
      const isFuturo = i + 1 > mesFiltro;
      return {
        mes,
        [`gmd_${anoNum}`]: isFuturo ? null : (m?.gmdAcumulado ?? null),
        [`gmd_${anoNum - 1}`]: mAnt?.gmdAcumulado ?? null,
        [`desfCab_${anoNum}`]: isFuturo ? null : (m?.desfruteCabAcum ?? null),
        [`desfCab_${anoNum - 1}`]: mAnt?.desfruteCabAcum ?? null,
        [`arrProd_${anoNum}`]: isFuturo ? null : (m?.arrobasProduzidasAcum ? Math.round(m.arrobasProduzidasAcum) : null),
        [`arrProd_${anoNum - 1}`]: mAnt?.arrobasProduzidasAcum ? Math.round(mAnt.arrobasProduzidasAcum) : null,
      };
    });
  }, [zoo.historico, anoNum, mesFiltro]);

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-extrabold text-foreground">
            {isEstoque ? '📊 Gráficos — Estoque' : '📊 Gráficos — Produção'}
          </h1>
          <p className="text-xs text-muted-foreground">📅 {MESES_NOMES[mesFiltro - 1]}/{anoNum}</p>
        </div>
      </div>

      {isEstoque ? (
        <>
          <ChartCard title="Rebanho Final do mês (cab)" subtitle="Quantidade de cabeças no final do mês" data={chartData}
            keys={[`cab_${anoNum}`, `cab_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="area" maxMonth={mesFiltro} />
          <ChartCard title="Lotação: Kg vivo por ha (Kg/ha)" subtitle="Quantidade de Kg sobre cada hectare produtivo, no final do mês" data={chartData}
            keys={[`kgHa_${anoNum}`, `kgHa_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="line" maxMonth={mesFiltro} />
        </>
      ) : (
        <>
          <ChartCard title="@ Saídas por Mês" data={chartData}
            keys={[`arrSaida_${anoNum}`, `arrSaida_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="bar" maxMonth={mesFiltro} />
          {gmdData.length > 0 && (
            <>
              <ChartCard title="@ Produzidas (acumulado)" data={gmdData}
                keys={[`arrProd_${anoNum}`, `arrProd_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
                type="line" maxMonth={mesFiltro} />
              <ChartCard title="GMD Acumulado (kg/dia)" data={gmdData}
                keys={[`gmd_${anoNum}`, `gmd_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
                type="line" decimals={3} maxMonth={mesFiltro} />
              <ChartCard title="Desfrute Cab. Acumulado (%)" data={gmdData}
                keys={[`desfCab_${anoNum}`, `desfCab_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
                type="line" decimals={1} maxMonth={mesFiltro} />
            </>
          )}
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
  maxMonth?: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))'];
const DOT_STYLE = { r: 3, strokeWidth: 2 };
const ACTIVE_DOT_STYLE = { r: 5, strokeWidth: 2 };

function ChartCard({ title, subtitle, data, keys, labels, type, decimals = 0 }: ChartCardProps) {

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-bold text-muted-foreground mb-0.5">{title}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground/70 mb-2">{subtitle}</p>}
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            {type === 'bar' ? (
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
