/**
 * Status Operacional — FONTE ÚNICA DE VERDADE para lançamentos.
 *
 * CENÁRIOS:
 *   - 'meta'      → Planejamento oficial (somente consultor altera)
 *   - 'realizado'  → Operação (status_operacional define o estágio)
 *
 * STATUS OPERACIONAL (cenario='realizado'):
 *   Zootécnico: 'programado' | 'realizado'
 *   Financeiro: 'previsto' | 'programado' | 'agendado' | 'realizado'
 *
 * META: cenario='meta', status_operacional=NULL
 *
 * REGRA: Somente status 'realizado' impacta saldo, evolução, indicadores e dashboards.
 */

import type { Lancamento } from '@/types/cattle';

// ── Tipos ──

export type Cenario = 'meta' | 'realizado';

/** Status operacional válidos no cenário 'realizado' */
export type StatusOperacional = 'previsto' | 'programado' | 'agendado' | 'realizado';

/** Status zootécnico (subconjunto) */
export type StatusZootecnico = 'programado' | 'realizado';

/** Status financeiro (completo) */
export type StatusFinanceiro = 'previsto' | 'programado' | 'agendado' | 'realizado';

/**
 * Tipo unificado para filtro visual.
 * 'meta' é um cenário, não um status operacional, mas aparece como opção de filtro.
 */
export type FiltroVisual = StatusOperacional | 'meta';

// ── Labels ──

export const STATUS_LABEL: Record<StatusOperacional, string> = {
  previsto: 'Previsto',
  programado: 'Programado',
  agendado: 'Agendado',
  realizado: 'Realizado',
};

export const STATUS_DESCRIPTION: Record<StatusOperacional, string> = {
  previsto: 'Planejamento financeiro do cliente (não impacta caixa)',
  programado: 'Operação definida, ainda não executada',
  agendado: 'Operação agendada com data definida',
  realizado: 'Operação concluída (impacta rebanho e financeiro)',
};

// ── Options para selects ──

