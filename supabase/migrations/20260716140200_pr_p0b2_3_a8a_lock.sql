-- PR-P1-SNAPSHOT-AREA-P0B2 — Migração 3: A8a adquire fn_lock_p1 (fecha a corrida)
-- So o CORPO da funcao muda: adiciona PERFORM fn_lock_p1 (mesmo lock da geracao),
--   serializando invalidacao x materializacao x geracao de area. Trigger
--   trg_a8a_invalidar_snapshot (P0-B.1) permanece; SECDEF/search_path preservados.

CREATE OR REPLACE FUNCTION public.fn_invalidar_snapshot_conjunto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
END $$;
-- Trigger trg_a8a_invalidar_snapshot (do P0-B.1) permanece; só o corpo da funcao muda.
