-- P103 (Gabriel 25/10/2026) — fn_vg_gaveta: (1) a CONTA pelo lado — saida → origem, entrada → DESTINO, transferencia → "Origem →
-- Destino" (toda entrada saia "Sem conta": a entrada grava a conta em conta_destino_id; out/26: Vera 7 de 7, Agnaldo 2 de 2, NJ 15 de 15);
-- (2) as DATAS e o STATUS de cada lancamento (competencia, vencimento, pagamento; `conciliado` = realizado com vinculo vivo) e, na
-- folha, `pago` e `aberto` (a soma que a gaveta ja' tinha, separada). A soma da gaveta nao muda (as nao pagas ja' entravam pelos chips
-- da tela, pela fn_vg_partes). O resto da saida e' o da 111949 (o corpo de antes e' conferido pelo md5).
SET LOCAL lock_timeout = '2s';
DO $g$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer)'::regprocedure)
     IS DISTINCT FROM 'bf7b0c81549813307da8894ac4ee85e2' THEN RAISE EXCEPTION 'fn_vg_gaveta: corpo de origem inesperado.'; END IF;
END $g$;

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
  v_todas boolean := p_contas IS NULL;
  v_contas uuid[];
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

  v_contas := ARRAY(
    SELECT c.id FROM public.financeiro_contas_bancarias c
     WHERE c.cliente_id = p_cliente
       AND CASE WHEN v_todas THEN c.ativa AND (lower(coalesce(c.tipo_conta, '')) IN ('cc', 'inv', 'permuta') OR public.fn_vg_eh_cartao(c.tipo_conta))
                ELSE c.id = ANY (p_contas) END);

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
    SELECT round(coalesce(sum(nd.valor), 0), 2) AS v, count(DISTINCT nd.lancamento_id) AS q, count(*) AS n,
           round(coalesce(sum(nd.valor) FILTER (WHERE nd.eh_real), 0), 2) AS pago,
           round(coalesce(sum(nd.valor) FILTER (WHERE NOT nd.eh_real), 0), 2) AS aberto FROM nd
  ), lan AS (
    -- P103: a CONTA pelo lado (a regra do "Ver na lista"): saida → a de origem; entrada → a de DESTINO (onde a entrada grava a
    -- conta); transferencia → "Origem → Destino". Antes: so' a de origem — toda entrada saia "Sem conta".
    SELECT nd.*, CASE WHEN nd.eh_real THEN nd.data_pagamento ELSE coalesce(nd.data_vencimento, nd.data_competencia) END AS dt,
           coalesce(nullif(trim(f.nome), ''), 'Sem favorecido') AS fav_nome,
           CASE WHEN lv.tipo_operacao LIKE '3-%'
                THEN coalesce(nullif(trim(co.nome_exibicao), ''), co.nome_conta, 'Sem conta') || ' → ' || coalesce(nullif(trim(cd.nome_exibicao), ''), cd.nome_conta, 'Sem conta')
                WHEN p_lado = 'entrada'
                THEN coalesce(nullif(trim(cd.nome_exibicao), ''), cd.nome_conta, nullif(trim(co.nome_exibicao), ''), co.nome_conta, 'Sem conta')
                ELSE coalesce(nullif(trim(co.nome_exibicao), ''), co.nome_conta, nullif(trim(cd.nome_exibicao), ''), cd.nome_conta, 'Sem conta') END AS conta_nome,
           -- P103: conciliado = realizado com vinculo vivo (a regra da lista de Lancamentos: derivado, nunca gravado)
           nd.eh_real AND EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci WHERE ci.lancamento_id = nd.lancamento_id AND ci.desfeito_em IS NULL) AS conciliado
      FROM nd
      LEFT JOIN public.financeiro_fornecedores f ON f.id = nd.favorecido_id
      LEFT JOIN public.financeiro_lancamentos_v2 lv ON lv.id = nd.lancamento_id
      LEFT JOIN public.financeiro_contas_bancarias co ON co.id = lv.conta_bancaria_id
      LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = lv.conta_destino_id
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
    'pago', CASE WHEN v_k = 4 THEN (SELECT tot.pago FROM tot) END, 'aberto', CASE WHEN v_k = 4 THEN (SELECT tot.aberto FROM tot) END,
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
                         'previsto', NOT o.eh_real, 'vencido', o.vencido,
                         'competencia', o.data_competencia, 'vencimento', o.data_vencimento, 'pagamento', o.data_pagamento,
                         'conciliado', o.conciliado) ORDER BY o.i)
                  FROM ordem o WHERE o.i > (p_pagina - 1) * p_por_pagina AND o.i <= p_pagina * p_por_pagina), '[]'::jsonb)
              ELSE coalesce((
                SELECT jsonb_agg(jsonb_build_object('caminho', to_jsonb(f.c), 'rotulo', public.fn_vg_rotulo_no(f.c, p_lado), 'qtd', f.q,
                         'valor', f.v, 'pct', CASE WHEN t.v <> 0 THEN round(f.v / t.v * 100, 1) END)
                         ORDER BY CASE WHEN v_k = 0 THEN coalesce(array_position(v_ord, f.c[1]), CASE WHEN f.c[1] = 'Sem classificação' THEN 99 ELSE 50 END) ELSE 0 END,
                                  f.v DESC, public.fn_vg_rotulo_no(f.c, p_lado))
                  FROM fil f, tot t), '[]'::jsonb) END,
    'total_linhas', CASE WHEN v_k = 4 THEN (SELECT tot.n FROM tot) ELSE (SELECT count(*) FROM fil) END,
    'lista', CASE WHEN v_k = 4 THEN jsonb_build_object(
      'vencidos_fora', CASE WHEN coalesce(p_incluir_vencidos, true) THEN (
        SELECT count(DISTINCT x.lancamento_id)
          FROM public.fn_vg_partes(p_cliente, v_jd, greatest(v_ja, (date_trunc('month', p_hoje) + interval '1 month - 1 day')::date),
                                   p_contas, p_fazendas, NULL, p_atividade, p_hoje, p_status, true) x
         WHERE x.lado = p_lado AND x.vencido
           AND x.grupo IS NOT DISTINCT FROM v_c[1] AND x.atividade IS NOT DISTINCT FROM v_c[2]
           AND x.centro IS NOT DISTINCT FROM v_c[3] AND x.subcentro IS NOT DISTINCT FROM v_c[4]
           AND (x.dia BETWEEN v_jd AND v_ja) <> (coalesce(x.data_vencimento, x.data_competencia) BETWEEN v_jd AND v_ja))
        ELSE 0 END,
      'transf_internas', CASE WHEN v_c[2] IS NULL AND v_c[3] IN ('Transferências para outras contas', 'Transferências de outras contas')
                                   AND p_atividade IS NULL THEN (
        SELECT count(DISTINCT v.lancamento_id) FROM public.vw_fin_classificacao_por_parte v
         WHERE v.cliente_id = p_cliente AND v.cancelado = false AND v.cenario IS DISTINCT FROM 'meta'
           AND coalesce(v.sem_movimentacao_caixa, false) = false AND v.tipo_operacao LIKE '3-%'
           AND v.conta_bancaria_id = ANY (v_contas) AND v.conta_destino_id = ANY (v_contas) AND v.conta_destino_id <> v.conta_bancaria_id
           AND (p_fazendas IS NULL OR v.fazenda_id = ANY (p_fazendas))
           AND ((v.status_transacao = 'realizado' AND v.data_pagamento BETWEEN v_jd AND v_ja)
             OR (v.status_transacao = ANY (public.fn_vg_status_validos(p_status))
                 AND (coalesce(p_incluir_vencidos, true) OR coalesce(v.data_vencimento, v.data_competencia) >= p_hoje)
                 AND greatest(coalesce(v.data_vencimento, v.data_competencia), date_trunc('month', p_hoje)::date) BETWEEN v_jd AND v_ja)))
        ELSE 0 END,
      'faturas_cartao', CASE WHEN v_c[2] IS NULL AND v_c[3] = 'Transferências para outras contas' AND p_atividade IS NULL THEN (
        SELECT count(DISTINCT v.lancamento_id) FROM public.vw_fin_classificacao_por_parte v
          JOIN public.financeiro_contas_bancarias k ON k.id = v.conta_destino_id AND public.fn_vg_eh_cartao(k.tipo_conta)
         WHERE v.cliente_id = p_cliente AND v.cancelado = false AND v.cenario IS DISTINCT FROM 'meta'
           AND coalesce(v.sem_movimentacao_caixa, false) = false AND v.tipo_operacao LIKE '3-%'
           AND v.conta_bancaria_id = ANY (v_contas) AND NOT (v.conta_destino_id = ANY (v_contas))
           AND (p_fazendas IS NULL OR v.fazenda_id = ANY (p_fazendas))
           AND ((v.status_transacao = 'realizado' AND v.data_pagamento BETWEEN v_jd AND v_ja)
             OR (v.status_transacao = ANY (public.fn_vg_status_validos(p_status))
                 AND (coalesce(p_incluir_vencidos, true) OR coalesce(v.data_vencimento, v.data_competencia) >= p_hoje)
                 AND greatest(coalesce(v.data_vencimento, v.data_competencia), date_trunc('month', p_hoje)::date) BETWEEN v_jd AND v_ja)))
        ELSE 0 END) END,
    'pagina', p_pagina, 'por_pagina', p_por_pagina,
    'paginas', CASE WHEN v_k = 4 THEN greatest(1, ceil((SELECT tot.n FROM tot)::numeric / p_por_pagina)::int) ELSE 1 END
  ) INTO r;
  RETURN r;
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer) IS
  'FIN-VISAO-GERAL-01 PR 5: a gaveta de lancamentos pronta — caminho, irmaos, qtd/total/medio, resumo (favorecido ou filhos) e a lista (lancamentos por parte no subcentro, paginada ate'' 500; filhos acima), na janela do modal (mes ou inicio→mes), mesmo recorte da fn_vg_analise; `lista` (folha): o que a lista de Lancamentos nao reproduz (vencidos que a Visao Geral leva para dentro ou para fora da janela, transferencias entre contas do conjunto, pagamentos de fatura com o cartao fora dele).';
