/**
 * Shared reconciliation calculation — single source of truth.
 *
 * Both "Saldos Bancários Mensais" and "Conciliação Bancária" screens
 * MUST use this logic so the status is always consistent.
 */

import { isTransferenciaTipo } from './v2Transferencia';

/* ── Types ── */
export interface MovimentoResumo {
  id?: string;
  conta_bancaria_id: string | null;
  conta_destino_id: string | null;
  ano_mes: string;
  valor: number;
  sinal: number;
  tipo_operacao: string;
}

export interface MovSummary {
  entradas: number;
  saidas: number;
}

export interface ConciliacaoSaldoBase {
  conta_bancaria_id: string;
  ano_mes: string;
  saldo_inicial: number;
  saldo_final: number;
}

export interface ConciliacaoLancamentoBase {
  id: string;
  conta_bancaria_id: string | null;
  conta_destino_id: string | null;
  ano_mes: string;
  valor: number;
  tipo_operacao: string | null;
}

/** Status de conciliação único no sistema */
export type ConciliacaoStatus = 'realizado' | 'nao_conciliado' | 'pendente';

export interface ConciliacaoMensalResult {
  accountKey: string;
  anoMes: string;
  saldoInicial: number;
  entradasTerceiros: number;
  transferenciasRecebidas: number;
  totalEntradas: number;
  saidasTerceiros: number;
  transferenciasEnviadas: number;
  totalSaidas: number;
  saldoCalculado: number;
  saldoExtrato: number | null;
  diferenca: number;
  status: ConciliacaoStatus;
  quantidadeLancamentos: number;
  lancamentoIds: string[];
}

/**
 * Only these status_transacao values count as "realised" for reconciliation.
 * Used as filter in Supabase queries and client-side checks.
 */
export const STATUS_REALIZADOS = ['realizado'] as const;

/**
 * Round to 2 decimal places to avoid floating-point noise.
 */
export function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

export function belongsToConta(
  lanc: Pick<ConciliacaoLancamentoBase, 'conta_bancaria_id' | 'conta_destino_id'>,
  contaId: string,
) {
  if (contaId === '__all__') return true;
  return lanc.conta_bancaria_id === contaId || lanc.conta_destino_id === contaId;
}

/**
 * Build a per-account/per-month movement summary from a list of lancamentos.
 * Transfers: debit origin, credit destination.
 */
export function buildMovSummary(lancamentos: MovimentoResumo[]): Record<string, MovSummary> {
  const summary: Record<string, MovSummary> = {};

  for (const l of lancamentos) {
    const valor = roundCurrency(Math.abs(Number(l.valor)));
    const isTransf = isTransferenciaTipo(l.tipo_operacao);

    if (isTransf) {
      if (l.conta_bancaria_id) {
        const keyOrig = `${l.conta_bancaria_id}|${l.ano_mes}`;
        if (!summary[keyOrig]) summary[keyOrig] = { entradas: 0, saidas: 0 };
        summary[keyOrig].saidas = roundCurrency(summary[keyOrig].saidas + valor);
      }
      if (l.conta_destino_id) {
        const keyDest = `${l.conta_destino_id}|${l.ano_mes}`;
        if (!summary[keyDest]) summary[keyDest] = { entradas: 0, saidas: 0 };
        summary[keyDest].entradas = roundCurrency(summary[keyDest].entradas + valor);
      }
    } else {
      if (l.conta_destino_id) {
        const key = `${l.conta_destino_id}|${l.ano_mes}`;
        if (!summary[key]) summary[key] = { entradas: 0, saidas: 0 };
        summary[key].entradas = roundCurrency(summary[key].entradas + valor);
      }
      if (l.conta_bancaria_id) {
        const key = `${l.conta_bancaria_id}|${l.ano_mes}`;
        if (!summary[key]) summary[key] = { entradas: 0, saidas: 0 };
        summary[key].saidas = roundCurrency(summary[key].saidas + valor);
      }
    }
  }

  return summary;
}

/**
 * Calculate the reconciliation difference for a given account/month.
 * Returns the rounded difference value (positive = over, negative = under), or null if no movements.
 *
 * Formula: expected = saldoInicial + entradas - saidas
 *          diff = saldoFinal - expected
 */
