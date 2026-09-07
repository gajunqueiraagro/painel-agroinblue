-- 20260907181314 casar_sessao_pareia_por_ordem (aplicada no proto via Management API em 07/09/2026)
CREATE OR REPLACE FUNCTION public.fn_classificacao_casar_sessao(p_sessao_id uuid, p_ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid; v_cli uuid; v_de date; v_ate date;
  r record; c record; n int; v_ids uuid[];
  v_st text; v_prop text;
  n_casou int := 0; n_amb int := 0; n_grupo int := 0; n_split int := 0; n_sem int := 0; n_pulou int := 0; n_semconta int := 0;
  v_usados uuid[] := '{}'::uuid[];
  v_chave_count int;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  SELECT cliente_id INTO v_cli FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cli IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='sessao vazia ou inexistente'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_cli IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente';
  END IF;
  IF p_ano_mes !~ '^[0-9]{4}-[0-9]{2}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='p_ano_mes deve ser AAAA-MM'; END IF;
  v_de := to_date(p_ano_mes||'-01','YYYY-MM-DD'); v_ate := (v_de + interval '1 month' - interval '1 day')::date;

  -- lancamentos ja reclamados por linhas que nao serao tocadas (aplicadas / resolvidas a mao)
  SELECT COALESCE(array_agg(match_lancamento_id), '{}'::uuid[]) INTO v_usados
  FROM financeiro_classificacao_staging
  WHERE sessao_id = p_sessao_id AND match_lancamento_id IS NOT NULL
    AND (aplicado OR match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido'));

  -- limpa o que vai ser recasado
  UPDATE financeiro_classificacao_staging
     SET match_lancamento_id = NULL, match_lancamento_ids = NULL, casamento_meta = NULL
   WHERE sessao_id = p_sessao_id AND NOT aplicado
     AND match_status NOT IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido');

  -- PASSO 1 e 2: casa unico / ambiguo
  FOR r IN
    SELECT st.*, COALESCE(st.conta_origem_id, st.conta_destino_id) AS conta_id,
           CASE WHEN st.excel_tipo_operacao LIKE '1-%' THEN '1' ELSE '-1' END AS sinal_esp
      FROM financeiro_classificacao_staging st
     WHERE st.sessao_id = p_sessao_id AND NOT st.aplicado
       AND st.match_status NOT IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido')
     ORDER BY st.excel_linha_origem
  LOOP
    IF r.conta_id IS NULL THEN
      UPDATE financeiro_classificacao_staging SET match_status='sem_conta_para_match' WHERE staging_id=r.staging_id;
      n_semconta := n_semconta + 1; CONTINUE;
    END IF;
    -- quantas linhas da sessao disputam a mesma chave (conta, valor, data-regra)
    SELECT count(*) INTO v_chave_count FROM financeiro_classificacao_staging s2
     WHERE s2.sessao_id = p_sessao_id AND NOT s2.aplicado
       AND COALESCE(s2.conta_origem_id, s2.conta_destino_id) = r.conta_id
       AND round(abs(s2.excel_valor),2) = round(abs(r.excel_valor),2)
       AND s2.excel_data_pagamento IS NOT DISTINCT FROM r.excel_data_pagamento
       AND s2.match_lancamento_id IS NULL AND s2.match_lancamento_ids IS NULL
       AND s2.match_status NOT IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido');
    -- candidatos no sistema
    SELECT count(*), array_agg(l.id ORDER BY l.data_pagamento, l.created_at) INTO n, v_ids
      FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = v_cli AND l.cancelado IS NOT TRUE AND l.sem_movimentacao_caixa IS NOT TRUE
       AND COALESCE(l.cenario,'realizado') <> 'meta'
       AND (CASE WHEN l.tipo_operacao = '1-Entradas' THEN l.conta_destino_id ELSE l.conta_bancaria_id END) = r.conta_id
       AND round(l.valor,2) = round(abs(r.excel_valor),2)
       AND l.sinal = r.sinal_esp
       AND l.data_pagamento IS NOT NULL
       AND (CASE WHEN r.excel_data_pagamento IS NOT NULL THEN l.data_pagamento = r.excel_data_pagamento
                 ELSE l.data_pagamento BETWEEN v_de AND v_ate END)
       AND NOT (l.id = ANY(v_usados));
    IF n = 1 AND v_chave_count = 1 THEN
      SELECT subcentro INTO c FROM financeiro_lancamentos_v2 WHERE id = v_ids[1];
      v_prop := r.update_proposto->>'subcentro';
      v_st := CASE WHEN c.subcentro IS NULL THEN 'divergente'
                   WHEN v_prop IS NOT NULL AND c.subcentro = v_prop THEN 'exato'
                   ELSE 'ja_classificado' END;
      UPDATE financeiro_classificacao_staging
         SET match_lancamento_id = v_ids[1], match_lancamento_ids = NULL, match_status = v_st,
             casamento_meta = jsonb_build_object('regra', CASE WHEN r.excel_data_pagamento IS NOT NULL THEN 'pagamento_exato' ELSE 'valor_no_mes' END)
       WHERE staging_id = r.staging_id;
      v_usados := v_usados || v_ids[1];
      n_casou := n_casou + 1;
    ELSIF n > 1 AND n = v_chave_count THEN
      -- k linhas iguais para k lancamentos iguais: pareia por ordem e pede conferencia
      SELECT subcentro INTO c FROM financeiro_lancamentos_v2 WHERE id = v_ids[1];
      v_prop := r.update_proposto->>'subcentro';
      v_st := CASE WHEN c.subcentro IS NULL THEN 'divergente' WHEN v_prop IS NOT NULL AND c.subcentro = v_prop THEN 'exato' ELSE 'ja_classificado' END;
      UPDATE financeiro_classificacao_staging
         SET match_lancamento_id = v_ids[1], match_lancamento_ids = NULL, match_status = v_st,
             casamento_meta = jsonb_build_object('regra', 'pareado_por_ordem', 'iguais', n)
       WHERE staging_id = r.staging_id;
      v_usados := v_usados || v_ids[1];
      n_casou := n_casou + 1;
    ELSIF n >= 1 THEN
      UPDATE financeiro_classificacao_staging
         SET match_lancamento_id = NULL, match_lancamento_ids = v_ids, match_status = 'ambiguo',
             casamento_meta = jsonb_build_object('candidatos', n, 'linhas_disputando', v_chave_count)
       WHERE staging_id = r.staging_id;
      n_amb := n_amb + 1;
    ELSE
      UPDATE financeiro_classificacao_staging SET match_status = 'sem_match', casamento_meta = NULL WHERE staging_id = r.staging_id;
    END IF;
  END LOOP;

  -- PASSO 3a: 1 linha = N lancamentos do mesmo dia e conta, sem par, que somam o valor (2 ou 3)
  FOR r IN
    SELECT st.*, COALESCE(st.conta_origem_id, st.conta_destino_id) AS conta_id,
           CASE WHEN st.excel_tipo_operacao LIKE '1-%' THEN '1' ELSE '-1' END AS sinal_esp
      FROM financeiro_classificacao_staging st
     WHERE st.sessao_id = p_sessao_id AND NOT st.aplicado AND st.match_status = 'sem_match'
       AND COALESCE(st.conta_origem_id, st.conta_destino_id) IS NOT NULL
  LOOP
    v_ids := NULL;
    SELECT ARRAY[a.id, b.id] INTO v_ids
      FROM financeiro_lancamentos_v2 a
      JOIN financeiro_lancamentos_v2 b ON b.cliente_id = a.cliente_id AND b.id > a.id AND b.data_pagamento = a.data_pagamento
     WHERE a.cliente_id = v_cli AND a.cancelado IS NOT TRUE AND b.cancelado IS NOT TRUE
       AND a.sem_movimentacao_caixa IS NOT TRUE AND b.sem_movimentacao_caixa IS NOT TRUE
       AND a.sinal = r.sinal_esp AND b.sinal = r.sinal_esp
       AND (CASE WHEN a.tipo_operacao = '1-Entradas' THEN a.conta_destino_id ELSE a.conta_bancaria_id END) = r.conta_id
       AND (CASE WHEN b.tipo_operacao = '1-Entradas' THEN b.conta_destino_id ELSE b.conta_bancaria_id END) = r.conta_id
       AND a.data_pagamento BETWEEN v_de AND v_ate
       AND (r.excel_data_pagamento IS NULL OR a.data_pagamento = r.excel_data_pagamento)
       AND NOT (a.id = ANY(v_usados)) AND NOT (b.id = ANY(v_usados))
       AND round(a.valor + b.valor, 2) = round(abs(r.excel_valor), 2)
     LIMIT 1;
    IF v_ids IS NOT NULL AND array_length(v_ids,1) = 2 THEN
      UPDATE financeiro_classificacao_staging
         SET match_lancamento_ids = v_ids, match_status = 'sugestao_grupo',
             casamento_meta = jsonb_build_object('regra','soma_2_lancamentos','soma', r.excel_valor)
       WHERE staging_id = r.staging_id;
      v_usados := v_usados || v_ids; n_grupo := n_grupo + 1;
    END IF;
  END LOOP;

  -- PASSO 3b: N linhas (mesmo fornecedor, mesma conta, mesma data) = 1 lancamento sem par com a soma
  FOR r IN
    SELECT COALESCE(st.conta_origem_id, st.conta_destino_id) AS conta_id, st.excel_fornecedor,
           COALESCE(st.excel_data_pagamento, st.excel_data) AS d,
           CASE WHEN st.excel_tipo_operacao LIKE '1-%' THEN '1' ELSE '-1' END AS sinal_esp,
           round(sum(abs(st.excel_valor)),2) AS soma, array_agg(st.staging_id) AS ids, count(*) AS qtd
      FROM financeiro_classificacao_staging st
     WHERE st.sessao_id = p_sessao_id AND NOT st.aplicado AND st.match_status = 'sem_match'
       AND COALESCE(st.conta_origem_id, st.conta_destino_id) IS NOT NULL AND st.excel_fornecedor IS NOT NULL
     GROUP BY 1,2,3,4 HAVING count(*) BETWEEN 2 AND 6
  LOOP
    SELECT count(*), array_agg(l.id) INTO n, v_ids FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = v_cli AND l.cancelado IS NOT TRUE AND l.sem_movimentacao_caixa IS NOT TRUE
       AND (CASE WHEN l.tipo_operacao = '1-Entradas' THEN l.conta_destino_id ELSE l.conta_bancaria_id END) = r.conta_id
       AND l.sinal = r.sinal_esp AND round(l.valor,2) = r.soma
       AND l.data_pagamento BETWEEN v_de AND v_ate AND NOT (l.id = ANY(v_usados));
    IF n = 1 THEN
      UPDATE financeiro_classificacao_staging
         SET match_lancamento_id = v_ids[1], match_lancamento_ids = NULL, match_status = 'sugestao_split',
             casamento_meta = jsonb_build_object('regra','n_linhas_1_lancamento','linhas', r.qtd, 'soma', r.soma, 'grupo_ids', to_jsonb(r.ids))
       WHERE staging_id = ANY(r.ids);
      v_usados := v_usados || v_ids[1]; n_split := n_split + r.qtd;
    END IF;
  END LOOP;

  SELECT count(*) INTO n_sem FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id AND match_status = 'sem_match';
  SELECT count(*) INTO n_pulou FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id AND (aplicado OR match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido'));
  RETURN jsonb_build_object('ok', true, 'sessao_id', p_sessao_id, 'ano_mes', p_ano_mes,
    'casou', n_casou, 'ambiguo', n_amb, 'sugestao_grupo', n_grupo, 'sugestao_split', n_split, 'sem_par', n_sem, 'sem_conta', n_semconta, 'nao_tocadas', n_pulou);
END;
$function$
;
