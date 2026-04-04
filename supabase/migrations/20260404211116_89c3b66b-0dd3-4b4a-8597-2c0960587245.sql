ALTER TABLE public.valor_rebanho_fechamento
ADD COLUMN IF NOT EXISTS peso_total_kg numeric DEFAULT 0;