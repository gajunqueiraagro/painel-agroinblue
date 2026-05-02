/**
 * usePainelGeralOficial
 * Hook agregador de leitura para V2Home (Visão Geral).
 * Regras:
 *  - Compõe apenas hooks oficiais existentes — zero query nova
 *  - Caixa é SEMPRE global (nunca por fazenda)
 *  - Sem dívida = endividamento 0 (dado válido)
 *  - Sem fallback inventado
 */
import { useMemo } from 'react';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useFinanciamentosPainel } from '@/hooks/useFinanciamentosPainel';

interface Params {
  clienteId: string;
  fazendaId: string;
  ano: number;
  mes: number;
}

export interface PainelGeralOficial {
  caixaAtual: {
    valor: number | null;
    saldoInicialAno: number | null;
    loading: boolean;
  };
  resultadoMes: {
    entradas: number | null;
    saidas: number | null;
    saldo: number | null;
    loading: boolean;
  };
  rebanhoAtual: {
    cabecas: number | null;
    pesoMedio: number | null;
    gmd: number | null;
    ua: number | null;
    loading: boolean;
  };
  endividamento: {
    valor: number;
    loading: boolean;
  };
  statusValidacao: 'ok' | 'pendente' | 'inconsistente';
  avisos: string[];
}

export function usePainelGeralOficial({ fazendaId, ano, mes }: Params): PainelGeralOficial {
  const isGlobal = fazendaId === '__global__';

  const {
    lancamentos,
    rateioADM,
    loading: loadingFin,
    indicadores,
  } = useFinanceiro();

  const mesAte = mes === 0 ? 12 : mes;
  const {
    meses: mesesFluxo,
    saldoInicialAno,
    loading: loadingFluxo,
  } = useFluxoCaixa(lancamentos, rateioADM, ano, mesAte);

  const caixaValor = useMemo(() => {
    if (loadingFluxo || mesesFluxo.length === 0) return null;
    const sorted = [...mesesFluxo].sort((a, b) => a.mes - b.mes);
    if (mes === 0) {
      return sorted[sorted.length - 1]?.saldoFinal ?? null;
    }
    return sorted.find(m => m.mes === mes)?.saldoFinal ?? null;
  }, [mesesFluxo, mes, loadingFluxo]);

  const resultadoEntradas = useMemo(() => {
    if (loadingFin || !indicadores?.resumoMensal) return null;
    if (mes === 0) {
      return indicadores.resumoMensal.reduce((s: number, r: { entradas: number }) => s + r.entradas, 0);
    }
    const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
    return indicadores.resumoMensal.find((r: { anoMes: string }) => r.anoMes === anoMes)?.entradas ?? null;
  }, [indicadores, mes, ano, loadingFin]);

  const resultadoSaidas = useMemo(() => {
    if (loadingFin || !indicadores?.resumoMensal) return null;
    if (mes === 0) {
      return indicadores.resumoMensal.reduce((s: number, r: { saidas: number }) => s + r.saidas, 0);
    }
    const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
    return indicadores.resumoMensal.find((r: { anoMes: string }) => r.anoMes === anoMes)?.saidas ?? null;
  }, [indicadores, mes, ano, loadingFin]);

  const resultadoSaldo = useMemo(() => {
    if (resultadoEntradas == null || resultadoSaidas == null) return null;
    return resultadoEntradas - resultadoSaidas;
  }, [resultadoEntradas, resultadoSaidas]);

  const {
    totaisPorMes,
    loading: loadingRebanho,
  } = useRebanhoOficial({ ano, cenario: 'realizado', global: isGlobal });

  const rebanhoMes = useMemo(() => {
    if (loadingRebanho || !totaisPorMes) return null;
    const mesRef = mes === 0 ? 12 : mes;
    // totaisPorMes pode ser array ou Map — normalizar
    // totaisPorMes pode ser array, Map, ou object — acessar via getFazendaMes se disponível
    const arr: Array<{ mes: number; cabecasFinal?: number; pesoMedioFinalKg?: number }> =
      Array.isArray(totaisPorMes) ? totaisPorMes : [];
    return arr.find(t => t.mes === mesRef) ?? null;
  }, [totaisPorMes, mes, loadingRebanho]);

  const {
    kpis: finKpis,
    loading: loadingFin2,
  } = useFinanciamentosPainel(ano, 'todos', mes === 0 ? 'todos' : mes);

  const avisos = useMemo(() => {
    const result: string[] = [];
    if (!isGlobal) {
      result.push('Caixa/fluxo financeiro é global; não existe saldo por fazenda.');
    }
    if (!loadingFluxo && caixaValor == null) {
      result.push('Fluxo de caixa sem dados');
    }
    if (!loadingRebanho && rebanhoMes == null) {
      result.push('Rebanho sem fechamento validado');
    }
    return result;
  }, [isGlobal, loadingFluxo, caixaValor, loadingRebanho, rebanhoMes]);

  const loading = loadingFin || loadingFluxo || loadingRebanho || loadingFin2;

  const statusValidacao = useMemo((): 'ok' | 'pendente' | 'inconsistente' => {
    if (loading) return 'pendente';
    if (avisos.length > 0) return 'inconsistente';
    return 'ok';
  }, [loading, avisos]);

  return {
    caixaAtual: {
      valor: caixaValor,
      saldoInicialAno: loadingFluxo ? null : (saldoInicialAno ?? null),
      loading: loadingFluxo,
    },
    resultadoMes: {
      entradas: resultadoEntradas,
      saidas: resultadoSaidas,
      saldo: resultadoSaldo,
      loading: loadingFin,
    },
    rebanhoAtual: {
      cabecas: rebanhoMes ? (rebanhoMes as any).cabecasFinal ?? null : null,
      pesoMedio: rebanhoMes ? (rebanhoMes as any).pesoMedioFinalKg ?? null : null,
      gmd: rebanhoMes ? (rebanhoMes as any).gmdKgCabDia ?? null : null,
      ua: rebanhoMes ? (rebanhoMes as any).uaMedia ?? null : null,
      loading: loadingRebanho,
    },
    endividamento: {
      valor: loadingFin2 ? 0 : (finKpis?.saldoDevedor?.total?.total ?? 0),
      loading: loadingFin2,
    },
    statusValidacao,
    avisos,
  };
}
