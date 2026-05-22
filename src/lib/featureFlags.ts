/**
 * Mesa Operacional v2 · Feature Flags
 *
 * VITE_MESA_OPERACIONAL_V2: kill switch da Mesa Operacional v2 no front.
 *   false (padrão) = front antigo, schema novo coexiste sem ser usado.
 *   true           = expõe rota nova da Mesa (a partir do PR1).
 *
 * Criada PR0.A em 2026-05-22.
 */

export const FEATURE_FLAGS = {
  MESA_OPERACIONAL_V2: import.meta.env.VITE_MESA_OPERACIONAL_V2 === 'true',
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
