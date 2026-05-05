import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useSnapshotAreaAnual } from '@/hooks/useFechamentoArea';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import type { Lancamento } from '@/types/cattle';
import {
  useRebanhoOficial,
  totalizarPorMes as totalizarViewPorMes,
} from '@/hooks/useRebanhoOficial';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { buildMonthlyDataFromView } from '@/pages/PainelConsultorTab';
import type { StatusPilares } from '@/hooks/useStatusPilares';

interface Params {
  ano: number;
  mes: number;
  viewMode?: 'mes' | 'periodo';
  /** Quando false (default), o hook NÃO carrega/processa dados de meta — economiza N queries e o pesado buildMonthlyDataFromView. */
  carregarMeta?: boolean;
  /** Lançamentos pecuários compartilhados — quando fornecido, o hook NÃO carrega via useLancamentos. */
  lancPecExterno?: Lancamento[];
  /** Lançamentos financeiros compartilhados — quando fornecido, o hook NÃO carrega via useFinanceiro. */
  lancFinExterno?: FinanceiroLancamento[];
}

export type StatusValidacaoArea =
  | 'ok'
  | 'sem_area'
  | 'sem_snapshot'
  | 'p1_aberto'
  | 'p1_fechado_sem_snap'
  | 'incompleto'
  | 'carregando';

export interface PainelConsultorDataResult {
  cabecas: number | null;
  pesoMedio: number | null;
  gmd: number | null;
  arrobas: number | null;
  desfrute: number | null;
  receita: number | null;
  desembolso: number | null;
  resultado: number | null;
  valorRebanhoMes: number | null;
  areaProdutivaMes: number | null;
  lotUaHa: number | null;
  kgHa: number | null;
  arrHa: number | null;
  statusArea: StatusValidacaoArea;
  faltandoCount: number;
  statusPilares: StatusPilares | null;
  /** False quando GLOBAL e nem todas as fazendas pec do cliente têm P1 fechado no(s) mês(es) avaliado(s). */
  dadosCompletos: boolean;
  /** Séries mensais Jan–Dez do cenário REALIZADO. null durante loading ou em incompletoOverride. */
  seriesMensais: {
    cabFin:             number[];
    cabMediaAcumulada:  number[];   // média Jan→mes, índice 1=Jan…12=Dez
    pesoMedioFin:       number[];
    arrobasProd:        number[];
    gmd:                number[];
    desfruteCab:        number[];
    valorRebFin:        number[];
  } | null;
  /** Séries mensais Jan–Dez do cenário META. null se não houver meta carregada. */
  seriesMeta: {
    cabFin:       number[];
    pesoMedioFin: number[];
    arrobasProd:  number[];
    gmd:          number[];
  } | null;
  /** Indicador de Cabeças/Rebanho com tudo pronto para o card e o modal. */
  cabecasIndicador: {
    label:     string;
    titulo:    string;
    subtitulo: string;
    valor:     number | null;
    deltaMes:  number | null;
    deltaAno:  number | null;
    serieAno:  number[];   // tamanho 13, índice 1=Jan…12=Dez (índice 0 = NaN)
  } | null;
  loading: boolean;
}

