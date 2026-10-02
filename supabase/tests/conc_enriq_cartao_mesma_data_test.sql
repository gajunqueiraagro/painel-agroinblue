-- PR-CONC-ENRIQ-CARTAO-MESMA-DATA — teste em ROLLBACK (termina em RAISE: nada fica gravado).
-- Roda DEPOIS da migration 20261027191000. Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims).
-- O caso e' o REAL do NJ, Imp 04 (sessao dfd0f02c, Cartao BB Ourocard): a linha 274 (698,21, paga em 16/09) e a 275 (660,00,
-- 16/09), presas em lancamentos de 17/08, com o lancamento de 16/09 livre ao lado. A dfd0f02c so' e' LIDA (o Gabriel trabalha
-- nela): toda escrita e' em sessoes criadas aqui, com um fornecedor proprio por caso ('TESTE CARTAO Pn') na linha aplicada de
-- onde a memoria do populate herda.
--   P1  linha de cartao, 16/09, com o lancamento de 17/08 da MESMA chave aplicado em outra sessao e o de 16/09 livre ->
--       nao herda o de agosto; o casar a casa com o de 16/09.
--   P2  linha de cartao, mesma conta e mesma data -> herda ('ja_aplicado'), como as outras contas.
--   P3  Recasar: a linha de cartao 'ja_aplicado' NAO aplicada presa em agosto e' reaberta e casada com o de 16/09; a linha de
--       cartao APLICADA presa em agosto nao e' tocada (md5).
--   P4  o validador antigo (corpo cd12b3e2, recriado aqui em pg_temp) x o novo, sobre TODAS as linhas de staging com par:
--       nas contas que NAO sao cartao a saida e' identica (md5, com o tamanho do conjunto); nas de cartao ha diferenca (a
--       busca sabe achar).
DO $teste$
DECLARE
  c_ses   constant uuid := 'dfd0f02c-15fc-44bd-a3de-edefeeaac64a';
  c_fonte constant uuid := gen_random_uuid();   -- a sessao das "linhas aplicadas" de onde a memoria herda
  v_cli uuid; v_ses uuid; v_st text; v_lid uuid; n int; m int; v_ok boolean := true; v_out text := '';
  s274 record; s275 record; v_set274 uuid; v_set275 uuid; v_ra uuid := gen_random_uuid(); v_rb uuid := gen_random_uuid();
  v_rb_antes text; v_md5_novo text; v_md5_antigo text; v_dif_cartao int; v_n_cartao int;
