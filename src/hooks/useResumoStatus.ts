/**
 * Hook de status operacional para o HUB (aba Resumo).
 * Calcula o semáforo 🔴🟡🟢 para cada camada: Zootécnico, Financeiro, Econômico.
 *
 * Ajustes obrigatórios implementados:
 * 1. Saldo financeiro = saldo de caixa real (com saldo inicial), não apenas E-S.
 * 2. Status financeiro diferencia mês atual vs meses passados.
 * 3. Status zootécnico considera fechamento rebanho + peso + alocação pastos.
 * 4. Estrutura extensível para futuras exclusões operacionais no financeiro.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { calcSaldoMensalAcumulado, isEntrada, isSaida } from '@/lib/calculos';
import {
  calcFinanceiroFromLancamentos,
  isConciliado as isConciliadoFin,
  datePagtoAnoMes,
  type FinanceiroLancamentoBase,
} from '@/lib/financeiro/filters';
import { format, parseISO } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StatusNivel = 'aberto' | 'parcial' | 'fechado';

export interface StatusCamada {
  nivel: StatusNivel;
  descricao: string;
}

export interface ResumoZootecnico {
  rebanhoAtual: number;
  totalEntradas: number;
  totalSaidas: number;
  status: StatusCamada;
}

export interface FinanceiroAudit {
  base: string;
  filtroStatus: string;
  filtroData: string;
  classificacao: string;
  periodo: string;
  totalLancamentosFiltrados: number;
  qtdEntradas: number;
  qtdSaidas: number;
  saldoOrigem: string;
  saldoInicialPeriodo: string;
  saldoInicialRegistros: number;
  saldoInicialContas: string[];
}

export interface ResumoFinanceiro {
  totalEntradas: number;
  totalSaidas: number;
  resultado: number;
  saldoInicial: number;
  caixaAtual: number;
  saldoCaixa: number;
  status: StatusCamada;
  audit: FinanceiroAudit;
}

export interface ResumoEconomico {
  status: StatusCamada;
}

// ---------------------------------------------------------------------------
// Futuras exclusões operacionais (placeholder)
// ---------------------------------------------------------------------------

/**
 * Lista de condições que podem ser ignoradas no cálculo de fechamento financeiro.
 * Ex: lançamentos com status "Exceção Operacional" não travam o fechamento.
 * Por enquanto vazia — preparada para evolução sem refatorar a arquitetura.
 */
const EXCLUSOES_OPERACIONAIS_FINANCEIRO: string[] = [];

