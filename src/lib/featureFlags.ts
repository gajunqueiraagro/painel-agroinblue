/**
 * Mesa Operacional v2 · Feature Flags
 *
 * VITE_MESA_OPERACIONAL_V2: NEUTRALIZADA em PR-CLEANUP-REFERENCIAS-OPERACIONAIS-01.
 *   Era o kill switch da Mesa Operacional v2 ("Referências Operacionais"). O unico consumidor
 *   era o item condicional do menu em navGrupos.ts, removido junto com o tipo V2Section, o
 *   mapa de grupo, o mapa de periodo e a rota em V2Index.
 *   ATENCAO: a variavel estava definida como 'true' no ambiente da Vercel, apesar de ausente
 *   em todos os .env do repo — foi assim que a tela seguia visivel no proto. Defini-la como
 *   'true' agora NAO reativa nada: nao ha mais menu, tipo nem rota para reativar.
 *   Mantida aqui apenas como registro; remover no PR-CLEANUP-MESA-CLASSIFICACAO-02, junto
 *   com a remocao fisica dos arquivos em quarentena.
 *
 * Criada PR0.A em 2026-05-22.
 */

export const FEATURE_FLAGS = {
  MESA_OPERACIONAL_V2: import.meta.env.VITE_MESA_OPERACIONAL_V2 === 'true',
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
