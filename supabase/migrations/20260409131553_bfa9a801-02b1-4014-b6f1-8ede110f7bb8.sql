
-- Add tipo_documento column
ALTER TABLE public.financeiro_lancamentos_v2
ADD COLUMN tipo_documento text DEFAULT null;

-- Backfill: if nota_fiscal is populated, assume it's a Nota Fiscal
UPDATE public.financeiro_lancamentos_v2
SET tipo_documento = 'Nota Fiscal'
WHERE nota_fiscal IS NOT NULL AND nota_fiscal != '';
