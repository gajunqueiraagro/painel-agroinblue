-- 20260812130000_pr_concil_agendado_01_fn_promover.sql
-- PR-CONCIL-AGENDADO-01 — fn_promover_lancamento_realizado_ao_conciliar:
-- ao promover agendado/programado → realizado no INSERT do vínculo de
-- conciliação, preencher data_pagamento com a data do movimento OFX
-- (NEW.snapshot_extrato_data) SOMENTE quando data_pagamento estiver nula.
--
-- BASE: texto vigente no banco proto (pg_get_functiondef capturado 06/08).
-- Mudanças vs. vigente:
--   1. SET ganha: data_pagamento = COALESCE(data_pagamento, NEW.snapshot_extrato_data)
--      (nunca sobrescreve data preexistente);
--   2. cancelado = false → cancelado IS NOT TRUE (D9 — coluna anulável).
--
-- Idempotência: 2ª execução encontra status_transacao='realizado' e o WHERE
-- (IN 'programado','agendado') torna o UPDATE no-op. data_pagamento
-- preexistente nunca é alterada pelo COALESCE.
--
-- Ordem de triggers verificada em runtime: trg_snapshot_conciliacao é
-- BEFORE INSERT (preenche NEW.snapshot_extrato_data a partir de
-- extrato_bancario_v2.data_movimento); trg_promover_... é AFTER INSERT —
-- o snapshot já está disponível. Se snapshot_extrato_data vier NULL,
-- data_pagamento permanece NULL (comportamento aceito e registrado).
--
-- O trigger trg_promover_lancamento_realizado_ao_conciliar em
-- conciliacao_bancaria_itens JÁ EXISTE e está habilitado — esta migration
-- substitui APENAS a função. Rollback: reaplicar o corpo vigente (ver
-- relatório pre-commit do PR).

CREATE OR REPLACE FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.financeiro_lancamentos_v2
  SET status_transacao = 'realizado',
      data_pagamento   = COALESCE(data_pagamento, NEW.snapshot_extrato_data),
      updated_at       = now()
  WHERE id = NEW.lancamento_id
    AND status_transacao IN ('programado','agendado')
    AND cancelado IS NOT TRUE
    AND COALESCE(cenario, 'realizado') <> 'meta';
  RETURN NEW;
END;
$function$;
