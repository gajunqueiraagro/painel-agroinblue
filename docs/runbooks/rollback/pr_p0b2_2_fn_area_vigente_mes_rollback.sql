-- ROLLBACK R2 (Migração 2 - fn_area_vigente_mes). Nao reabre anon/PUBLIC.
DROP FUNCTION IF EXISTS public.fn_area_vigente_mes(uuid, date);
