import { useMemo } from 'react';
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
  loading: boolean;
}

const ZERO_13 = Array(13).fill(0) as number[];

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
        ZERO_13,
        isGlobal,
        areaMensal,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewTotals, viewDataRealizado, lancFin, lancPec, ano, isGlobal, areaMensal],
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

  const kgHaPorMes = (monthlyData.pesoTotalFin ?? []).map((p, i) =>
    p > 0 && (areaMensal[i] ?? 0) > 0 ? p / areaMensal[i] : NaN
  );
  const kgHa = isPeriodo
    ? meanArr(sliceUpTo(kgHaPorMes, idx))
    : (!isNaN(kgHaPorMes[idx]) ? kgHaPorMes[idx] : null);

  return {
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
    loading,
  };
}
