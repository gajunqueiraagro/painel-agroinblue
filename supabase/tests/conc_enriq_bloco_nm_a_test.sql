-- PR-CONC-ENRIQ-BLOCO-NM-A — teste do bloco conferido, do casar 1x1 manual e do Recasar. Termina em RAISE: nada persiste.
-- Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims). Caso real: NJ, Sicredi Lavoura, set/26, sessao 8d6efeb7.
-- P1 Emerson 6 x 20: conferir_bloco ok, diferenca 0,00; 6 linhas 'conferido_bloco' com os 20 ids; 1 bloco, 26 itens;
--    os 20 lancamentos com o MESMO md5 antes e depois.
-- P2 T Cortez 23 x 49: recusa 'soma_divergente' com +10.764,11.
-- P3 recusas: lancamento cru, ja' escolhido, conta diferente, linha aplicada, lista vazia, id duplicado.
-- P4 desfazer_bloco: as 6 linhas voltam EXATAMENTE (md5 da linha sem updated_at); sem motivo e 2x recusam.
-- P5 Recasar depois do bloco: com o patch, as 6 continuam 'conferido_bloco' e nenhum dos 20 vai para outra linha; com o
--    corpo ANTIGO (recriado por replace inverso e provado pelo md5 6725e204...), o furo aparece.
-- P6 casar_manual: classificado -> bloco 1x1 (9581442e x ead30a44); cru -> 'resolvido_manual' e a planilha sobe para a
--    proposta (dfcd0ec8 x d897b135, sessao 9bb66fe8); valor diferente recusa.
DO $teste$
DECLARE
  v_out text := '';
  c_ses   constant uuid := '8d6efeb7-7c62-4a1f-bcca-32e14a386fc2';
  c_conta constant uuid := '910e04b0-4148-4e58-885a-8937c8148581';
  c_velha constant text := $l$('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido')$l$;
  c_nova  constant text := $l$('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco')$l$;
  v_em_st uuid[]; v_em_lc uuid[]; v_tc_st uuid[]; v_tc_lc uuid[];
  v_r jsonb; v_bloco uuid; v_x uuid; v_y uuid;
  v_md5_lc_a text; v_md5_lc_d text; v_md5_st_a text; v_md5_st_d text;
  v_corpo text; v_velho text; v_args text; v_prop_a jsonb; v_prop_d jsonb;
  n int; m int; p5_novo_conf int; p5_novo_outros int; p5_velho_conf int; p5_velho_outros int;
