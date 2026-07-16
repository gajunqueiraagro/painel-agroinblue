-- ROLLBACK R5 (Migração 4 - fn_materializar_conjunto_mes). Nao reabre anon/PUBLIC.
DROP FUNCTION IF EXISTS public.fn_materializar_conjunto_mes(uuid, text);
