
-- Trigger to auto-resolve classification hierarchy from plano de contas
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

  -- Look up the official plano de contas entry
  SELECT id, macro_custo, centro_custo, grupo_custo, escopo_negocio, tipo_operacao
  INTO v_plano
  FROM public.financeiro_plano_contas
  WHERE cliente_id = NEW.cliente_id
    AND ativo = true
    AND subcentro = NEW.subcentro
    AND tipo_operacao = NEW.tipo_operacao
  LIMIT 1;

  -- If no exact match with tipo_operacao, try without it
  IF v_plano IS NULL THEN
    SELECT id, macro_custo, centro_custo, grupo_custo, escopo_negocio, tipo_operacao
    INTO v_plano
    FROM public.financeiro_plano_contas
    WHERE cliente_id = NEW.cliente_id
      AND ativo = true
      AND subcentro = NEW.subcentro
    LIMIT 1;
  END IF;

  IF v_plano IS NOT NULL THEN
    -- Always sync macro_custo and centro_custo from the official plan
    NEW.macro_custo := v_plano.macro_custo;
    NEW.centro_custo := v_plano.centro_custo;
    NEW.plano_conta_id := v_plano.id;

    -- Derive escopo_negocio from grupo_custo if not already set
    IF NEW.escopo_negocio IS NULL OR btrim(NEW.escopo_negocio) = '' THEN
      IF v_plano.escopo_negocio IS NOT NULL AND btrim(v_plano.escopo_negocio) <> '' THEN
        NEW.escopo_negocio := v_plano.escopo_negocio;
      ELSE
        -- Derive from grupo_custo keywords
        IF lower(v_plano.grupo_custo) LIKE '%pecuári%' OR lower(v_plano.grupo_custo) LIKE '%pecuaria%' THEN
          NEW.escopo_negocio := 'pecuaria';
        ELSIF lower(v_plano.grupo_custo) LIKE '%agri%' THEN
          NEW.escopo_negocio := 'agricultura';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Create the trigger (runs BEFORE insert/update, before other triggers)
CREATE TRIGGER trg_resolve_classificacao_plano
  BEFORE INSERT OR UPDATE ON public.financeiro_lancamentos_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_classificacao_from_plano();
