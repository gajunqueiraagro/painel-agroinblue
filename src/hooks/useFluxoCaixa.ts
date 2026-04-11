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
import { useFazenda } from '@/contexts/FazendaContext';
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
  filtros?: FluxoFiltros,
) {
  const { fazendas } = useFazenda();
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const allFazendaIds = fazendas.filter(f => f.id !== '__global__').map(f => f.id);

  const [lancamentosGlobais, setLancamentosGlobais] = useState<FluxoLancamentoBase[]>([]);
  const [loadingLancamentos, setLoadingLancamentos] = useState(true);
  const [saldoInicialAno, setSaldoInicialAno] = useState<number>(0);
  const [saldoInicialAusente, setSaldoInicialAusente] = useState(false);
  const [saldoInicialAudit, setSaldoInicialAudit] = useState<SaldoInicialAudit | null>(null);
  const [loadingSaldo, setLoadingSaldo] = useState(true);

  const loadLancamentosGlobais = useCallback(async () => {
    if (!clienteId || allFazendaIds.length === 0) {
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
          .from('financeiro_lancamentos_v2')
          .select('status_transacao, data_pagamento, valor, tipo_operacao, macro_custo, descricao, escopo_negocio, centro_custo, subcentro, grupo_custo')
          .eq('cliente_id', clienteId)
          .eq('cancelado', false)
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
          produto: r.descricao,
          escopo_negocio: r.escopo_negocio,
          grupo_custo: r.grupo_custo,
          centro_custo: r.centro_custo,
          subcentro: r.subcentro,
        })),
      );
    } catch {
      setLancamentosGlobais([]);
    } finally {
      setLoadingLancamentos(false);
    }
  }, [ano, clienteId, allFazendaIds.join(',')]);

  // Fetch saldo inicial GLOBAL de Dez do ano anterior (V2)
  const loadSaldoInicial = useCallback(async () => {
    if (!clienteId || allFazendaIds.length === 0) {
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
        .from('financeiro_saldos_bancarios_v2')
        .select('saldo_final, conta_bancaria_id')
        .eq('cliente_id', clienteId)
        .eq('ano_mes', anoMesDez);

      if (data && data.length > 0) {
        const total = data.reduce((s, r) => s + (Number(r.saldo_final) || 0), 0);
        const contas = data.map(r => r.conta_bancaria_id).filter(Boolean);
        setSaldoInicialAno(total);
        setSaldoInicialAusente(false);
        setSaldoInicialAudit({
          fonte: 'financeiro_saldos_bancarios_v2',
          periodo: anoMesDez,
          qtdRegistros: data.length,
          contas,
          somaTotal: total,
        });
      } else {
        // Fallback: try legacy table
        const { data: legacyData } = await supabase
          .from('financeiro_saldos_bancarios')
          .select('saldo_final, conta_banco')
          .in('fazenda_id', allFazendaIds)
          .eq('ano_mes', anoMesDez);

        if (legacyData && legacyData.length > 0) {
          const total = legacyData.reduce((s, r) => s + (Number(r.saldo_final) || 0), 0);
          const contas = legacyData.map(r => r.conta_banco).filter(Boolean);
          setSaldoInicialAno(total);
          setSaldoInicialAusente(false);
          setSaldoInicialAudit({
            fonte: 'financeiro_saldos_bancarios (legado - fallback)',
            periodo: anoMesDez,
            qtdRegistros: legacyData.length,
            contas,
            somaTotal: total,
          });
        } else {
          setSaldoInicialAno(0);
          setSaldoInicialAusente(true);
          setSaldoInicialAudit({
            fonte: 'financeiro_saldos_bancarios_v2',
            periodo: anoMesDez,
            qtdRegistros: 0,
            contas: [],
            somaTotal: 0,
          });
        }
      }
    } catch {
      setSaldoInicialAno(0);
      setSaldoInicialAusente(true);
      setSaldoInicialAudit(null);
    } finally {
      setLoadingSaldo(false);
    }
  }, [ano, clienteId, allFazendaIds.join(',')]);

  useEffect(() => {
    loadSaldoInicial();
    loadLancamentosGlobais();
  }, [loadSaldoInicial, loadLancamentosGlobais]);

  // Compute 12-line fluxo
  const meses = useMemo((): FluxoMensal[] => {
    // Filter: realizado + data_pagamento in the given year
    const realizados = lancamentosGlobais.filter(l => {
      if (!isRealizado(l)) return false;
      const a = datePagtoAnoClass(l);
      if (a !== ano) return false;
      // Apply hierarchical filters
      if (filtros?.grupo && (l.grupo_custo || '') !== filtros.grupo) return false;
      if (filtros?.centro && (l.centro_custo || '') !== filtros.centro) return false;
      if (filtros?.subcentro && (l.subcentro || '') !== filtros.subcentro) return false;
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

  return {
    meses,
    loading: loadingSaldo || loadingLancamentos,
    saldoInicialAno,
    saldoInicialAusente,
    saldoInicialAudit,
    lancamentosGlobais,
  } as FluxoCaixaResult;
}