export function usePainelConsultorData({ ano, mes, viewMode = 'mes', carregarMeta = false, lancPecExterno, lancFinExterno }: Params): PainelConsultorDataResult {
  const { fazendaAtual, isGlobal } = useFazenda();
  const fazendaId = fazendaAtual?.id;
  const { clienteAtual } = useCliente();

  const { areaMensal, totalFazendasAtivas, fazendasAtivasCarregadas, fazendasComSnapPorMes, fazendasComP1PorMes, temP1FechadoPorMes, loading: loadingArea } = useSnapshotAreaAnual(
    ano,
    isGlobal ? undefined : fazendaId,
    isGlobal,
    clienteAtual?.id,
  );

  const {
    rawCategorias: viewDataRealizado,
    loading: loadingRebanho,
  } = useRebanhoOficial({ ano, cenario: 'realizado', global: isGlobal });

  const {
    rawCategorias: viewDataMetaRaw,
  } = useRebanhoOficial({ ano, cenario: 'meta', global: isGlobal, enabled: carregarMeta });

  const viewDataMeta = carregarMeta ? viewDataMetaRaw : null;

  const viewTotals = useMemo(
    () => totalizarViewPorMes(viewDataRealizado ?? []),
    [viewDataRealizado],
  );

  const viewTotalsMeta = useMemo(
    () => carregarMeta ? totalizarViewPorMes(viewDataMeta ?? []) : ({} as ReturnType<typeof totalizarViewPorMes>),
    [viewDataMeta, carregarMeta],
  );

  // Só usar externo quando tiver dado real — array vazio [] = ainda carregando
  const usarLancPecExterno = Array.isArray(lancPecExterno) && lancPecExterno.length > 0;
  const usarLancFinExterno = Array.isArray(lancFinExterno) && lancFinExterno.length > 0;

  const { lancamentos: lancPecInterno, loading: loadingLancInterno } =
    useLancamentos({ enabled: !usarLancPecExterno });

  const { lancamentos: lancFinInterno, loading: loadingFinInterno } =
    useFinanceiro({ enabled: !usarLancFinExterno });

  const lancPec    = usarLancPecExterno ? lancPecExterno! : lancPecInterno;
  const lancFin    = usarLancFinExterno ? lancFinExterno! : lancFinInterno;
  const loadingLanc = usarLancPecExterno ? false : loadingLancInterno;
  const loadingFin  = usarLancFinExterno ? false : loadingFinInterno;

  // Valor do Rebanho oficial — mesma fonte do PainelConsultorTab (sem fallback).
  // Array 13 posições: [0] = Dez ano anterior, [1..12] = Jan..Dez do ano.
  // Ausência de validado → NaN (propaga como null no consumidor via safe()).
  const [valorRebanhoMes, setValorRebanhoMes] = useState<number[]>(() => Array(13).fill(NaN));

  useEffect(() => {
    let cancelled = false;
    const cid = clienteAtual?.id;

    const load = async () => {
      const dezAnoAnterior = `${ano - 1}-12`;
      const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
      const todasMeses = [dezAnoAnterior, ...meses];

      if (isGlobal) {
        if (!cid) {
          if (!cancelled) setValorRebanhoMes(Array(13).fill(NaN));
          return;
        }
        const { data, error } = await supabase
          .from('vw_valor_rebanho_realizado_global_mensal' as any)
          .select('ano_mes, valor_total')
          .eq('cliente_id', cid)
          .in('ano_mes', todasMeses);
        if (cancelled) return;
        if (error || !data?.length) {
          setValorRebanhoMes(Array(13).fill(NaN));
          return;
        }
        const byMes = Object.fromEntries(
          (data as any[]).map(r => [r.ano_mes, Number(r.valor_total)]),
        );
        setValorRebanhoMes(
          todasMeses.map(m => (byMes[m] != null && !isNaN(byMes[m]) ? byMes[m] : NaN)),
        );
        return;
      }

      if (!fazendaId || fazendaId === '__global__') {
        if (!cancelled) setValorRebanhoMes(Array(13).fill(NaN));
        return;
      }
      const { data, error } = await supabase
        .from('valor_rebanho_realizado_validado' as any)
        .select('ano_mes, valor_total, status')
        .eq('fazenda_id', fazendaId)
        .in('ano_mes', todasMeses);
      if (cancelled) return;
      if (error || !data?.length) {
        setValorRebanhoMes(Array(13).fill(NaN));
        return;
      }
      const byMes = new Map<string, number>();
      for (const row of data as any[]) {
        if (row.status === 'validado') {
          byMes.set(row.ano_mes, Number(row.valor_total));
        }
      }
      setValorRebanhoMes(todasMeses.map(m => (byMes.has(m) ? byMes.get(m)! : NaN)));
    };

    load();
    return () => { cancelled = true; };
  }, [ano, isGlobal, fazendaId, clienteAtual?.id]);

  const mesRef = mes === 0 ? 12 : mes;
  const mesStr = `${ano}-${String(mesRef).padStart(2, '0')}`;
  const { status: statusPilares } = useStatusPilares(fazendaId, mesStr);

  const monthlyData = useMemo(
    () =>
      buildMonthlyDataFromView(
        viewTotals,
        viewDataRealizado ?? [],
        lancFin,
        lancPec,
        ano,
        0,
        valorRebanhoMes,
        isGlobal,
        areaMensal,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewTotals, viewDataRealizado, lancFin, lancPec, ano, isGlobal, areaMensal, valorRebanhoMes],
  );

  const monthlyDataMeta = useMemo(
    () =>
      carregarMeta && viewDataMeta && viewDataMeta.length > 0
        ? buildMonthlyDataFromView(
            viewTotalsMeta,
            viewDataMeta,
            [],
            [],
            ano,
            0,
            Array(13).fill(NaN),
            isGlobal,
            areaMensal,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewTotalsMeta, viewDataMeta, carregarMeta, ano, isGlobal, areaMensal],
  );

  const loading = loadingRebanho || loadingLanc || loadingFin || loadingArea;

  const idx = mesRef - 1;

  const statusArea: StatusValidacaoArea = (() => {
    if (loadingArea) return 'carregando';
    if (isGlobal) {
      // Aguardar query de fazendas ativas completar antes de julgar
      if (!fazendasAtivasCarregadas) return 'carregando';
      if (totalFazendasAtivas === 0) return 'sem_snapshot';
      const comP1  = fazendasComP1PorMes[idx] ?? 0;
      const comSnap = fazendasComSnapPorMes[idx] ?? 0;
      if (comP1 === 0) return 'ok';
      if (comSnap < comP1) return 'incompleto';
      if ((areaMensal[idx] ?? 0) <= 0) return 'sem_snapshot';
      return 'ok';
    }
    if ((areaMensal[idx] ?? 0) > 0) return 'ok';
    if (temP1FechadoPorMes[idx]) return 'p1_fechado_sem_snap';
    return 'p1_aberto';
  })();

  const faltandoCount = isGlobal
    ? Math.max(0, (fazendasComP1PorMes[idx] ?? 0) - (fazendasComSnapPorMes[idx] ?? 0))
    : 0;

  const safe = (v: number | null | undefined) =>
    v == null || isNaN(Number(v)) ? null : Number(v);

  const meanArr = (arr: number[]): number | null => {
    const valid = arr.filter(v => v != null && !isNaN(v));
    return valid.length > 0
      ? valid.reduce((s, v) => s + v, 0) / valid.length
      : null;
  };

  const sumArr = (arr: number[]): number =>
    arr.reduce((s, v) => s + (v == null || isNaN(v) ? 0 : v), 0);

  const sliceUpTo = (arr: number[], i: number): number[] => arr.slice(0, i + 1);

  const isPeriodo = viewMode === 'periodo';

  // ── Integridade do GLOBAL ──
  // dadosCompletos: no modo global, verificar se todas as fazendas pecuárias
  // possuem P1 fechado no(s) mês(es) avaliado(s).
  // Usa fazendasComP1PorMes (fonte: fechamento_pastos) — não depende do cache.
  const dadosCompletos = (() => {
    if (!isGlobal) return true;
    if (loading || !fazendasAtivasCarregadas) return true; // não julgar durante carregamento
    if (totalFazendasAtivas === 0) return true;
    if (isPeriodo) {
      for (let i = 0; i <= idx; i++) {
        const comP1 = fazendasComP1PorMes[i] ?? 0;
        if (comP1 < totalFazendasAtivas) return false;
      }
      return true;
    }
    const comP1 = fazendasComP1PorMes[idx] ?? 0;
    return comP1 >= totalFazendasAtivas;
  })();
  const incompletoOverride = isGlobal && !dadosCompletos && !loading;

  const kgHaPorMes = (monthlyData.pesoTotalFin ?? []).map((p, i) =>
    p > 0 && (areaMensal[i] ?? 0) > 0 ? p / areaMensal[i] : NaN
  );
  const kgHa = isPeriodo
    ? meanArr(sliceUpTo(kgHaPorMes, idx))
    : (!isNaN(kgHaPorMes[idx]) ? kgHaPorMes[idx] : null);

  // ── Cabeças/Rebanho oficial (1-based, length 13) ──
  // monthlyData.cabFin é 0-based (índice 0=Jan); converter para 1-based.
  const cabFinSerie13 = Array.from({ length: 13 }, (_, i) =>
    i === 0 ? NaN : (monthlyData.cabFin[i - 1] ?? NaN)
  );

  // Média acumulada Jan→m baseada em cabMediaMes = (cabIni+cabFin)/2
  const cabMediaAcumulada = Array.from({ length: 13 }, (_, i) => {
    if (i === 0) return NaN;
    const vals = monthlyData.cabMediaMes
      .slice(0, i)
      .filter(v => !isNaN(v) && v > 0);
    return vals.length > 0
      ? vals.reduce((s, v) => s + v, 0) / vals.length
      : NaN;
  });

  const cabSerie = isPeriodo ? cabMediaAcumulada : cabFinSerie13;
  const mesIdx = mes;
  const cabValorRaw = cabSerie[mesIdx];
  const cabValor = (cabValorRaw == null || isNaN(cabValorRaw)) ? null : cabValorRaw;

  const cabDeltaMes = (() => {
    if (mesIdx <= 1) return null;
    const curr = cabSerie[mesIdx];
    const prev = cabSerie[mesIdx - 1];
    if (curr == null || isNaN(curr) || prev == null || isNaN(prev) || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  })();

  const baseReturn: PainelConsultorDataResult = {
    cabecas: isPeriodo
      ? meanArr(sliceUpTo(monthlyData.cabFin, idx))
      : safe(monthlyData.cabFin[idx]),

    pesoMedio: isPeriodo
      ? (() => {
          const totalPeso = sumArr(sliceUpTo(monthlyData.pesoTotalFin, idx));
          const totalCab  = sumArr(sliceUpTo(monthlyData.cabFin, idx));
          return totalCab > 0 ? totalPeso / totalCab : null;
        })()
      : safe(monthlyData.pesoMedioFin[idx]),

    gmd: isPeriodo
      ? meanArr(sliceUpTo(monthlyData.gmd, idx))
      : safe(monthlyData.gmd[idx]),

    arrobas: isPeriodo
      ? sumArr(sliceUpTo(monthlyData.arrobasProd, idx))
      : safe(monthlyData.arrobasProd[idx]),

    desfrute: isPeriodo
      ? sumArr(sliceUpTo(monthlyData.desfruteCab, idx))
      : safe(monthlyData.desfruteCab[idx]),

    receita: isPeriodo
      ? sumArr(sliceUpTo(monthlyData.recPecComp, idx))
      : safe(monthlyData.recPecComp[idx]),

    desembolso: isPeriodo
      ? sumArr(sliceUpTo(monthlyData.custOper, idx))
      : safe(monthlyData.custOper[idx]),

    resultado: isPeriodo
      ? sumArr(sliceUpTo(monthlyData.resOper, idx))
      : safe(monthlyData.resOper[idx]),

    // Valor Rebanho e areaProdutivaMes: posição do mês selecionado — não soma, não média
    valorRebanhoMes: safe(monthlyData.valorRebFin[idx]),
    areaProdutivaMes: safe(areaMensal[idx]),

    lotUaHa: isPeriodo
      ? meanArr(sliceUpTo(monthlyData.lotUaHa, idx))
      : safe(monthlyData.lotUaHa[idx]),

    arrHa: isPeriodo
      ? meanArr(sliceUpTo(monthlyData.arrHa, idx))
      : safe(monthlyData.arrHa[idx]),

    kgHa,
    statusArea,
    faltandoCount,
    statusPilares: statusPilares ?? null,
    dadosCompletos,
    seriesMensais: monthlyData ? {
      cabFin:       monthlyData.cabFin,
      cabMediaAcumulada,
      pesoMedioFin: monthlyData.pesoMedioFin,
      arrobasProd:  monthlyData.arrobasProd,
      gmd:          monthlyData.gmd,
      desfruteCab:  monthlyData.desfruteCab,
      valorRebFin:  monthlyData.valorRebFin,
    } : null,
    seriesMeta: monthlyDataMeta ? {
      cabFin:       monthlyDataMeta.cabFin,
      pesoMedioFin: monthlyDataMeta.pesoMedioFin,
      arrobasProd:  monthlyDataMeta.arrobasProd,
      gmd:          monthlyDataMeta.gmd,
    } : null,
    cabecasIndicador: monthlyData ? {
      label:     isPeriodo ? 'REBANHO MÉDIO' : 'CABEÇAS',
      titulo:    isPeriodo ? 'Rebanho Médio no período' : 'Rebanho Final do mês',
      subtitulo: isPeriodo
        ? 'Quantidade média de cabeças no período selecionado'
        : 'Quantidade de cabeças no final do mês',
      valor:    cabValor,
      deltaMes: cabDeltaMes,
      deltaAno: null,   // preenchido pela V2Home via dadosAnoAnt temporariamente
      serieAno: cabSerie,
    } : null,
    loading,
  };

  if (incompletoOverride) {
    return {
      ...baseReturn,
      cabecas: null,
      pesoMedio: null,
      gmd: null,
      arrobas: null,
      desfrute: null,
      lotUaHa: null,
      kgHa: null,
      areaProdutivaMes: null,
      dadosCompletos: false,
      seriesMensais: null,
      seriesMeta: null,
      cabecasIndicador: null,
    };
  }

  return baseReturn;
}
