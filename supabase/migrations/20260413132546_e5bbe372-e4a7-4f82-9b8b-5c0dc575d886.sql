
-- 1. Backfill hash_linha for META records (bypass trigger)
ALTER TABLE lancamentos DISABLE TRIGGER trg_guard_meta_admin_only;
UPDATE lancamentos
SET hash_linha = md5(
  COALESCE(data::text,'') || '|' ||
  COALESCE(tipo,'') || '|' ||
  COALESCE(categoria,'') || '|' ||
  COALESCE(quantidade::text,'') || '|' ||
  COALESCE(peso_medio_kg::text,'') || '|' ||
  COALESCE(categoria_destino,'') || '|' ||
  COALESCE(fazenda_destino::text,'') || '|' ||
  COALESCE(observacao,'')
)
WHERE hash_linha IS NULL;
ALTER TABLE lancamentos ENABLE TRIGGER trg_guard_meta_admin_only;

-- 2. Recreate vw_zoot_categoria_mensal with cross-year category propagation
CREATE OR REPLACE VIEW vw_zoot_categoria_mensal AS
WITH categorias AS (
  SELECT id, codigo, nome, ordem_exibicao FROM categorias_rebanho
),
saldo_ini_cat AS (
  SELECT si.fazenda_id, si.cliente_id, si.ano,
    cr.id AS categoria_id, cr.codigo AS categoria_codigo, cr.nome AS categoria_nome,
    cr.ordem_exibicao,
    sum(si.quantidade) AS cab_ini,
    sum(si.quantidade::numeric * COALESCE(si.peso_medio_kg, 0)) AS peso_ini
  FROM saldos_iniciais si
  JOIN categorias cr ON cr.codigo = si.categoria
  GROUP BY si.fazenda_id, si.cliente_id, si.ano, cr.id, cr.codigo, cr.nome, cr.ordem_exibicao
),
mov_realizado AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data::date)::int AS ano,
    EXTRACT(month FROM l.data::date)::int AS mes,
    sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas_ext,
    sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade ELSE 0 END) AS saidas_ext,
    sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_entradas_ext,
    sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_saidas_ext
  FROM lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::int, EXTRACT(month FROM l.data::date)::int
),
reclass_saida_real AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data::date)::int AS ano, EXTRACT(month FROM l.data::date)::int AS mes,
    sum(l.quantidade) AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::int, EXTRACT(month FROM l.data::date)::int
),
reclass_entrada_real AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data::date)::int AS ano, EXTRACT(month FROM l.data::date)::int AS mes,
    sum(l.quantidade) AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria_destino
  WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::int, EXTRACT(month FROM l.data::date)::int
),
mov_meta AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data::date)::int AS ano, EXTRACT(month FROM l.data::date)::int AS mes,
    sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas_ext,
    sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade ELSE 0 END) AS saidas_ext,
    sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_entradas_ext,
    sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_saidas_ext
  FROM lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::int, EXTRACT(month FROM l.data::date)::int
),
reclass_saida_meta AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data::date)::int AS ano, EXTRACT(month FROM l.data::date)::int AS mes,
    sum(l.quantidade) AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::int, EXTRACT(month FROM l.data::date)::int
),
reclass_entrada_meta AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data::date)::int AS ano, EXTRACT(month FROM l.data::date)::int AS mes,
    sum(l.quantidade) AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM lancamentos l
  JOIN categorias cr ON cr.codigo = l.categoria_destino
  WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::int, EXTRACT(month FROM l.data::date)::int
),
meta_gmd AS (
  SELECT mg.fazenda_id, cr.id AS categoria_id,
    EXTRACT(year FROM (mg.ano_mes || '-01')::date)::int AS ano,
    EXTRACT(month FROM (mg.ano_mes || '-01')::date)::int AS mes,
    mg.gmd_previsto
  FROM meta_gmd_mensal mg
  JOIN categorias cr ON cr.codigo = mg.categoria
),
mov_all AS (
  SELECT COALESCE(mr.fazenda_id, re.fazenda_id, rs.fazenda_id) AS fazenda_id,
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
  FULL JOIN reclass_entrada_real re ON re.fazenda_id = mr.fazenda_id AND re.categoria_id = mr.categoria_id AND re.ano = mr.ano AND re.mes = mr.mes
  FULL JOIN reclass_saida_real rs ON rs.fazenda_id = COALESCE(mr.fazenda_id, re.fazenda_id) AND rs.categoria_id = COALESCE(mr.categoria_id, re.categoria_id) AND rs.ano = COALESCE(mr.ano, re.ano) AND rs.mes = COALESCE(mr.mes, re.mes)
  UNION ALL
  SELECT COALESCE(mm.fazenda_id, rem.fazenda_id, rsm.fazenda_id),
    COALESCE(mm.cliente_id, rem.cliente_id, rsm.cliente_id),
    COALESCE(mm.categoria_id, rem.categoria_id, rsm.categoria_id),
    COALESCE(mm.ano, rem.ano, rsm.ano),
    COALESCE(mm.mes, rem.mes, rsm.mes),
    COALESCE(mm.entradas_ext, 0),
    COALESCE(mm.saidas_ext, 0),
    COALESCE(rem.qtd, 0),
    COALESCE(rsm.qtd, 0),
    COALESCE(mm.peso_entradas_ext, 0),
    COALESCE(mm.peso_saidas_ext, 0),
    COALESCE(rem.peso, 0),
    COALESCE(rsm.peso, 0),
    'meta'::text
  FROM mov_meta mm
  FULL JOIN reclass_entrada_meta rem ON rem.fazenda_id = mm.fazenda_id AND rem.categoria_id = mm.categoria_id AND rem.ano = mm.ano AND rem.mes = mm.mes
  FULL JOIN reclass_saida_meta rsm ON rsm.fazenda_id = COALESCE(mm.fazenda_id, rem.fazenda_id) AND rsm.categoria_id = COALESCE(mm.categoria_id, rem.categoria_id) AND rsm.ano = COALESCE(mm.ano, rem.ano) AND rsm.mes = COALESCE(mm.mes, rem.mes)
),
-- FIX: Propagate categories across ALL years in the fazenda's range
all_fazenda_years AS (
  SELECT fazenda_id, generate_series(min(ano), max(ano)) AS ano
  FROM (
    SELECT fazenda_id, ano FROM saldo_ini_cat
    UNION
    SELECT DISTINCT fazenda_id, ano FROM mov_all
  ) sub
  GROUP BY fazenda_id
),
all_fazenda_cats AS (
  SELECT DISTINCT fazenda_id, cliente_id, categoria_id
  FROM (
    SELECT fazenda_id, cliente_id, categoria_id FROM saldo_ini_cat
    UNION
    SELECT fazenda_id, cliente_id, categoria_id FROM mov_all
  ) sub
),
all_cat_bases AS (
  SELECT afc.fazenda_id, afc.cliente_id, afy.ano,
    afc.categoria_id, cr.codigo AS categoria_codigo, cr.nome AS categoria_nome, cr.ordem_exibicao,
    COALESCE(si.cab_ini, 0) AS cab_ini,
    COALESCE(si.peso_ini, 0) AS peso_ini
  FROM all_fazenda_cats afc
  JOIN all_fazenda_years afy ON afy.fazenda_id = afc.fazenda_id
  JOIN categorias cr ON cr.id = afc.categoria_id
  LEFT JOIN saldo_ini_cat si ON si.fazenda_id = afc.fazenda_id AND si.ano = afy.ano AND si.categoria_id = afc.categoria_id
),
expanded AS (
  SELECT si.fazenda_id, si.cliente_id, si.ano, g.mes, c.cenario,
    si.categoria_id, si.categoria_codigo, si.categoria_nome, si.ordem_exibicao,
    si.cab_ini, si.peso_ini,
    COALESCE(m.entradas_ext, 0) AS entradas_ext,
    COALESCE(m.saidas_ext, 0) AS saidas_ext,
    COALESCE(m.evol_cat_entrada, 0) AS evol_cat_entrada,
    COALESCE(m.evol_cat_saida, 0) AS evol_cat_saida,
    COALESCE(m.peso_entradas_ext, 0) AS peso_entradas_ext,
    COALESCE(m.peso_saidas_ext, 0) AS peso_saidas_ext,
    COALESCE(m.peso_evol_entrada, 0) AS peso_evol_entrada,
    COALESCE(m.peso_evol_saida, 0) AS peso_evol_saida
  FROM all_cat_bases si
  CROSS JOIN (VALUES ('realizado'), ('meta')) c(cenario)
  CROSS JOIN generate_series(1, 12) g(mes)
  LEFT JOIN mov_all m ON m.fazenda_id = si.fazenda_id AND m.categoria_id = si.categoria_id AND m.ano = si.ano AND m.mes = g.mes AND m.cenario = c.cenario
),
running AS (
  SELECT fazenda_id, cliente_id, ano, mes, cenario,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    cab_ini, peso_ini, entradas_ext, saidas_ext, evol_cat_entrada, evol_cat_saida,
    peso_entradas_ext, peso_saidas_ext, peso_evol_entrada, peso_evol_saida,
    cab_ini::numeric + COALESCE(sum(entradas_ext - saidas_ext + evol_cat_entrada - evol_cat_saida) OVER w_prev, 0) AS cab_inicio_mes,
    cab_ini::numeric + sum(entradas_ext - saidas_ext + evol_cat_entrada - evol_cat_saida) OVER w_curr AS cab_final,
    peso_ini + COALESCE(sum(peso_entradas_ext - peso_saidas_ext + peso_evol_entrada - peso_evol_saida) OVER w_prev, 0) AS peso_contabil_inicio_mes
  FROM expanded
  WINDOW
    w_prev AS (PARTITION BY fazenda_id, ano, cenario, categoria_id ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
    w_curr AS (PARTITION BY fazenda_id, ano, cenario, categoria_id ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
),
fechamento_dedup AS (
  SELECT DISTINCT ON (fp.pasto_id, fp.ano_mes)
    fp.id, fp.fazenda_id, fp.ano_mes, fp.pasto_id
  FROM fechamento_pastos fp
  JOIN pastos p ON p.id = fp.pasto_id
  WHERE p.ativo = true AND p.entra_conciliacao = true
  ORDER BY fp.pasto_id, fp.ano_mes, fp.created_at
),
peso_real_cat AS (
  SELECT fd.fazenda_id, fd.ano_mes,
    EXTRACT(year FROM (fd.ano_mes || '-01')::date)::int AS ano,
    EXTRACT(month FROM (fd.ano_mes || '-01')::date)::int AS mes,
    fpi.categoria_id,
    sum(fpi.quantidade) AS cab_pesado,
    sum(fpi.quantidade::numeric * COALESCE(fpi.peso_medio_kg, 0)) AS peso_total_real
  FROM fechamento_dedup fd
  JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fd.id
  GROUP BY fd.fazenda_id, fd.ano_mes, fpi.categoria_id
),
pre_final AS (
  SELECT r.fazenda_id, r.cliente_id, r.ano, r.mes, r.cenario,
    r.categoria_id, r.categoria_codigo, r.categoria_nome, r.ordem_exibicao,
    r.cab_ini, r.peso_ini, r.entradas_ext, r.saidas_ext,
    r.evol_cat_entrada, r.evol_cat_saida,
    r.peso_entradas_ext, r.peso_saidas_ext, r.peso_evol_entrada, r.peso_evol_saida,
    r.cab_inicio_mes, r.cab_final, r.peso_contabil_inicio_mes,
    CASE
      WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::int
      ELSE r.cab_final::int
    END AS sf,
    CASE
      WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN round(pr.peso_total_real, 2)
      ELSE round(
        r.peso_ini
        + COALESCE(sum(r.peso_entradas_ext - r.peso_saidas_ext + r.peso_evol_entrada - r.peso_evol_saida)
          OVER (PARTITION BY r.fazenda_id, r.ano, r.cenario, r.categoria_id ORDER BY r.mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 0)
        + COALESCE(sum(
            COALESCE(mg.gmd_previsto, 0) * ((r.cab_inicio_mes + r.cab_final) / 2.0)
            * EXTRACT(day FROM make_date(r.ano, r.mes, 1) + interval '1 month' - interval '1 day')
          ) OVER (PARTITION BY r.fazenda_id, r.ano, r.cenario, r.categoria_id ORDER BY r.mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 0)
      , 2)
    END AS ptf,
    CASE
      WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL THEN 'fechamento'
      WHEN r.cenario = 'realizado' AND (r.entradas_ext > 0 OR r.saidas_ext > 0 OR r.evol_cat_entrada > 0 OR r.evol_cat_saida > 0) THEN 'fallback_movimentacao'
      ELSE 'projecao'
    END AS fonte
  FROM running r
  LEFT JOIN peso_real_cat pr ON pr.fazenda_id = r.fazenda_id AND pr.ano = r.ano AND pr.mes = r.mes AND pr.categoria_id = r.categoria_id AND r.cenario = 'realizado'
  LEFT JOIN meta_gmd mg ON mg.fazenda_id = r.fazenda_id AND mg.categoria_id = r.categoria_id AND mg.ano = r.ano AND mg.mes = r.mes AND r.cenario = 'meta'
),
with_lag AS (
  SELECT *,
    lag(sf) OVER w_cat AS prev_sf,
    lag(ptf) OVER w_cat AS prev_ptf,
    lag(fonte) OVER w_cat AS prev_fonte,
    lag(ano) OVER w_cat AS prev_ano
  FROM pre_final
  WINDOW w_cat AS (PARTITION BY fazenda_id, cenario, categoria_id ORDER BY ano, mes)
)
SELECT fazenda_id, cliente_id, ano, mes, cenario,
  (ano::text || '-' || lpad(mes::text, 2, '0')) AS ano_mes,
  categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
  CASE
    WHEN prev_sf IS NOT NULL AND prev_ano IS NOT NULL AND prev_ano < ano THEN prev_sf
    WHEN prev_sf IS NOT NULL AND prev_fonte = 'fechamento' THEN prev_sf
    WHEN prev_sf IS NOT NULL THEN cab_inicio_mes::int
    ELSE cab_ini::int
  END AS saldo_inicial,
  entradas_ext::int AS entradas_externas,
  saidas_ext::int AS saidas_externas,
  evol_cat_entrada::int AS evol_cat_entrada,
  evol_cat_saida::int AS evol_cat_saida,
  sf AS saldo_final,
  CASE
    WHEN prev_ptf IS NOT NULL AND prev_ano IS NOT NULL AND prev_ano < ano THEN prev_ptf
    WHEN prev_ptf IS NOT NULL AND prev_fonte = 'fechamento' THEN prev_ptf
    WHEN prev_ptf IS NOT NULL AND cenario = 'meta' THEN COALESCE(prev_ptf, round(peso_contabil_inicio_mes, 2))
    WHEN prev_ptf IS NOT NULL THEN round(peso_contabil_inicio_mes, 2)
    ELSE round(peso_ini, 2)
  END AS peso_total_inicial,
  ptf AS peso_total_final,
  CASE
    WHEN (CASE WHEN prev_sf IS NOT NULL AND prev_ano IS NOT NULL AND prev_ano < ano THEN prev_sf WHEN prev_sf IS NOT NULL AND prev_fonte = 'fechamento' THEN prev_sf WHEN prev_sf IS NOT NULL THEN cab_inicio_mes::int ELSE cab_ini::int END) > 0
    THEN round(
      (CASE WHEN prev_ptf IS NOT NULL AND prev_ano IS NOT NULL AND prev_ano < ano THEN prev_ptf WHEN prev_ptf IS NOT NULL AND prev_fonte = 'fechamento' THEN prev_ptf WHEN prev_ptf IS NOT NULL AND cenario = 'meta' THEN COALESCE(prev_ptf, round(peso_contabil_inicio_mes, 2)) WHEN prev_ptf IS NOT NULL THEN round(peso_contabil_inicio_mes, 2) ELSE round(peso_ini, 2) END)
      / (CASE WHEN prev_sf IS NOT NULL AND prev_ano IS NOT NULL AND prev_ano < ano THEN prev_sf::numeric WHEN prev_sf IS NOT NULL AND prev_fonte = 'fechamento' THEN prev_sf::numeric WHEN prev_sf IS NOT NULL THEN cab_inicio_mes ELSE cab_ini::numeric END)
    , 2)
    ELSE NULL
  END AS peso_medio_inicial,
  CASE WHEN sf > 0 THEN round(ptf / sf::numeric, 2) ELSE NULL END AS peso_medio_final,
  round(peso_entradas_ext, 2) AS peso_entradas_externas,
  round(peso_saidas_ext, 2) AS peso_saidas_externas,
  round(peso_evol_entrada, 2) AS peso_evol_cat_entrada,
  round(peso_evol_saida, 2) AS peso_evol_cat_saida,
  EXTRACT(day FROM make_date(ano, mes, 1) + interval '1 month' - interval '1 day')::int AS dias_mes,
  CASE
    WHEN (((CASE WHEN prev_sf IS NOT NULL AND prev_ano IS NOT NULL AND prev_ano < ano THEN prev_sf::numeric WHEN prev_sf IS NOT NULL AND prev_fonte = 'fechamento' THEN prev_sf::numeric WHEN prev_sf IS NOT NULL THEN cab_inicio_mes ELSE cab_ini::numeric END) + sf::numeric) / 2.0) > 0
     AND EXTRACT(day FROM make_date(ano, mes, 1) + interval '1 month' - interval '1 day') > 0
    THEN round(
      (ptf
       - (CASE WHEN prev_ptf IS NOT NULL AND prev_ano IS NOT NULL AND prev_ano < ano THEN prev_ptf WHEN prev_ptf IS NOT NULL AND prev_fonte = 'fechamento' THEN prev_ptf WHEN prev_ptf IS NOT NULL AND cenario = 'meta' THEN COALESCE(prev_ptf, round(peso_contabil_inicio_mes, 2)) WHEN prev_ptf IS NOT NULL THEN round(peso_contabil_inicio_mes, 2) ELSE round(peso_ini, 2) END)
       - COALESCE(peso_entradas_ext, 0) + COALESCE(peso_saidas_ext, 0)
       - COALESCE(peso_evol_entrada, 0) + COALESCE(peso_evol_saida, 0)
      )
      / (((CASE WHEN prev_sf IS NOT NULL AND prev_ano IS NOT NULL AND prev_ano < ano THEN prev_sf::numeric WHEN prev_sf IS NOT NULL AND prev_fonte = 'fechamento' THEN prev_sf::numeric WHEN prev_sf IS NOT NULL THEN cab_inicio_mes ELSE cab_ini::numeric END) + sf::numeric) / 2.0)
      / EXTRACT(day FROM make_date(ano, mes, 1) + interval '1 month' - interval '1 day')
    , 4)
    ELSE NULL
  END AS gmd,
  round(
    ptf
    - (CASE WHEN prev_ptf IS NOT NULL AND prev_ano IS NOT NULL AND prev_ano < ano THEN prev_ptf WHEN prev_ptf IS NOT NULL AND prev_fonte = 'fechamento' THEN prev_ptf WHEN prev_ptf IS NOT NULL AND cenario = 'meta' THEN COALESCE(prev_ptf, round(peso_contabil_inicio_mes, 2)) WHEN prev_ptf IS NOT NULL THEN round(peso_contabil_inicio_mes, 2) ELSE round(peso_ini, 2) END)
    - COALESCE(peso_entradas_ext, 0) + COALESCE(peso_saidas_ext, 0)
    - COALESCE(peso_evol_entrada, 0) + COALESCE(peso_evol_saida, 0)
  , 2) AS producao_biologica,
  fonte AS fonte_oficial_mes
FROM with_lag
WHERE NOT (cab_ini = 0 AND cab_final = 0 AND entradas_ext = 0 AND saidas_ext = 0 AND evol_cat_entrada = 0 AND evol_cat_saida = 0);
