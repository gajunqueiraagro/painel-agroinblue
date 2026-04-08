
-- ============================================================
-- FIX: vw_zoot_categoria_mensal — peso_real_cat CTE
-- Uses first fechamento per pasto (created_at ASC), no status filter
-- ============================================================
CREATE OR REPLACE VIEW vw_zoot_categoria_mensal AS
WITH categorias AS (
    SELECT id, codigo, nome, ordem_exibicao FROM categorias_rebanho
),
saldo_ini_cat AS (
    SELECT si.fazenda_id, si.cliente_id, si.ano,
        cr.id AS categoria_id, cr.codigo AS categoria_codigo,
        cr.nome AS categoria_nome, cr.ordem_exibicao,
        sum(si.quantidade) AS cab_ini,
        sum(si.quantidade::numeric * COALESCE(si.peso_medio_kg, 0::numeric)) AS peso_ini
    FROM saldos_iniciais si
    JOIN categorias cr ON cr.codigo = si.categoria
    GROUP BY si.fazenda_id, si.cliente_id, si.ano, cr.id, cr.codigo, cr.nome, cr.ordem_exibicao
),
mov_realizado AS (
    SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas_ext,
        sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade ELSE 0 END) AS saidas_ext,
        sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_entradas_ext,
        sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_saidas_ext
    FROM lancamentos l
    JOIN categorias cr ON cr.codigo = l.categoria
    WHERE l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
),
reclass_saida_real AS (
    SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(l.quantidade) AS qtd,
        sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0::numeric)) AS peso
    FROM lancamentos l
    JOIN categorias cr ON cr.codigo = l.categoria
    WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
),
reclass_entrada_real AS (
    SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(l.quantidade) AS qtd,
        sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0::numeric)) AS peso
    FROM lancamentos l
    JOIN categorias cr ON cr.codigo = l.categoria_destino
    WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
),
mov_meta AS (
    SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas_ext,
        sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade ELSE 0 END) AS saidas_ext,
        sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_entradas_ext,
        sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_saidas_ext
    FROM lancamentos l
    JOIN categorias cr ON cr.codigo = l.categoria
    WHERE l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'meta'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
),
reclass_saida_meta AS (
    SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(l.quantidade) AS qtd,
        sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0::numeric)) AS peso
    FROM lancamentos l
    JOIN categorias cr ON cr.codigo = l.categoria
    WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
),
reclass_entrada_meta AS (
    SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(l.quantidade) AS qtd,
        sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0::numeric)) AS peso
    FROM lancamentos l
    JOIN categorias cr ON cr.codigo = l.categoria_destino
    WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
),
mov_all AS (
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
    SELECT COALESCE(mm.fazenda_id, rem.fazenda_id, rsm.fazenda_id),
        COALESCE(mm.cliente_id, rem.cliente_id, rsm.cliente_id),
        COALESCE(mm.categoria_id, rem.categoria_id, rsm.categoria_id),
        COALESCE(mm.ano, rem.ano, rsm.ano),
        COALESCE(mm.mes, rem.mes, rsm.mes),
        COALESCE(mm.entradas_ext, 0::bigint),
        COALESCE(mm.saidas_ext, 0::bigint),
        COALESCE(rem.qtd, 0::bigint),
        COALESCE(rsm.qtd, 0::bigint),
        COALESCE(mm.peso_entradas_ext, 0::numeric),
        COALESCE(mm.peso_saidas_ext, 0::numeric),
        COALESCE(rem.peso, 0::numeric),
        COALESCE(rsm.peso, 0::numeric),
        'meta'::text
    FROM mov_meta mm
    FULL JOIN reclass_entrada_meta rem ON rem.fazenda_id = mm.fazenda_id AND rem.categoria_id = mm.categoria_id AND rem.ano = mm.ano AND rem.mes = mm.mes
    FULL JOIN reclass_saida_meta rsm ON rsm.fazenda_id = COALESCE(mm.fazenda_id, rem.fazenda_id) AND rsm.categoria_id = COALESCE(mm.categoria_id, rem.categoria_id) AND rsm.ano = COALESCE(mm.ano, rem.ano) AND rsm.mes = COALESCE(mm.mes, rem.mes)
),
mov_cat_bases AS (
    SELECT DISTINCT fazenda_id, cliente_id, categoria_id, ano FROM mov_all
),
all_cat_bases AS (
    SELECT fazenda_id, cliente_id, ano, categoria_id, categoria_codigo, categoria_nome, ordem_exibicao, cab_ini, peso_ini
    FROM saldo_ini_cat
    UNION ALL
    SELECT mc.fazenda_id, mc.cliente_id, mc.ano, mc.categoria_id, cr.codigo, cr.nome, cr.ordem_exibicao, 0::bigint, 0::numeric
    FROM mov_cat_bases mc
    JOIN categorias cr ON cr.id = mc.categoria_id
    WHERE NOT EXISTS (SELECT 1 FROM saldo_ini_cat si WHERE si.fazenda_id = mc.fazenda_id AND si.ano = mc.ano AND si.categoria_id = mc.categoria_id)
),
expanded AS (
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
),
running AS (
    SELECT *,
        cab_ini::numeric + COALESCE(sum(entradas_ext - saidas_ext + evol_cat_entrada - evol_cat_saida) OVER w_prev, 0::numeric) AS cab_inicio_mes,
        cab_ini::numeric + sum(entradas_ext - saidas_ext + evol_cat_entrada - evol_cat_saida) OVER w_curr AS cab_final,
        peso_ini + COALESCE(sum(peso_entradas_ext - peso_saidas_ext + peso_evol_entrada - peso_evol_saida) OVER w_prev, 0::numeric) AS peso_contabil_inicio_mes
    FROM expanded
    WINDOW w_prev AS (PARTITION BY fazenda_id, ano, cenario, categoria_id ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
           w_curr AS (PARTITION BY fazenda_id, ano, cenario, categoria_id ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
),
-- ============================================================
-- FIX: Use DISTINCT ON to get first fechamento per pasto/month
-- Remove status='fechado' filter, add entra_conciliacao=true
-- ============================================================
fechamento_dedup AS (
    SELECT DISTINCT ON (fp.pasto_id, fp.ano_mes)
        fp.id, fp.fazenda_id, fp.ano_mes, fp.pasto_id
    FROM fechamento_pastos fp
    JOIN pastos p ON p.id = fp.pasto_id
    WHERE p.ativo = true AND p.entra_conciliacao = true
    ORDER BY fp.pasto_id, fp.ano_mes, fp.created_at ASC
),
peso_real_cat AS (
    SELECT fd.fazenda_id, fd.ano_mes,
        EXTRACT(year FROM (fd.ano_mes || '-01')::date)::integer AS ano,
        EXTRACT(month FROM (fd.ano_mes || '-01')::date)::integer AS mes,
        fpi.categoria_id,
        sum(fpi.quantidade) AS cab_pesado,
        sum(fpi.quantidade::numeric * COALESCE(fpi.peso_medio_kg, 0::numeric)) AS peso_total_real
    FROM fechamento_dedup fd
    JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fd.id
    GROUP BY fd.fazenda_id, fd.ano_mes, fpi.categoria_id
),
pre_final AS (
    SELECT r.fazenda_id, r.cliente_id, r.ano, r.mes, r.cenario,
        r.categoria_id, r.categoria_codigo, r.categoria_nome, r.ordem_exibicao,
        r.cab_ini, r.peso_ini,
        r.entradas_ext, r.saidas_ext, r.evol_cat_entrada, r.evol_cat_saida,
        r.peso_entradas_ext, r.peso_saidas_ext, r.peso_evol_entrada, r.peso_evol_saida,
        r.cab_inicio_mes, r.cab_final, r.peso_contabil_inicio_mes,
        CASE
            WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::integer
            ELSE r.cab_final::integer
        END AS sf,
        CASE
            WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN round(pr.peso_total_real, 2)
            ELSE round(r.peso_ini + COALESCE(sum(r.peso_entradas_ext - r.peso_saidas_ext + r.peso_evol_entrada - r.peso_evol_saida) OVER (PARTITION BY r.fazenda_id, r.ano, r.cenario, r.categoria_id ORDER BY r.mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 0::numeric), 2)
        END AS ptf,
        CASE
            WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL THEN 'fechamento'
            WHEN r.cenario = 'realizado' AND (r.entradas_ext > 0 OR r.saidas_ext > 0 OR r.evol_cat_entrada > 0 OR r.evol_cat_saida > 0) THEN 'fallback_movimentacao'
            ELSE 'projecao'
        END AS fonte
    FROM running r
    LEFT JOIN peso_real_cat pr ON pr.fazenda_id = r.fazenda_id AND pr.ano = r.ano AND pr.mes = r.mes AND pr.categoria_id = r.categoria_id AND r.cenario = 'realizado'
),
with_lag AS (
    SELECT *,
        lag(sf) OVER w_cat AS prev_sf,
        lag(ptf) OVER w_cat AS prev_ptf,
        lag(fonte) OVER w_cat AS prev_fonte
    FROM pre_final
    WINDOW w_cat AS (PARTITION BY fazenda_id, ano, cenario, categoria_id ORDER BY mes)
)
SELECT fazenda_id, cliente_id, ano, mes, cenario,
    (ano::text || '-') || lpad(mes::text, 2, '0') AS ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    CASE
        WHEN mes = 1 THEN cab_ini::integer
        WHEN prev_fonte = 'fechamento' THEN prev_sf
        ELSE cab_inicio_mes::integer
    END AS saldo_inicial,
    entradas_ext::integer AS entradas_externas,
    saidas_ext::integer AS saidas_externas,
    evol_cat_entrada::integer AS evol_cat_entrada,
    evol_cat_saida::integer AS evol_cat_saida,
    sf AS saldo_final,
    CASE
        WHEN mes = 1 THEN round(peso_ini, 2)
        WHEN prev_fonte = 'fechamento' THEN prev_ptf
        ELSE round(peso_contabil_inicio_mes, 2)
    END AS peso_total_inicial,
    ptf AS peso_total_final,
    CASE
        WHEN CASE WHEN mes = 1 THEN cab_ini::integer WHEN prev_fonte = 'fechamento' THEN prev_sf ELSE cab_inicio_mes::integer END > 0
        THEN round(
            CASE WHEN mes = 1 THEN round(peso_ini, 2) WHEN prev_fonte = 'fechamento' THEN prev_ptf ELSE round(peso_contabil_inicio_mes, 2) END /
            CASE WHEN mes = 1 THEN cab_ini::numeric WHEN prev_fonte = 'fechamento' THEN prev_sf::numeric ELSE cab_inicio_mes END, 2)
        ELSE NULL::numeric
    END AS peso_medio_inicial,
    CASE WHEN sf > 0 THEN round(ptf / sf::numeric, 2) ELSE NULL::numeric END AS peso_medio_final,
    round(peso_entradas_ext, 2) AS peso_entradas_externas,
    round(peso_saidas_ext, 2) AS peso_saidas_externas,
    round(peso_evol_entrada, 2) AS peso_evol_cat_entrada,
    round(peso_evol_saida, 2) AS peso_evol_cat_saida,
    EXTRACT(day FROM make_date(ano, mes, 1) + '1 mon'::interval - '1 day'::interval)::integer AS dias_mes,
    CASE
        WHEN ((CASE WHEN mes = 1 THEN cab_ini::numeric WHEN prev_fonte = 'fechamento' THEN prev_sf::numeric ELSE cab_inicio_mes END + sf::numeric) / 2.0) > 0::numeric
        AND EXTRACT(day FROM make_date(ano, mes, 1) + '1 mon'::interval - '1 day'::interval) > 0::numeric
        THEN round(
            (ptf - CASE WHEN mes = 1 THEN round(peso_ini, 2) WHEN prev_fonte = 'fechamento' THEN prev_ptf ELSE round(peso_contabil_inicio_mes, 2) END
             - COALESCE(peso_entradas_ext, 0::numeric) + COALESCE(peso_saidas_ext, 0::numeric)
             - COALESCE(peso_evol_entrada, 0::numeric) + COALESCE(peso_evol_saida, 0::numeric))
            / ((CASE WHEN mes = 1 THEN cab_ini::numeric WHEN prev_fonte = 'fechamento' THEN prev_sf::numeric ELSE cab_inicio_mes END + sf::numeric) / 2.0)
            / EXTRACT(day FROM make_date(ano, mes, 1) + '1 mon'::interval - '1 day'::interval), 4)
        ELSE NULL::numeric
    END AS gmd,
    round(ptf - CASE WHEN mes = 1 THEN round(peso_ini, 2) WHEN prev_fonte = 'fechamento' THEN prev_ptf ELSE round(peso_contabil_inicio_mes, 2) END
         - COALESCE(peso_entradas_ext, 0::numeric) + COALESCE(peso_saidas_ext, 0::numeric)
         - COALESCE(peso_evol_entrada, 0::numeric) + COALESCE(peso_evol_saida, 0::numeric), 2) AS producao_biologica,
    fonte AS fonte_oficial_mes
FROM with_lag wl
WHERE NOT (cab_ini = 0 AND cab_final = 0::numeric AND entradas_ext = 0 AND saidas_ext = 0 AND evol_cat_entrada = 0 AND evol_cat_saida = 0);


-- ============================================================
-- FIX: vw_zoot_fazenda_mensal — pesagem_real CTE
-- Same DISTINCT ON deduplication fix
-- ============================================================
CREATE OR REPLACE VIEW vw_zoot_fazenda_mensal AS
WITH saldo_ini AS (
    SELECT s.fazenda_id, s.cliente_id, s.ano,
        sum(s.quantidade) AS cab_ini,
        sum(s.quantidade::numeric * COALESCE(s.peso_medio_kg, 0::numeric)) AS peso_ini
    FROM saldos_iniciais s
    GROUP BY s.fazenda_id, s.cliente_id, s.ano
),
mov_realizado AS (
    SELECT l.fazenda_id, l.cliente_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas,
        sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade ELSE 0 END) AS saidas,
        sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_entradas,
        sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_saidas
    FROM lancamentos l
    WHERE l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
    GROUP BY l.fazenda_id, l.cliente_id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
),
mov_meta AS (
    SELECT l.fazenda_id, l.cliente_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas,
        sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade ELSE 0 END) AS saidas,
        sum(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_entradas,
        sum(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_saidas
    FROM lancamentos l
    WHERE l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'meta'
    GROUP BY l.fazenda_id, l.cliente_id, EXTRACT(year FROM l.data::date)::integer, EXTRACT(month FROM l.data::date)::integer
),
mov_all AS (
    SELECT fazenda_id, cliente_id, ano, mes, entradas, saidas, peso_entradas, peso_saidas, 'realizado'::text AS cenario FROM mov_realizado
    UNION ALL
    SELECT fazenda_id, cliente_id, ano, mes, entradas, saidas, peso_entradas, peso_saidas, 'meta'::text FROM mov_meta
),
meses AS (SELECT generate_series(1, 12) AS mes),
fazenda_cenario AS (
    SELECT DISTINCT fc_sub.fazenda_id, fc_sub.cliente_id, fc_sub.ano, fc_sub.cenario
    FROM (
        SELECT fazenda_id, cliente_id, ano, 'realizado'::text AS cenario FROM saldo_ini
        UNION
        SELECT fazenda_id, cliente_id, ano, cenario FROM mov_all
    ) fc_sub
),
grid AS (
    SELECT fc.fazenda_id, fc.cliente_id, fc.ano, m.mes, fc.cenario
    FROM fazenda_cenario fc
    CROSS JOIN meses m
),
rolling AS (
    SELECT g.fazenda_id, g.cliente_id, g.ano, g.mes, g.cenario,
        COALESCE(si.cab_ini, 0::bigint)::numeric + COALESCE(sum(COALESCE(mv.entradas, 0::bigint) - COALESCE(mv.saidas, 0::bigint)) OVER (PARTITION BY g.fazenda_id, g.cliente_id, g.ano, g.cenario ORDER BY g.mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0::numeric) AS cab_inicio_mes,
        COALESCE(si.cab_ini, 0::bigint)::numeric + sum(COALESCE(mv.entradas, 0::bigint) - COALESCE(mv.saidas, 0::bigint)) OVER (PARTITION BY g.fazenda_id, g.cliente_id, g.ano, g.cenario ORDER BY g.mes ROWS UNBOUNDED PRECEDING) AS cab_final,
        COALESCE(si.peso_ini, 0::numeric) + sum(COALESCE(mv.peso_entradas, 0::numeric) - COALESCE(mv.peso_saidas, 0::numeric)) OVER (PARTITION BY g.fazenda_id, g.cliente_id, g.ano, g.cenario ORDER BY g.mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS peso_inicio_contabil,
        COALESCE(si.peso_ini, 0::numeric) + sum(COALESCE(mv.peso_entradas, 0::numeric) - COALESCE(mv.peso_saidas, 0::numeric)) OVER (PARTITION BY g.fazenda_id, g.cliente_id, g.ano, g.cenario ORDER BY g.mes ROWS UNBOUNDED PRECEDING) AS peso_final_contabil,
        COALESCE(mv.entradas, 0::bigint) AS entradas,
        COALESCE(mv.saidas, 0::bigint) AS saidas,
        COALESCE(mv.peso_entradas, 0::numeric) AS peso_entradas,
        COALESCE(mv.peso_saidas, 0::numeric) AS peso_saidas,
        date_part('day', make_date(g.ano, g.mes, 1) + '1 mon'::interval - '1 day'::interval)::integer AS dias_mes
    FROM grid g
    LEFT JOIN saldo_ini si ON si.fazenda_id = g.fazenda_id AND si.ano = g.ano
    LEFT JOIN mov_all mv ON mv.fazenda_id = g.fazenda_id AND mv.ano = g.ano AND mv.mes = g.mes AND mv.cenario = g.cenario
),
-- ============================================================
-- FIX: Same DISTINCT ON deduplication for fazenda view
-- ============================================================
fechamento_dedup AS (
    SELECT DISTINCT ON (fp.pasto_id, fp.ano_mes)
        fp.id, fp.fazenda_id, fp.ano_mes, fp.pasto_id
    FROM fechamento_pastos fp
    JOIN pastos p ON p.id = fp.pasto_id
    WHERE p.ativo = true AND p.entra_conciliacao = true
    ORDER BY fp.pasto_id, fp.ano_mes, fp.created_at ASC
),
pesagem_real AS (
    SELECT fd.fazenda_id,
        EXTRACT(year FROM (fd.ano_mes || '-01')::date)::integer AS ano,
        EXTRACT(month FROM (fd.ano_mes || '-01')::date)::integer AS mes,
        sum(fpi.quantidade) AS cab_pesado,
        sum(fpi.quantidade::numeric * COALESCE(fpi.peso_medio_kg, 0::numeric)) AS peso_total_real
    FROM fechamento_dedup fd
    JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fd.id
    GROUP BY fd.fazenda_id, EXTRACT(year FROM (fd.ano_mes || '-01')::date)::integer, EXTRACT(month FROM (fd.ano_mes || '-01')::date)::integer
),
area AS (
    SELECT p2.fazenda_id,
        sum(CASE WHEN p2.ativo AND p2.entra_conciliacao THEN p2.area_produtiva_ha ELSE 0::numeric END) AS area_produtiva_ha
    FROM pastos p2
    GROUP BY p2.fazenda_id
)
SELECT r.fazenda_id, r.cliente_id, r.ano, r.mes, r.cenario,
    lpad(r.mes::text, 2, '0') AS mes_key,
    (r.ano::text || '-') || lpad(r.mes::text, 2, '0') AS ano_mes,
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
        WHEN r.cab_final > 0::numeric THEN round(r.peso_final_contabil / r.cab_final, 2)
        ELSE NULL::numeric
    END AS peso_medio_final_kg,
    round(r.peso_entradas, 2) AS peso_entradas_kg,
    round(r.peso_saidas, 2) AS peso_saidas_kg,
    r.entradas::integer AS entradas,
    r.saidas::integer AS saidas,
    r.dias_mes,
    CASE
        WHEN r.dias_mes > 0 AND COALESCE(
            CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END, 0::numeric) > 0::numeric
        THEN round(
            (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END
             - r.peso_inicio_contabil - r.peso_entradas + r.peso_saidas)
            / ((COALESCE(r.cab_inicio_mes, 0::numeric) + COALESCE(
                CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END, 0::numeric)) / 2.0)
            / r.dias_mes::numeric, 4)
        ELSE NULL::numeric
    END AS gmd_kg_cab_dia,
    CASE
        WHEN COALESCE(
            CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END, 0::numeric) > 0::numeric
        THEN round(
            CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END
            - r.peso_inicio_contabil - r.peso_entradas + r.peso_saidas, 2)
        ELSE NULL::numeric
    END AS gmd_numerador_kg,
    CASE
        WHEN COALESCE(
            CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END, 0::numeric) > 0::numeric
        THEN round(
            (COALESCE(r.cab_inicio_mes, 0::numeric) + COALESCE(
                CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END, 0::numeric)) / 2.0
            * (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END
               / CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END)
            / 450.0, 2)
        ELSE NULL::numeric
    END AS ua_media,
    COALESCE(a.area_produtiva_ha, 0::numeric) AS area_produtiva_ha,
    CASE
        WHEN COALESCE(a.area_produtiva_ha, 0::numeric) > 0::numeric AND COALESCE(
            CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END, 0::numeric) > 0::numeric
        THEN round(
            (COALESCE(r.cab_inicio_mes, 0::numeric) + COALESCE(
                CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END, 0::numeric)) / 2.0
            * (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END
               / CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END)
            / 450.0 / a.area_produtiva_ha, 2)
        ELSE NULL::numeric
    END AS lotacao_ua_ha,
    CASE
        WHEN pr.cab_pesado IS NOT NULL AND r.cenario = 'realizado' THEN 'fechamento'
        WHEN r.cenario = 'realizado' THEN 'fallback_movimentacao'
        ELSE 'projecao'
    END AS fonte_oficial_mes
FROM rolling r
LEFT JOIN pesagem_real pr ON pr.fazenda_id = r.fazenda_id AND pr.ano = r.ano AND pr.mes = r.mes AND r.cenario = 'realizado'
LEFT JOIN area a ON a.fazenda_id = r.fazenda_id;
