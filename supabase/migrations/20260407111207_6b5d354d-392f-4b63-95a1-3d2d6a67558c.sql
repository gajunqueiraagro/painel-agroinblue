
DROP VIEW IF EXISTS vw_zoot_fazenda_mensal;

CREATE VIEW vw_zoot_fazenda_mensal AS
WITH saldo_ini AS (
    SELECT fazenda_id, cliente_id, ano,
        sum(quantidade) AS cab_ini,
        sum(quantidade::numeric * COALESCE(peso_medio_kg, 0::numeric)) AS peso_ini
    FROM saldos_iniciais
    GROUP BY fazenda_id, cliente_id, ano
), mov_realizado AS (
    SELECT fazenda_id, cliente_id,
        EXTRACT(year FROM data::date)::integer AS ano,
        EXTRACT(month FROM data::date)::integer AS mes,
        sum(CASE WHEN tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN quantidade ELSE 0 END) AS entradas,
        sum(CASE WHEN tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN quantidade ELSE 0 END) AS saidas,
        sum(CASE WHEN tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN quantidade::numeric * COALESCE(peso_medio_kg, peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_entradas,
        sum(CASE WHEN tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN quantidade::numeric * COALESCE(peso_medio_kg, peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_saidas
    FROM lancamentos
    WHERE cancelado = false
      AND tipo <> 'reclassificacao'
      AND COALESCE(status_operacional, 'conciliado') = 'conciliado'
    GROUP BY fazenda_id, cliente_id, EXTRACT(year FROM data::date)::integer, EXTRACT(month FROM data::date)::integer
), mov_meta AS (
    SELECT fazenda_id, cliente_id,
        EXTRACT(year FROM data::date)::integer AS ano,
        EXTRACT(month FROM data::date)::integer AS mes,
        sum(CASE WHEN tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN quantidade ELSE 0 END) AS entradas,
        sum(CASE WHEN tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN quantidade ELSE 0 END) AS saidas,
        sum(CASE WHEN tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN quantidade::numeric * COALESCE(peso_medio_kg, peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_entradas,
        sum(CASE WHEN tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN quantidade::numeric * COALESCE(peso_medio_kg, peso_carcaca_kg, 0::numeric) ELSE 0::numeric END) AS peso_saidas
    FROM lancamentos
    WHERE cancelado = false
      AND tipo <> 'reclassificacao'
      AND cenario = 'meta'
    GROUP BY fazenda_id, cliente_id, EXTRACT(year FROM data::date)::integer, EXTRACT(month FROM data::date)::integer
), mov_all AS (
    SELECT fazenda_id, cliente_id, ano, mes, entradas, saidas, peso_entradas, peso_saidas, 'realizado'::text AS cenario FROM mov_realizado
    UNION ALL
    SELECT fazenda_id, cliente_id, ano, mes, entradas, saidas, peso_entradas, peso_saidas, 'meta'::text AS cenario FROM mov_meta
), expanded AS (
    SELECT si.fazenda_id, si.cliente_id, si.ano, g.mes, c.cenario,
        si.cab_ini, si.peso_ini,
        COALESCE(m.entradas, 0::bigint) AS entradas,
        COALESCE(m.saidas, 0::bigint) AS saidas,
        COALESCE(m.peso_entradas, 0::numeric) AS peso_entradas,
        COALESCE(m.peso_saidas, 0::numeric) AS peso_saidas
    FROM saldo_ini si
    CROSS JOIN (VALUES ('realizado'::text), ('meta'::text)) c(cenario)
    CROSS JOIN generate_series(1, 12) g(mes)
    LEFT JOIN mov_all m ON m.fazenda_id = si.fazenda_id AND m.ano = si.ano AND m.mes = g.mes AND m.cenario = c.cenario
), running AS (
    SELECT fazenda_id, cliente_id, ano, mes, cenario,
        cab_ini, peso_ini, entradas, saidas, peso_entradas, peso_saidas,
        cab_ini::numeric + COALESCE(sum(entradas - saidas) OVER w_prev, 0::numeric) AS cab_inicio_mes,
        peso_ini + COALESCE(sum(peso_entradas - peso_saidas) OVER w_prev, 0::numeric) AS peso_inicio_contabil,
        cab_ini::numeric + sum(entradas - saidas) OVER w_curr AS cab_final,
        peso_ini + sum(peso_entradas - peso_saidas) OVER w_curr AS peso_final_contabil
    FROM expanded
    WINDOW w_prev AS (PARTITION BY fazenda_id, ano, cenario ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
           w_curr AS (PARTITION BY fazenda_id, ano, cenario ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
), peso_real AS (
    SELECT fp.fazenda_id, fp.ano_mes,
        EXTRACT(year FROM (fp.ano_mes || '-01')::date)::integer AS ano,
        EXTRACT(month FROM (fp.ano_mes || '-01')::date)::integer AS mes,
        sum(fpi.quantidade) AS cab_pesado,
        sum(fpi.quantidade::numeric * COALESCE(fpi.peso_medio_kg, 0::numeric)) AS peso_total_real
    FROM fechamento_pastos fp
    JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fp.id
    WHERE fp.status = 'fechado'
    GROUP BY fp.fazenda_id, fp.ano_mes
), area AS (
    SELECT fazenda_id,
        sum(CASE WHEN ativo AND entra_conciliacao THEN COALESCE(area_produtiva_ha, 0::numeric) ELSE 0::numeric END) AS area_produtiva_ha
    FROM pastos
    GROUP BY fazenda_id
)
SELECT r.fazenda_id, r.cliente_id, r.ano, r.mes, r.cenario,
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
        ELSE NULL::numeric
    END AS peso_medio_final_kg,
    round(r.peso_entradas, 2) AS peso_entradas_kg,
    round(r.peso_saidas, 2) AS peso_saidas_kg,
    r.entradas::integer AS entradas,
    r.saidas::integer AS saidas,
    EXTRACT(day FROM make_date(r.ano, r.mes, 1) + interval '1 month' - interval '1 day')::integer AS dias_mes,
    CASE
        WHEN ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(
            CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END, 0)) / 2.0) > 0
            AND EXTRACT(day FROM make_date(r.ano, r.mes, 1) + interval '1 month' - interval '1 day') > 0
        THEN round(
            (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END
             - r.peso_inicio_contabil - COALESCE(r.peso_entradas, 0) + COALESCE(r.peso_saidas, 0))
            / ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(
                CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END, 0)) / 2.0)
            / EXTRACT(day FROM make_date(r.ano, r.mes, 1) + interval '1 month' - interval '1 day')
        , 4)
        ELSE 0
    END AS gmd_kg_cab_dia,
    round(
        CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END
        - r.peso_inicio_contabil - COALESCE(r.peso_entradas, 0) + COALESCE(r.peso_saidas, 0)
    , 2) AS gmd_numerador_kg,
    round(
        ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(
            CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END, 0)) / 2.0)
        * 450.0 / 450.0
    , 2) AS ua_media,
    COALESCE(a.area_produtiva_ha, 0) AS area_produtiva_ha,
    CASE
        WHEN COALESCE(a.area_produtiva_ha, 0) > 0 THEN round(
            ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(
                CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END, 0)) / 2.0)
            * 450.0 / 450.0 / a.area_produtiva_ha
        , 2)
        ELSE 0
    END AS lotacao_ua_ha,
    CASE
        WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL THEN 'fechamento'
        WHEN r.cenario = 'realizado' AND (r.entradas > 0 OR r.saidas > 0) THEN 'fallback_movimentacao'
        ELSE 'projecao'
    END::text AS fonte_oficial_mes
FROM running r
LEFT JOIN peso_real pr ON pr.fazenda_id = r.fazenda_id AND pr.ano = r.ano AND pr.mes = r.mes AND r.cenario = 'realizado'
LEFT JOIN area a ON a.fazenda_id = r.fazenda_id;
