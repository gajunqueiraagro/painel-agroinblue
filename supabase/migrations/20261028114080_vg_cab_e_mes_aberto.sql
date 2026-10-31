-- VG-META-NO-MODO-01, regra final (Gabriel 31/10/2026 11:13; decisoes D1/D2 depois do relatorio visao-20261031-1120) — fn_vg_analise:
-- D1: R$/cab/mes em Saidas (raiz), no grupo (Custeio…), no Administrativo e na Pecuaria, todos com o MESMO divisor (o rebanho medio do mes
--     do recorte, `fn_vg_denominadores.cab_media`, o de hoje); Agricultura e Silvicultura seguem sem R$/cab. A tela nao faz conta.
-- D2: cada ponto da `serie` ganha `aberto` — o mes ABERTO pela autoridade do fechamento (P1): alguma fazenda do recorte com pasto ativo
--     sem o P1 'oficial' naquele mes. Nas unidades que dividem (fora de R$); em R$, nulo. A tela escreve "mes aberto" no title.
-- O resto: o da 114060 (o corpo de antes e' conferido pelo md5).
SET LOCAL lock_timeout = '2s';
DO $g$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_vg_analise(uuid, date, date, text, text, text, text[], text[], text, text, uuid[], uuid[], text, date, text[], boolean)'::regprocedure)
     IS DISTINCT FROM '9fb983d46c2899e29620b8061b930e07' THEN RAISE EXCEPTION 'fn_vg_analise: corpo de origem inesperado.'; END IF;
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
  v_e text[] := CASE WHEN cardinality(coalesce(p_foco, '{}')) >= 3 THEN (coalesce(p_foco, '{}'))[1:2] ELSE coalesce(p_foco, '{}') END;
  v_ini date := date_trunc('month', p_de)::date;
  v_k int;
  v_ord text[] := CASE WHEN p_lado = 'saida'
    THEN ARRAY['Custeio', 'Reposição de bovinos', 'Investimentos', 'Amortizações', 'Juros', 'Impostos e deduções', 'Dividendos', 'Outras saídas']
    ELSE ARRAY['Receitas operacionais', 'Entradas de capital e financiamento', 'Outras entradas'] END;
  -- VG-CUSTEIO-FIXO-VARIAVEL-01: so' o nivel de uma atividade de producao tem os centros em blocos
  v_blocos boolean := cardinality(v_e) = 2 AND v_e[2] IN ('pecuaria', 'agricultura', 'silvicultura');
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
    -- VG-META-NO-MODO-01 D1 (114080): R$/cab em Saidas (raiz), no grupo, no Administrativo e na Pecuaria — o mesmo divisor (o rebanho
    -- medio do recorte, fn_vg_denominadores.cab_media); Agricultura e Silvicultura sem R$/cab
    SELECT c.p, cardinality(c.p) AS prof,
           CASE WHEN cardinality(c.p) <= 1 AND p_atividade IS NULL THEN ARRAY['rs', 'rs_cab', 'rs_ha_prod']
                ELSE CASE coalesce(c.p[2], p_atividade)
                       WHEN 'pecuaria' THEN ARRAY['rs', 'rs_cab', 'rs_ua', 'rs_arroba', 'rs_ha_prod', 'rs_ha_pec']
                       WHEN 'agricultura' THEN ARRAY['rs', 'rs_ha_prod', 'rs_ha_agri', 'rs_ha_plant']
                       WHEN 'administrativo' THEN ARRAY['rs', 'rs_cab', 'rs_ha_prod']
                       ELSE ARRAY['rs', 'rs_ha_prod'] END END AS uv,
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
  ), cls AS (
    -- VG-CUSTEIO-FIXO-VARIAVEL-01: o bloco do centro pelo `grupo_custo` do Plano de Contas (as linhas do cliente e as globais): todas
    -- "Custo Variavel …" = variavel; todas "Custo Fixo …" = fixo; sem grupo ou misturado = sem
    SELECT pc.grupo_fluxo AS g, pc.escopo_negocio AS a, pc.centro_custo AS c,
           CASE WHEN bool_and(pc.grupo_custo ILIKE 'Custo Vari%') THEN 'variavel'
                WHEN bool_and(pc.grupo_custo ILIKE 'Custo Fixo%') THEN 'fixo' ELSE 'sem' END AS bloco
      FROM public.financeiro_plano_contas pc
     WHERE pc.cliente_id = p_cliente OR pc.cliente_id IS NULL
     GROUP BY 1, 2, 3
  ), j AS (
    SELECT l.p, l.prof, l.ordem, l.rs_win,
           jsonb_build_object('caminho', to_jsonb(l.p), 'rotulo', l.rotulo, 'grupo', l.p[1], 'valor', l.v, 'meta', l.mt, 'dif', l.dif,
             'pct', l.pct, 'razao', l.razao, 'qtd', coalesce(l.q, 0), 'unidade_valida', l.ok,
             'faixa', CASE WHEN l.razao IS NULL THEN NULL
                           WHEN p_lado = 'saida' THEN CASE WHEN l.razao < 0.9 THEN 'boa' WHEN l.razao < 1 THEN 'ideal' WHEN l.razao < 1.15 THEN 'risco' ELSE 'critica' END
                           ELSE CASE WHEN l.razao >= 1.1 THEN 'boa' WHEN l.razao >= 1 THEN 'ideal' WHEN l.razao >= 0.85 THEN 'risco' ELSE 'critica' END END)
             || CASE WHEN l.prof = 3 THEN jsonb_build_object('bloco', coalesce(k.bloco, 'sem')) ELSE '{}'::jsonb END AS o
      FROM lin l
      LEFT JOIN cls k ON l.prof = 3 AND k.g = l.p[1] AND k.a = l.p[2] AND k.c = l.p[3]
     WHERE l.tem OR l.p = '{}'
  ), filhos AS (
    SELECT pai.p AS pai, jsonb_agg(f.o ORDER BY f.ordem, f.rs_win DESC NULLS LAST, f.o ->> 'rotulo') AS lista
      FROM (SELECT v_n AS p UNION SELECT v_f UNION SELECT v_e UNION SELECT v_g[1:greatest(cardinality(v_g) - 1, 0)]) pai
      JOIN j f ON f.prof = cardinality(pai.p) + 1 AND f.p[1:cardinality(pai.p)] = pai.p
     GROUP BY pai.p
  ), subs AS (
    SELECT jsonb_agg(f.o || jsonb_build_object('centro', coalesce(f.p[3], 'Sem centro')) ORDER BY f.rs_win DESC NULLS LAST, f.o ->> 'rotulo') AS lista
      FROM j f WHERE f.prof = 4 AND cardinality(v_f) < 4 AND f.p[1:cardinality(v_f)] = v_f
  ), gs AS (
    -- P103: no ACUMULADO a coluna de cada mes e' a soma do inicio do periodo ate' ele (a mesma conta da tabela: rs_acc / d_acc) e a
    -- meta tambem (mt_acc / d_acc); a media nao vai (a coluna ja' e' a soma). Mes e media: como antes.
    SELECT c.i, c.am,
           CASE WHEN p_criterio = 'acumulado' THEN round(sum(c.re) OVER w / d.d_acc, 2) ELSE round(c.re / d.d_mes, 2) END AS re_u,
           CASE WHEN p_criterio = 'acumulado' THEN round(sum(c.pv) OVER w / d.d_acc, 2) ELSE round(c.pv / d.d_mes, 2) END AS pv_u,
           -- VG-META-NO-MODO-01 (114060): na MEDIA a meta do ponto e' a META MEDIA ACUMULADA ate' o mes (a mesma conta da tabela:
           -- mt_acc / k_media / d_acc), em todo mes que tem meta (vai ate' dez; a media do realizado segue parando em hoje)
           CASE WHEN p_criterio = 'acumulado' THEN round(sum(c.meta) OVER w / d.d_acc, 2)
                WHEN p_criterio = 'media' THEN round(sum(c.meta) OVER w / d.k_media / d.d_acc, 2)
                ELSE round(c.meta / d.d_mes, 2) END AS mt_u,
           CASE WHEN p_criterio = 'acumulado' THEN NULL
                WHEN c.am <= to_char(p_hoje, 'YYYY-MM') THEN round(sum(c.re + c.pv) OVER w / d.k_media / d.d_acc, 2) END AS md_u,
           CASE WHEN p_criterio = 'acumulado' THEN round(sum(c.re + c.pv) OVER w / d.d_acc, 2) ELSE round((c.re + c.pv) / d.d_mes, 2) END AS tot_u
      FROM cel c JOIN den d ON d.i = c.i
     WHERE c.p = v_g AND p_unidade = ANY (coalesce((SELECT n.uv FROM no_ n WHERE n.p = v_g), '{}'::text[]))
    WINDOW w AS (ORDER BY c.i ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  ), bs AS (
    -- VG-CUSTEIO-FIXO-VARIAVEL-01: os SUBTOTAIS dos blocos — a soma dos rs/meta dos centros (os nos do nivel 3 debaixo da atividade), e
    -- daqui a MESMA conta do `val`/`lin` (a divisao pelo denominador do mes escolhido e o arredondamento de cada no)
    SELECT coalesce(k.bloco, 'sem') AS bloco, count(*) FILTER (WHERE n.tem) AS centros,
           sum(n.rs_mes) AS rs_mes, sum(n.rs_acc) AS rs_acc, sum(n.mt_mes) AS mt_mes, sum(n.mt_acc) AS mt_acc, sum(n.q) AS q, bool_or(n.tem) AS tem
      FROM no_ n
      LEFT JOIN cls k ON k.g = n.p[1] AND k.a = n.p[2] AND k.c = n.p[3]
     WHERE v_blocos AND n.prof = 3 AND n.p[1:2] = v_e
     GROUP BY 1
  ), bv AS (
    SELECT b.bloco, b.centros, b.q, p_unidade = ANY (a.uv) AS ok,
           CASE WHEN NOT p_unidade = ANY (a.uv) THEN NULL
                WHEN p_criterio = 'mes' THEN round(b.rs_mes / dk.d_mes, 2)
                WHEN p_criterio = 'media' THEN round(b.rs_acc / dk.k_media / dk.d_acc, 2)
                ELSE round(b.rs_acc / dk.d_acc, 2) END AS v,
           CASE WHEN NOT p_unidade = ANY (a.uv) THEN NULL
                WHEN p_criterio = 'mes' THEN round(b.mt_mes / dk.d_mes, 2)
                WHEN p_criterio = 'media' THEN round(b.mt_acc / dk.k_media / dk.d_acc, 2)
                ELSE round(b.mt_acc / dk.d_acc, 2) END AS mt
      FROM bs b
      JOIN no_ a ON a.p = v_e
      CROSS JOIN (SELECT * FROM den WHERE den.i = v_k) dk
     WHERE b.tem
  ), bl AS (
    SELECT b.*, round(b.v - b.mt, 2) AS dif,
           CASE WHEN b.mt <> 0 THEN round((b.v - b.mt) / b.mt * 100, 1) END AS pct,
           CASE WHEN b.mt > 0 AND b.v IS NOT NULL THEN round(b.v / b.mt, 4) END AS razao
      FROM bv b
  ), ab AS (
    -- VG-META-NO-MODO-01 D2 (114080): o MES ABERTO pela autoridade do fechamento (P1, `_fn_status_pilares_fechamento`): aberto quando
    -- alguma fazenda do recorte com pasto ativo nao esta' 'oficial' no mes (a fazenda sem pasto nao tem rebanho e fica fora). So' nas
    -- unidades que dividem pelo rebanho/area do sistema; em R$, nulo.
    SELECT m.am, bool_or(coalesce(public._fn_status_pilares_fechamento(f.id, m.am) -> 'p1_mapa_pastos' ->> 'status', '') <> 'oficial') AS aberto
      FROM m
      JOIN public.fazendas f ON f.cliente_id = p_cliente AND (p_fazendas IS NULL OR f.id = ANY (p_fazendas))
     WHERE p_unidade <> 'rs' AND EXISTS (SELECT 1 FROM public.pastos pa WHERE pa.fazenda_id = f.id AND pa.ativo)
     GROUP BY m.am
  )
  SELECT jsonb_build_object(
    'lado', p_lado, 'mes', p_mes, 'criterio', p_criterio, 'unidade', p_unidade, 'meses_janela', CASE WHEN p_criterio = 'mes' THEN 1 ELSE v_k END,
    'periodo', jsonb_build_object('de', (SELECT min(m.am) FROM m), 'ate_mes', p_mes),
    'abas', coalesce((SELECT jsonb_agg(jsonb_build_object('grupo', j.p[1], 'rotulo', j.o ->> 'rotulo') ORDER BY j.ordem, j.p[1])
                        FROM j WHERE j.prof = 1), '[]'::jsonb),
    'unidades', (SELECT jsonb_agg(jsonb_build_object('id', u.id, 'rotulo', u.rot,
                   'valida', u.id = ANY (CASE WHEN cardinality(v_f) <= 1 AND p_atividade IS NULL THEN ARRAY['rs', 'rs_cab', 'rs_ha_prod']
                                         ELSE CASE coalesce(v_f[2], p_atividade)
                                           WHEN 'pecuaria' THEN ARRAY['rs', 'rs_cab', 'rs_ua', 'rs_arroba', 'rs_ha_prod', 'rs_ha_pec']
                                           WHEN 'agricultura' THEN ARRAY['rs', 'rs_ha_prod', 'rs_ha_agri', 'rs_ha_plant']
                                           WHEN 'administrativo' THEN ARRAY['rs', 'rs_cab', 'rs_ha_prod']
                                           ELSE ARRAY['rs', 'rs_ha_prod'] END END)) ORDER BY u.o)
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
    'tabela', jsonb_build_object('total', (SELECT j.o FROM j WHERE j.p = v_e), 'nivel', to_jsonb(v_e),
                                 'linhas', coalesce((SELECT f.lista FROM filhos f WHERE f.pai = v_e), '[]'::jsonb),
                                 -- VG-CUSTEIO-FIXO-VARIAVEL-01: os blocos na ordem do DRE (variavel, fixo, sem classificacao); fora do nivel de
                                 -- uma atividade de producao, nulo
                                 'blocos', CASE WHEN v_blocos THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
                                     'bloco', b.bloco,
                                     'rotulo', CASE b.bloco WHEN 'variavel' THEN 'Custo variável' WHEN 'fixo' THEN 'Custo fixo' ELSE 'Sem classificação' END,
                                     'centros', b.centros, 'valor', b.v, 'meta', b.mt, 'dif', b.dif, 'pct', b.pct, 'razao', b.razao,
                                     'qtd', coalesce(b.q, 0), 'unidade_valida', b.ok,
                                     'faixa', CASE WHEN b.razao IS NULL THEN NULL
                                                   WHEN p_lado = 'saida' THEN CASE WHEN b.razao < 0.9 THEN 'boa' WHEN b.razao < 1 THEN 'ideal' WHEN b.razao < 1.15 THEN 'risco' ELSE 'critica' END
                                                   ELSE CASE WHEN b.razao >= 1.1 THEN 'boa' WHEN b.razao >= 1 THEN 'ideal' WHEN b.razao >= 0.85 THEN 'risco' ELSE 'critica' END END)
                                     ORDER BY CASE b.bloco WHEN 'variavel' THEN 1 WHEN 'fixo' THEN 2 ELSE 3 END) FROM bl b), '[]'::jsonb) END),
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
                                  'media', gs.md_u, 'meta', gs.mt_u, 'aberto', (SELECT ab.aberto FROM ab WHERE ab.am = gs.am)) ORDER BY gs.i) FROM gs), '[]'::jsonb),
       'kpis', (SELECT jsonb_build_object(
                  'mes', a.tot_u, 'meta', a.mt_u,
                  'media', CASE WHEN p_criterio <> 'acumulado' THEN (SELECT round(n.rs_acc / d.k_media / d.d_acc, 2) FROM no_ n JOIN den d ON d.i = v_k WHERE n.p = v_g) END,
                  -- VG-META-NO-MODO-01: na MEDIA o vs meta e' media x meta media (a conta do `pct` da tabela); `meta` ja' e' a media (gs)
                  'vs_meta', CASE WHEN p_criterio = 'media' THEN (SELECT CASE WHEN a.mt_u <> 0 THEN round((round(n.rs_acc / d.k_media / d.d_acc, 2) - a.mt_u) / a.mt_u * 100, 1) END
                                                                   FROM no_ n JOIN den d ON d.i = v_k WHERE n.p = v_g)
                                  WHEN a.mt_u <> 0 THEN round((a.tot_u - a.mt_u) / a.mt_u * 100, 1) END,
                  'tendencia', CASE WHEN p_criterio <> 'acumulado' AND z.tot_u <> 0 THEN round((a.tot_u - z.tot_u) / abs(z.tot_u) * 100, 1) END)
                  FROM gs a LEFT JOIN gs z ON z.i = 1 WHERE a.i = v_k))
  ) INTO r;
  RETURN r;
END $function$;
