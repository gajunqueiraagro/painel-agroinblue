-- ════════════════════════════════════════════════════════════════════════
-- MIGRATION: UNIQUE index parcial em pastos (fazenda_id, nome) WHERE ativo
--
-- Objetivo: impedir criação de dois pastos com o mesmo nome (normalizado)
-- na mesma fazenda quando ambos estão ativos. Evita a duplicidade estrutural
-- que causou cache corrompido e producao_biologica negativa em 3 Muchachas.
--
-- LOWER(TRIM(nome)): garante case-insensitive e sem espaços fantasma.
--   "P_07" = "p_07" = "P_07 " → todos tratados como duplicata.
--
-- Parcial (WHERE ativo = true): permite pastos inativos com nome duplicado
-- por razões históricas, sem bloquear o sistema legado.
-- ════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX uidx_pastos_fazenda_nome_ativo
  ON public.pastos (fazenda_id, LOWER(TRIM(nome)))
  WHERE ativo = true;