function isExclusoOperacional(_statusTransacao: string | null): boolean {
  if (!_statusTransacao) return false;
  return EXCLUSOES_OPERACIONAIS_FINANCEIRO.includes(_statusTransacao.toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useResumoStatus(
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
  ano: number,
  mesAte: number, // 1-12
) {
  const { fazendaAtual, fazendas } = useFazenda();
  const fazendaId = fazendaAtual?.id;
  const isGlobal = fazendaId === '__global__';

  // DB-fetched data for status calculation
  const [fechamentoRebanho, setFechamentoRebanho] = useState<Record<string, string>>({}); // anoMes → status
  const [fechamentoPastos, setFechamentoPastos] = useState<Record<string, { total: number; fechados: number }>>({}); 
  const [finLancamentos, setFinLancamentos] = useState<FinanceiroLancamentoBase[]>([]);
  const [saldoInicialGlobal, setSaldoInicialGlobal] = useState(0);
  const [saldoInicialContas, setSaldoInicialContas] = useState<string[]>([]);
  const [saldoInicialRegistros, setSaldoInicialRegistros] = useState(0);
  const [loading, setLoading] = useState(true);

  const fazendaIds = useMemo(() => {
    if (isGlobal) return fazendas.filter(f => f.id !== '__global__').map(f => f.id);
    return fazendaId ? [fazendaId] : [];
  }, [fazendaId, isGlobal, fazendas]);

  // Load status data
  const loadStatusData = useCallback(async () => {
    if (fazendaIds.length === 0) { setLoading(false); return; }
    setLoading(true);
    try {
      const anoStr = String(ano);
      const mesesRange = Array.from({ length: mesAte }, (_, i) => `${anoStr}-${String(i + 1).padStart(2, '0')}`);

      const [vrfResult, fpResult, flResult] = await Promise.all([
        // Fechamento rebanho (valor_rebanho_fechamento)
        supabase
          .from('valor_rebanho_fechamento')
          .select('ano_mes, status, fazenda_id')
          .in('fazenda_id', fazendaIds)
          .in('ano_mes', mesesRange),
        // Fechamento pastos
        supabase
          .from('fechamento_pastos')
          .select('ano_mes, status, fazenda_id')
          .in('fazenda_id', fazendaIds)
          .in('ano_mes', mesesRange),
        // Financeiro - lançamentos brutos (fonte única de verdade)
        // Filtra por ano via data_pagamento para evitar limite de 1000 rows
        supabase
          .from('financeiro_lancamentos')
          .select('status_transacao, data_pagamento, valor, tipo_operacao')
          .in('fazenda_id', fazendaIds)
          .gte('data_pagamento', `${anoStr}-01-01`)
          .lte('data_pagamento', `${anoStr}-12-31`),
      ]);

      // Process fechamento rebanho
      const vrfMap: Record<string, string> = {};
      (vrfResult.data || []).forEach((r: any) => {
        const key = r.ano_mes;
        if (vrfMap[key] === undefined) vrfMap[key] = r.status;
        else if (vrfMap[key] === 'fechado' && r.status !== 'fechado') vrfMap[key] = r.status;
      });
      setFechamentoRebanho(vrfMap);

      // Process fechamento pastos
      const fpMap: Record<string, { total: number; fechados: number }> = {};
      (fpResult.data || []).forEach((r: any) => {
        const key = r.ano_mes;
        if (!fpMap[key]) fpMap[key] = { total: 0, fechados: 0 };
        fpMap[key].total++;
        if (r.status === 'fechado') fpMap[key].fechados++;
      });
      setFechamentoPastos(fpMap);

      setFinLancamentos((flResult.data || []).map((r: any) => ({
        status_transacao: r.status_transacao,
        data_pagamento: r.data_pagamento ? String(r.data_pagamento) : null,
        valor: Number(r.valor) || 0,
        tipo_operacao: r.tipo_operacao,
      })));
    } catch (e) {
      console.error('useResumoStatus load error', e);
    } finally {
      setLoading(false);
    }
  }, [fazendaIds, ano, mesAte]);

  useEffect(() => { loadStatusData(); }, [loadStatusData]);

  // -------------------------------------------------------------------------
  // ZOOTÉCNICO
  // -------------------------------------------------------------------------
  const zootecnico = useMemo((): ResumoZootecnico => {
    const { saldoInicialAno } = calcSaldoMensalAcumulado(saldosIniciais, lancamentos, ano);
    const anoStr = String(ano);

    // Filter to period
    const filtrados = lancamentos.filter(l => {
      try {
        const d = l.data;
        if (!d.startsWith(anoStr)) return false;
        const m = Number(d.substring(5, 7));
        return m <= mesAte;
      } catch { return false; }
    });

    const totalEntradas = filtrados.filter(l => isEntrada(l.tipo)).reduce((s, l) => s + l.quantidade, 0);
    const totalSaidas = filtrados.filter(l => isSaida(l.tipo)).reduce((s, l) => s + l.quantidade, 0);
    const rebanhoAtual = saldoInicialAno + totalEntradas - totalSaidas;

    // Status: check each month in range
    const mesAtual = new Date().getMonth() + 1;
    const anoAtual = new Date().getFullYear();

    let mesesFechados = 0;
    let mesesComDados = 0;

    for (let m = 1; m <= mesAte; m++) {
      const anoMes = `${anoStr}-${String(m).padStart(2, '0')}`;
      const rebanhoFechado = fechamentoRebanho[anoMes] === 'fechado';
      const pastoInfo = fechamentoPastos[anoMes];
      const pastosFechados = pastoInfo ? pastoInfo.total > 0 && pastoInfo.fechados === pastoInfo.total : false;

      // Consider month "fechado" if rebanho fechado AND pastos fechados
      if (rebanhoFechado && pastosFechados) {
        mesesFechados++;
      }
      mesesComDados++;
    }

    let nivel: StatusNivel = 'aberto';
    let descricao = 'Dados não preenchidos';
    if (mesesFechados > 0 && mesesFechados === mesesComDados) {
      nivel = 'fechado';
      descricao = 'Todos os meses fechados';
    } else if (mesesFechados > 0) {
      nivel = 'parcial';
      descricao = `${mesesFechados}/${mesesComDados} meses fechados`;
    }

    return { rebanhoAtual, totalEntradas, totalSaidas, status: { nivel, descricao } };
  }, [lancamentos, saldosIniciais, ano, mesAte, fechamentoRebanho, fechamentoPastos]);

  // -------------------------------------------------------------------------
  // FINANCEIRO — FONTE ÚNICA: calcFinanceiroFromLancamentos
  // -------------------------------------------------------------------------
  const financeiro = useMemo((): ResumoFinanceiro => {
    const mesAtual = new Date().getMonth() + 1;
    const anoAtual = new Date().getFullYear();
    const anoStr = String(ano);

    // Usar a mesma lógica do Dashboard: filtros compartilhados
    const calc = calcFinanceiroFromLancamentos(finLancamentos, ano, mesAte);

    // Saldo = entradas - saídas (calculado dos lançamentos, sem tabela resumo_caixa)
    // Documentação: saldo é diferença simples E/S do período, não inclui saldo inicial
    // de caixa (que pertence ao módulo Fluxo de Caixa Global).
    const saldoCaixa = calc.saldo;

    // Status: check conciliation per month using data_pagamento
    let mesesFechados = 0;
    let mesesComLancamentos = 0;

    for (let m = 1; m <= mesAte; m++) {
      const anoMes = `${anoStr}-${String(m).padStart(2, '0')}`;
      const lancsMes = finLancamentos.filter(l => {
        const am = datePagtoAnoMes(l);
        return am === anoMes;
      });
      if (lancsMes.length === 0) continue;

      mesesComLancamentos++;

      if (ano === anoAtual && m === mesAtual) continue;

      const relevantes = lancsMes.filter(l => !isExclusoOperacional(l.status_transacao));
      const todosConciliados = relevantes.every(l => isConciliadoFin(l));
      if (todosConciliados) mesesFechados++;
    }

    let nivel: StatusNivel = 'aberto';
    let descricao = 'Sem lançamentos';

    if (mesesComLancamentos > 0) {
      if (mesesFechados === mesesComLancamentos) {
        nivel = 'fechado';
        descricao = 'Todos os meses conciliados';
      } else if (mesesFechados > 0) {
        nivel = 'parcial';
        descricao = `${mesesFechados}/${mesesComLancamentos} meses conciliados`;
      } else {
        descricao = 'Pendente de conciliação';
      }
    }

    return {
      totalEntradas: calc.totalEntradas,
      totalSaidas: calc.totalSaidas,
      saldoCaixa,
      status: { nivel, descricao },
      audit: {
        ...calc.audit,
        qtdEntradas: calc.qtdEntradas,
        qtdSaidas: calc.qtdSaidas,
        saldoOrigem: 'Calculado: Entradas − Saídas (sem saldo inicial de caixa)',
      },
    };
  }, [finLancamentos, ano, mesAte]);

  // -------------------------------------------------------------------------
  // ECONÔMICO
  // -------------------------------------------------------------------------
  const economico = useMemo((): ResumoEconomico => {
    // Econômico fechado somente se zoo E fin estão fechados
    if (zootecnico.status.nivel === 'fechado' && financeiro.status.nivel === 'fechado') {
      return { status: { nivel: 'fechado', descricao: 'Base validada' } };
    }
    if (zootecnico.status.nivel !== 'aberto' || financeiro.status.nivel !== 'aberto') {
      return { status: { nivel: 'parcial', descricao: 'Aguardando fechamento das bases' } };
    }
    return { status: { nivel: 'aberto', descricao: 'Bases não fechadas' } };
  }, [zootecnico.status.nivel, financeiro.status.nivel]);

  return { zootecnico, financeiro, economico, loading };
}
