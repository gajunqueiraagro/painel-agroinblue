CREATE OR REPLACE FUNCTION public.propagar_saldo_inicial_pos_dezembro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

  INSERT INTO saldos_iniciais (fazenda_id, cliente_id, ano, mes, categoria, quantidade, peso_medio_kg)
  SELECT
    fp.fazenda_id,
    fp.cliente_id,
    v_ano_seguinte,
    1,
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
  ON CONFLICT (fazenda_id, ano, mes, categoria)
  DO UPDATE SET
    quantidade    = EXCLUDED.quantidade,
    peso_medio_kg = EXCLUDED.peso_medio_kg;

  RETURN NEW;
END;
$$;