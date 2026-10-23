-- P90 (Gabriel 23/10/2026 11h05) — o seletor "mês · média · acumulado" do card, da grade e dos ampliados: a fn_vg_tela devolve, ao
-- lado dos `valores` do mes, as series do CRITERIO, prontas (a tela nao soma nem divide): `valores_acum` = a soma do inicio do periodo
-- ate' o mes; `valores_media` = essa soma / nº de meses do intervalo (SPEC §4: media = media do inicio do periodo ate' o mes escolhido;
-- acumulado = soma do mesmo intervalo); `pct_acum` = a parte de cada linha no total do lado nesse intervalo (a mesma na media). Vale
-- para as linhas de total, grupo, transferencia e o Resultado; as de SALDO sao posicao (nao se somam nem tiram media). Mesma
-- assinatura: sem DROP.

CREATE OR REPLACE FUNCTION public.fn_vg_tela(
  p_cliente uuid, p_de date, p_ate date, p_contas uuid[] DEFAULT NULL, p_fazendas uuid[] DEFAULT NULL, p_safra uuid DEFAULT NULL,
  p_atividade text DEFAULT NULL, p_hoje date DEFAULT CURRENT_DATE, p_status text[] DEFAULT NULL, p_incluir_vencidos boolean DEFAULT true)
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
  v_status text[] := public.fn_vg_status_validos(p_status);
  v_venc boolean := coalesce(p_incluir_vencidos, true);
  -- P83: saldo de fluxo de caixa existe SO' por conta (e na soma das contas) — nunca por fazenda, atividade ou safra
  v_sem_saldo boolean := p_fazendas IS NOT NULL OR p_atividade IS NOT NULL OR p_safra IS NOT NULL;
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
    SELECT * FROM public.fn_vg_serie(p_cliente, p_de, p_ate, p_contas, p_fazendas, p_safra, p_atividade, p_hoje, v_status, v_venc)
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
  ), cel0 AS (
    SELECT c.tipo, c.lado, c.grupo, c.centro, m.am, m.i, coalesce(n.v, 0) AS v, coalesce(n.vv, 0) AS vv
      FROM chaves c CROSS JOIN m
      LEFT JOIN nos n ON n.tipo = c.tipo AND n.lado = c.lado AND n.grupo = c.grupo AND n.centro = c.centro AND n.am = m.am
  ), cel AS (
    -- P90: o acumulado do inicio do periodo ate' o mes (a media e' ele / nº de meses)
    SELECT c.*, sum(c.v) OVER (PARTITION BY c.tipo, c.lado, c.grupo, c.centro ORDER BY c.i) AS vacc FROM cel0 c
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
           jsonb_agg(round(c.vacc, 2) ORDER BY c.i) AS valores_acum,
           jsonb_agg(round(c.vacc / c.i, 2) ORDER BY c.i) AS valores_media,
           jsonb_agg(CASE WHEN t.vacc <> 0 THEN round(c.vacc / t.vacc * 100, 1) END ORDER BY c.i) AS pct_acum,
           round(max(p.total), 2) AS total, round(max(p.total) / max(p.n), 2) AS media,
           CASE WHEN c.tipo <> 'total' AND max(pt.total) <> 0 THEN round(max(p.total) / max(pt.total) * 100, 1) END AS pct
      FROM cel c
      JOIN per p ON p.tipo = c.tipo AND p.lado = c.lado AND p.grupo = c.grupo AND p.centro = c.centro
      JOIN cel t ON t.tipo = 'total' AND t.lado = c.lado AND t.am = c.am
      JOIN per pt ON pt.tipo = 'total' AND pt.lado = c.lado
     GROUP BY 1, 2, 3, 4
  ), res AS (
    SELECT jsonb_agg(round(e.v - d.v, 2) ORDER BY e.i) AS valores, round(sum(e.v - d.v), 2) AS total,
           round(sum(e.v - d.v) / count(*), 2) AS media,
           jsonb_agg(round(e.vacc - d.vacc, 2) ORDER BY e.i) AS valores_acum,
           jsonb_agg(round((e.vacc - d.vacc) / e.i, 2) ORDER BY e.i) AS valores_media
      FROM cel e JOIN cel d ON d.tipo = 'total' AND d.lado = 'saida' AND d.am = e.am
     WHERE e.tipo = 'total' AND e.lado = 'entrada'
  ), sal AS (
    SELECT x.* FROM public.fn_vg_saldos(p_cliente, p_de, p_ate, p_contas, p_hoje, v_status, v_venc) x
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
      CASE WHEN v_sem_saldo THEN '[]'::jsonb ELSE
      jsonb_build_array(jsonb_build_object('chave', 'saldo_inicial', 'tipo', 'saldo', 'rotulo', 'Saldo inicial',
        'valores', (SELECT jsonb_agg(x.saldo_inicial ORDER BY x.ano_mes) FROM sal x),
        -- P83: no TOTAL, o saldo inicial do PERIODO (o do 1o mes)
        'total', (SELECT x.saldo_inicial FROM sal x ORDER BY x.ano_mes LIMIT 1))) END
      || coalesce((SELECT jsonb_agg(jsonb_build_object(
             'chave', l.lado || ':' || l.tipo || ':' || l.grupo || ':' || l.centro, 'tipo', l.tipo, 'lado', l.lado, 'grupo', nullif(l.grupo, ''),
             'rotulo', CASE WHEN l.tipo = 'total' THEN CASE WHEN l.lado = 'entrada' THEN 'ENTRADAS' ELSE 'SAÍDAS TOTAIS' END
                            WHEN l.tipo = 'transf' THEN l.centro ELSE l.grupo END,
             'valores', l.valores, 'vencidos', l.vencidos, 'pct_mes', l.pct_mes, 'vs_media', l.vs_media,
             'valores_acum', l.valores_acum, 'valores_media', l.valores_media, 'pct_acum', l.pct_acum,
             'total', l.total, 'media', l.media, 'pct', l.pct)
           ORDER BY l.lado, l.ordem, l.grupo) FROM lin l), '[]'::jsonb)
      -- P82: com o cartao FORA das contas escolhidas, o pagamento da fatura (transferencia, nunca saida) numa linha propria, so' quando ha'
      || coalesce((SELECT jsonb_build_array(jsonb_build_object('chave', 'cartao', 'tipo', 'cartao', 'rotulo', 'PAGAMENTO DE CARTÃO (transferência)',
             'valores', jsonb_agg(x.cartao ORDER BY x.ano_mes), 'total', round(sum(x.cartao), 2), 'media', round(avg(x.cartao), 2)))
           FROM sal x WHERE NOT v_sem_saldo HAVING bool_or(x.cartao <> 0)), '[]'::jsonb)
      || jsonb_build_array(
           (SELECT jsonb_build_object('chave', 'resultado', 'tipo', 'resultado', 'rotulo', 'Resultado no mês', 'valores', res.valores,
                   'total', res.total, 'media', res.media, 'valores_acum', res.valores_acum, 'valores_media', res.valores_media) FROM res))
      || CASE WHEN v_sem_saldo THEN '[]'::jsonb ELSE jsonb_build_array(
           jsonb_build_object('chave', 'saldo_final', 'tipo', 'saldo', 'rotulo', 'Saldo final · fluxo de caixa',
             'valores', (SELECT jsonb_agg(x.saldo_final ORDER BY x.ano_mes) FROM sal x),
             -- P83: no TOTAL, o saldo final do PERIODO (o do ultimo mes = o inicial do periodo + o resultado do periodo - o cartao)
             'total', (SELECT x.saldo_final FROM sal x ORDER BY x.ano_mes DESC LIMIT 1))) END,
    'grafico', (SELECT jsonb_object_agg(g.lado, jsonb_build_object('media_acumulada', g.media_acumulada, 'meta', g.meta)) FROM graf g),
    'conciliado_ate', CASE WHEN v_sem_saldo THEN NULL ELSE (SELECT max(x.conciliado_ate) FROM sal x) END,
    -- P70: o saldo das contas escolhidas na data do conciliado ate'
    'conciliado_saldo', CASE WHEN v_sem_saldo THEN NULL ELSE (SELECT c.saldo FROM public.fn_vg_conciliado(p_cliente, p_contas) c) END,
    'sem_saldo', v_sem_saldo,
    'status', to_jsonb(v_status),
    'incluir_vencidos', v_venc,
    'contas_sem_ancora', CASE WHEN v_sem_saldo THEN ARRAY[]::text[] ELSE coalesce((SELECT x.contas_sem_ancora FROM sal x LIMIT 1), ARRAY[]::text[]) END)
    INTO r;
  RETURN r;
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_tela(uuid, date, date, uuid[], uuid[], uuid, text, date, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_tela(uuid, date, date, uuid[], uuid[], uuid, text, date, text[], boolean) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_tela(uuid, date, date, uuid[], uuid[], uuid, text, date, text[], boolean) IS
  'FIN-VISAO-GERAL-01 PR 3: tudo o que a tela Visao Geral desenha (meses, linhas da grade com total/media/%, card, grafico, saldos), pronto. P79: p_status e p_incluir_vencidos repassados as series e aos saldos; ecoados em status/incluir_vencidos. P82: linha cartao (pagamento de fatura com o cartao fora das contas escolhidas: transferencia). P83: saldo so'' por conta (sem saldo com fazenda, atividade ou safra; sem_saldo); TOTAL dos saldos = inicial do 1o mes e final do ultimo. P70: conciliado_saldo (fn_vg_conciliado). P90: valores_acum, valores_media e pct_acum (o seletor mes/media/acumulado).';
