-- ROLLBACK R2 (Migração 2 - fn_rebaixar_p1_oficial). Rodar APOS R5 e R4 (que removem
--   os callers residual/RPC); senao a funcao interna ainda seria referenciada. Nao reabre grants.
DROP FUNCTION IF EXISTS public.fn_rebaixar_p1_oficial(uuid, text);
