/**
 * Hook para o Fluxo de Caixa — 12 linhas, jan-dez.
 * Base: data_pagamento + status_transacao = 'Realizado'.
 * Saldo Inicial Jan = soma dos registros de saldo_final Dez do ano anterior (financeiro_saldos_bancarios_v2).
 *
 * REGRA: O fluxo de caixa é SEMPRE GLOBAL (todas as fazendas),
 * independentemente da fazenda selecionada.
 *
 * BASE OFICIAL: financeiro_lancamentos_v2 (V2)
 *
 * CLASSIFICAÇÃO: usa src/lib/financeiro/classificacao.ts como fonte única.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import {
  isRealizado,
  isEntrada as isEntradaClass,
  isSaida as isSaidaClass,
  classificarEntradaFluxo,
  classificarSaidaFluxo,
  classificarEntrada,
  classificarSaida,
  datePagtoMes as datePagtoMesClass,
  datePagtoAno as datePagtoAnoClass,
  type LancamentoClassificavel,
} from '@/lib/financeiro/classificacao';

interface FluxoLancamentoBase extends LancamentoClassificavel {
  id: string;
  produto: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FluxoMensal {
  mes: number;
  label: string;
  saldoInicial: number;
  // Entradas
  receitas: number;
  receitasPec: number;
  receitasAgri: number;
  receitasOutras: number;
  outrasEntradas: number;
  captacao: number;
  captacaoPec: number;
  captacaoAgri: number;
  aportes: number;
  totalEntradas: number;
  // Saídas
  deducaoReceitas: number;
  desembolsoProdutivo: number;
  desembolsoPec: number;
  desembolsoAgri: number;
  custeioPec: number;
  custoioAgri: number;
  investPec: number;
  investAgri: number;
  reposicao: number;
  despesasReposicao: number;
  amortizacoes: number;
  amortizacoesPec: number;
  amortizacoesAgri: number;
  dividendos: number;
  outrasSaidas: number;
  totalSaidas: number;
  // Saldos
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

export interface FluxoFiltros {
  grupo?: string | null;
  centro?: string | null;
  subcentro?: string | null;
}

export interface FluxoCaixaResult {
  meses: FluxoMensal[];
  loading: boolean;
  saldoInicialAno: number;
  saldoInicialAusente: boolean;
  saldoInicialAudit: SaldoInicialAudit | null;
  /** Raw lancamentos for extracting distinct filter values */
  lancamentosGlobais: FluxoLancamentoBase[];
  /** Force reload of lancamentos + saldos */
  reload: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function useFluxoCaixa(
  lancamentosFinanceiros: any[],
  _rateioADM: unknown[],
  ano: number,
  mesAte: number,
  filtros?: FluxoFiltros,
) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const [saldoInicialAno, setSaldoInicialAno] = useState<number>(0);
  const [saldoInicialAusente, setSaldoInicialAusente] = useState(false);
  const [saldoInicialAudit, setSaldoInicialAudit] = useState<SaldoInicialAudit | null>(null);
  const [loadingSaldo, setLoadingSaldo] = useState(true);

  const lancamentosGlobais = useMemo(() => {
    return lancamentosFinanceiros.filter(l => {
      const st = ((l as any).status_transacao || '').toLowerCase().trim();
      if (st !== 'realizado') return false;
      const ano_l = datePagtoAnoClass(l);
      if (ano_l !== ano) return false;
      return true;
    });
  }, [lancamentosFinanceiros, ano]);

  // Fetch saldo inicial GLOBAL de Dez do ano anterior (V2)
  // Se não existir registro de saldo para Dez do ano anterior,
  // busca o último saldo disponível e encadeia com lançamentos até Dez.
  const loadSaldoInicial = useCallback(async () => {
    if (!clienteId) {
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

      // 1) Try V2 for exact Dec of previous year
      const { data: v2Data } = await supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('saldo_final, conta_bancaria_id')
        .eq('cliente_id', clienteId)
        .eq('ano_mes', anoMesDez);

      if (v2Data && v2Data.length > 0) {
        const total = v2Data.reduce((s, r) => s + (Number(r.saldo_final) || 0), 0);
        setSaldoInicialAno(total);
        setSaldoInicialAusente(false);
        setSaldoInicialAudit({ fonte: 'financeiro_saldos_bancarios_v2', periodo: anoMesDez, qtdRegistros: v2Data.length, contas: v2Data.map(r => r.conta_bancaria_id).filter(Boolean), somaTotal: total });
        setLoadingSaldo(false);
        return;
      }

      // 2) Dez anterior não existe em v2 — tentar saldo_inicial de Jan do ano atual (primeiro registro da conta)
      const anoMesJan = `${ano}-01`;
      const { data: janData } = await supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('saldo_inicial, conta_bancaria_id')
        .eq('cliente_id', clienteId)
        .eq('ano_mes', anoMesJan);

      if (janData && janData.length > 0) {
        const total = janData.reduce((s, r) => s + (Number(r.saldo_inicial) || 0), 0);
        setSaldoInicialAno(total);
        setSaldoInicialAusente(false);
        setSaldoInicialAudit({
          fonte: 'financeiro_saldos_bancarios_v2',
          periodo: anoMesJan,
          qtdRegistros: janData.length,
          contas: janData.map(r => r.conta_bancaria_id).filter(Boolean),
          somaTotal: total,
        });
        setLoadingSaldo(false);
        return;
      }

      // 3) No record found — leave blank with warning
      setSaldoInicialAno(0);
      setSaldoInicialAusente(true);
      setSaldoInicialAudit({ fonte: 'nenhum registro encontrado', periodo: anoMesDez, qtdRegistros: 0, contas: [], somaTotal: 0 });
    } catch {
      setSaldoInicialAno(0);
      setSaldoInicialAusente(true);
      setSaldoInicialAudit(null);
    } finally {
      setLoadingSaldo(false);
    }
  }, [ano, clienteId]);



  useEffect(() => {
    loadSaldoInicial();
  }, [loadSaldoInicial]);

  // Compute 12-line fluxo
  const meses = useMemo((): FluxoMensal[] => {
    // Filter: realizado + data_pagamento in the given year
    const realizados = lancamentosGlobais.filter(l => {
      if (!isRealizado(l)) return false;
      const a = datePagtoAnoClass(l);
      if (a !== ano) return false;
      return true;
    });

    // Group by month
    const byMes: Record<number, FluxoLancamentoBase[]> = {};
    for (let m = 1; m <= 12; m++) byMes[m] = [];
    for (const l of realizados) {
      const m = datePagtoMesClass(l);
      if (m && m >= 1 && m <= 12) byMes[m].push(l);
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
      let custeioPec = 0, custoioAgri = 0, investPec = 0, investAgri = 0;
      let reposicao = 0;
      let amortizacoes = 0, amortizacoesPec = 0, amortizacoesAgri = 0;
      let dividendos = 0;

      if (!isAfterFilter) {
        for (const l of lancs) {
          const val = Math.abs(l.valor);

          if (isEntradaClass(l)) {
            // Classificação direta pelo classificador central (usa macro_custo + centro_custo)
            const catDash = classificarEntrada(l);
            const catFluxo = classificarEntradaFluxo(l);

            if (catFluxo === 'receitas') {
              receitas += val;
              if (catDash === 'Receitas Pecuárias') receitasPec += val;
              else if (catDash === 'Receitas Agricultura') receitasAgri += val;
              else receitasOutras += val;
            } else if (catFluxo === 'captacao') {
              captacao += val;
              if (catDash === 'Captação Financ. Agri.') captacaoAgri += val;
              else captacaoPec += val;
            } else {
              aportes += val;
            }
          } else if (isSaidaClass(l)) {
            const catFluxo = classificarSaidaFluxo(l);
            const catDash = classificarSaida(l);
            const macro = (l.macro_custo || '').toLowerCase().trim();

            if (catFluxo === 'deducao') {
              deducaoReceitas += val;
            } else if (catFluxo === 'desembolso') {
              desembolso += val;
              if (catDash === 'Desemb. Produtivo Agri.') desembolsoAgri += val;
              else desembolsoPec += val;
              if (macro === 'custeio produtivo') {
                if (catDash === 'Desemb. Produtivo Agri.') custoioAgri += val;
                else custeioPec += val;
              } else {
                if (catDash === 'Desemb. Produtivo Agri.') investAgri += val;
                else investPec += val;
              }
            } else if (catFluxo === 'reposicao') {
              reposicao += val;
            } else if (catFluxo === 'amortizacoes') {
              amortizacoes += val;
              if (catDash === 'Amortizações Fin. Agri.') amortizacoesAgri += val;
              else amortizacoesPec += val;
            } else {
              dividendos += val;
            }
          }
        }
      }

      const outrasEntradas = captacao + aportes;
      const totalEntradas = receitas + outrasEntradas;
      const outrasSaidas = reposicao + deducaoReceitas + amortizacoes + dividendos;
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
        outrasEntradas,
        captacao,
        captacaoPec,
        captacaoAgri,
        aportes,
        totalEntradas,
        deducaoReceitas,
        desembolsoProdutivo: desembolso,
        desembolsoPec,
        desembolsoAgri,
        custeioPec,
        custoioAgri,
        investPec,
        investAgri,
        reposicao,
        despesasReposicao: 0,
        amortizacoes,
        amortizacoesPec,
        amortizacoesAgri,
        dividendos,
        outrasSaidas,
        totalSaidas,
        saldoFinal,
        saldoAcumulado: isAfterFilter ? 0 : saldoAcumulado,
      });
    }

    return result;
  }, [lancamentosGlobais, ano, mesAte, saldoInicialAno, filtros?.grupo, filtros?.centro, filtros?.subcentro]);

  const reload = useCallback(() => {
    loadSaldoInicial();
  }, [loadSaldoInicial]);

  return {
    meses,
    loading: loadingSaldo,
    saldoInicialAno,
    saldoInicialAusente,
    saldoInicialAudit,
    lancamentosGlobais,
    reload,
  } as FluxoCaixaResult;
}
