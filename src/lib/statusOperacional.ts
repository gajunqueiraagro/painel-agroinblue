/**
 * Status Operacional — FONTE ÚNICA DE VERDADE para lançamentos zootécnicos.
 *
 * Valores internos (banco): 'previsto' | 'confirmado' | 'conciliado'
 * Labels na UI:
 *   - previsto   → Previsto
 *   - confirmado → Programado
 *   - conciliado → Realizado
 *
 * IMPORTANTE: Somente lançamentos com status 'conciliado' devem ser usados
 * nos cálculos de saldo, evolução, indicadores e dashboards.
 */

import type { Lancamento } from '@/types/cattle';

export type StatusOperacional = 'previsto' | 'confirmado' | 'conciliado';

/* ── Mapeamento global de labels ── */
export const STATUS_LABEL: Record<StatusOperacional, string> = {
  previsto: 'Previsto',
  confirmado: 'Programado',
  conciliado: 'Realizado',
};

export const STATUS_DESCRIPTION: Record<StatusOperacional, string> = {
  previsto: 'Planejamento / meta (não impacta operação nem financeiro)',
  confirmado: 'Operação já definida, ainda não executada',
  conciliado: 'Operação já realizada (impacta rebanho e financeiro)',
};

export const STATUS_OPTIONS: { value: StatusOperacional; label: string; labelCurto: string; color: string; bg: string; description: string }[] = [
  { value: 'conciliado', label: STATUS_LABEL.conciliado, labelCurto: 'Realizado', color: 'text-green-800 dark:text-green-400', bg: 'bg-green-700', description: STATUS_DESCRIPTION.conciliado },
  { value: 'confirmado', label: STATUS_LABEL.confirmado, labelCurto: 'Programado', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-500', description: STATUS_DESCRIPTION.confirmado },
  { value: 'previsto', label: STATUS_LABEL.previsto, labelCurto: 'Meta', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-500', description: STATUS_DESCRIPTION.previsto },
];

/** Retorna o status_operacional do lançamento (default: 'conciliado' para dados legados) */
export function getStatus(l: Lancamento): StatusOperacional {
  return (l.statusOperacional as StatusOperacional) || 'conciliado';
}

/** Retorna o label de UI para um valor interno */
export function getStatusLabel(value: StatusOperacional | string): string {
  return STATUS_LABEL[value as StatusOperacional] || value;
}

/** Lançamento é Conciliado (Realizado)? — usado para saldo real */
export function isConciliado(l: Lancamento): boolean {
  return getStatus(l) === 'conciliado';
}

/** Lançamento é Previsto (Meta)? */
export function isPrevisto(l: Lancamento): boolean {
  return getStatus(l) === 'previsto';
}

/** Lançamento é Confirmado (Programado)? (acompanhamento apenas) */
export function isConfirmado(l: Lancamento): boolean {
  return getStatus(l) === 'confirmado';
}

/**
 * Filtra lançamentos que entram no SALDO REAL (Realizado).
 * Somente status 'conciliado'.
 */
export function filtrarRealizados(lancamentos: Lancamento[]): Lancamento[] {
  return lancamentos.filter(isConciliado);
}

/**
 * Filtra lançamentos META (Previsto).
 */
export function filtrarMeta(lancamentos: Lancamento[]): Lancamento[] {
  return lancamentos.filter(isPrevisto);
}

/**
 * Filtra lançamentos por cenário.
 */
export function filtrarPorCenario(
  lancamentos: Lancamento[],
  cenario: 'todos' | 'realizado' | 'meta' | 'confirmado',
): Lancamento[] {
  switch (cenario) {
    case 'realizado': return filtrarRealizados(lancamentos);
    case 'meta': return filtrarMeta(lancamentos);
    case 'confirmado': return lancamentos.filter(isConfirmado);
    case 'todos': return lancamentos;
  }
}

/** Badge config para exibição de status */
export function getStatusBadge(l: Lancamento) {
  const st = getStatus(l);
  switch (st) {
    case 'previsto':
      return { label: STATUS_LABEL.previsto, cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400' };
    case 'confirmado':
      return { label: STATUS_LABEL.confirmado, cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' };
    default:
      return { label: STATUS_LABEL.conciliado, cls: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400' };
  }
}
