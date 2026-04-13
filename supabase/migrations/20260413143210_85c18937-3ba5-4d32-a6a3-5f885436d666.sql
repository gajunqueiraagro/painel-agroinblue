CREATE OR REPLACE VIEW public.vw_zoot_categoria_mensal AS
WITH RECURSIVE
categorias AS (
  SELECT id, codigo, nome, ordem_exibicao
  FROM public.categorias_rebanho
),
saldo_ini_cat AS (
  SELECT
    si.fazenda_id,
    si.cliente_id,
    si.ano,
    cr.id AS categoria_id,
    cr.codigo AS categoria_codigo,
    cr.nome AS categoria_nome,
    cr.ordem_exibicao,
    SUM(si.quantidade)::numeric AS cab_ini,
    SUM(si.quantidade::numeric * COALESCE(si.peso_medio_kg, 0)) AS peso_ini
  FROM public.saldos_iniciais si
  JOIN categorias cr ON cr.codigo = si.categoria
  GROUP BY si.fazenda_id, si.cliente_id, si.ano, cr.id, cr.codigo, cr.nome, cr.ordem_exibicao
),
mov_realizado AS (
  SELECT
    l.fazenda_id,
    l.cliente_id,
    cr.id AS categoria_id,
    EXTRACT(YEAR FROM l.data::date)::int AS ano,
    EXTRACT(MONTH FROM l.data::date)::int AS mes,
    SUM(CASE WHEN l.tipo IN ('nascimento', 'compra', 'transferencia_entrada') THEN l.quantidade ELSE 0 END)::numeric AS entradas_ext,
    SUM(CASE WHEN l.tipo IN ('abate', 'venda', 'venda_pe', 'transferencia_saida', 'consumo', 'morte') THEN l.quantidade ELSE 0 END)::numeric AS saidas_ext,
    SUM(CASE WHEN l.tipo IN ('nascimento', 'compra', 'transferencia_entrada') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_entradas_ext,
    SUM(CASE WHEN l.tipo IN ('abate', 'venda', 'venda_pe', 'transferencia_saida', 'consumo', 'morte') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_saidas_ext
  FROM public.lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.cancelado = false
    AND l.tipo <> 'reclassificacao'
    AND l.cenario = 'realizado'
    AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(YEAR FROM l.data::date)::int, EXTRACT(MONTH FROM l.data::date)::int
),
reclass_saida_real AS (
  SELECT
    l.fazenda_id,
    l.cliente_id,
    cr.id AS categoria_id,
    EXTRACT(YEAR FROM l.data::date)::int AS ano,
    EXTRACT(MONTH FROM l.data::date)::int AS mes,
    SUM(l.quantidade)::numeric AS qtd,
    SUM(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM public.lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.cancelado = false
    AND l.tipo = 'reclassificacao'
    AND l.categoria_destino IS NOT NULL
    AND l.cenario = 'realizado'
    AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(YEAR FROM l.data::date)::int, EXTRACT(MONTH FROM l.data::date)::int
),
reclass_entrada_real AS (
  SELECT
    l.fazenda_id,
    l.cliente_id,
    cr.id AS categoria_id,
    EXTRACT(YEAR FROM l.data::date)::int AS ano,
    EXTRACT(MONTH FROM l.data::date)::int AS mes,
    SUM(l.quantidade)::numeric AS qtd,
    SUM(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM public.lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria_destino
  WHERE l.cancelado = false
    AND l.tipo = 'reclassificacao'
    AND l.categoria_destino IS NOT NULL
    AND l.cenario = 'realizado'
    AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(YEAR FROM l.data::date)::int, EXTRACT(MONTH FROM l.data::date)::int
),
mov_meta AS (
  SELECT
    l.fazenda_id,
    l.cliente_id,
    cr.id AS categoria_id,
    EXTRACT(YEAR FROM l.data::date)::int AS ano,
    EXTRACT(MONTH FROM l.data::date)::int AS mes,
    SUM(CASE WHEN l.tipo IN ('nascimento', 'compra', 'transferencia_entrada') THEN l.quantidade ELSE 0 END)::numeric AS entradas_ext,
    SUM(CASE WHEN l.tipo IN ('abate', 'venda', 'venda_pe', 'transferencia_saida', 'consumo', 'morte') THEN l.quantidade ELSE 0 END)::numeric AS saidas_ext,
    SUM(CASE WHEN l.tipo IN ('nascimento', 'compra', 'transferencia_entrada') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_entradas_ext,
    SUM(CASE WHEN l.tipo IN ('abate', 'venda', 'venda_pe', 'transferencia_saida', 'consumo', 'morte') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_saidas_ext
  FROM public.lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.cancelado = false
    AND l.tipo <> 'reclassificacao'
    AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(YEAR FROM l.data::date)::int, EXTRACT(MONTH FROM l.data::date)::int
),
reclass_saida_meta AS (
  SELECT
    l.fazenda_id,
    l.cliente_id,
    cr.id AS categoria_id,
    EXTRACT(YEAR FROM l.data::date)::int AS ano,
    EXTRACT(MONTH FROM l.data::date)::int AS mes,
    SUM(l.quantidade)::numeric AS qtd,
    SUM(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM public.lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.cancelado = false
    AND l.tipo = 'reclassificacao'
    AND l.categoria_destino IS NOT NULL
    AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(YEAR FROM l.data::date)::int, EXTRACT(MONTH FROM l.data::date)::int
),
reclass_entrada_meta AS (
  SELECT
    l.fazenda_id,
    l.cliente_id,
    cr.id AS categoria_id,
    EXTRACT(YEAR FROM l.data::date)::int AS ano,
    EXTRACT(MONTH FROM l.data::date)::int AS mes,
    SUM(l.quantidade)::numeric AS qtd,
    SUM(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM public.lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria_destino
  WHERE l.cancelado = false
    AND l.tipo = 'reclassificacao'
    AND l.categoria_destino IS NOT NULL
    AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(YEAR FROM l.data::date)::int, EXTRACT(MONTH FROM l.data::date)::int
),
meta_gmd AS (
  SELECT
    mg.fazenda_id,
    cr.id AS categoria_id,
    EXTRACT(YEAR FROM (mg.ano_mes || '-01')::date)::int AS ano,
    EXTRACT(MONTH FROM (mg.ano_mes || '-01')::date)::int AS mes,
    mg.gmd_previsto
  FROM public.meta_gmd_mensal mg
  JOIN categorias cr ON cr.codigo = mg.categoria
),
mov_all AS (
  SELECT
    COALESCE(mr.fazenda_id, re.fazenda_id, rs.fazenda_id) AS fazenda_id,
    COALESCE(mr.cliente_id, re.cliente_id, rs.cliente_id) AS cliente_id,
    COALESCE(mr.categoria_id, re.categoria_id, rs.categoria_id) AS categoria_id,
    COALESCE(mr.ano, re.ano, rs.ano) AS ano,
    COALESCE(mr.mes, re.mes, rs.mes) AS mes,
    COALESCE(mr.entradas_ext, 0) AS entradas_ext,
    COALESCE(mr.saidas_ext, 0) AS saidas_ext,
    COALESCE(re.qtd, 0) AS evol_cat_entrada,
    COALESCE(rs.qtd, 0) AS evol_cat_saida,
    COALESCE(mr.peso_entradas_ext, 0) AS peso_entradas_ext,
    COALESCE(mr.peso_saidas_ext, 0) AS peso_saidas_ext,
    COALESCE(re.peso, 0) AS peso_evol_entrada,
    COALESCE(rs.peso, 0) AS peso_evol_saida,
    'realizado'::text AS cenario
  FROM mov_realizado mr
  FULL JOIN reclass_entrada_real re
    ON re.fazenda_id = mr.fazenda_id
   AND re.categoria_id = mr.categoria_id
   AND re.ano = mr.ano
   AND re.mes = mr.mes
  FULL JOIN reclass_saida_real rs
    ON rs.fazenda_id = COALESCE(mr.fazenda_id, re.fazenda_id)
   AND rs.categoria_id = COALESCE(mr.categoria_id, re.categoria_id)
   AND rs.ano = COALESCE(mr.ano, re.ano)
   AND rs.mes = COALESCE(mr.mes, re.mes)
  UNION ALL
  SELECT
    COALESCE(mm.fazenda_id, rem.fazenda_id, rsm.fazenda_id) AS fazenda_id,
    COALESCE(mm.cliente_id, rem.cliente_id, rsm.cliente_id) AS cliente_id,
    COALESCE(mm.categoria_id, rem.categoria_id, rsm.categoria_id) AS categoria_id,
    COALESCE(mm.ano, rem.ano, rsm.ano) AS ano,
    COALESCE(mm.mes, rem.mes, rsm.mes) AS mes,
    COALESCE(mm.entradas_ext, 0) AS entradas_ext,
    COALESCE(mm.saidas_ext, 0) AS saidas_ext,
    COALESCE(rem.qtd, 0) AS evol_cat_entrada,
    COALESCE(rsm.qtd, 0) AS evol_cat_saida,
    COALESCE(mm.peso_entradas_ext, 0) AS peso_entradas_ext,
    COALESCE(mm.peso_saidas_ext, 0) AS peso_saidas_ext,
    COALESCE(rem.peso, 0) AS peso_evol_entrada,
    COALESCE(rsm.peso, 0) AS peso_evol_saida,
    'meta'::text AS cenario
  FROM mov_meta mm
  FULL JOIN reclass_entrada_meta rem
    ON rem.fazenda_id = mm.fazenda_id
   AND rem.categoria_id = mm.categoria_id
   AND rem.ano = mm.ano
   AND rem.mes = mm.mes
  FULL JOIN reclass_saida_meta rsm
    ON rsm.fazenda_id = COALESCE(mm.fazenda_id, rem.fazenda_id)
   AND rsm.categoria_id = COALESCE(mm.categoria_id, rem.categoria_id)
   AND rsm.ano = COALESCE(mm.ano, rem.ano)
   AND rsm.mes = COALESCE(mm.mes, rem.mes)
),
cat_year_bounds AS (
  SELECT
    src.fazenda_id,
    src.cliente_id,
    src.categoria_id,
    MIN(src.ano)::int AS min_ano,
    MAX(src.ano)::int AS max_ano
  FROM (
    SELECT fazenda_id, cliente_id, categoria_id, ano FROM saldo_ini_cat
    UNION
    SELECT DISTINCT fazenda_id, cliente_id, categoria_id, ano FROM mov_all
  ) src
  GROUP BY src.fazenda_id, src.cliente_id, src.categoria_id
),
all_cat_bases AS (
  SELECT
    cy.fazenda_id,
    cy.cliente_id,
    anos.ano::int AS ano,
    cy.categoria_id,
    cr.codigo AS categoria_codigo,
    cr.nome AS categoria_nome,
    cr.ordem_exibicao,
    COALESCE(si.cab_ini, 0) AS cab_ini_ano,
    COALESCE(si.peso_ini, 0) AS peso_ini_ano
  FROM cat_year_bounds cy
  JOIN LATERAL generate_series(cy.min_ano, cy.max_ano) AS anos(ano) ON true
  JOIN categorias cr ON cr.id = cy.categoria_id
  LEFT JOIN saldo_ini_cat si
    ON si.fazenda_id = cy.fazenda_id
   AND si.cliente_id = cy.cliente_id
   AND si.ano = anos.ano::int
   AND si.categoria_id = cy.categoria_id
),
fechamento_dedup AS (
  SELECT DISTINCT ON (fp.pasto_id, fp.ano_mes)
    fp.id,
    fp.fazenda_id,
    fp.ano_mes,
    fp.pasto_id
  FROM public.fechamento_pastos fp
  JOIN public.pastos p ON p.id = fp.pasto_id
  WHERE p.ativo = true
    AND p.entra_conciliacao = true
  ORDER BY fp.pasto_id, fp.ano_mes, fp.created_at
),
peso_real_cat AS (
  SELECT
    fd.fazenda_id,
    EXTRACT(YEAR FROM (fd.ano_mes || '-01')::date)::int AS ano,
    EXTRACT(MONTH FROM (fd.ano_mes || '-01')::date)::int AS mes,
    fpi.categoria_id,
    SUM(fpi.quantidade)::numeric AS cab_pesado,
    SUM(fpi.quantidade::numeric * COALESCE(fpi.peso_medio_kg, 0)) AS peso_total_real
  FROM fechamento_dedup fd
  JOIN public.fechamento_pasto_itens fpi ON fpi.fechamento_id = fd.id
  GROUP BY fd.fazenda_id, EXTRACT(YEAR FROM (fd.ano_mes || '-01')::date)::int, EXTRACT(MONTH FROM (fd.ano_mes || '-01')::date)::int, fpi.categoria_id
),
expanded AS (
  SELECT
    base.fazenda_id,
    base.cliente_id,
    base.ano,
    mes_ref.mes,
    cen.cenario,
    base.categoria_id,
    base.categoria_codigo,
    base.categoria_nome,
    base.ordem_exibicao,
    COALESCE(base.cab_ini_ano, 0)::numeric AS cab_ini_ano,
    ROUND(COALESCE(base.peso_ini_ano, 0), 2) AS peso_ini_ano,
    COALESCE(m.entradas_ext, 0)::numeric AS entradas_ext,
    COALESCE(m.saidas_ext, 0)::numeric AS saidas_ext,
    COALESCE(m.evol_cat_entrada, 0)::numeric AS evol_cat_entrada,
    COALESCE(m.evol_cat_saida, 0)::numeric AS evol_cat_saida,
    ROUND(COALESCE(m.peso_entradas_ext, 0), 2) AS peso_entradas_ext,
    ROUND(COALESCE(m.peso_saidas_ext, 0), 2) AS peso_saidas_ext,
    ROUND(COALESCE(m.peso_evol_entrada, 0), 2) AS peso_evol_entrada,
    ROUND(COALESCE(m.peso_evol_saida, 0), 2) AS peso_evol_saida,
    (
      COALESCE(m.entradas_ext, 0)
      - COALESCE(m.saidas_ext, 0)
      + COALESCE(m.evol_cat_entrada, 0)
      - COALESCE(m.evol_cat_saida, 0)
    )::numeric AS delta_cab,
    ROUND(
      COALESCE(m.peso_entradas_ext, 0)
      - COALESCE(m.peso_saidas_ext, 0)
      + COALESCE(m.peso_evol_entrada, 0)
      - COALESCE(m.peso_evol_saida, 0)
    , 2) AS delta_peso,
    COALESCE(mg.gmd_previsto, 0)::numeric AS gmd_previsto,
    EXTRACT(DAY FROM make_date(base.ano, mes_ref.mes, 1) + interval '1 month' - interval '1 day')::int AS dias_mes,
    pr.cab_pesado,
    pr.peso_total_real,
    CASE
      WHEN cen.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN 'fechamento'
      WHEN cen.cenario = 'realizado' AND (
        COALESCE(m.entradas_ext, 0) > 0
        OR COALESCE(m.saidas_ext, 0) > 0
        OR COALESCE(m.evol_cat_entrada, 0) > 0
        OR COALESCE(m.evol_cat_saida, 0) > 0
      ) THEN 'fallback_movimentacao'
      ELSE 'projecao'
    END AS fonte_mes,
    ROW_NUMBER() OVER (
      PARTITION BY base.fazenda_id, cen.cenario, base.categoria_id
      ORDER BY base.ano, mes_ref.mes
    ) AS seq
  FROM all_cat_bases base
  CROSS JOIN (VALUES ('realizado'::text), ('meta'::text)) AS cen(cenario)
  CROSS JOIN generate_series(1, 12) AS mes_ref(mes)
  LEFT JOIN mov_all m
    ON m.fazenda_id = base.fazenda_id
   AND m.categoria_id = base.categoria_id
   AND m.ano = base.ano
   AND m.mes = mes_ref.mes
   AND m.cenario = cen.cenario
  LEFT JOIN meta_gmd mg
    ON mg.fazenda_id = base.fazenda_id
   AND mg.categoria_id = base.categoria_id
   AND mg.ano = base.ano
   AND mg.mes = mes_ref.mes
   AND cen.cenario = 'meta'
  LEFT JOIN peso_real_cat pr
    ON pr.fazenda_id = base.fazenda_id
   AND pr.categoria_id = base.categoria_id
   AND pr.ano = base.ano
   AND pr.mes = mes_ref.mes
   AND cen.cenario = 'realizado'
),
chain AS (
  SELECT
    e.*,
    e.cab_ini_ano AS saldo_inicial_calc,
    (e.cab_ini_ano + e.delta_cab) AS saldo_final_contabil,
    CASE
      WHEN e.fonte_mes = 'fechamento' THEN COALESCE(e.cab_pesado, e.cab_ini_ano + e.delta_cab)
      ELSE (e.cab_ini_ano + e.delta_cab)
    END AS saldo_final_calc,
    e.peso_ini_ano AS peso_total_inicial_calc,
    CASE
      WHEN e.cenario = 'meta' THEN ROUND(
        COALESCE(e.gmd_previsto, 0)
        * ((e.cab_ini_ano + (e.cab_ini_ano + e.delta_cab)) / 2.0)
        * e.dias_mes
      , 2)
      ELSE 0::numeric
    END AS producao_biologica_calc,
    ROUND(
      e.peso_ini_ano
      + e.delta_peso
      + CASE
          WHEN e.cenario = 'meta' THEN COALESCE(e.gmd_previsto, 0)
            * ((e.cab_ini_ano + (e.cab_ini_ano + e.delta_cab)) / 2.0)
            * e.dias_mes
          ELSE 0
        END
    , 2) AS peso_total_final_contabil,
    CASE
      WHEN e.cenario = 'realizado' AND e.peso_total_real IS NOT NULL THEN ROUND(e.peso_total_real, 2)
      ELSE ROUND(
        e.peso_ini_ano
        + e.delta_peso
        + CASE
            WHEN e.cenario = 'meta' THEN COALESCE(e.gmd_previsto, 0)
              * ((e.cab_ini_ano + (e.cab_ini_ano + e.delta_cab)) / 2.0)
              * e.dias_mes
            ELSE 0
          END
      , 2)
    END AS peso_total_final_calc
  FROM expanded e
  WHERE e.seq = 1

  UNION ALL

  SELECT
    e.*,
    c.saldo_final_calc AS saldo_inicial_calc,
    (c.saldo_final_calc + e.delta_cab) AS saldo_final_contabil,
    CASE
      WHEN e.fonte_mes = 'fechamento' THEN COALESCE(e.cab_pesado, c.saldo_final_calc + e.delta_cab)
      ELSE (c.saldo_final_calc + e.delta_cab)
    END AS saldo_final_calc,
    c.peso_total_final_calc AS peso_total_inicial_calc,
    CASE
      WHEN e.cenario = 'meta' THEN ROUND(
        COALESCE(e.gmd_previsto, 0)
        * ((c.saldo_final_calc + (c.saldo_final_calc + e.delta_cab)) / 2.0)
        * e.dias_mes
      , 2)
      ELSE 0::numeric
    END AS producao_biologica_calc,
    ROUND(
      c.peso_total_final_calc
      + e.delta_peso
      + CASE
          WHEN e.cenario = 'meta' THEN COALESCE(e.gmd_previsto, 0)
            * ((c.saldo_final_calc + (c.saldo_final_calc + e.delta_cab)) / 2.0)
            * e.dias_mes
          ELSE 0
        END
    , 2) AS peso_total_final_contabil,
    CASE
      WHEN e.cenario = 'realizado' AND e.peso_total_real IS NOT NULL THEN ROUND(e.peso_total_real, 2)
      ELSE ROUND(
        c.peso_total_final_calc
        + e.delta_peso
        + CASE
            WHEN e.cenario = 'meta' THEN COALESCE(e.gmd_previsto, 0)
              * ((c.saldo_final_calc + (c.saldo_final_calc + e.delta_cab)) / 2.0)
              * e.dias_mes
            ELSE 0
          END
      , 2)
    END AS peso_total_final_calc
  FROM chain c
  JOIN expanded e
    ON e.fazenda_id = c.fazenda_id
   AND e.cenario = c.cenario
   AND e.categoria_id = c.categoria_id
   AND e.seq = c.seq + 1
)
SELECT
  fazenda_id,
  cliente_id,
  ano,
  mes,
  cenario,
  (ano::text || '-' || LPAD(mes::text, 2, '0')) AS ano_mes,
  categoria_id,
  categoria_codigo,
  categoria_nome,
  ordem_exibicao,
  saldo_inicial_calc::int AS saldo_inicial,
  entradas_ext::int AS entradas_externas,
  saidas_ext::int AS saidas_externas,
  evol_cat_entrada::int AS evol_cat_entrada,
  evol_cat_saida::int AS evol_cat_saida,
  saldo_final_calc::int AS saldo_final,
  ROUND(peso_total_inicial_calc, 2) AS peso_total_inicial,
  ROUND(peso_total_final_calc, 2) AS peso_total_final,
  CASE
    WHEN saldo_inicial_calc > 0 THEN ROUND(peso_total_inicial_calc / saldo_inicial_calc, 2)
    ELSE NULL
  END AS peso_medio_inicial,
  CASE
    WHEN saldo_final_calc > 0 THEN ROUND(peso_total_final_calc / saldo_final_calc, 2)
    ELSE NULL
  END AS peso_medio_final,
  ROUND(peso_entradas_ext, 2) AS peso_entradas_externas,
  ROUND(peso_saidas_ext, 2) AS peso_saidas_externas,
  ROUND(peso_evol_entrada, 2) AS peso_evol_cat_entrada,
  ROUND(peso_evol_saida, 2) AS peso_evol_cat_saida,
  dias_mes,
  CASE
    WHEN ((saldo_inicial_calc + saldo_final_calc) / 2.0) > 0 AND dias_mes > 0 THEN ROUND(
      (
        peso_total_final_calc
        - peso_total_inicial_calc
        - peso_entradas_ext
        + peso_saidas_ext
        - peso_evol_entrada
        + peso_evol_saida
      )
      / (((saldo_inicial_calc + saldo_final_calc) / 2.0) * dias_mes)
    , 4)
    ELSE NULL
  END AS gmd,
  ROUND(
    peso_total_final_calc
    - peso_total_inicial_calc
    - peso_entradas_ext
    + peso_saidas_ext
    - peso_evol_entrada
    + peso_evol_saida
  , 2) AS producao_biologica,
  fonte_mes AS fonte_oficial_mes
FROM chain
WHERE NOT (
  saldo_inicial_calc = 0
  AND saldo_final_calc = 0
  AND entradas_ext = 0
  AND saidas_ext = 0
  AND evol_cat_entrada = 0
  AND evol_cat_saida = 0
  AND ROUND(peso_total_inicial_calc, 2) = 0
  AND ROUND(peso_total_final_calc, 2) = 0
);

CREATE OR REPLACE VIEW public.vw_zoot_fazenda_mensal AS
WITH cat AS (
  SELECT
    fazenda_id,
    cliente_id,
    ano,
    mes,
    cenario,
    ano_mes,
    SUM(saldo_inicial)::integer AS cabecas_inicio,
    SUM(saldo_final)::integer AS cabecas_final,
    SUM(entradas_externas)::integer AS entradas,
    SUM(saidas_externas)::integer AS saidas,
    ROUND(SUM(peso_total_inicial), 2) AS peso_inicio_kg,
    ROUND(SUM(peso_total_final), 2) AS peso_total_final_kg,
    ROUND(SUM(peso_entradas_externas), 2) AS peso_entradas_kg,
    ROUND(SUM(peso_saidas_externas), 2) AS peso_saidas_kg,
    ROUND(SUM(producao_biologica), 2) AS gmd_numerador_kg,
    MAX(dias_mes) AS dias_mes,
    CASE
      WHEN bool_or(fonte_oficial_mes = 'fechamento') THEN 'fechamento'
      WHEN bool_or(fonte_oficial_mes = 'fallback_movimentacao') THEN 'fallback_movimentacao'
      ELSE 'projecao'
    END AS fonte_oficial_mes
  FROM public.vw_zoot_categoria_mensal
  GROUP BY fazenda_id, cliente_id, ano, mes, cenario, ano_mes
),
area AS (
  SELECT
    p.fazenda_id,
    SUM(CASE WHEN p.ativo AND p.entra_conciliacao THEN p.area_produtiva_ha ELSE 0 END) AS area_produtiva_ha
  FROM public.pastos p
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
  CASE
    WHEN c.cabecas_final > 0 THEN ROUND(c.peso_total_final_kg / c.cabecas_final, 2)
    ELSE NULL
  END AS peso_medio_final_kg,
  c.peso_entradas_kg,
  c.peso_saidas_kg,
  c.entradas,
  c.saidas,
  c.dias_mes,
  CASE
    WHEN c.dias_mes > 0 AND (c.cabecas_inicio + c.cabecas_final) > 0 THEN ROUND(
      c.gmd_numerador_kg / ((c.cabecas_inicio + c.cabecas_final) / 2.0) / c.dias_mes,
      4
    )
    ELSE NULL
  END AS gmd_kg_cab_dia,
  CASE
    WHEN (c.cabecas_inicio + c.cabecas_final) > 0 THEN c.gmd_numerador_kg
    ELSE NULL
  END AS gmd_numerador_kg,
  CASE
    WHEN c.cabecas_final > 0 THEN ROUND(
      ((c.cabecas_inicio + c.cabecas_final) / 2.0) * (c.peso_total_final_kg / c.cabecas_final) / 450.0,
      2
    )
    ELSE NULL
  END AS ua_media,
  COALESCE(a.area_produtiva_ha, 0) AS area_produtiva_ha,
  CASE
    WHEN COALESCE(a.area_produtiva_ha, 0) > 0 AND c.cabecas_final > 0 THEN ROUND(
      ((c.cabecas_inicio + c.cabecas_final) / 2.0) * (c.peso_total_final_kg / c.cabecas_final) / 450.0 / a.area_produtiva_ha,
      2
    )
    ELSE NULL
  END AS lotacao_ua_ha,
  c.fonte_oficial_mes
FROM cat c
LEFT JOIN area a ON a.fazenda_id = c.fazenda_id;