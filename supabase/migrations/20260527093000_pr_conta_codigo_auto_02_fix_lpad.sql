-- =====================================================================
-- PR-ContaCodigoAuto-02-fix: corrige bug de truncamento em LPAD
-- =====================================================================
-- Problema detectado em validação (cenário 5):
--   LPAD('1000', 3, '0') no PostgreSQL retorna '100' (trunca à direita
--   quando string já é maior que length pedido).
--   Consequência: ao chegar em codigo_conta = '999' (manual ou natural),
--   o próximo gerado seria '100' em vez de '1000' — duplicidade.
--
-- Fix: trocar LPAD por to_char(n, 'FM000').
--   to_char(2, 'FM000')    → '002'   ✓ mantém zero-padded
--   to_char(999, 'FM000')  → '999'   ✓ mantém zero-padded
--   to_char(1000, 'FM000') → '1000'  ✓ expande sem truncar
--   FM = Fill Mode (remove espaços extras no início)
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

  RETURN to_char(v_max + 1, 'FM000');
END;
$$;
