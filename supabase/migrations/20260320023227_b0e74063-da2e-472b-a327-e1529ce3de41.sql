ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS nota_fiscal text DEFAULT NULL;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS tipo_peso text DEFAULT 'vivo';