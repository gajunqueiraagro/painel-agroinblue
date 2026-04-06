
CREATE OR REPLACE FUNCTION public.guard_transferencia_conta_destino()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tipo_operacao = '3-Transferência' AND NEW.conta_destino_id IS NULL THEN
    RAISE EXCEPTION 'Transferência deve ter conta de destino obrigatoriamente.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_transferencia_destino
  BEFORE INSERT OR UPDATE ON public.financeiro_lancamentos_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_transferencia_conta_destino();
