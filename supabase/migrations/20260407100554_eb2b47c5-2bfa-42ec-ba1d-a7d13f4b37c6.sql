
CREATE OR REPLACE VIEW public.vw_zoot_categoria_mensal AS
WITH categorias AS (
  SELECT id, codigo, nome, ordem_exibicao
  FROM public.categorias_rebanho
),

-- Saldo inicial por categoria (usa código → id)
saldo_ini_cat AS (
  SELECT
    si.fazenda_id,
    si.cliente_id,
    si.ano,
    cr.id AS categoria_id,
    cr.codigo AS categoria_codigo,
    cr.nome AS categoria_nome,
    cr.ordem_exibicao,
    SUM(si.quantidade) AS cab_ini,
    SUM(si.quantidade::numeric * COALESCE(si.peso_medio_kg, 0)) AS peso_ini
  FROM public.saldos_iniciais si
  JOIN categorias cr ON cr.codigo = si.categoria
  GROUP BY si.fazenda_id, si.cliente_id, si.ano, cr.id, cr.codigo, cr.nome, cr.ordem_exibicao
),

-- Movimentações REALIZADO por categoria
mov_realizado AS (
  SELECT
    l.fazenda_id,
    l.cliente_id,
    cr.id AS categoria_id,
    EXTRACT(year FROM l.data::date)::int AS ano,
    EXTRACT(month FROM l.data::date)::int AS mes,
    -- Entradas externas (nascimento, compra, transferencia_entrada)
    SUM(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas_ext,
    -- Saídas externas (abate, venda, transferencia_saida, consumo, morte)
    SUM(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade ELSE 0 END) AS saidas_ext,
    -- Peso entradas externas
    SUM(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada')
      THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_entradas_ext,
    -- Peso saídas externas
    SUM(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte')
      THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_saidas_ext
  FROM public.lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.cancelado = false
    AND l.tipo <> 'reclassificacao'
    AND l.cenario = 'realizado'
    AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id,
    EXTRACT(year FROM l.data::date)::int,
    EXTRACT(month FROM l.data::date)::int
),

-- Reclassificações REALIZADO (saída da categoria origem)
reclass_saida_real AS (
  SELECT
    l.fazenda_id,
    l.cliente_id,
    cr.id AS categoria_id,
    EXTRACT(year FROM l.data::date)::int AS ano,
    EXTRACT(month FROM l.data::date)::int AS mes,
    SUM(l.quantidade) AS qtd,
    SUM(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM public.lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.cancelado = false
    AND l.tipo = 'reclassificacao'
    AND l.categoria_destino IS NOT NULL
    AND l.cenario = 'realizado'
    AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id,
    EXTRACT(year FROM l.data::date)::int,
    EXTRACT(month FROM l.data::date)::int
),

-- Reclassificações REALIZADO (entrada na categoria destino)
reclass_entrada_real AS (
  SELECT
    l.fazenda_id,
    l.cliente_id,
    cr.id AS categoria_id,
    EXTRACT(year FROM l.data::date)::int AS ano,
    EXTRACT(month FROM l.data::date)::int AS mes,
    SUM(l.quantidade) AS qtd,
    SUM(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM public.lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria_destino
  WHERE l.cancelado = false
    AND l.tipo = 'reclassificacao'
    AND l.categoria_destino IS NOT NULL
    AND l.cenario = 'realizado'
    AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id,
    EXTRACT(year FROM l.data::date)::int,
    EXTRACT(month FROM l.data::date)::int
),

-- Movimentações META por categoria
mov_meta AS (
  SELECT
    l.fazenda_id,
    l.cliente_id,
    cr.id AS categoria_id,
    EXTRACT(year FROM l.data::date)::int AS ano,
    EXTRACT(month FROM l.data::date)::int AS mes,
    SUM(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas_ext,
    SUM(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade ELSE 0 END) AS saidas_ext,
    SUM(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada')
      THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_entradas_ext,
    SUM(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte')
      THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_saidas_ext
  FROM public.lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.cancelado = false
    AND l.tipo <> 'reclassificacao'
    AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id,
    EXTRACT(year FROM l.data::date)::int,
    EXTRACT(month FROM l.data::date)::int
),

-- Reclassificações META (saída)
reclass_saida_meta AS (
  SELECT
    l.fazenda_id,
    l.cliente_id,
    cr.id AS categoria_id,
    EXTRACT(year FROM l.data::date)::int AS ano,
    EXTRACT(month FROM l.data::date)::int AS mes,
    SUM(l.quantidade) AS qtd,
    SUM(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM public.lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.cancelado = false
    AND l.tipo = 'reclassificacao'
    AND l.categoria_destino IS NOT NULL
    AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id,
    EXTRACT(year FROM l.data::date)::int,
    EXTRACT(month FROM l.data::date)::int
),

-- Reclassificações META (entrada)
reclass_entrada_meta AS (
  SELECT
    l.fazenda_id,
    l.cliente_id,
    cr.id AS categoria_id,
    EXTRACT(year FROM l.data::date)::int AS ano,
    EXTRACT(month FROM l.data::date)::int AS mes,
    SUM(l.quantidade) AS qtd,
    SUM(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM public.lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria_destino
  WHERE l.cancelado = false
    AND l.tipo = 'reclassificacao'
    AND l.categoria_destino IS NOT NULL
    AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id,
    EXTRACT(year FROM l.data::date)::int,
    EXTRACT(month FROM l.data::date)::int
),

-- Unificação de movimentações por cenário
mov_all AS (
  -- REALIZADO
  SELECT
    mr.fazenda_id, mr.cliente_id, mr.categoria_id, mr.ano, mr.mes,
    mr.entradas_ext, mr.saidas_ext,
    COALESCE(re.qtd, 0) AS evol_cat_entrada,
    COALESCE(rs.qtd, 0) AS evol_cat_saida,
    mr.peso_entradas_ext, mr.peso_saidas_ext,
    COALESCE(re.peso, 0) AS peso_evol_entrada,
    COALESCE(rs.peso, 0) AS peso_evol_saida,
    'realizado'::text AS cenario
  FROM mov_realizado mr
  FULL OUTER JOIN reclass_entrada_real re
    ON re.fazenda_id = mr.fazenda_id AND re.categoria_id = mr.categoria_id AND re.ano = mr.ano AND re.mes = mr.mes
  FULL OUTER JOIN reclass_saida_real rs
    ON rs.fazenda_id = COALESCE(mr.fazenda_id, re.fazenda_id) AND rs.categoria_id = COALESCE(mr.categoria_id, re.categoria_id) AND rs.ano = COALESCE(mr.ano, re.ano) AND rs.mes = COALESCE(mr.mes, re.mes)

  UNION ALL

  -- META
  SELECT
    mm.fazenda_id, mm.cliente_id, mm.categoria_id, mm.ano, mm.mes,
    mm.entradas_ext, mm.saidas_ext,
    COALESCE(rem.qtd, 0) AS evol_cat_entrada,
    COALESCE(rsm.qtd, 0) AS evol_cat_saida,
    mm.peso_entradas_ext, mm.peso_saidas_ext,
    COALESCE(rem.peso, 0) AS peso_evol_entrada,
    COALESCE(rsm.peso, 0) AS peso_evol_saida,
    'meta'::text AS cenario
  FROM mov_meta mm
  FULL OUTER JOIN reclass_entrada_meta rem
    ON rem.fazenda_id = mm.fazenda_id AND rem.categoria_id = mm.categoria_id AND rem.ano = mm.ano AND rem.mes = mm.mes
  FULL OUTER JOIN reclass_saida_meta rsm
    ON rsm.fazenda_id = COALESCE(mm.fazenda_id, rem.fazenda_id) AND rsm.categoria_id = COALESCE(mm.categoria_id, rem.categoria_id) AND rsm.ano = COALESCE(mm.ano, rem.ano) AND rsm.mes = COALESCE(mm.mes, rem.mes)
),

-- Expandir: toda combinação (fazenda, categoria, mês, cenário)
expanded AS (
  SELECT
    si.fazenda_id,
    si.cliente_id,
    si.ano,
    g.mes,
    c.cenario,
    si.categoria_id,
    si.categoria_codigo,
    si.categoria_nome,
    si.ordem_exibicao,
    si.cab_ini,
    si.peso_ini,
    COALESCE(m.entradas_ext, 0) AS entradas_ext,
    COALESCE(m.saidas_ext, 0) AS saidas_ext,
    COALESCE(m.evol_cat_entrada, 0) AS evol_cat_entrada,
    COALESCE(m.evol_cat_saida, 0) AS evol_cat_saida,
    COALESCE(m.peso_entradas_ext, 0) AS peso_entradas_ext,
    COALESCE(m.peso_saidas_ext, 0) AS peso_saidas_ext,
    COALESCE(m.peso_evol_entrada, 0) AS peso_evol_entrada,
    COALESCE(m.peso_evol_saida, 0) AS peso_evol_saida
  FROM saldo_ini_cat si
  CROSS JOIN (VALUES ('realizado'), ('meta')) c(cenario)
  CROSS JOIN generate_series(1, 12) g(mes)
  LEFT JOIN mov_all m ON m.fazenda_id = si.fazenda_id
    AND m.categoria_id = si.categoria_id
    AND m.ano = si.ano
    AND m.mes = g.mes
    AND m.cenario = c.cenario
),

-- Running sums per category
running AS (
  SELECT
    e.*,
    -- Net movement per month for this category
    (e.entradas_ext - e.saidas_ext + e.evol_cat_entrada - e.evol_cat_saida) AS delta_mes,
    -- Saldo início do mês = saldo_inicial + soma dos deltas dos meses anteriores
    e.cab_ini::numeric + COALESCE(
      SUM(e.entradas_ext - e.saidas_ext + e.evol_cat_entrada - e.evol_cat_saida)
      OVER (PARTITION BY e.fazenda_id, e.categoria_id, e.ano, e.cenario ORDER BY e.mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
    , 0) AS saldo_inicio_mes,
    -- Saldo final do mês
    e.cab_ini::numeric + SUM(e.entradas_ext - e.saidas_ext + e.evol_cat_entrada - e.evol_cat_saida)
      OVER (PARTITION BY e.fazenda_id, e.categoria_id, e.ano, e.cenario ORDER BY e.mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS saldo_final_contabil,
    -- Peso início do mês
    e.peso_ini + COALESCE(
      SUM(e.peso_entradas_ext - e.peso_saidas_ext + e.peso_evol_entrada - e.peso_evol_saida)
      OVER (PARTITION BY e.fazenda_id, e.categoria_id, e.ano, e.cenario ORDER BY e.mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
    , 0) AS peso_inicio_mes,
    -- Peso final contábil
    e.peso_ini + SUM(e.peso_entradas_ext - e.peso_saidas_ext + e.peso_evol_entrada - e.peso_evol_saida)
      OVER (PARTITION BY e.fazenda_id, e.categoria_id, e.ano, e.cenario ORDER BY e.mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS peso_final_contabil
  FROM expanded e
),

-- Peso real do fechamento de pastos por categoria
peso_real_cat AS (
  SELECT
    fp.fazenda_id,
    fp.ano_mes,
    EXTRACT(year FROM (fp.ano_mes || '-01')::date)::int AS ano,
    EXTRACT(month FROM (fp.ano_mes || '-01')::date)::int AS mes,
    fpi.categoria_id,
    SUM(fpi.quantidade) AS cab_pesado,
    SUM(fpi.quantidade::numeric * COALESCE(fpi.peso_medio_kg, 0)) AS peso_total_real,
    CASE WHEN SUM(fpi.quantidade) > 0
      THEN ROUND(SUM(fpi.quantidade::numeric * COALESCE(fpi.peso_medio_kg, 0)) / SUM(fpi.quantidade), 2)
      ELSE NULL END AS peso_medio_real
  FROM public.fechamento_pastos fp
  JOIN public.fechamento_pasto_itens fpi ON fpi.fechamento_id = fp.id
  WHERE fp.status = 'fechado'
  GROUP BY fp.fazenda_id, fp.ano_mes, fpi.categoria_id
)

SELECT
  r.fazenda_id,
  r.cliente_id,
  r.ano,
  r.mes,
  r.cenario,
  r.ano::text || '-' || LPAD(r.mes::text, 2, '0') AS ano_mes,
  r.categoria_id,
  r.categoria_codigo,
  r.categoria_nome,
  r.ordem_exibicao,

  -- Saldos
  r.saldo_inicio_mes::int AS saldo_inicial,
  r.entradas_ext::int AS entradas_externas,
  r.saidas_ext::int AS saidas_externas,
  r.evol_cat_entrada::int AS evol_cat_entrada,
  r.evol_cat_saida::int AS evol_cat_saida,

  -- Saldo final: usar fechamento de pastos (realizado) se disponível
  CASE
    WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0
      THEN pr.cab_pesado::int
    ELSE r.saldo_final_contabil::int
  END AS saldo_final,

  -- Pesos
  ROUND(r.peso_inicio_mes, 2) AS peso_total_inicial,
  CASE
    WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL
      THEN ROUND(pr.peso_total_real, 2)
    ELSE ROUND(r.peso_final_contabil, 2)
  END AS peso_total_final,

  -- Peso médio inicial
  CASE WHEN r.saldo_inicio_mes > 0
    THEN ROUND(r.peso_inicio_mes / r.saldo_inicio_mes, 2)
    ELSE NULL::numeric
  END AS peso_medio_inicial,

  -- Peso médio final
  CASE
    WHEN r.cenario = 'realizado' AND pr.peso_medio_real IS NOT NULL
      THEN pr.peso_medio_real
    WHEN r.saldo_final_contabil > 0
      THEN ROUND(r.peso_final_contabil / r.saldo_final_contabil, 2)
    ELSE NULL::numeric
  END AS peso_medio_final,

  -- Dias do mês
  EXTRACT(DAY FROM (make_date(r.ano, r.mes, 1) + INTERVAL '1 month' - INTERVAL '1 day'))::int AS dias_mes,

  -- GMD: (peso_final - peso_inicial - peso_entradas + peso_saidas) / cab_media / dias
  CASE
    WHEN (
      (COALESCE(r.saldo_inicio_mes, 0) + COALESCE(
        CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0
          THEN pr.cab_pesado::numeric ELSE r.saldo_final_contabil END, 0)
      ) / 2.0 > 0
    ) AND EXTRACT(DAY FROM (make_date(r.ano, r.mes, 1) + INTERVAL '1 month' - INTERVAL '1 day')) > 0
    THEN ROUND(
      (
        (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END)
        - r.peso_inicio_mes
        - COALESCE(r.peso_entradas_ext + r.peso_evol_entrada, 0)
        + COALESCE(r.peso_saidas_ext + r.peso_evol_saida, 0)
      )
      / (
        (COALESCE(r.saldo_inicio_mes, 0) + COALESCE(
          CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0
            THEN pr.cab_pesado::numeric ELSE r.saldo_final_contabil END, 0)
        ) / 2.0
      )
      / EXTRACT(DAY FROM (make_date(r.ano, r.mes, 1) + INTERVAL '1 month' - INTERVAL '1 day'))
    , 4)
    ELSE NULL::numeric
  END AS gmd,

  -- Produção biológica: SF * GMD * dias
  -- (calculado como peso_ganho = peso_final - peso_inicial - peso_entradas + peso_saidas)
  ROUND(
    (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END)
    - r.peso_inicio_mes
    - COALESCE(r.peso_entradas_ext + r.peso_evol_entrada, 0)
    + COALESCE(r.peso_saidas_ext + r.peso_evol_saida, 0)
  , 2) AS producao_biologica,

  -- Fonte oficial
  CASE
    WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN 'fechamento'
    WHEN r.cenario = 'meta' THEN 'projecao'
    ELSE 'fallback_movimentacao'
  END AS fonte_oficial_mes

FROM running r
LEFT JOIN peso_real_cat pr
  ON pr.fazenda_id = r.fazenda_id
  AND pr.categoria_id = r.categoria_id
  AND pr.ano = r.ano
  AND pr.mes = r.mes;
