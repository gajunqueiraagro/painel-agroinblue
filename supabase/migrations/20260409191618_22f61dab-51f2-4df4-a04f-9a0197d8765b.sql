
-- Drop old function signature first
DROP FUNCTION IF EXISTS public.compute_financeiro_lancamento_v2_hash(uuid,uuid,date,date,numeric,text,uuid,text,uuid,text,text);

-- Recreate with renamed parameter
CREATE OR REPLACE FUNCTION public.compute_financeiro_lancamento_v2_hash(
  _cliente_id uuid, _fazenda_id uuid, _data_competencia date, _data_pagamento date,
  _valor numeric, _tipo_operacao text, _conta_bancaria_id uuid, _descricao text,
  _favorecido_id uuid, _documento text, _numero_documento text
)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT md5(concat_ws('|',
    coalesce(_cliente_id::text, ''),
    coalesce(_fazenda_id::text, ''),
    coalesce(_data_pagamento::text, ''),
    round(coalesce(_valor, 0)::numeric, 2)::text,
    lower(btrim(coalesce(_tipo_operacao, ''))),
    coalesce(_conta_bancaria_id::text, '')
  ));
$function$;

-- Recreate the trigger function that calls it (already using numero_documento from previous migration)
CREATE OR REPLACE FUNCTION public.set_financeiro_lancamento_v2_hash()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lote_importacao_id IS NOT NULL THEN
    NEW.hash_importacao := public.compute_financeiro_lancamento_v2_hash(
      NEW.cliente_id,
      NEW.fazenda_id,
      NEW.data_competencia,
      NEW.data_pagamento,
      NEW.valor,
      NEW.tipo_operacao,
      NEW.conta_bancaria_id,
      NEW.descricao,
      NEW.favorecido_id,
      NEW.documento,
      NEW.numero_documento
    );
  ELSE
    NEW.hash_importacao := NULL;
  END IF;

  RETURN NEW;
END;
$function$;
