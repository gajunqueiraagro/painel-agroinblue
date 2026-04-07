
-- Audit function: validates Σ categorias = total fazenda
CREATE OR REPLACE FUNCTION public.fn_auditoria_consistencia_zoot(
  p_fazenda_id uuid DEFAULT NULL
)
RETURNS TABLE(
  fazenda_id uuid,
  cenario text,
  ano int,
  mes int,
  cat_saldo_final bigint,
  faz_saldo_final bigint,
  diff_saldo_final bigint,
  cat_peso_total_final numeric,
  faz_peso_total_final numeric,
  diff_peso_total_final numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH cat AS (
    SELECT
      c.fazenda_id,
      c.cenario,
      c.ano,
      c.mes,
      SUM(c.saldo_final)::bigint AS sf,
      SUM(c.peso_total_final)::numeric AS ptf
    FROM vw_zoot_categoria_mensal c
    WHERE (p_fazenda_id IS NULL OR c.fazenda_id = p_fazenda_id)
    GROUP BY c.fazenda_id, c.cenario, c.ano, c.mes
  ),
  faz AS (
    SELECT
      f.fazenda_id,
      f.cenario,
      f.ano,
      f.mes,
      f.cabecas_final::bigint AS sf,
      f.peso_total_final_kg::numeric AS ptf
    FROM vw_zoot_fazenda_mensal f
    WHERE (p_fazenda_id IS NULL OR f.fazenda_id = p_fazenda_id)
  )
  SELECT
    f.fazenda_id,
    f.cenario,
    f.ano,
    f.mes,
    COALESCE(c.sf, 0) AS cat_saldo_final,
    f.sf AS faz_saldo_final,
    f.sf - COALESCE(c.sf, 0) AS diff_saldo_final,
    COALESCE(c.ptf, 0) AS cat_peso_total_final,
    f.ptf AS faz_peso_total_final,
    ROUND(f.ptf - COALESCE(c.ptf, 0), 2) AS diff_peso_total_final
  FROM faz f
  LEFT JOIN cat c USING (fazenda_id, cenario, ano, mes)
  WHERE ABS(f.sf - COALESCE(c.sf, 0)) > 0
     OR ABS(f.ptf - COALESCE(c.ptf, 0)) > 1
  ORDER BY f.fazenda_id, f.cenario, f.ano, f.mes;
$$;
