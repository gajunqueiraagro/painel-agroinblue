
CREATE OR REPLACE VIEW public.vw_zoot_fazenda_mensal AS
WITH saldo_ini AS (
  SELECT s.fazenda_id, s.cliente_id, s.ano,
    sum(s.quantidade) AS cab_ini,
    sum(s.quantidade::numeric * COALESCE(s.peso_medio_kg, 0)) AS peso_ini
  FROM saldos_iniciais s
  GROUP BY s.fazenda_id, s.cliente_id, s.ano
),
mov_realizado AS (
  SELECT l.fazenda_id, l.cliente_id,
    EXTRACT(year FROM l.data::date)::integer AS ano,
    EXTRACT(month FROM l.data::date)::integer AS mes,
    sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas,
    sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade ELSE 0 END) AS saidas,
    sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_entradas,
    sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_saidas
  FROM lancamentos l
  WHERE l.cancelado = false
    AND l.tipo <> 'reclassificacao'
    AND COALESCE(l.status_operacional, 'conciliado') = 'conciliado'
  GROUP BY l.fazenda_id, l.cliente_id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
),
mov_meta AS (
  SELECT l.fazenda_id, l.cliente_id,
    EXTRACT(year FROM l.data::date)::integer AS ano,
    EXTRACT(month FROM l.data::date)::integer AS mes,
    sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas,
    sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade ELSE 0 END) AS saidas,
    sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_entradas,
    sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_saidas
  FROM lancamentos l
  WHERE l.cancelado = false
    AND l.tipo <> 'reclassificacao'
    AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
),
mov_all AS (
  SELECT fazenda_id, cliente_id, ano, mes, entradas, saidas, peso_entradas, peso_saidas, 'realizado'::text AS cenario FROM mov_realizado
  UNION ALL
  SELECT fazenda_id, cliente_id, ano, mes, entradas, saidas, peso_entradas, peso_saidas, 'meta'::text AS cenario FROM mov_meta
),
meses AS (
  SELECT generate_series(1,12) AS mes
),
fazenda_cenario AS (
  SELECT DISTINCT fc_sub.fazenda_id, fc_sub.cliente_id, fc_sub.ano, fc_sub.cenario
  FROM (
    SELECT si2.fazenda_id, si2.cliente_id, si2.ano, 'realizado'::text AS cenario FROM saldo_ini si2
    UNION
    SELECT ma2.fazenda_id, ma2.cliente_id, ma2.ano, ma2.cenario FROM mov_all ma2
  ) fc_sub
),
grid AS (
  SELECT fc.fazenda_id, fc.cliente_id, fc.ano, fc.cenario, m.mes
  FROM fazenda_cenario fc CROSS JOIN meses m
),
rolling AS (
  SELECT g.fazenda_id, g.cliente_id, g.ano, g.cenario, g.mes,
    COALESCE(si.cab_ini, 0) + sum(COALESCE(mv.entradas, 0) - COALESCE(mv.saidas, 0))
      OVER (PARTITION BY g.fazenda_id, g.cliente_id, g.ano, g.cenario ORDER BY g.mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS cab_inicio_mes,
    COALESCE(si.cab_ini, 0) + sum(COALESCE(mv.entradas, 0) - COALESCE(mv.saidas, 0))
      OVER (PARTITION BY g.fazenda_id, g.cliente_id, g.ano, g.cenario ORDER BY g.mes ROWS UNBOUNDED PRECEDING) AS cab_final,
    COALESCE(si.peso_ini, 0) + sum(COALESCE(mv.peso_entradas, 0) - COALESCE(mv.peso_saidas, 0))
      OVER (PARTITION BY g.fazenda_id, g.cliente_id, g.ano, g.cenario ORDER BY g.mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS peso_inicio_contabil,
    COALESCE(si.peso_ini, 0) + sum(COALESCE(mv.peso_entradas, 0) - COALESCE(mv.peso_saidas, 0))
      OVER (PARTITION BY g.fazenda_id, g.cliente_id, g.ano, g.cenario ORDER BY g.mes ROWS UNBOUNDED PRECEDING) AS peso_final_contabil,
    COALESCE(mv.entradas, 0) AS entradas,
    COALESCE(mv.saidas, 0) AS saidas,
    COALESCE(mv.peso_entradas, 0) AS peso_entradas,
    COALESCE(mv.peso_saidas, 0) AS peso_saidas,
    (date_part('day', (make_date(g.ano, g.mes, 1) + interval '1 month' - interval '1 day')))::integer AS dias_mes
  FROM grid g
  LEFT JOIN saldo_ini si ON si.fazenda_id = g.fazenda_id AND si.ano = g.ano
  LEFT JOIN mov_all mv ON mv.fazenda_id = g.fazenda_id AND mv.ano = g.ano AND mv.mes = g.mes AND mv.cenario = g.cenario
),
pesagem_real AS (
  SELECT fp.fazenda_id, 
    EXTRACT(year FROM (fp.ano_mes || '-01')::date)::integer AS ano,
    EXTRACT(month FROM (fp.ano_mes || '-01')::date)::integer AS mes,
    sum(fpi.quantidade) AS cab_pesado,
    sum(fpi.quantidade::numeric * COALESCE(fpi.peso_medio_kg, 0)) AS peso_total_real
  FROM fechamento_pastos fp
  JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fp.id
  WHERE fp.status = 'fechado'
  GROUP BY fp.fazenda_id, EXTRACT(year FROM (fp.ano_mes || '-01')::date)::integer, EXTRACT(month FROM (fp.ano_mes || '-01')::date)::integer
),
area AS (
  SELECT p2.fazenda_id,
    sum(CASE WHEN p2.ativo AND p2.entra_conciliacao THEN p2.area_produtiva_ha ELSE 0 END) AS area_produtiva_ha
  FROM pastos p2
  GROUP BY p2.fazenda_id
)
SELECT
  r.fazenda_id,
  r.cliente_id,
  r.ano,
  r.mes,
  r.cenario,
  lpad(r.mes::text, 2, '0') AS mes_key,
  r.ano::text || '-' || lpad(r.mes::text, 2, '0') AS ano_mes,
  r.cab_inicio_mes::integer AS cabecas_inicio,
  CASE
    WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::integer
    ELSE r.cab_final::integer
  END AS cabecas_final,
  round(r.peso_inicio_contabil, 2) AS peso_inicio_kg,
  CASE
    WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN round(pr.peso_total_real, 2)
    ELSE round(r.peso_final_contabil, 2)
  END AS peso_total_final_kg,
  CASE
    WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN round(pr.peso_total_real / pr.cab_pesado::numeric, 2)
    WHEN r.cab_final > 0 THEN round(r.peso_final_contabil / r.cab_final, 2)
    ELSE NULL
  END AS peso_medio_final_kg,
  round(r.peso_entradas, 2) AS peso_entradas_kg,
  round(r.peso_saidas, 2) AS peso_saidas_kg,
  r.entradas::integer AS entradas,
  r.saidas::integer AS saidas,
  r.dias_mes,
  CASE
    WHEN r.dias_mes > 0 AND (
      CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
    ) > 0 THEN
      round(
        (
          (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END)
          - r.peso_inicio_contabil
          - r.peso_entradas
          + r.peso_saidas
        ) / (
          (COALESCE(r.cab_inicio_mes, 0) + COALESCE(
            CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
          , 0)) / 2.0
        ) / r.dias_mes
      , 4)
    ELSE NULL
  END AS gmd_kg_cab_dia,
  CASE
    WHEN (CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END) > 0 THEN
      round(
        (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END)
        - r.peso_inicio_contabil
        - r.peso_entradas
        + r.peso_saidas
      , 2)
    ELSE NULL
  END AS gmd_numerador_kg,
  CASE
    WHEN (CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END) > 0 THEN
      round(
        ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(
          CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
        , 0)) / 2.0)
        * (
          (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END)
          / (CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END)
        ) / 450.0
      , 2)
    ELSE NULL
  END AS ua_media,
  COALESCE(a.area_produtiva_ha, 0) AS area_produtiva_ha,
  CASE
    WHEN COALESCE(a.area_produtiva_ha, 0) > 0 AND COALESCE(
      CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
    , 0) > 0 THEN
      round(
        ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(
          CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
        , 0)) / 2.0)
        * (
          (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END)
          / (CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END)
        ) / 450.0
        / a.area_produtiva_ha
      , 2)
    ELSE NULL
  END AS lotacao_ua_ha,
  CASE
    WHEN pr.cab_pesado IS NOT NULL AND r.cenario = 'realizado' THEN 'fechamento'
    WHEN r.cenario = 'realizado' THEN 'fallback_movimentacao'
    ELSE 'projecao'
  END AS fonte_oficial_mes
FROM rolling r
LEFT JOIN pesagem_real pr ON pr.fazenda_id = r.fazenda_id AND pr.ano = r.ano AND pr.mes = r.mes AND r.cenario = 'realizado'
LEFT JOIN area a ON a.fazenda_id = r.fazenda_id;
