-- ROLLBACK R2 (Migração 2). Funcao nova -> drop puro.
DROP FUNCTION IF EXISTS public.fn_uso_operacional_mes(uuid, text);
