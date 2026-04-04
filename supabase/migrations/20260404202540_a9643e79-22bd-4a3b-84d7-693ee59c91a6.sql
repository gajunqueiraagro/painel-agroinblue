CREATE OR REPLACE VIEW public.vw_valor_rebanho_auditoria AS
SELECT
  vrf.fazenda_id,
  vrf.cliente_id,
  vrf.ano_mes,
  vrf.valor_total,
  vrf.peso_total_kg,
  CASE WHEN COALESCE(vrf.peso_total_kg, 0) > 0 THEN vrf.valor_total / (vrf.peso_total_kg / 30.0) ELSE NULL END AS preco_arroba_fechado,
  vzm.peso_total_final_kg AS peso_total_zoot_kg,
  vzm.cabecas_final AS cabecas_final_zoot,
  CASE WHEN COALESCE(vzm.peso_total_final_kg, 0) > 0 THEN vrf.valor_total / (vzm.peso_total_final_kg / 30.0) ELSE NULL END AS preco_arroba_com_peso_zoot
FROM public.valor_rebanho_fechamento vrf
LEFT JOIN public.vw_zoot_fazenda_mensal vzm
  ON vzm.fazenda_id = vrf.fazenda_id
 AND vzm.ano_mes = vrf.ano_mes
 AND vzm.cenario = 'realizado';