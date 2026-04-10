
-- Normalize all status_transacao values to lowercase
UPDATE public.financeiro_lancamentos_v2
SET status_transacao = lower(trim(status_transacao)),
    updated_at = now()
WHERE status_transacao IS DISTINCT FROM lower(trim(status_transacao))
  AND status_transacao IS NOT NULL;
