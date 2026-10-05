-- OC-VINCULAR-PARCELA-SEGUINTE-01 — o "criar item" do Vincular entra como a PARCELA SEGUINTE do grupo.
--
-- Roda como `postgres`, DEPOIS da migration 20261027193200, numa transacao que TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Qualquer outra excecao e' falha e diz qual prova caiu.
--
-- Cenario sintetico no cliente Teste (43f32d07), no MOLDE do caso do Agnaldo (OC f74f95e5): venda de um lote, acordado
-- 294.595,00, com um compromisso principal de 200.000,00 e titulo PROGRAMADO (o estado em que a OC do Agnaldo ficou); chegam
-- dois recebimentos realizados do banco, 200.000,00 e 94.595,00.
-- ⚠ ATUALIZADO AO CONTRATO DO OC-VINCULAR-RECEBIMENTO-PARCIAL-01: o compromisso do cenario ja' nasce em 200.000 — desde aquele
--   PR um recebimento MENOR que o compromisso nao o encolhe mais (vira saldo), e o "criar item" deste teste precisa de um grupo
--   com o compromisso quitado. As linhas da operacao sao copiadas da OC real por `jsonb_populate_record` (so' a estrutura; cliente,
-- fazenda, ids e favorecido sao os do Teste) e os lancamentos sao inseridos aqui.
--
-- T1  vinculo do recebimento de 200.000 ao compromisso de 200.000: o titulo programado e' substituido e o compromisso fica
--     igual — o ESTADO DO AGNALDO (uma parte ativa 1/1 de 200.000 numa OC de 294.595 acordados).
-- T2  SIMULACAO do recebimento de 94.595 em "criar item": devolve parcela 2 de 2 e principal 294.595 / 294.595, e NAO grava.
-- T3  GRAVACAO: mesmos campos da simulacao; partes ativas = (1 de 2) e (2 de 2), soma = acordado; os dois lancamentos com
--     valor, pagamento e status identicos (a competencia do que entra segue a regra de sempre — a data da OC).
-- T4  passar do acordado AVISA e nao bloqueia: um terceiro recebimento vira a parcela 3 de 3 com `principal_excede_acordado`.
-- T5  parte CANCELADA nao ocupa sequencia: desvinculada a parcela 3, o proximo "criar item" volta a ser a 3.
-- T6  o gesto contrario (`oc_desvincular_lancamento`) da parcela 2: sobra UMA parte ativa, que passa a dizer 1/1.
-- T7  nada mais muda: os demais lancamentos do Teste tem a mesma assinatura antes e depois.
-- T8  colisao de unicidade NUNCA chega crua: forcada por um gatilho temporario, a funcao devolve a frase em portugues (P0001).
DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_op_molde constant uuid := 'f74f95e5-ecaa-4785-932a-abd37328a1f8';
  c_plano constant uuid := 'bfac4339-67a5-45f9-bd1f-dcaa60c56a2c';   -- Venda de Machos Adultos (plano global)
  v_op uuid := gen_random_uuid(); v_lote uuid := gen_random_uuid(); v_comp uuid := gen_random_uuid();
  v_prog uuid := gen_random_uuid(); v_parc uuid := gen_random_uuid(); v_tit uuid; v_l1 uuid; v_l2 uuid; v_l3 uuid; v_l4 uuid;
  v_ver int; v_sim jsonb; v_res jsonb; v_n int; v_txt text; v_soma numeric; v_ok text := '';
  v_fora_a text; v_fora_d text; v_ass_a text; v_ass_d text; v_md5_a text; v_md5_d text; v_parte2 uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  SELECT md5(coalesce(string_agg(md5(l::text), '' ORDER BY l.id), '')) INTO v_fora_a FROM financeiro_lancamentos_v2 l WHERE l.cliente_id = c_cli;

  -- ── o molde: operacao, lote, compromisso de 294.595, programacao, parcela ──
  INSERT INTO zoo_operacoes_comerciais SELECT (jsonb_populate_record(NULL::zoo_operacoes_comerciais, to_jsonb(o) || jsonb_build_object(
      'id', v_op, 'cliente_id', c_cli, 'fazenda_id', c_faz, 'contraparte_id', NULL, 'versao', 1, 'is_teste', true))).*
    FROM zoo_operacoes_comerciais o WHERE o.id = c_op_molde;
  INSERT INTO zoo_operacao_lotes SELECT (jsonb_populate_record(NULL::zoo_operacao_lotes, to_jsonb(l) || jsonb_build_object(
      'id', v_lote, 'cliente_id', c_cli, 'operacao_id', v_op))).*
    FROM zoo_operacao_lotes l WHERE l.operacao_id = c_op_molde;
  INSERT INTO zoo_operacao_compromissos SELECT (jsonb_populate_record(NULL::zoo_operacao_compromissos, to_jsonb(c) || jsonb_build_object(
      'id', v_comp, 'cliente_id', c_cli, 'operacao_id', v_op, 'lote_id', v_lote, 'favorecido_id', NULL, 'valor_total', 200000, 'status', 'programado'))).*
    FROM zoo_operacao_compromissos c WHERE c.operacao_id = c_op_molde AND c.status IS DISTINCT FROM 'cancelado' LIMIT 1;
  INSERT INTO zoo_operacao_programacoes SELECT (jsonb_populate_record(NULL::zoo_operacao_programacoes, to_jsonb(g) || jsonb_build_object(
      'id', v_prog, 'cliente_id', c_cli, 'compromisso_id', v_comp))).*
    FROM zoo_operacao_programacoes g JOIN zoo_operacao_compromissos c ON c.id = g.compromisso_id
   WHERE c.operacao_id = c_op_molde AND g.status = 'ativa' LIMIT 1;
  INSERT INTO zoo_operacao_parcelas_programacao SELECT (jsonb_populate_record(NULL::zoo_operacao_parcelas_programacao, to_jsonb(p) || jsonb_build_object(
      'id', v_parc, 'cliente_id', c_cli, 'programacao_id', v_prog, 'valor', 200000, 'conta_bancaria_id', c_conta, 'status', 'materializada'))).*
    FROM zoo_operacao_parcelas_programacao p JOIN zoo_operacao_programacoes g ON g.id = p.programacao_id
    JOIN zoo_operacao_compromissos c ON c.id = g.compromisso_id
   WHERE c.operacao_id = c_op_molde AND g.status = 'ativa' AND p.status IS DISTINCT FROM 'cancelada' LIMIT 1;
  SELECT count(*) INTO v_n FROM zoo_operacao_parcelas_programacao WHERE id = v_parc;
  IF v_n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'SETUP: o molde nao montou (parcela %)', v_n; END IF;

  -- o titulo PROGRAMADO da OC (294.595) e a parte dele; os recebimentos do banco
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_vencimento, valor, sinal,
      tipo_operacao, status_transacao, descricao, subcentro, plano_conta_id, origem_lancamento, ano_mes, cenario)
  VALUES (c_cli, c_faz, c_conta, '2026-08-25', '2026-09-01', 200000, '1', '1-Entradas', 'programado', 'ENSAIO Venda 055 B', 'Venda de Machos Adultos', c_plano, 'operacao_comercial', '2026-08', 'realizado')
  RETURNING id INTO v_tit;
  INSERT INTO zoo_operacao_partes (cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor,
      data_vencimento, descricao, incluso_no_total, plano_conta_id, subcentro, lote_id, programacao_parcela_id, financeiro_lancamento_id)
  VALUES (c_cli, v_op, 'programacao', 'principal', 'principal', 1, 1, 200000, '2026-09-01', 'Venda 055 B', false, c_plano,
      'Venda de Machos Adultos', v_lote, v_parc, v_tit);
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_pagamento, data_vencimento, valor, sinal,
      tipo_operacao, status_transacao, descricao, subcentro, plano_conta_id, origem_lancamento, ano_mes, cenario)
  VALUES (c_cli, c_faz, c_conta, '2026-08-25', '2026-09-01', '2026-09-01', 200000, '1', '1-Entradas', 'realizado', 'ENSAIO PIX 1', 'Venda de Machos Adultos', c_plano, 'extrato', '2026-09', 'realizado')
  RETURNING id INTO v_l1;
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_pagamento, data_vencimento, valor, sinal,
      tipo_operacao, status_transacao, descricao, subcentro, plano_conta_id, origem_lancamento, ano_mes, cenario)
  VALUES (c_cli, c_faz, c_conta, '2026-08-31', '2026-09-01', '2026-09-01', 94595, '1', '1-Entradas', 'realizado', 'ENSAIO Venda 015 cabecas', 'Venda de Machos Adultos', c_plano, 'extrato', '2026-09', 'realizado')
  RETURNING id INTO v_l2;

  -- ── T1: o recebimento de 200.000 no compromisso de 294.595 (o estado do Agnaldo) ──
  v_res := oc_vincular_lancamento(v_op, 1, v_l1, NULL, 'pgto 1/2', NULL, NULL, false, false);
  IF (v_res ->> 'ok') IS DISTINCT FROM 'true' OR (v_res -> 'compromisso' ->> 'acao') IS DISTINCT FROM 'mantido' OR (v_res -> 'compromisso' ->> 'valor_total')::numeric IS DISTINCT FROM 200000
     OR (v_res -> 'parte' ->> 'sequencia') IS DISTINCT FROM '1' OR (v_res -> 'parte' ->> 'quantidade') IS DISTINCT FROM '1' OR (v_res -> 'parte' ->> 'parcela_seguinte') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'T1 o primeiro vinculo: %', v_res; END IF;
  IF NOT (SELECT cancelado FROM financeiro_lancamentos_v2 WHERE id = v_tit) THEN RAISE EXCEPTION 'T1: o titulo programado nao foi cancelado'; END IF;
  SELECT count(*), sum(valor) INTO v_n, v_soma FROM zoo_operacao_partes WHERE operacao_id = v_op AND NOT cancelada;
  IF v_n IS DISTINCT FROM 1 OR v_soma IS DISTINCT FROM 200000 THEN RAISE EXCEPTION 'T1: partes ativas % somando %', v_n, v_soma; END IF;
  v_ok := v_ok || 'T1 ok (compromisso de 200.000 quitado pelo recebimento de 200.000, uma parte ativa 1/1; o acordado da OC segue 294.595); ';
  SELECT versao INTO v_ver FROM zoo_operacoes_comerciais WHERE id = v_op;

  -- ── T2: a simulacao do segundo recebimento ──
  SELECT md5(string_agg(md5(p::text), '' ORDER BY p.id)) INTO v_md5_a FROM zoo_operacao_partes p WHERE p.operacao_id = v_op;
  SELECT md5(l::text) INTO v_ass_a FROM financeiro_lancamentos_v2 l WHERE l.id = v_l2;
  v_sim := oc_vincular_lancamento(v_op, v_ver, v_l2, NULL, 'pgto 2/2', NULL, NULL, true, true);
  IF (v_sim ->> 'ok') IS DISTINCT FROM 'true' OR (v_sim ->> 'simulado') IS DISTINCT FROM 'true' OR (v_sim -> 'compromisso' ->> 'acao') IS DISTINCT FROM 'criado'
     OR (v_sim -> 'parte') IS DISTINCT FROM jsonb_build_object('sequencia', 2, 'quantidade', 2, 'parcela_seguinte', true, 'descricao', 'Venda 055 B')
     OR (v_sim -> 'principal') IS DISTINCT FROM jsonb_build_object('acordado', 294595.00, 'vinculado', 294595.00, 'recebido', 294595.00) THEN
    RAISE EXCEPTION 'T2 simulacao: parte % principal % (inteiro: %)', v_sim -> 'parte', v_sim -> 'principal', v_sim; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_sim -> 'avisos') a WHERE a ->> 'codigo' IN ('principal_excede_acordado', 'principal_diverge_da_base')) THEN
    RAISE EXCEPTION 'T2: aviso de divergencia com a soma fechando no acordado: %', v_sim -> 'avisos'; END IF;
  SELECT md5(string_agg(md5(p::text), '' ORDER BY p.id)) INTO v_md5_d FROM zoo_operacao_partes p WHERE p.operacao_id = v_op;
  SELECT md5(l::text) INTO v_ass_d FROM financeiro_lancamentos_v2 l WHERE l.id = v_l2;
  IF v_md5_a IS DISTINCT FROM v_md5_d OR v_ass_a IS DISTINCT FROM v_ass_d OR (SELECT versao FROM zoo_operacoes_comerciais WHERE id = v_op) IS DISTINCT FROM v_ver THEN
    RAISE EXCEPTION 'T2: a simulacao gravou'; END IF;
  v_ok := v_ok || 'T2 ok (simulacao: parcela 2 de 2, principal 294.595 de 294.595, nada gravado); ';

  -- ── T3: a gravacao = a simulacao ──
  SELECT md5(jsonb_build_object('v', valor, 'p', data_pagamento, 's', status_transacao, 'c', data_competencia, 'k', cancelado)::text) INTO v_ass_a
    FROM financeiro_lancamentos_v2 WHERE id = v_l1;
  v_res := oc_vincular_lancamento(v_op, v_ver, v_l2, NULL, 'pgto 2/2', NULL, NULL, true, false);
  IF (v_res -> 'parte') IS DISTINCT FROM (v_sim -> 'parte') OR (v_res -> 'principal') IS DISTINCT FROM (v_sim -> 'principal')
     OR (v_res -> 'compromisso' ->> 'acao') IS DISTINCT FROM (v_sim -> 'compromisso' ->> 'acao') OR (v_res -> 'avisos') IS DISTINCT FROM (v_sim -> 'avisos')
     OR (v_res -> 'lancamento' ->> 'competencia_nova') IS DISTINCT FROM (v_sim -> 'lancamento' ->> 'competencia_nova') THEN
    RAISE EXCEPTION 'T3 gravacao difere da simulacao: % x %', v_res, v_sim; END IF;
  SELECT string_agg(sequencia_parcela || '/' || quantidade_parcelas || '=' || valor::numeric(14,2), ' ' ORDER BY sequencia_parcela), sum(valor)
    INTO v_txt, v_soma FROM zoo_operacao_partes WHERE operacao_id = v_op AND NOT cancelada;
  IF v_txt IS DISTINCT FROM '1/2=200000.00 2/2=94595.00' OR v_soma IS DISTINCT FROM 294595 THEN RAISE EXCEPTION 'T3 partes ativas: % (soma %)', v_txt, v_soma; END IF;
  SELECT md5(jsonb_build_object('v', valor, 'p', data_pagamento, 's', status_transacao, 'c', data_competencia, 'k', cancelado)::text) INTO v_ass_d
    FROM financeiro_lancamentos_v2 WHERE id = v_l1;
  IF v_ass_a IS DISTINCT FROM v_ass_d THEN RAISE EXCEPTION 'T3: o primeiro recebimento mudou com o segundo vinculo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 WHERE id = v_l2 AND valor = 94595 AND data_pagamento = '2026-09-01'
                   AND status_transacao = 'realizado' AND cancelado IS NOT TRUE
                   AND data_competencia = (v_res -> 'lancamento' ->> 'competencia_nova')::date) THEN
    RAISE EXCEPTION 'T3: o segundo recebimento mudou de valor, pagamento ou status'; END IF;
  v_ok := v_ok || 'T3 ok (gravou = simulou: partes ' || v_txt || ', soma = acordado; valor, pagamento e status dos dois iguais; competencia do 2o = '
       || (v_res -> 'lancamento' ->> 'competencia_nova') || ', a regra de sempre); ';
  SELECT id INTO v_parte2 FROM zoo_operacao_partes WHERE operacao_id = v_op AND financeiro_lancamento_id = v_l2 AND NOT cancelada;
  SELECT versao INTO v_ver FROM zoo_operacoes_comerciais WHERE id = v_op;

  -- ── T4: passar do acordado avisa, nao bloqueia ──
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_pagamento, data_vencimento, valor, sinal,
      tipo_operacao, status_transacao, descricao, subcentro, plano_conta_id, origem_lancamento, ano_mes, cenario)
  VALUES (c_cli, c_faz, c_conta, '2026-08-25', '2026-09-02', '2026-09-02', 1000, '1', '1-Entradas', 'realizado', 'ENSAIO a mais', 'Venda de Machos Adultos', c_plano, 'extrato', '2026-09', 'realizado')
  RETURNING id INTO v_l3;
  v_res := oc_vincular_lancamento(v_op, v_ver, v_l3, NULL, 'a mais', NULL, NULL, true, false);
  IF (v_res ->> 'ok') IS DISTINCT FROM 'true' OR (v_res -> 'parte' ->> 'sequencia') IS DISTINCT FROM '3' OR (v_res -> 'parte' ->> 'quantidade') IS DISTINCT FROM '3'
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res -> 'avisos') a WHERE a ->> 'codigo' = 'principal_excede_acordado'
                      AND (a ->> 'excedente')::numeric = 1000 AND (a ->> 'acordado')::numeric = 294595 AND (a ->> 'vinculado')::numeric = 295595) THEN
    RAISE EXCEPTION 'T4 excedente: %', v_res; END IF;
  SELECT string_agg(sequencia_parcela || '/' || quantidade_parcelas, ' ' ORDER BY sequencia_parcela) INTO v_txt
    FROM zoo_operacao_partes WHERE operacao_id = v_op AND NOT cancelada;
  IF v_txt IS DISTINCT FROM '1/3 2/3 3/3' THEN RAISE EXCEPTION 'T4 partes: %', v_txt; END IF;
  v_ok := v_ok || 'T4 ok (acima do acordado: parcela 3 de 3 gravada, aviso principal_excede_acordado de 1.000,00); ';
  SELECT versao INTO v_ver FROM zoo_operacoes_comerciais WHERE id = v_op;

  -- ── T5: parte cancelada nao ocupa sequencia ──
  v_res := oc_desvincular_lancamento(v_op, v_ver, v_l3, 'desfaz o a mais', NULL, false);
  SELECT versao INTO v_ver FROM zoo_operacoes_comerciais WHERE id = v_op;
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_pagamento, data_vencimento, valor, sinal,
      tipo_operacao, status_transacao, descricao, subcentro, plano_conta_id, origem_lancamento, ano_mes, cenario)
  VALUES (c_cli, c_faz, c_conta, '2026-08-25', '2026-09-03', '2026-09-03', 500, '1', '1-Entradas', 'realizado', 'ENSAIO outro', 'Venda de Machos Adultos', c_plano, 'extrato', '2026-09', 'realizado')
  RETURNING id INTO v_l4;
  v_sim := oc_vincular_lancamento(v_op, v_ver, v_l4, NULL, 'outro', NULL, NULL, true, true);
  IF (v_sim -> 'parte' ->> 'sequencia') IS DISTINCT FROM '3' OR (v_sim -> 'parte' ->> 'quantidade') IS DISTINCT FROM '3' THEN
    RAISE EXCEPTION 'T5: a parte cancelada ocupou a sequencia: %', v_sim -> 'parte'; END IF;
  v_ok := v_ok || 'T5 ok (cancelada nao conta: o proximo item volta a ser a parcela 3); ';

  -- ── T6: o gesto contrario da parcela 2 ──
  v_res := oc_desvincular_lancamento(v_op, v_ver, v_l2, 'desfaz o 2/2', NULL, false);
  SELECT count(*), string_agg(sequencia_parcela || '/' || quantidade_parcelas || '=' || valor::numeric(14,2), ' ') INTO v_n, v_txt
    FROM zoo_operacao_partes WHERE operacao_id = v_op AND NOT cancelada;
  IF v_n IS DISTINCT FROM 1 OR v_txt NOT LIKE '1/%=200000.00' THEN RAISE EXCEPTION 'T6: depois de desvincular a parcela 2: % (%)', v_txt, v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 WHERE id = v_l2 AND valor = 94595 AND status_transacao = 'realizado'
                   AND data_pagamento = '2026-09-01' AND cancelado IS NOT TRUE) THEN
    RAISE EXCEPTION 'T6: o lancamento desvinculado mudou'; END IF;
  v_ok := v_ok || 'T6 ok (desvinculada a parcela 2: UMA parte ativa, ' || v_txt || ' — desde o OC-VINCULAR-RECEBIMENTO-PARCIAL-01 o desvincular recalcula a quantidade; o lancamento fica inteiro); ';

  -- ── T7: nada fora do ensaio ──
  SELECT md5(coalesce(string_agg(md5(l::text), '' ORDER BY l.id), '')) INTO v_fora_d FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = c_cli AND l.id NOT IN (v_tit, v_l1, v_l2, v_l3, v_l4);
  IF v_fora_a IS DISTINCT FROM v_fora_d THEN RAISE EXCEPTION 'T7: lancamento do Teste fora do ensaio mudou'; END IF;
  v_ok := v_ok || 'T7 ok (demais lancamentos do Teste com a mesma assinatura)';

  -- ── T8: a colisao nao chega crua (o gatilho so' existe dentro desta transacao) ──
  CREATE FUNCTION pg_temp._ensaio_colide() RETURNS trigger LANGUAGE plpgsql AS $f$
  BEGIN RAISE unique_violation USING MESSAGE = 'duplicate key value violates unique constraint "zoo_operacao_partes_identidade_lote"',
        CONSTRAINT = 'zoo_operacao_partes_identidade_lote'; END $f$;
  CREATE TRIGGER _ensaio_colide BEFORE INSERT ON zoo_operacao_partes FOR EACH ROW EXECUTE FUNCTION pg_temp._ensaio_colide();
  SELECT versao INTO v_ver FROM zoo_operacoes_comerciais WHERE id = v_op;
  BEGIN
    v_sim := oc_vincular_lancamento(v_op, v_ver, v_l2, NULL, 'colisao', NULL, NULL, true, true);
    RAISE EXCEPTION 'T8: a colisao nao estourou (%)', v_sim;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_txt = RETURNED_SQLSTATE;
    IF v_txt IS DISTINCT FROM 'P0001' OR SQLERRM IS DISTINCT FROM 'A operação já tem um item ativo com o mesmo lote, componente e número de parcela. Nada foi gravado.' THEN
      RAISE EXCEPTION 'T8: a colisao chegou crua ou com outra frase: [%] %', v_txt, SQLERRM; END IF;
  END;
  DROP TRIGGER _ensaio_colide ON zoo_operacao_partes;
  v_ok := v_ok || '; T8 ok (colisao de unicidade vira frase em portugues, P0001)';

  RAISE EXCEPTION 'OK %', v_ok;
END $teste$;
