/**
 * Resumo Executivo — Dashboard profissional de gestão.
 * Visual: software financeiro / ERP / BI executivo.
 */
import { useState, useMemo, useEffect } from 'react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { parseISO, format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TabId } from '@/components/BottomNav';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { useResumoStatus, StatusNivel } from '@/hooks/useResumoStatus';
import { useStatusZootecnico } from '@/hooks/useStatusZootecnico';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { supabase } from '@/integrations/supabase/client';
import { calcSaldoPorCategoriaLegado, calcPesoMedioPonderado, calcUA, calcUAHa, calcAreaProdutivaPecuaria } from '@/lib/calculos/zootecnicos';
import { loadPesosPastosPorCategoria, resolverPesoOficial } from '@/hooks/useFechamentoCategoria';
import { calcArrobasSafe } from '@/lib/calculos/economicos';
import { ChevronRight, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Wallet, BarChart3, Landmark } from 'lucide-react';
import { SaldoInicialForm } from '@/components/SaldoInicialForm';
import { Categoria } from '@/types/cattle';
import type { FiltroGlobal } from './Index';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  filtroGlobal: FiltroGlobal;
  onFiltroChange: (f: Partial<FiltroGlobal>) => void;
  onSetSaldo?: (ano: number, categoria: Categoria, quantidade: number, pesoMedioKg?: number) => void;
}

const MESES = [
  { value: '1', label: 'Jan' }, { value: '2', label: 'Fev' },
  { value: '3', label: 'Mar' }, { value: '4', label: 'Abr' },
  { value: '5', label: 'Mai' }, { value: '6', label: 'Jun' },
  { value: '7', label: 'Jul' }, { value: '8', label: 'Ago' },
  { value: '9', label: 'Set' }, { value: '10', label: 'Out' },
  { value: '11', label: 'Nov' }, { value: '12', label: 'Dez' },
];

const MESES_FULL = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const TIPOS_SAIDA = ['abate', 'venda', 'consumo', 'transferencia_saida'];

// ---------------------------------------------------------------------------
// Status visual components
// ---------------------------------------------------------------------------

