CREATE OR REPLACE VIEW public.vw_zoot_fazenda_mensal AS
WITH cat AS (
  SELECT
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    SUM(saldo_inicial)::integer        AS cabecas_inicio,
    SUM(saldo_final)::integer          AS cabecas_final,
    SUM(entradas_externas)::integer    AS entradas,
    SUM(saidas_externas)::integer      AS saidas,
    ROUND(SUM(peso_total_inicial), 2)  AS peso_inicio_kg,
    ROUND(SUM(peso_total_final), 2)    AS peso_total_final_kg,
    ROUND(SUM(peso_entradas_externas), 2) AS peso_entradas_kg,
    ROUND(SUM(peso_saidas_externas), 2)   AS peso_saidas_kg,
    ROUND(SUM(producao_biologica), 2)     AS gmd_numerador_kg,
    MAX(dias_mes)                         AS dias_mes,
    CASE
      WHEN bool_or(fonte_oficial_mes = 'fechamento') THEN 'fechamento'
      WHEN bool_or(fonte_oficial_mes = 'fallback_movimentacao') THEN 'fallback_movimentacao'
      ELSE 'projecao'
    END AS fonte_oficial_mes
  FROM public.vw_zoot_categoria_mensal
  GROUP BY fazenda_id, cliente_id, ano, mes, cenario, ano_mes
),
area AS (
  SELECT p.fazenda_id,
    SUM(CASE WHEN p.ativo AND p.entra_conciliacao THEN p.area_produtiva_ha ELSE 0 END) AS area_produtiva_ha
  FROM pastos p
  GROUP BY p.fazenda_id
)
SELECT
  c.fazenda_id,
  c.cliente_id,
  c.ano,
  c.mes,
  c.cenario,
  LPAD(c.mes::text, 2, '0') AS mes_key,
  c.ano_mes,
  c.cabecas_inicio,
  c.cabecas_final,
  c.peso_inicio_kg,
  c.peso_total_final_kg,
  CASE WHEN c.cabecas_final > 0
    THEN ROUND(c.peso_total_final_kg / c.cabecas_final, 2)
    ELSE NULL
  END AS peso_medio_final_kg,
  c.peso_entradas_kg,
  c.peso_saidas_kg,
  c.entradas,
  c.saidas,
  c.dias_mes,
  CASE WHEN c.dias_mes > 0
        AND (c.cabecas_inicio + c.cabecas_final) > 0
    THEN ROUND(
      c.gmd_numerador_kg
      / ((c.cabecas_inicio + c.cabecas_final) / 2.0)
      / c.dias_mes, 4)
    ELSE NULL
  END AS gmd_kg_cab_dia,
  CASE WHEN (c.cabecas_inicio + c.cabecas_final) > 0
    THEN c.gmd_numerador_kg
    ELSE NULL
  END AS gmd_numerador_kg,
  CASE WHEN c.cabecas_final > 0
    THEN ROUND(
      ((c.cabecas_inicio + c.cabecas_final) / 2.0)
      * (c.peso_total_final_kg / c.cabecas_final)
      / 450.0, 2)
    ELSE NULL
  END AS ua_media,
  COALESCE(a.area_produtiva_ha, 0) AS area_produtiva_ha,
  CASE WHEN COALESCE(a.area_produtiva_ha, 0) > 0 AND c.cabecas_final > 0
    THEN ROUND(
      ((c.cabecas_inicio + c.cabecas_final) / 2.0)
      * (c.peso_total_final_kg / c.cabecas_final)
      / 450.0
      / a.area_produtiva_ha, 2)
    ELSE NULL
  END AS lotacao_ua_ha,
  c.fonte_oficial_mes
FROM cat c
LEFT JOIN area a ON a.fazenda_id = c.fazenda_id;