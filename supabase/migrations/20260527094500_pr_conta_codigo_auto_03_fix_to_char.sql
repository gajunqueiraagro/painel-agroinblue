-- =====================================================================
-- PR-ContaCodigoAuto-03-fix: corrige bug em to_char com máscara fixa
-- =====================================================================
-- Problema detectado em validação do PR-02:
--   to_char(1000, 'FM000') retorna '###' (PostgreSQL positional mask).
--   Quando número excede template, retorna # literal — falha silenciosa.
--   Trigger inseriu '###' como codigo_conta — pior que o bug original.
--
-- Fix: CASE WHEN inline.
--   - v_max+1 < 1000: LPAD com 3 dígitos (mantém padrão 001-999)
--   - v_max+1 >= 1000: cast direto sem padding ('1000', '1001', ...)
--
-- Validado empiricamente no proto antes de aplicar:
--   CASE WHEN 2    < 1000 THEN LPAD(2::text, 3, '0')    → '002'  ✓
--   CASE WHEN 999  < 1000 THEN LPAD(999::text, 3, '0')  → '999'  ✓
--   CASE WHEN 1000 < 1000 → falsy → 1000::text          → '1000' ✓
--   CASE WHEN 9999 < 1000 → falsy → 9999::text          → '9999' ✓
--
-- Idempotente: CREATE OR REPLACE FUNCTION. Não toca no trigger.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_gerar_codigo_conta(
  p_cliente_id uuid,
  p_tipo_conta text
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_max int;
  v_next int;
BEGIN
  IF p_cliente_id IS NULL OR p_tipo_conta IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_cliente_id::text || ':' || p_tipo_conta, 0)
  );

  SELECT COALESCE(MAX(codigo_conta::int), 0)
    INTO v_max
  FROM financeiro_contas_bancarias
  WHERE cliente_id = p_cliente_id
    AND tipo_conta = p_tipo_conta
    AND codigo_conta IS NOT NULL
    AND codigo_conta ~ '^[0-9]+$';

  v_next := v_max + 1;

  RETURN CASE
    WHEN v_next < 1000 THEN LPAD(v_next::text, 3, '0')
    ELSE v_next::text
  END;
END;
$$;