function StatusDot({ nivel }: { nivel: StatusNivel }) {
  const bg = {
    aberto: 'bg-destructive',
    parcial: 'bg-warning',
    fechado: 'bg-success',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${bg[nivel]}`} />;
}

function StatusBadge({ nivel, label }: { nivel: StatusNivel; label: string }) {
  const styles = {
    aberto: 'text-destructive bg-destructive/10 border-destructive/20',
    parcial: 'text-warning bg-warning/10 border-warning/20',
    fechado: 'text-success bg-success/10 border-success/20',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${styles[nivel]}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Zoo KPIs hook — uses official weight hierarchy (fechamento > lancamento > saldo)
// ---------------------------------------------------------------------------

function useZooKpis(lancamentos: Lancamento[], saldosIniciais: SaldoInicial[], ano: number, mes: number) {
  const { pastos, categorias } = usePastos();
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id;

  // Load fechamento weights for each month jan→mes
  const [pesosPorMes, setPesosPorMes] = useState<Record<number, Record<string, number>>>({});
  const [loadingPesos, setLoadingPesos] = useState(false);

  useEffect(() => {
    if (!fazendaId || fazendaId === '__global__' || !categorias.length) {
      setPesosPorMes({});
      return;
    }
    let cancelled = false;
    setLoadingPesos(true);
    (async () => {
      const result: Record<number, Record<string, number>> = {};
      for (let m = 1; m <= mes; m++) {
        const anoMes = `${ano}-${String(m).padStart(2, '0')}`;
        result[m] = await loadPesosPastosPorCategoria(fazendaId, anoMes, categorias);
      }
      if (!cancelled) {
        setPesosPorMes(result);
        setLoadingPesos(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fazendaId, ano, mes, categorias]);

  return useMemo(() => {
    // Saldo final no mês filtrado (snapshot)
    const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
    const saldoFinal = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);

    // Acumulado: for each month, use official weight hierarchy
    let sumSaldo = 0;
    let sumPesoTotal = 0;
    let sumArea = 0;
    let mesesComDado = 0;

    for (let m = 1; m <= mes; m++) {
      const sM = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, m);
      const st = Array.from(sM.values()).reduce((a, v) => a + v, 0);
      if (st <= 0) continue;
      mesesComDado++;
      sumSaldo += st;

      // Use official weight hierarchy per category for this month
      const pesosPastosMes = pesosPorMes[m] || {};
      let pesoTotalMes = 0;
      for (const [cat, qtd] of sM.entries()) {
        if (qtd <= 0) continue;
        const { valor: pesoKg } = resolverPesoOficial(
          cat, pesosPastosMes, saldosIniciais, lancamentos, ano, m,
        );
        if (pesoKg) pesoTotalMes += pesoKg * qtd;
      }
      sumPesoTotal += pesoTotalMes;

      // Area for this month (same pastos snapshot — model doesn't track monthly area changes)
      sumArea += calcAreaProdutivaPecuaria(pastos);
    }

    const rebanhoMedio = mesesComDado > 0 ? sumSaldo / mesesComDado : 0;
    const pesoMedio = sumSaldo > 0 ? sumPesoTotal / sumSaldo : null;
    const areaMedia = mesesComDado > 0 ? sumArea / mesesComDado : calcAreaProdutivaPecuaria(pastos);
    const pesoTotalMedioKg = pesoMedio && rebanhoMedio > 0 ? pesoMedio * rebanhoMedio : null;
    const lotacaoKgHa = pesoTotalMedioKg && areaMedia > 0 ? pesoTotalMedioKg / areaMedia : null;

    const end = `${ano}-${String(mes).padStart(2, '0')}-31`;
    const lancsAcum = lancamentos.filter(l => l.data >= `${ano}-01-01` && l.data <= end);
    const saidasAcum = lancsAcum.filter(l => TIPOS_SAIDA.includes(l.tipo));
    const arrobasSaidas = saidasAcum.reduce((s, l) => s + calcArrobasSafe(l), 0);
    return { saldoFinal, pesoMedio, lotacaoKgHa, arrobasSaidas, area: areaMedia, loadingPesos };
  }, [lancamentos, saldosIniciais, ano, mes, pastos, pesosPorMes, loadingPesos]);
}

// ---------------------------------------------------------------------------
// Per-farm KPIs for global view (table)
// ---------------------------------------------------------------------------

interface FarmKpi {
  id: string;
  nome: string;
  rebanho: number;         // saldo final no mês filtrado
  pesoMedio: number | null; // média ponderada acumulada
  area: number;            // área produtiva média do período
  lotacaoKgHa: number | null; // kg/ha médio do período
}

function useGlobalFarmKpis(lancamentos: Lancamento[], saldosIniciais: SaldoInicial[], ano: number, mes: number) {
  const { fazendas } = useFazenda();
  const { categorias } = usePastos();
  const [allPastos, setAllPastos] = useState<{ fazenda_id: string; ativo: boolean; entra_conciliacao: boolean; area_produtiva_ha: number | null }[]>([]);
  const [allPesosPorFazMes, setAllPesosPorFazMes] = useState<Record<string, Record<number, Record<string, number>>>>({});

  const pecuariaIds = useMemo(() =>
    fazendas.filter(f => f.id !== '__global__' && f.tem_pecuaria !== false).map(f => f.id),
  [fazendas]);

  useEffect(() => {
    if (pecuariaIds.length === 0) return;
    supabase.from('pastos').select('fazenda_id, ativo, entra_conciliacao, area_produtiva_ha').in('fazenda_id', pecuariaIds)
      .then(({ data }) => { if (data) setAllPastos(data); });
  }, [pecuariaIds]);

  // Load fechamento weights for all farms × all months
  useEffect(() => {
    if (pecuariaIds.length === 0 || !categorias.length) return;
    let cancelled = false;
    (async () => {
      const result: Record<string, Record<number, Record<string, number>>> = {};
      for (const fId of pecuariaIds) {
        result[fId] = {};
        for (let m = 1; m <= mes; m++) {
          const anoMes = `${ano}-${String(m).padStart(2, '0')}`;
          result[fId][m] = await loadPesosPastosPorCategoria(fId, anoMes, categorias);
        }
      }
      if (!cancelled) setAllPesosPorFazMes(result);
    })();
    return () => { cancelled = true; };
  }, [pecuariaIds, ano, mes, categorias]);

  return useMemo(() => {
    const pecuarias = fazendas.filter(f => f.id !== '__global__' && f.tem_pecuaria !== false);

    const farms: FarmKpi[] = pecuarias.map(faz => {
      const lancsFaz = lancamentos.filter(l => l.fazendaId === faz.id);
      const saldosFaz = saldosIniciais.filter(s => s.fazendaId === faz.id);
      const pastosFaz = allPastos.filter(p => p.fazenda_id === faz.id);

      // Saldo final no mês filtrado
      const saldoMap = calcSaldoPorCategoriaLegado(saldosFaz, lancsFaz, ano, mes);
      const rebanho = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);

      // Acumulado with official weight hierarchy
      let sumSaldo = 0;
      let sumPesoTotal = 0;
      let mesesComDado = 0;

      for (let m = 1; m <= mes; m++) {
        const saldoM = calcSaldoPorCategoriaLegado(saldosFaz, lancsFaz, ano, m);
        const saldoTotal = Array.from(saldoM.values()).reduce((s, v) => s + v, 0);
        if (saldoTotal <= 0) continue;
        mesesComDado++;
        sumSaldo += saldoTotal;

        const pesosPastosMes = allPesosPorFazMes[faz.id]?.[m] || {};
        let pesoTotalMes = 0;
        for (const [cat, qtd] of saldoM.entries()) {
          if (qtd <= 0) continue;
          const { valor: pesoKg } = resolverPesoOficial(cat, pesosPastosMes, saldosFaz, lancsFaz, ano, m);
          if (pesoKg) pesoTotalMes += pesoKg * qtd;
        }
        sumPesoTotal += pesoTotalMes;
      }

      const pesoMedio = sumSaldo > 0 ? sumPesoTotal / sumSaldo : null;
      const area = calcAreaProdutivaPecuaria(pastosFaz);
      const pesoTotalKg = pesoMedio && rebanho > 0 ? pesoMedio * rebanho : null;
      const lotacaoKgHa = pesoTotalKg && area > 0 ? pesoTotalKg / area : null;

      return { id: faz.id, nome: faz.nome, rebanho, pesoMedio, area, lotacaoKgHa };
    }).filter(f => f.rebanho !== 0);

    // Global consolidated row — derived directly from farm KPIs
    const globalRebanho = farms.reduce((s, f) => s + f.rebanho, 0);
    const globalArea = farms.reduce((s, f) => s + f.area, 0);

    // Peso Médio Global = Σ(qtd × pesoMedio) / Σ(qtd) — weighted by rebanho
    const globalPesoTotal = farms.reduce((s, f) => s + (f.pesoMedio ? f.rebanho * f.pesoMedio : 0), 0);
    const globalPesoMedio = globalRebanho > 0 ? globalPesoTotal / globalRebanho : null;

    // KG/HA Global = Σ peso total / Σ área
    const globalLotacao = globalPesoTotal > 0 && globalArea > 0 ? globalPesoTotal / globalArea : null;

    const globalRow: FarmKpi = {
      id: '__global__', nome: 'Global', rebanho: globalRebanho,
      pesoMedio: globalPesoMedio, area: globalArea, lotacaoKgHa: globalLotacao,
    };

    return { farms, globalRow };
  }, [fazendas, lancamentos, saldosIniciais, ano, mes, allPastos, allPesosPorFazMes, categorias]);
}

// ---------------------------------------------------------------------------
// Metric row helper
// ---------------------------------------------------------------------------
function MetricRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[13px] font-semibold tabular-nums ${accent || 'text-foreground'}`}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ResumoTab({ lancamentos, saldosIniciais, onTabChange, filtroGlobal, onFiltroChange, onSetSaldo }: Props) {
  const { fazendaAtual, isGlobal } = useFazenda();
  const fazendaNaoPecuaria = fazendaAtual && fazendaAtual.id !== '__global__' && fazendaAtual.tem_pecuaria === false;

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {} });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const anoNum = Number(filtroGlobal.ano);
  const mesNum = filtroGlobal.mes;

  const { zootecnico, financeiro, economico, loading } = useResumoStatus(lancamentos, saldosIniciais, anoNum, mesNum);
  const statusZoo = useStatusZootecnico(fazendaAtual?.id, anoNum, mesNum, lancamentos, saldosIniciais);
  const zooKpis = useZooKpis(lancamentos, saldosIniciais, anoNum, mesNum);
  const globalFarmKpis = useGlobalFarmKpis(lancamentos, saldosIniciais, anoNum, mesNum);

  const statusGeral = useMemo((): StatusNivel => {
    const niveis = [zootecnico.status.nivel, financeiro.status.nivel, economico.status.nivel];
    if (niveis.every(n => n === 'fechado')) return 'fechado';
    if (niveis.every(n => n === 'aberto')) return 'aberto';
    return 'parcial';
  }, [zootecnico.status.nivel, financeiro.status.nivel, economico.status.nivel]);

  const mesLabel = MESES_FULL[mesNum - 1] || '';

  // Alertas
  const BLOCKED_TABS_GLOBAL: TabId[] = ['fechamento', 'conciliacao_categoria', 'conciliacao', 'lancamentos', 'valor_rebanho'];
  const alertas = useMemo(() => {
    const items: { texto: string; nivel: StatusNivel; tab: TabId; blockedGlobal: boolean }[] = [];
    if (fazendaNaoPecuaria) return items;
    statusZoo.pendencias.forEach(p => {
      if (p.status !== 'fechado') {
        const destTab = (p.resolverTab || 'visao_zoo_hub') as TabId;
        items.push({
          texto: `${p.label}: ${p.descricao}`,
          nivel: p.status === 'aberto' ? 'aberto' : 'parcial',
          tab: destTab,
          blockedGlobal: BLOCKED_TABS_GLOBAL.includes(destTab),
        });
      }
    });
    if (financeiro.status.nivel !== 'fechado') {
      items.push({
        texto: `Financeiro: ${financeiro.status.descricao}`,
        nivel: financeiro.status.nivel,
        tab: 'fin_caixa',
        blockedGlobal: false,
      });
    }
    return items;
  }, [statusZoo.pendencias, financeiro.status, fazendaNaoPecuaria]);

  return (
    <div className="max-w-5xl mx-auto animate-fade-in pb-24">
      {/* ── Sticky filter bar ── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 md:px-6 py-2">
        <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto">
          <p className="text-[11px] text-muted-foreground font-medium">
            {mesLabel} / {filtroGlobal.ano}
            {isGlobal ? ' · Consolidado' : ` · ${fazendaAtual?.nome || ''}`}
          </p>
          <div className="flex gap-1">
            <Select value={filtroGlobal.ano} onValueChange={v => onFiltroChange({ ano: v })}>
              <SelectTrigger className="w-[78px] h-7 text-xs font-medium border-border/60 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="bottom">
                {anosDisponiveis.map(a => (
                  <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(mesNum)} onValueChange={v => onFiltroChange({ mes: Number(v) })}>
              <SelectTrigger className="w-[72px] h-7 text-xs font-medium border-border/60 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="bottom">
                {MESES.map(m => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Saldo Inicial banner/edit */}
      {onSetSaldo && !isGlobal && (
        <SaldoInicialForm
          saldosIniciais={saldosIniciais}
          onSetSaldo={onSetSaldo}
        />
      )}

      <div className="p-4 md:p-6 space-y-5">

      {/* ── Status Strip ── */}
      <button
        onClick={() => onTabChange('zootecnico' as TabId, { ano: filtroGlobal.ano, mes: mesNum })}
        className="w-full rounded-lg border border-border/60 bg-card p-3.5 flex items-center gap-3 transition-colors hover:bg-muted/30 active:bg-muted/50"
      >
        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
          <BarChart3 className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 text-left">
          <span className="text-xs font-semibold text-foreground">Status Geral</span>
          <div className="flex gap-4 mt-1">
            {[
              { label: 'Zootécnico', nivel: zootecnico.status.nivel },
              { label: 'Financeiro', nivel: financeiro.status.nivel },
              { label: 'Econômico', nivel: economico.status.nivel },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <StatusDot nivel={item.nivel} />
                <span className="text-[10px] text-muted-foreground font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </button>

      {/* ── Grid: Zootécnico + Financeiro ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ZOOTÉCNICO */}
        <section className="rounded-lg border border-border/60 bg-card">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🐄</span>
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Zootécnico</span>
            </div>
            <StatusBadge
              nivel={zootecnico.status.nivel}
              label={zootecnico.status.nivel === 'fechado' ? 'Fechado' : zootecnico.status.nivel === 'parcial' ? 'Parcial' : 'Aberto'}
            />
          </div>

          {fazendaNaoPecuaria ? (
            <div className="p-5 text-center">
              <p className="text-xs text-muted-foreground">Sem dados de rebanho para esta fazenda</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">Fazenda utilizada apenas para rateio financeiro</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {/* Rebanho principal */}
              <div className="text-center">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Rebanho Atual</p>
                <p className="text-3xl font-bold text-foreground tabular-nums leading-tight mt-1">
                  {formatNum(zootecnico.rebanhoAtual)}
                </p>
                <p className="text-[10px] text-muted-foreground">cabeças</p>
              </div>

              {/* Per-farm breakdown (Global) */}
              {isGlobal && globalFarmKpis.farms.length > 0 && (
                <div className="border-t border-border/40 pt-2.5 -mx-1">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[9px] h-7 px-1.5">Fazenda</TableHead>
                          <TableHead className="text-[9px] h-7 px-1.5 text-right">Qtde</TableHead>
                          <TableHead className="text-[9px] h-7 px-1.5 text-right">Peso Méd.</TableHead>
                          <TableHead className="text-[9px] h-7 px-1.5 text-right">Kg/ha</TableHead>
                          <TableHead className="text-[9px] h-7 px-1.5 text-right">Área (ha)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {globalFarmKpis.farms.map(f => (
                          <TableRow key={f.id} className="hover:bg-muted/30">
                            <TableCell className="text-[10px] py-1 px-1.5 font-medium truncate max-w-[100px]">{f.nome}</TableCell>
                            <TableCell className="text-[10px] py-1 px-1.5 text-right tabular-nums">{formatNum(f.rebanho)}</TableCell>
                            <TableCell className="text-[10px] py-1 px-1.5 text-right tabular-nums">{f.pesoMedio ? formatNum(f.pesoMedio, 0) : '—'}</TableCell>
                            <TableCell className="text-[10px] py-1 px-1.5 text-right tabular-nums">{f.lotacaoKgHa ? formatNum(f.lotacaoKgHa, 0) : '—'}</TableCell>
                            <TableCell className="text-[10px] py-1 px-1.5 text-right tabular-nums">{f.area > 0 ? formatNum(f.area, 0) : '—'}</TableCell>
                          </TableRow>
                        ))}
                        {/* Global consolidated row */}
                        <TableRow className="border-t-2 border-border bg-muted/30 hover:bg-muted/40 font-semibold">
                          <TableCell className="text-[10px] py-1.5 px-1.5 font-bold">Global</TableCell>
                          <TableCell className="text-[10px] py-1.5 px-1.5 text-right tabular-nums font-bold">{formatNum(globalFarmKpis.globalRow.rebanho)}</TableCell>
                          <TableCell className="text-[10px] py-1.5 px-1.5 text-right tabular-nums font-bold">{globalFarmKpis.globalRow.pesoMedio ? formatNum(globalFarmKpis.globalRow.pesoMedio, 0) : '—'}</TableCell>
                          <TableCell className="text-[10px] py-1.5 px-1.5 text-right tabular-nums font-bold">{globalFarmKpis.globalRow.lotacaoKgHa ? formatNum(globalFarmKpis.globalRow.lotacaoKgHa, 0) : '—'}</TableCell>
                          <TableCell className="text-[10px] py-1.5 px-1.5 text-right tabular-nums font-bold">{globalFarmKpis.globalRow.area > 0 ? formatNum(globalFarmKpis.globalRow.area, 0) : '—'}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* KPIs por fazenda — executive grid */}
              {!isGlobal && (
                <div className="border-t border-border/40 pt-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center rounded-md bg-muted/30 px-2 py-2">
                      <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Área (ha)</p>
                      <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">
                        {zooKpis.area > 0 ? formatNum(zooKpis.area, 0) : '—'}
                      </p>
                    </div>
                    <div className="text-center rounded-md bg-muted/30 px-2 py-2">
                      <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Peso Méd.</p>
                      <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">
                        {zooKpis.pesoMedio ? `${formatNum(zooKpis.pesoMedio, 0)} kg` : '—'}
                      </p>
                    </div>
                    <div className="text-center rounded-md bg-muted/30 px-2 py-2">
                      <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Kg/ha Méd.</p>
                      <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">
                        {zooKpis.lotacaoKgHa !== null ? formatNum(zooKpis.lotacaoKgHa, 0) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CTA */}
              <button
                onClick={() => onTabChange('visao_zoo_hub', { ano: filtroGlobal.ano, mes: mesNum })}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-primary py-2 rounded border border-primary/20 bg-primary/5 transition-colors hover:bg-primary/10 mt-1"
              >
                Painel Zootécnico <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </section>

        {/* FINANCEIRO */}
        <section className="rounded-lg border border-border/60 bg-card">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Financeiro</span>
            </div>
            <StatusBadge
              nivel={financeiro.status.nivel}
              label={financeiro.status.nivel === 'fechado' ? 'Conciliado' : financeiro.status.nivel === 'parcial' ? 'Parcial' : 'Pendente'}
            />
          </div>

          <div className="p-4 space-y-3">
            {/* Resultado destaque */}
            <div className="text-center">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Saldo Final em Caixa</p>
              <p className={`text-3xl font-bold tabular-nums leading-tight mt-1 ${financeiro.caixaAtual >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatMoeda(financeiro.caixaAtual)}
              </p>
            </div>

            {/* Entradas / Saídas */}
            <div className="border-t border-border/40 pt-2.5">
              <MetricRow
                label="Entradas acum."
                value={formatMoeda(financeiro.totalEntradas)}
                accent="text-success"
              />
              <MetricRow
                label="Saídas acum."
                value={formatMoeda(financeiro.totalSaidas)}
                accent="text-destructive"
              />
            </div>

            {/* CTA */}
            <button
              onClick={() => onTabChange('fin_caixa', { ano: filtroGlobal.ano, mes: mesNum })}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-primary py-2 rounded border border-primary/20 bg-primary/5 transition-colors hover:bg-primary/10 mt-1"
            >
              Fluxo Financeiro <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </section>
      </div>

      {/* ── Card Operação ── */}
      <button
        onClick={() => onTabChange('operacao_hub' as TabId, { ano: filtroGlobal.ano, mes: mesNum })}
        className="w-full rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center gap-3 transition-colors hover:bg-primary/10 active:bg-primary/15"
      >
        <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 text-left">
          <span className="text-sm font-bold text-foreground">Operação</span>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Visão analítica: gráficos, desempenho e composição do rebanho
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />
      </button>

      {/* ── Pendências ── */}
      {alertas.length > 0 && (
        <section className="rounded-lg border border-warning/30 bg-card overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-warning/20 bg-warning/5 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            <span className="text-xs font-semibold text-foreground">Pendências</span>
            <span className="text-[10px] font-semibold text-warning bg-warning/15 px-1.5 py-0.5 rounded tabular-nums ml-auto">
              {alertas.length}
            </span>
          </div>
          <div className="divide-y divide-border/30">
            {alertas.map((a, i) => {
              const blocked = isGlobal && a.blockedGlobal;
              return (
                <button
                  key={i}
                  onClick={() => !blocked && onTabChange(a.tab, { ano: filtroGlobal.ano, mes: mesNum })}
                  className={`w-full flex items-center gap-2.5 text-left px-3.5 py-2.5 transition-colors ${blocked ? 'opacity-50 cursor-default' : 'hover:bg-muted/30'}`}
                >
                  <StatusDot nivel={a.nivel} />
                  <span className="flex-1 text-[11px] text-foreground leading-tight">{a.texto}</span>
                  {blocked ? (
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">Selecione fazenda</span>
                  ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {alertas.length === 0 && !loading && !statusZoo.loading && (
        <div className="rounded-lg border border-success/30 bg-success/5 px-3.5 py-3 flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          <span className="text-xs font-semibold text-success">
            Nenhuma pendência — {mesLabel}/{filtroGlobal.ano}
          </span>
        </div>
      )}
      </div>
    </div>
  );
}
