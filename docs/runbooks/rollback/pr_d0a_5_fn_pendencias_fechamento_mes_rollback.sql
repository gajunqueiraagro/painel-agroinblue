-- ROLLBACK R5 (Migração 5). Funcao nova -> drop puro.
DROP FUNCTION IF EXISTS public.fn_pendencias_fechamento_mes(uuid, text);
