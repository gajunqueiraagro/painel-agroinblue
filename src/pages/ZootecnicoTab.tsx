/**
 * Painel Zootécnico — Central de Status + Ação.
 * Blocos: Status, Estoque+Lotação, Produção, Gráficos.
 */
import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { MESES_NOMES, MESES_COLS } from '@/lib/calculos/labels';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { calcSaldoPorCategoriaLegado, calcPesoMedioPonderado, calcUA, calcUAHa, calcAreaProdutivaPecuaria } from '@/lib/calculos/zootecnicos';
import { calcArrobasSafe } from '@/lib/calculos/economicos';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { useStatusZootecnico } from '@/hooks/useStatusZootecnico';
import { usePastos } from '@/hooks/usePastos';
import { useFazenda } from '@/contexts/FazendaContext';
import { KpiCard } from '@/components/indicadores/KpiCard';
import { GmdDetalheSheet } from '@/components/indicadores/GmdDetalheSheet';
import { HistoricoComparativo } from '@/components/indicadores/HistoricoComparativo';
import { TabId } from '@/components/BottomNav';
import {
  ArrowLeft, ChevronRight, AlertTriangle, CheckCircle2, Circle,
  BarChart2, TrendingUp, TrendingDown, Beef, Activity,
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

export function ZootecnicoTab({ lancamentos, saldosIniciais, onBack, onTabChange, filtroAnoInicial, filtroMesInicial }: Props) {
  const { fazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;

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

  const zoo = useIndicadoresZootecnicos(fazendaId, anoNum, mesFiltro, lancamentos, saldosIniciais, pastos, categorias);
  const statusZoo = useStatusZootecnico(fazendaId, anoNum, mesFiltro, lancamentos, saldosIniciais);

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

      {/* ===== BLOCO 1: STATUS ZOOTÉCNICO ===== */}
      <Card className={`border-l-4 ${statusZoo.status === 'fechado' ? 'border-l-emerald-500' : statusZoo.status === 'parcial' ? 'border-l-amber-500' : 'border-l-destructive'}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">📊 Status Zootécnico</h3>
            <StatusBadge status={statusZoo.status} />
          </div>

          {/* Contadores */}
          <div className="flex gap-3 text-xs font-bold">
            <span className="flex items-center gap-1 text-destructive">
              🔴 {statusZoo.contadores.aberto}
            </span>
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              🟡 {statusZoo.contadores.parcial}
            </span>
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              🟢 {statusZoo.contadores.fechado}
            </span>
          </div>

          {/* Lista de pendências */}
          <div className="space-y-2">
            {statusZoo.pendencias.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm shrink-0">
                    {p.status === 'aberto' ? '🔴' : p.status === 'parcial' ? '🟡' : '🟢'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{p.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.descricao}</p>
                  </div>
                </div>
                {p.status !== 'fechado' && p.resolverTab && (
                  <button
                    onClick={() => navTo(p.resolverTab as TabId)}
                    className="text-[10px] font-bold text-primary whitespace-nowrap flex items-center gap-0.5 hover:underline"
                  >
                    Resolver <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {statusZoo.status === 'fechado' && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-semibold">Mês completamente fechado</span>
            </div>
          )}
        </CardContent>
      </Card>

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
              comparacao={zoo.comparacoes.saldoFinalMes} />
            <KpiCard label="Peso Médio" 
              valor={zoo.pesoMedioRebanhoKg !== null ? formatNum(zoo.pesoMedioRebanhoKg, 1) : '—'}
              unidade="kg" estimado={zoo.qualidade.pesoMedioEstimado}
              comparacao={zoo.comparacoes.pesoMedioRebanhoKg}
              semBase={zoo.pesoMedioRebanhoKg === null} />
            <KpiCard label="Valor Rebanho"
              valor={zoo.valorRebanho !== null ? formatMoedaCompacto(zoo.valorRebanho) : '—'}
              comparacao={zoo.comparacoes.valorRebanho}
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
              comparacao={zoo.comparacoes.uaHa}
              semBase={zoo.uaHa === null} />
            <KpiCard label="Kg/ha"
              valor={kgHa !== null ? formatNum(kgHa, 0) : '—'}
              semBase={kgHa === null} />
            <KpiCard label="UA/ha méd."
              valor={zoo.uaHaMediaAno !== null ? formatNum(zoo.uaHaMediaAno, 2) : '—'}
              comparacao={zoo.comparacoes.uaHaMediaAno}
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
                  unidade="kg/dia" comparacao={zoo.comparacoes.gmdMes} />
                <KpiCard label="@ saídas"
                  valor={formatNum(zoo.arrobasSaidasMes, 1)} unidade="@"
                  comparacao={zoo.comparacoes.arrobasSaidasMes} />
              </>
            ) : (
              <>
                <KpiCard label="@ produzidas"
                  valor={zoo.arrobasProduzidasAcumulado !== null ? formatNum(zoo.arrobasProduzidasAcumulado, 1) : '—'}
                  unidade="@" comparacao={zoo.comparacoes.arrobasProduzidasAcumulado}
                  semBase={zoo.arrobasProduzidasAcumulado === null} />
                <KpiCard label="@/ha"
                  valor={zoo.arrobasHaAcumuladoAno !== null ? formatNum(zoo.arrobasHaAcumuladoAno, 2) : '—'}
                  comparacao={zoo.comparacoes.arrobasHaAcumuladoAno}
                  semBase={zoo.arrobasHaAcumuladoAno === null} />
                <KpiCard label="GMD acum."
                  valor={zoo.gmdAcumulado !== null ? formatNum(zoo.gmdAcumulado, 3) : '—'}
                  unidade="kg/dia" comparacao={zoo.comparacoes.gmdAcumulado} />
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Desfrute cab."
              valor={vista === 'mes'
                ? (zoo.desfruteCabecasMes !== null ? formatNum(zoo.desfruteCabecasMes, 1) : '—')
                : (zoo.desfruteCabecasAcumulado !== null ? formatNum(zoo.desfruteCabecasAcumulado, 1) : '—')}
              unidade="%"
              comparacao={vista === 'acumulado' ? zoo.comparacoes.desfruteCabecasAcumulado : null}
              semBase={vista === 'mes' ? zoo.desfruteCabecasMes === null : zoo.desfruteCabecasAcumulado === null} />
            <KpiCard label="Desfrute @"
              valor={vista === 'mes'
                ? (zoo.desfruteArrobasMes !== null ? formatNum(zoo.desfruteArrobasMes, 1) : '—')
                : (zoo.desfruteArrobasAcumulado !== null ? formatNum(zoo.desfruteArrobasAcumulado, 1) : '—')}
              unidade="%"
              comparacao={vista === 'acumulado' ? zoo.comparacoes.desfruteArrobasAcumulado : null}
              semBase={vista === 'mes' ? zoo.desfruteArrobasMes === null : zoo.desfruteArrobasAcumulado === null} />
            <KpiCard label="@ desfrutadas"
              valor={formatNum(zoo.arrobasSaidasAcumuladoAno, 1)} unidade="@"
              comparacao={zoo.comparacoes.arrobasDesfrutadasAcum} />
          </div>

          {/* GMD detail */}
          {zoo.qualidade.gmdDisponivel && (
            <GmdDetalheSheet abertura={zoo.gmdAberturaMes} mesLabel={mesLabel} anoLabel={anoFiltro} />
          )}
        </CardContent>
      </Card>

      {/* ===== BLOCO 4: Histórico Comparativo ===== */}
      <HistoricoComparativo
        historico={zoo.historico}
        comparacoesHistorico={zoo.comparacoesHistorico}
        mesAtual={mesFiltro}
      />

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

function StatusBadge({ status }: { status: 'aberto' | 'parcial' | 'fechado' }) {
  const config = {
    aberto: { emoji: '🔴', label: 'Em aberto', className: 'bg-destructive/15 text-destructive' },
    parcial: { emoji: '🟡', label: 'Parcial', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
    fechado: { emoji: '🟢', label: 'Fechado', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${c.className}`}>
      {c.emoji} {c.label}
    </span>
  );
}

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

    return MESES_NOMES.map((mes, i) => ({
      mes,
      [`cab_${anoNum}`]: atual[i]?.cabecas ?? 0,
      [`cab_${anoNum - 1}`]: anterior[i]?.cabecas ?? 0,
      [`kgHa_${anoNum}`]: atual[i]?.kgHa,
      [`kgHa_${anoNum - 1}`]: anterior[i]?.kgHa,
      [`arrSaida_${anoNum}`]: atual[i]?.arrobasSaidas ?? 0,
      [`arrSaida_${anoNum - 1}`]: anterior[i]?.arrobasSaidas ?? 0,
    }));
  }, [lancamentos, saldosIniciais, anoNum, pastos]);

  // GMD / desfrute from historico
  const gmdData = useMemo(() => {
    if (!zoo.historico || zoo.historico.length < 2) return [];
    const anoAtual = zoo.historico.find(h => h.ano === anoNum);
    const anoAnt = zoo.historico.find(h => h.ano === anoNum - 1);
    if (!anoAtual) return [];
    return anoAtual.meses.map((m, i) => ({
      mes: MESES_NOMES[m.mes - 1],
      [`gmd_${anoNum}`]: m.gmdAcumulado,
      [`gmd_${anoNum - 1}`]: anoAnt?.meses[i]?.gmdAcumulado ?? null,
      [`desfCab_${anoNum}`]: m.desfruteCabAcum,
      [`desfCab_${anoNum - 1}`]: anoAnt?.meses[i]?.desfruteCabAcum ?? null,
      [`arrProd_${anoNum}`]: m.arrobasProduzidasAcum ? Math.round(m.arrobasProduzidasAcum) : null,
      [`arrProd_${anoNum - 1}`]: anoAnt?.meses[i]?.arrobasProduzidasAcum ? Math.round(anoAnt.meses[i].arrobasProduzidasAcum!) : null,
    }));
  }, [zoo.historico, anoNum]);

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-lg font-extrabold text-foreground">
          {isEstoque ? '📊 Gráficos — Estoque' : '📊 Gráficos — Produção'}
        </h1>
      </div>

      {isEstoque ? (
        <>
          <ChartCard title="Rebanho Mensal (cab)" data={chartData}
            keys={[`cab_${anoNum}`, `cab_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="area" />
          <ChartCard title="Kg/ha" data={chartData}
            keys={[`kgHa_${anoNum}`, `kgHa_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="line" />
        </>
      ) : (
        <>
          <ChartCard title="@ Saídas por Mês" data={chartData}
            keys={[`arrSaida_${anoNum}`, `arrSaida_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
            type="bar" />
          {gmdData.length > 0 && (
            <>
              <ChartCard title="@ Produzidas (acumulado)" data={gmdData}
                keys={[`arrProd_${anoNum}`, `arrProd_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
                type="line" />
              <ChartCard title="GMD Acumulado (kg/dia)" data={gmdData}
                keys={[`gmd_${anoNum}`, `gmd_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
                type="line" decimals={3} />
              <ChartCard title="Desfrute Cab. Acumulado (%)" data={gmdData}
                keys={[`desfCab_${anoNum}`, `desfCab_${anoNum - 1}`]} labels={[String(anoNum), String(anoNum - 1)]}
                type="line" decimals={1} />
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
  data: any[];
  keys: string[];
  labels: string[];
  type: 'area' | 'line' | 'bar';
  decimals?: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))'];

function ChartCard({ title, data, keys, labels, type, decimals = 0 }: ChartCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-bold text-muted-foreground mb-2">{title}</p>
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
                    strokeWidth={i === 0 ? 2 : 1} strokeDasharray={i > 0 ? '4 2' : undefined} />
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
                    dot={{ r: 2 }} connectNulls />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
