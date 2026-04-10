
-- Add status_duplicidade and duplicado_de_id to financeiro_lancamentos_v2
ALTER TABLE public.financeiro_lancamentos_v2
  ADD COLUMN IF NOT EXISTS status_duplicidade text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS duplicado_de_id uuid REFERENCES public.financeiro_lancamentos_v2(id);

-- Index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_fin_lanc_v2_status_dup
  ON public.financeiro_lancamentos_v2 (status_duplicidade)
  WHERE status_duplicidade <> 'pendente';

CREATE INDEX IF NOT EXISTS idx_fin_lanc_v2_duplicado_de
  ON public.financeiro_lancamentos_v2 (duplicado_de_id)
  WHERE duplicado_de_id IS NOT NULL;
