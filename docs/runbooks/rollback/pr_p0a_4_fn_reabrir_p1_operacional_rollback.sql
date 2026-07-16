-- ROLLBACK R4 — Migration 4 (fn_reabrir_p1_operacional). Remove a RPC de reabertura.
-- Reversao limpa: a RPC nao persiste estado proprio alem do que ja registrou em
--   tabelas (dados permanecem). Nao reabre grants anon/PUBLIC.
DROP FUNCTION IF EXISTS public.fn_reabrir_p1_operacional(uuid, text, text);
