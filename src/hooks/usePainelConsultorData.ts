import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useSnapshotAreaAnual } from '@/hooks/useFechamentoArea';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useFinanceiro } from '@/hooks/useFinanceiro';
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
  loading: boolean;
}

export function usePainelConsultorData({ ano, mes, viewMode = 'mes' }: Params): PainelConsultorDataResult {
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

  const viewTotals = useMemo(
    () => totalizarViewPorMes(viewDataRealizado ?? []),
    [viewDataRealizado],
  );

  const { lancamentos: lancPec, loading: loadingLanc } = useLancamentos();
  const { lancamentos: lancFin, loading: loadingFin } = useFinanceiro();

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
    };
  }

  return baseReturn;
}
