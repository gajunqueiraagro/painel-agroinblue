
ALTER TABLE public.pastos ADD COLUMN IF NOT EXISTS ordem_exibicao integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pastos_ordem ON public.pastos (fazenda_id, ordem_exibicao, nome);