BEGIN
  PERFORM set_config('statement_timeout', '90s', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);

  -- ── os conjuntos (o criterio da simulacao G da FASE 0)
  CREATE TEMP TABLE _ref ON COMMIT DROP AS
    SELECT match_lancamento_id AS id FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND match_lancamento_id IS NOT NULL
    UNION SELECT unnest(match_lancamento_ids) FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND match_lancamento_ids IS NOT NULL;
  SELECT array_agg(staging_id ORDER BY excel_linha_origem) INTO v_em_st FROM financeiro_classificacao_staging
   WHERE sessao_id = c_ses AND COALESCE(conta_origem_id, conta_destino_id) = c_conta AND match_status = 'sem_match' AND NOT aplicado
     AND excel_fornecedor ILIKE '%emerson%';
  SELECT array_agg(staging_id ORDER BY excel_linha_origem) INTO v_tc_st FROM financeiro_classificacao_staging
   WHERE sessao_id = c_ses AND COALESCE(conta_origem_id, conta_destino_id) = c_conta AND match_status = 'sem_match' AND NOT aplicado
     AND excel_fornecedor ILIKE '%cortez%';
  SELECT array_agg(l.id ORDER BY l.id) INTO v_em_lc FROM financeiro_lancamentos_v2 l JOIN financeiro_fornecedores f ON f.id = l.favorecido_id
   WHERE l.cancelado = false AND l.status_transacao = 'realizado' AND (l.conta_bancaria_id = c_conta OR l.conta_destino_id = c_conta)
     AND l.data_pagamento BETWEEN '2026-09-01' AND '2026-09-30' AND NOT EXISTS (SELECT 1 FROM _ref r WHERE r.id = l.id)
     AND f.nome ILIKE '%emerson%';
  SELECT array_agg(l.id ORDER BY l.id) INTO v_tc_lc FROM financeiro_lancamentos_v2 l JOIN financeiro_fornecedores f ON f.id = l.favorecido_id
   WHERE l.cancelado = false AND l.status_transacao = 'realizado' AND (l.conta_bancaria_id = c_conta OR l.conta_destino_id = c_conta)
     AND l.data_pagamento BETWEEN '2026-09-01' AND '2026-09-30' AND NOT EXISTS (SELECT 1 FROM _ref r WHERE r.id = l.id)
     AND f.nome ILIKE '%cortez%';
  IF coalesce(array_length(v_em_st, 1), 0) <> 6 OR coalesce(array_length(v_em_lc, 1), 0) <> 20
     OR coalesce(array_length(v_tc_st, 1), 0) <> 23 OR coalesce(array_length(v_tc_lc, 1), 0) <> 49 THEN
    RAISE EXCEPTION 'conjuntos inesperados: Emerson %x%, T Cortez %x%', array_length(v_em_st, 1), array_length(v_em_lc, 1),
      array_length(v_tc_st, 1), array_length(v_tc_lc, 1);
  END IF;
  v_out := format('conjuntos: Emerson %s x %s, T Cortez %s x %s', 6, 20, 23, 49);

  -- ── P3 recusas (antes do bloco: as linhas do Emerson ainda estao sem par)
  SELECT id INTO v_x FROM financeiro_lancamentos_v2
   WHERE conta_efetiva_id = c_conta AND cancelado = false AND status_transacao = 'realizado' AND plano_conta_id IS NULL
     AND origem_lancamento IN ('extrato', 'ofx') AND NOT EXISTS (SELECT 1 FROM _ref r WHERE r.id = financeiro_lancamentos_v2.id) LIMIT 1;
  IF v_x IS NULL THEN RAISE EXCEPTION 'P3: nenhum lancamento para provar a recusa (cru)'; END IF;
  v_r := fn_classificacao_conferir_bloco(c_ses, v_em_st, v_em_lc || v_x, true);
  v_out := v_out || E'\nP3 cru: ' || (v_r->>'motivo') || ' | ' || (v_r->>'mensagem');
  SELECT s.match_lancamento_id INTO v_x FROM financeiro_classificacao_staging s JOIN financeiro_lancamentos_v2 l ON l.id = s.match_lancamento_id
   WHERE s.sessao_id = c_ses AND COALESCE(s.conta_origem_id, s.conta_destino_id) = c_conta AND l.plano_conta_id IS NOT NULL
     AND l.status_transacao = 'realizado' AND l.cancelado = false AND l.conta_efetiva_id = c_conta LIMIT 1;
  IF v_x IS NULL THEN RAISE EXCEPTION 'P3: nenhum lancamento para provar a recusa (ja escolhido)'; END IF;
  v_r := fn_classificacao_conferir_bloco(c_ses, v_em_st, v_em_lc || v_x, true);
  v_out := v_out || E'\nP3 ja escolhido: ' || (v_r->>'motivo') || ' | ' || (v_r->>'mensagem');
  SELECT id INTO v_x FROM financeiro_lancamentos_v2
   WHERE cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd' AND conta_efetiva_id <> c_conta AND tipo_operacao NOT LIKE '3-%'
     AND cancelado = false AND status_transacao = 'realizado' AND plano_conta_id IS NOT NULL LIMIT 1;
  IF v_x IS NULL THEN RAISE EXCEPTION 'P3: nenhum lancamento para provar a recusa (conta diferente)'; END IF;
  v_r := fn_classificacao_conferir_bloco(c_ses, v_em_st, v_em_lc || v_x, true);
  v_out := v_out || E'\nP3 conta diferente: ' || (v_r->>'motivo') || ' | ' || (v_r->>'mensagem');
  -- a conta do Sicredi Lavoura nao tem linha aplicada: vale qualquer uma da sessao (a guarda de aplicada vem antes da de conta)
  SELECT staging_id INTO v_y FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND aplicado LIMIT 1;
  IF v_y IS NULL THEN RAISE EXCEPTION 'P3: nenhuma linha aplicada na sessao para provar a recusa'; END IF;
  v_r := fn_classificacao_conferir_bloco(c_ses, v_em_st || v_y, v_em_lc, true);
  v_out := v_out || E'\nP3 linha aplicada: ' || (v_r->>'motivo') || ' | ' || (v_r->>'mensagem');
  v_r := fn_classificacao_conferir_bloco(c_ses, ARRAY[]::uuid[], v_em_lc, true);
  v_out := v_out || E'\nP3 lista vazia: ' || (v_r->>'motivo');
  v_r := fn_classificacao_conferir_bloco(c_ses, v_em_st || v_em_st[1], v_em_lc, true);
  v_out := v_out || E'\nP3 id duplicado: ' || (v_r->>'motivo');

  -- ── P2 T Cortez
  v_r := fn_classificacao_conferir_bloco(c_ses, v_tc_st, v_tc_lc, true);
  v_out := v_out || E'\nP2 T Cortez: ' || (v_r->>'motivo') || ' dif ' || (v_r->>'diferenca') || ' | ' || (v_r->>'mensagem');

  -- ── P1 Emerson (gravado, dentro do ROLLBACK)
  SELECT md5(string_agg(to_jsonb(l)::text, '|' ORDER BY l.id)) INTO v_md5_lc_a FROM financeiro_lancamentos_v2 l WHERE l.id = ANY(v_em_lc);
  SELECT md5(string_agg((to_jsonb(s) - 'updated_at')::text, '|' ORDER BY s.staging_id)) INTO v_md5_st_a
    FROM financeiro_classificacao_staging s WHERE s.staging_id = ANY(v_em_st);
  v_r := fn_classificacao_conferir_bloco(c_ses, v_em_st, v_em_lc, true);
  v_out := v_out || E'\nP1 simulado: ' || (v_r->>'motivo') || ' dif ' || (v_r->>'diferenca') || ' bloco ' || coalesce(v_r->>'bloco_id', 'null');
  SELECT count(*) INTO n FROM classificacao_blocos WHERE sessao_id = c_ses;
  v_out := v_out || ' | blocos depois de simular: ' || n;
  v_r := fn_classificacao_conferir_bloco(c_ses, v_em_st, v_em_lc, false);
  v_bloco := (v_r->>'bloco_id')::uuid;
  v_out := v_out || E'\nP1 gravado: ' || (v_r->>'motivo') || ' dif ' || (v_r->>'diferenca') || ' planilha ' || (v_r->>'soma_planilha')
        || ' sistema ' || (v_r->>'soma_sistema');
  SELECT count(*) FILTER (WHERE match_status = 'conferido_bloco' AND match_lancamento_id IS NULL
                           AND match_lancamento_ids @> v_em_lc AND match_lancamento_ids <@ v_em_lc
                           AND casamento_meta->>'bloco_id' = v_bloco::text AND NOT aplicado), count(*)
    INTO n, m FROM financeiro_classificacao_staging WHERE staging_id = ANY(v_em_st);
  v_out := v_out || format(' | linhas conferido_bloco com os 20 ids: %s de %s', n, m);
  SELECT count(*) INTO n FROM classificacao_blocos WHERE sessao_id = c_ses;
  SELECT count(*) INTO m FROM classificacao_bloco_itens WHERE bloco_id = v_bloco;
  v_out := v_out || format(' | blocos %s, itens %s', n, m);
  SELECT md5(string_agg(to_jsonb(l)::text, '|' ORDER BY l.id)) INTO v_md5_lc_d FROM financeiro_lancamentos_v2 l WHERE l.id = ANY(v_em_lc);
  v_out := v_out || format(' | lancamentos (20 comparados) iguais: %s', v_md5_lc_a = v_md5_lc_d);

  -- ── P4 desfazer
  v_r := fn_classificacao_desfazer_bloco(v_bloco, '  ');
  v_out := v_out || E'\nP4 sem motivo: ' || (v_r->>'motivo');
  v_r := fn_classificacao_desfazer_bloco(v_bloco, 'teste do PR-CONC-ENRIQ-BLOCO-NM-A');
  v_out := v_out || ' | desfeito: ' || (v_r->>'motivo') || ' linhas ' || (v_r->>'linhas');
  SELECT md5(string_agg((to_jsonb(s) - 'updated_at')::text, '|' ORDER BY s.staging_id)), count(*) INTO v_md5_st_d, n
    FROM financeiro_classificacao_staging s WHERE s.staging_id = ANY(v_em_st);
  v_out := v_out || format(' | %s linhas comparadas, identicas ao antes: %s', n, v_md5_st_a = v_md5_st_d);
  v_r := fn_classificacao_desfazer_bloco(v_bloco, 'de novo');
  v_out := v_out || ' | 2a vez: ' || (v_r->>'motivo');

  -- ── P5 Recasar depois do bloco
  v_r := fn_classificacao_conferir_bloco(c_ses, v_em_st, v_em_lc, false);
  v_bloco := (v_r->>'bloco_id')::uuid;
  PERFORM fn_classificacao_casar_sessao(c_ses, '2026-09');
  SELECT count(*) INTO p5_novo_conf FROM financeiro_classificacao_staging
   WHERE staging_id = ANY(v_em_st) AND match_status = 'conferido_bloco' AND match_lancamento_ids @> v_em_lc;
  SELECT count(*) INTO p5_novo_outros FROM financeiro_classificacao_staging
   WHERE sessao_id = c_ses AND NOT (staging_id = ANY(v_em_st))
     AND (match_lancamento_id = ANY(v_em_lc) OR COALESCE(match_lancamento_ids, ARRAY[]::uuid[]) && v_em_lc);
  -- o corpo ANTIGO, por replace inverso, provado pelo md5 de origem; numa subtransacao desfeita
  BEGIN
    SELECT prosrc, pg_get_function_arguments(oid) INTO v_corpo, v_args FROM pg_proc
     WHERE oid = 'public.fn_classificacao_casar_sessao(uuid,text)'::regprocedure;
    v_velho := replace(v_corpo, $b1$  -- PR-CONC-ENRIQ-BLOCO-NM-A: os lancamentos das linhas preservadas, inclusive os de GRUPO e de BLOCO (match_lancamento_ids);
  -- antes so' o singular entrava, e o Recasar casava 1:1 um lancamento ja' explicado por um grupo
  SELECT COALESCE(array_agg(u.x), '{}'::uuid[]) INTO v_usados
  FROM (
    SELECT match_lancamento_id AS x FROM financeiro_classificacao_staging
     WHERE sessao_id = p_sessao_id AND match_lancamento_id IS NOT NULL
       AND (aplicado OR match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco'))
    UNION
    SELECT unnest(match_lancamento_ids) FROM financeiro_classificacao_staging
     WHERE sessao_id = p_sessao_id AND match_lancamento_ids IS NOT NULL
       AND (aplicado OR match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco'))
  ) u;
$b1$, $a1$  SELECT COALESCE(array_agg(match_lancamento_id), '{}'::uuid[]) INTO v_usados
  FROM financeiro_classificacao_staging
  WHERE sessao_id = p_sessao_id AND match_lancamento_id IS NOT NULL
    AND (aplicado OR match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido'));
$a1$);
    v_velho := replace(v_velho, c_nova, c_velha);
    IF md5(v_velho) <> '6725e204e186454cab6e69eccef3a527' THEN
      RAISE EXCEPTION 'P5: o corpo antigo reconstruido nao bate com o md5 de origem (%)', md5(v_velho);
    END IF;
    EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_classificacao_casar_sessao(' || v_args || ') RETURNS jsonb'
         || ' LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS $fn$' || v_velho || '$fn$';
    PERFORM fn_classificacao_casar_sessao(c_ses, '2026-09');
    SELECT count(*) INTO p5_velho_conf FROM financeiro_classificacao_staging
     WHERE staging_id = ANY(v_em_st) AND match_status = 'conferido_bloco' AND match_lancamento_ids @> v_em_lc;
    SELECT count(*) INTO p5_velho_outros FROM financeiro_classificacao_staging
     WHERE sessao_id = c_ses AND NOT (staging_id = ANY(v_em_st))
       AND (match_lancamento_id = ANY(v_em_lc) OR COALESCE(match_lancamento_ids, ARRAY[]::uuid[]) && v_em_lc);
    RAISE EXCEPTION USING ERRCODE = 'TSTP5', MESSAGE = 'desfaz o corpo antigo';
  EXCEPTION WHEN SQLSTATE 'TSTP5' THEN NULL;
  END;
  v_out := v_out || format(E'\nP5 com o patch: %s de 6 linhas seguem conferido_bloco, %s outras linhas com lancamento do bloco', p5_novo_conf, p5_novo_outros)
        || format(E'\nP5 corpo antigo (md5 6725e204 provado): %s de 6 seguem conferido_bloco, %s outras linhas com lancamento do bloco', p5_velho_conf, p5_velho_outros);
  SELECT md5(prosrc) INTO v_corpo FROM pg_proc WHERE oid = 'public.fn_classificacao_casar_sessao(uuid,text)'::regprocedure;
  v_out := v_out || ' | corpo vivo depois da subtransacao: ' || v_corpo;

  -- ── P6 casar_manual
  v_r := fn_classificacao_casar_manual('9581442e-0902-47d1-9626-d85df65146dc', 'ead30a44-ad12-4e86-9c6e-5b691a1417c1', false);
  SELECT match_status INTO v_corpo FROM financeiro_classificacao_staging WHERE staging_id = '9581442e-0902-47d1-9626-d85df65146dc';
  v_out := v_out || E'\nP6 classificado: ' || (v_r->>'motivo') || ' caminho ' || (v_r->>'caminho') || ' -> ' || v_corpo;
  SELECT update_proposto INTO v_prop_a FROM financeiro_classificacao_staging WHERE staging_id = 'dfcd0ec8-b838-49ef-8b94-e072ec717cb3';
  v_r := fn_classificacao_casar_manual('dfcd0ec8-b838-49ef-8b94-e072ec717cb3', 'd897b135-c57c-4103-9b29-101c04770e57', false);
  SELECT update_proposto, match_status INTO v_prop_d, v_corpo FROM financeiro_classificacao_staging WHERE staging_id = 'dfcd0ec8-b838-49ef-8b94-e072ec717cb3';
  v_out := v_out || E'\nP6 cru: ' || (v_r->>'motivo') || ' caminho ' || (v_r->>'caminho') || ' -> ' || v_corpo
        || ' | chaves novas na proposta: ' || coalesce((SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(v_prop_d) k
                                                        WHERE NOT (coalesce(v_prop_a, '{}'::jsonb) ? k) OR v_prop_d->k IS DISTINCT FROM v_prop_a->k), '(nenhuma)');
  SELECT s.staging_id, l.id INTO v_y, v_x
    FROM financeiro_classificacao_staging s
    JOIN financeiro_lancamentos_v2 l ON l.conta_efetiva_id = c_conta AND l.cancelado = false AND l.status_transacao = 'realizado'
     AND l.plano_conta_id IS NOT NULL AND l.sinal = '-1' AND l.tipo_operacao NOT LIKE '3-%' AND round(l.valor, 2) <> round(abs(s.excel_valor), 2)
     AND l.data_pagamento BETWEEN '2026-09-01' AND '2026-09-30' AND NOT EXISTS (SELECT 1 FROM _ref r WHERE r.id = l.id)
     AND NOT (l.id = ANY(v_em_lc))
   WHERE s.sessao_id = c_ses AND COALESCE(s.conta_origem_id, s.conta_destino_id) = c_conta AND s.match_status = 'sem_match' AND NOT s.aplicado
     AND s.excel_tipo_operacao LIKE '2-%' AND NOT (s.staging_id = ANY(v_em_st))
   LIMIT 1;
  IF v_x IS NULL OR v_y IS NULL THEN RAISE EXCEPTION 'P6: nenhum par para provar valor diferente'; END IF;
  v_r := fn_classificacao_casar_manual(v_y, v_x, true);
  v_out := v_out || E'\nP6 valor diferente: ' || (v_r->>'motivo') || ' | ' || (v_r->>'mensagem');

  RAISE EXCEPTION 'ENSAIO (rollback): %', v_out;
END
$teste$;
