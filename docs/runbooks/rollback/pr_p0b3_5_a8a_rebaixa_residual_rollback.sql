-- ROLLBACK R5 (Migração 5 - A8A rebaixa residual). Primeiro na ordem (5->1).
-- Restaura o corpo P0-B.2 de fn_invalidar_snapshot_conjunto (com fn_lock_p1, SEM a
--   chamada a fn_rebaixar_p1_oficial), capturado via pg_get_functiondef. Nao reabre grants.
CREATE OR REPLACE FUNCTION public.fn_invalidar_snapshot_conjunto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ano_mes text; v_fazenda uuid; v_p1_id uuid;
BEGIN
  v_ano_mes := coalesce(NEW.ano_mes, OLD.ano_mes);
  v_fazenda := coalesce(NEW.fazenda_id, OLD.fazenda_id);
  PERFORM public.fn_lock_p1(v_fazenda, v_ano_mes);   -- mesmo lock da geracao (fecha a corrida)
  SELECT id INTO v_p1_id FROM public.fechamento_p1 WHERE fazenda_id=v_fazenda AND ano_mes=v_ano_mes;
  IF v_p1_id IS NOT NULL THEN
    UPDATE public.fechamento_p1_snapshot
       SET status='invalidado'::public.snapshot_status, invalidado_em=now(),
           motivo_invalidacao='Conjunto fechado alterado em fechamento_pastos'
     WHERE fechamento_p1_id=v_p1_id AND status='vigente'::public.snapshot_status;
  END IF;
  RETURN coalesce(NEW, OLD);
END $function$;
