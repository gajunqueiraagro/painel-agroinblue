
-- 1. Update hash function to include favorecido_id, subcentro, descricao, numero_documento
CREATE OR REPLACE FUNCTION public.compute_financeiro_lancamento_v2_hash(
  _cliente_id uuid, _fazenda_id uuid, _data_competencia date, _data_pagamento date,
  _valor numeric, _tipo_operacao text, _conta_bancaria_id uuid,
  _descricao text, _favorecido_id uuid, _documento text, _numero_documento text
)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT md5(concat_ws('|',
    coalesce(_cliente_id::text, ''),
    coalesce(_fazenda_id::text, ''),
    coalesce(_data_pagamento::text, ''),
    round(coalesce(_valor, 0)::numeric, 2)::text,
    lower(btrim(coalesce(_tipo_operacao, ''))),
    coalesce(_conta_bancaria_id::text, ''),
    coalesce(_favorecido_id::text, ''),
    lower(btrim(coalesce(_descricao, ''))),
    lower(btrim(coalesce(_numero_documento, '')))
  ));
$$;

-- 2. Update enforce trigger to include favorecido_id in comparison
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
         AND existing.favorecido_id IS NOT DISTINCT FROM NEW.favorecido_id
         AND lower(btrim(coalesce(existing.descricao, ''))) = lower(btrim(coalesce(NEW.descricao, '')))
         AND lower(btrim(coalesce(existing.numero_documento, ''))) = lower(btrim(coalesce(NEW.numero_documento, '')))
     ) THEN
    NEW.importado_duplicado := true;
  END IF;

  RETURN NEW;
END;
$function$;
