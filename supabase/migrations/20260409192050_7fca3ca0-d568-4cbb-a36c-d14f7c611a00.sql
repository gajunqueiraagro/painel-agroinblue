
-- 1. Add flag column
ALTER TABLE public.financeiro_lancamentos_v2
ADD COLUMN IF NOT EXISTS importado_duplicado boolean NOT NULL DEFAULT false;

-- 2. Replace blocking trigger with flag-only trigger
CREATE OR REPLACE FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lote_importacao_id IS NOT NULL
     AND coalesce(NEW.cancelado, false) = false
     AND EXISTS (
       SELECT 1
       FROM public.financeiro_lancamentos_v2 existing
       WHERE existing.id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
         AND existing.lote_importacao_id IS NOT NULL
         AND coalesce(existing.cancelado, false) = false
         AND existing.cliente_id = NEW.cliente_id
         AND existing.fazenda_id = NEW.fazenda_id
         AND existing.data_pagamento IS NOT DISTINCT FROM NEW.data_pagamento
         AND round(existing.valor::numeric, 2) = round(NEW.valor::numeric, 2)
         AND lower(btrim(coalesce(existing.tipo_operacao, ''))) = lower(btrim(coalesce(NEW.tipo_operacao, '')))
         AND existing.conta_bancaria_id IS NOT DISTINCT FROM NEW.conta_bancaria_id
     ) THEN
    NEW.importado_duplicado := true;
  END IF;

  RETURN NEW;
END;
$function$;
