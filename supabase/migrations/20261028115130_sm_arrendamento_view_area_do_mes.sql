-- SM-ARRENDAMENTO-ENCERRAR-01 (Gabriel 30/10/2026 18:57 "1- 31/07/2024  2- A"; prévia OK 19:33) — a área da camada oficial é a do MÊS.
-- Até aqui o CTE `area` somava os pastos da fazenda UMA vez (ativo + entra_conciliacao), o mesmo número em todos os meses: o
-- arrendamento devolvido da Faz. Sta. Maria (600 ha, vigência até 31/07/2024) continuava no denominador da lotação até hoje.
-- Agora a área de cada linha (fazenda × ano_mes) soma só os pastos VIGENTES naquele mês, pela regra única `fn_pasto_vigente_no_mes`
-- (ativo + início ≤ fim do mês + fim ≥ começo do mês; PASTO-VIGENCIA-02), mais o `entra_conciliacao` de sempre.
-- Só `area_produtiva_ha` e `lotacao_ua_ha` mudam; saldos, pesos, GMD e UA ficam idênticos (o teste prova pelo md5 das outras colunas).
-- O uso do pasto (reserva/agricultura) continua SEM filtro aqui, como antes: fora do pedido.
-- Base: a definição VIVA (pg_get_viewdef em 30/10/2026), não a do arquivo 20260413154004, que já está atrás do banco (o ramo
-- 'fechamento' de `fonte_oficial_mes`). REPLACE de view apaga reloptions: o `security_invoker` vai explícito.
-- `fn_pasto_vigente_no_mes` já tem EXECUTE para `authenticated` (a view é security_invoker).

CREATE OR REPLACE VIEW public.vw_zoot_fazenda_mensal WITH (security_invoker = true) AS
 WITH cat AS (
         SELECT vw_zoot_categoria_mensal.fazenda_id,
            vw_zoot_categoria_mensal.cliente_id,
            vw_zoot_categoria_mensal.ano,
            vw_zoot_categoria_mensal.mes,
            vw_zoot_categoria_mensal.cenario,
            vw_zoot_categoria_mensal.ano_mes,
            sum(vw_zoot_categoria_mensal.saldo_inicial)::integer AS cabecas_inicio,
            sum(vw_zoot_categoria_mensal.saldo_final)::integer AS cabecas_final,
            sum(vw_zoot_categoria_mensal.entradas_externas)::integer AS entradas,
            sum(vw_zoot_categoria_mensal.saidas_externas)::integer AS saidas,
            round(sum(vw_zoot_categoria_mensal.peso_total_inicial), 2) AS peso_inicio_kg,
            round(sum(vw_zoot_categoria_mensal.peso_total_final), 2) AS peso_total_final_kg,
            round(sum(vw_zoot_categoria_mensal.peso_entradas_externas), 2) AS peso_entradas_kg,
            round(sum(vw_zoot_categoria_mensal.peso_saidas_externas), 2) AS peso_saidas_kg,
            round(sum(vw_zoot_categoria_mensal.producao_biologica), 2) AS gmd_numerador_kg,
            max(vw_zoot_categoria_mensal.dias_mes) AS dias_mes,
                CASE
                    WHEN bool_or(vw_zoot_categoria_mensal.fonte_oficial_mes = 'fechamento'::text) THEN 'fechamento'::text
                    WHEN bool_or(vw_zoot_categoria_mensal.fonte_oficial_mes = 'fallback_movimentacao'::text) THEN 'fallback_movimentacao'::text
                    ELSE 'projecao'::text
                END AS fonte_oficial_mes
           FROM vw_zoot_categoria_mensal
          GROUP BY vw_zoot_categoria_mensal.fazenda_id, vw_zoot_categoria_mensal.cliente_id, vw_zoot_categoria_mensal.ano, vw_zoot_categoria_mensal.mes, vw_zoot_categoria_mensal.cenario, vw_zoot_categoria_mensal.ano_mes
        )
 SELECT c.fazenda_id,
    c.cliente_id,
    c.ano,
    c.mes,
    c.cenario,
    lpad(c.mes::text, 2, '0'::text) AS mes_key,
    c.ano_mes,
    c.cabecas_inicio,
    c.cabecas_final,
    c.peso_inicio_kg,
    c.peso_total_final_kg,
        CASE
            WHEN c.cabecas_final > 0 THEN round(c.peso_total_final_kg / c.cabecas_final::numeric, 2)
            ELSE NULL::numeric
        END AS peso_medio_final_kg,
    c.peso_entradas_kg,
    c.peso_saidas_kg,
    c.entradas,
    c.saidas,
    c.dias_mes,
        CASE
            WHEN c.dias_mes > 0 AND (c.cabecas_inicio + c.cabecas_final) > 0 THEN round(c.gmd_numerador_kg / ((c.cabecas_inicio + c.cabecas_final)::numeric / 2.0) / c.dias_mes::numeric, 4)
            ELSE NULL::numeric
        END AS gmd_kg_cab_dia,
        CASE
            WHEN (c.cabecas_inicio + c.cabecas_final) > 0 THEN c.gmd_numerador_kg
            ELSE NULL::numeric
        END AS gmd_numerador_kg,
        CASE
            WHEN c.cabecas_final > 0 THEN round((c.cabecas_inicio + c.cabecas_final)::numeric / 2.0 * (c.peso_total_final_kg / c.cabecas_final::numeric) / 450.0, 2)
            ELSE NULL::numeric
        END AS ua_media,
    COALESCE(a.area_produtiva_ha, 0::numeric) AS area_produtiva_ha,
        CASE
            WHEN COALESCE(a.area_produtiva_ha, 0::numeric) > 0::numeric AND c.cabecas_final > 0 THEN round((c.cabecas_inicio + c.cabecas_final)::numeric / 2.0 * (c.peso_total_final_kg / c.cabecas_final::numeric) / 450.0 / a.area_produtiva_ha, 2)
            ELSE NULL::numeric
        END AS lotacao_ua_ha,
    c.fonte_oficial_mes
   FROM cat c
     LEFT JOIN LATERAL (
         SELECT sum(
                CASE
                    WHEN p.entra_conciliacao AND public.fn_pasto_vigente_no_mes(p.ativo, p.data_inicio, p.data_fim, c.ano_mes) THEN p.area_produtiva_ha
                    ELSE 0::numeric
                END) AS area_produtiva_ha
           FROM pastos p
          WHERE p.fazenda_id = c.fazenda_id
        ) a ON true;
