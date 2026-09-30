-- FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01-fix1 — WHERE no UPDATE da tabela temporaria.
--
-- ⚠ O DEFEITO (Gabriel, 30/09, pela tela, recorrencia "Folha - FGTS" do NJ): "UPDATE requires a WHERE clause". O
--   UPDATE de _rec_prop_comp que preenche comp_fim_fut/comp_fim_todos nao tinha WHERE, e a RPC chamada pelo app
--   passa pelo role authenticator, que carrega session_preload_libraries=safeupdate (pg_safeupdate): UPDATE e
--   DELETE sem WHERE sao recusados, INCLUSIVE em tabela temporaria. O teste da 01 rodou pelo canal SQL, sem o
--   safeupdate, e passou. Reproduzido pelo rpc do app, so' simulacao: Felipe, Denise, Cesar e FGTS -> 21000.
--   O canal SQL nao consegue ligar o modo (LOAD 'safeupdate' -> "access to library is not allowed").
--
-- ⚠ O QUE MUDA: SO' o WHERE nesse UPDATE (c.lancamento_id e' o id do lancamento, nunca nulo: atinge as mesmas
--   linhas). Conferidos os 6 UPDATE do corpo e nenhum DELETE: os outros 5 ja' tinham WHERE. Corpo de origem =
--   o aplicado pela 01 (md5 56fb77799684bff0a3ff7b7655434122), conferido antes de editar.
--
-- ⚠ ACL de novo no mesmo arquivo (CREATE OR REPLACE mantem a ACL, mas a regra da casa e' nao depender disso).
CREATE OR REPLACE FUNCTION public.fn_recorrencia_propagar(p_recorrencia_id uuid, p_escopo text DEFAULT 'futuros'::text, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_r public.financeiro_recorrencias;
  v_fut int := 0; v_pas int := 0; v_sinal_ruim int := 0;
  v_ap_fut int := 0; v_ap_pas int := 0;
  -- FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01
  v_desloc int;
  v_marca_antes date; v_marca_depois date;
  v_ap_comp int := 0;
  v_comp jsonb; v_proj jsonb := '{}'::jsonb; v_e text; v_md date; v_max date; v_n int;
BEGIN
  -- FIN-RECORR-PROPAGA-01: a recorrencia e a fonte da classificacao dos lancamentos que gerou.
  -- p_escopo: 'futuros' | 'todos' | 'nenhum'. p_simular=true so conta (mesmo predicado do update).
  -- Futuro = status previsto/programado/agendado/meta, sem data_pagamento, sem conciliacao.
  -- Passado = todo o resto nao cancelado. Cancelados nunca sao tocados.
  -- Propaga: descricao, favorecido, fazenda, conta (pelo tipo), subcentro (chave/grupo/centro/escopo via trigger),
  -- safra (trigger zera se administrativo), forma_pagamento, observacao. Valor SO nos futuros.
  -- Nunca toca: vencimento, pagamento, tipo_operacao, sinal, valor de passado, vinculo de conciliacao.
  -- Sinal trocado na regra = recusa.
  -- COMPETENCIA SEGUE A REGRA (FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01, Gabriel 30/09): competencia =
  -- 1o dia do (mes do vencimento - deslocamento), com o deslocamento de fn_recorrencia_gerar. Futuros sempre
  -- que o escopo os inclui; passados (inclusive realizados/conciliados) so em 'todos'. Pula - sem abortar - o
  -- lancamento cuja competencia atual OU nova caia em mes FECHADO em financeiro_fechamentos. Ao fim, a marca
  -- ultimo_lancamento_gerado desce/sobe para a maior competencia viva, e o proximo gerar cria o que faltou.
  SELECT * INTO v_r FROM public.financeiro_recorrencias WHERE id = p_recorrencia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recorrencia inexistente'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_r.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF p_escopo NOT IN ('futuros','todos','nenhum') THEN RAISE EXCEPTION 'p_escopo invalido: %', p_escopo; END IF;

  SELECT count(*) FILTER (WHERE status_transacao IN ('previsto','programado','agendado','meta') AND data_pagamento IS NULL AND conciliado_em IS NULL),
         count(*) FILTER (WHERE NOT (status_transacao IN ('previsto','programado','agendado','meta') AND data_pagamento IS NULL AND conciliado_em IS NULL)),
         count(*) FILTER (WHERE tipo_operacao IS DISTINCT FROM v_r.tipo_operacao)
    INTO v_fut, v_pas, v_sinal_ruim
    FROM public.financeiro_lancamentos_v2
   WHERE recorrencia_id = p_recorrencia_id AND coalesce(cancelado,false) = false;

  IF p_escopo <> 'nenhum' AND v_sinal_ruim > 0 THEN
    RAISE EXCEPTION 'A recorrencia mudou de entrada para saida (ou o inverso). Trocar o sinal exige nova recorrencia; os % lancamentos gerados nao foram alterados.', v_sinal_ruim
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── COMPETENCIA (FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01) ─────────────────────────────────────────────
  -- Deslocamento competencia->vencimento: a MESMA formula de fn_recorrencia_gerar (fonte unica; nunca gravado).
  v_desloc := (extract(year from v_r.primeiro_vencimento)::int * 12 + extract(month from v_r.primeiro_vencimento)::int)
            - (extract(year from v_r.data_inicio)::int * 12 + extract(month from v_r.data_inicio)::int);
  v_marca_antes := v_r.ultimo_lancamento_gerado;

  -- Todos os lancamentos vivos da recorrencia: a competencia que a regra pede e a final em cada escopo.
  -- Sem vencimento, a competencia fica como esta (nao ha de onde deriva-la).
  DROP TABLE IF EXISTS pg_temp._rec_prop_comp;
  CREATE TEMP TABLE _rec_prop_comp ON COMMIT DROP AS
  SELECT l.id AS lancamento_id, l.data_vencimento AS venc, l.data_competencia AS comp_antiga,
         CASE WHEN l.data_vencimento IS NULL THEN l.data_competencia
              ELSE (date_trunc('month', l.data_vencimento) - make_interval(months => v_desloc))::date END AS comp_nova,
         (l.status_transacao IN ('previsto','programado','agendado','meta') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL) AS futuro,
         false AS fechado, NULL::date AS comp_fim_fut, NULL::date AS comp_fim_todos
    FROM public.financeiro_lancamentos_v2 l
   WHERE l.recorrencia_id = p_recorrencia_id AND coalesce(l.cancelado,false) = false;

  -- MES FECHADO = financeiro_fechamentos.status_fechamento = 'fechado' no mes da competencia ATUAL ou NOVA, por
  -- cliente/ano_mes (decisao do Gabriel, 30/09). NAO financeiro_saldos_bancarios_v2.status_mes: aquele e'
  -- fechamento de CAIXA por conta, e trocar competencia nao mexe em caixa (vencimento, pagamento e vinculo ficam).
  -- Nenhum trigger de financeiro_lancamentos_v2 barra mes fechado (guard_financeiro_mes_fechado nao esta ligado a
  -- tabela nenhuma), entao o pulo e' daqui. Em 30/09 nao ha' NENHUMA linha 'fechado' na tabela: o pulo nao dispara
  -- hoje, e isso e' esperado.
  UPDATE _rec_prop_comp c SET fechado = true
   WHERE c.comp_nova IS DISTINCT FROM c.comp_antiga
     AND EXISTS (SELECT 1 FROM public.financeiro_fechamentos ff
                  WHERE ff.cliente_id = v_r.cliente_id AND ff.status_fechamento = 'fechado'
                    AND ff.ano_mes IN (to_char(c.comp_antiga, 'YYYY-MM'), to_char(c.comp_nova, 'YYYY-MM')));
  UPDATE _rec_prop_comp c
     SET comp_fim_fut   = CASE WHEN c.comp_nova IS DISTINCT FROM c.comp_antiga AND NOT c.fechado AND c.futuro THEN c.comp_nova ELSE c.comp_antiga END,
         comp_fim_todos = CASE WHEN c.comp_nova IS DISTINCT FROM c.comp_antiga AND NOT c.fechado THEN c.comp_nova ELSE c.comp_antiga END
   -- fix1: o PostgREST roda sob pg_safeupdate, que recusa UPDATE sem WHERE mesmo em tabela temporaria.
   WHERE c.lancamento_id IS NOT NULL;

  -- Projecao por escopo: quantas mudam, a marca que resultaria, o que o proximo gerar criaria (so o que ficou
  -- faltando ate' a marca antiga; dali em diante o gerar segue como sempre) e competencias repetidas (so listar).
  FOREACH v_e IN ARRAY ARRAY['futuros','todos'] LOOP
    SELECT max(CASE WHEN v_e = 'todos' THEN comp_fim_todos ELSE comp_fim_fut END),
           count(*) FILTER (WHERE comp_nova IS DISTINCT FROM comp_antiga AND NOT fechado AND (futuro OR v_e = 'todos'))
      INTO v_max, v_n FROM _rec_prop_comp;
    -- a marca so' se move quando alguma competencia muda: uma propagacao so' de classificacao nunca a toca
    -- (senao um mes cancelado de proposito voltaria no proximo gerar).
    v_md := CASE WHEN v_n > 0 THEN coalesce(v_max, v_marca_antes) ELSE v_marca_antes END;
    v_proj := v_proj || jsonb_build_object(v_e, jsonb_build_object(
      'alteradas', v_n,
      'marca_depois', v_md,
      'a_gerar', (SELECT coalesce(jsonb_agg(to_char(g.m, 'YYYY-MM') ORDER BY g.m), '[]'::jsonb)
                    FROM generate_series((date_trunc('month', v_md) + interval '1 month')::date,
                                         least(greatest(v_marca_antes, v_md), date_trunc('month', v_r.data_fim)::date),
                                         interval '1 month') AS g(m)
                   WHERE v_md IS NOT NULL AND v_marca_antes IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM _rec_prop_comp c
                                      WHERE (CASE WHEN v_e = 'todos' THEN c.comp_fim_todos ELSE c.comp_fim_fut END) = g.m::date)),
      'duplicidades', (SELECT coalesce(jsonb_agg(jsonb_build_object('competencia', to_char(d.k, 'YYYY-MM'), 'n', d.n) ORDER BY d.k), '[]'::jsonb)
                         FROM (SELECT (CASE WHEN v_e = 'todos' THEN comp_fim_todos ELSE comp_fim_fut END) AS k, count(*) AS n
                                 FROM _rec_prop_comp GROUP BY 1 HAVING count(*) > 1) d)));
  END LOOP;

  v_comp := jsonb_build_object(
    'desloc', v_desloc,
    'marca_antes', v_marca_antes,
    'futuros', (SELECT jsonb_build_object(
                  'alteradas', count(*) FILTER (WHERE NOT fechado),
                  'puladas_mes_fechado', count(*) FILTER (WHERE fechado),
                  'lista', coalesce((SELECT jsonb_agg(jsonb_build_object('lancamento_id', s.lancamento_id, 'venc', s.venc, 'comp_antiga', s.comp_antiga, 'comp_nova', s.comp_nova) ORDER BY s.venc)
                                       FROM (SELECT * FROM _rec_prop_comp WHERE futuro AND NOT fechado AND comp_nova IS DISTINCT FROM comp_antiga ORDER BY venc LIMIT 50) s), '[]'::jsonb))
                  FROM _rec_prop_comp WHERE futuro AND comp_nova IS DISTINCT FROM comp_antiga),
    'passados', (SELECT jsonb_build_object(
                  'alteradas', count(*) FILTER (WHERE NOT fechado),
                  'puladas_mes_fechado', count(*) FILTER (WHERE fechado),
                  'lista', coalesce((SELECT jsonb_agg(jsonb_build_object('lancamento_id', s.lancamento_id, 'venc', s.venc, 'comp_antiga', s.comp_antiga, 'comp_nova', s.comp_nova) ORDER BY s.venc)
                                       FROM (SELECT * FROM _rec_prop_comp WHERE NOT futuro AND NOT fechado AND comp_nova IS DISTINCT FROM comp_antiga ORDER BY venc LIMIT 50) s), '[]'::jsonb))
                  FROM _rec_prop_comp WHERE NOT futuro AND comp_nova IS DISTINCT FROM comp_antiga),
    'meses_fechados', (SELECT coalesce(jsonb_agg(DISTINCT ff.ano_mes ORDER BY ff.ano_mes), '[]'::jsonb)
                         FROM _rec_prop_comp c JOIN public.financeiro_fechamentos ff
                           ON ff.cliente_id = v_r.cliente_id AND ff.status_fechamento = 'fechado'
                          AND ff.ano_mes IN (to_char(c.comp_antiga, 'YYYY-MM'), to_char(c.comp_nova, 'YYYY-MM'))
                        WHERE c.fechado),
    'projecao', v_proj);

  IF p_simular OR p_escopo = 'nenhum' THEN
    RETURN jsonb_build_object('futuros', v_fut, 'passados', v_pas, 'aplicados_futuros', 0, 'aplicados_passados', 0, 'simulado', p_simular)
        || jsonb_build_object('competencia', v_comp);
  END IF;

  -- propagacao de regra nao e edicao manual do lancamento
  ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;

  -- futuros: tudo, inclusive valor
  UPDATE public.financeiro_lancamentos_v2 l
     SET descricao = v_r.descricao, favorecido_id = v_r.favorecido_id, fazenda_id = v_r.fazenda_id,
         conta_bancaria_id = CASE WHEN v_r.valor_base < 0 THEN v_r.conta_bancaria_id ELSE NULL END,
         conta_destino_id  = CASE WHEN v_r.valor_base > 0 THEN v_r.conta_bancaria_id ELSE NULL END,
         subcentro = v_r.subcentro, safra_id = v_r.safra_id,
         forma_pagamento = v_r.forma_pagamento, observacao = v_r.observacao,
         valor = abs(v_r.valor_base), updated_by = v_uid
   WHERE l.recorrencia_id = p_recorrencia_id AND coalesce(l.cancelado,false) = false
     AND l.status_transacao IN ('previsto','programado','agendado','meta') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL;
  GET DIAGNOSTICS v_ap_fut = ROW_COUNT;

  IF p_escopo = 'todos' THEN
    -- passados: classificacao e identificacao; nunca valor nem vencimento/pagamento (a competencia vem abaixo)
    UPDATE public.financeiro_lancamentos_v2 l
       SET descricao = v_r.descricao, favorecido_id = v_r.favorecido_id, fazenda_id = v_r.fazenda_id,
           conta_bancaria_id = CASE WHEN v_r.valor_base < 0 THEN v_r.conta_bancaria_id ELSE NULL END,
           conta_destino_id  = CASE WHEN v_r.valor_base > 0 THEN v_r.conta_bancaria_id ELSE NULL END,
           subcentro = v_r.subcentro, safra_id = v_r.safra_id,
           forma_pagamento = v_r.forma_pagamento, observacao = v_r.observacao, updated_by = v_uid
     WHERE l.recorrencia_id = p_recorrencia_id AND coalesce(l.cancelado,false) = false
       AND NOT (l.status_transacao IN ('previsto','programado','agendado','meta') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL);
    GET DIAGNOSTICS v_ap_pas = ROW_COUNT;
  END IF;

  -- competencia pela regra: futuros sempre; passados so' em 'todos'; mes fechado pulado (ver acima).
  -- ano_mes acompanha pelo trg_00_ano_mes_from_competencia.
  UPDATE public.financeiro_lancamentos_v2 l
     SET data_competencia = c.comp_nova, updated_by = v_uid
    FROM _rec_prop_comp c
   WHERE l.id = c.lancamento_id AND c.comp_nova IS DISTINCT FROM c.comp_antiga AND NOT c.fechado
     AND (c.futuro OR p_escopo = 'todos');
  GET DIAGNOSTICS v_ap_comp = ROW_COUNT;

  ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;

  -- marca d'agua: a maior competencia viva, para o proximo fn_recorrencia_gerar criar o que ficou faltando. A
  -- propagacao NAO cria lancamento. So' se move quando alguma competencia mudou (ver a projecao).
  v_marca_depois := v_marca_antes;
  IF v_ap_comp > 0 THEN
    SELECT max(data_competencia) INTO v_max FROM public.financeiro_lancamentos_v2
     WHERE recorrencia_id = p_recorrencia_id AND coalesce(cancelado,false) = false;
    IF v_max IS NOT NULL AND v_max IS DISTINCT FROM v_marca_antes THEN
      UPDATE public.financeiro_recorrencias
         SET ultimo_lancamento_gerado = v_max, updated_at = now(), updated_by = v_uid
       WHERE id = v_r.id;
      v_marca_depois := v_max;
    END IF;
  END IF;

  RETURN jsonb_build_object('futuros', v_fut, 'passados', v_pas, 'aplicados_futuros', v_ap_fut, 'aplicados_passados', v_ap_pas, 'simulado', false)
      || jsonb_build_object('competencia', v_comp || jsonb_build_object(
           'aplicadas', v_ap_comp,
           'marca_depois', v_marca_depois,
           'a_gerar', v_proj -> p_escopo -> 'a_gerar',
           'duplicidades', v_proj -> p_escopo -> 'duplicidades'));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_recorrencia_propagar(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_recorrencia_propagar(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_recorrencia_propagar(uuid, text, boolean) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.fn_recorrencia_propagar(uuid, text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01-fix1: anon ainda executa fn_recorrencia_propagar';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_recorrencia_propagar(uuid, text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01-fix1: authenticated perdeu o EXECUTE';
  END IF;
END
$$;
