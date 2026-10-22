-- FIN-VISAO-GERAL-01 PR 2 — fn_vg_denominadores: os divisores da Visao Geral por mes e do periodo (linha ano_mes nulo), realizado.
--   · cab_media  = soma por fazenda de (saldo_inicial + saldo_final) / 2 do mes (zoot_mensal_cache, soma das categorias).
--   · ua_media   = soma por fazenda de cab_media x round(peso_total_final / saldo_final, 2) / 450, 2 casas — a conta da
--                  vw_zoot_fazenda_mensal e do useRebanhoOficial (fazenda com saldo_final zero nao tem UA no mes).
--   · ha_produtiva/pecuaria/agricultura = fechamento_area_snapshot DO MES (a area oficial; mes sem snapshot = sem area, nunca
--                  carregada de outro mes nem lida dos pastos — a regra da V2Home/PC-100).
--   · ha_plantado = agri_safra_area ativa das safras de agricultura ativas cujo periodo (data_inicio..data_fim) cobre o mes; com
--                  p_safra, so' essa safra. Fazenda pela do pasto.
--   · arrobas    = fn_pec_arrobas_produzidas (a MESMA fonte do DRE), soma dos kg / 30.
--   · PERIODO: estoque (cab, UA, areas) = media dos meses com valor > 0 (mediaIgnorandoZero, PR-RAZAO-ESTOQUE-01); fluxo (@) = soma.
--     Sem dado: nulo, nunca zero.
--   · SEGURANCA: SECURITY DEFINER com tenant_ok (senao 42501); EXECUTE so' para authenticated.

CREATE OR REPLACE FUNCTION public.fn_vg_denominadores(
  p_cliente uuid, p_de date, p_ate date, p_fazendas uuid[] DEFAULT NULL, p_safra uuid DEFAULT NULL)
RETURNS TABLE(ano_mes text, meses integer, cab_media numeric, ua_media numeric, ha_produtiva numeric, ha_pecuaria numeric,
              ha_agricultura numeric, ha_plantado numeric, arrobas numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_de text := to_char(p_de, 'YYYY-MM');
  v_ate text := to_char(p_ate, 'YYYY-MM');
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH mm AS (
    SELECT to_char(g, 'YYYY-MM') AS am, g::date AS ini, (g + interval '1 month - 1 day')::date AS fim
      FROM generate_series(date_trunc('month', p_de), date_trunc('month', p_ate), interval '1 month') g
  ), zf AS (
    SELECT z.fazenda_id, z.ano_mes, sum(z.saldo_inicial) AS si, sum(z.saldo_final) AS sf, sum(z.peso_total_final) AS pf
      FROM public.zoot_mensal_cache z
     WHERE z.cliente_id = p_cliente AND z.cenario = 'realizado' AND z.ano_mes BETWEEN v_de AND v_ate
       AND (p_fazendas IS NULL OR z.fazenda_id = ANY (p_fazendas))
     GROUP BY 1, 2
  ), zm AS (
    SELECT zf.ano_mes AS am, sum((zf.si + zf.sf) / 2.0) AS cab,
           sum(CASE WHEN zf.sf > 0 THEN round((zf.si + zf.sf) / 2.0 * round(zf.pf / zf.sf, 2) / 450.0, 2) END) AS ua
      FROM zf GROUP BY 1
  ), am_ AS (
    SELECT to_char(s.ano_mes, 'YYYY-MM') AS am, sum(s.area_produtiva_ha) AS hp, sum(s.area_pecuaria_ha) AS hpec,
           sum(s.area_agricultura_ha) AS hag
      FROM public.fechamento_area_snapshot s
     WHERE s.cliente_id = p_cliente AND s.ano_mes BETWEEN date_trunc('month', p_de)::date AND p_ate
       AND (p_fazendas IS NULL OR s.fazenda_id = ANY (p_fazendas))
     GROUP BY 1
  ), pl AS (
    SELECT mm.am, sum(a.area_plantada_ha) AS hpl
      FROM mm
      JOIN public.financeiro_safras sa ON sa.cliente_id = p_cliente AND sa.ativa AND sa.escopo_negocio = 'agricultura'
                                      AND (p_safra IS NULL OR sa.id = p_safra)
                                      AND sa.data_inicio <= mm.fim AND coalesce(sa.data_fim, mm.ini) >= mm.ini
      JOIN public.agri_safra_area a ON a.safra_id = sa.id AND a.ativo
      JOIN public.pastos pa ON pa.id = a.pasto_id
     WHERE (p_fazendas IS NULL OR pa.fazenda_id = ANY (p_fazendas))
     GROUP BY 1
  ), ar AS (
    SELECT x.ano_mes AS am, sum(x.producao_kg) AS kg
      FROM public.fn_pec_arrobas_produzidas(p_cliente, v_de, v_ate) x
     WHERE (p_fazendas IS NULL OR x.fazenda_id = ANY (p_fazendas))
     GROUP BY 1
  ), mes AS (
    SELECT mm.am, nullif(zm.cab, 0) AS cab, nullif(zm.ua, 0) AS ua, nullif(am_.hp, 0) AS hp, nullif(am_.hpec, 0) AS hpec,
           nullif(am_.hag, 0) AS hag, nullif(pl.hpl, 0) AS hpl, ar.kg
      FROM mm
      LEFT JOIN zm ON zm.am = mm.am
      LEFT JOIN am_ ON am_.am = mm.am
      LEFT JOIN pl ON pl.am = mm.am
      LEFT JOIN ar ON ar.am = mm.am
  )
  SELECT mes.am, 1, round(mes.cab, 2), mes.ua, mes.hp, mes.hpec, mes.hag, mes.hpl, round(mes.kg / 30.0, 2) FROM mes
  UNION ALL
  SELECT NULL, count(*)::int, round(avg(mes.cab), 2), round(avg(mes.ua), 2), round(avg(mes.hp), 2), round(avg(mes.hpec), 2),
         round(avg(mes.hag), 2), round(avg(mes.hpl), 2), round(sum(mes.kg) / 30.0, 2)
    FROM mes;
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_denominadores(uuid, date, date, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_denominadores(uuid, date, date, uuid[], uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_denominadores(uuid, date, date, uuid[], uuid) IS
  'FIN-VISAO-GERAL-01 PR 2: divisores da Visao Geral (cab, UA, ha produtiva/pecuaria/agricultura, ha plantado, @) por mes e do periodo (ano_mes nulo). Sem dado: nulo.';