/** Opções operacionais para módulo zootécnico (sem Meta): Realizado, Programado */
export const STATUS_OPTIONS_ZOOTECNICO: { value: StatusZootecnico; label: string; labelCurto: string; color: string; bg: string; description: string }[] = [
  { value: 'realizado', label: 'Realizado', labelCurto: 'Realizado', color: 'text-green-800 dark:text-green-400', bg: 'bg-green-700', description: STATUS_DESCRIPTION.realizado },
  { value: 'programado', label: 'Programado', labelCurto: 'Programado', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-500', description: STATUS_DESCRIPTION.programado },
];

/** Opções para módulo financeiro: Realizado, Agendado, Programado, Previsto */
export const STATUS_OPTIONS_FINANCEIRO: { value: StatusFinanceiro; label: string; labelCurto: string; color: string; bg: string; description: string }[] = [
  { value: 'realizado', label: 'Realizado', labelCurto: 'Realizado', color: 'text-green-800 dark:text-green-400', bg: 'bg-green-700', description: STATUS_DESCRIPTION.realizado },
  { value: 'agendado', label: 'Agendado', labelCurto: 'Agendado', color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-500', description: STATUS_DESCRIPTION.agendado },
  { value: 'programado', label: 'Programado', labelCurto: 'Programado', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-500', description: STATUS_DESCRIPTION.programado },
  { value: 'previsto', label: 'Previsto', labelCurto: 'Previsto', color: 'text-cyan-700 dark:text-cyan-400', bg: 'bg-cyan-600', description: STATUS_DESCRIPTION.previsto },
];

/** Backwards-compatible: all status options (union) */
export const STATUS_OPTIONS = STATUS_OPTIONS_FINANCEIRO;

// ── META visual config ──

export const META_VISUAL = {
  label: 'Meta',
  labelCurto: 'Meta',
  color: 'text-orange-700 dark:text-orange-400',
  bg: 'bg-orange-500',
  dot: 'bg-orange-500',
  activeBorder: 'border-orange-400',
  activeBg: 'bg-orange-50 dark:bg-orange-950/30',
  badgeCls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400',
  description: 'Planejamento oficial do consultor. Não impacta saldo nem caixa.',
};

/** Opções completas para módulo zootécnico: Realizado, Programado, Meta */
export const STATUS_OPTIONS_ZOOTECNICO_COM_META: { value: StatusZootecnico | 'meta'; label: string; labelCurto: string; color: string; bg: string; description: string }[] = [
  { value: 'realizado', label: 'Realizado', labelCurto: 'Realizado', color: 'text-green-800 dark:text-green-400', bg: 'bg-green-700', description: STATUS_DESCRIPTION.realizado },
  { value: 'programado', label: 'Programado', labelCurto: 'Programado', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-500', description: STATUS_DESCRIPTION.programado },
  { value: 'meta', label: META_VISUAL.label, labelCurto: META_VISUAL.labelCurto, color: META_VISUAL.color, bg: META_VISUAL.bg, description: META_VISUAL.description },
];

// ── Getters ──

/** Retorna o cenário do lançamento */
export function getCenario(l: Lancamento): Cenario {
  return l.cenario || 'realizado';
}

/** Retorna o status_operacional do lançamento (pode ser undefined para META) */
export function getStatus(l: Lancamento): StatusOperacional | undefined {
  return l.statusOperacional as StatusOperacional | undefined;
}

/** Retorna o label de UI para um valor interno */
export function getStatusLabel(value: StatusOperacional | string | undefined | null): string {
  if (!value) return 'Meta';
  return STATUS_LABEL[value as StatusOperacional] || value;
}

// ── Predicados ──

/** Lançamento é META (cenario='meta')? */
export function isMeta(l: Lancamento): boolean {
  return getCenario(l) === 'meta';
}

/** Lançamento é Realizado (cenario='realizado' AND status='realizado')? — usado para saldo real */
export function isRealizado(l: Lancamento): boolean {
  return getCenario(l) === 'realizado' && l.statusOperacional === 'realizado';
}

/** @deprecated Use isRealizado instead. Kept for backward compatibility during migration. */
export function isConciliado(l: Lancamento): boolean {
  return isRealizado(l);
}

/** Lançamento é Programado? */
export function isProgramado(l: Lancamento): boolean {
  return getCenario(l) === 'realizado' && l.statusOperacional === 'programado';
}

/** Lançamento é Previsto (financeiro operacional)? */
export function isPrevisto(l: Lancamento): boolean {
  return getCenario(l) === 'realizado' && l.statusOperacional === 'previsto';
}

/** Lançamento é Agendado (financeiro operacional)? */
export function isAgendado(l: Lancamento): boolean {
  return getCenario(l) === 'realizado' && l.statusOperacional === 'agendado';
}

/** @deprecated Use isProgramado instead */
export function isConfirmado(l: Lancamento): boolean {
  return isProgramado(l);
}

// ── Filtros ──

/**
 * Filtra lançamentos que entram no SALDO REAL.
 * Somente cenario='realizado' AND status='realizado'.
 */
export function filtrarRealizados(lancamentos: Lancamento[]): Lancamento[] {
  return lancamentos.filter(isRealizado);
}

/**
 * Filtra lançamentos META.
 * cenario='meta'.
 */
export function filtrarMeta(lancamentos: Lancamento[]): Lancamento[] {
  return lancamentos.filter(isMeta);
}

/**
 * Filtra lançamentos por cenário/status.
 */
export function filtrarPorCenario(
  lancamentos: Lancamento[],
  cenario: 'todos' | 'realizado' | 'meta' | 'programado' | 'previsto' | 'agendado' | 'confirmado',
): Lancamento[] {
  switch (cenario) {
    case 'realizado': return filtrarRealizados(lancamentos);
    case 'meta': return filtrarMeta(lancamentos);
    case 'programado': return lancamentos.filter(isProgramado);
    case 'previsto': return lancamentos.filter(isPrevisto);
    case 'agendado': return lancamentos.filter(isAgendado);
    case 'confirmado': return lancamentos.filter(isProgramado); // backward compat
    case 'todos': return lancamentos;
  }
}

// ── Badge config ──

/** Badge config para exibição de status */
export function getStatusBadge(l: Lancamento) {
  if (isMeta(l)) {
    return { label: 'Meta', cls: META_VISUAL.badgeCls };
  }
  const st = l.statusOperacional;
  switch (st) {
    case 'previsto':
      return { label: 'Previsto', cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400' };
    case 'programado':
      return { label: 'Programado', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' };
    case 'agendado':
      return { label: 'Agendado', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400' };
    default:
      return { label: 'Realizado', cls: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400' };
  }
}
