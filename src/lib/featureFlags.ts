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
  /**
   * VITE_LISTA_PAGINADA_V2 — PR-FIN-LISTA-VENCIMENTO-03 · 2C-2B.
   *
   * OFF por padrão, e a variável NÃO está definida em ambiente nenhum: a
   * comparação com a string 'true' devolve false para ausente, vazio e qualquer
   * outro valor. Ligar exige um ato deliberado.
   *
   * OFF: `carregarPagina` baixa o conjunto (fetchAll) e fatia em memória —
   *      exatamente o que a tela faz hoje.
   * ON:  lista, contagem e totais vão ao servidor; a lista nunca baixa o
   *      conjunto inteiro.
   *
   * A tela ainda não consome `carregarPagina` — isso é a fase de interface.
   * Enquanto isso, virar a flag não muda nada do que está em produção.
   */
  LISTA_PAGINADA_V2: import.meta.env.VITE_LISTA_PAGINADA_V2 === 'true',
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
