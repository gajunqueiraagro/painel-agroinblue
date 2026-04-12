CREATE OR REPLACE FUNCTION public.financeiro_saldos_v2_apply_previous_extrato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_ano_mes TEXT;
  v_prev_saldo_extrato NUMERIC;
BEGIN
  v_prev_ano_mes := to_char(
    to_date(NEW.ano_mes || '-01', 'YYYY-MM-DD') - interval '1 month',
    'YYYY-MM'
  );

  SELECT s.saldo_final
    INTO v_prev_saldo_extrato
  FROM public.financeiro_saldos_bancarios_v2 s
  WHERE s.conta_bancaria_id = NEW.conta_bancaria_id
    AND s.ano_mes = v_prev_ano_mes
    AND (TG_OP <> 'UPDATE' OR s.id <> NEW.id)
  ORDER BY s.updated_at DESC, s.created_at DESC
  LIMIT 1;

  IF v_prev_saldo_extrato IS NOT NULL THEN
    NEW.saldo_inicial := v_prev_saldo_extrato;
    NEW.origem_saldo_inicial := 'automatico';
    RETURN NEW;
  END IF;

  -- No previous month found: allow save with manual origin (no blocking)
  NEW.origem_saldo_inicial := COALESCE(NULLIF(NEW.origem_saldo_inicial, ''), 'manual');
  RETURN NEW;
END;
$$;