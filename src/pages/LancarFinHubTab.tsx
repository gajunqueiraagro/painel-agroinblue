/**
 * Visão Operacional — dashboard com sub-abas: Indicadores | DRE | Gráficos
 * Layout semelhante ao Visão Zoo, com toggles Mês/Acumulado e Realizado/Previsto.
 */
import { useState, useMemo, useEffect } from 'react';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { useFinanceiro, isDesembolsoProdutivo, type FinanceiroLancamento, type RateioADM } from '@/hooks/useFinanceiro';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { useArrobasGlobal } from '@/hooks/useArrobasGlobal';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { KpiCard } from '@/components/indicadores/KpiCard';
import { DREAtividade } from '@/components/financeiro/AnaliseDRE';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { Loader2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { StandardTooltip } from '@/lib/chartConfig';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  isRealizado as isRealizadoShared,
  datePagtoAnoMes as datePagtoAnoMesShared,
} from '@/lib/financeiro/filters';
import type { TabId } from '@/components/BottomNav';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

type SubTab = 'indicadores' | 'dre' | 'graficos';
type Vista = 'mes' | 'acumulado';
type Cenario = 'realizado' | 'meta';

interface Props {
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  filtroGlobal?: { ano: string; mes: number };
  lancamentosPecuarios?: Lancamento[];
  saldosIniciais?: SaldoInicial[];
}

