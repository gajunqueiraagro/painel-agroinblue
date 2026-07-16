-- ROLLBACK R6 (Migração 6). Primeiro na ordem de rollback (6->1). Funcao nova -> drop puro.
DROP FUNCTION IF EXISTS public.fn_locais_sugeridos_mes(uuid, text);
