-- ROLLBACK R3 (Migração 3 - fn_oficializar_p1). Nao reabre grants.
DROP FUNCTION IF EXISTS public.fn_oficializar_p1(uuid, text);
