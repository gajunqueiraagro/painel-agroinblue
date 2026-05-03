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
}

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
  statusPilares: StatusPilares | null;
  loading: boolean;
}

const ZERO_13 = Array(13).fill(0) as number[];

export function usePainelConsultorData({ ano, mes }: Params): PainelConsultorDataResult {
  const { fazendaAtual, isGlobal } = useFazenda();
  const fazendaId = fazendaAtual?.id;
  const { clienteAtual } = useCliente();

  const { areaMensal, loading: loadingArea } = useSnapshotAreaAnual(
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

  const safe = (v: number | null | undefined) =>
    v == null || isNaN(Number(v)) ? null : Number(v);

  const sumOrIdx = (arr: number[]): number | null => {
    if (mes === 0) return arr.reduce((s, v) => s + (isNaN(v) ? 0 : v), 0);
    return safe(arr[idx]);
  };

  return {
    cabecas: safe(monthlyData.cabFin[idx]),
    pesoMedio: safe(monthlyData.pesoMedioFin[idx]),
    gmd: safe(monthlyData.gmd[idx]),
    arrobas: sumOrIdx(monthlyData.arrobasProd),
    desfrute: safe(monthlyData.desfruteCab[idx]),
    receita: sumOrIdx(monthlyData.recPecComp),
    desembolso: sumOrIdx(monthlyData.custOper),
    resultado: sumOrIdx(monthlyData.resOper),
    valorRebanhoMes: safe(monthlyData.valorRebFin[idx]),
    areaProdutivaMes: safe(areaMensal[idx]),
    statusPilares: statusPilares ?? null,
    loading,
  };
}
