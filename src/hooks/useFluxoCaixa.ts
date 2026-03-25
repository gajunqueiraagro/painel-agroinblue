/**
 * Hook para o Fluxo de Caixa — 13 linhas, jan-dez.
 * Base: data_pagamento + status_transacao = 'Conciliado'.
 * Saldo Inicial Jan = saldo final Dez do ano anterior (financeiro_resumo_caixa).
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import type { FinanceiroLancamento, RateioADM } from '@/hooks/useFinanceiro';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FluxoMensal {
  mes: number; // 1-12
  label: string;
  saldoInicial: number;
  receitas: number;
  captacao: number;
  aportes: number;
  totalEntradas: number;
  desembolsoProdutivo: number;
  reposicao: number;
  amortizacoes: number;
  dividendos: number;
  totalSaidas: number;
  saldoFinal: number;
  saldoAcumulado: number;
}

export interface FluxoCaixaData {
  meses: FluxoMensal[];
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

const isConciliado = (l: FinanceiroLancamento) =>
  (l.status_transacao || '').toLowerCase().trim() === 'conciliado';

const datePagtoMes = (l: FinanceiroLancamento): number | null => {
  if (!l.data_pagamento || l.data_pagamento.length < 7) return null;
  return Number(l.data_pagamento.substring(5, 7));
};

const datePagtoAno = (l: FinanceiroLancamento): number | null => {
  if (!l.data_pagamento || l.data_pagamento.length < 4) return null;
  return Number(l.data_pagamento.substring(0, 4));
};

const isEntrada = (l: FinanceiroLancamento) =>
  (l.tipo_operacao || '').startsWith('1');

const isSaida = (l: FinanceiroLancamento) =>
  (l.tipo_operacao || '').startsWith('2');

const normMacro = (l: FinanceiroLancamento) =>
  (l.macro_custo || '').toLowerCase().trim();

type CategoriaFluxo = 'receitas' | 'captacao' | 'aportes' | 'desembolso' | 'reposicao' | 'amortizacoes' | 'dividendos';

function classificarEntrada(l: FinanceiroLancamento): CategoriaFluxo {
  const macro = normMacro(l);
  if (macro.includes('financiamento') || macro.includes('captação') || macro.includes('captacao')) return 'captacao';
  if (macro.includes('aporte')) return 'aportes';
  return 'receitas';
}

function classificarSaida(l: FinanceiroLancamento): CategoriaFluxo {
  const macro = normMacro(l);
  if (macro.includes('reposição') || macro.includes('reposicao')) return 'reposicao';
  if (macro.includes('amortização') || macro.includes('amortizacao') || macro.includes('amortizaç')) return 'amortizacoes';
  if (macro.includes('dividendo') || macro.includes('retirada')) return 'dividendos';
  return 'desembolso';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function useFluxoCaixa(
  lancamentosFinanceiros: FinanceiroLancamento[],
  rateioADM: RateioADM[],
  ano: number,
  mesAte: number,
) {
  const { fazendaAtual, fazendas } = useFazenda();
  const fazendaId = fazendaAtual?.id;
  const isGlobal = fazendaId === '__global__';

  const [saldoInicialAno, setSaldoInicialAno] = useState<number>(0);
  const [loadingSaldo, setLoadingSaldo] = useState(true);

  const fazendaIds = useMemo(() => {
    if (isGlobal) return fazendas.filter(f => f.id !== '__global__').map(f => f.id);
    return fazendaId ? [fazendaId] : [];
  }, [fazendaId, isGlobal, fazendas]);

  // Fetch saldo final de Dez do ano anterior
  const loadSaldoInicial = useCallback(async () => {
    if (fazendaIds.length === 0) { setSaldoInicialAno(0); setLoadingSaldo(false); return; }
    setLoadingSaldo(true);
    try {
      const anoAnterior = ano - 1;
      const anoMesDez = `${anoAnterior}-12`;
      const { data } = await supabase
        .from('financeiro_resumo_caixa')
        .select('saldo_final_total')
        .in('fazenda_id', fazendaIds)
        .eq('ano_mes', anoMesDez);

      if (data && data.length > 0) {
        const total = data.reduce((s, r) => s + (Number(r.saldo_final_total) || 0), 0);
        setSaldoInicialAno(total);
      } else {
        setSaldoInicialAno(0);
      }
    } catch {
      setSaldoInicialAno(0);
    } finally {
      setLoadingSaldo(false);
    }
  }, [fazendaIds, ano]);

  useEffect(() => { loadSaldoInicial(); }, [loadSaldoInicial]);

  // Compute 13-line fluxo
  const meses = useMemo((): FluxoMensal[] => {
    const anoStr = String(ano);

    // Filter: conciliado + data_pagamento in the given year
    const conciliados = lancamentosFinanceiros.filter(l => {
      if (!isConciliado(l)) return false;
      const a = datePagtoAno(l);
      return a === ano;
    });

    // Group by month
    const byMes: Record<number, FinanceiroLancamento[]> = {};
    for (let m = 1; m <= 12; m++) byMes[m] = [];
    for (const l of conciliados) {
      const m = datePagtoMes(l);
      if (m && m >= 1 && m <= 12) byMes[m].push(l);
    }

    // Rateio ADM by month
    const rateioPorMes: Record<number, number> = {};
    for (const r of rateioADM) {
      if (r.anoMes.startsWith(anoStr)) {
        const m = Number(r.anoMes.substring(5, 7));
        rateioPorMes[m] = (rateioPorMes[m] || 0) + r.valorRateado;
      }
    }

    let saldoAcumulado = saldoInicialAno;
    const result: FluxoMensal[] = [];

    for (let m = 1; m <= 12; m++) {
      const lancs = byMes[m];
      const isAfterFilter = m > mesAte;

      let receitas = 0, captacao = 0, aportes = 0;
      let desembolso = 0, reposicao = 0, amortizacoes = 0, dividendos = 0;

      if (!isAfterFilter) {
        for (const l of lancs) {
          const val = Math.abs(l.valor);
          if (isEntrada(l)) {
            const cat = classificarEntrada(l);
            if (cat === 'receitas') receitas += val;
            else if (cat === 'captacao') captacao += val;
            else aportes += val;
          } else if (isSaida(l)) {
            const cat = classificarSaida(l);
            if (cat === 'desembolso') desembolso += val;
            else if (cat === 'reposicao') reposicao += val;
            else if (cat === 'amortizacoes') amortizacoes += val;
            else dividendos += val;
          }
        }
        // Add rateio ADM to desembolso
        desembolso += rateioPorMes[m] || 0;
      }

      const totalEntradas = receitas + captacao + aportes;
      const totalSaidas = desembolso + reposicao + amortizacoes + dividendos;
      const saldoInicial = m === 1 ? saldoInicialAno : result[m - 2].saldoFinal;
      const saldoFinal = isAfterFilter ? saldoInicial : saldoInicial + totalEntradas - totalSaidas;

      if (!isAfterFilter) {
        saldoAcumulado = saldoFinal;
      }

      result.push({
        mes: m,
        label: MESES_LABELS[m - 1],
        saldoInicial,
        receitas,
        captacao,
        aportes,
        totalEntradas,
        desembolsoProdutivo: desembolso,
        reposicao,
        amortizacoes,
        dividendos,
        totalSaidas,
        saldoFinal,
        saldoAcumulado: isAfterFilter ? 0 : saldoAcumulado,
      });
    }

    return result;
  }, [lancamentosFinanceiros, rateioADM, ano, mesAte, saldoInicialAno]);

  return { meses, loading: loadingSaldo, saldoInicialAno };
}
