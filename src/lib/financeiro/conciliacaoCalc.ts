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
export type ConciliacaoStatus = 'realizado' | 'nao_conciliado' | 'pendente';

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
    const valor = Math.abs(Number(l.valor));
    const isTransf = isTransferenciaTipo(l.tipo_operacao);

    if (isTransf) {
      // Transfer: debit origin, credit destination
      if (l.conta_bancaria_id) {
        const keyOrig = `${l.conta_bancaria_id}|${l.ano_mes}`;
        if (!summary[keyOrig]) summary[keyOrig] = { entradas: 0, saidas: 0 };
        summary[keyOrig].saidas += valor;
      }
      if (l.conta_destino_id) {
        const keyDest = `${l.conta_destino_id}|${l.ano_mes}`;
        if (!summary[keyDest]) summary[keyDest] = { entradas: 0, saidas: 0 };
        summary[keyDest].entradas += valor;
      }
    } else {
      // Non-transfer: entries use conta_destino_id, exits use conta_bancaria_id
      if (l.conta_destino_id) {
        const key = `${l.conta_destino_id}|${l.ano_mes}`;
        if (!summary[key]) summary[key] = { entradas: 0, saidas: 0 };
        summary[key].entradas += valor;
      }
      if (l.conta_bancaria_id) {
        const key = `${l.conta_bancaria_id}|${l.ano_mes}`;
        if (!summary[key]) summary[key] = { entradas: 0, saidas: 0 };
        summary[key].saidas += valor;
      }
    }
  }

  return summary;
}

/**
 * Round to 2 decimal places to avoid floating-point noise.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  const diff = round2(saldoFinal - expected);
  return diff !== 0 ? diff : null;
}

/**
 * Derive the conciliation status from a difference and saldo extrato.
 * Regra absoluta: diferença = 0 → verde, diferença ≠ 0 → vermelho.
 */
export function getConciliacaoStatus(diferenca: number, saldoExtrato: number | null): ConciliacaoStatus {
  if (saldoExtrato === null) return 'pendente';
  const rounded = round2(diferenca);
  return rounded === 0 ? 'realizado' : 'nao_conciliado';
}
