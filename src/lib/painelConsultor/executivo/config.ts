/**
 * Configuração do domínio executivo do PC-100.
 * Step 2.1* da Fase 0 — Runway.
 *
 * Thresholds em MESES. Vocabulário neutro intencional ('curto',
 * 'intermediario', etc.) — a leitura visual/storytelling decide a
 * linguagem narrativa depois (atencao/saudavel/etc).
 */

export const RUNWAY_CONFIG = {
  /** Runway ≤ thresholdCurto meses → status 'curto'. */
  thresholdCurto:         1,
  /** Runway ≤ thresholdIntermediario → status 'intermediario'. */
  thresholdIntermediario: 3,
  /** Runway ≤ thresholdAlongado → status 'alongado'. */
  thresholdAlongado:     12,
  /** Janela de meses para média móvel de saídas/déficit. */
  janelaMediaMeses:       3,
  /** Tolerância em meses para classificar tendência (gap futuro). */
  thresholdTendencia:     0.5,
} as const;

export type RunwayStatus =
  | 'curto'
  | 'intermediario'
  | 'alongado'
  | 'estavel'
  | null;
