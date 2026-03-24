ALTER TABLE public.fazendas ADD COLUMN codigo_importacao text;
CREATE UNIQUE INDEX fazendas_codigo_importacao_unique ON public.fazendas (codigo_importacao) WHERE codigo_importacao IS NOT NULL;