export function calcConciliacaoDiff(
  saldoInicial: number,
  saldoFinal: number,
  mov: MovSummary | undefined,
): number | null {
  if (!mov) return null;
  const expected = saldoInicial + mov.entradas - mov.saidas;
  const diff = roundCurrency(saldoFinal - expected);
  return diff !== 0 ? diff : null;
}

/**
 * Derive the conciliation status from a difference and saldo extrato.
 * Regra absoluta: diferença = 0 → verde, diferença ≠ 0 → vermelho.
 */
export function getConciliacaoStatus(diferenca: number, saldoExtrato: number | null): ConciliacaoStatus {
  if (saldoExtrato === null) return 'pendente';
  const rounded = roundCurrency(diferenca);
  return rounded === 0 ? 'realizado' : 'nao_conciliado';
}

export function calcConciliacaoMensal({
  contaId,
  anoMes,
  saldoRows,
  lancamentos,
  fallbackSaldoInicial = 0,
}: {
  contaId: string;
  anoMes: string;
  saldoRows: ConciliacaoSaldoBase[];
  lancamentos: ConciliacaoLancamentoBase[];
  fallbackSaldoInicial?: number;
}): ConciliacaoMensalResult {
  const relevantSaldoRows = saldoRows.filter((row) => row.ano_mes === anoMes && row.conta_bancaria_id === contaId);
  const relevantLancamentos = lancamentos.filter((row) => row.ano_mes === anoMes && belongsToConta(row, contaId));

  let entradasTerceiros = 0;
  let transferenciasRecebidas = 0;
  let saidasTerceiros = 0;
  let transferenciasEnviadas = 0;

  for (const lancamento of relevantLancamentos) {
    const valor = roundCurrency(Math.abs(Number(lancamento.valor) || 0));

    if (isTransferenciaTipo(lancamento.tipo_operacao || '')) {
      if (lancamento.conta_destino_id === contaId) {
        transferenciasRecebidas = roundCurrency(transferenciasRecebidas + valor);
      } else if (lancamento.conta_bancaria_id === contaId) {
        transferenciasEnviadas = roundCurrency(transferenciasEnviadas + valor);
      }
      continue;
    }

    if (lancamento.conta_destino_id === contaId) {
      entradasTerceiros = roundCurrency(entradasTerceiros + valor);
    } else if (lancamento.conta_bancaria_id === contaId) {
      saidasTerceiros = roundCurrency(saidasTerceiros + valor);
    }
  }

  const saldoInicial = relevantSaldoRows.length > 0
    ? roundCurrency(relevantSaldoRows.reduce((sum, row) => sum + (Number(row.saldo_inicial) || 0), 0))
    : roundCurrency(fallbackSaldoInicial);

  const totalEntradas = roundCurrency(entradasTerceiros + transferenciasRecebidas);
  const totalSaidas = roundCurrency(saidasTerceiros + transferenciasEnviadas);
  const saldoCalculado = roundCurrency(saldoInicial + totalEntradas - totalSaidas);
  const saldoExtrato = relevantSaldoRows.length > 0
    ? roundCurrency(relevantSaldoRows.reduce((sum, row) => sum + (Number(row.saldo_final) || 0), 0))
    : null;
  const diferenca = saldoExtrato !== null ? roundCurrency(saldoExtrato - saldoCalculado) : 0;

  return {
    accountKey: contaId,
    anoMes,
    saldoInicial,
    entradasTerceiros,
    transferenciasRecebidas,
    totalEntradas,
    saidasTerceiros,
    transferenciasEnviadas,
    totalSaidas,
    saldoCalculado,
    saldoExtrato,
    diferenca,
    status: getConciliacaoStatus(diferenca, saldoExtrato),
    quantidadeLancamentos: relevantLancamentos.length,
    lancamentoIds: relevantLancamentos.map((row) => row.id),
  };
}

function normalizeDebugLabel(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDebugConciliacaoBancoBrasilCase({
  anoMes,
  accountLabel,
}: {
  anoMes: string;
  accountLabel?: string | null;
}) {
  return anoMes === '2020-11' && normalizeDebugLabel(accountLabel).includes('banco do brasil');
}
