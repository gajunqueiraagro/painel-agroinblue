-- Rename nota_fiscal to numero_documento
ALTER TABLE public.financeiro_lancamentos_v2 
  RENAME COLUMN nota_fiscal TO numero_documento;