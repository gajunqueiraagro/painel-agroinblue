
-- 1. Migrar lançamentos zootécnicos: previsto → meta
ALTER TABLE public.lancamentos DISABLE TRIGGER trg_guard_meta_admin_only;
ALTER TABLE public.lancamentos DISABLE TRIGGER trg_guard_lancamento_mes_fechado_p1;
ALTER TABLE public.lancamentos DISABLE TRIGGER trg_audit_lancamentos;
ALTER TABLE public.lancamentos DISABLE TRIGGER trg_validate_cenario_status;

UPDATE public.lancamentos
SET cenario = 'meta', status_operacional = NULL
WHERE status_operacional = 'previsto' AND cenario = 'realizado';

ALTER TABLE public.lancamentos ENABLE TRIGGER trg_guard_meta_admin_only;
ALTER TABLE public.lancamentos ENABLE TRIGGER trg_guard_lancamento_mes_fechado_p1;
ALTER TABLE public.lancamentos ENABLE TRIGGER trg_audit_lancamentos;
ALTER TABLE public.lancamentos ENABLE TRIGGER trg_validate_cenario_status;

-- 2. Migrar lançamentos financeiros V2: previsto → meta
UPDATE public.financeiro_lancamentos_v2
SET status_transacao = 'meta'
WHERE status_transacao = 'previsto' AND COALESCE(cancelado, false) = false;

-- 3. Atualizar trigger de validação para não aceitar mais 'previsto'
CREATE OR REPLACE FUNCTION public.validate_cenario_status()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.cenario = 'meta' AND NEW.status_operacional IS NOT NULL THEN
    RAISE EXCEPTION 'Registros META (cenario=meta) não podem ter status_operacional. Valor recebido: %', NEW.status_operacional;
  END IF;
  IF NEW.cenario = 'realizado' THEN
    IF NEW.status_operacional IS NULL THEN
      RAISE EXCEPTION 'Registros operacionais (cenario=realizado) precisam de status_operacional.';
    END IF;
    IF NEW.status_operacional NOT IN ('programado', 'agendado', 'realizado') THEN
      RAISE EXCEPTION 'status_operacional inválido: %. Valores aceitos: programado, agendado, realizado', NEW.status_operacional;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
