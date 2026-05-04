-- ══════════════════════════════════════════════════════════════════════
-- MIGRATION: proteção estrutural em fechamento_pasto_itens
-- Garante que peso_total nunca seja negativo e seja calculado
-- automaticamente quando quantidade e peso_medio_kg estiverem presentes.
-- ══════════════════════════════════════════════════════════════════════

-- 1. Função do trigger
CREATE OR REPLACE FUNCTION fn_validate_fechamento_pasto_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Normalizar NULL → 0 antes de qualquer validação
  IF NEW.peso_total IS NULL THEN
    NEW.peso_total := 0;
  END IF;

  -- Calcular peso_total quando necessário (antes de validar)
  IF COALESCE(NEW.quantidade, 0) > 0
     AND COALESCE(NEW.peso_medio_kg, 0) > 0
     AND NEW.peso_total = 0
  THEN
    NEW.peso_total := NEW.quantidade * NEW.peso_medio_kg;
  END IF;

  -- Validações (após cálculo automático)
  IF NEW.quantidade IS NOT NULL AND NEW.quantidade < 0 THEN
    RAISE EXCEPTION
      'fechamento_pasto_itens: quantidade não pode ser negativa (valor: %)',
      NEW.quantidade;
  END IF;

  IF NEW.peso_medio_kg IS NOT NULL AND NEW.peso_medio_kg < 0 THEN
    RAISE EXCEPTION
      'fechamento_pasto_itens: peso_medio_kg não pode ser negativo (valor: %)',
      NEW.peso_medio_kg;
  END IF;

  IF NEW.peso_total < 0 THEN
    RAISE EXCEPTION
      'fechamento_pasto_itens: peso_total não pode ser negativo (valor: %)',
      NEW.peso_total;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Trigger BEFORE INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_validate_fechamento_pasto_item
  ON fechamento_pasto_itens;

CREATE TRIGGER trg_validate_fechamento_pasto_item
  BEFORE INSERT OR UPDATE ON fechamento_pasto_itens
  FOR EACH ROW
  EXECUTE FUNCTION fn_validate_fechamento_pasto_item();
