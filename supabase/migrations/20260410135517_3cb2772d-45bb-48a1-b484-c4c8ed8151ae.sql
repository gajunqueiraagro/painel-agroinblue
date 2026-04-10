
CREATE OR REPLACE FUNCTION public.classificar_nivel_duplicidade(
  _new_data_pagamento date,
  _new_valor numeric,
  _new_tipo_operacao text,
  _new_conta_bancaria_id uuid,
  _new_favorecido_id uuid,
  _new_descricao text,
  _new_numero_documento text,
  _new_subcentro text,
  _existing_data_pagamento date,
  _existing_valor numeric,
  _existing_tipo_operacao text,
  _existing_conta_bancaria_id uuid,
  _existing_favorecido_id uuid,
  _existing_descricao text,
  _existing_numero_documento text,
  _existing_subcentro text
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE
  _nucleo_match boolean;
  _diff_count int := 0;
  _doc_diverge boolean := false;
BEGIN
  -- 1. Chave de colisão (nucleus)
  _nucleo_match := (
    _new_data_pagamento IS NOT DISTINCT FROM _existing_data_pagamento
    AND round(coalesce(_new_valor,0)::numeric,2) = round(coalesce(_existing_valor,0)::numeric,2)
    AND lower(btrim(coalesce(_new_tipo_operacao,''))) = lower(btrim(coalesce(_existing_tipo_operacao,'')))
    AND _new_conta_bancaria_id IS NOT DISTINCT FROM _existing_conta_bancaria_id
  );

  IF NOT _nucleo_match THEN
    RETURN 'LEGITIMO';
  END IF;

  -- 2. Fornecedor é BARREIRA DE ENTRADA: se diverge, é LEGÍTIMO (NOVO)
  IF _new_favorecido_id IS DISTINCT FROM _existing_favorecido_id THEN
    RETURN 'LEGITIMO';
  END IF;

  -- 3. Fornecedor bate — comparar diferenciadores secundários
  IF lower(btrim(coalesce(_new_descricao,''))) IS DISTINCT FROM lower(btrim(coalesce(_existing_descricao,'')))
     AND (btrim(coalesce(_new_descricao,'')) <> '' OR btrim(coalesce(_existing_descricao,'')) <> '') THEN
    _diff_count := _diff_count + 1;
  END IF;

  IF btrim(coalesce(_new_numero_documento,'')) <> '' AND btrim(coalesce(_existing_numero_documento,'')) <> '' THEN
    IF lower(btrim(_new_numero_documento)) <> lower(btrim(_existing_numero_documento)) THEN
      _doc_diverge := true;
      _diff_count := _diff_count + 1;
    END IF;
  END IF;

  IF lower(btrim(coalesce(_new_subcentro,''))) IS DISTINCT FROM lower(btrim(coalesce(_existing_subcentro,'')))
     AND (btrim(coalesce(_new_subcentro,'')) <> '' OR btrim(coalesce(_existing_subcentro,'')) <> '') THEN
    _diff_count := _diff_count + 1;
  END IF;

  IF _diff_count = 0 THEN
    RETURN 'D1';
  ELSIF _diff_count = 1 AND NOT _doc_diverge THEN
    RETURN 'D2';
  ELSIF _diff_count <= 2 THEN
    RETURN 'D3';
  ELSE
    RETURN 'LEGITIMO';
  END IF;
END;
$function$;
