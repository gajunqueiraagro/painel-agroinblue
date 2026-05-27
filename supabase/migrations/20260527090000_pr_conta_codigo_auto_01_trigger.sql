-- =====================================================================
-- PR-ContaCodigoAuto-01: Geração automática de codigo_conta
-- =====================================================================
-- Regras (prospectivas — sem backfill):
--
-- 1. INSERT com codigo_conta NULL + ativa=true + cliente_id + tipo_conta:
--    gera 3 dígitos zero-padded por (cliente, tipo). MAX existente + 1.
--
-- 2. UPDATE: preserva codigo_conta existente.
--    - Se OLD tinha código e NEW vier NULL: RESTAURA OLD (defesa anti-apagar).
--    - Se OLD era NULL e NEW continua NULL + ativa=true: gera.
--    - Se OLD tinha código e tipo_conta mudou: PRESERVA código antigo
--      mesmo que conflite com outra conta do novo tipo. Resolução manual
--      exigida — não recalcula automaticamente neste PR.
--
-- 3. MAX considera contas ATIVAS + INATIVAS → nunca reaproveita código
--    de conta inativa. Regra de design explícita.
--
-- 4. Cast seguro: filtro `~ '^[0-9]+$'` garante que '000'::int=0 e '001'::int=1
--    sem fragilidade de regex em strings vazias.
--
-- 5. Advisory lock por (cliente_id, tipo_conta) protege race em INSERTs
--    concorrentes do mesmo par. Auto-liberado no fim da transação.
--
-- 6. Backfill de contas existentes NÃO é feito aqui. Ver PR-ContaCodigoAuto-Backfill.
--
-- 7. PR-Constraint-CodigoConta-Unique (futuro) fechará no banco caso
--    duplicidade aconteça por edição manual ou mudança de tipo.
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

  RETURN LPAD((v_max + 1)::text, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION trg_fn_auto_codigo_conta() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- DEFESA: UPDATE não pode apagar codigo_conta existente
  IF TG_OP = 'UPDATE'
     AND OLD.codigo_conta IS NOT NULL
     AND NEW.codigo_conta IS NULL THEN
    NEW.codigo_conta := OLD.codigo_conta;
    RETURN NEW;
  END IF;

  -- GERAÇÃO: codigo NULL + ativa + tipo + cliente presentes
  IF NEW.codigo_conta IS NULL
     AND NEW.ativa = true
     AND NEW.tipo_conta IS NOT NULL
     AND NEW.cliente_id IS NOT NULL THEN
    NEW.codigo_conta := fn_gerar_codigo_conta(NEW.cliente_id, NEW.tipo_conta);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_codigo_conta ON financeiro_contas_bancarias;

CREATE TRIGGER trg_auto_codigo_conta
  BEFORE INSERT OR UPDATE ON financeiro_contas_bancarias
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_auto_codigo_conta();
