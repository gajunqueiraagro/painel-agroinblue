/**
 * Hook para o Fluxo de Caixa — 12 linhas, jan-dez.
 * Base: data_pagamento + status_transacao = 'Conciliado'.
 * Saldo Inicial Jan = soma dos registros SALDO (EXPORT_APP_UNICO) de Dez do ano anterior.
 *
 * REGRA: O fluxo de caixa é SEMPRE GLOBAL (todas as fazendas),
 * independentemente da fazenda selecionada.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { isEntradaFinanceira, isSaidaFinanceira } from '@/lib/financeiro/filters';

interface FluxoLancamentoBase {
  status_transacao: string | null;
  data_pagamento: string | null;
  valor: number;
  tipo_operacao: string | null;
  macro_custo: string | null;
  produto: string | null;
  escopo_negocio: string | null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FluxoMensal {
  mes: number;
  label: string;
  saldoInicial: number;
  receitas: number;
  receitasPec: number;
  receitasAgri: number;
  receitasOutras: number;
  captacao: number;
  captacaoPec: number;
  captacaoAgri: number;
  aportes: number;
  totalEntradas: number;
  deducaoReceitas: number;
  desembolsoProdutivo: number;
  desembolsoPec: number;
  desembolsoAgri: number;
  reposicao: number;
  amortizacoes: number;
  amortizacoesPec: number;
  amortizacoesAgri: number;
  dividendos: number;
  totalSaidas: number;
  saldoFinal: number;
  saldoAcumulado: number;
}

export interface SaldoInicialAudit {
  fonte: string;
  periodo: string;
  qtdRegistros: number;
  contas: string[];
  somaTotal: number;
}

export interface FluxoCaixaResult {
  meses: FluxoMensal[];
  loading: boolean;
  saldoInicialAno: number;
  saldoInicialAusente: boolean;
  saldoInicialAudit: SaldoInicialAudit | null;
}

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

const isConciliado = (l: FluxoLancamentoBase) =>
  (l.status_transacao || '').toLowerCase().trim() === 'conciliado';

const datePagtoMes = (l: FluxoLancamentoBase): number | null => {
  if (!l.data_pagamento || l.data_pagamento.length < 7) return null;
  return Number(l.data_pagamento.substring(5, 7));
};

const datePagtoAno = (l: FluxoLancamentoBase): number | null => {
  if (!l.data_pagamento || l.data_pagamento.length < 4) return null;
  return Number(l.data_pagamento.substring(0, 4));
};

const normMacro = (l: FluxoLancamentoBase) =>
  (l.macro_custo || '').toLowerCase().trim();

const normEscopo = (l: FluxoLancamentoBase): 'pec' | 'agri' | 'outras' => {
  const e = (l.escopo_negocio || '').toLowerCase().trim();
  if (e.includes('pecuári') || e.includes('pecuaria') || e.includes('pec')) return 'pec';
  if (e.includes('agricul') || e.includes('agri')) return 'agri';
  return 'outras';
};

type CategoriaFluxo = 'receitas' | 'captacao' | 'aportes' | 'deducao' | 'desembolso' | 'reposicao' | 'amortizacoes' | 'dividendos';

function classificarEntrada(l: FluxoLancamentoBase): CategoriaFluxo {
  const macro = normMacro(l);
  if (macro.includes('financiamento') || macro.includes('captação') || macro.includes('captacao')) return 'captacao';
  if (macro.includes('aporte')) return 'aportes';
  return 'receitas';
}

function classificarSaida(l: FluxoLancamentoBase): CategoriaFluxo {
  const macro = normMacro(l);
  if (macro.includes('dedução') || macro.includes('deducao') || macro === 'dedução de receitas') return 'deducao';
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
  _lancamentosFinanceiros: unknown[],
  _rateioADM: unknown[],
  ano: number,
  mesAte: number,
) {
  const { fazendas } = useFazenda();
  const allFazendaIds = fazendas.filter(f => f.id !== '__global__').map(f => f.id);

  const [lancamentosGlobais, setLancamentosGlobais] = useState<FluxoLancamentoBase[]>([]);
  const [loadingLancamentos, setLoadingLancamentos] = useState(true);
  const [saldoInicialAno, setSaldoInicialAno] = useState<number>(0);
  const [saldoInicialAusente, setSaldoInicialAusente] = useState(false);
  const [saldoInicialAudit, setSaldoInicialAudit] = useState<SaldoInicialAudit | null>(null);
  const [loadingSaldo, setLoadingSaldo] = useState(true);

  const loadLancamentosGlobais = useCallback(async () => {
    if (allFazendaIds.length === 0) {
      setLancamentosGlobais([]);
      setLoadingLancamentos(false);
      return;
    }
    setLoadingLancamentos(true);
    try {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;

      while (true) {
        const { data } = await supabase
          .from('financeiro_lancamentos')
          .select('status_transacao, data_pagamento, valor, tipo_operacao, macro_custo, produto, escopo_negocio')
          .in('fazenda_id', allFazendaIds)
          .gte('data_pagamento', `${ano}-01-01`)
          .lte('data_pagamento', `${ano}-12-31`)
          .range(from, from + PAGE_SIZE - 1);

        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      setLancamentosGlobais(
        allData.map((r: any) => ({
          status_transacao: r.status_transacao,
          data_pagamento: r.data_pagamento ? String(r.data_pagamento) : null,
          valor: Number(r.valor) || 0,
          tipo_operacao: r.tipo_operacao,
          macro_custo: r.macro_custo,
          produto: r.produto,
          escopo_negocio: r.escopo_negocio,
        })),
      );
    } catch {
      setLancamentosGlobais([]);
    } finally {
      setLoadingLancamentos(false);
    }
  }, [ano, allFazendaIds.join(',')]);

  // Fetch saldo inicial GLOBAL de Dez do ano anterior (registros SALDO da EXPORT_APP_UNICO, sem filtro de fazenda)
  const loadSaldoInicial = useCallback(async () => {
    if (allFazendaIds.length === 0) {
      setSaldoInicialAno(0);
      setSaldoInicialAusente(true);
      setSaldoInicialAudit(null);
      setLoadingSaldo(false);
      return;
    }
    setLoadingSaldo(true);
    try {
      const anoAnterior = ano - 1;
      const anoMesDez = `${anoAnterior}-12`;
      const { data } = await supabase
        .from('financeiro_saldos_bancarios')
        .select('saldo_final, conta_banco')
        .in('fazenda_id', allFazendaIds)
        .eq('ano_mes', anoMesDez);

      if (data && data.length > 0) {
        const total = data.reduce((s, r) => s + (Number(r.saldo_final) || 0), 0);
        const contas = data.map(r => r.conta_banco).filter(Boolean);
        setSaldoInicialAno(total);
        setSaldoInicialAusente(false);
        setSaldoInicialAudit({
          fonte: 'financeiro_saldos_bancarios (SALDO da EXPORT_APP_UNICO)',
          periodo: anoMesDez,
          qtdRegistros: data.length,
          contas,
          somaTotal: total,
        });
      } else {
        setSaldoInicialAno(0);
        setSaldoInicialAusente(true);
        setSaldoInicialAudit({
          fonte: 'financeiro_saldos_bancarios (SALDO da EXPORT_APP_UNICO)',
          periodo: anoMesDez,
          qtdRegistros: 0,
          contas: [],
          somaTotal: 0,
        });
      }
    } catch {
      setSaldoInicialAno(0);
      setSaldoInicialAusente(true);
      setSaldoInicialAudit(null);
    } finally {
      setLoadingSaldo(false);
    }
  }, [ano, allFazendaIds.join(',')]);

  useEffect(() => {
    loadSaldoInicial();
    loadLancamentosGlobais();
  }, [loadSaldoInicial, loadLancamentosGlobais]);

  // Compute 12-line fluxo
  const meses = useMemo((): FluxoMensal[] => {
    const anoStr = String(ano);

    // Filter: conciliado + data_pagamento in the given year
    const conciliados = lancamentosGlobais.filter(l => {
      if (!isConciliado(l)) return false;
      const a = datePagtoAno(l);
      return a === ano;
    });

    // Group by month
    const byMes: Record<number, FluxoLancamentoBase[]> = {};
    for (let m = 1; m <= 12; m++) byMes[m] = [];
    for (const l of conciliados) {
      const m = datePagtoMes(l);
      if (m && m >= 1 && m <= 12) byMes[m].push(l);
    }

    // DEBUG AUDIT — temporary logs
    console.log(`[FLUXO-AUDIT] ano=${ano}, mesAte=${mesAte}`);
    console.log(`[FLUXO-AUDIT] Total lançamentos globais carregados: ${lancamentosGlobais.length}`);
    console.log(`[FLUXO-AUDIT] Total conciliados no ano: ${conciliados.length}`);
    for (const debugM of [11, 12]) {
      const mLancs = conciliados.filter(l => datePagtoMes(l) === debugM);
      const mEntradas = mLancs.filter(l => isEntradaFinanceira(l));
      const mSaidas = mLancs.filter(l => isSaidaFinanceira(l));
      const mIgnorados = mLancs.filter(l => !isEntradaFinanceira(l) && !isSaidaFinanceira(l));
      console.log(`[FLUXO-AUDIT] Mês ${debugM}: ${mLancs.length} conciliados | ${mEntradas.length} entradas (R$ ${mEntradas.reduce((s,l)=>s+Math.abs(l.valor),0).toFixed(2)}) | ${mSaidas.length} saídas (R$ ${mSaidas.reduce((s,l)=>s+Math.abs(l.valor),0).toFixed(2)}) | ${mIgnorados.length} ignorados`);
      if (mIgnorados.length > 0) {
        mIgnorados.forEach(l => console.log(`[FLUXO-AUDIT]   IGNORADO: tipo_operacao="${l.tipo_operacao}" valor=${l.valor} produto="${l.produto}"`));
      }
    }

    let saldoAcumulado = saldoInicialAno;
    const result: FluxoMensal[] = [];

    for (let m = 1; m <= 12; m++) {
      const lancs = byMes[m];
      const isAfterFilter = m > mesAte;

      let receitas = 0, receitasPec = 0, receitasAgri = 0, receitasOutras = 0;
      let captacao = 0, captacaoPec = 0, captacaoAgri = 0;
      let aportes = 0;
      let deducaoReceitas = 0;
      let desembolso = 0, desembolsoPec = 0, desembolsoAgri = 0;
      let reposicao = 0;
      let amortizacoes = 0, amortizacoesPec = 0, amortizacoesAgri = 0;
      let dividendos = 0;

      if (!isAfterFilter) {
        for (const l of lancs) {
          const val = Math.abs(l.valor);
          const escopo = normEscopo(l);
          if (isEntradaFinanceira(l)) {
            const cat = classificarEntrada(l);
            if (cat === 'receitas') {
              receitas += val;
              if (escopo === 'pec') receitasPec += val;
              else if (escopo === 'agri') receitasAgri += val;
              else receitasOutras += val;
            } else if (cat === 'captacao') {
              captacao += val;
              if (escopo === 'pec') captacaoPec += val;
              else captacaoAgri += val;
            } else {
              aportes += val;
            }
          } else if (isSaidaFinanceira(l)) {
            const cat = classificarSaida(l);
            if (cat === 'deducao') {
              deducaoReceitas += val;
            } else if (cat === 'desembolso') {
              desembolso += val;
              if (escopo === 'pec') desembolsoPec += val;
              else desembolsoAgri += val;
            } else if (cat === 'reposicao') {
              reposicao += val;
            } else if (cat === 'amortizacoes') {
              amortizacoes += val;
              if (escopo === 'pec') amortizacoesPec += val;
              else amortizacoesAgri += val;
            } else {
              dividendos += val;
            }
          }
        }
      }

      const totalEntradas = receitas + captacao + aportes;
      const totalSaidas = deducaoReceitas + desembolso + reposicao + amortizacoes + dividendos;
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
        receitasPec,
        receitasAgri,
        receitasOutras,
        captacao,
        captacaoPec,
        captacaoAgri,
        aportes,
        totalEntradas,
        desembolsoProdutivo: desembolso,
        desembolsoPec,
        desembolsoAgri,
        reposicao,
        amortizacoes,
        amortizacoesPec,
        amortizacoesAgri,
        dividendos,
        totalSaidas,
        saldoFinal,
        saldoAcumulado: isAfterFilter ? 0 : saldoAcumulado,
      });
    }

    return result;
  }, [lancamentosGlobais, ano, mesAte, saldoInicialAno]);

  return {
    meses,
    loading: loadingSaldo || loadingLancamentos,
    saldoInicialAno,
    saldoInicialAusente,
    saldoInicialAudit,
  } as FluxoCaixaResult;
}
