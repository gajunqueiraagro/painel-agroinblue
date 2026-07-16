-- PR-P1-SNAPSHOT-CONJUNTO-P0B1 — Migração 5: Trigger A8a (invalidacao do snapshot)
-- Ao alterar o conjunto fechado (INSERT/UPDATE OF status/DELETE em fechamento_pastos),
--   invalida o snapshot vigente do (fazenda, ano_mes): status -> invalidado.
--   Invalida por STATUS (nao deleta) e NAO recursa em fechamento_pastos.

CREATE OR REPLACE FUNCTION public.fn_invalidar_snapshot_conjunto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ano_mes text; v_fazenda uuid; v_p1_id uuid;
BEGIN
  v_ano_mes := coalesce(NEW.ano_mes, OLD.ano_mes);
  v_fazenda := coalesce(NEW.fazenda_id, OLD.fazenda_id);
  SELECT id INTO v_p1_id FROM public.fechamento_p1 WHERE fazenda_id=v_fazenda AND ano_mes=v_ano_mes;
  IF v_p1_id IS NOT NULL THEN
    UPDATE public.fechamento_p1_snapshot
       SET status='invalidado'::public.snapshot_status, invalidado_em=now(),
           motivo_invalidacao='Conjunto fechado alterado em fechamento_pastos'
     WHERE fechamento_p1_id=v_p1_id AND status='vigente'::public.snapshot_status;
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_a8a_invalidar_snapshot ON public.fechamento_pastos;
CREATE TRIGGER trg_a8a_invalidar_snapshot
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.fechamento_pastos
  FOR EACH ROW EXECUTE FUNCTION public.fn_invalidar_snapshot_conjunto();
