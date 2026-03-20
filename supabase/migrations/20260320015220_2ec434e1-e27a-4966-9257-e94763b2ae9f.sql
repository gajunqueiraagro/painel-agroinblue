ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS preco_arroba numeric,
  ADD COLUMN IF NOT EXISTS peso_carcaca_kg numeric,
  ADD COLUMN IF NOT EXISTS bonus_precoce numeric,
  ADD COLUMN IF NOT EXISTS bonus_qualidade numeric,
  ADD COLUMN IF NOT EXISTS bonus_lista_trace numeric,
  ADD COLUMN IF NOT EXISTS desconto_qualidade numeric,
  ADD COLUMN IF NOT EXISTS desconto_funrural numeric,
  ADD COLUMN IF NOT EXISTS outros_descontos numeric,
  ADD COLUMN IF NOT EXISTS acrescimos numeric,
  ADD COLUMN IF NOT EXISTS deducoes numeric,
  ADD COLUMN IF NOT EXISTS valor_total numeric;