BEGIN
  SET LOCAL lock_timeout = '3s';
  PERFORM set_config('statement_timeout', '60s', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);

  SELECT * INTO s274 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 274;
  SELECT * INTO s275 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 275;
  IF s274.staging_id IS NULL OR s275.staging_id IS NULL OR s274.match_lancamento_id IS NULL OR s275.match_lancamento_id IS NULL
     OR s274.excel_data_pagamento IS NULL OR s275.excel_data_pagamento IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-CARTAO-MESMA-DATA: HA FALHA — linhas 274/275 da dfd0f02c nao encontradas (ou sem par/data)';
  END IF;
  v_cli := s274.cliente_id;
  IF NOT EXISTS (SELECT 1 FROM financeiro_contas_bancarias WHERE id = s274.conta_origem_id AND tipo_conta = 'cartao') THEN
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-CARTAO-MESMA-DATA: HA FALHA — a conta da 274 deixou de ser cartao';
  END IF;
  -- o par de agosto e' de OUTRA data (e' o caso)
  IF (SELECT data_pagamento FROM financeiro_lancamentos_v2 WHERE id = s274.match_lancamento_id) = s274.excel_data_pagamento THEN
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-CARTAO-MESMA-DATA: HA FALHA — o par da 274 ja'' e'' da data da linha; o caso mudou';
  END IF;
  -- o lancamento de 16/09 (mesma conta, mesmo valor) e' UNICO, para a 274 e para a 275
  SELECT count(*), (array_agg(l.id))[1] INTO n, v_set274 FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = v_cli AND NOT l.cancelado AND l.data_pagamento = s274.excel_data_pagamento
     AND round(abs(l.valor), 2) = round(abs(s274.excel_valor), 2)
     AND public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id) = s274.conta_origem_id;
  SELECT count(*), (array_agg(l.id))[1] INTO m, v_set275 FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = v_cli AND NOT l.cancelado AND l.data_pagamento = s275.excel_data_pagamento
     AND round(abs(l.valor), 2) = round(abs(s275.excel_valor), 2)
     AND public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id) = s275.conta_origem_id;
  IF n <> 1 OR m <> 1 THEN
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-CARTAO-MESMA-DATA: HA FALHA — o lancamento de 16/09 nao e'' unico (274: %, 275: %)', n, m;
  END IF;

  -- ── P1 cartao, parcela de agosto aplicada em outra sessao, linha de setembro
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_valor, excel_data, excel_tipo_operacao,
    excel_fornecedor, match_lancamento_id, match_status, aplicado)
  VALUES (c_fonte, v_cli, 1, s274.excel_valor, s274.excel_data, s274.excel_tipo_operacao, 'TESTE CARTAO P1', s274.match_lancamento_id, 'exato', true);
  v_ses := gen_random_uuid();
  PERFORM fn_classificacao_populate_staging(v_ses, v_cli, jsonb_build_array(jsonb_build_object('linha', 274,
    'fornecedor', 'TESTE CARTAO P1', 'conta_origem_id', s274.conta_origem_id, 'conta_destino_id', s274.conta_destino_id,
    'ano_mes', s274.excel_ano_mes, 'data', s274.excel_data, 'valor', s274.excel_valor, 'tipo_operacao', s274.excel_tipo_operacao,
    'data_pagamento', s274.excel_data_pagamento)));
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 274;
  v_out := v_out || format(E'\nP1 populate: %s / %s (agosto %s)', v_st, COALESCE(left(v_lid::text, 8), '—'), left(s274.match_lancamento_id::text, 8));
  IF v_st = 'ja_aplicado' OR v_lid IS NOT DISTINCT FROM s274.match_lancamento_id THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  PERFORM fn_classificacao_casar_sessao(v_ses, to_char(s274.excel_data_pagamento, 'YYYY-MM'));
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 274;
  v_out := v_out || format(' | casar: %s / %s (16/09 %s)', v_st, COALESCE(left(v_lid::text, 8), '—'), left(v_set274::text, 8));
  IF v_lid IS DISTINCT FROM v_set274 THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P2 cartao, mesma conta e mesma data -> herda
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_valor, excel_data, excel_tipo_operacao,
    excel_fornecedor, match_lancamento_id, match_status, aplicado)
  VALUES (c_fonte, v_cli, 2, s274.excel_valor, s274.excel_data, s274.excel_tipo_operacao, 'TESTE CARTAO P2', v_set274, 'exato', true);
  v_ses := gen_random_uuid();
  PERFORM fn_classificacao_populate_staging(v_ses, v_cli, jsonb_build_array(jsonb_build_object('linha', 274,
    'fornecedor', 'TESTE CARTAO P2', 'conta_origem_id', s274.conta_origem_id, 'conta_destino_id', s274.conta_destino_id,
    'ano_mes', s274.excel_ano_mes, 'data', s274.excel_data, 'valor', s274.excel_valor, 'tipo_operacao', s274.excel_tipo_operacao,
    'data_pagamento', s274.excel_data_pagamento)));
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 274;
  v_out := v_out || format(E'\nP2 cartao mesma conta e data: %s / %s', v_st, COALESCE(left(v_lid::text, 8), '—'));
  IF v_st <> 'ja_aplicado' OR v_lid IS DISTINCT FROM v_set274 THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P3 Recasar: reabre a nao aplicada presa em agosto; nao toca a aplicada
  v_ses := gen_random_uuid();
  INSERT INTO financeiro_classificacao_staging
  SELECT (jsonb_populate_record(NULL::financeiro_classificacao_staging, to_jsonb(s) || jsonb_build_object(
            'staging_id', v_ra, 'sessao_id', v_ses, 'match_status', 'ja_aplicado', 'aplicado', false, 'aplicado_em', NULL,
            'estado_anterior', NULL))).*
    FROM financeiro_classificacao_staging s WHERE s.staging_id = s274.staging_id;
  INSERT INTO financeiro_classificacao_staging
  SELECT (jsonb_populate_record(NULL::financeiro_classificacao_staging, to_jsonb(s) || jsonb_build_object(
            'staging_id', v_rb, 'sessao_id', v_ses, 'match_status', 'ja_aplicado', 'aplicado', true,
            'aplicado_em', now() - interval '1 day', 'estado_anterior', '{}'::jsonb))).*
    FROM financeiro_classificacao_staging s WHERE s.staging_id = s275.staging_id;
  SELECT md5((to_jsonb(s) - 'updated_at')::text) INTO v_rb_antes FROM financeiro_classificacao_staging s WHERE s.staging_id = v_rb;
  PERFORM fn_classificacao_casar_sessao(v_ses, to_char(s274.excel_data_pagamento, 'YYYY-MM'));
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE staging_id = v_ra;
  v_out := v_out || format(E'\nP3 Recasar: nao aplicada %s -> %s / %s (16/09 %s)', left(s274.match_lancamento_id::text, 8), v_st,
    COALESCE(left(v_lid::text, 8), '—'), left(v_set274::text, 8));
  IF v_lid IS DISTINCT FROM v_set274 OR v_st = 'ja_aplicado' THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  v_out := v_out || format(' | aplicada intocada: %s',
    v_rb_antes = (SELECT md5((to_jsonb(s) - 'updated_at')::text) FROM financeiro_classificacao_staging s WHERE s.staging_id = v_rb));
  IF v_rb_antes IS DISTINCT FROM (SELECT md5((to_jsonb(s) - 'updated_at')::text) FROM financeiro_classificacao_staging s WHERE s.staging_id = v_rb) THEN
    v_ok := false; v_out := v_out || ' FALHOU';
  END IF;

  -- ── P4 antigo x novo: fora do cartao, identico
  EXECUTE $f$
    CREATE FUNCTION pg_temp.par_herdado_antigo(p_lancamento_id uuid, p_conta_linha uuid, p_data_pagamento date,
                                               p_mes_de date DEFAULT NULL::date, p_mes_ate date DEFAULT NULL::date)
     RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
    AS $body$
  SELECT EXISTS (
    SELECT 1 FROM public.financeiro_lancamentos_v2 l
     WHERE l.id = p_lancamento_id
       -- (a) mesma conta da linha
       AND public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id) = p_conta_linha
       AND (
         -- D2: conta de cartao dispensa a data (a do lancamento e' a da compra; a da planilha, a da fatura)
         EXISTS (SELECT 1 FROM public.financeiro_contas_bancarias cb WHERE cb.id = p_conta_linha AND cb.tipo_conta = 'cartao')
         -- (b) a data exata; sem data, a janela de mes (so' quem a passa: o casar, com o mes da sessao)
         OR COALESCE(CASE WHEN p_data_pagamento IS NOT NULL THEN l.data_pagamento = p_data_pagamento
                          ELSE l.data_pagamento BETWEEN p_mes_de AND p_mes_ate END, false)
       )
  )
$body$
  $f$;
  IF md5((SELECT prosrc FROM pg_proc WHERE proname = 'par_herdado_antigo' AND pronamespace = pg_my_temp_schema()))
     <> 'cd12b3e28ca72a93f013d503211b37ed' THEN
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-CARTAO-MESMA-DATA: HA FALHA — a copia do corpo antigo nao e'' o cd12b3e2';
  END IF;
  WITH amostra AS (
    SELECT s.staging_id, s.match_lancamento_id, COALESCE(s.conta_origem_id, s.conta_destino_id) conta, s.excel_data_pagamento,
           date_trunc('month', s.excel_data)::date de, (date_trunc('month', s.excel_data) + interval '1 month - 1 day')::date ate,
           EXISTS (SELECT 1 FROM financeiro_contas_bancarias cb WHERE cb.id = COALESCE(s.conta_origem_id, s.conta_destino_id)
                     AND cb.tipo_conta = 'cartao') cartao
      FROM financeiro_classificacao_staging s
     WHERE s.match_lancamento_id IS NOT NULL AND COALESCE(s.conta_origem_id, s.conta_destino_id) IS NOT NULL
  ), r AS (
    SELECT a.*, public._fn_classificacao_par_herdado_valido(a.match_lancamento_id, a.conta, a.excel_data_pagamento, a.de, a.ate) novo,
           pg_temp.par_herdado_antigo(a.match_lancamento_id, a.conta, a.excel_data_pagamento, a.de, a.ate) antigo
      FROM amostra a
  )
  SELECT count(*) FILTER (WHERE NOT cartao),
         md5(string_agg(staging_id::text || ':' || novo::text, ',' ORDER BY staging_id) FILTER (WHERE NOT cartao)),
         md5(string_agg(staging_id::text || ':' || antigo::text, ',' ORDER BY staging_id) FILTER (WHERE NOT cartao)),
         count(*) FILTER (WHERE cartao), count(*) FILTER (WHERE cartao AND novo IS DISTINCT FROM antigo)
    INTO n, v_md5_novo, v_md5_antigo, v_n_cartao, v_dif_cartao
    FROM r;
  v_out := v_out || format(E'\nP4 fora do cartao: %s linhas, md5 novo %s x antigo %s | cartao: %s linhas, %s mudam',
    n, left(v_md5_novo, 8), left(v_md5_antigo, 8), v_n_cartao, v_dif_cartao);
  IF n = 0 OR v_md5_novo IS DISTINCT FROM v_md5_antigo OR v_dif_cartao = 0 THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-CARTAO-MESMA-DATA — %', CASE WHEN v_ok THEN 'TODOS OK' ELSE 'HA FALHA' END || v_out;
END $teste$;
