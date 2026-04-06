
CREATE OR REPLACE FUNCTION public.guard_transferencia_conta_destino()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  -- For transfers, conta_destino_id is required
  IF NEW.tipo_operacao = '3-Transferência' AND NEW.conta_destino_id IS NULL THEN
    -- On INSERT: always block
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Transferência deve ter conta de destino obrigatoriamente.';
    END IF;
    -- On UPDATE: block only if OLD had a value (prevent removing existing destination)
    -- Allow updates to other fields on legacy records that already had NULL
    IF TG_OP = 'UPDATE' AND OLD.conta_destino_id IS NOT NULL THEN
      RAISE EXCEPTION 'Não é permitido remover a conta de destino de uma transferência.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
