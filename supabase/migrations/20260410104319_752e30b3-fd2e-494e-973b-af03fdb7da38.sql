
CREATE OR REPLACE FUNCTION public.resolve_classificacao_from_plano()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
  v_plano RECORD;
BEGIN
  -- Only act if subcentro is set
  IF NEW.subcentro IS NULL OR btrim(NEW.subcentro) = '' THEN
    RETURN NEW;
  END IF;

  -- Look up the official plano de contas entry (exact match with tipo_operacao)
  SELECT id, macro_custo, grupo_custo, centro_custo, escopo_negocio, tipo_operacao
  INTO v_plano
  FROM public.financeiro_plano_contas
  WHERE cliente_id = NEW.cliente_id
    AND ativo = true
    AND subcentro = NEW.subcentro
    AND tipo_operacao = NEW.tipo_operacao
  LIMIT 1;

  -- Fallback: match without tipo_operacao
  IF v_plano IS NULL THEN
    SELECT id, macro_custo, grupo_custo, centro_custo, escopo_negocio, tipo_operacao
    INTO v_plano
    FROM public.financeiro_plano_contas
    WHERE cliente_id = NEW.cliente_id
      AND ativo = true
      AND subcentro = NEW.subcentro
    LIMIT 1;
  END IF;

  IF v_plano IS NOT NULL THEN
    -- Always overwrite ALL hierarchy fields from official plan
    NEW.plano_conta_id := v_plano.id;
    NEW.macro_custo    := v_plano.macro_custo;
    NEW.grupo_custo    := v_plano.grupo_custo;
    NEW.centro_custo   := v_plano.centro_custo;
    NEW.escopo_negocio := v_plano.escopo_negocio;
  END IF;

  RETURN NEW;
END;
$function$;
