ALTER TABLE public.meta_parametros_nutricao 
ADD COLUMN IF NOT EXISTS comercial_custo_cab numeric(10,2) DEFAULT 0;