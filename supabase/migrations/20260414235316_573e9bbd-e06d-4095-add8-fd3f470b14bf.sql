ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS frigorifico text,
  ADD COLUMN IF NOT EXISTS pedido text,
  ADD COLUMN IF NOT EXISTS instrucao text,
  ADD COLUMN IF NOT EXISTS doc_acerto text;