
-- Add cancelado column to separate status from origin
ALTER TABLE public.financeiro_lancamentos 
  ADD COLUMN IF NOT EXISTS cancelado boolean NOT NULL DEFAULT false;

-- Create index for performance on cancelado filter
CREATE INDEX IF NOT EXISTS idx_fin_lanc_cancelado 
  ON public.financeiro_lancamentos (cancelado) WHERE cancelado = false;

-- Restore any records previously marked as importacao_cancelada:
-- set cancelado=true and restore original origem_dado to 'importacao'
UPDATE public.financeiro_lancamentos 
  SET cancelado = true, origem_dado = 'importacao'
  WHERE origem_dado = 'importacao_cancelada';
