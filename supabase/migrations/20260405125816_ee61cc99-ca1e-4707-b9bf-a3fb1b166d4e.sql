
-- Drop the overly aggressive unique index that blocks legitimate duplicate transactions
DROP INDEX IF EXISTS financeiro_lancamentos_v2_import_dedup_active_uk;

-- Create a non-unique index for performance (same columns, but allows duplicates)
CREATE INDEX IF NOT EXISTS financeiro_lancamentos_v2_import_lookup_idx
ON public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, data_pagamento, valor, tipo_operacao, conta_bancaria_id)
WHERE (COALESCE(cancelado, false) = false AND lote_importacao_id IS NOT NULL);
