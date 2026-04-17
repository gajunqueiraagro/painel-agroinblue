ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS origem text;
CREATE INDEX IF NOT EXISTS idx_lancamentos_origem ON public.lancamentos(origem) WHERE origem IS NOT NULL;