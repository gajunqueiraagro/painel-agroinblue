
DROP VIEW IF EXISTS public.vw_zoot_fazenda_mensal;

CREATE OR REPLACE VIEW public.vw_zoot_fazenda_mensal AS
WITH saldo_ini AS (
  SELECT fazenda_id, cliente_id, ano,
    SUM(quantidade) AS cab_ini,
    SUM(quantidade::numeric * COALESCE(peso_medio_kg, 0)) AS peso_ini
  FROM saldos_iniciais
  GROUP BY fazenda_id, cliente_id, ano
),
mov_realizado AS (
  SELECT fazenda_id, cliente_id,
    EXTRACT(year FROM data::date)::int AS ano,
    EXTRACT(month FROM data::date)::int AS mes,
    SUM(CASE WHEN tipo IN ('nascimento','compra','transferencia_entrada') THEN quantidade ELSE 0 END) AS entradas,
    SUM(CASE WHEN tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN quantidade ELSE 0 END) AS saidas,
    SUM(CASE WHEN tipo IN ('nascimento','compra','transferencia_entrada')
      THEN quantidade::numeric * COALESCE(peso_medio_kg, peso_carcaca_kg, 0) ELSE 0 END) AS peso_entradas,
    SUM(CASE WHEN tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte')
      THEN quantidade::numeric * COALESCE(peso_medio_kg, peso_carcaca_kg, 0) ELSE 0 END) AS peso_saidas
  FROM lancamentos
  WHERE cancelado = false
    AND tipo <> 'reclassificacao'
    AND COALESCE(status_operacional, 'conciliado') = 'conciliado'
  GROUP BY fazenda_id, cliente_id, ano, mes
),
mov_meta AS (
  SELECT fazenda_id, cliente_id,
    EXTRACT(year FROM data::date)::int AS ano,
    EXTRACT(month FROM data::date)::int AS mes,
    SUM(CASE WHEN tipo IN ('nascimento','compra','transferencia_entrada') THEN quantidade ELSE 0 END) AS entradas,
    SUM(CASE WHEN tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN quantidade ELSE 0 END) AS saidas,
    SUM(CASE WHEN tipo IN ('nascimento','compra','transferencia_entrada')
      THEN quantidade::numeric * COALESCE(peso_medio_kg, peso_carcaca_kg, 0) ELSE 0 END) AS peso_entradas,
    SUM(CASE WHEN tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte')
      THEN quantidade::numeric * COALESCE(peso_medio_kg, peso_carcaca_kg, 0) ELSE 0 END) AS peso_saidas
  FROM lancamentos
  WHERE cancelado = false
    AND tipo <> 'reclassificacao'
    AND status_operacional = 'previsto'
  GROUP BY fazenda_id, cliente_id, ano, mes
),
mov_all AS (
  SELECT *, 'realizado'::text AS cenario FROM mov_realizado
  UNION ALL
  SELECT *, 'meta'::text AS cenario FROM mov_meta
),
expanded AS (
  SELECT si.fazenda_id, si.cliente_id, si.ano, g.mes, c.cenario,
    si.cab_ini, si.peso_ini,
    COALESCE(m.entradas, 0) AS entradas,
    COALESCE(m.saidas, 0) AS saidas,
    COALESCE(m.peso_entradas, 0) AS peso_entradas,
    COALESCE(m.peso_saidas, 0) AS peso_saidas
  FROM saldo_ini si
  CROSS JOIN (VALUES ('realizado'), ('meta')) c(cenario)
  CROSS JOIN generate_series(1, 12) g(mes)
  LEFT JOIN mov_all m ON m.fazenda_id = si.fazenda_id
    AND m.ano = si.ano AND m.mes = g.mes AND m.cenario = c.cenario
),
running AS (
  SELECT *,
    cab_ini::numeric + COALESCE(SUM(entradas - saidas) OVER w_prev, 0) AS cab_inicio_mes,
    peso_ini + COALESCE(SUM(peso_entradas - peso_saidas) OVER w_prev, 0) AS peso_inicio_contabil,
    cab_ini::numeric + SUM(entradas - saidas) OVER w_curr AS cab_final,
    peso_ini + SUM(peso_entradas - peso_saidas) OVER w_curr AS peso_final_contabil
  FROM expanded
  WINDOW
    w_prev AS (PARTITION BY fazenda_id, ano, cenario ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
    w_curr AS (PARTITION BY fazenda_id, ano, cenario ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
),
peso_real AS (
  SELECT fp.fazenda_id,
    fp.ano_mes,
    EXTRACT(year FROM (fp.ano_mes || '-01')::date)::int AS ano,
    EXTRACT(month FROM (fp.ano_mes || '-01')::date)::int AS mes,
    SUM(fpi.quantidade) AS cab_pesado,
    SUM(fpi.quantidade * COALESCE(fpi.peso_medio_kg, 0)) AS peso_total_real
  FROM fechamento_pastos fp
  JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fp.id
  WHERE fp.status = 'fechado'
  GROUP BY fp.fazenda_id, fp.ano_mes
),
area AS (
  SELECT fazenda_id,
    SUM(CASE WHEN ativo AND entra_conciliacao THEN COALESCE(area_produtiva_ha, 0) ELSE 0 END) AS area_produtiva_ha
  FROM pastos
  GROUP BY fazenda_id
)
SELECT
  r.fazenda_id,
  r.cliente_id,
  r.ano,
  r.mes,
  r.cenario,
  lpad(r.mes::text, 2, '0') AS mes_key,
  r.ano::text || '-' || lpad(r.mes::text, 2, '0') AS ano_mes,
  r.cab_inicio_mes::int AS cabecas_inicio,
  r.cab_final::int AS cabecas_final,
  ROUND(r.peso_inicio_contabil, 2) AS peso_inicio_kg,
  -- Peso final: usar peso real (fechamento pasto) se disponível, senão contábil
  ROUND(COALESCE(pr.peso_total_real, r.peso_final_contabil), 2) AS peso_total_final_kg,
  -- Peso médio final
  CASE WHEN r.cab_final > 0
    THEN ROUND(COALESCE(pr.peso_total_real, r.peso_final_contabil) / r.cab_final, 2)
    ELSE NULL
  END AS peso_medio_final_kg,
  ROUND(r.peso_entradas, 2) AS peso_entradas_kg,
  ROUND(r.peso_saidas, 2) AS peso_saidas_kg,
  r.entradas::int AS entradas,
  r.saidas::int AS saidas,
  EXTRACT(day FROM (make_date(r.ano, r.mes, 1) + interval '1 month' - interval '1 day'))::int AS dias_mes,
  -- GMD: usa peso real final se disponível
  CASE
    WHEN ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(r.cab_final, 0)) / 2.0) > 0
     AND EXTRACT(day FROM (make_date(r.ano, r.mes, 1) + interval '1 month' - interval '1 day')) > 0
    THEN ROUND(
      (
        COALESCE(pr.peso_total_real, r.peso_final_contabil)
        - r.peso_inicio_contabil
        - COALESCE(r.peso_entradas, 0)
        + COALESCE(r.peso_saidas, 0)
      )
      / ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(r.cab_final, 0)) / 2.0)
      / EXTRACT(day FROM (make_date(r.ano, r.mes, 1) + interval '1 month' - interval '1 day'))
    , 4)
    ELSE NULL
  END AS gmd_kg_cab_dia,
  -- Debug: numerador do GMD
  ROUND(
    COALESCE(pr.peso_total_real, r.peso_final_contabil)
    - r.peso_inicio_contabil
    - COALESCE(r.peso_entradas, 0)
    + COALESCE(r.peso_saidas, 0)
  , 2) AS gmd_numerador_kg,
  -- UA média
  CASE
    WHEN ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(r.cab_final, 0)) / 2.0) > 0
     AND r.cab_final > 0
     AND COALESCE(pr.peso_total_real, r.peso_final_contabil) > 0
    THEN ROUND(
      ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(r.cab_final, 0)) / 2.0)
      * (COALESCE(pr.peso_total_real, r.peso_final_contabil) / r.cab_final)
      / 450.0
    , 2)
    ELSE ROUND((COALESCE(r.cab_inicio_mes, 0) + COALESCE(r.cab_final, 0)) / 2.0, 2)
  END AS ua_media,
  COALESCE(a.area_produtiva_ha, 0) AS area_produtiva_ha,
  -- Lotação UA/ha
  CASE
    WHEN COALESCE(a.area_produtiva_ha, 0) > 0 THEN
      CASE
        WHEN ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(r.cab_final, 0)) / 2.0) > 0
         AND r.cab_final > 0
         AND COALESCE(pr.peso_total_real, r.peso_final_contabil) > 0
        THEN ROUND(
          (((COALESCE(r.cab_inicio_mes, 0) + COALESCE(r.cab_final, 0)) / 2.0)
           * (COALESCE(pr.peso_total_real, r.peso_final_contabil) / r.cab_final)
           / 450.0)
          / a.area_produtiva_ha
        , 2)
        ELSE ROUND(
          ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(r.cab_final, 0)) / 2.0)
          / a.area_produtiva_ha
        , 2)
      END
    ELSE NULL
  END AS lotacao_ua_ha
FROM running r
LEFT JOIN peso_real pr ON pr.fazenda_id = r.fazenda_id AND pr.ano = r.ano AND pr.mes = r.mes
LEFT JOIN area a ON a.fazenda_id = r.fazenda_id;
