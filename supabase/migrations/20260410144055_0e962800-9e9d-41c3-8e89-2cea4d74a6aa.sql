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
  _diff_count int := 0;
  _doc_diverge boolean := false;
BEGIN
  -- Phase 1 (candidate search) already matched by fazenda + anoMes + fornecedor.
  -- This function is Phase 2: field-by-field classification.
  -- Fornecedor already matched at Phase 1 level, so we go straight to comparison.

  -- 1. Data pagamento
  IF _new_data_pagamento IS DISTINCT FROM _existing_data_pagamento THEN
    _diff_count := _diff_count + 1;
  END IF;

  -- 2. Valor
  IF round(coalesce(_new_valor,0)::numeric,2) <> round(coalesce(_existing_valor,0)::numeric,2) THEN
    _diff_count := _diff_count + 1;
  END IF;

  -- 3. Descrição/Produto
  IF lower(btrim(coalesce(_new_descricao,''))) IS DISTINCT FROM lower(btrim(coalesce(_existing_descricao,'')))
     AND (btrim(coalesce(_new_descricao,'')) <> '' OR btrim(coalesce(_existing_descricao,'')) <> '') THEN
    _diff_count := _diff_count + 1;
  END IF;

  -- 4. Subcentro
  IF lower(btrim(coalesce(_new_subcentro,''))) IS DISTINCT FROM lower(btrim(coalesce(_existing_subcentro,'')))
     AND (btrim(coalesce(_new_subcentro,'')) <> '' OR btrim(coalesce(_existing_subcentro,'')) <> '') THEN
    _diff_count := _diff_count + 1;
  END IF;

  -- 5. Número documento (only when both present)
  IF btrim(coalesce(_new_numero_documento,'')) <> '' AND btrim(coalesce(_existing_numero_documento,'')) <> '' THEN
    IF lower(btrim(_new_numero_documento)) <> lower(btrim(_existing_numero_documento)) THEN
      _doc_diverge := true;
      _diff_count := _diff_count + 1;
    END IF;
  END IF;

  -- 6. Tipo operação
  IF lower(btrim(coalesce(_new_tipo_operacao,''))) IS DISTINCT FROM lower(btrim(coalesce(_existing_tipo_operacao,'')))
     AND (btrim(coalesce(_new_tipo_operacao,'')) <> '' OR btrim(coalesce(_existing_tipo_operacao,'')) <> '') THEN
    _diff_count := _diff_count + 1;
  END IF;

  -- 7. Conta bancária
  IF _new_conta_bancaria_id IS DISTINCT FROM _existing_conta_bancaria_id THEN
    _diff_count := _diff_count + 1;
  END IF;

  -- Classification
  IF _diff_count = 0 THEN
    RETURN 'D1';
  ELSIF _diff_count <= 2 AND NOT _doc_diverge THEN
    RETURN 'D2';
  ELSIF _diff_count <= 3 THEN
    RETURN 'D3';
  ELSE
    RETURN 'LEGITIMO';
  END IF;
END;
$function$;