
-- Guard: in closed months, only preco_kg can be updated on saldos_iniciais
CREATE OR REPLACE FUNCTION public.guard_saldos_iniciais_mes_fechado()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _ano_mes text;
  _is_closed boolean;
BEGIN
  -- Block INSERT without quantity (no orphan economic records)
  IF TG_OP = 'INSERT' AND (NEW.quantidade IS NULL OR NEW.quantidade <= 0) THEN
    RAISE EXCEPTION 'Não é permitido criar saldo inicial sem quantidade.';
  END IF;

  -- Build the ano_mes for January of the saldo year
  _ano_mes := NEW.ano || '-01';

  -- Check if month is closed (all pastos fechados for this fazenda+month)
  SELECT EXISTS (
    SELECT 1 FROM public.fechamento_pastos fp
    WHERE fp.fazenda_id = NEW.fazenda_id
      AND fp.ano_mes = _ano_mes
      AND fp.status = 'fechado'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.pastos p
    WHERE p.fazenda_id = NEW.fazenda_id
      AND p.ativo = true
      AND NOT EXISTS (
        SELECT 1 FROM public.fechamento_pastos fp2
        WHERE fp2.fazenda_id = NEW.fazenda_id
          AND fp2.pasto_id = p.id
          AND fp2.ano_mes = _ano_mes
          AND fp2.status = 'fechado'
      )
  ) INTO _is_closed;

  -- If month is not closed, allow everything
  IF NOT _is_closed THEN
    RETURN NEW;
  END IF;

  -- Month is closed: on UPDATE, only preco_kg can change
  IF TG_OP = 'UPDATE' THEN
    IF NEW.quantidade IS DISTINCT FROM OLD.quantidade THEN
      RAISE EXCEPTION 'Mês % está fechado. Quantidade não pode ser alterada no saldo inicial.', _ano_mes;
    END IF;
    IF NEW.peso_medio_kg IS DISTINCT FROM OLD.peso_medio_kg THEN
      RAISE EXCEPTION 'Mês % está fechado. Peso médio não pode ser alterado no saldo inicial.', _ano_mes;
    END IF;
    -- preco_kg change is allowed
    RETURN NEW;
  END IF;

  -- INSERT in closed month: block
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Mês % está fechado. Não é permitido inserir novos saldos iniciais.', _ano_mes;
  END IF;

  RETURN NEW;
END;
$function$;

-- Apply trigger
CREATE TRIGGER trg_guard_saldos_iniciais_mes_fechado
  BEFORE INSERT OR UPDATE ON public.saldos_iniciais
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_saldos_iniciais_mes_fechado();
