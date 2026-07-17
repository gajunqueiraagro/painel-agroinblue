-- ROLLBACK DUP-2. Remove somente a constraint (e o indice unico implicito). NAO toca dados.
ALTER TABLE public.fechamento_pastos
  DROP CONSTRAINT IF EXISTS fechamento_pastos_fazenda_pasto_ano_mes_key;
