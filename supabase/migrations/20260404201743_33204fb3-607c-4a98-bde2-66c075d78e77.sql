
ALTER TABLE public.valor_rebanho_fechamento
ADD COLUMN IF NOT EXISTS peso_total_kg numeric DEFAULT 0;

-- Backfill from vw_zoot_fazenda_mensal
UPDATE public.valor_rebanho_fechamento vrf
SET peso_total_kg = COALESCE(z.peso_total_final_kg, 0)
FROM (
  SELECT fazenda_id, ano, mes, peso_total_final_kg
  FROM vw_zoot_fazenda_mensal
  WHERE cenario = 'realizado'
) z
WHERE vrf.fazenda_id = z.fazenda_id
  AND EXTRACT(YEAR FROM TO_DATE(vrf.ano_mes, 'YYYY-MM'))::int = z.ano
  AND EXTRACT(MONTH FROM TO_DATE(vrf.ano_mes, 'YYYY-MM'))::int = z.mes
  AND (vrf.peso_total_kg IS NULL OR vrf.peso_total_kg = 0);
