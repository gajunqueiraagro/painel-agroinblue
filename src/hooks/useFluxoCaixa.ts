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
import { normalizeDividendoSubcentro } from '@/lib/financeiro/planoContasBuilder';

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
          .select('id, status_transacao, data_pagamento, valor, tipo_operacao, macro_custo, descricao, escopo_negocio, centro_custo, subcentro, grupo_custo')
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
          id: r.id,
          status_transacao: r.status_transacao,
          data_pagamento: r.data_pagamento ? String(r.data_pagamento) : null,
          valor: Number(r.valor) || 0,
          tipo_operacao: r.tipo_operacao,
          macro_custo: r.macro_custo,
          produto: r.descricao,
          escopo_negocio: r.escopo_negocio,
          grupo_custo: r.grupo_custo,
          centro_custo: r.centro_custo,
          subcentro: normalizeDividendoSubcentro(r.subcentro) || r.subcentro,
        })),
      );
    } catch {
      setLancamentosGlobais([]);
    } finally {
      setLoadingLancamentos(false);
    }
  }, [ano, clienteId, allFazendaIds.join(',')]);

  // Fetch saldo inicial GLOBAL de Dez do ano anterior (V2)
  // Se não existir registro de saldo para Dez do ano anterior,
  // busca o último saldo disponível e encadeia com lançamentos até Dez.
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

      // 2) Try legacy for exact Dec of previous year
      const { data: legacyData } = await supabase
        .from('financeiro_saldos_bancarios')
        .select('saldo_final, conta_banco')
        .in('fazenda_id', allFazendaIds)
        .eq('ano_mes', anoMesDez);

      if (legacyData && legacyData.length > 0) {
        const total = legacyData.reduce((s, r) => s + (Number(r.saldo_final) || 0), 0);
        setSaldoInicialAno(total);
        setSaldoInicialAusente(false);
        setSaldoInicialAudit({ fonte: 'financeiro_saldos_bancarios (legado)', periodo: anoMesDez, qtdRegistros: legacyData.length, contas: legacyData.map(r => r.conta_banco).filter(Boolean), somaTotal: total });
        setLoadingSaldo(false);
        return;
      }

      // 3) FALLBACK: find the latest saldo before the target year and chain forward
      //    using lancamentos to compute Dec's final balance
      const computed = await computeSaldoFromChain(clienteId, allFazendaIds, ano);
      if (computed !== null) {
        setSaldoInicialAno(computed.total);
        setSaldoInicialAusente(false);
        setSaldoInicialAudit({
          fonte: `encadeamento desde ${computed.baseAnoMes}`,
          periodo: anoMesDez,
          qtdRegistros: computed.qtdRegistrosBase,
          contas: computed.contas,
          somaTotal: computed.total,
        });
      } else {
        setSaldoInicialAno(0);
        setSaldoInicialAusente(true);
        setSaldoInicialAudit({ fonte: 'nenhum registro encontrado', periodo: anoMesDez, qtdRegistros: 0, contas: [], somaTotal: 0 });
      }
    } catch {
      setSaldoInicialAno(0);
      setSaldoInicialAusente(true);
      setSaldoInicialAudit(null);
    } finally {
      setLoadingSaldo(false);
    }
  }, [ano, clienteId, allFazendaIds.join(',')]);

  /**
   * Finds the most recent saldo record before `ano` and chains forward
   * with lancamentos to compute the saldo_final of Dec(ano-1).
   */
  async function computeSaldoFromChain(
    cId: string,
    fazIds: string[],
    targetAno: number,
  ): Promise<{ total: number; baseAnoMes: string; qtdRegistrosBase: number; contas: string[] } | null> {
    const anoAnterior = targetAno - 1;
    const anoMesDez = `${anoAnterior}-12`;

    // Find latest V2 saldo before the target year
    const { data: latestV2 } = await supabase
      .from('financeiro_saldos_bancarios_v2')
      .select('ano_mes, saldo_final, conta_bancaria_id')
      .eq('cliente_id', cId)
      .lt('ano_mes', `${targetAno}-01`)
      .order('ano_mes', { ascending: false })
      .limit(50);

    // Find latest legacy saldo before the target year
    const { data: latestLegacy } = await supabase
      .from('financeiro_saldos_bancarios')
      .select('ano_mes, saldo_final, conta_banco')
      .in('fazenda_id', fazIds)
      .lt('ano_mes', `${targetAno}-01`)
      .order('ano_mes', { ascending: false })
      .limit(50);

    // Determine the most recent month with saldo data
    let baseAnoMes: string | null = null;
    let baseSaldo = 0;
    let qtdRegistrosBase = 0;
    let contas: string[] = [];

    const v2MaxMonth = latestV2 && latestV2.length > 0 ? latestV2[0].ano_mes : null;
    const legMaxMonth = latestLegacy && latestLegacy.length > 0 ? latestLegacy[0].ano_mes : null;

    if (v2MaxMonth && (!legMaxMonth || v2MaxMonth >= legMaxMonth)) {
      baseAnoMes = v2MaxMonth;
      const monthRows = latestV2!.filter(r => r.ano_mes === v2MaxMonth);
      baseSaldo = monthRows.reduce((s, r) => s + (Number(r.saldo_final) || 0), 0);
      qtdRegistrosBase = monthRows.length;
      contas = monthRows.map(r => r.conta_bancaria_id).filter(Boolean);
    } else if (legMaxMonth) {
      baseAnoMes = legMaxMonth;
      const monthRows = latestLegacy!.filter(r => r.ano_mes === legMaxMonth);
      baseSaldo = monthRows.reduce((s, r) => s + (Number(r.saldo_final) || 0), 0);
      qtdRegistrosBase = monthRows.length;
      contas = monthRows.map(r => r.conta_banco).filter(Boolean);
    }

    if (!baseAnoMes) return null;
    if (baseAnoMes === anoMesDez) {
      return { total: baseSaldo, baseAnoMes, qtdRegistrosBase, contas };
    }

    // Load lancamentos from baseAnoMes+1 through Dec of previous year
    const nextMonth = incrementAnoMes(baseAnoMes);
    const PAGE_SIZE = 1000;
    let allLancs: { data_pagamento: string; valor: number; tipo_operacao: string; status_transacao: string }[] = [];
    let from = 0;

    while (true) {
      const { data } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('data_pagamento, valor, tipo_operacao, status_transacao')
        .eq('cliente_id', cId)
        .eq('cancelado', false)
        .gte('data_pagamento', `${nextMonth}-01`)
        .lte('data_pagamento', `${anoAnterior}-12-31`)
        .range(from, from + PAGE_SIZE - 1);

      if (!data || data.length === 0) break;
      allLancs = allLancs.concat(data as any);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Chain: compute net per month from nextMonth to anoMesDez
    let saldo = baseSaldo;
    const months = getMonthRange(nextMonth, anoMesDez);

    for (const ym of months) {
      let entradas = 0;
      let saidas = 0;
      for (const l of allLancs) {
        if (!l.data_pagamento || (l.status_transacao || '').toLowerCase() !== 'realizado') continue;
        const lym = l.data_pagamento.substring(0, 7);
        if (lym !== ym) continue;
        const val = Math.abs(Number(l.valor) || 0);
        const tipo = (l.tipo_operacao || '').toLowerCase();
        if (tipo === 'entrada' || tipo === 'receita') entradas += val;
        else saidas += val;
      }
      saldo = saldo + entradas - saidas;
    }

    return { total: saldo, baseAnoMes, qtdRegistrosBase, contas };
  }

  function incrementAnoMes(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    if (m === 12) return `${y + 1}-01`;
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  }

  function getMonthRange(from: string, to: string): string[] {
    const result: string[] = [];
    let current = from;
    while (current <= to) {
      result.push(current);
      current = incrementAnoMes(current);
    }
    return result;
  }
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
    loadLancamentosGlobais();
  }, [loadSaldoInicial, loadLancamentosGlobais]);

  return {
    meses,
    loading: loadingSaldo || loadingLancamentos,
    saldoInicialAno,
    saldoInicialAusente,
    saldoInicialAudit,
    lancamentosGlobais,
    reload,
  } as FluxoCaixaResult;
}
