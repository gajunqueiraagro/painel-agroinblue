-- PR-CONC-ENRIQ-CASADOR-MES — teste da memoria de aplicacao anterior (populate) e da reabertura do Recasar (casar).
-- Roda DEPOIS da migration 20261027190400, na mesma transacao. Termina em RAISE: nada persiste.
-- Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims). Lancamentos REAIS do NJ (sessao 8d6efeb7, set/26); a
-- "linha aplicada" de onde a memoria herda e' criada AQUI, numa sessao de teste, com um fornecedor proprio por caso
-- ('TESTE CASADOR Pn'), para o resultado nao depender das aplicacoes vivas.
-- P1  parcela: o lancamento de AGOSTO da linha 16 (BB 31/08, 22.400) aplicado; linha nova paga em 28/09 -> NAO herda; o casar
--     a casa com o gemeo de setembro.
-- P2  mesma conta e mesma data (o par valido da linha 3) -> herda ('ja_aplicado'), como antes.
-- P3  o mesmo, com a linha em OUTRA conta -> nao herda.
-- P4  duas linhas validas no mesmo lancamento, p_rows FORA de ordem (900 antes de 800) -> herda a 800, a 900 nao.
-- P5  linha de CARTAO (266, Ourocard), lancamento do cartao em 17/08, planilha paga em 16/09 -> herda (D2).
-- P6  dupla BB (265) + Cartao (266) no lancamento do cartao -> a do BB nao herda (conta), a do Cartao herda.
-- P7  Recasar da 8d6efeb7 com um bloco conferido (Rabobank, linha 10): reabre o 'ja_aplicado' nao aplicado invalido (337 vai
--     para o gemeo de setembro; 265 fica sem par), nao toca na aplicada (16) nem no bloco; 266 fica.
-- P8  estorno (140/141, 08/09) e transferencia (62, 21/09), mesma conta e mesma data -> herdam.
-- P9  _fn_conta_do_lancamento = o CASE vivo em TODOS os lancamentos do NJ (divergencias = 0; o tamanho do conjunto vai junto).
-- P10 linha SEM data de pagamento: lancamento com data_pagamento = `data` -> herda; mesmo mes, outro dia -> nao herda.
DO $teste$
DECLARE
  c_ses   constant uuid := '8d6efeb7-7c62-4a1f-bcca-32e14a386fc2';
  c_rabo  constant uuid := '2f5af2c4-3119-4869-b8d0-1b358fc66b91';
  c_lr    constant uuid[] := ARRAY['008fba27-80ef-4954-b183-508225066cd1', '2bca3d10-51ed-47e4-93af-2c5f00550f3f']::uuid[];
  c_fonte constant uuid := gen_random_uuid();   -- a sessao das "linhas aplicadas" de teste
  v_cli uuid; v_ses uuid; v_r jsonb; v_st text; v_lid uuid; n int; m int; v_ok boolean := true; v_out text := '';
  s3 record; s16 record; s265 record; s266 record; s140 record; s141 record; s62 record; s337 record;
  v_outra_conta uuid; v_l_set uuid; v_l_337 uuid; v_d date; v_d2 date; v_k int := 0;
  v_rabo_antes text; v_16_antes text;
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);

  SELECT cliente_id INTO v_cli FROM financeiro_classificacao_staging WHERE sessao_id = c_ses LIMIT 1;
  SELECT * INTO s3   FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 3;
  SELECT * INTO s16  FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 16;
  SELECT * INTO s265 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 265;
  SELECT * INTO s266 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 266;
  SELECT * INTO s140 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 140;
  SELECT * INTO s141 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 141;
  SELECT * INTO s62  FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 62;
  SELECT * INTO s337 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 337;
  IF s3.staging_id IS NULL OR s16.staging_id IS NULL OR s265.staging_id IS NULL OR s266.staging_id IS NULL
     OR s140.staging_id IS NULL OR s141.staging_id IS NULL OR s62.staging_id IS NULL OR s337.staging_id IS NULL
     OR s3.match_lancamento_id IS NULL OR s16.match_lancamento_id IS NULL OR s266.match_lancamento_id IS NULL
     OR s140.match_lancamento_id IS NULL OR s141.match_lancamento_id IS NULL OR s62.match_lancamento_id IS NULL THEN
    RAISE EXCEPTION 'linhas do caso nao encontradas (ou sem par)';
  END IF;
  -- o par da linha 3 e' valido (mesma conta, mesma data): e' o caso "como antes"
  IF NOT public._fn_classificacao_par_herdado_valido(s3.match_lancamento_id, COALESCE(s3.conta_origem_id, s3.conta_destino_id),
                                                     s3.excel_data_pagamento) THEN
    RAISE EXCEPTION 'o par da linha 3 deixou de ser valido; escolher outra linha para P2';
  END IF;

  -- ── P1 parcela
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_valor, excel_data, excel_tipo_operacao,
    excel_fornecedor, match_lancamento_id, match_status, aplicado)
  VALUES (c_fonte, v_cli, 1, s16.excel_valor, s16.excel_data, s16.excel_tipo_operacao, 'TESTE CASADOR P1', s16.match_lancamento_id, 'exato', true);
  SELECT count(*), (array_agg(l.id))[1] INTO n, v_l_set FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = v_cli AND l.cancelado = false AND l.data_pagamento = s16.excel_data_pagamento
     AND round(l.valor, 2) = round(abs(s16.excel_valor), 2)
     AND public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id) = s16.conta_origem_id;
  IF n <> 1 THEN RAISE EXCEPTION 'P1: o gemeo de setembro da linha 16 nao e'' unico (%)', n; END IF;
  v_ses := gen_random_uuid();
  PERFORM fn_classificacao_populate_staging(v_ses, v_cli, jsonb_build_array(jsonb_build_object('linha', 16,
    'fornecedor', 'TESTE CASADOR P1', 'conta_origem_id', s16.conta_origem_id, 'conta_destino_id', s16.conta_destino_id,
    'ano_mes', s16.excel_ano_mes, 'data', s16.excel_data, 'valor', s16.excel_valor, 'tipo_operacao', s16.excel_tipo_operacao,
    'data_pagamento', s16.excel_data_pagamento, 'subcentro', s16.excel_subcentro)));
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 16;
  v_out := v_out || format(E'\nP1 populate: %s / %s (agosto %s)', v_st, left(v_lid::text, 8), left(s16.match_lancamento_id::text, 8));
  IF v_st = 'ja_aplicado' OR v_lid IS NOT DISTINCT FROM s16.match_lancamento_id THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  v_r := fn_classificacao_casar_sessao(v_ses, '2026-09');
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 16;
  v_out := v_out || format(' | casar: %s / %s (setembro %s)', v_st, left(v_lid::text, 8), left(v_l_set::text, 8));
  IF v_lid IS DISTINCT FROM v_l_set THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P2 mesma conta e mesma data
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_valor, excel_data, excel_tipo_operacao,
    excel_fornecedor, match_lancamento_id, match_status, aplicado)
  VALUES (c_fonte, v_cli, 2, s3.excel_valor, s3.excel_data, s3.excel_tipo_operacao, 'TESTE CASADOR P2', s3.match_lancamento_id, 'exato', true);
  v_ses := gen_random_uuid();
  PERFORM fn_classificacao_populate_staging(v_ses, v_cli, jsonb_build_array(jsonb_build_object('linha', 3,
    'fornecedor', 'TESTE CASADOR P2', 'conta_origem_id', s3.conta_origem_id, 'conta_destino_id', s3.conta_destino_id,
    'ano_mes', s3.excel_ano_mes, 'data', s3.excel_data, 'valor', s3.excel_valor, 'tipo_operacao', s3.excel_tipo_operacao,
    'data_pagamento', s3.excel_data_pagamento)));
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 3;
  v_out := v_out || format(E'\nP2 mesma conta e data: %s / %s', v_st, left(v_lid::text, 8));
  IF v_st <> 'ja_aplicado' OR v_lid IS DISTINCT FROM s3.match_lancamento_id THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P3 outra conta
  SELECT id INTO v_outra_conta FROM financeiro_contas_bancarias
   WHERE cliente_id = v_cli AND tipo_conta = 'cc' AND id <> COALESCE(s3.conta_origem_id, s3.conta_destino_id) ORDER BY id LIMIT 1;
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_valor, excel_data, excel_tipo_operacao,
    excel_fornecedor, match_lancamento_id, match_status, aplicado)
  VALUES (c_fonte, v_cli, 3, s3.excel_valor, s3.excel_data, s3.excel_tipo_operacao, 'TESTE CASADOR P3', s3.match_lancamento_id, 'exato', true);
  v_ses := gen_random_uuid();
  PERFORM fn_classificacao_populate_staging(v_ses, v_cli, jsonb_build_array(jsonb_build_object('linha', 3,
    'fornecedor', 'TESTE CASADOR P3', 'conta_origem_id', v_outra_conta, 'conta_destino_id', CASE WHEN s3.conta_destino_id IS NOT NULL THEN v_outra_conta END,
    'ano_mes', s3.excel_ano_mes, 'data', s3.excel_data, 'valor', s3.excel_valor, 'tipo_operacao', s3.excel_tipo_operacao,
    'data_pagamento', s3.excel_data_pagamento)));
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 3;
  v_out := v_out || format(E'\nP3 outra conta: %s / %s', v_st, COALESCE(left(v_lid::text, 8), '—'));
  IF v_st = 'ja_aplicado' OR v_lid IS NOT DISTINCT FROM s3.match_lancamento_id THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P4 duas linhas validas, fora de ordem
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_valor, excel_data, excel_tipo_operacao,
    excel_fornecedor, match_lancamento_id, match_status, aplicado)
  VALUES (c_fonte, v_cli, 4, s3.excel_valor, s3.excel_data, s3.excel_tipo_operacao, 'TESTE CASADOR P4', s3.match_lancamento_id, 'exato', true);
  v_ses := gen_random_uuid();
  PERFORM fn_classificacao_populate_staging(v_ses, v_cli, jsonb_build_array(
    jsonb_build_object('linha', 900, 'fornecedor', 'TESTE CASADOR P4', 'conta_origem_id', s3.conta_origem_id, 'conta_destino_id', s3.conta_destino_id,
      'ano_mes', s3.excel_ano_mes, 'data', s3.excel_data, 'valor', s3.excel_valor, 'tipo_operacao', s3.excel_tipo_operacao,
      'data_pagamento', s3.excel_data_pagamento),
    jsonb_build_object('linha', 800, 'fornecedor', 'TESTE CASADOR P4', 'conta_origem_id', s3.conta_origem_id, 'conta_destino_id', s3.conta_destino_id,
      'ano_mes', s3.excel_ano_mes, 'data', s3.excel_data, 'valor', s3.excel_valor, 'tipo_operacao', s3.excel_tipo_operacao,
      'data_pagamento', s3.excel_data_pagamento)));
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 800;
  v_out := v_out || format(E'\nP4 linha 800: %s / %s', v_st, left(v_lid::text, 8));
  IF v_st <> 'ja_aplicado' OR v_lid IS DISTINCT FROM s3.match_lancamento_id THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 900;
  v_out := v_out || format(' | linha 900: %s / %s', v_st, COALESCE(left(v_lid::text, 8), '—'));
  IF v_st = 'ja_aplicado' THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P5 cartao, lancamento de outro mes
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_valor, excel_data, excel_tipo_operacao,
    excel_fornecedor, match_lancamento_id, match_status, aplicado)
  VALUES (c_fonte, v_cli, 5, s266.excel_valor, s266.excel_data, s266.excel_tipo_operacao, 'TESTE CASADOR P5', s266.match_lancamento_id, 'exato', true);
  v_ses := gen_random_uuid();
  PERFORM fn_classificacao_populate_staging(v_ses, v_cli, jsonb_build_array(jsonb_build_object('linha', 266,
    'fornecedor', 'TESTE CASADOR P5', 'conta_origem_id', s266.conta_origem_id, 'conta_destino_id', s266.conta_destino_id,
    'ano_mes', s266.excel_ano_mes, 'data', s266.excel_data, 'valor', s266.excel_valor, 'tipo_operacao', s266.excel_tipo_operacao,
    'data_pagamento', s266.excel_data_pagamento)));
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 266;
  v_out := v_out || format(E'\nP5 cartao (planilha %s, lancamento %s): %s / %s', s266.excel_data_pagamento,
    (SELECT data_pagamento FROM financeiro_lancamentos_v2 WHERE id = s266.match_lancamento_id), v_st, left(v_lid::text, 8));
  IF v_st <> 'ja_aplicado' OR v_lid IS DISTINCT FROM s266.match_lancamento_id THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P6 dupla BB + Cartao no lancamento do cartao (a chave da 266 nas duas)
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_valor, excel_data, excel_tipo_operacao,
    excel_fornecedor, match_lancamento_id, match_status, aplicado)
  VALUES (c_fonte, v_cli, 6, s266.excel_valor, s266.excel_data, s266.excel_tipo_operacao, 'TESTE CASADOR P6', s266.match_lancamento_id, 'exato', true);
  v_ses := gen_random_uuid();
  PERFORM fn_classificacao_populate_staging(v_ses, v_cli, jsonb_build_array(
    jsonb_build_object('linha', 265, 'fornecedor', 'TESTE CASADOR P6', 'conta_origem_id', s265.conta_origem_id, 'conta_destino_id', s265.conta_destino_id,
      'ano_mes', s266.excel_ano_mes, 'data', s266.excel_data, 'valor', s266.excel_valor, 'tipo_operacao', s266.excel_tipo_operacao,
      'data_pagamento', s265.excel_data_pagamento),
    jsonb_build_object('linha', 266, 'fornecedor', 'TESTE CASADOR P6', 'conta_origem_id', s266.conta_origem_id, 'conta_destino_id', s266.conta_destino_id,
      'ano_mes', s266.excel_ano_mes, 'data', s266.excel_data, 'valor', s266.excel_valor, 'tipo_operacao', s266.excel_tipo_operacao,
      'data_pagamento', s266.excel_data_pagamento)));
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 265;
  v_out := v_out || format(E'\nP6 265 (BB): %s / %s', v_st, COALESCE(left(v_lid::text, 8), '—'));
  IF v_st = 'ja_aplicado' OR v_lid IS NOT DISTINCT FROM s266.match_lancamento_id THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 266;
  v_out := v_out || format(' | 266 (Cartao): %s / %s', v_st, left(v_lid::text, 8));
  IF v_st <> 'ja_aplicado' OR v_lid IS DISTINCT FROM s266.match_lancamento_id THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P8 estorno e transferencia, mesma conta e mesma data
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_valor, excel_data, excel_tipo_operacao,
    excel_fornecedor, match_lancamento_id, match_status, aplicado)
  VALUES (c_fonte, v_cli, 81, s140.excel_valor, s140.excel_data, s140.excel_tipo_operacao, 'TESTE CASADOR P8a', s140.match_lancamento_id, 'exato', true),
         (c_fonte, v_cli, 82, s141.excel_valor, s141.excel_data, s141.excel_tipo_operacao, 'TESTE CASADOR P8b', s141.match_lancamento_id, 'exato', true),
         (c_fonte, v_cli, 83, s62.excel_valor,  s62.excel_data,  s62.excel_tipo_operacao,  'TESTE CASADOR P8c', s62.match_lancamento_id,  'exato', true);
  v_ses := gen_random_uuid();
  PERFORM fn_classificacao_populate_staging(v_ses, v_cli, jsonb_build_array(
    jsonb_build_object('linha', 140, 'fornecedor', 'TESTE CASADOR P8a', 'conta_origem_id', s140.conta_origem_id, 'conta_destino_id', s140.conta_destino_id,
      'ano_mes', s140.excel_ano_mes, 'data', s140.excel_data, 'valor', s140.excel_valor, 'tipo_operacao', s140.excel_tipo_operacao,
      'data_pagamento', s140.excel_data_pagamento),
    jsonb_build_object('linha', 141, 'fornecedor', 'TESTE CASADOR P8b', 'conta_origem_id', s141.conta_origem_id, 'conta_destino_id', s141.conta_destino_id,
      'ano_mes', s141.excel_ano_mes, 'data', s141.excel_data, 'valor', s141.excel_valor, 'tipo_operacao', s141.excel_tipo_operacao,
      'data_pagamento', s141.excel_data_pagamento),
    jsonb_build_object('linha', 62, 'fornecedor', 'TESTE CASADOR P8c', 'conta_origem_id', s62.conta_origem_id, 'conta_destino_id', s62.conta_destino_id,
      'ano_mes', s62.excel_ano_mes, 'data', s62.excel_data, 'valor', s62.excel_valor, 'tipo_operacao', s62.excel_tipo_operacao,
      'data_pagamento', s62.excel_data_pagamento)));
  SELECT count(*) FILTER (WHERE s.match_status = 'ja_aplicado' AND s.match_lancamento_id = o.match_lancamento_id), count(*),
         string_agg(format('%s %s/%s', s.excel_linha_origem, s.match_status, left(s.match_lancamento_id::text, 8)), ', ' ORDER BY s.excel_linha_origem)
    INTO n, m, v_st
    FROM financeiro_classificacao_staging s
    JOIN financeiro_classificacao_staging o ON o.sessao_id = c_ses AND o.excel_linha_origem = s.excel_linha_origem
   WHERE s.sessao_id = v_ses;
  v_out := v_out || format(E'\nP8 estorno e transferencia: %s de %s herdaram (%s)', n, m, v_st);
  IF n <> 3 OR m <> 3 THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P10 linha sem data de pagamento
  v_d := (SELECT data_pagamento FROM financeiro_lancamentos_v2 WHERE id = s3.match_lancamento_id);
  v_d2 := CASE WHEN extract(day FROM v_d) = 1 THEN v_d + 1 ELSE v_d - 1 END;
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_valor, excel_data, excel_tipo_operacao,
    excel_fornecedor, match_lancamento_id, match_status, aplicado)
  VALUES (c_fonte, v_cli, 101, s3.excel_valor, v_d,  s3.excel_tipo_operacao, 'TESTE CASADOR P10a', s3.match_lancamento_id, 'exato', true),
         (c_fonte, v_cli, 102, s3.excel_valor, v_d2, s3.excel_tipo_operacao, 'TESTE CASADOR P10b', s3.match_lancamento_id, 'exato', true);
  v_ses := gen_random_uuid();
  PERFORM fn_classificacao_populate_staging(v_ses, v_cli, jsonb_build_array(
    jsonb_build_object('linha', 1, 'fornecedor', 'TESTE CASADOR P10a', 'conta_origem_id', s3.conta_origem_id, 'conta_destino_id', s3.conta_destino_id,
      'ano_mes', to_char(v_d, 'YYYY-MM'), 'data', v_d, 'valor', s3.excel_valor, 'tipo_operacao', s3.excel_tipo_operacao),
    jsonb_build_object('linha', 2, 'fornecedor', 'TESTE CASADOR P10b', 'conta_origem_id', s3.conta_origem_id, 'conta_destino_id', s3.conta_destino_id,
      'ano_mes', to_char(v_d2, 'YYYY-MM'), 'data', v_d2, 'valor', s3.excel_valor, 'tipo_operacao', s3.excel_tipo_operacao)));
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 1;
  v_out := v_out || format(E'\nP10 sem data de pagamento, data = pagamento do lancamento (%s): %s / %s', v_d, v_st, left(v_lid::text, 8));
  IF v_st <> 'ja_aplicado' OR v_lid IS DISTINCT FROM s3.match_lancamento_id THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE sessao_id = v_ses AND excel_linha_origem = 2;
  v_out := v_out || format(' | mesmo mes, outro dia (%s): %s / %s', v_d2, v_st, COALESCE(left(v_lid::text, 8), '—'));
  IF v_st = 'ja_aplicado' THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P9 a regua: o dono x o CASE vivo
  SELECT count(*), count(*) FILTER (WHERE public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id)
                                     IS DISTINCT FROM (CASE WHEN l.tipo_operacao = '1-Entradas' THEN l.conta_destino_id ELSE l.conta_bancaria_id END))
    INTO n, m FROM financeiro_lancamentos_v2 l WHERE l.cliente_id = v_cli;
  v_out := v_out || format(E'\nP9 regua: %s lancamentos do NJ comparados, %s divergencias', n, m);
  IF n = 0 OR m <> 0 THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P7 Recasar da 8d6efeb7 (por ultimo: mexe na sessao real, so' nesta transacao)
  v_r := fn_classificacao_conferir_bloco(c_ses, ARRAY[c_rabo], c_lr, false);
  IF (v_r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'P7: o bloco do Rabobank nao conferiu: %', v_r; END IF;
  SELECT md5((to_jsonb(s) - 'updated_at')::text) INTO v_rabo_antes FROM financeiro_classificacao_staging s WHERE s.staging_id = c_rabo;
  SELECT md5((to_jsonb(s) - 'updated_at')::text) INTO v_16_antes FROM financeiro_classificacao_staging s WHERE s.staging_id = s16.staging_id;
  SELECT count(*), (array_agg(l.id))[1] INTO n, v_l_337 FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = v_cli AND l.cancelado = false AND l.data_pagamento = s337.excel_data_pagamento
     AND round(l.valor, 2) = round(abs(s337.excel_valor), 2)
     AND public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id) = COALESCE(s337.conta_origem_id, s337.conta_destino_id);
  IF n <> 1 THEN RAISE EXCEPTION 'P7: o gemeo de setembro da 337 nao e'' unico (%)', n; END IF;
  v_r := fn_classificacao_casar_sessao(c_ses, '2026-09');
  v_out := v_out || format(E'\nP7 Recasar: reabertas %s', v_r->>'reabertas');
  SELECT match_lancamento_id INTO v_lid FROM financeiro_classificacao_staging WHERE staging_id = s337.staging_id;
  v_out := v_out || format(' | 337 %s -> %s (gemeo %s)', left(s337.match_lancamento_id::text, 8), left(v_lid::text, 8), left(v_l_337::text, 8));
  IF v_lid IS DISTINCT FROM v_l_337 THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE staging_id = s265.staging_id;
  v_out := v_out || format(' | 265 -> %s / %s', v_st, COALESCE(left(v_lid::text, 8), '—'));
  IF v_lid IS NOT NULL THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  SELECT match_status, match_lancamento_id INTO v_st, v_lid FROM financeiro_classificacao_staging WHERE staging_id = s266.staging_id;
  v_out := v_out || format(' | 266 -> %s / %s', v_st, left(v_lid::text, 8));
  IF v_st <> 'ja_aplicado' OR v_lid IS DISTINCT FROM s266.match_lancamento_id THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  v_out := v_out || format(' | aplicada 16 identica: %s | bloco Rabobank identico: %s',
    v_16_antes = (SELECT md5((to_jsonb(s) - 'updated_at')::text) FROM financeiro_classificacao_staging s WHERE s.staging_id = s16.staging_id),
    v_rabo_antes = (SELECT md5((to_jsonb(s) - 'updated_at')::text) FROM financeiro_classificacao_staging s WHERE s.staging_id = c_rabo));
  IF v_16_antes <> (SELECT md5((to_jsonb(s) - 'updated_at')::text) FROM financeiro_classificacao_staging s WHERE s.staging_id = s16.staging_id)
     OR v_rabo_antes <> (SELECT md5((to_jsonb(s) - 'updated_at')::text) FROM financeiro_classificacao_staging s WHERE s.staging_id = c_rabo)
     OR (v_r->>'reabertas')::int <> 11 THEN
    v_ok := false; v_out := v_out || ' FALHOU';
  END IF;

  RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-CASADOR-MES — %', CASE WHEN v_ok THEN 'TODOS OK' ELSE 'HA FALHA' END || v_out;
END $teste$;
