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

export interface ResumoFinanceiro {
  totalEntradas: number;
  totalSaidas: number;
  saldoCaixa: number; // saldo real com saldo inicial
  status: StatusCamada;
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
  const [finLancamentos, setFinLancamentos] = useState<{ status_transacao: string | null; ano_mes: string; data_pagamento: string | null; valor: number; tipo_operacao: string | null }[]>([]);
  const [resumoCaixa, setResumoCaixa] = useState<{ ano_mes: string; entradas: number; saidas: number; saldo_final_total: number }[]>([]);
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

      const [vrfResult, fpResult, flResult, rcResult] = await Promise.all([
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
        // Financeiro - status conciliação
        supabase
          .from('financeiro_lancamentos')
          .select('status_transacao, ano_mes, data_pagamento')
          .in('fazenda_id', fazendaIds)
          .gte('ano_mes', mesesRange[0] || '')
          .lte('ano_mes', mesesRange[mesesRange.length - 1] || ''),
        // Resumo caixa
        supabase
          .from('financeiro_resumo_caixa')
          .select('ano_mes, entradas, saidas, saldo_final_total')
          .in('fazenda_id', fazendaIds)
          .in('ano_mes', mesesRange),
      ]);

      // Process fechamento rebanho
      const vrfMap: Record<string, string> = {};
      (vrfResult.data || []).forEach((r: any) => {
        const key = r.ano_mes;
        // For global: only "fechado" if ALL fazendas are fechado for this month
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
        ano_mes: r.ano_mes,
        data_pagamento: r.data_pagamento,
      })));

      setResumoCaixa((rcResult.data || []).map((r: any) => ({
        ano_mes: r.ano_mes,
        entradas: Number(r.entradas) || 0,
        saidas: Number(r.saidas) || 0,
        saldo_final_total: Number(r.saldo_final_total) || 0,
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
  // FINANCEIRO
  // -------------------------------------------------------------------------
  const financeiro = useMemo((): ResumoFinanceiro => {
    const mesAtual = new Date().getMonth() + 1;
    const anoAtual = new Date().getFullYear();
    const anoStr = String(ano);

    // Totals from financeiro_resumo_caixa (more accurate, includes saldo inicial)
    let totalEntradas = 0;
    let totalSaidas = 0;
    let saldoCaixa = 0;

    if (resumoCaixa.length > 0) {
      resumoCaixa.forEach(rc => {
        totalEntradas += rc.entradas;
        totalSaidas += rc.saidas;
      });
      // Saldo = último saldo_final_total no range
      const sorted = [...resumoCaixa].sort((a, b) => a.ano_mes.localeCompare(b.ano_mes));
      saldoCaixa = sorted[sorted.length - 1]?.saldo_final_total ?? 0;
    }

    // Status: check conciliation per month
    let mesesFechados = 0;
    let mesesComLancamentos = 0;

    for (let m = 1; m <= mesAte; m++) {
      const anoMes = `${anoStr}-${String(m).padStart(2, '0')}`;
      const lancsMes = finLancamentos.filter(l => l.ano_mes === anoMes);
      if (lancsMes.length === 0) continue;

      mesesComLancamentos++;

      // For current month: never auto-close
      if (ano === anoAtual && m === mesAtual) continue;

      // Check if all are conciliados (excluding operational exceptions)
      const relevantes = lancsMes.filter(l => !isExclusoOperacional(l.status_transacao));
      const todosConciliados = relevantes.every(
        l => (l.status_transacao || '').toLowerCase().trim() === 'conciliado'
      );
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

    return { totalEntradas, totalSaidas, saldoCaixa, status: { nivel, descricao } };
  }, [finLancamentos, resumoCaixa, ano, mesAte]);

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
