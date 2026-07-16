-- PR-P1-OFICIALIZACAO-P0B3 — Migração 5: A8A rebaixa oficial residual
-- Corpo capturado (P0-B.2: com fn_lock_p1) PRESERVADO, com UMA insercao apos invalidar o
--   snapshot vigente, dentro do IF v_p1_id IS NOT NULL: rede residual que rebaixa oficial
--   por caminhos NAO governados (alteracao direta de card). Mesma funcao interna
--   (idempotente WHERE status=oficial); 1 log so na transicao real. auth.uid() pode ser NULL
--   (trigger nao-governado) -> reaberto_por=NULL, sem inventar autoria. Se a RPC ja rebaixou,
--   aqui e no-op (0 linhas, 0 log).

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
    -- rede residual: garante que nao exista oficial com conjunto invalidado (caminhos nao-governados).
    -- Mesma funcao interna (idempotente WHERE status=oficial); grava 1 log so na transicao real.
    PERFORM public.fn_rebaixar_p1_oficial(
      v_p1_id, 'Rebaixamento residual: conjunto invalidado por alteracao direta de card');
  END IF;
  RETURN coalesce(NEW, OLD);
END $function$;
