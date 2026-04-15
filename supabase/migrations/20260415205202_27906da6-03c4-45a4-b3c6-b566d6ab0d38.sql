
CREATE OR REPLACE VIEW vw_zoot_categoria_mensal AS
WITH RECURSIVE categorias AS (
    SELECT categorias_rebanho.id,
        categorias_rebanho.codigo,
        categorias_rebanho.nome,
        categorias_rebanho.ordem_exibicao
    FROM categorias_rebanho
), saldo_ini_cat AS (
    SELECT si.fazenda_id,
        si.cliente_id,
        si.ano,
        cr.id AS categoria_id,
        cr.codigo AS categoria_codigo,
        cr.nome AS categoria_nome,
        cr.ordem_exibicao,
        sum(si.quantidade)::numeric AS cab_ini,
        sum(si.quantidade::numeric * COALESCE(si.peso_medio_kg, 0::numeric)) AS peso_ini
    FROM saldos_iniciais si
        JOIN categorias cr ON cr.codigo = si.categoria
    GROUP BY si.fazenda_id, si.cliente_id, si.ano, cr.id, cr.codigo, cr.nome, cr.ordem_exibicao
), mov_realizado AS (
    SELECT l.fazenda_id,
        l.cliente_id,
        cr.id AS categoria_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(CASE WHEN l.tipo = ANY (ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade ELSE 0 END)::numeric AS entradas_ext,
        sum(CASE WHEN l.tipo = ANY (ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade ELSE 0 END)::numeric AS saidas_ext,
        sum(CASE WHEN l.tipo = ANY (ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_entradas_ext,
        sum(CASE WHEN l.tipo = ANY (ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_saidas_ext
    FROM lancamentos l
        JOIN categorias cr ON cr.codigo = l.categoria
    WHERE l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, (EXTRACT(year FROM l.data::date)::integer), (EXTRACT(month FROM l.data::date)::integer)
), reclass_saida_real AS (
    SELECT l.fazenda_id,
        l.cliente_id,
        cr.id AS categoria_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(l.quantidade)::numeric AS qtd,
        sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0::numeric)) AS peso
    FROM lancamentos l
        JOIN categorias cr ON cr.codigo = l.categoria
    WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, (EXTRACT(year FROM l.data::date)::integer), (EXTRACT(month FROM l.data::date)::integer)
), reclass_entrada_real AS (
    SELECT l.fazenda_id,
        l.cliente_id,
        cr.id AS categoria_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(l.quantidade)::numeric AS qtd,
        sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0::numeric)) AS peso
    FROM lancamentos l
        JOIN categorias cr ON cr.codigo = l.categoria_destino
    WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, (EXTRACT(year FROM l.data::date)::integer), (EXTRACT(month FROM l.data::date)::integer)
), mov_meta AS (
    SELECT l.fazenda_id,
        l.cliente_id,
        cr.id AS categoria_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(CASE WHEN l.tipo = ANY (ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade ELSE 0 END)::numeric AS entradas_ext,
        sum(CASE WHEN l.tipo = ANY (ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade ELSE 0 END)::numeric AS saidas_ext,
        sum(CASE WHEN l.tipo = ANY (ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_entradas_ext,
        sum(CASE WHEN l.tipo = ANY (ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_saidas_ext
    FROM lancamentos l
        JOIN categorias cr ON cr.codigo = l.categoria
    WHERE l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'meta'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, (EXTRACT(year FROM l.data::date)::integer), (EXTRACT(month FROM l.data::date)::integer)
), reclass_saida_meta AS (
    SELECT l.fazenda_id,
        l.cliente_id,
        cr.id AS categoria_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(l.quantidade)::numeric AS qtd,
        sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0::numeric)) AS peso
    FROM lancamentos l
        JOIN categorias cr ON cr.codigo = l.categoria
    WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, (EXTRACT(year FROM l.data::date)::integer), (EXTRACT(month FROM l.data::date)::integer)
), reclass_entrada_meta AS (
    SELECT l.fazenda_id,
        l.cliente_id,
        cr.id AS categoria_id,
        EXTRACT(year FROM l.data::date)::integer AS ano,
        EXTRACT(month FROM l.data::date)::integer AS mes,
        sum(l.quantidade)::numeric AS qtd,
        sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0::numeric)) AS peso
    FROM lancamentos l
        JOIN categorias cr ON cr.codigo = l.categoria_destino
    WHERE l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
    GROUP BY l.fazenda_id, l.cliente_id, cr.id, (EXTRACT(year FROM l.data::date)::integer), (EXTRACT(month FROM l.data::date)::integer)
), meta_gmd AS (
    SELECT mg.fazenda_id,
        cr.id AS categoria_id,
        EXTRACT(year FROM (mg.ano_mes || '-01')::date)::integer AS ano,
        EXTRACT(month FROM (mg.ano_mes || '-01')::date)::integer AS mes,
        mg.gmd_previsto
    FROM meta_gmd_mensal mg
        JOIN categorias cr ON cr.codigo = mg.categoria
), mov_all AS (
    SELECT COALESCE(mr.fazenda_id, re.fazenda_id, rs.fazenda_id) AS fazenda_id,
        COALESCE(mr.cliente_id, re.cliente_id, rs.cliente_id) AS cliente_id,
        COALESCE(mr.categoria_id, re.categoria_id, rs.categoria_id) AS categoria_id,
        COALESCE(mr.ano, re.ano, rs.ano) AS ano,
        COALESCE(mr.mes, re.mes, rs.mes) AS mes,
        COALESCE(mr.entradas_ext, 0::numeric) AS entradas_ext,
        COALESCE(mr.saidas_ext, 0::numeric) AS saidas_ext,
        COALESCE(re.qtd, 0::numeric) AS evol_cat_entrada,
        COALESCE(rs.qtd, 0::numeric) AS evol_cat_saida,
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
        COALESCE(mm.entradas_ext, 0::numeric) AS entradas_ext,
        COALESCE(mm.saidas_ext, 0::numeric) AS saidas_ext,
        COALESCE(rem.qtd, 0::numeric) AS evol_cat_entrada,
        COALESCE(rsm.qtd, 0::numeric) AS evol_cat_saida,
        COALESCE(mm.peso_entradas_ext, 0::numeric) AS peso_entradas_ext,
        COALESCE(mm.peso_saidas_ext, 0::numeric) AS peso_saidas_ext,
        COALESCE(rem.peso, 0::numeric) AS peso_evol_entrada,
        COALESCE(rsm.peso, 0::numeric) AS peso_evol_saida,
        'meta'::text AS cenario
    FROM mov_meta mm
        FULL JOIN reclass_entrada_meta rem ON rem.fazenda_id = mm.fazenda_id AND rem.categoria_id = mm.categoria_id AND rem.ano = mm.ano AND rem.mes = mm.mes
        FULL JOIN reclass_saida_meta rsm ON rsm.fazenda_id = COALESCE(mm.fazenda_id, rem.fazenda_id) AND rsm.categoria_id = COALESCE(mm.categoria_id, rem.categoria_id) AND rsm.ano = COALESCE(mm.ano, rem.ano) AND rsm.mes = COALESCE(mm.mes, rem.mes)
), cat_year_bounds AS (
    SELECT src.fazenda_id,
        src.cliente_id,
        src.categoria_id,
        min(src.ano) AS min_ano,
        max(src.ano) AS max_ano
    FROM ( SELECT saldo_ini_cat.fazenda_id,
                saldo_ini_cat.cliente_id,
                saldo_ini_cat.categoria_id,
                saldo_ini_cat.ano
            FROM saldo_ini_cat
        UNION
            SELECT DISTINCT mov_all.fazenda_id,
                mov_all.cliente_id,
                mov_all.categoria_id,
                mov_all.ano
            FROM mov_all) src
    GROUP BY src.fazenda_id, src.cliente_id, src.categoria_id
), all_cat_bases AS (
    SELECT cy.fazenda_id,
        cy.cliente_id,
        anos.ano,
        cy.categoria_id,
        cr.codigo AS categoria_codigo,
        cr.nome AS categoria_nome,
        cr.ordem_exibicao,
        COALESCE(si.cab_ini, 0::numeric) AS cab_ini_ano,
        COALESCE(si.peso_ini, 0::numeric) AS peso_ini_ano
    FROM cat_year_bounds cy
        JOIN LATERAL generate_series(cy.min_ano, cy.max_ano) anos(ano) ON true
        JOIN categorias cr ON cr.id = cy.categoria_id
        LEFT JOIN saldo_ini_cat si ON si.fazenda_id = cy.fazenda_id AND si.cliente_id = cy.cliente_id AND si.ano = anos.ano AND si.categoria_id = cy.categoria_id
), fechamento_dedup AS (
    SELECT DISTINCT ON (fp.pasto_id, fp.ano_mes) fp.id,
        fp.fazenda_id,
        fp.ano_mes,
        fp.pasto_id
    FROM fechamento_pastos fp
        JOIN pastos p ON p.id = fp.pasto_id
    WHERE p.ativo = true AND p.entra_conciliacao = true
    ORDER BY fp.pasto_id, fp.ano_mes, fp.created_at
), peso_real_cat AS (
    SELECT fd.fazenda_id,
        EXTRACT(year FROM (fd.ano_mes || '-01')::date)::integer AS ano,
        EXTRACT(month FROM (fd.ano_mes || '-01')::date)::integer AS mes,
        fpi.categoria_id,
        sum(fpi.quantidade)::numeric AS cab_pesado,
        sum(fpi.quantidade::numeric * COALESCE(fpi.peso_medio_kg, 0::numeric)) AS peso_total_real
    FROM fechamento_dedup fd
        JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fd.id
    GROUP BY fd.fazenda_id, (EXTRACT(year FROM (fd.ano_mes || '-01')::date)::integer), (EXTRACT(month FROM (fd.ano_mes || '-01')::date)::integer), fpi.categoria_id
), expanded AS (
    SELECT base.fazenda_id,
        base.cliente_id,
        base.ano,
        mes_ref.mes,
        cen.cenario,
        base.categoria_id,
        base.categoria_codigo,
        base.categoria_nome,
        base.ordem_exibicao,
        COALESCE(base.cab_ini_ano, 0::numeric) AS cab_ini_ano,
        round(COALESCE(base.peso_ini_ano, 0::numeric), 2) AS peso_ini_ano,
        COALESCE(m.entradas_ext, 0::numeric) AS entradas_ext,
        COALESCE(m.saidas_ext, 0::numeric) AS saidas_ext,
        COALESCE(m.evol_cat_entrada, 0::numeric) AS evol_cat_entrada,
        COALESCE(m.evol_cat_saida, 0::numeric) AS evol_cat_saida,
        round(COALESCE(m.peso_entradas_ext, 0::numeric), 2) AS peso_entradas_ext,
        round(COALESCE(m.peso_saidas_ext, 0::numeric), 2) AS peso_saidas_ext,
        round(COALESCE(m.peso_evol_entrada, 0::numeric), 2) AS peso_evol_entrada,
        round(COALESCE(m.peso_evol_saida, 0::numeric), 2) AS peso_evol_saida,
        COALESCE(m.entradas_ext, 0::numeric) - COALESCE(m.saidas_ext, 0::numeric) + COALESCE(m.evol_cat_entrada, 0::numeric) - COALESCE(m.evol_cat_saida, 0::numeric) AS delta_cab,
        round(COALESCE(m.peso_entradas_ext, 0::numeric) - COALESCE(m.peso_saidas_ext, 0::numeric) + COALESCE(m.peso_evol_entrada, 0::numeric) - COALESCE(m.peso_evol_saida, 0::numeric), 2) AS delta_peso,
        COALESCE(mg.gmd_previsto, 0::numeric) AS gmd_previsto,
        EXTRACT(day FROM make_date(base.ano, mes_ref.mes, 1) + '1 mon'::interval - '1 day'::interval)::integer AS dias_mes,
        pr.cab_pesado,
        pr.peso_total_real,
        CASE WHEN cen.cenario = 'realizado' THEN 'fallback_movimentacao' ELSE 'projecao' END AS fonte_mes,
        row_number() OVER (PARTITION BY base.fazenda_id, cen.cenario, base.categoria_id ORDER BY base.ano, mes_ref.mes) AS seq
    FROM all_cat_bases base
        CROSS JOIN ( VALUES ('realizado'), ('meta')) cen(cenario)
        CROSS JOIN generate_series(1, 12) mes_ref(mes)
        LEFT JOIN mov_all m ON m.fazenda_id = base.fazenda_id AND m.categoria_id = base.categoria_id AND m.ano = base.ano AND m.mes = mes_ref.mes AND m.cenario = cen.cenario
        LEFT JOIN meta_gmd mg ON mg.fazenda_id = base.fazenda_id AND mg.categoria_id = base.categoria_id AND mg.ano = base.ano AND mg.mes = mes_ref.mes AND cen.cenario = 'meta'
        LEFT JOIN peso_real_cat pr ON pr.fazenda_id = base.fazenda_id AND pr.categoria_id = base.categoria_id AND pr.ano = base.ano AND pr.mes = mes_ref.mes AND cen.cenario = 'realizado'
), chain AS (
    -- Caso base: seq = 1 (primeiro mês da série)
    SELECT e.fazenda_id,
        e.cliente_id,
        e.ano,
        e.mes,
        e.cenario,
        e.categoria_id,
        e.categoria_codigo,
        e.categoria_nome,
        e.ordem_exibicao,
        e.cab_ini_ano,
        e.peso_ini_ano,
        e.entradas_ext,
        e.saidas_ext,
        e.evol_cat_entrada,
        e.evol_cat_saida,
        e.peso_entradas_ext,
        e.peso_saidas_ext,
        e.peso_evol_entrada,
        e.peso_evol_saida,
        e.delta_cab,
        e.delta_peso,
        e.gmd_previsto,
        e.dias_mes,
        e.cab_pesado,
        e.peso_total_real,
        e.fonte_mes,
        e.seq,
        e.cab_ini_ano AS saldo_inicial_calc,
        e.cab_ini_ano + e.delta_cab AS saldo_final_contabil,
        e.cab_ini_ano + e.delta_cab AS saldo_final_calc,
        e.peso_ini_ano AS peso_total_inicial_calc,
        CASE
            WHEN e.cenario = 'meta' THEN round(COALESCE(e.gmd_previsto, 0::numeric) * ((e.cab_ini_ano + (e.cab_ini_ano + e.delta_cab)) / 2.0) * e.dias_mes::numeric, 2)
            ELSE 0::numeric
        END AS producao_biologica_calc,
        round(e.peso_ini_ano + e.delta_peso +
            CASE
                WHEN e.cenario = 'meta' THEN COALESCE(e.gmd_previsto, 0::numeric) * ((e.cab_ini_ano + (e.cab_ini_ano + e.delta_cab)) / 2.0) * e.dias_mes::numeric
                ELSE 0::numeric
            END, 2) AS peso_total_final_contabil,
        round(e.peso_ini_ano + e.delta_peso +
            CASE
                WHEN e.cenario = 'meta' THEN COALESCE(e.gmd_previsto, 0::numeric) * ((e.cab_ini_ano + (e.cab_ini_ano + e.delta_cab)) / 2.0) * e.dias_mes::numeric
                ELSE 0::numeric
            END, 2) AS peso_total_final_calc
    FROM expanded e
    WHERE e.seq = 1
    UNION ALL
    -- Caso recursivo: seq > 1 — CORRIGIDO: resetar saldo em Janeiro (mes=1)
    SELECT e.fazenda_id,
        e.cliente_id,
        e.ano,
        e.mes,
        e.cenario,
        e.categoria_id,
        e.categoria_codigo,
        e.categoria_nome,
        e.ordem_exibicao,
        e.cab_ini_ano,
        e.peso_ini_ano,
        e.entradas_ext,
        e.saidas_ext,
        e.evol_cat_entrada,
        e.evol_cat_saida,
        e.peso_entradas_ext,
        e.peso_saidas_ext,
        e.peso_evol_entrada,
        e.peso_evol_saida,
        e.delta_cab,
        e.delta_peso,
        e.gmd_previsto,
        e.dias_mes,
        e.cab_pesado,
        e.peso_total_real,
        e.fonte_mes,
        e.seq,
        -- Saldo inicial: resetar para cab_ini_ano em Janeiro
        CASE WHEN e.mes = 1 THEN e.cab_ini_ano ELSE c.saldo_final_calc END AS saldo_inicial_calc,
        -- Saldo final: usar o novo saldo_inicial
        (CASE WHEN e.mes = 1 THEN e.cab_ini_ano ELSE c.saldo_final_calc END) + e.delta_cab AS saldo_final_contabil,
        (CASE WHEN e.mes = 1 THEN e.cab_ini_ano ELSE c.saldo_final_calc END) + e.delta_cab AS saldo_final_calc,
        -- Peso inicial: resetar para peso_ini_ano em Janeiro
        CASE WHEN e.mes = 1 THEN e.peso_ini_ano ELSE c.peso_total_final_calc END AS peso_total_inicial_calc,
        -- Producao biológica: usar novo SI
        CASE WHEN e.cenario = 'meta' THEN round(COALESCE(e.gmd_previsto, 0::numeric)
            * (((CASE WHEN e.mes = 1 THEN e.cab_ini_ano ELSE c.saldo_final_calc END)
               + ((CASE WHEN e.mes = 1 THEN e.cab_ini_ano ELSE c.saldo_final_calc END) + e.delta_cab)) / 2.0)
            * e.dias_mes::numeric, 2)
            ELSE 0::numeric
        END AS producao_biologica_calc,
        -- Peso final contábil
        round((CASE WHEN e.mes = 1 THEN e.peso_ini_ano ELSE c.peso_total_final_calc END) + e.delta_peso +
            CASE WHEN e.cenario = 'meta' THEN COALESCE(e.gmd_previsto, 0::numeric)
                * (((CASE WHEN e.mes = 1 THEN e.cab_ini_ano ELSE c.saldo_final_calc END)
                   + ((CASE WHEN e.mes = 1 THEN e.cab_ini_ano ELSE c.saldo_final_calc END) + e.delta_cab)) / 2.0)
                * e.dias_mes::numeric
                ELSE 0::numeric
            END, 2) AS peso_total_final_contabil,
        -- Peso final calc
        round((CASE WHEN e.mes = 1 THEN e.peso_ini_ano ELSE c.peso_total_final_calc END) + e.delta_peso +
            CASE WHEN e.cenario = 'meta' THEN COALESCE(e.gmd_previsto, 0::numeric)
                * (((CASE WHEN e.mes = 1 THEN e.cab_ini_ano ELSE c.saldo_final_calc END)
                   + ((CASE WHEN e.mes = 1 THEN e.cab_ini_ano ELSE c.saldo_final_calc END) + e.delta_cab)) / 2.0)
                * e.dias_mes::numeric
                ELSE 0::numeric
            END, 2) AS peso_total_final_calc
    FROM chain c
        JOIN expanded e ON e.fazenda_id = c.fazenda_id AND e.cenario = c.cenario AND e.categoria_id = c.categoria_id AND e.seq = (c.seq + 1)
)
SELECT fazenda_id,
    cliente_id,
    ano,
    mes,
    cenario,
    (ano::text || '-') || lpad(mes::text, 2, '0') AS ano_mes,
    categoria_id,
    categoria_codigo,
    categoria_nome,
    ordem_exibicao,
    saldo_inicial_calc::integer AS saldo_inicial,
    entradas_ext::integer AS entradas_externas,
    saidas_ext::integer AS saidas_externas,
    evol_cat_entrada::integer AS evol_cat_entrada,
    evol_cat_saida::integer AS evol_cat_saida,
    saldo_final_calc::integer AS saldo_final,
    round(peso_total_inicial_calc, 2) AS peso_total_inicial,
    round(peso_total_final_calc, 2) AS peso_total_final,
    CASE WHEN saldo_inicial_calc > 0::numeric THEN round(peso_total_inicial_calc / saldo_inicial_calc, 2) ELSE NULL::numeric END AS peso_medio_inicial,
    CASE WHEN saldo_final_calc > 0::numeric THEN round(peso_total_final_calc / saldo_final_calc, 2) ELSE NULL::numeric END AS peso_medio_final,
    round(peso_entradas_ext, 2) AS peso_entradas_externas,
    round(peso_saidas_ext, 2) AS peso_saidas_externas,
    round(peso_evol_entrada, 2) AS peso_evol_cat_entrada,
    round(peso_evol_saida, 2) AS peso_evol_cat_saida,
    dias_mes,
    CASE WHEN ((saldo_inicial_calc + saldo_final_calc) / 2.0) > 0::numeric AND dias_mes > 0 THEN round((peso_total_final_calc - peso_total_inicial_calc - peso_entradas_ext + peso_saidas_ext - peso_evol_entrada + peso_evol_saida) / ((saldo_inicial_calc + saldo_final_calc) / 2.0 * dias_mes::numeric), 4) ELSE NULL::numeric END AS gmd,
    round(peso_total_final_calc - peso_total_inicial_calc - peso_entradas_ext + peso_saidas_ext - peso_evol_entrada + peso_evol_saida, 2) AS producao_biologica,
    fonte_mes AS fonte_oficial_mes
FROM chain
WHERE NOT (saldo_inicial_calc = 0::numeric AND saldo_final_calc = 0::numeric AND entradas_ext = 0::numeric AND saidas_ext = 0::numeric AND evol_cat_entrada = 0::numeric AND evol_cat_saida = 0::numeric AND round(peso_total_inicial_calc, 2) = 0::numeric AND round(peso_total_final_calc, 2) = 0::numeric);
