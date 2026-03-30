
-- Add reopen tracking columns to existing table
ALTER TABLE public.financeiro_fechamentos
  ADD COLUMN IF NOT EXISTS reaberto_por uuid,
  ADD COLUMN IF NOT EXISTS reaberto_em timestamptz;

-- Ensure unique constraint per client+fazenda+month
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financeiro_fechamentos_uq_cliente_fazenda_mes'
  ) THEN
    ALTER TABLE public.financeiro_fechamentos
      ADD CONSTRAINT financeiro_fechamentos_uq_cliente_fazenda_mes
      UNIQUE (cliente_id, fazenda_id, ano_mes);
  END IF;
END $$;

-- Create the guard function that blocks changes on closed months
CREATE OR REPLACE FUNCTION public.guard_financeiro_mes_fechado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ano_mes text;
  v_fazenda_id uuid;
  v_cliente_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ano_mes := OLD.ano_mes;
    v_fazenda_id := OLD.fazenda_id;
    v_cliente_id := OLD.cliente_id;
  ELSE
    v_ano_mes := NEW.ano_mes;
    v_fazenda_id := NEW.fazenda_id;
    v_cliente_id := NEW.cliente_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.financeiro_fechamentos
    WHERE cliente_id = v_cliente_id
      AND fazenda_id = v_fazenda_id
      AND ano_mes = v_ano_mes
      AND status_fechamento = 'fechado'
  ) THEN
    RAISE EXCEPTION 'Mês fechado. Reabra o período para realizar alterações.';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

-- Apply trigger to financeiro_lancamentos_v2
DROP TRIGGER IF EXISTS trg_guard_mes_fechado_lancamentos_v2 ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_guard_mes_fechado_lancamentos_v2
  BEFORE INSERT OR UPDATE OR DELETE ON public.financeiro_lancamentos_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_financeiro_mes_fechado();

-- Update the cancel RPC to also check for closed months
CREATE OR REPLACE FUNCTION public.cancel_financeiro_importacao_v2(_importacao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_importacao public.financeiro_importacoes_v2%ROWTYPE;
  v_cancelados integer := 0;
  v_closed_month text;
BEGIN
  SELECT *
  INTO v_importacao
  FROM public.financeiro_importacoes_v2
  WHERE id = _importacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Importação V2 não encontrada.';
  END IF;

  IF NOT public.can_manage_financeiro_importacao_v2(v_importacao.cliente_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para cancelar esta importação.';
  END IF;

  IF v_importacao.status = 'cancelada' THEN
    RETURN jsonb_build_object('ok', true, 'already_cancelled', true, 'cancelled_rows', 0);
  END IF;

  -- Check if any lancamento in this batch belongs to a closed month
  SELECT DISTINCT l.ano_mes INTO v_closed_month
  FROM public.financeiro_lancamentos_v2 l
  JOIN public.financeiro_fechamentos f
    ON f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id AND f.ano_mes = l.ano_mes
  WHERE l.lote_importacao_id = _importacao_id
    AND COALESCE(l.cancelado, false) = false
    AND f.status_fechamento = 'fechado'
  LIMIT 1;

  IF v_closed_month IS NOT NULL THEN
    RAISE EXCEPTION 'Mês % está fechado. Reabra o período para cancelar esta importação.', v_closed_month;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.financeiro_lancamentos_v2 l
    WHERE l.lote_importacao_id = _importacao_id
      AND COALESCE(l.cancelado, false) = false
      AND l.editado_manual = true
  ) THEN
    RAISE EXCEPTION 'Esta importação possui lançamentos editados manualmente e não pode ser cancelada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.financeiro_lancamentos_v2 l
    WHERE l.lote_importacao_id = _importacao_id
      AND COALESCE(l.cancelado, false) = false
      AND l.status_transacao = 'conciliado'
  ) THEN
    RAISE EXCEPTION 'Esta importação possui lançamentos conciliados e não pode ser cancelada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.financeiro_lancamentos_v2 l
    WHERE l.lote_importacao_id = _importacao_id
      AND l.origem_lancamento = 'importacao_historica'
      AND NOT public.is_admin_agroinblue(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Somente admin pode cancelar importações históricas no V2.';
  END IF;

  UPDATE public.financeiro_importacoes_v2
  SET status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid()
  WHERE id = _importacao_id;

  -- Disable the mes_fechado trigger temporarily for the cancel operation
  -- (we already validated above, and the trigger would block UPDATE on closed months)
  ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_guard_mes_fechado_lancamentos_v2;

  UPDATE public.financeiro_lancamentos_v2
  SET cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(), updated_at = now(), updated_by = auth.uid()
  WHERE lote_importacao_id = _importacao_id
    AND COALESCE(cancelado, false) = false;

  GET DIAGNOSTICS v_cancelados = ROW_COUNT;

  ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_guard_mes_fechado_lancamentos_v2;

  RETURN jsonb_build_object('ok', true, 'already_cancelled', false, 'cancelled_rows', v_cancelados);
END;
$function$;
