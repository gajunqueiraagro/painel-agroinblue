-- ROLLBACK R3 (Migração 3 - A8a lock). Restaura o corpo de fn_invalidar_snapshot_conjunto
--   SEM o PERFORM fn_lock_p1 (estado P0-B.1, capturado via pg_get_functiondef; bate
--   literalmente). Nao reabre anon/PUBLIC.
CREATE OR REPLACE FUNCTION public.fn_invalidar_snapshot_conjunto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
END $function$;
