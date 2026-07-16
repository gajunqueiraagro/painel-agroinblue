-- ROLLBACK R4 (Migração 4). Funcao nova -> drop puro.
DROP FUNCTION IF EXISTS public.fn_composicao_componentes_categoria_mes(uuid, text);
