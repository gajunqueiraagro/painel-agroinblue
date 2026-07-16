-- PR-P1-GOV-REABERTURA-P0A — Migration 3: fn_lock_p1 (funcao interna de lock)
-- Advisory lock transacional por (fazenda, mes). Chave bigint (64 bits) via
--   hashtextextended do UUID completo + '|' + ano_mes. Colisao de hash gera apenas
--   contencao (serializacao), nunca corrupcao — a correcao nao depende de unicidade.
-- Uso INTERNO: chamada de dentro de RPCs SECURITY DEFINER e do trigger residual
--   futuro (P0-B). Lock unico, reentrante na transacao, sem deadlock.
-- Sem grant a authenticated / anon / PUBLIC (nao e chamada diretamente pelo cliente).

CREATE OR REPLACE FUNCTION public.fn_lock_p1(p_fazenda_id uuid, p_ano_mes text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE k bigint := hashtextextended(p_fazenda_id::text || '|' || p_ano_mes, 0);
BEGIN
  PERFORM pg_advisory_xact_lock(k);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_lock_p1(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_lock_p1(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_lock_p1(uuid, text) FROM authenticated;

COMMENT ON FUNCTION public.fn_lock_p1(uuid, text) IS
  'Lock por (fazenda,mes). Chave bigint (hashtextextended do UUID completo + mes). Colisao => apenas contencao, nunca corrupcao. Correcao nao depende de unicidade. Uso interno por RPCs SECDEF e trigger residual. Lock unico, reentrante, sem deadlock. Sem grant a authenticated/anon/PUBLIC.';
