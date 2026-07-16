-- ROLLBACK R1 (Migração 1). Ultimo na ordem de rollback (6->1). Funcao nova -> drop puro.
DROP FUNCTION IF EXISTS public.fn_natureza_patrimonial_fazenda(uuid);
