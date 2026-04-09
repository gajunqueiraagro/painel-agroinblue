/**
 * Gráficos — tela dedicada com 3 sub-abas: Zootécnico | Financeiro | Operacional
 */
import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MESES_NOMES, MESES_COLS } from '@/lib/calculos/labels';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { calcPesoMedioPonderado, calcAreaProdutivaPecuaria } from '@/lib/calculos/zootecnicos';
import { calcArrobasSafe } from '@/lib/calculos/economicos';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { useFinanceiro, type FinanceiroLancamento } from '@/hooks/useFinanceiro';
import { usePastos } from '@/hooks/usePastos';
import { useFazenda } from '@/contexts/FazendaContext';
import { TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, Legend, ReferenceLine,
  ComposedChart,
} from 'recharts';
import { StandardTooltip } from '@/lib/chartConfig';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

type SubAba = 'zootecnico' | 'financeiro' | 'operacional';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

const TIPOS_SAIDA_DESFRUTE = ['abate', 'venda', 'consumo', 'transferencia_saida'];
const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))'];
const DOT_STYLE = { r: 2, strokeWidth: 1.5, fill: 'hsl(var(--background))' };
const ACTIVE_DOT_STYLE = { r: 4, strokeWidth: 2, fill: 'hsl(var(--primary))' };
const GRID = { strokeDasharray: '3 3', stroke: 'hsl(var(--border))', strokeOpacity: 0.5 };
const AXIS_TICK = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };

const isRealizado = (l: FinanceiroLancamento) =>
  (l.status_transacao || '').toLowerCase() === 'realizado';

const datePagtoAnoMes = (l: FinanceiroLancamento): string | null => {
  if (!l.data_pagamento || l.data_pagamento.length < 7) return null;
  return l.data_pagamento.substring(0, 7);
};

