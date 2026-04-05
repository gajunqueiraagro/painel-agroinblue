CREATE OR REPLACE FUNCTION public.financeiro_saldos_v2_apply_previous_extrato()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_prev_ano_mes TEXT;
  v_prev_saldo_extrato NUMERIC;
  v_has_older BOOLEAN;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.financeiro_saldos_bancarios_v2 s
    WHERE s.conta_bancaria_id = NEW.conta_bancaria_id
      AND s.ano_mes < NEW.ano_mes
      AND (TG_OP <> 'UPDATE' OR s.id <> NEW.id)
  )
  INTO v_has_older;

  IF v_has_older THEN
    RAISE EXCEPTION 'Inconsistência de saldo entre meses. Verificar lançamentos.';
  END IF;

  NEW.origem_saldo_inicial := COALESCE(NULLIF(NEW.origem_saldo_inicial, ''), 'manual');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.financeiro_saldos_v2_propagate_next_initial()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_next_ano_mes TEXT;
BEGIN
  v_next_ano_mes := to_char(
    to_date(NEW.ano_mes || '-01', 'YYYY-MM-DD') + interval '1 month',
    'YYYY-MM'
  );

  UPDATE public.financeiro_saldos_bancarios_v2 next
     SET saldo_inicial = NEW.saldo_final,
         origem_saldo_inicial = 'automatico',
         updated_at = now()
   WHERE next.conta_bancaria_id = NEW.conta_bancaria_id
     AND next.ano_mes = v_next_ano_mes
     AND next.id <> NEW.id
     AND abs(COALESCE(next.saldo_inicial, 0) - COALESCE(NEW.saldo_final, 0)) > 0.01;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_financeiro_saldos_v2_apply_previous_extrato ON public.financeiro_saldos_bancarios_v2;
CREATE TRIGGER tr_financeiro_saldos_v2_apply_previous_extrato
BEFORE INSERT OR UPDATE OF conta_bancaria_id, ano_mes, saldo_inicial, origem_saldo_inicial
ON public.financeiro_saldos_bancarios_v2
FOR EACH ROW
EXECUTE FUNCTION public.financeiro_saldos_v2_apply_previous_extrato();

DROP TRIGGER IF EXISTS tr_financeiro_saldos_v2_propagate_next_initial ON public.financeiro_saldos_bancarios_v2;
CREATE TRIGGER tr_financeiro_saldos_v2_propagate_next_initial
AFTER INSERT OR UPDATE OF saldo_final, conta_bancaria_id, ano_mes
ON public.financeiro_saldos_bancarios_v2
FOR EACH ROW
EXECUTE FUNCTION public.financeiro_saldos_v2_propagate_next_initial();

WITH chain AS (
  SELECT cur.id, prev.saldo_final AS prev_saldo_extrato
  FROM public.financeiro_saldos_bancarios_v2 cur
  JOIN public.financeiro_saldos_bancarios_v2 prev
    ON prev.conta_bancaria_id = cur.conta_bancaria_id
   AND prev.ano_mes = to_char(
     to_date(cur.ano_mes || '-01', 'YYYY-MM-DD') - interval '1 month',
     'YYYY-MM'
   )
)
UPDATE public.financeiro_saldos_bancarios_v2 cur
   SET saldo_inicial = chain.prev_saldo_extrato,
       origem_saldo_inicial = 'automatico',
       updated_at = now()
FROM chain
WHERE cur.id = chain.id
  AND abs(COALESCE(cur.saldo_inicial, 0) - COALESCE(chain.prev_saldo_extrato, 0)) > 0.01;