
-- Add hash_importacao column for import dedup tracking
ALTER TABLE public.financeiro_lancamentos_v2 
ADD COLUMN IF NOT EXISTS hash_importacao TEXT;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_fin_v2_hash_importacao 
ON public.financeiro_lancamentos_v2 (hash_importacao) 
WHERE hash_importacao IS NOT NULL;
