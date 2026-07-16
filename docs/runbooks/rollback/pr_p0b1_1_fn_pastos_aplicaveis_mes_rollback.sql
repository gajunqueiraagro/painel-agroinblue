-- ROLLBACK R2 (Migração 1 - fn_pastos_aplicaveis_mes). Nao reabre anon/PUBLIC.
DROP FUNCTION IF EXISTS public.fn_pastos_aplicaveis_mes(uuid, text);
