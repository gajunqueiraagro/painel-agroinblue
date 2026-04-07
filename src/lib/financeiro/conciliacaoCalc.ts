/**
 * Shared reconciliation calculation — single source of truth.
 *
 * Both "Saldos Bancários Mensais" and "Conciliação Bancária" screens
 * MUST use this logic so the status is always consistent.
 */

import { isTransferenciaTipo } from './v2Transferencia';

/* ── Types ── */
export interface MovimentoResumo {
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

/** Status de conciliação único no sistema */
export type ConciliacaoStatus = 'realizado' | 'atencao' | 'nao_conciliado' | 'pendente';

/**
 * Only these status_transacao values count as "realised" for reconciliation.
 * Used as filter in Supabase queries and client-side checks.
 */
export const STATUS_REALIZADOS = ['realizado'] as const;

/**
 * Build a per-account/per-month movement summary from a list of lancamentos.
 * Transfers: debit origin, credit destination.
 */
export function buildMovSummary(lancamentos: MovimentoResumo[]): Record<string, MovSummary> {
  const summary: Record<string, MovSummary> = {};

  for (const l of lancamentos) {
    if (!l.conta_bancaria_id) continue;

    const key = `${l.conta_bancaria_id}|${l.ano_mes}`;
    if (!summary[key]) summary[key] = { entradas: 0, saidas: 0 };

    if (isTransferenciaTipo(l.tipo_operacao) && l.conta_destino_id) {
      // Transfer: always debit origin, credit destination
      summary[key].saidas += Number(l.valor);
      const destKey = `${l.conta_destino_id}|${l.ano_mes}`;
      if (!summary[destKey]) summary[destKey] = { entradas: 0, saidas: 0 };
      summary[destKey].entradas += Number(l.valor);
    } else {
      if (l.sinal > 0) summary[key].entradas += Number(l.valor);
      else summary[key].saidas += Number(l.valor);
    }
  }

  return summary;
}

/**
 * Calculate the reconciliation difference for a given account/month.
 * Returns the absolute difference, or null if no movements exist.
 *
 * Formula: expected = saldoInicial + entradas - saidas
 *          diff = |saldoFinal - expected|
 */
export function calcConciliacaoDiff(
  saldoInicial: number,
  saldoFinal: number,
  mov: MovSummary | undefined,
): number | null {
  if (!mov) return null;
  const expected = saldoInicial + mov.entradas - mov.saidas;
  const diff = Math.abs(saldoFinal - expected);
  return diff > 0.01 ? diff : null;
}

/**
 * Derive the conciliation status from a difference and saldo extrato.
 */
export function getConciliacaoStatus(diferenca: number, saldoExtrato: number | null): ConciliacaoStatus {
  if (saldoExtrato === null) return 'pendente';
  const abs = Math.abs(diferenca);
  if (abs < 0.01) return 'realizado';
  if (abs <= 100) return 'atencao';
  return 'nao_conciliado';
}
