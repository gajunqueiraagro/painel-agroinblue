-- 1. Atualizar o guard para reconhecer propagação oficial de dezembro
CREATE OR REPLACE FUNCTION public.guard_saldos_iniciais_mes_fechado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  _ano_mes text;
  _is_closed boolean;
BEGIN
  -- Permite inserção vinda da propagação oficial de dezembro
  IF current_setting('app.propagacao_dezembro', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Bloqueia INSERT sem quantidade
  IF TG_OP = 'INSERT' AND (NEW.quantidade IS NULL OR NEW.quantidade <= 0) THEN
    RAISE EXCEPTION 'Não é permitido criar saldo inicial sem quantidade.';
  END IF;

  _ano_mes := NEW.ano || '-01';

  SELECT EXISTS (
    SELECT 1 FROM fechamento_pastos fp
    WHERE fp.fazenda_id = NEW.fazenda_id
      AND fp.ano_mes = _ano_mes AND fp.status = 'fechado'
  ) AND NOT EXISTS (
    SELECT 1 FROM pastos p
    WHERE p.fazenda_id = NEW.fazenda_id AND p.ativo = true
      AND NOT EXISTS (
        SELECT 1 FROM fechamento_pastos fp2
        WHERE fp2.fazenda_id = NEW.fazenda_id
          AND fp2.pasto_id = p.id
          AND fp2.ano_mes = _ano_mes AND fp2.status = 'fechado'
      )
  ) INTO _is_closed;

  IF NOT _is_closed THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.quantidade IS DISTINCT FROM OLD.quantidade THEN
      RAISE EXCEPTION 'Mês % está fechado. Quantidade não pode ser alterada.', _ano_mes;
    END IF;
    IF NEW.peso_medio_kg IS DISTINCT FROM OLD.peso_medio_kg THEN
      RAISE EXCEPTION 'Mês % está fechado. Peso médio não pode ser alterado.', _ano_mes;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Mês % está fechado. Não é permitido inserir novos saldos iniciais.', _ano_mes;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Criar function de propagação dezembro → saldos_iniciais ano seguinte
CREATE OR REPLACE FUNCTION public.propagar_saldo_inicial_pos_dezembro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ano_seguinte INT;
  v_ano INT;
  v_mes INT;
BEGIN
  IF NEW.status <> 'fechado' OR OLD.status = 'fechado' THEN
    RETURN NEW;
  END IF;

  v_ano := EXTRACT(YEAR  FROM (NEW.ano_mes || '-01')::date);
  v_mes := EXTRACT(MONTH FROM (NEW.ano_mes || '-01')::date);

  IF v_mes <> 12 THEN
    RETURN NEW;
  END IF;

  v_ano_seguinte := v_ano + 1;

  IF EXISTS (
    SELECT 1 FROM fechamento_pastos
    WHERE fazenda_id = NEW.fazenda_id
      AND cliente_id = NEW.cliente_id
      AND ano_mes    = NEW.ano_mes
      AND status     <> 'fechado'
      AND id         <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.propagacao_dezembro', 'true', true);

  INSERT INTO saldos_iniciais (fazenda_id, cliente_id, ano, categoria, quantidade, peso_medio_kg)
  SELECT
    fp.fazenda_id,
    fp.cliente_id,
    v_ano_seguinte,
    cr.codigo,
    SUM(fpi.quantidade),
    CASE
      WHEN SUM(fpi.quantidade) > 0
      THEN ROUND(
        (SUM(fpi.peso_medio_kg * fpi.quantidade) / SUM(fpi.quantidade))::numeric, 2
      )
      ELSE 0
    END
  FROM fechamento_pasto_itens fpi
  JOIN fechamento_pastos fp ON fp.id = fpi.fechamento_id
  JOIN categorias_rebanho cr ON cr.id = fpi.categoria_id
  WHERE fp.fazenda_id = NEW.fazenda_id
    AND fp.cliente_id = NEW.cliente_id
    AND fp.ano_mes    = NEW.ano_mes
    AND fp.status     = 'fechado'
  GROUP BY fp.fazenda_id, fp.cliente_id, cr.codigo
  HAVING SUM(fpi.quantidade) > 0
  ON CONFLICT (fazenda_id, ano, categoria)
  DO UPDATE SET
    quantidade    = EXCLUDED.quantidade,
    peso_medio_kg = EXCLUDED.peso_medio_kg;

  RETURN NEW;
END;
$$;

-- 3. Criar trigger
DROP TRIGGER IF EXISTS trg_propagar_saldo_dezembro ON fechamento_pastos;

CREATE TRIGGER trg_propagar_saldo_dezembro
AFTER UPDATE OF status ON fechamento_pastos
FOR EACH ROW
WHEN (NEW.status = 'fechado' AND OLD.status <> 'fechado')
EXECUTE FUNCTION public.propagar_saldo_inicial_pos_dezembro();

-- 4. Propagação retroativa para dez/2022 da Faz. Sta. Rita (ID correto)
DO $$
BEGIN
  PERFORM set_config('app.propagacao_dezembro', 'true', true);

  INSERT INTO saldos_iniciais (fazenda_id, cliente_id, ano, categoria, quantidade, peso_medio_kg)
  SELECT
    fp.fazenda_id,
    fp.cliente_id,
    2023,
    cr.codigo,
    SUM(fpi.quantidade),
    CASE
      WHEN SUM(fpi.quantidade) > 0
      THEN ROUND(
        (SUM(fpi.peso_medio_kg * fpi.quantidade) / SUM(fpi.quantidade))::numeric, 2
      )
      ELSE 0
    END
  FROM fechamento_pasto_itens fpi
  JOIN fechamento_pastos fp ON fp.id = fpi.fechamento_id
  JOIN categorias_rebanho cr ON cr.id = fpi.categoria_id
  WHERE fp.fazenda_id = '161b905e-f14c-4a9b-965f-dd3c8f82dc74'
    AND fp.ano_mes    = '2022-12'
    AND fp.status     = 'fechado'
  GROUP BY fp.fazenda_id, fp.cliente_id, cr.codigo
  HAVING SUM(fpi.quantidade) > 0
  ON CONFLICT (fazenda_id, ano, categoria)
  DO UPDATE SET
    quantidade    = EXCLUDED.quantidade,
    peso_medio_kg = EXCLUDED.peso_medio_kg;
END $$;