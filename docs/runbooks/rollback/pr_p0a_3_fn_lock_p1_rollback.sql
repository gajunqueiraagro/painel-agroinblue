-- ROLLBACK R3 — Migration 3 (fn_lock_p1). Remove a funcao interna de lock.
-- Seguro apos garantir que nenhuma funcao/trigger em uso a invoca (P0-B introduz
--   callers; nesse cenario, remover apos os callers). Nao reabre grants.
DROP FUNCTION IF EXISTS public.fn_lock_p1(uuid, text);
