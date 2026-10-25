-- P100 (Gabriel 24/10/2026) — fn_vg_analise: a tabela da direita do modal (`foco.linhas`) passa a ser SEMPRE os SUBCENTROS do item
-- (todos os do nivel 4 abaixo do foco, com 'centro'; maior valor primeiro) — nao mais os filhos, que repetiam a tabela da esquerda.
-- O item do grafico pode ser um desses subcentros (o caminho mostra a cadeia inteira) e anda pela ordem da tabela (‹ ›). O resto da
-- saida e' o da 111942 (o corpo de antes e' conferido pelo md5). Prova: vg_analise_subcentros_test.sql (soma dos subcentros = total).
-- Os comentarios de dentro do corpo estao na 111942 (aqui o corpo vai sem eles; so' os tres trechos do P100 mudam).
SET LOCAL lock_timeout = '2s';
DO $g$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_vg_analise(uuid, date, date, text, text, text, text[], text[], text, text, uuid[], uuid[], text, date, text[], boolean)'::regprocedure)
     IS DISTINCT FROM '908a1f1b7fce5164a5e622f7d0d3516a' THEN RAISE EXCEPTION 'fn_vg_analise: corpo de origem inesperado.'; END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.fn_vg_analise(
  p_cliente uuid, p_de date, p_ate date, p_mes text, p_lado text,
  p_aba text DEFAULT NULL, p_foco text[] DEFAULT '{}', p_grafico text[] DEFAULT NULL,
  p_criterio text DEFAULT 'mes', p_unidade text DEFAULT 'rs',
  p_contas uuid[] DEFAULT NULL, p_fazendas uuid[] DEFAULT NULL, p_atividade text DEFAULT NULL,
  p_hoje date DEFAULT CURRENT_DATE, p_status text[] DEFAULT NULL, p_incluir_vencidos boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_n text[] := CASE WHEN p_aba IS NULL THEN '{}'::text[] ELSE ARRAY[p_aba] END;
  v_f text[] := coalesce(p_foco, '{}');
  v_g text[] := coalesce(p_grafico, coalesce(p_foco, '{}'));
  v_ini date := date_trunc('month', p_de)::date;
  v_k int;
  v_ord text[] := CASE WHEN p_lado = 'saida'
    THEN ARRAY['Custeio', 'Reposição de bovinos', 'Investimentos', 'Amortizações', 'Juros', 'Impostos e deduções', 'Dividendos', 'Outras saídas']
    ELSE ARRAY['Receitas operacionais', 'Entradas de capital e financiamento', 'Outras entradas'] END;
  r jsonb;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de OR p_hoje IS NULL OR p_ate > (p_de + interval '36 months')
     OR p_mes IS NULL OR p_mes < to_char(p_de, 'YYYY-MM') OR p_mes > to_char(p_ate, 'YYYY-MM') THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_lado IS NULL OR p_lado NOT IN ('entrada', 'saida') THEN RAISE EXCEPTION 'Lado inválido.' USING ERRCODE = '22023'; END IF;
  IF p_criterio IS NULL OR p_criterio NOT IN ('mes', 'media', 'acumulado') THEN
    RAISE EXCEPTION 'Critério inválido: use mes, media ou acumulado.' USING ERRCODE = '22023';
  END IF;
  IF p_unidade IS NULL OR p_unidade NOT IN ('rs', 'rs_cab', 'rs_ua', 'rs_ha_prod', 'rs_ha_pec', 'rs_ha_agri', 'rs_ha_plant', 'rs_arroba') THEN
    RAISE EXCEPTION 'Unidade inválida.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_f) > 4 OR v_f[1:cardinality(v_n)] IS DISTINCT FROM v_n
     OR NOT (v_g = v_f OR (cardinality(v_g) IN (cardinality(v_f) + 1, 4) AND cardinality(v_g) > cardinality(v_f)
                           AND v_g[1:cardinality(v_f)] = v_f)) THEN
    RAISE EXCEPTION 'Caminho inválido.' USING ERRCODE = '22023';
  END IF;
  v_k := (left(p_mes, 4)::int - extract(year FROM v_ini)::int) * 12 + substr(p_mes, 6, 2)::int - extract(month FROM v_ini)::int + 1;

  WITH m AS (
    SELECT to_char(g, 'YYYY-MM') AS am, (row_number() OVER (ORDER BY g))::int AS i
      FROM generate_series(v_ini, date_trunc('month', p_ate), interval '1 month') g
  ), dn AS (
    SELECT x.ano_mes AS am,
           CASE p_unidade WHEN 'rs_cab' THEN x.cab_media WHEN 'rs_ua' THEN x.ua_media WHEN 'rs_ha_prod' THEN x.ha_produtiva
                          WHEN 'rs_ha_pec' THEN x.ha_pecuaria WHEN 'rs_ha_agri' THEN x.ha_agricultura
                          WHEN 'rs_ha_plant' THEN x.ha_plantado WHEN 'rs_arroba' THEN x.arrobas END AS dm
      FROM public.fn_vg_denominadores(p_cliente, p_de, p_ate, p_fazendas, NULL) x
     WHERE x.ano_mes IS NOT NULL AND p_unidade <> 'rs'
  ), den AS (
    SELECT m.am, m.i,
           CASE WHEN p_unidade = 'rs' THEN 1::numeric ELSE nullif(dn.dm, 0) END AS d_mes,
           CASE WHEN p_unidade = 'rs' THEN 1::numeric
                WHEN p_unidade = 'rs_arroba' THEN nullif(sum(dn.dm) OVER w, 0)
                ELSE nullif(avg(nullif(dn.dm, 0)) OVER w, 0) END AS d_acc,
           CASE WHEN p_unidade = 'rs_arroba' THEN 1 ELSE m.i END AS k_media
      FROM m LEFT JOIN dn ON dn.am = m.am
    WINDOW w AS (ORDER BY m.i ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  ), s AS (
    SELECT (ARRAY[x.grupo, x.atividade, x.centro, x.subcentro])[1:CASE x.nivel WHEN 'raiz' THEN 0 WHEN 'grupo' THEN 1 WHEN 'atividade' THEN 2
                                                                  WHEN 'centro' THEN 3 ELSE 4 END] AS p,
           x.ano_mes AS am, x.realizado AS re, x.previsto AS pv, x.qtd_lancamentos AS q
      FROM public.fn_vg_serie(p_cliente, p_de, p_ate, p_contas, p_fazendas, NULL, p_atividade, p_hoje, p_status, p_incluir_vencidos) x
     WHERE x.lado = p_lado
  ), mt AS (
    SELECT (ARRAY[x.grupo, x.atividade, x.centro, x.subcentro])[1:CASE x.nivel WHEN 'raiz' THEN 0 WHEN 'grupo' THEN 1 WHEN 'atividade' THEN 2
                                                                  WHEN 'centro' THEN 3 ELSE 4 END] AS p,
           x.ano_mes AS am, x.meta
      FROM public.fn_vg_meta(p_cliente, p_de, p_ate, p_fazendas, p_atividade) x
     WHERE x.lado = p_lado
  ), nos AS (
    SELECT DISTINCT p FROM s UNION SELECT p FROM mt UNION SELECT '{}'::text[]
  ), cel AS (
    SELECT n.p, m.am, m.i, coalesce(s.re, 0) AS re, coalesce(s.pv, 0) AS pv, coalesce(s.q, 0) AS q, mt.meta
      FROM nos n CROSS JOIN m
      LEFT JOIN s ON s.p = n.p AND s.am = m.am
      LEFT JOIN mt ON mt.p = n.p AND mt.am = m.am
  ), no_ AS (
    SELECT c.p, cardinality(c.p) AS prof,
           CASE coalesce(c.p[2], p_atividade)
             WHEN 'pecuaria' THEN ARRAY['rs', 'rs_cab', 'rs_ua', 'rs_arroba', 'rs_ha_prod', 'rs_ha_pec']
             WHEN 'agricultura' THEN ARRAY['rs', 'rs_ha_prod', 'rs_ha_agri', 'rs_ha_plant']
             ELSE ARRAY['rs', 'rs_ha_prod'] END AS uv,
           sum(c.re + c.pv) FILTER (WHERE c.i = v_k) AS rs_mes,
           sum(c.re + c.pv) FILTER (WHERE c.i <= v_k) AS rs_acc,
           sum(c.meta) FILTER (WHERE c.i = v_k) AS mt_mes,
           sum(c.meta) FILTER (WHERE c.i <= v_k) AS mt_acc,
           sum(c.q) FILTER (WHERE CASE WHEN p_criterio = 'mes' THEN c.i = v_k ELSE c.i <= v_k END) AS q,
           bool_or(c.re + c.pv <> 0 OR c.meta IS NOT NULL) AS tem
      FROM cel c GROUP BY c.p
  ), val AS (
    SELECT n.*, p_unidade = ANY (n.uv) AS ok,
           CASE WHEN p_criterio = 'mes' THEN n.rs_mes ELSE n.rs_acc END AS rs_win,
           CASE WHEN NOT p_unidade = ANY (n.uv) THEN NULL
                WHEN p_criterio = 'mes' THEN round(n.rs_mes / dk.d_mes, 2)
                WHEN p_criterio = 'media' THEN round(n.rs_acc / dk.k_media / dk.d_acc, 2)
                ELSE round(n.rs_acc / dk.d_acc, 2) END AS v,
           CASE WHEN NOT p_unidade = ANY (n.uv) THEN NULL
                WHEN p_criterio = 'mes' THEN round(n.mt_mes / dk.d_mes, 2)
                WHEN p_criterio = 'media' THEN round(n.mt_acc / dk.k_media / dk.d_acc, 2)
                ELSE round(n.mt_acc / dk.d_acc, 2) END AS mt
      FROM no_ n CROSS JOIN (SELECT * FROM den WHERE den.i = v_k) dk
  ), lin AS (
    SELECT v.*, round(v.v - v.mt, 2) AS dif,
           CASE WHEN v.mt <> 0 THEN round((v.v - v.mt) / v.mt * 100, 1) END AS pct,
           CASE WHEN v.mt > 0 AND v.v IS NOT NULL THEN round(v.v / v.mt, 4) END AS razao,
           CASE WHEN v.p = '{}' THEN CASE WHEN p_lado = 'saida' THEN 'Saídas' ELSE 'Entradas' END
                WHEN v.prof = 2 THEN coalesce(CASE v.p[2] WHEN 'pecuaria' THEN 'Pecuária' WHEN 'agricultura' THEN 'Agricultura'
                                                          WHEN 'silvicultura' THEN 'Silvicultura' WHEN 'administrativo' THEN 'Administrativo'
                                                          WHEN 'cana' THEN 'Cana' ELSE initcap(v.p[2]) END, 'Sem atividade')
                WHEN v.prof = 3 THEN coalesce(v.p[3], 'Sem centro')
                WHEN v.prof = 4 THEN coalesce(v.p[4], 'Sem subcentro')
                ELSE v.p[1] END AS rotulo,
           CASE WHEN v.prof = 1 THEN coalesce(array_position(v_ord, v.p[1]), CASE WHEN v.p[1] = 'Sem classificação' THEN 99 ELSE 50 END) ELSE 0 END AS ordem
      FROM val v
  ), j AS (
    SELECT l.p, l.prof, l.ordem, l.rs_win,
           jsonb_build_object('caminho', to_jsonb(l.p), 'rotulo', l.rotulo, 'grupo', l.p[1], 'valor', l.v, 'meta', l.mt, 'dif', l.dif,
             'pct', l.pct, 'razao', l.razao, 'qtd', coalesce(l.q, 0), 'unidade_valida', l.ok,
             'faixa', CASE WHEN l.razao IS NULL THEN NULL
                           WHEN p_lado = 'saida' THEN CASE WHEN l.razao < 0.9 THEN 'boa' WHEN l.razao < 1 THEN 'ideal' WHEN l.razao < 1.15 THEN 'risco' ELSE 'critica' END
                           ELSE CASE WHEN l.razao >= 1.1 THEN 'boa' WHEN l.razao >= 1 THEN 'ideal' WHEN l.razao >= 0.85 THEN 'risco' ELSE 'critica' END END) AS o
      FROM lin l WHERE l.tem OR l.p = '{}'
  ), filhos AS (
    SELECT pai.p AS pai, jsonb_agg(f.o ORDER BY f.ordem, f.rs_win DESC NULLS LAST, f.o ->> 'rotulo') AS lista
      FROM (SELECT v_n AS p UNION SELECT v_f UNION SELECT v_g[1:greatest(cardinality(v_g) - 1, 0)]) pai
      JOIN j f ON f.prof = cardinality(pai.p) + 1 AND f.p[1:cardinality(pai.p)] = pai.p
     GROUP BY pai.p
  ), subs AS (
    SELECT jsonb_agg(f.o || jsonb_build_object('centro', coalesce(f.p[3], 'Sem centro')) ORDER BY f.rs_win DESC NULLS LAST, f.o ->> 'rotulo') AS lista
      FROM j f WHERE f.prof = 4 AND cardinality(v_f) < 4 AND f.p[1:cardinality(v_f)] = v_f
  ), gs AS (
    SELECT c.i, c.am,
           round(c.re / d.d_mes, 2) AS re_u, round(c.pv / d.d_mes, 2) AS pv_u,
           round(c.meta / d.d_mes, 2) AS mt_u,
           CASE WHEN c.am <= to_char(p_hoje, 'YYYY-MM') THEN round(sum(c.re + c.pv) OVER w / d.k_media / d.d_acc, 2) END AS md_u,
           round((c.re + c.pv) / d.d_mes, 2) AS tot_u
      FROM cel c JOIN den d ON d.i = c.i
     WHERE c.p = v_g AND p_unidade = ANY (coalesce((SELECT n.uv FROM no_ n WHERE n.p = v_g), '{}'::text[]))
    WINDOW w AS (ORDER BY c.i ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  )
  SELECT jsonb_build_object(
    'lado', p_lado, 'mes', p_mes, 'criterio', p_criterio, 'unidade', p_unidade, 'meses_janela', CASE WHEN p_criterio = 'mes' THEN 1 ELSE v_k END,
    'periodo', jsonb_build_object('de', (SELECT min(m.am) FROM m), 'ate_mes', p_mes),
    'abas', coalesce((SELECT jsonb_agg(jsonb_build_object('grupo', j.p[1], 'rotulo', j.o ->> 'rotulo') ORDER BY j.ordem, j.p[1])
                        FROM j WHERE j.prof = 1), '[]'::jsonb),
    'unidades', (SELECT jsonb_agg(jsonb_build_object('id', u.id, 'rotulo', u.rot,
                   'valida', u.id = ANY (CASE coalesce(v_f[2], p_atividade)
                                           WHEN 'pecuaria' THEN ARRAY['rs', 'rs_cab', 'rs_ua', 'rs_arroba', 'rs_ha_prod', 'rs_ha_pec']
                                           WHEN 'agricultura' THEN ARRAY['rs', 'rs_ha_prod', 'rs_ha_agri', 'rs_ha_plant']
                                           ELSE ARRAY['rs', 'rs_ha_prod'] END)) ORDER BY u.o)
                   FROM (VALUES (1, 'rs', 'R$'), (2, 'rs_cab', 'R$/cab/mês'), (3, 'rs_ua', 'R$/UA/mês'), (4, 'rs_arroba', 'R$/@'),
                                (5, 'rs_ha_prod', 'R$/ha produtiva'), (6, 'rs_ha_pec', 'R$/ha pecuária'), (7, 'rs_ha_agri', 'R$/ha agricultura'),
                                (8, 'rs_ha_plant', 'R$/ha plantado')) u(o, id, rot)),
    'resumo', (SELECT j.o || jsonb_build_object(
                 'valor_rs', round(j.rs_win, 2),
                 'pct_da_raiz', (SELECT CASE WHEN r0.rs_win <> 0 THEN round(j.rs_win / r0.rs_win * 100, 1) END FROM j r0 WHERE r0.p = '{}'),
                 'fatias', coalesce((SELECT jsonb_agg(jsonb_build_object('caminho', f.p, 'rotulo', f.o ->> 'rotulo', 'grupo', f.p[1],
                                       'pct', CASE WHEN j.rs_win <> 0 THEN round(f.rs_win / j.rs_win * 100, 1) END)
                                       ORDER BY f.ordem, f.rs_win DESC NULLS LAST)
                                     FROM j f WHERE f.prof = cardinality(v_n) + 1 AND f.p[1:cardinality(v_n)] = v_n AND f.rs_win > 0), '[]'::jsonb))
                 FROM j WHERE j.p = v_n),
    'tabela', jsonb_build_object('total', (SELECT j.o FROM j WHERE j.p = v_n),
                                 'linhas', coalesce((SELECT f.lista FROM filhos f WHERE f.pai = v_n), '[]'::jsonb)),
    'foco', jsonb_build_object('total', (SELECT j.o FROM j WHERE j.p = v_f),
                               'linhas', coalesce((SELECT subs.lista FROM subs), '[]'::jsonb)),
    'grafico', jsonb_build_object(
       'item', (SELECT j.o FROM j WHERE j.p = v_g),
       'caminho', (SELECT jsonb_agg(jsonb_build_object('caminho', l.p, 'rotulo', l.rotulo) ORDER BY l.prof)
                     FROM lin l WHERE l.p = v_g[1:l.prof]),
       'irmaos', CASE WHEN cardinality(v_g) = 0 THEN '[]'::jsonb
                 WHEN cardinality(v_g) = 4 AND cardinality(v_g) > cardinality(v_f)
                   THEN coalesce((SELECT jsonb_agg(x -> 'caminho') FROM subs, jsonb_array_elements(subs.lista) x), '[]'::jsonb) ELSE
                   coalesce((SELECT jsonb_agg(x -> 'caminho') FROM filhos f, jsonb_array_elements(f.lista) x
                              WHERE f.pai = v_g[1:cardinality(v_g) - 1]), '[]'::jsonb) END,
       'serie', coalesce((SELECT jsonb_agg(jsonb_build_object('am', gs.am, 'realizado', gs.re_u, 'previsto', gs.pv_u, 'total', gs.tot_u,
                                  'media', gs.md_u, 'meta', gs.mt_u) ORDER BY gs.i) FROM gs), '[]'::jsonb),
       'kpis', (SELECT jsonb_build_object(
                  'mes', a.tot_u,
                  'media', (SELECT round(n.rs_acc / d.k_media / d.d_acc, 2) FROM no_ n JOIN den d ON d.i = v_k WHERE n.p = v_g),
                  'vs_meta', CASE WHEN a.mt_u <> 0 THEN round((a.tot_u - a.mt_u) / a.mt_u * 100, 1) END,
                  'tendencia', CASE WHEN z.tot_u <> 0 THEN round((a.tot_u - z.tot_u) / abs(z.tot_u) * 100, 1) END)
                  FROM gs a LEFT JOIN gs z ON z.i = 1 WHERE a.i = v_k))
  ) INTO r;
  RETURN r;
END $function$;
