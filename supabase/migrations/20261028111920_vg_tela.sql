-- FIN-VISAO-GERAL-01 PR 3 — o que a tela "Visão Geral" desenha, pronto, do banco (a tela NUNCA soma nem divide — SPEC §7.4).
--
-- fn_vg_filtros(cliente): as contas (com `no_caixa` = a regra da fn_vg_saldos: ativa e cc/inv/permuta — o padrao do seletor), as
--   atividades que o cliente USA (escopo dos lancamentos dele, nada fixo) e as safras ativas.
-- fn_vg_tela(cliente, de, ate, contas, fazendas, safra, atividade, hoje): um jsonb com
--   · meses: am, previsto (depois do mes de hoje), vigente (o mes de hoje);
--   · linhas da grade, na ordem: SALDO INICIAL · ENTRADAS · grupos de entrada (com a linha "Transferências de outras contas" logo abaixo
--     do grupo dela) · SAÍDAS TOTAIS · grupos de saida · RESULTADO · SALDO FINAL. Cada linha: valores por mes (realizado + previsto, da
--     fn_vg_serie), vencidos por mes (previsto_vencido), pct_mes (% do total do lado no mes — o card), vs_media (% contra a media dos meses
--     realizados do periodo — o card), total, media (total / meses) e pct (total / total do lado — so' nos grupos). Saldos: da
--     fn_vg_saldos, sem total/media. Resultado = entradas - saidas do mes.
--     Grupo so' aparece se tem valor no periodo; "Sem classificação" sempre que houver (por ultimo no lado).
--   · grafico: media acumulada dos meses realizados (por lado; nula nos previstos) e a meta da raiz por mes (fn_vg_meta; nula sem meta).
--   · conciliado_ate e contas_sem_ancora (fn_vg_saldos).
-- SEGURANCA: SECURITY DEFINER com tenant_ok (senao 42501); EXECUTE so' para authenticated.

CREATE OR REPLACE FUNCTION public.fn_vg_filtros(p_cliente uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'contas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', coalesce(nullif(c.nome_exibicao, ''), c.nome_conta),
               'tipo', lower(coalesce(c.tipo_conta, '')), 'ativa', c.ativa,
               'no_caixa', c.ativa AND lower(coalesce(c.tipo_conta, '')) IN ('cc', 'inv', 'permuta'))
             ORDER BY NOT c.ativa, lower(coalesce(c.tipo_conta, '')), c.ordem_exibicao NULLS LAST, coalesce(nullif(c.nome_exibicao, ''), c.nome_conta))
        FROM public.financeiro_contas_bancarias c WHERE c.cliente_id = p_cliente), '[]'::jsonb),
    'atividades', coalesce((
      SELECT jsonb_agg(e ORDER BY array_position(ARRAY['pecuaria', 'agricultura', 'silvicultura', 'administrativo'], e) NULLS LAST, e)
        FROM (SELECT DISTINCT l.escopo_negocio AS e FROM public.financeiro_lancamentos_v2 l
               WHERE l.cliente_id = p_cliente AND l.escopo_negocio IS NOT NULL AND NOT l.cancelado) x), '[]'::jsonb),
    'safras', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome) ORDER BY s.data_inicio DESC NULLS LAST, s.nome)
        FROM public.financeiro_safras s WHERE s.cliente_id = p_cliente AND s.ativa), '[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.fn_vg_tela(
  p_cliente uuid, p_de date, p_ate date, p_contas uuid[] DEFAULT NULL, p_fazendas uuid[] DEFAULT NULL, p_safra uuid DEFAULT NULL,
  p_atividade text DEFAULT NULL, p_hoje date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_atual text := to_char(p_hoje, 'YYYY-MM');
  o_sai text[] := ARRAY['Custeio', 'Reposição de bovinos', 'Investimentos', 'Amortizações', 'Juros', 'Impostos e deduções', 'Dividendos',
                        'Outras saídas'];
  o_ent text[] := ARRAY['Receitas operacionais', 'Entradas de capital e financiamento', 'Outras entradas'];
  r jsonb;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de OR p_hoje IS NULL OR p_ate > (p_de + interval '36 months') THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;

  WITH m AS (
    SELECT to_char(g, 'YYYY-MM') AS am, (row_number() OVER (ORDER BY g))::int AS i
      FROM generate_series(date_trunc('month', p_de), date_trunc('month', p_ate), interval '1 month') g
  ), s AS (
    SELECT * FROM public.fn_vg_serie(p_cliente, p_de, p_ate, p_contas, p_fazendas, p_safra, p_atividade, p_hoje)
  ), nos AS (
    SELECT 'total'::text AS tipo, x.lado, ''::text AS grupo, ''::text AS centro, x.ano_mes AS am,
           x.realizado + x.previsto AS v, x.previsto_vencido AS vv FROM s x WHERE x.nivel = 'raiz'
    UNION ALL
    SELECT 'grupo', x.lado, x.grupo, '', x.ano_mes, x.realizado + x.previsto, x.previsto_vencido FROM s x WHERE x.nivel = 'grupo'
    UNION ALL
    SELECT 'transf', x.lado, x.grupo, x.centro, x.ano_mes, x.realizado + x.previsto, x.previsto_vencido
      FROM s x WHERE x.nivel = 'centro' AND x.atividade IS NULL AND x.centro LIKE 'Transferências%'
  ), chaves AS (
    SELECT DISTINCT n.tipo, n.lado, n.grupo, n.centro FROM nos n WHERE n.v <> 0 AND n.tipo <> 'total'
    UNION SELECT 'total', l, '', '' FROM unnest(ARRAY['entrada', 'saida']) l
  ), cel AS (
    SELECT c.tipo, c.lado, c.grupo, c.centro, m.am, m.i, coalesce(n.v, 0) AS v, coalesce(n.vv, 0) AS vv
      FROM chaves c CROSS JOIN m
      LEFT JOIN nos n ON n.tipo = c.tipo AND n.lado = c.lado AND n.grupo = c.grupo AND n.centro = c.centro AND n.am = m.am
  ), per AS (
    SELECT c.tipo, c.lado, c.grupo, c.centro, sum(c.v) AS total, count(*) AS n, avg(c.v) FILTER (WHERE c.am <= v_atual) AS md
      FROM cel c GROUP BY 1, 2, 3, 4
  ), lin AS (
    SELECT c.tipo, c.lado, c.grupo, c.centro,
           CASE WHEN c.tipo = 'total' THEN 0
                WHEN c.grupo = 'Sem classificação' THEN 99
                ELSE coalesce(array_position(CASE WHEN c.lado = 'saida' THEN o_sai ELSE o_ent END, c.grupo), 50) END
             + CASE WHEN c.tipo = 'transf' THEN 0.5 ELSE 0 END AS ordem,
           jsonb_agg(round(c.v, 2) ORDER BY c.i) AS valores,
           jsonb_agg(round(c.vv, 2) ORDER BY c.i) AS vencidos,
           jsonb_agg(CASE WHEN t.v <> 0 THEN round(c.v / t.v * 100, 1) END ORDER BY c.i) AS pct_mes,
           jsonb_agg(CASE WHEN p.md <> 0 THEN round((c.v - p.md) / abs(p.md) * 100, 1) END ORDER BY c.i) AS vs_media,
           round(max(p.total), 2) AS total, round(max(p.total) / max(p.n), 2) AS media,
           CASE WHEN c.tipo <> 'total' AND max(pt.total) <> 0 THEN round(max(p.total) / max(pt.total) * 100, 1) END AS pct
      FROM cel c
      JOIN per p ON p.tipo = c.tipo AND p.lado = c.lado AND p.grupo = c.grupo AND p.centro = c.centro
      JOIN cel t ON t.tipo = 'total' AND t.lado = c.lado AND t.am = c.am
      JOIN per pt ON pt.tipo = 'total' AND pt.lado = c.lado
     GROUP BY 1, 2, 3, 4
  ), res AS (
    SELECT jsonb_agg(round(e.v - d.v, 2) ORDER BY e.i) AS valores, round(sum(e.v - d.v), 2) AS total,
           round(sum(e.v - d.v) / count(*), 2) AS media
      FROM cel e JOIN cel d ON d.tipo = 'total' AND d.lado = 'saida' AND d.am = e.am
     WHERE e.tipo = 'total' AND e.lado = 'entrada'
  ), sal AS (
    SELECT x.* FROM public.fn_vg_saldos(p_cliente, p_de, p_ate, p_contas, p_hoje) x
  ), mt AS (
    SELECT x.lado, x.ano_mes, x.meta FROM public.fn_vg_meta(p_cliente, p_de, p_ate, p_fazendas, p_atividade) x WHERE x.nivel = 'raiz'
  ), graf AS (
    SELECT c.lado,
           jsonb_agg(CASE WHEN c.am <= v_atual THEN round(c.md_acc, 2) END ORDER BY c.i) AS media_acumulada,
           jsonb_agg(mt.meta ORDER BY c.i) AS meta
      FROM (SELECT x.*, avg(x.v) FILTER (WHERE x.am <= v_atual) OVER (PARTITION BY x.lado ORDER BY x.i) AS md_acc
              FROM cel x WHERE x.tipo = 'total') c
      LEFT JOIN mt ON mt.lado = c.lado AND mt.ano_mes = c.am
     GROUP BY c.lado
  )
  SELECT jsonb_build_object(
    'mes_atual', v_atual,
    'meses', (SELECT jsonb_agg(jsonb_build_object('am', m.am, 'previsto', m.am > v_atual, 'vigente', m.am = v_atual) ORDER BY m.i) FROM m),
    'linhas',
      jsonb_build_array(jsonb_build_object('chave', 'saldo_inicial', 'tipo', 'saldo', 'rotulo', 'SALDO INICIAL',
        'valores', (SELECT jsonb_agg(x.saldo_inicial ORDER BY x.ano_mes) FROM sal x)))
      || coalesce((SELECT jsonb_agg(jsonb_build_object(
             'chave', l.lado || ':' || l.tipo || ':' || l.grupo || ':' || l.centro, 'tipo', l.tipo, 'lado', l.lado, 'grupo', nullif(l.grupo, ''),
             'rotulo', CASE WHEN l.tipo = 'total' THEN CASE WHEN l.lado = 'entrada' THEN 'ENTRADAS' ELSE 'SAÍDAS TOTAIS' END
                            WHEN l.tipo = 'transf' THEN l.centro ELSE l.grupo END,
             'valores', l.valores, 'vencidos', l.vencidos, 'pct_mes', l.pct_mes, 'vs_media', l.vs_media,
             'total', l.total, 'media', l.media, 'pct', l.pct)
           ORDER BY l.lado, l.ordem, l.grupo) FROM lin l), '[]'::jsonb)
      || jsonb_build_array(
           (SELECT jsonb_build_object('chave', 'resultado', 'tipo', 'resultado', 'rotulo', 'RESULTADO', 'valores', res.valores,
                   'total', res.total, 'media', res.media) FROM res),
           jsonb_build_object('chave', 'saldo_final', 'tipo', 'saldo', 'rotulo', 'SALDO FINAL',
             'valores', (SELECT jsonb_agg(x.saldo_final ORDER BY x.ano_mes) FROM sal x))),
    'grafico', (SELECT jsonb_object_agg(g.lado, jsonb_build_object('media_acumulada', g.media_acumulada, 'meta', g.meta)) FROM graf g),
    'conciliado_ate', (SELECT max(x.conciliado_ate) FROM sal x),
    'contas_sem_ancora', coalesce((SELECT x.contas_sem_ancora FROM sal x LIMIT 1), ARRAY[]::text[]))
    INTO r;
  RETURN r;
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_filtros(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_filtros(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_vg_tela(uuid, date, date, uuid[], uuid[], uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_tela(uuid, date, date, uuid[], uuid[], uuid, text, date) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_tela(uuid, date, date, uuid[], uuid[], uuid, text, date) IS
  'FIN-VISAO-GERAL-01 PR 3: tudo o que a tela Visao Geral desenha (meses, linhas da grade com total/media/%, card, grafico, saldos), pronto.';
