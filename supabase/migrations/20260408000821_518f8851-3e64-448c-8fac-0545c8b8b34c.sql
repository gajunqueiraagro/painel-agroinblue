
CREATE OR REPLACE VIEW public.vw_zoot_fazenda_mensal AS
WITH saldo_ini AS (
    SELECT s.fazenda_id, s.cliente_id, s.ano,
           SUM(s.quantidade) AS cab_ini,
           SUM(s.quantidade::numeric * COALESCE(s.peso_medio_kg, 0)) AS peso_ini
    FROM saldos_iniciais s
    GROUP BY s.fazenda_id, s.cliente_id, s.ano
),
mov_realizado AS (
    SELECT l.fazenda_id, l.cliente_id,
           EXTRACT(YEAR FROM l.data::date)::int AS ano,
           EXTRACT(MONTH FROM l.data::date)::int AS mes,
           SUM(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas,
           SUM(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade ELSE 0 END) AS saidas,
           SUM(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_entradas,
           SUM(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_saidas
    FROM lancamentos l
    WHERE l.cancelado = false AND l.tipo <> 'reclassificacao'
      AND COALESCE(l.status_operacional, 'conciliado') = 'conciliado'
    GROUP BY l.fazenda_id, l.cliente_id, EXTRACT(YEAR FROM l.data::date)::int, EXTRACT(MONTH FROM l.data::date)::int
),
mov_meta AS (
    SELECT l.fazenda_id, l.cliente_id,
           EXTRACT(YEAR FROM l.data::date)::int AS ano,
           EXTRACT(MONTH FROM l.data::date)::int AS mes,
           SUM(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas,
           SUM(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade ELSE 0 END) AS saidas,
           SUM(CASE WHEN l.tipo IN ('nascimento','compra','transferencia_entrada') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_entradas,
           SUM(CASE WHEN l.tipo IN ('abate','venda','venda_pe','transferencia_saida','consumo','morte') THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS peso_saidas
    FROM lancamentos l
    WHERE l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'meta'
    GROUP BY l.fazenda_id, l.cliente_id, EXTRACT(YEAR FROM l.data::date)::int, EXTRACT(MONTH FROM l.data::date)::int
),
mov_all AS (
    SELECT *, 'realizado'::text AS cenario FROM mov_realizado
    UNION ALL
    SELECT *, 'meta'::text AS cenario FROM mov_meta
),
meses AS (SELECT generate_series(1, 12) AS mes),
fazenda_cenario AS (
    SELECT DISTINCT fc_sub.fazenda_id, fc_sub.cliente_id, fc_sub.ano, fc_sub.cenario FROM (
        SELECT si2.fazenda_id, si2.cliente_id, si2.ano, 'realizado'::text AS cenario FROM saldo_ini si2
        UNION
        SELECT ma2.fazenda_id, ma2.cliente_id, ma2.ano, ma2.cenario FROM mov_all ma2
    ) fc_sub
),
grid AS (
    SELECT fc.fazenda_id, fc.cliente_id, fc.ano, m.mes, fc.cenario
    FROM fazenda_cenario fc CROSS JOIN meses m
),
running AS (
    SELECT g.fazenda_id, g.cliente_id, g.ano, g.mes, g.cenario,
        CASE WHEN g.mes = 1 THEN COALESCE(si.cab_ini, 0)
             ELSE COALESCE(si.cab_ini, 0) + COALESCE((
                 SELECT SUM(m2.entradas - m2.saidas)
                 FROM mov_all m2
                 WHERE m2.fazenda_id = g.fazenda_id AND m2.cliente_id = g.cliente_id
                   AND m2.ano = g.ano AND m2.cenario = g.cenario AND m2.mes < g.mes
             ), 0)
        END AS cab_inicio_mes,
        COALESCE(si.cab_ini, 0) + COALESCE((
            SELECT SUM(m2.entradas - m2.saidas)
            FROM mov_all m2
            WHERE m2.fazenda_id = g.fazenda_id AND m2.cliente_id = g.cliente_id
              AND m2.ano = g.ano AND m2.cenario = g.cenario AND m2.mes <= g.mes
        ), 0) AS cab_final,
        COALESCE(mv.entradas, 0) AS entradas,
        COALESCE(mv.saidas, 0) AS saidas,
        COALESCE(mv.peso_entradas, 0) AS peso_entradas,
        COALESCE(mv.peso_saidas, 0) AS peso_saidas,
        CASE WHEN g.mes = 1 THEN COALESCE(si.peso_ini, 0)
             ELSE COALESCE(si.peso_ini, 0)
                  + COALESCE((SELECT SUM(m2.peso_entradas) FROM mov_all m2 WHERE m2.fazenda_id = g.fazenda_id AND m2.cliente_id = g.cliente_id AND m2.ano = g.ano AND m2.cenario = g.cenario AND m2.mes < g.mes), 0)
                  - COALESCE((SELECT SUM(m2.peso_saidas)   FROM mov_all m2 WHERE m2.fazenda_id = g.fazenda_id AND m2.cliente_id = g.cliente_id AND m2.ano = g.ano AND m2.cenario = g.cenario AND m2.mes < g.mes), 0)
        END AS peso_inicio_contabil,
        COALESCE(si.peso_ini, 0)
            + COALESCE((SELECT SUM(m2.peso_entradas) FROM mov_all m2 WHERE m2.fazenda_id = g.fazenda_id AND m2.cliente_id = g.cliente_id AND m2.ano = g.ano AND m2.cenario = g.cenario AND m2.mes <= g.mes), 0)
            - COALESCE((SELECT SUM(m2.peso_saidas)   FROM mov_all m2 WHERE m2.fazenda_id = g.fazenda_id AND m2.cliente_id = g.cliente_id AND m2.ano = g.ano AND m2.cenario = g.cenario AND m2.mes <= g.mes), 0)
        AS peso_final_contabil
    FROM grid g
    LEFT JOIN saldo_ini si ON si.fazenda_id = g.fazenda_id AND si.ano = g.ano
    LEFT JOIN mov_all mv ON mv.fazenda_id = g.fazenda_id AND mv.cliente_id = g.cliente_id AND mv.ano = g.ano AND mv.mes = g.mes AND mv.cenario = g.cenario
),
peso_real AS (
    SELECT fp.fazenda_id,
           EXTRACT(YEAR FROM (fp.ano_mes || '-01')::date)::int AS ano,
           EXTRACT(MONTH FROM (fp.ano_mes || '-01')::date)::int AS mes,
           SUM(fpi.quantidade) AS cab_pesado,
           SUM(fpi.quantidade::numeric * COALESCE(fpi.peso_medio_kg, 0)) AS peso_total_real
    FROM fechamento_pastos fp
    JOIN pastos p ON p.id = fp.pasto_id AND p.ativo = true
    JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fp.id
    WHERE fp.status = 'fechado'
      AND fp.id = (
          SELECT fp2.id FROM fechamento_pastos fp2
          WHERE fp2.pasto_id = fp.pasto_id AND fp2.ano_mes = fp.ano_mes AND fp2.status = 'fechado'
          ORDER BY fp2.created_at ASC LIMIT 1
      )
    GROUP BY fp.fazenda_id, EXTRACT(YEAR FROM (fp.ano_mes || '-01')::date), EXTRACT(MONTH FROM (fp.ano_mes || '-01')::date)
),
area AS (
    SELECT p2.fazenda_id,
           COALESCE(fc2.area_produtiva, SUM(CASE WHEN p2.ativo AND p2.entra_conciliacao THEN p2.area_produtiva_ha ELSE 0 END)) AS area_produtiva_ha
    FROM pastos p2
    LEFT JOIN fazenda_cadastros fc2 ON fc2.fazenda_id = p2.fazenda_id
    GROUP BY p2.fazenda_id, fc2.area_produtiva
)
SELECT r.fazenda_id, r.cliente_id, r.ano, r.mes, r.cenario,
    lpad(r.mes::text, 2, '0') AS mes_key,
    r.ano::text || '-' || lpad(r.mes::text, 2, '0') AS ano_mes,
    r.cab_inicio_mes::int AS cabecas_inicio,
    CASE
        WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::int
        ELSE r.cab_final::int
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
    r.entradas::int AS entradas,
    r.saidas::int AS saidas,
    EXTRACT(DAY FROM make_date(r.ano, r.mes, 1) + interval '1 month' - interval '1 day')::int AS dias_mes,
    -- GMD
    CASE
        WHEN ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(
            CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
        , 0)) / 2.0) > 0
        AND EXTRACT(DAY FROM make_date(r.ano, r.mes, 1) + interval '1 month' - interval '1 day') > 0
        THEN round(
            (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END
             - r.peso_inicio_contabil - COALESCE(r.peso_entradas, 0) + COALESCE(r.peso_saidas, 0))
            / ((COALESCE(r.cab_inicio_mes, 0) + COALESCE(
                CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
            , 0)) / 2.0)
            / EXTRACT(DAY FROM make_date(r.ano, r.mes, 1) + interval '1 month' - interval '1 day')
        , 4)
        ELSE 0
    END AS gmd_kg_cab_dia,
    round(
        (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END
         - r.peso_inicio_contabil - COALESCE(r.peso_entradas, 0) + COALESCE(r.peso_saidas, 0))
    , 2) AS gmd_numerador_kg,
    -- UA MEDIA = cab_medio × peso_medio_final / 450
    CASE
        WHEN COALESCE(
            CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
        , 0) > 0
        THEN round(
            (COALESCE(r.cab_inicio_mes, 0) + COALESCE(
                CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
            , 0)) / 2.0
            * (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END
               / COALESCE(
                   CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
               , 1))
            / 450.0
        , 2)
        ELSE 0
    END AS ua_media,
    COALESCE(a.area_produtiva_ha, 0) AS area_produtiva_ha,
    -- LOTAÇÃO UA/HA
    CASE
        WHEN COALESCE(a.area_produtiva_ha, 0) > 0
         AND COALESCE(
            CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
         , 0) > 0
        THEN round(
            (COALESCE(r.cab_inicio_mes, 0) + COALESCE(
                CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
            , 0)) / 2.0
            * (CASE WHEN r.cenario = 'realizado' AND pr.peso_total_real IS NOT NULL THEN pr.peso_total_real ELSE r.peso_final_contabil END
               / COALESCE(
                   CASE WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL AND pr.cab_pesado > 0 THEN pr.cab_pesado::numeric ELSE r.cab_final END
               , 1))
            / 450.0
            / a.area_produtiva_ha
        , 2)
        ELSE 0
    END AS lotacao_ua_ha,
    CASE
        WHEN r.cenario = 'realizado' AND pr.cab_pesado IS NOT NULL THEN 'fechamento'
        WHEN r.cenario = 'realizado' AND (r.entradas > 0 OR r.saidas > 0) THEN 'fallback_movimentacao'
        ELSE 'projecao'
    END AS fonte_oficial_mes
FROM running r
LEFT JOIN peso_real pr ON pr.fazenda_id = r.fazenda_id AND pr.ano = r.ano AND pr.mes = r.mes AND r.cenario = 'realizado'
LEFT JOIN area a ON a.fazenda_id = r.fazenda_id;
