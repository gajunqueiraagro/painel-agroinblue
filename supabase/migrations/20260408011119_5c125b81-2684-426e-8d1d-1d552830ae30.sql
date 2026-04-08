
CREATE OR REPLACE VIEW vw_zoot_categoria_mensal AS
WITH categorias AS (
    SELECT id, codigo, nome, ordem_exibicao FROM categorias_rebanho
), saldo_ini_cat AS (
    SELECT si.fazenda_id, si.cliente_id, si.ano,
           cr.id AS categoria_id, cr.codigo AS categoria_codigo,
           cr.nome AS categoria_nome, cr.ordem_exibicao,
           sum(si.quantidade) AS cab_ini,
           sum(si.quantidade::numeric * COALESCE(si.peso_medio_kg, 0::numeric)) AS peso_ini
    FROM saldos_iniciais si
    JOIN categorias cr ON cr.codigo = si.categoria
    GROUP BY si.fazenda_id, si.cliente_id, si.ano, cr.id, cr.codigo, cr.nome, cr.ordem_exibicao
), mov_realizado AS (
    SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
           EXTRACT(year FROM l.data::date)::integer AS ano,
           EXTRACT(month FROM l.data::date)::integer AS mes,
           sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade ELSE 0 END) AS entradas_ext,
           sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade ELSE 0 END) AS saidas_ext,
           sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_entradas_ext,
           sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_saidas_ext
    FROM lancamentos l
    JOIN categorias cr ON cr.codigo = l.categoria
    WHERE l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
), reclass_saida_real AS (
    SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
           EXTRACT(year FROM l.data::date)::integer AS ano,
           EXTRACT(month FROM l.data::date)::integer AS mes,
           sum(l.quantidade) AS qtd,
           sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0::numeric)) AS peso
    FROM lancamentos l
    JOIN categorias cr ON cr.codigo = l.categoria
    WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
), reclass_entrada_real AS (
    SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
           EXTRACT(year FROM l.data::date)::integer AS ano,
           EXTRACT(month FROM l.data::date)::integer AS mes,
           sum(l.quantidade) AS qtd,
           sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0::numeric)) AS peso
    FROM lancamentos l
    JOIN categorias cr ON cr.codigo = l.categoria_destino
    WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
), mov_meta AS (
    SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
           EXTRACT(year FROM l.data::date)::integer AS ano,
           EXTRACT(month FROM l.data::date)::integer AS mes,
           sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade ELSE 0 END) AS entradas_ext,
           sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade ELSE 0 END) AS saidas_ext,
           sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_entradas_ext,
           sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_saidas_ext
    FROM lancamentos l
    JOIN categorias cr ON cr.codigo = l.categoria
    WHERE l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'meta'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
), reclass_saida_meta AS (
    SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
           EXTRACT(year FROM l.data::date)::integer AS ano,
           EXTRACT(month FROM l.data::date)::integer AS mes,
           sum(l.quantidade) AS qtd,
           sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0::numeric)) AS peso
    FROM lancamentos l
    JOIN categorias cr ON cr.codigo = l.categoria
    WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
), reclass_entrada_meta AS (
    SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
           EXTRACT(year FROM l.data::date)::integer AS ano,
           EXTRACT(month FROM l.data::date)::integer AS mes,
           sum(l.quantidade) AS qtd,
           sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0::numeric)) AS peso
    FROM lancamentos l
    JOIN categorias cr ON cr.codigo = l.categoria_destino
    WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
), mov_all AS (
    SELECT COALESCE(mr.fazenda_id, re.fazenda_id, rs.fazenda_id) AS fazenda_id,
           COALESCE(mr.cliente_id, re.cliente_id, rs.cliente_id) AS cliente_id,
           COALESCE(mr.categoria_id, re.categoria_id, rs.categoria_id) AS categoria_id,
           COALESCE(mr.ano, re.ano, rs.ano) AS ano,
           COALESCE(mr.mes, re.mes, rs.mes) AS mes,
           COALESCE(mr.entradas_ext, 0::bigint) AS entradas_ext,
           COALESCE(mr.saidas_ext, 0::bigint) AS saidas_ext,
           COALESCE(re.qtd, 0::bigint) AS evol_cat_entrada,
           COALESCE(rs.qtd, 0::bigint) AS evol_cat_saida,
           COALESCE(mr.peso_entradas_ext, 0::numeric) AS peso_entradas_ext,
           COALESCE(mr.peso_saidas_ext, 0::numeric) AS peso_saidas_ext,
           COALESCE(re.peso, 0::numeric) AS peso_evol_entrada,
           COALESCE(rs.peso, 0::numeric) AS peso_evol_saida,
           'realizado'::text AS cenario
    FROM mov_realizado mr
    FULL JOIN reclass_entrada_real re ON re.fazenda_id = mr.fazenda_id AND re.categoria_id = mr.categoria_id AND re.ano = mr.ano AND re.mes = mr.mes
    FULL JOIN reclass_saida_real rs ON rs.fazenda_id = COALESCE(mr.fazenda_id, re.fazenda_id) AND rs.categoria_id = COALESCE(mr.categoria_id, re.categoria_id) AND rs.ano = COALESCE(mr.ano, re.ano) AND rs.mes = COALESCE(mr.mes, re.mes)
    UNION ALL
    SELECT COALESCE(mm.fazenda_id, rem.fazenda_id, rsm.fazenda_id) AS fazenda_id,
           COALESCE(mm.cliente_id, rem.cliente_id, rsm.cliente_id) AS cliente_id,
           COALESCE(mm.categoria_id, rem.categoria_id, rsm.categoria_id) AS categoria_id,
           COALESCE(mm.ano, rem.ano, rsm.ano) AS ano,
           COALESCE(mm.mes, rem.mes, rsm.mes) AS mes,
           COALESCE(mm.entradas_ext, 0::bigint) AS entradas_ext,
           COALESCE(mm.saidas_ext, 0::bigint) AS saidas_ext,
           COALESCE(rem.qtd, 0::bigint) AS evol_cat_entrada,
           COALESCE(rsm.qtd, 0::bigint) AS evol_cat_saida,
           COALESCE(mm.peso_entradas_ext, 0::numeric) AS peso_entradas_ext,
           COALESCE(mm.peso_saidas_ext, 0::numeric) AS peso_saidas_ext,
           COALESCE(rem.peso, 0::numeric) AS peso_evol_entrada,
           COALESCE(rsm.peso, 0::numeric) AS peso_evol_saida,
           'meta'::text AS cenario
    FROM mov_meta mm
    FULL JOIN reclass_entrada_meta rem ON rem.fazenda_id = mm.fazenda_id AND rem.categoria_id = mm.categoria_id AND rem.ano = mm.ano AND rem.mes = mm.mes
    FULL JOIN reclass_saida_meta rsm ON rsm.fazenda_id = COALESCE(mm.fazenda_id, rem.fazenda_id) AND rsm.categoria_id = COALESCE(mm.categoria_id, rem.categoria_id) AND rsm.ano = COALESCE(mm.ano, rem.ano) AND rsm.mes = COALESCE(mm.mes, rem.mes)
), mov_cat_bases AS (
    SELECT DISTINCT fazenda_id, cliente_id, categoria_id, ano FROM mov_all
), all_cat_bases AS (
    SELECT fazenda_id, cliente_id, ano, categoria_id, categoria_codigo, categoria_nome, ordem_exibicao, cab_ini, peso_ini
    FROM saldo_ini_cat
    UNION ALL
    SELECT mc.fazenda_id, mc.cliente_id, mc.ano, mc.categoria_id, cr.codigo, cr.nome, cr.ordem_exibicao, 0::bigint, 0::numeric
    FROM mov_cat_bases mc
    JOIN categorias cr ON cr.id = mc.categoria_id
    WHERE NOT EXISTS (SELECT 1 FROM saldo_ini_cat si WHERE si.fazenda_id = mc.fazenda_id AND si.ano = mc.ano AND si.categoria_id = mc.categoria_id)
), expanded AS (
    SELECT si.fazenda_id, si.cliente_id, si.ano, g.mes, c.cenario,
           si.categoria_id, si.categoria_codigo, si.categoria_nome, si.ordem_exibicao,
           si.cab_ini, si.peso_ini,
           COALESCE(m.entradas_ext, 0::bigint) AS entradas_ext,
           COALESCE(m.saidas_ext, 0::bigint) AS saidas_ext,
           COALESCE(m.evol_cat_entrada, 0::bigint) AS evol_cat_entrada,
           COALESCE(m.evol_cat_saida, 0::bigint) AS evol_cat_saida,
           COALESCE(m.peso_entradas_ext, 0::numeric) AS peso_entradas_ext,
           COALESCE(m.peso_saidas_ext, 0::numeric) AS peso_saidas_ext,
           COALESCE(m.peso_evol_entrada, 0::numeric) AS peso_evol_entrada,
           COALESCE(m.peso_evol_saida, 0::numeric) AS peso_evol_saida
    FROM all_cat_bases si
    CROSS JOIN (VALUES ('realizado'), ('meta')) c(cenario)
    CROSS JOIN generate_series(1, 12) g(mes)
    LEFT JOIN mov_all m ON m.fazenda_id = si.fazenda_id AND m.categoria_id = si.categoria_id AND m.ano = si.ano AND m.mes = g.mes AND m.cenario = c.cenario
), running AS (
    SELECT expanded.*,
           expanded.cab_ini::numeric + COALESCE(sum(expanded.entradas_ext - expanded.saidas_ext + expanded.evol_cat_entrada - expanded.evol_cat_saida) OVER w_prev, 0::numeric) AS cab_inicio_mes,
           expanded.cab_ini::numeric + sum(expanded.entradas_ext - expanded.saidas_ext + expanded.evol_cat_entrada - expanded.evol_cat_saida) OVER w_curr AS cab_final
    FROM expanded
    WINDOW w_prev AS (PARTITION BY expanded.fazenda_id, expanded.ano, expanded.cenario, expanded.categoria_id ORDER BY expanded.mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
           w_curr AS (PARTITION BY expanded.fazenda_id, expanded.ano, expanded.cenario, expanded.categoria_id ORDER BY expanded.mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
), peso_real_cat AS (
    SELECT fp.fazenda_id, fp.ano_mes,
           EXTRACT(year FROM (fp.ano_mes || '-01')::date)::integer AS ano,
           EXTRACT(month FROM (fp.ano_mes || '-01')::date)::integer AS mes,
           fpi.categoria_id,
           sum(fpi.quantidade) AS cab_pesado,
           sum(fpi.quantidade::numeric * COALESCE(fpi.peso_medio_kg, 0::numeric)) AS peso_total_real
    FROM fechamento_pastos fp
    JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fp.id
    JOIN pastos p ON p.id = fp.pasto_id
    WHERE fp.status = 'fechado' AND p.ativo = true
    GROUP BY fp.fazenda_id, fp.ano_mes, fpi.categoria_id
), pre_final AS (
    SELECT r.fazenda_id, r.cliente_id, r.ano, r.mes, r.cenario,
           r.categoria_id, r.categoria_codigo, r.categoria_nome, r.ordem_exibicao,
           r.cab_ini, r.peso_ini,
           r.entradas_ext, r.saidas_ext, r.evol_cat_entrada, r.evol_cat_saida,
           r.peso_entradas_ext, r.peso_saidas_ext, r.peso_evol_entrada, r.peso_evol_saida,
           r.cab_inicio_mes, r.cab_final,
           -- saldo_final: real closing takes priority
           CASE
               WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::integer
               ELSE r.cab_final::integer
           END AS sf,
           -- peso_total_final: real closing takes priority
           CASE
               WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN round(pr.peso_total_real, 2)
               ELSE round(r.peso_ini + COALESCE(sum(r.peso_entradas_ext - r.peso_saidas_ext + r.peso_evol_entrada - r.peso_evol_saida) OVER (PARTITION BY r.fazenda_id, r.ano, r.cenario, r.categoria_id ORDER BY r.mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 0::numeric), 2)
           END AS ptf,
           -- fonte
           CASE
               WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL THEN 'fechamento'
               WHEN r.cenario = 'realizado' AND (r.entradas_ext > 0 OR r.saidas_ext > 0 OR r.evol_cat_entrada > 0 OR r.evol_cat_saida > 0) THEN 'fallback_movimentacao'
               ELSE 'projecao'
           END AS fonte
    FROM running r
    LEFT JOIN peso_real_cat pr ON pr.fazenda_id = r.fazenda_id AND pr.ano = r.ano AND pr.mes = r.mes AND pr.categoria_id = r.categoria_id AND r.cenario = 'realizado'
), with_lag AS (
    SELECT pf.*,
           LAG(pf.sf) OVER w_cat AS prev_sf,
           LAG(pf.ptf) OVER w_cat AS prev_ptf
    FROM pre_final pf
    WINDOW w_cat AS (PARTITION BY pf.fazenda_id, pf.ano, pf.cenario, pf.categoria_id ORDER BY pf.mes)
)
SELECT
    wl.fazenda_id,
    wl.cliente_id,
    wl.ano,
    wl.mes,
    wl.cenario,
    (wl.ano::text || '-' || lpad(wl.mes::text, 2, '0')) AS ano_mes,
    wl.categoria_id,
    wl.categoria_codigo,
    wl.categoria_nome,
    wl.ordem_exibicao,
    -- saldo_inicial: previous month's validated final, or year start
    COALESCE(wl.prev_sf, wl.cab_ini::integer) AS saldo_inicial,
    wl.entradas_ext::integer AS entradas_externas,
    wl.saidas_ext::integer AS saidas_externas,
    wl.evol_cat_entrada::integer AS evol_cat_entrada,
    wl.evol_cat_saida::integer AS evol_cat_saida,
    wl.sf AS saldo_final,
    -- peso_total_inicial: previous month's validated final, or year start
    COALESCE(wl.prev_ptf, round(wl.peso_ini, 2)) AS peso_total_inicial,
    wl.ptf AS peso_total_final,
    -- peso_medio_inicial
    CASE
        WHEN COALESCE(wl.prev_sf, wl.cab_ini::integer) > 0
        THEN round(COALESCE(wl.prev_ptf, round(wl.peso_ini, 2)) / COALESCE(wl.prev_sf, wl.cab_ini)::numeric, 2)
        ELSE NULL
    END AS peso_medio_inicial,
    -- peso_medio_final
    CASE
        WHEN wl.sf > 0 THEN round(wl.ptf / wl.sf::numeric, 2)
        ELSE NULL
    END AS peso_medio_final,
    round(wl.peso_entradas_ext, 2) AS peso_entradas_externas,
    round(wl.peso_saidas_ext, 2) AS peso_saidas_externas,
    round(wl.peso_evol_entrada, 2) AS peso_evol_cat_entrada,
    round(wl.peso_evol_saida, 2) AS peso_evol_cat_saida,
    EXTRACT(day FROM make_date(wl.ano, wl.mes, 1) + '1 mon'::interval - '1 day'::interval)::integer AS dias_mes,
    -- GMD using chained values
    CASE
        WHEN ((COALESCE(wl.prev_sf, wl.cab_ini)::numeric + wl.sf::numeric) / 2.0) > 0
             AND EXTRACT(day FROM make_date(wl.ano, wl.mes, 1) + '1 mon'::interval - '1 day'::interval) > 0
        THEN round(
            (wl.ptf - COALESCE(wl.prev_ptf, round(wl.peso_ini, 2))
             - COALESCE(wl.peso_entradas_ext, 0) + COALESCE(wl.peso_saidas_ext, 0)
             - COALESCE(wl.peso_evol_entrada, 0) + COALESCE(wl.peso_evol_saida, 0))
            / ((COALESCE(wl.prev_sf, wl.cab_ini)::numeric + wl.sf::numeric) / 2.0)
            / EXTRACT(day FROM make_date(wl.ano, wl.mes, 1) + '1 mon'::interval - '1 day'::interval), 4)
        ELSE NULL
    END AS gmd,
    -- producao_biologica using chained values
    round(
        wl.ptf - COALESCE(wl.prev_ptf, round(wl.peso_ini, 2))
        - COALESCE(wl.peso_entradas_ext, 0) + COALESCE(wl.peso_saidas_ext, 0)
        - COALESCE(wl.peso_evol_entrada, 0) + COALESCE(wl.peso_evol_saida, 0), 2) AS producao_biologica,
    wl.fonte::text AS fonte_oficial_mes
FROM with_lag wl
WHERE NOT (wl.cab_ini = 0 AND wl.cab_final = 0::numeric AND wl.entradas_ext = 0 AND wl.saidas_ext = 0 AND wl.evol_cat_entrada = 0 AND wl.evol_cat_saida = 0);
