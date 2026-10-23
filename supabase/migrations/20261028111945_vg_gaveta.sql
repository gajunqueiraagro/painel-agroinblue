-- FIN-VISAO-GERAL-01 PR 5 (SPEC §5, §7) — fn_vg_gaveta: TUDO o que a GAVETA DE LANCAMENTOS desenha, pronto (a tela nunca soma).
-- Le as linhas da fn_vg_partes (111944: a mesma fonte da fn_vg_serie, sobre a qual a fn_vg_analise soma), entao o total da gaveta e'
-- o valor do no' no modal — o teste prova em todo no' com lancamentos. Mesmo recorte do modal: regime de caixa, contas, fazenda,
-- atividade, status da tela e vencidos (vencido = vencimento antes de hoje, no mes de hoje).
--   p_caminho  o no' ([grupo, atividade, centro, subcentro] ate' a profundidade dele; nulos vao como null); '{}' = a raiz do lado.
--   p_mes / p_criterio  a JANELA: mes = so' o mes escolhido; media e acumulado = do inicio do periodo ate' o mes (em R$, a soma).
--   p_pagina / p_por_pagina  a pagina da lista (ate' 500 por pagina) — o total, os indicadores e o resumo sao do no' inteiro.
-- Devolve: caminho (do topo ao no', clicavel), irmaos (os atalhos), folha, qtd, total, medio, resumo (4: por favorecido no
-- subcentro, maiores filhos acima) e as linhas — no subcentro os lancamentos (chave "id" ou "id#2" da parte, lancamento_id, data,
-- favorecido, descricao, conta, valor da parte, valor do lancamento, status), acima os filhos (clique desce).
-- SEGURANCA: SECURITY DEFINER com tenant_ok (pela fn_vg_partes; senao 42501); EXECUTE so' para authenticated.

CREATE OR REPLACE FUNCTION public.fn_vg_rotulo_no(p_caminho text[], p_lado text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE coalesce(cardinality(p_caminho), 0)
           WHEN 0 THEN CASE WHEN p_lado = 'saida' THEN 'Saídas' ELSE 'Entradas' END
           WHEN 1 THEN p_caminho[1]
           WHEN 2 THEN coalesce(CASE p_caminho[2] WHEN 'pecuaria' THEN 'Pecuária' WHEN 'agricultura' THEN 'Agricultura'
                                  WHEN 'silvicultura' THEN 'Silvicultura' WHEN 'administrativo' THEN 'Administrativo'
                                  WHEN 'cana' THEN 'Cana' ELSE initcap(p_caminho[2]) END, 'Sem atividade')
           WHEN 3 THEN coalesce(p_caminho[3], 'Sem centro')
           ELSE coalesce(p_caminho[4], 'Sem subcentro') END
$function$;

REVOKE ALL ON FUNCTION public.fn_vg_rotulo_no(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_rotulo_no(text[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_vg_gaveta(
  p_cliente uuid, p_de date, p_ate date, p_mes text, p_lado text, p_caminho text[] DEFAULT '{}', p_criterio text DEFAULT 'mes',
  p_contas uuid[] DEFAULT NULL, p_fazendas uuid[] DEFAULT NULL, p_atividade text DEFAULT NULL,
  p_hoje date DEFAULT CURRENT_DATE, p_status text[] DEFAULT NULL, p_incluir_vencidos boolean DEFAULT true,
  p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_c text[] := coalesce(p_caminho, '{}');
  v_k int;
  v_ini date;
  v_fim date;
  v_jd date;
  v_ja date;
  v_ord text[] := CASE WHEN p_lado = 'saida'
    THEN ARRAY['Custeio', 'Reposição de bovinos', 'Investimentos', 'Amortizações', 'Juros', 'Impostos e deduções', 'Dividendos', 'Outras saídas']
    ELSE ARRAY['Receitas operacionais', 'Entradas de capital e financiamento', 'Outras entradas'] END;
  r jsonb;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de OR p_hoje IS NULL OR p_ate > (p_de + interval '36 months')
     OR p_mes IS NULL OR length(p_mes) <> 7 OR p_mes !~ '[0-9]{4}-[0-9]{2}' OR p_mes < to_char(p_de, 'YYYY-MM') OR p_mes > to_char(p_ate, 'YYYY-MM') THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_lado IS NULL OR p_lado NOT IN ('entrada', 'saida') THEN RAISE EXCEPTION 'Lado inválido.' USING ERRCODE = '22023'; END IF;
  IF p_criterio IS NULL OR p_criterio NOT IN ('mes', 'media', 'acumulado') THEN
    RAISE EXCEPTION 'Critério inválido: use mes, media ou acumulado.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_c) > 4 THEN RAISE EXCEPTION 'Caminho inválido.' USING ERRCODE = '22023'; END IF;
  IF p_pagina IS NULL OR p_pagina < 1 OR p_por_pagina IS NULL OR p_por_pagina < 1 OR p_por_pagina > 500 THEN
    RAISE EXCEPTION 'Página inválida (até 500 por página).' USING ERRCODE = '22023';
  END IF;
  v_k := cardinality(v_c);
  v_ini := (p_mes || '-01')::date;
  v_fim := (v_ini + interval '1 month' - interval '1 day')::date;
  -- a janela: o mes (criterio mes) ou do inicio do periodo ate' o mes (media/acumulado) — a mesma do modal
  v_jd := CASE WHEN p_criterio = 'mes' THEN greatest(p_de, v_ini) ELSE p_de END;
  v_ja := least(p_ate, v_fim);

  WITH pr AS MATERIALIZED (
    -- as linhas do PAI do no' (os irmaos saem dele); na raiz, o lado inteiro
    SELECT x.*, ARRAY[x.grupo, x.atividade, x.centro, x.subcentro] AS cam
      FROM public.fn_vg_partes(p_cliente, v_jd, v_ja, p_contas, p_fazendas, NULL, p_atividade, p_hoje, p_status, p_incluir_vencidos) x
     WHERE x.lado = p_lado
       AND (v_k < 2 OR x.grupo IS NOT DISTINCT FROM v_c[1])
       AND (v_k < 3 OR x.atividade IS NOT DISTINCT FROM v_c[2])
       AND (v_k < 4 OR x.centro IS NOT DISTINCT FROM v_c[3])
  ), nd AS (
    SELECT * FROM pr WHERE v_k = 0 OR pr.cam[v_k] IS NOT DISTINCT FROM v_c[v_k]
  ), irm AS (
    SELECT pr.cam[1:v_k] AS c, round(sum(pr.valor), 2) AS v FROM pr WHERE v_k > 0 GROUP BY pr.cam[1:v_k]
    UNION SELECT v_c, 0 WHERE v_k > 0
  ), irm1 AS (
    SELECT DISTINCT ON (irm.c) irm.c, irm.v FROM irm ORDER BY irm.c, irm.v DESC
  ), fil AS (
    SELECT nd.cam[1:v_k + 1] AS c, round(sum(nd.valor), 2) AS v, count(DISTINCT nd.lancamento_id) AS q
      FROM nd WHERE v_k < 4 GROUP BY nd.cam[1:v_k + 1]
  ), tot AS (
    SELECT round(coalesce(sum(nd.valor), 0), 2) AS v, count(DISTINCT nd.lancamento_id) AS q, count(*) AS n FROM nd
  ), lan AS (
    SELECT nd.*, CASE WHEN nd.eh_real THEN nd.data_pagamento ELSE coalesce(nd.data_vencimento, nd.data_competencia) END AS dt,
           coalesce(nullif(trim(f.nome), ''), 'Sem favorecido') AS fav_nome,
           coalesce(nullif(trim(cb.nome_exibicao), ''), cb.nome_conta, 'Sem conta') AS conta_nome
      FROM nd
      LEFT JOIN public.financeiro_fornecedores f ON f.id = nd.favorecido_id
      LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = nd.conta_id
     WHERE v_k = 4
  ), ordem AS (
    SELECT lan.*, row_number() OVER (ORDER BY lan.dt, lan.valor DESC, lan.chave) AS i FROM lan
  )
  SELECT jsonb_build_object(
    'lado', p_lado, 'mes', p_mes, 'criterio', p_criterio, 'janela', jsonb_build_object('de', v_jd, 'ate', v_ja),
    'folha', v_k = 4,
    'caminho', (SELECT jsonb_agg(jsonb_build_object('caminho', to_jsonb(v_c[1:g]), 'rotulo', public.fn_vg_rotulo_no(v_c[1:g], p_lado)) ORDER BY g)
                  FROM generate_series(0, v_k) g),
    'irmaos', coalesce((SELECT jsonb_agg(jsonb_build_object('caminho', to_jsonb(i.c), 'rotulo', public.fn_vg_rotulo_no(i.c, p_lado), 'valor', i.v)
                          ORDER BY CASE WHEN v_k = 1 THEN coalesce(array_position(v_ord, i.c[1]), CASE WHEN i.c[1] = 'Sem classificação' THEN 99 ELSE 50 END) ELSE 0 END,
                                   i.v DESC, public.fn_vg_rotulo_no(i.c, p_lado))
                          FROM irm1 i), '[]'::jsonb),
    'qtd', (SELECT tot.q FROM tot), 'total', (SELECT tot.v FROM tot),
    'medio', (SELECT CASE WHEN tot.q > 0 THEN round(tot.v / tot.q, 2) END FROM tot),
    'resumo', CASE WHEN v_k = 4 THEN
                jsonb_build_object('tipo', 'favorecido', 'linhas', coalesce((
                  SELECT jsonb_agg(jsonb_build_object('rotulo', z.fav_nome, 'qtd', z.q, 'valor', z.v) ORDER BY z.v DESC, z.fav_nome)
                    FROM (SELECT lan.fav_nome, count(DISTINCT lan.lancamento_id) AS q, round(sum(lan.valor), 2) AS v
                            FROM lan GROUP BY lan.favorecido_id, lan.fav_nome ORDER BY 3 DESC, 1 LIMIT 4) z), '[]'::jsonb))
              ELSE
                jsonb_build_object('tipo', 'filhos', 'linhas', coalesce((
                  SELECT jsonb_agg(jsonb_build_object('rotulo', public.fn_vg_rotulo_no(z.c, p_lado), 'qtd', z.q, 'valor', z.v,
                                     'pct', CASE WHEN t.v <> 0 THEN round(z.v / t.v * 100, 1) END) ORDER BY z.v DESC)
                    FROM (SELECT * FROM fil ORDER BY fil.v DESC, fil.c LIMIT 4) z, tot t), '[]'::jsonb))
              END,
    'linhas', CASE WHEN v_k = 4 THEN coalesce((
                SELECT jsonb_agg(jsonb_build_object('chave', o.chave, 'lancamento_id', o.lancamento_id, 'parte_ordem', o.parte_ordem,
                         'partes_total', o.partes_total, 'data', o.dt, 'favorecido', o.fav_nome, 'descricao', o.descricao,
                         'conta', o.conta_nome, 'valor', o.valor, 'valor_lancamento', o.valor_lancamento, 'status', o.status,
                         'previsto', NOT o.eh_real, 'vencido', o.vencido) ORDER BY o.i)
                  FROM ordem o WHERE o.i > (p_pagina - 1) * p_por_pagina AND o.i <= p_pagina * p_por_pagina), '[]'::jsonb)
              ELSE coalesce((
                SELECT jsonb_agg(jsonb_build_object('caminho', to_jsonb(f.c), 'rotulo', public.fn_vg_rotulo_no(f.c, p_lado), 'qtd', f.q,
                         'valor', f.v, 'pct', CASE WHEN t.v <> 0 THEN round(f.v / t.v * 100, 1) END)
                         ORDER BY CASE WHEN v_k = 0 THEN coalesce(array_position(v_ord, f.c[1]), CASE WHEN f.c[1] = 'Sem classificação' THEN 99 ELSE 50 END) ELSE 0 END,
                                  f.v DESC, public.fn_vg_rotulo_no(f.c, p_lado))
                  FROM fil f, tot t), '[]'::jsonb) END,
    'total_linhas', CASE WHEN v_k = 4 THEN (SELECT tot.n FROM tot) ELSE (SELECT count(*) FROM fil) END,
    'pagina', p_pagina, 'por_pagina', p_por_pagina,
    'paginas', CASE WHEN v_k = 4 THEN greatest(1, ceil((SELECT tot.n FROM tot)::numeric / p_por_pagina)::int) ELSE 1 END
  ) INTO r;
  RETURN r;
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer) IS
  'FIN-VISAO-GERAL-01 PR 5: a gaveta de lancamentos pronta — caminho, irmaos, qtd/total/medio, resumo (favorecido ou filhos) e a lista (lancamentos por parte no subcentro, paginada ate'' 500; filhos acima), na janela do modal (mes ou inicio→mes), mesmo recorte da fn_vg_analise.';
