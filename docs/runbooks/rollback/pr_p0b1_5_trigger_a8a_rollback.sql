-- ROLLBACK R6 (Migração 5 - Trigger A8a). Primeiro na ordem de rollback (6->1).
-- Remove o trigger e a funcao de invalidacao. Nao reabre anon/PUBLIC.
DROP TRIGGER IF EXISTS trg_a8a_invalidar_snapshot ON public.fechamento_pastos;
DROP FUNCTION IF EXISTS public.fn_invalidar_snapshot_conjunto();