export function GraficosAnaliseTab({ lancamentos, saldosIniciais, onBack, filtroAnoInicial, filtroMesInicial }: Props) {
  const { fazendaAtual, fazendas } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;
  const { lancamentos: lancFin } = useFinanceiro();

  const [subAba, setSubAba] = useState<SubAba>('zootecnico');

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
  const mesesOpt = MESES_COLS.map((m, i) => ({ value: i + 1, label: m.label }));

  const subAbas: { id: SubAba; label: string }[] = [
    { id: 'zootecnico', label: 'Zootécnico' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'operacional', label: 'Operacional' },
  ];

  return (
    <div className="w-full animate-fade-in pb-20">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 sm:px-6 lg:px-8 py-1.5 space-y-1">
        {/* Linha 1: Voltar + Ano + Mês */}
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-[11px] h-6 px-1.5">
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Button>
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
        </div>
        {/* Linha 2: Sub-abas */}
        <div className="grid grid-cols-3 bg-muted rounded p-0.5">
          {subAbas.map(b => (
            <button
              key={b.id}
              onClick={() => setSubAba(b.id)}
              className={`py-1 px-1 rounded text-[10px] font-bold transition-colors ${
                subAba === b.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-4">
        {subAba === 'zootecnico' && (
          <ZootecnicoCharts zoo={zoo} lancamentos={lancamentos} saldosIniciais={saldosIniciais} anoNum={anoNum} mesFiltro={mesFiltro} pastos={pastos} />
        )}
        {subAba === 'financeiro' && (
          <FinanceiroCharts lancFin={lancFin} anoFiltro={anoFiltro} anoNum={anoNum} mesFiltro={mesFiltro} lancamentos={lancamentos} saldosIniciais={saldosIniciais} categorias={categorias} pastos={pastos} fazendaId={fazendaId} />
        )}
        {subAba === 'operacional' && (
          <OperacionalCharts zoo={zoo} anoNum={anoNum} mesFiltro={mesFiltro} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zootécnico Charts (moved from VisaoZooHubTab GraficosContent)
// ---------------------------------------------------------------------------
function ZootecnicoCharts({ zoo, lancamentos, saldosIniciais, anoNum, mesFiltro, pastos }: {
  zoo: ReturnType<typeof useIndicadoresZootecnicos>;
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  anoNum: number;
  mesFiltro: number;
  pastos: any[];
}) {
  // FONTE OFICIAL
  const rebanhoAtual = useRebanhoOficial({ ano: anoNum, cenario: 'realizado' });
  const rebanhoAnt = useRebanhoOficial({ ano: anoNum - 1, cenario: 'realizado' });

  const chartData = useMemo(() => {
    const buildYear = (rebanho: typeof rebanhoAtual, ano: number) => {
      const data: any[] = [];
      for (let m = 1; m <= 12; m++) {
        const cab = rebanho.getSaldoFinalTotal(m);
        const pm = rebanho.getPesoMedioRebanho(m);
        const areaPec = calcAreaProdutivaPecuaria(pastos);
        const kgha = pm && areaPec > 0 ? (cab * pm) / areaPec : null;
        data.push({ cabecas: cab, kgHa: kgha ? Math.round(kgha) : null });
      }
      return data;
    };
    const atual = buildYear(rebanhoAtual, anoNum);
    const anterior = buildYear(rebanhoAnt, anoNum - 1);
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
  }, [rebanhoAtual, rebanhoAnt, anoNum, mesFiltro, pastos]);

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
    // Build accumulated weighted GMD average
    const buildGmdAcum = (meses: typeof anoAtual.meses, ateMes: number) => {
      const acums: (number | null)[] = [];
      let sumGmd = 0;
      let count = 0;
      for (let i = 0; i < 12; i++) {
        const gmdMes = mensal(meses, i, 'gmdAcumulado');
        if (i < ateMes && gmdMes !== null && typeof gmdMes === 'number') {
          sumGmd += gmdMes;
          count++;
          acums.push(sumGmd / count);
        } else {
          acums.push(null);
        }
      }
      return acums;
    };
    const gmdAcumAtual = buildGmdAcum(anoAtual.meses, mesFiltro);
    const gmdAcumAnt = anoAnt ? buildGmdAcum(anoAnt.meses, 12) : Array(12).fill(null);

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
        [`gmdAcum_${anoNum}`]: isFuturo ? null : gmdAcumAtual[i],
        [`gmdAcum_${anoNum - 1}`]: gmdAcumAnt[i],
      };
    });
  }, [zoo.historico, anoNum, mesFiltro]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Rebanho Final do mês (cab)" subtitle="Quantidade de cabeças no final do mês" data={chartData}
        keys={[`cab_${anoNum}`, `cab_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
        type="area" mesFiltro={mesFiltro} valueSuffix=" cab." />
      <ChartCard title="Lotação: Kg vivo por ha (Kg/ha)" subtitle="Quantidade de Kg sobre cada hectare produtivo" data={chartData}
        keys={[`kgHa_${anoNum}`, `kgHa_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
        type="line" mesFiltro={mesFiltro} decimals={2} valueSuffix=" kg/ha" />
      {prodData.length > 0 && (
        <>
          <ChartCard title="Arrobas Produzidas por mês" subtitle="Quantidade de arrobas produzidas por mês" data={prodData}
            keys={[`arrProdMes_${anoNum}`, `arrProdMes_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="bar" decimals={0} mesFiltro={mesFiltro} />
          <ChartCard title="Arrobas Produzidas acumulado" subtitle="Quantidade de arrobas produzidas no acumulado do ano" data={prodData}
            keys={[`arrProd_${anoNum}`, `arrProd_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="line" decimals={0} mesFiltro={mesFiltro} />
          <ChartCard title="GMD na média do período (kg/dia)" subtitle="Kg médio ganho por cabeça considerando o período acumulado" data={prodData}
            keys={[`gmdMes_${anoNum}`, `gmdMes_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="bar" decimals={3} mesFiltro={mesFiltro}
            lineOverlayKey={`gmdAcum_${anoNum}`} valueSuffix=" kg/dia"
            displayValueKey={`gmdAcum_${anoNum}`} compKeys={[`gmdAcum_${anoNum}`, `gmdAcum_${anoNum - 1}`]} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Financeiro Charts (NEW)
// ---------------------------------------------------------------------------
function FinanceiroCharts({ lancFin, anoFiltro, anoNum, mesFiltro, lancamentos, saldosIniciais, categorias, pastos, fazendaId }: {
  lancFin: FinanceiroLancamento[];
  anoFiltro: string;
  anoNum: number;
  mesFiltro: number;
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  categorias: any[];
  pastos: any[];
  fazendaId?: string;
}) {
  const anoAnt = String(anoNum - 1);

  const buildFinData = (ano: string) => {
    const meses: { receita: number; custo: number; entradas: number; saidas: number }[] = [];
    for (let m = 1; m <= 12; m++) {
      const mesKey = `${ano}-${String(m).padStart(2, '0')}`;
      const lancMes = lancFin.filter(l => {
        if (!isRealizado(l)) return false;
        const am = datePagtoAnoMes(l);
        return am === mesKey;
      });
      const entradas = lancMes.filter(l => l.valor > 0).reduce((s, l) => s + l.valor, 0);
      const saidas = lancMes.filter(l => l.valor < 0).reduce((s, l) => s + Math.abs(l.valor), 0);
      // Receita = entradas, Custo = saídas operacionais (excluindo transferências)
      const custoOp = lancMes.filter(l => l.valor < 0 && (l.tipo_operacao || '').toLowerCase() !== 'transferencia').reduce((s, l) => s + Math.abs(l.valor), 0);
      meses.push({ receita: entradas, custo: custoOp, entradas, saidas });
    }
    return meses;
  };

  const finAtual = useMemo(() => buildFinData(anoFiltro), [lancFin, anoFiltro]);
  const finAnt = useMemo(() => buildFinData(anoAnt), [lancFin, anoAnt]);

  // Arrobas por mês for custo/@
  const arrobasPorMes = useMemo(() => {
    const arr: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const mesStr = `${anoFiltro}-${String(m).padStart(2, '0')}`;
      const saidasMes = lancamentos.filter(l => l.data.startsWith(mesStr) && TIPOS_SAIDA_DESFRUTE.includes(l.tipo));
      arr.push(saidasMes.reduce((s, l) => s + calcArrobasSafe(l), 0));
    }
    return arr;
  }, [lancamentos, anoFiltro]);

  const arrobasPorMesAnt = useMemo(() => {
    const arr: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const mesStr = `${anoAnt}-${String(m).padStart(2, '0')}`;
      const saidasMes = lancamentos.filter(l => l.data.startsWith(mesStr) && TIPOS_SAIDA_DESFRUTE.includes(l.tipo));
      arr.push(saidasMes.reduce((s, l) => s + calcArrobasSafe(l), 0));
    }
    return arr;
  }, [lancamentos, anoAnt]);

  const chartData = MESES_NOMES.map((mes, i) => {
    const isFuturo = i + 1 > mesFiltro;
    const margem = finAtual[i].receita - finAtual[i].custo;
    const margemAnt = finAnt[i].receita - finAnt[i].custo;
    const custoArr = arrobasPorMes[i] > 0 ? finAtual[i].custo / arrobasPorMes[i] : null;
    const custoArrAnt = arrobasPorMesAnt[i] > 0 ? finAnt[i].custo / arrobasPorMesAnt[i] : null;
    const fluxo = finAtual[i].entradas - finAtual[i].saidas;
    const fluxoAnt = finAnt[i].entradas - finAnt[i].saidas;
    return {
      mes,
      [`receita_${anoNum}`]: isFuturo ? null : finAtual[i].receita,
      [`receita_${anoNum - 1}`]: finAnt[i].receita,
      [`custo_${anoNum}`]: isFuturo ? null : finAtual[i].custo,
      [`custo_${anoNum - 1}`]: finAnt[i].custo,
      [`margem_${anoNum}`]: isFuturo ? null : margem,
      [`margem_${anoNum - 1}`]: margemAnt,
      [`custoArr_${anoNum}`]: isFuturo ? null : custoArr,
      [`custoArr_${anoNum - 1}`]: custoArrAnt,
      [`fluxo_${anoNum}`]: isFuturo ? null : fluxo,
      [`fluxo_${anoNum - 1}`]: fluxoAnt,
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Receita Total (R$)" subtitle="Total de entradas no período" data={chartData}
        keys={[`receita_${anoNum}`, `receita_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
        type="bar" decimals={0} mesFiltro={mesFiltro} isCurrency />
      <ChartCard title="Custo Operacional (R$)" subtitle="Desembolsos produtivos" data={chartData}
        keys={[`custo_${anoNum}`, `custo_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
        type="bar" decimals={0} mesFiltro={mesFiltro} isCurrency />
      <ChartCard title="Margem Operacional (R$)" subtitle="Receita - custo operacional" data={chartData}
        keys={[`margem_${anoNum}`, `margem_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
        type="line" decimals={0} mesFiltro={mesFiltro} isCurrency />
      <ChartCard title="Custo por Arroba (R$/@)" subtitle="Eficiência do custo de produção" data={chartData}
        keys={[`custoArr_${anoNum}`, `custoArr_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
        type="line" decimals={2} mesFiltro={mesFiltro} isCurrency />
      <ChartCard title="Fluxo de Caixa do mês (R$)" subtitle="Entradas - Saídas" data={chartData}
        keys={[`fluxo_${anoNum}`, `fluxo_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
        type="bar" decimals={0} mesFiltro={mesFiltro} isCurrency />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operacional Charts (NEW)
// ---------------------------------------------------------------------------
function OperacionalCharts({ zoo, anoNum, mesFiltro }: {
  zoo: ReturnType<typeof useIndicadoresZootecnicos>;
  anoNum: number;
  mesFiltro: number;
}) {
  const desfrData = useMemo(() => {
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
        [`desfCab_${anoNum}`]: isFuturo ? null : (m?.desfruteCabAcum ?? null),
        [`desfCab_${anoNum - 1}`]: mAnt?.desfruteCabAcum ?? null,
      };
    });
  }, [zoo.historico, anoNum, mesFiltro]);

  if (desfrData.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Sem dados suficientes para exibir gráficos operacionais.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Desfrute acumulado (%)" subtitle="Produção vs estoque médio" data={desfrData}
        keys={[`desfCab_${anoNum}`, `desfCab_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
        type="line" decimals={1} mesFiltro={mesFiltro} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic Chart Card (reused pattern)
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
  isCurrency?: boolean;
  valueSuffix?: string;
  lineOverlayKey?: string;
  displayValueKey?: string;
  compKeys?: string[];
}

function ChartCard({ title, subtitle, data, keys, labels, type, decimals = 0, mesFiltro, averageKey, averageLabel, isCurrency, valueSuffix, lineOverlayKey, displayValueKey, compKeys }: ChartCardProps) {
  const effectiveCompKeys = compKeys || keys;

  const comparisons = useMemo(() => {
    if (!data || data.length === 0 || effectiveCompKeys.length < 2) return { mom: null, yoy: null };
    const mesIdx = mesFiltro - 1;
    const mesAntIdx = mesFiltro > 1 ? mesFiltro - 2 : null;
    const valAtual = data[mesIdx]?.[effectiveCompKeys[0]];
    const valMesAnt = mesAntIdx !== null ? data[mesAntIdx]?.[effectiveCompKeys[0]] : null;
    const valAnoAnt = data[mesIdx]?.[effectiveCompKeys[1]];
    const calcPct = (cur: any, ref: any) => {
      if (cur === null || cur === undefined || ref === null || ref === undefined) return null;
      if (typeof cur !== 'number' || typeof ref !== 'number') return null;
      if (cur === 0 && ref === 0) return null;
      if (ref === 0) return null;
      return ((cur - ref) / Math.abs(ref)) * 100;
    };
    return { mom: calcPct(valAtual, valMesAnt), yoy: calcPct(valAtual, valAnoAnt) };
  }, [data, effectiveCompKeys, mesFiltro]);

  const currentValue = useMemo(() => {
    if (!data || data.length === 0) return null;
    const mesIdx = mesFiltro - 1;
    const key = displayValueKey || keys[0];
    const val = data[mesIdx]?.[key];
    return typeof val === 'number' ? val : null;
  }, [data, keys, mesFiltro, displayValueKey]);

  const avgValue = useMemo(() => {
    if (!averageKey || !data || data.length === 0) return null;
    const vals: number[] = [];
    for (let i = 0; i < mesFiltro && i < data.length; i++) {
      const v = data[i]?.[averageKey];
      if (typeof v === 'number') vals.push(v);
    }
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [data, averageKey, mesFiltro]);

  const displayValue = avgValue ?? currentValue;

  const formatVal = (v: number) => {
    if (isCurrency) {
      if (Math.abs(v) >= 1_000_000) return `R$ ${formatNum(v / 1_000_000, 2)}M`;
      if (Math.abs(v) >= 1_000) return `R$ ${formatNum(v / 1_000, 1)}mil`;
      return formatMoeda(v);
    }
    return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

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
            {displayValue !== null && (
              <span className="text-sm font-bold text-foreground">
                {formatVal(displayValue)}
                {valueSuffix && <span className="text-[10px] font-normal text-muted-foreground">{valueSuffix}</span>}
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
              (avgValue !== null || lineOverlayKey) ? (
                <ComposedChart data={data}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="mes" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} tickFormatter={(v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} />
                  <Tooltip content={<StandardTooltip isCurrency={isCurrency} formatter={(v, name) => typeof v === 'number' ? (isCurrency ? formatMoeda(v) : v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })) : '—'} />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {keys.map((k, i) => (
                    <Bar key={k} dataKey={k} name={labels[i]} fill={CHART_COLORS[i]} fillOpacity={i === 0 ? 1 : 0.4} radius={[3, 3, 0, 0]} />
                  ))}
                  {lineOverlayKey && (
                    <Line type="monotone" dataKey={lineOverlayKey} name="Tendência" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="6 3" dot={DOT_STYLE} activeDot={ACTIVE_DOT_STYLE} connectNulls />
                  )}
                  {avgValue !== null && !lineOverlayKey && (
                    <ReferenceLine y={avgValue} stroke="hsl(var(--primary))" strokeDasharray="6 3" strokeWidth={1.5}
                      label={{ value: `Média: ${formatVal(avgValue)}`, position: 'insideTopRight', fontSize: 9, fill: 'hsl(var(--primary))' }} />
                  )}
                </ComposedChart>
              ) : (
                <BarChart data={data}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="mes" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} tickFormatter={(v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} />
                  <Tooltip content={<StandardTooltip isCurrency={isCurrency} formatter={(v, name) => typeof v === 'number' ? (isCurrency ? formatMoeda(v) : v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })) : '—'} />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {keys.map((k, i) => (
                    <Bar key={k} dataKey={k} name={labels[i]} fill={CHART_COLORS[i]} fillOpacity={i === 0 ? 1 : 0.4} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              )
            ) : type === 'area' ? (
              <AreaChart data={data}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="mes" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} />
                <Tooltip content={<StandardTooltip isCurrency={isCurrency} formatter={(v, name) => typeof v === 'number' ? (isCurrency ? formatMoeda(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: decimals })) : '—'} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {keys.map((k, i) => (
                  <Area key={k} type="monotone" dataKey={k} name={labels[i]}
                    stroke={CHART_COLORS[i]} fill={CHART_COLORS[i]} fillOpacity={i === 0 ? 0.3 : 0.1}
                    strokeWidth={i === 0 ? 2.5 : 1.5} strokeDasharray={i > 0 ? '4 2' : undefined}
                    dot={DOT_STYLE} activeDot={ACTIVE_DOT_STYLE} />
                ))}
              </AreaChart>
            ) : (
              <LineChart data={data}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="mes" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} />
                <Tooltip content={<StandardTooltip isCurrency={isCurrency} formatter={(v, name) => typeof v === 'number' ? (isCurrency ? formatMoeda(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: decimals })) : '—'} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {keys.map((k, i) => (
                  <Line key={k} type="monotone" dataKey={k} name={labels[i]}
                    stroke={CHART_COLORS[i]} strokeWidth={i === 0 ? 2.5 : 1.5}
                    strokeDasharray={i > 0 ? '4 2' : undefined}
                    strokeOpacity={i > 0 ? 0.55 : 1}
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
