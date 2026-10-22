-- FIN-VISAO-GERAL-01 PR 2 — fn_vg_serie_unidade: a fn_vg_serie (mesmos nos, mesmos filtros) com o valor por UNIDADE e CRITERIO.
-- Os R$ sao os da fn_vg_serie; os divisores, os da fn_vg_denominadores. Nada e' recalculado aqui.
--
-- UNIDADES (p_unidade) e divisor D:  rs (sem divisor) · rs_cab (cab_media) · rs_ua (ua_media) · rs_ha_prod (ha_produtiva) ·
--   rs_ha_pec (ha_pecuaria) · rs_ha_agri (ha_agricultura) · rs_ha_plant (ha_plantado) · rs_arroba (arrobas).
-- CRITERIOS (p_criterio), para cada mes m da serie, k = meses de p_de ate' m, V = realizado (e, a parte, previsto):
--   · mes        V(m) / D(m)                                         -> R$/cab/mes, R$/ha no mes, R$/@ no mes
--   · acumulado  soma V(ate' m) / Dacc(m)                            -> R$/cab no periodo, R$/ha no periodo, R$/@ do periodo
--   · media      (soma V(ate' m) / k) / Dacc(m)                      -> media mensal (R$/cab/mes do periodo); em rs_arroba = acumulado
--   Dacc(m) = media dos D > 0 ate' m para estoque (cab, UA, areas: PR-RAZAO-ESTOQUE-01) e soma das @ ate' m para fluxo (@).
--   rs: mes = V(m), acumulado = soma V, media = soma V / k.  Sem divisor ou divisor zero: nulo (nunca zero).
-- UNIDADES VALIDAS por no' (unidades_validas; unidade fora da lista devolve nulo e unidade_valida = false). A atividade do no' e' a
-- dele ou, nos nos de cima (raiz/grupo), a do filtro p_atividade:
--   · pecuaria:    rs, rs_cab, rs_ua, rs_arroba, rs_ha_prod, rs_ha_pec
--   · agricultura: rs, rs_ha_prod, rs_ha_agri, rs_ha_plant
--   · demais (administrativo, silvicultura, no' misto): rs, rs_ha_prod
-- SEGURANCA: SECURITY DEFINER com tenant_ok (senao 42501), que a fn_vg_serie e a fn_vg_denominadores tambem conferem.

CREATE OR REPLACE FUNCTION public.fn_vg_serie_unidade(
  p_cliente uuid, p_de date, p_ate date, p_criterio text DEFAULT 'mes', p_unidade text DEFAULT 'rs',
  p_contas uuid[] DEFAULT NULL, p_fazendas uuid[] DEFAULT NULL, p_safra uuid DEFAULT NULL, p_atividade text DEFAULT NULL)
RETURNS TABLE(nivel text, lado text, grupo text, atividade text, centro text, subcentro text, ano_mes text,
              realizado numeric, previsto numeric, denominador numeric, valor_realizado numeric, valor_previsto numeric,
              unidade_valida boolean, unidades_validas text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_ini date := date_trunc('month', p_de)::date;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_criterio IS NULL OR p_criterio NOT IN ('mes', 'media', 'acumulado') THEN
    RAISE EXCEPTION 'Critério inválido: use mes, media ou acumulado.' USING ERRCODE = '22023';
  END IF;
  IF p_unidade IS NULL OR p_unidade NOT IN ('rs', 'rs_cab', 'rs_ua', 'rs_ha_prod', 'rs_ha_pec', 'rs_ha_agri', 'rs_ha_plant', 'rs_arroba') THEN
    RAISE EXCEPTION 'Unidade inválida.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH d AS (
    SELECT x.ano_mes AS am,
           CASE p_unidade WHEN 'rs_cab' THEN x.cab_media WHEN 'rs_ua' THEN x.ua_media WHEN 'rs_ha_prod' THEN x.ha_produtiva
                          WHEN 'rs_ha_pec' THEN x.ha_pecuaria WHEN 'rs_ha_agri' THEN x.ha_agricultura
                          WHEN 'rs_ha_plant' THEN x.ha_plantado WHEN 'rs_arroba' THEN x.arrobas END AS dm
      FROM public.fn_vg_denominadores(p_cliente, p_de, p_ate, p_fazendas, p_safra) x
     WHERE x.ano_mes IS NOT NULL
  ), dacc AS (
    SELECT d.am, d.dm,
           CASE WHEN p_unidade = 'rs_arroba' THEN sum(d.dm) OVER w
                ELSE avg(nullif(d.dm, 0)) OVER w END AS da
      FROM d WINDOW w AS (ORDER BY d.am ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  ), s AS (
    SELECT x.nivel AS nv, x.lado AS ld, x.grupo AS gr, x.atividade AS at, x.centro AS ce, x.subcentro AS sc, x.ano_mes AS am,
           x.realizado AS re, x.previsto AS pv,
           sum(x.realizado) OVER w AS re_acc, sum(x.previsto) OVER w AS pv_acc,
           ((left(x.ano_mes, 4)::int - extract(year FROM v_ini)::int) * 12
             + substr(x.ano_mes, 6, 2)::int - extract(month FROM v_ini)::int + 1) AS k,
           CASE coalesce(x.atividade, p_atividade)
             WHEN 'pecuaria' THEN ARRAY['rs', 'rs_cab', 'rs_ua', 'rs_arroba', 'rs_ha_prod', 'rs_ha_pec']
             WHEN 'agricultura' THEN ARRAY['rs', 'rs_ha_prod', 'rs_ha_agri', 'rs_ha_plant']
             ELSE ARRAY['rs', 'rs_ha_prod'] END AS uv
      FROM public.fn_vg_serie(p_cliente, p_de, p_ate, p_contas, p_fazendas, p_safra, p_atividade) x
    WINDOW w AS (PARTITION BY x.nivel, x.lado, x.grupo, x.atividade, x.centro, x.subcentro ORDER BY x.ano_mes
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  ), c AS (
    SELECT s.*, p_unidade = ANY (s.uv) AS ok,
           CASE WHEN p_unidade = 'rs' THEN 1::numeric
                WHEN p_criterio = 'mes' THEN nullif(dacc.dm, 0)
                ELSE nullif(dacc.da, 0) END AS den,
           CASE WHEN p_criterio = 'mes' THEN 1::numeric
                WHEN p_criterio = 'media' AND p_unidade <> 'rs_arroba' THEN s.k::numeric
                ELSE 1::numeric END AS div_k
      FROM s LEFT JOIN dacc ON dacc.am = s.am
  )
  SELECT c.nv, c.ld, c.gr, c.at, c.ce, c.sc, c.am, c.re, c.pv,
         CASE WHEN p_unidade = 'rs' THEN NULL ELSE c.den END,
         CASE WHEN c.ok THEN round((CASE WHEN p_criterio = 'mes' THEN c.re ELSE c.re_acc END) / c.div_k / c.den, 2) END,
         CASE WHEN c.ok THEN round((CASE WHEN p_criterio = 'mes' THEN c.pv ELSE c.pv_acc END) / c.div_k / c.den, 2) END,
         c.ok, c.uv
    FROM c;
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_serie_unidade(uuid, date, date, text, text, uuid[], uuid[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_serie_unidade(uuid, date, date, text, text, uuid[], uuid[], uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_serie_unidade(uuid, date, date, text, text, uuid[], uuid[], uuid, text) IS
  'FIN-VISAO-GERAL-01 PR 2: fn_vg_serie por unidade (R$, R$/cab, R$/UA, R$/ha produtiva/pecuaria/agricultura/plantado, R$/@) e criterio (mes, media, acumulado), com as unidades validas por no.';
