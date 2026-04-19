/**
 * Hook de status operacional para o HUB (aba Resumo).
 * Calcula o semáforo 🔴🟡🟢 para cada camada: Zootécnico, Financeiro, Econômico.
 *
 * Ajustes obrigatórios implementados:
 * 1. Saldo financeiro = saldo de caixa real(com saldo inicial), não apenas E-S.
 * 2. Status financeiro diferencia mês atual vs meses passados.
 * 3. Status zootécnico considera fechamento rebanho + peso + alocação pastos.
 * 4. Estrutura extensível para futuras exclusões operacionais no financeiro.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { calcSaldoMensalAcumulado, isEntrada, isSaida } from '@/lib/calculos';
import { isRealizado as isLancRealizado } from '@/lib/statusOperacional';
import { isPastoAtivoNoMes } from '@/hooks/usePastos';
import {
  calcFinanceiroFromLancamentos,
  isRealizado as isRealizadoFin,
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
  const { clienteAtual } = useCliente();
  const fazendaId = fazendaAtual?.id;
  const isGlobal = fazendaId === '__global__';
  const fazendaNaoPecuaria = !isGlobal && fazendaAtual?.tem_pecuaria === false;

  // DB-fetched data for status calculation
  const [fechamentoRebanho, setFechamentoRebanho] = useState<Record<string, string>>({}); // anoMes → status
  const [fechamentoPastos, setFechamentoPastos] = useState<Record<string, { total: number; fechados: number }>>({}); 
  const [finLancamentos, setFinLancamentos] = useState<FinanceiroLancamentoBase[]>([]);
  const [saldoInicialGlobal, setSaldoInicialGlobal] = useState(0);
  const [saldoInicialContas, setSaldoInicialContas] = useState<string[]>([]);
  const [saldoInicialRegistros, setSaldoInicialRegistros] = useState(0);
  const [loading, setLoading] = useState(true);

  // For global: only pecuária fazendas; for single: all
  const fazendaIds = useMemo(() => {
    if (isGlobal) return fazendas.filter(f => f.id !== '__global__' && f.tem_pecuaria !== false).map(f => f.id);
    return fazendaId ? [fazendaId] : [];
  }, [fazendaId, isGlobal, fazendas]);

  // Financeiro é sempre consolidado (todas as fazendas, incluindo ADM)
  const fazendaIdsFinanceiro = useMemo(() => {
    return fazendas.filter(f => f.id !== '__global__').map(f => f.id);
  }, [fazendas]);

  // Load status data
  const loadStatusData = useCallback(async () => {
    if (fazendaNaoPecuaria) { setLoading(false); return; }
    const idsZoo = fazendaIds; // pecuária only
    const idsFin = fazendaIdsFinanceiro; // all farms
    if (idsZoo.length === 0 && idsFin.length === 0) { setLoading(false); return; }
    setLoading(true);
    try {
      const anoStr = String(ano);
      const mesesRange = Array.from({ length: mesAte }, (_, i) => `${anoStr}-${String(i + 1).padStart(2, '0')}`);

      const [vrfResult, fpResult, flResult, saldoResult, pastosListResult] = await Promise.all([
        // Fechamento rebanho — only pecuária farms
        idsZoo.length > 0
          ? supabase
              .from('valor_rebanho_fechamento')
              .select('ano_mes, status, fazenda_id')
              .in('fazenda_id', idsZoo)
              .in('ano_mes', mesesRange)
          : Promise.resolve({ data: [] }),
        // Fechamento pastos — only pecuária farms (inclui pasto_id para filtragem por data_inicio)
        idsZoo.length > 0
          ? supabase
              .from('fechamento_pastos')
              .select('ano_mes, status, fazenda_id, pasto_id')
              .in('fazenda_id', idsZoo)
              .in('ano_mes', mesesRange)
          : Promise.resolve({ data: [] }),
        // Financeiro — ALL farms (including ADM)
        idsFin.length > 0
          ? supabase
              .from('financeiro_lancamentos_v2')
              .select('status_transacao, data_pagamento, valor, tipo_operacao, descricao')
              .eq('cliente_id', clienteAtual?.id || '')
              .eq('cancelado', false)
              .eq('sem_movimentacao_caixa', false)
              .gte('data_pagamento', `${anoStr}-01-01`)
              .lte('data_pagamento', `${anoStr}-12-31`)
              .limit(10000)
          : Promise.resolve({ data: [] }),
        // Saldo inicial — filtered by client's fazendas
        idsFin.length > 0 && clienteAtual?.id
          ? supabase
              .from('financeiro_saldos_bancarios_v2')
              .select('saldo_final, conta_bancaria_id')
              .eq('cliente_id', clienteAtual.id)
              .eq('ano_mes', `${ano - 1}-12`)
          : Promise.resolve({ data: [] }),
        // Lista de pastos com data_inicio para filtrar fechamentos por mês
        idsZoo.length > 0
          ? supabase
              .from('pastos')
              .select('id, data_inicio')
              .in('fazenda_id', idsZoo)
              .eq('ativo', true)
              .eq('entra_conciliacao', true)
          : Promise.resolve({ data: [] }),
      ]);

      // Process fechamento rebanho — per fazenda per month for accurate global consolidation
      const vrfMap: Record<string, string> = {};
      if (isGlobal && idsZoo.length > 0) {
        // Global: a month is only "fechado" if ALL pecuária farms have it fechado
        const byMonth = new Map<string, { total: Set<string>; fechados: Set<string> }>();
        (vrfResult.data || []).forEach((r: any) => {
          if (!byMonth.has(r.ano_mes)) byMonth.set(r.ano_mes, { total: new Set(), fechados: new Set() });
          const m = byMonth.get(r.ano_mes)!;
          m.total.add(r.fazenda_id);
          if (r.status === 'fechado') m.fechados.add(r.fazenda_id);
        });
        byMonth.forEach((v, anoMes) => {
          // All pecuária farms must have a record AND be fechado
          if (v.fechados.size >= idsZoo.length) vrfMap[anoMes] = 'fechado';
          else if (v.fechados.size > 0) vrfMap[anoMes] = 'parcial';
          else vrfMap[anoMes] = 'aberto';
        });
      } else {
        (vrfResult.data || []).forEach((r: any) => {
          const key = r.ano_mes;
          if (vrfMap[key] === undefined) vrfMap[key] = r.status;
          else if (vrfMap[key] === 'fechado' && r.status !== 'fechado') vrfMap[key] = r.status;
        });
      }
      setFechamentoRebanho(vrfMap);

      // Process fechamento pastos — filtra por data_inicio do pasto vs anoMes
      const pastoDataInicio = new Map<string, string | null>();
      ((pastosListResult as any).data || []).forEach((p: any) => {
        pastoDataInicio.set(p.id, p.data_inicio ?? null);
      });
      const fpMap: Record<string, { total: number; fechados: number }> = {};
      (fpResult.data || []).forEach((r: any) => {
        const key = r.ano_mes;
        // Pula fechamentos de pastos que não estavam ativos no mês (data_inicio > primeiro dia do mês)
        const dataInicio = pastoDataInicio.get(r.pasto_id);
        if (!isPastoAtivoNoMes({ data_inicio: dataInicio ?? null }, key)) return;
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
        produto: r.descricao || null,
      })));

      // Process saldo inicial global (mesma lógica do useFluxoCaixa)
      const saldoData = saldoResult.data || [];
      setSaldoInicialRegistros(saldoData.length);
      setSaldoInicialContas(saldoData.map((r: any) => r.conta_bancaria_id || '').filter(Boolean));
      setSaldoInicialGlobal(saldoData.reduce((s: number, r: any) => s + (Number(r.saldo_final) || 0), 0));
    } catch (e) {
      console.error('useResumoStatus load error', e);
    } finally {
      setLoading(false);
    }
  }, [fazendaIds, fazendaIdsFinanceiro, fazendaNaoPecuaria, ano, mesAte, isGlobal]);

  useEffect(() => { loadStatusData(); }, [loadStatusData]);

  // -------------------------------------------------------------------------
  // ZOOTÉCNICO
  // -------------------------------------------------------------------------
  const zootecnico = useMemo((): ResumoZootecnico => {
    // Fazenda não-pecuária: status especial
    if (fazendaNaoPecuaria) {
      return {
        rebanhoAtual: 0, totalEntradas: 0, totalSaidas: 0,
        status: { nivel: 'fechado', descricao: 'Fazenda selecionada não apresenta dados zootécnicos.' },
      };
    }

    const { saldoInicialAno } = calcSaldoMensalAcumulado(saldosIniciais, lancamentos, ano);
    const anoStr = String(ano);

    // Filter to period
    const filtrados = lancamentos.filter(l => {
      if (!isLancRealizado(l)) return false;
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
    let mesesFechados = 0;
    let mesesComDados = 0;

    for (let m = 1; m <= mesAte; m++) {
      const anoMes = `${anoStr}-${String(m).padStart(2, '0')}`;
      const rebanhoFechado = fechamentoRebanho[anoMes] === 'fechado';
      const pastoInfo = fechamentoPastos[anoMes];
      const pastosFechados = pastoInfo ? pastoInfo.total > 0 && pastoInfo.fechados === pastoInfo.total : false;

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
  }, [lancamentos, saldosIniciais, ano, mesAte, fechamentoRebanho, fechamentoPastos, fazendaNaoPecuaria]);

  // -------------------------------------------------------------------------
  // FINANCEIRO — FONTE ÚNICA: calcFinanceiroFromLancamentos
  // -------------------------------------------------------------------------
  const financeiro = useMemo((): ResumoFinanceiro => {
    const mesAtual = new Date().getMonth() + 1;
    const anoAtual = new Date().getFullYear();
    const anoStr = String(ano);

    const calc = calcFinanceiroFromLancamentos(finLancamentos, ano, mesAte);

    const resultado = calc.saldo; // Entradas - Saídas
    const caixaAtual = saldoInicialGlobal + resultado;
    const saldoCaixa = caixaAtual; // backward compat

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
      const todosConciliados = relevantes.every(l => isRealizadoFin(l));
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

    const anoMesSaldo = `${ano - 1}-12`;
    return {
      totalEntradas: calc.totalEntradas,
      totalSaidas: calc.totalSaidas,
      resultado,
      saldoInicial: saldoInicialGlobal,
      caixaAtual,
      saldoCaixa,
      status: { nivel, descricao },
      audit: {
        ...calc.audit,
        qtdEntradas: calc.qtdEntradas,
        qtdSaidas: calc.qtdSaidas,
        saldoOrigem: 'Saldo Inicial + Resultado (Entradas − Saídas)',
        saldoInicialPeriodo: `Dez/${ano - 1} (${anoMesSaldo})`,
        saldoInicialRegistros,
        saldoInicialContas,
      },
    };
  }, [finLancamentos, ano, mesAte, saldoInicialGlobal, saldoInicialRegistros, saldoInicialContas]);

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