const MESES_FILTRO = [
  { value: '1', label: 'Janeiro' }, { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' }, { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' }, { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' }, { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' }, { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
];

const isRealizado = (l: FinanceiroLancamento) => isRealizadoShared(l);
const datePagtoAnoMes = (l: FinanceiroLancamento) => datePagtoAnoMesShared(l);

export function LancarFinHubTab({ onTabChange, filtroGlobal, lancamentosPecuarios = [], saldosIniciais = [] }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('indicadores');
  const [vista, setVista] = useState<Vista>('mes');
  const [cenario, setCenario] = useState<Cenario>('realizado');
  const { fazendaAtual, fazendas } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;
  const isGlobal = fazendaId === '__global__';

  const { lancamentos: lancFin, rateioADM, loading } = useFinanceiro();

  const [localAno, setLocalAno] = useState(filtroGlobal?.ano || String(new Date().getFullYear()));
  const [localMes, setLocalMes] = useState(filtroGlobal?.mes || new Date().getMonth() + 1);

  useEffect(() => {
    if (filtroGlobal?.ano) setLocalAno(filtroGlobal.ano);
    if (filtroGlobal?.mes) setLocalMes(filtroGlobal.mes);
  }, [filtroGlobal]);

  const anoNum = Number(localAno);
  const anoAtual = new Date().getFullYear();
  const anosDisponiveis = Array.from({ length: 5 }, (_, i) => String(anoAtual - i));

  const mesLabel = MESES_NOMES[localMes - 1] || '';

  // Zootécnico
  const zoo = useIndicadoresZootecnicos(
    fazendaId, anoNum, localMes,
    lancamentosPecuarios, saldosIniciais, pastos, categorias,
  );

  // FONTE OFICIAL: useRebanhoOficial para médias mensais de rebanho
  const rebanhoOf = useRebanhoOficial({ ano: anoNum, cenario: 'realizado', global: isGlobal });

  const fazendaIdsReais = useMemo(
    () => fazendas.filter(f => f.id !== '__global__').map(f => f.id),
    [fazendas],
  );

  const arrobasGlobal = useArrobasGlobal(
    isGlobal, lancamentosPecuarios, saldosIniciais, categorias,
    anoNum, localMes, fazendaIdsReais,
  );

  // Cabeças médias (FONTE OFICIAL: useRebanhoOficial)
  const zooData = useMemo(() => {
    const saldoAnterior = zoo.gmdAberturaMes.estoqueInicialDetalhe.reduce((s, d) => s + d.cabecas, 0);
    const saldoFinalMes = zoo.saldoFinalMes;
    const cabMediaMes = (saldoAnterior > 0 || saldoFinalMes > 0) ? (saldoAnterior + saldoFinalMes) / 2 : null;

    const rebanhosMensais: { mes: number; media: number }[] = [];
    for (let m = 1; m <= localMes; m++) {
      const faz = rebanhoOf.getFazendaMes(m);
      const sInicio = faz?.cabecasInicio ?? 0;
      const sFim = faz?.cabecasFinal ?? 0;
      rebanhosMensais.push({ mes: m, media: (sInicio + sFim) / 2 });
    }

    const cabMediaAcum = rebanhosMensais.length > 0
      ? rebanhosMensais.reduce((s, rm) => s + rm.media, 0) / rebanhosMensais.length
      : null;

    const arrobasProduzidasAcum = isGlobal
      ? arrobasGlobal.somaArrobas
      : zoo.arrobasProduzidasAcumulado;

    return { cabMediaMes, cabMediaAcum, arrobasProduzidasAcum, rebanhosMensais };
  }, [zoo, rebanhoOf.loading, rebanhoOf.getFazendaMes, localMes, isGlobal, arrobasGlobal.somaArrobas]);

  // Financial indicators
  const ind = useMemo(() => {
    const periodoMes = `${localAno}-${String(localMes).padStart(2, '0')}`;

    const filtradosMes = lancFin.filter(l => {
      if (!isRealizado(l)) return false;
      return datePagtoAnoMes(l) === periodoMes;
    });

    const rateioMesVal = rateioADM.filter(r => r.anoMes === periodoMes).reduce((s, r) => s + r.valorRateado, 0);

    // Desembolso produtivo mês (SEM rateio)
    const desembolsoMesProprio = filtradosMes
      .filter(l => isDesembolsoProdutivo(l))
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    // Custo mês = desembolso + rateio
    const custoMes = desembolsoMesProprio + rateioMesVal;

    // Acumulado
    const desembolsoAcumProprio = lancFin
      .filter(l => {
        if (!isRealizado(l) || !isDesembolsoProdutivo(l)) return false;
        const am = datePagtoAnoMes(l);
        if (!am || !am.startsWith(localAno)) return false;
        return Number(am.substring(5, 7)) <= localMes;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    const rateioAcumVal = rateioADM
      .filter(r => r.anoMes.startsWith(localAno) && Number(r.anoMes.substring(5, 7)) <= localMes)
      .reduce((s, r) => s + r.valorRateado, 0);

    const custoAcum = desembolsoAcumProprio + rateioAcumVal;
    const numMeses = localMes;

    // Indicadores por cabeça — MÊS
    const custoCabMes = zooData.cabMediaMes && zooData.cabMediaMes > 0 ? custoMes / zooData.cabMediaMes : null;
    const desembolsoCabMes = zooData.cabMediaMes && zooData.cabMediaMes > 0 ? desembolsoMesProprio / zooData.cabMediaMes : null;

    // Indicadores por cabeça — ACUMULADO (média mensal / cab média acum)
    const custoMedMensal = numMeses > 0 ? custoAcum / numMeses : 0;
    const desembolsoMedMensal = numMeses > 0 ? desembolsoAcumProprio / numMeses : 0;
    const custoCabAcum = zooData.cabMediaAcum && zooData.cabMediaAcum > 0 ? custoMedMensal / zooData.cabMediaAcum : null;
    const desembolsoCabAcum = zooData.cabMediaAcum && zooData.cabMediaAcum > 0 ? desembolsoMedMensal / zooData.cabMediaAcum : null;

    // Indicadores por arroba
    const custoArrobaProd = zooData.arrobasProduzidasAcum && zooData.arrobasProduzidasAcum > 0
      ? custoAcum / zooData.arrobasProduzidasAcum : null;
    const desembolsoArrobaProd = zooData.arrobasProduzidasAcum && zooData.arrobasProduzidasAcum > 0
      ? desembolsoAcumProprio / zooData.arrobasProduzidasAcum : null;

    // Per-month data for charts
    const porMes: { mes: number; custoCab: number | null; desembolsoCab: number | null; custoArroba: number | null; desembolsoArroba: number | null }[] = [];
    let desembolsoRunning = 0;
    let custoRunning = 0;
    for (let m = 1; m <= localMes; m++) {
      const mesKey = `${localAno}-${String(m).padStart(2, '0')}`;
      const desM = lancFin
        .filter(l => isConciliado(l) && isDesembolsoProdutivo(l) && datePagtoAnoMes(l) === mesKey)
        .reduce((s, l) => s + Math.abs(l.valor), 0);
      const ratM = rateioADM.filter(r => r.anoMes === mesKey).reduce((s, r) => s + r.valorRateado, 0);
      const cusM = desM + ratM;

      desembolsoRunning += desM;
      custoRunning += desM + ratM;

      const cabMed = zooData.rebanhosMensais.find(r => r.mes === m)?.media ?? null;
      const cc = cabMed && cabMed > 0 ? cusM / cabMed : null;
      const dc = cabMed && cabMed > 0 ? desM / cabMed : null;

      // Arroba acumulada até este mês
      const arrobasAcumAteMes = isGlobal ? null : zoo.arrobasProduzidasAcumulado; // simplified
      const ca = arrobasAcumAteMes && arrobasAcumAteMes > 0 ? custoRunning / arrobasAcumAteMes : null;
      const da = arrobasAcumAteMes && arrobasAcumAteMes > 0 ? desembolsoRunning / arrobasAcumAteMes : null;

      porMes.push({ mes: m, custoCab: cc, desembolsoCab: dc, custoArroba: ca, desembolsoArroba: da });
    }

    return {
      custoCabMes, desembolsoCabMes,
      custoCabAcum, desembolsoCabAcum,
      custoArrobaProd, desembolsoArrobaProd,
      custoMes, desembolsoMesProprio,
      custoAcum, desembolsoAcumProprio,
      porMes,
    };
  }, [lancFin, rateioADM, localAno, localMes, zooData, isGlobal, zoo.arrobasProduzidasAcumulado]);

  // DRE data
  const lancConciliadosPorMes = useMemo(() => {
    const map = new Map<string, FinanceiroLancamento[]>();
    for (const l of lancFin) {
      if (!isRealizado(l)) continue;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(localAno)) continue;
      const mesKey = am.substring(5, 7);
      const arr = map.get(mesKey) || [];
      arr.push(l);
      map.set(mesKey, arr);
    }
    return map;
  }, [lancFin, localAno]);

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'indicadores', label: 'Indicadores' },
    { id: 'dre', label: 'DRE' },
    { id: 'graficos', label: 'Gráficos' },
  ];

  return (
    <div className="max-w-full mx-auto animate-fade-in pb-20">
      {/* ── Card de acesso ao Lançamentos v2 ── */}
      <div className="px-4 pt-3 pb-1">
        <button
          onClick={() => onTabChange('financeiro_v2', { ano: localAno, mes: localMes })}
          className="w-full flex items-center justify-between bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg px-4 py-3 transition-colors group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <div className="text-left min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-foreground">Lançamentos (Novo)</p>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-primary text-primary-foreground">NOVO</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">Novo módulo de lançamentos financeiros (v2)</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-primary group-hover:translate-x-0.5 transition-transform shrink-0" />
        </button>
      </div>

      {/* ── Topo fixo: filtros ── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm">
        <div className="flex gap-2 px-4 pb-2">
          <Select value={localAno} onValueChange={setLocalAno}>
            <SelectTrigger className="w-24 h-8 text-xs font-bold">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(localMes)} onValueChange={v => setLocalMes(Number(v))}>
            <SelectTrigger className="w-36 h-8 text-xs font-bold">
              <SelectValue placeholder="Até o mês" />
            </SelectTrigger>
            <SelectContent>
              {MESES_FILTRO.map(m => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  Até {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sub-abas horizontais */}
        <div className="flex gap-0 px-4 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                subTab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Conteúdo ── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {subTab === 'indicadores' && (
            <IndicadoresContent
              vista={vista}
              setVista={setVista}
              cenario={cenario}
              setCenario={setCenario}
              ind={ind}
              mesLabel={mesLabel}
              zooData={zooData}
            />
          )}
          {subTab === 'dre' && (
            <DREContent
              cenario={cenario}
              setCenario={setCenario}
              lancConciliadosPorMes={lancConciliadosPorMes}
              lancamentosPecuarios={lancamentosPecuarios}
              saldosIniciais={saldosIniciais}
              rateioADM={rateioADM}
              anoFiltro={localAno}
              mesLimite={localMes}
              isGlobal={isGlobal}
              fazendaId={fazendaId}
              categorias={categorias}
              pastos={pastos}
            />
          )}
          {subTab === 'graficos' && (
            <GraficosContent
              cenario={cenario}
              setCenario={setCenario}
              ind={ind}
              mesLabel={mesLabel}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Indicadores
// ---------------------------------------------------------------------------
function IndicadoresContent({
  vista, setVista, cenario, setCenario, ind, mesLabel, zooData,
}: {
  vista: Vista;
  setVista: (v: Vista) => void;
  cenario: Cenario;
  setCenario: (c: Cenario) => void;
  ind: any;
  mesLabel: string;
  zooData: any;
}) {
  return (
    <div className="space-y-4">
      {/* Toggle Realizado / Meta */}
      <div className="flex bg-muted rounded-lg p-0.5">
        <button
          onClick={() => setCenario('realizado')}
          className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors ${cenario === 'realizado' ? 'bg-green-600 text-white shadow-sm' : 'text-muted-foreground'}`}
        >
          Realizado
        </button>
        <button
          onClick={() => setCenario('meta')}
          className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors ${cenario === 'meta' ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground'}`}
        >
          Meta
        </button>
      </div>

      {/* Toggle Mês / Acumulado */}
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

      {cenario === 'meta' ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">📊 Indicadores Meta — em construção</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Custo e Desembolso por cabeça */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                {vista === 'mes' ? `Indicadores ${mesLabel}` : 'Indicadores — Acumulado'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label={vista === 'mes' ? 'Custo/cab mês' : 'Custo/cab acum.'}
                  valor={vista === 'mes'
                    ? (ind.custoCabMes !== null ? formatMoeda(ind.custoCabMes) : '—')
                    : (ind.custoCabAcum !== null ? formatMoeda(ind.custoCabAcum) : '—')}
                  semBase={vista === 'mes' ? ind.custoCabMes === null : ind.custoCabAcum === null}
                />
                <KpiCard
                  label={vista === 'mes' ? 'Desembolso/cab mês' : 'Desembolso/cab acum.'}
                  valor={vista === 'mes'
                    ? (ind.desembolsoCabMes !== null ? formatMoeda(ind.desembolsoCabMes) : '—')
                    : (ind.desembolsoCabAcum !== null ? formatMoeda(ind.desembolsoCabAcum) : '—')}
                  semBase={vista === 'mes' ? ind.desembolsoCabMes === null : ind.desembolsoCabAcum === null}
                />
              </div>
              {zooData.cabMediaMes !== null && vista === 'mes' && (
                <p className="text-[9px] text-muted-foreground">{formatNum(zooData.cabMediaMes, 0)} cab méd. no mês</p>
              )}
              {zooData.cabMediaAcum !== null && vista === 'acumulado' && (
                <p className="text-[9px] text-muted-foreground">{formatNum(zooData.cabMediaAcum, 0)} cab méd. acumulado</p>
              )}
            </CardContent>
          </Card>

          {/* Custo e Desembolso por arroba */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                Por Arroba Produzida
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label="Custo/@ produzida"
                  valor={ind.custoArrobaProd !== null ? formatMoeda(ind.custoArrobaProd) : '—'}
                  semBase={ind.custoArrobaProd === null}
                />
                <KpiCard
                  label="Desembolso/@ produzida"
                  valor={ind.desembolsoArrobaProd !== null ? formatMoeda(ind.desembolsoArrobaProd) : '—'}
                  semBase={ind.desembolsoArrobaProd === null}
                />
              </div>
              {zooData.arrobasProduzidasAcum !== null && (
                <p className="text-[9px] text-muted-foreground">{formatNum(zooData.arrobasProduzidasAcum, 1)} @ produzidas acumuladas</p>
              )}
            </CardContent>
          </Card>

          {/* Totais de referência */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                Totais de Referência
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">Custo Total {vista === 'mes' ? 'Mês' : 'Acumulado'}</p>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400">
                    {formatMoeda(vista === 'mes' ? ind.custoMes : ind.custoAcum)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Desembolso {vista === 'mes' ? 'Mês' : 'Acumulado'}</p>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400">
                    {formatMoeda(vista === 'mes' ? ind.desembolsoMesProprio : ind.desembolsoAcumProprio)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: DRE
// ---------------------------------------------------------------------------
function DREContent({
  cenario, setCenario, lancConciliadosPorMes, lancamentosPecuarios, saldosIniciais,
  rateioADM, anoFiltro, mesLimite, isGlobal, fazendaId, categorias, pastos,
}: {
  cenario: Cenario;
  setCenario: (c: Cenario) => void;
  lancConciliadosPorMes: Map<string, FinanceiroLancamento[]>;
  lancamentosPecuarios: Lancamento[];
  saldosIniciais: SaldoInicial[];
  rateioADM: RateioADM[];
  anoFiltro: string;
  mesLimite: number;
  isGlobal: boolean;
  fazendaId?: string;
  categorias: any[];
  pastos: any[];
}) {
  return (
    <div className="space-y-4">
      {cenario === 'meta' ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">📋 DRE Meta — em construção</p>
          </CardContent>
        </Card>
      ) : (
        <DREAtividade
          lancConciliadosPorMes={lancConciliadosPorMes}
          lancamentosPecuarios={lancamentosPecuarios}
          saldosIniciais={saldosIniciais}
          rateioADM={rateioADM}
          anoFiltro={anoFiltro}
          mesLimite={mesLimite}
          isGlobal={isGlobal}
          fazendaId={fazendaId}
          categorias={categorias}
          pastos={pastos}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Gráficos
// ---------------------------------------------------------------------------
function GraficosContent({
  cenario, setCenario, ind, mesLabel,
}: {
  cenario: Cenario;
  setCenario: (c: Cenario) => void;
  ind: any;
  mesLabel: string;
}) {
  const chartData = useMemo(() => {
    return ind.porMes.map((p: any) => ({
      name: MESES_NOMES[p.mes - 1]?.substring(0, 3) || '',
      'Custo/cab': p.custoCab,
      'Desembolso/cab': p.desembolsoCab,
    }));
  }, [ind.porMes]);

  const chartDataArroba = useMemo(() => {
    return ind.porMes.map((p: any) => ({
      name: MESES_NOMES[p.mes - 1]?.substring(0, 3) || '',
      'Custo/@': p.custoArroba,
      'Desembolso/@': p.desembolsoArroba,
    }));
  }, [ind.porMes]);

  return (
    <div className="space-y-4">
      {/* Toggle Realizado / Meta */}
      <div className="flex bg-muted rounded-lg p-0.5">
        <button
          onClick={() => setCenario('realizado')}
          className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors ${cenario === 'realizado' ? 'bg-green-600 text-white shadow-sm' : 'text-muted-foreground'}`}
        >
          Realizado
        </button>
        <button
          onClick={() => setCenario('meta')}
          className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors ${cenario === 'meta' ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground'}`}
        >
          Meta
        </button>
      </div>

      {cenario === 'meta' ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">📈 Gráficos Meta — em construção</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Gráfico Custo/Desembolso por Cabeça */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                Custo & Desembolso por Cabeça
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      formatter={(value: number) => value !== null ? formatMoeda(value) : '—'}
                      labelStyle={{ fontWeight: 'bold' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="Custo/cab" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="Desembolso/cab" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Gráfico Custo/Desembolso por Arroba */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                Custo & Desembolso por @ Produzida
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartDataArroba}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      formatter={(value: number) => value !== null ? formatMoeda(value) : '—'}
                      labelStyle={{ fontWeight: 'bold' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="Custo/@" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="Desembolso/@" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
