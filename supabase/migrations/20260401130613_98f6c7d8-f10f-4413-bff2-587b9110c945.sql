
-- Add traceability columns to financeiro_lancamentos_v2
ALTER TABLE public.financeiro_lancamentos_v2
ADD COLUMN IF NOT EXISTS movimentacao_rebanho_id uuid REFERENCES public.lancamentos(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS origem_tipo text;

-- Index for deduplication checks
CREATE INDEX IF NOT EXISTS idx_fin_v2_mov_rebanho
ON public.financeiro_lancamentos_v2 (movimentacao_rebanho_id)
WHERE movimentacao_rebanho_id IS NOT NULL;
