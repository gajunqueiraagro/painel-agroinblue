-- PARC-DB-02 (08/09/2026): quitacao automatica do contrato pelas parcelas
CREATE OR REPLACE FUNCTION public.fn_financiamento_sincronizar_status(p_financiamento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_status text; v_pendentes int; v_total int;
BEGIN
  SELECT status INTO v_status FROM financiamentos WHERE id = p_financiamento_id;
  IF v_status IS NULL OR v_status = 'cancelado' THEN RETURN; END IF;
  SELECT count(*), count(*) FILTER (WHERE status <> 'pago') INTO v_total, v_pendentes
    FROM financiamento_parcelas WHERE financiamento_id = p_financiamento_id;
  IF v_total = 0 THEN RETURN; END IF;
  IF v_pendentes = 0 AND v_status = 'ativo' THEN
    UPDATE financiamentos SET status = 'quitado', updated_at = now() WHERE id = p_financiamento_id;
  ELSIF v_pendentes > 0 AND v_status = 'quitado' THEN
    UPDATE financiamentos SET status = 'ativo', updated_at = now() WHERE id = p_financiamento_id;
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_financiamento_sincronizar_status(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_financiamento_sincronizar_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_financiamento_parcelas_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_financiamento_sincronizar_status(OLD.financiamento_id);
    RETURN OLD;
  END IF;
  PERFORM public.fn_financiamento_sincronizar_status(NEW.financiamento_id);
  IF TG_OP = 'UPDATE' AND NEW.financiamento_id IS DISTINCT FROM OLD.financiamento_id THEN
    PERFORM public.fn_financiamento_sincronizar_status(OLD.financiamento_id);
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_parcelas_sincroniza_status_contrato ON public.financiamento_parcelas;
CREATE TRIGGER trg_parcelas_sincroniza_status_contrato
AFTER INSERT OR DELETE OR UPDATE OF status, financiamento_id ON public.financiamento_parcelas
FOR EACH ROW EXECUTE FUNCTION public.trg_financiamento_parcelas_status();

-- backfill: contratos ativos com todas as parcelas pagas
UPDATE financiamentos f SET status = 'quitado', updated_at = now()
WHERE f.status = 'ativo'
  AND EXISTS (SELECT 1 FROM financiamento_parcelas p WHERE p.financiamento_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM financiamento_parcelas p WHERE p.financiamento_id = f.id AND p.status <> 'pago');
