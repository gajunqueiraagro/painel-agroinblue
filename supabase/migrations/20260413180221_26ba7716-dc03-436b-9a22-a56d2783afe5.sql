
-- Guard: valor_rebanho_fechamento requires P1 (pastos) to be officially closed
CREATE OR REPLACE FUNCTION public.guard_valor_rebanho_requer_p1_fechado()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _total_pastos int;
  _total_fechados int;
  _has_divergence boolean;
  _conciliacao jsonb;
BEGIN
  -- Only enforce when closing (setting status to 'fechado')
  IF NEW.status != 'fechado' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if already was fechado (no re-validation needed)
  IF TG_OP = 'UPDATE' AND OLD.status = 'fechado' THEN
    RETURN NEW;
  END IF;

  -- Count active pastos
  SELECT count(*) INTO _total_pastos
  FROM public.pastos
  WHERE fazenda_id = NEW.fazenda_id AND ativo = true;

  IF _total_pastos = 0 THEN
    RAISE EXCEPTION 'Não é possível fechar o Valor do Rebanho: nenhum pasto ativo cadastrado para esta fazenda.';
  END IF;

  -- Count closed pastos for this month
  SELECT count(*) INTO _total_fechados
  FROM public.fechamento_pastos
  WHERE fazenda_id = NEW.fazenda_id
    AND ano_mes = NEW.ano_mes
    AND status = 'fechado';

  IF _total_fechados < _total_pastos THEN
    RAISE EXCEPTION 'Não é possível fechar o Valor do Rebanho: o Mapa de Pastos do mês % ainda não está totalmente fechado (% de % pastos fechados). Feche todos os pastos antes de fechar o Valor do Rebanho.', NEW.ano_mes, _total_fechados, _total_pastos;
  END IF;

  -- Check conciliation (no divergences allowed)
  _conciliacao := public.validar_conciliacao_rebanho(NEW.fazenda_id, NEW.ano_mes);
  _has_divergence := (_conciliacao->>'conciliado')::boolean IS DISTINCT FROM true;

  IF _has_divergence THEN
    RAISE EXCEPTION 'Não é possível fechar o Valor do Rebanho: existem divergências na conciliação do rebanho no mês %. Resolva as divergências nos pastos antes de fechar.', NEW.ano_mes;
  END IF;

  RETURN NEW;
END;
$function$;

-- Apply trigger BEFORE INSERT OR UPDATE
CREATE TRIGGER trg_guard_valor_rebanho_requer_p1
  BEFORE INSERT OR UPDATE ON public.valor_rebanho_fechamento
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_valor_rebanho_requer_p1_fechado();
