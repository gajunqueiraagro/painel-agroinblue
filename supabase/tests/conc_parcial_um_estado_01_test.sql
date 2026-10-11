-- CONC-PARCIAL-UM-ESTADO-01 passo 1 — a OC enxerga o recebimento parcial da conferencia.
-- Roda como `postgres`, DEPOIS das migrations 20261027195700 e 20261027195800, e TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Tudo sintetico no cliente Teste (43f32d07); a OPERACAO de cada tipo e' copiada
-- de uma real so' na ESTRUTURA (cliente, fazenda e ids sao os do Teste; sem contraparte). Comparacoes com IS DISTINCT FROM.
-- T1 parcial pelo bloco, venda (a receber): liquidacao = aplicado, saldo = valor - aplicado, lancamento intocado; a leitura o lista.
-- T2 segundo parcial no mesmo titulo: UMA linha, valor = soma, data = a do ultimo.   T4a desfazer o segundo: volta ao primeiro.
-- T3 completou: titulo realizado pelo caminho de sempre, liquidacao no valor inteiro.   T4b desfazer tudo: estornada, OC como antes.
-- T5 a PAGAR (compra) e abate: o mesmo.   T6 lancamento sem OC: o gatilho nao escreve nada.
-- T7 liquidacao manual ativa: a recusa de sempre.   T8 tenant da leitura (outro cliente e sem usuario: 42501).
-- T9 a leitura = contagem direta em todos os clientes.   T10 1:1 com extrato MENOR: titulo de OC recusa; sem OC passa.
-- T11 1:1 EXATO em titulo de OC: passa.
CREATE FUNCTION pg_temp.ext(p_v numeric, p_d date) RETURNS uuid LANGUAGE sql AS $f$
  INSERT INTO extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, documento)
  VALUES ('43f32d07-dba8-4670-900c-bf645440c04a', '131b8501-caf7-4964-b1b1-3f552ad2b75d', p_d, p_v,
          CASE WHEN p_v > 0 THEN 'credito' ELSE 'debito' END, md5(random()::text), 'SINT parcial', 'SINT-' || gen_random_uuid()) RETURNING id $f$;
-- titulo programado de p_v; com p_oc ('venda' | 'compra' | 'abate') ganha operacao e parte viva. Compra = saida.
CREATE FUNCTION pg_temp.tit(p_v numeric, p_oc text) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  v_l uuid; v_op uuid := gen_random_uuid(); v_sai boolean := coalesce(p_oc = 'compra', false);
BEGIN
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id, data_competencia, data_vencimento, valor,
      sinal, tipo_operacao, status_transacao, descricao, subcentro, cenario)
  VALUES (c_cli, 'c2498ace-8478-410c-a697-d3f2e2934d1f', CASE WHEN v_sai THEN c_conta END, CASE WHEN NOT v_sai THEN c_conta END,
      '2031-03-01', '2031-03-04', p_v, CASE WHEN v_sai THEN '-1' ELSE '1' END, CASE WHEN v_sai THEN '2-Saídas' ELSE '1-Entradas' END,
      'programado', 'SINT parcial ' || coalesce(p_oc, 'sem OC'), NULL, 'realizado') RETURNING id INTO v_l;
  IF p_oc IS NULL THEN RETURN v_l; END IF;
  INSERT INTO zoo_operacoes_comerciais SELECT (jsonb_populate_record(NULL::zoo_operacoes_comerciais, to_jsonb(o) || jsonb_build_object(
      'id', v_op, 'cliente_id', c_cli, 'fazenda_id', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'contraparte_id', NULL, 'versao', 1,
      'is_teste', true, 'rascunho', false, 'status_comercial', 'fechada'))).*
    FROM zoo_operacoes_comerciais o WHERE o.tipo_operacao = p_oc AND o.rascunho IS NOT TRUE AND o.status_comercial <> 'cancelada'
     AND coalesce(o.modelo_financeiro, 'titulo') <> 'conta_corrente' ORDER BY o.created_at LIMIT 1;
  INSERT INTO zoo_operacao_partes (cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor,
      data_vencimento, descricao, financeiro_lancamento_id)
  VALUES (c_cli, v_op, 'manual', 'principal', 'principal', 1, 1, p_v, '2031-03-04', 'SINT parcial', v_l);
  RETURN v_l;
END $f$;
-- a liquidacao ATIVA do titulo: 'valor|data|natureza|origem', ou 'nada'; e quantas linhas (ativas ou nao) o titulo tem
CREATE FUNCTION pg_temp.liq(p_l uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce((SELECT round(q.valor, 2) || '|' || q.data || '|' || q.natureza || '|' || q.origem FROM zoo_operacao_liquidacoes q
                    WHERE q.financeiro_lancamento_id = p_l AND q.estornado = false), 'nada')
         || ' n=' || (SELECT count(*) FROM zoo_operacao_liquidacoes q WHERE q.financeiro_lancamento_id = p_l) $f$;
CREATE FUNCTION pg_temp.bloco(p_e uuid, p_l uuid, p_regra text) RETURNS uuid LANGUAGE sql AS $f$
  SELECT (fn_conciliar_bloco(ARRAY[p_e], ARRAY[p_l], p_regra, false) ->> 'bloco_id')::uuid $f$;

DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  a uuid; s uuid; b1 uuid; b2 uuid; b3 uuid; v_md5 text; v_t text; v_n bigint; v_m bigint; r record; v_ok text := ''; v_u uuid; v_op uuid;
BEGIN
  SET LOCAL lock_timeout = '2s'; SET LOCAL statement_timeout = '10s';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);

  -- §T1
  a := pg_temp.tit(150, 'venda');
  SELECT md5(l::text) INTO v_md5 FROM financeiro_lancamentos_v2 l WHERE l.id = a;
  b1 := pg_temp.bloco(pg_temp.ext(100, '2031-03-04'), a, 'mais_antigo_primeiro');
  IF pg_temp.liq(a) IS DISTINCT FROM '100.00|2031-03-04|recebimento|financeiro n=1' THEN RAISE EXCEPTION 'T1 liquidacao: %', pg_temp.liq(a); END IF;
  SELECT round(o.total_liquidado, 2) || '|' || round(o.saldo_aberto, 2) || '|' || o.estado INTO v_t FROM vw_oc_obrigacoes o WHERE o.titulo_id = a;
  IF v_t IS DISTINCT FROM '100.00|50.00|parcial' THEN RAISE EXCEPTION 'T1 view: %', v_t; END IF;
  IF (SELECT md5(l::text) FROM financeiro_lancamentos_v2 l WHERE l.id = a) IS DISTINCT FROM v_md5 THEN RAISE EXCEPTION 'T1: o lancamento mudou'; END IF;
  SELECT round(p.valor, 2) || '|' || round(p.aplicado, 2) || '|' || round(p.saldo, 2) || '|' || jsonb_array_length(p.partes) || '|' || (p.partes -> 0 ->> 'data') INTO v_t
    FROM fn_lancamentos_parciais(c_cli) p WHERE p.lancamento_id = a;
  IF v_t IS DISTINCT FROM '150.00|100.00|50.00|1|2031-03-04' THEN RAISE EXCEPTION 'T1 leitura: %', v_t; END IF;
  v_ok := v_ok || 'T1 ok; ';
  -- §T2 e T4a
  b2 := pg_temp.bloco(pg_temp.ext(30, '2031-03-09'), a, 'mais_antigo_primeiro');
  IF pg_temp.liq(a) IS DISTINCT FROM '130.00|2031-03-09|recebimento|financeiro n=1' THEN RAISE EXCEPTION 'T2: %', pg_temp.liq(a); END IF;
  PERFORM fn_desfazer_bloco(b2, 'teste');
  IF pg_temp.liq(a) IS DISTINCT FROM '100.00|2031-03-04|recebimento|financeiro n=1' THEN RAISE EXCEPTION 'T4a: %', pg_temp.liq(a); END IF;
  v_ok := v_ok || 'T2 ok; T4a ok; ';
  -- §T3 e T4b
  b3 := pg_temp.bloco(pg_temp.ext(50, '2031-03-12'), a, 'exato');
  IF (SELECT status_transacao || '|' || data_pagamento FROM financeiro_lancamentos_v2 WHERE id = a) IS DISTINCT FROM 'realizado|2031-03-12'
     OR pg_temp.liq(a) IS DISTINCT FROM '150.00|2031-03-12|recebimento|financeiro n=1' THEN
    RAISE EXCEPTION 'T3: % / %', (SELECT status_transacao FROM financeiro_lancamentos_v2 WHERE id = a), pg_temp.liq(a); END IF;
  PERFORM fn_desfazer_bloco(b3, 'teste');
  IF pg_temp.liq(a) IS DISTINCT FROM '100.00|2031-03-04|recebimento|financeiro n=1' THEN RAISE EXCEPTION 'T4b (1): %', pg_temp.liq(a); END IF;
  PERFORM fn_desfazer_bloco(b1, 'teste');
  SELECT round(o.total_liquidado, 2) || '|' || round(o.saldo_aberto, 2) || '|' || o.estado INTO v_t FROM vw_oc_obrigacoes o WHERE o.titulo_id = a;
  IF pg_temp.liq(a) IS DISTINCT FROM 'nada n=1' OR v_t IS DISTINCT FROM '0.00|150.00|nao_liquidada'
     OR (SELECT md5(l::text) FROM financeiro_lancamentos_v2 l WHERE l.id = a AND l.status_transacao = 'programado' AND l.data_pagamento IS NULL) IS NULL THEN
    RAISE EXCEPTION 'T4b (2): % / %', pg_temp.liq(a), v_t; END IF;
  v_ok := v_ok || 'T3 ok; T4b ok; ';
  -- §T5
  a := pg_temp.tit(80, 'compra'); PERFORM pg_temp.bloco(pg_temp.ext(-30, '2031-03-05'), a, 'mais_antigo_primeiro');
  IF pg_temp.liq(a) IS DISTINCT FROM '30.00|2031-03-05|pagamento|financeiro n=1' THEN RAISE EXCEPTION 'T5 compra: %', pg_temp.liq(a); END IF;
  a := pg_temp.tit(90, 'abate'); PERFORM pg_temp.bloco(pg_temp.ext(40, '2031-03-06'), a, 'mais_antigo_primeiro');
  IF pg_temp.liq(a) IS DISTINCT FROM '40.00|2031-03-06|recebimento|financeiro n=1' THEN RAISE EXCEPTION 'T5 abate: %', pg_temp.liq(a); END IF;
  v_ok := v_ok || 'T5 ok; ';
  -- §T6
  SELECT count(*) INTO v_n FROM zoo_operacao_liquidacoes;
  s := pg_temp.tit(70, NULL); PERFORM pg_temp.bloco(pg_temp.ext(20, '2031-03-07'), s, 'mais_antigo_primeiro');
  IF (SELECT count(*) FROM zoo_operacao_liquidacoes) IS DISTINCT FROM v_n OR pg_temp.liq(s) IS DISTINCT FROM 'nada n=0' THEN RAISE EXCEPTION 'T6: %', pg_temp.liq(s); END IF;
  v_ok := v_ok || 'T6 ok; ';
  -- §T7
  a := pg_temp.tit(60, 'venda');
  SELECT operacao_id INTO v_op FROM zoo_operacao_partes WHERE financeiro_lancamento_id = a;
  INSERT INTO zoo_operacao_liquidacoes (cliente_id, operacao_id, data, natureza, forma, valor, financeiro_lancamento_id, origem)
  VALUES (c_cli, v_op, '2031-03-01', 'recebimento', 'pix', 10, a, 'manual');
  v_t := NULL;
  BEGIN PERFORM pg_temp.bloco(pg_temp.ext(20, '2031-03-08'), a, 'mais_antigo_primeiro'); EXCEPTION WHEN others THEN v_t := SQLERRM; END;
  IF v_t IS NULL OR v_t NOT LIKE '%ja possui liquidacao manual ativa; sincronizacao automatica bloqueada%' THEN RAISE EXCEPTION 'T7: %', v_t; END IF;
  IF pg_temp.liq(a) IS DISTINCT FROM '10.00|2031-03-01|recebimento|manual n=1' THEN RAISE EXCEPTION 'T7 gravou: %', pg_temp.liq(a); END IF;
  v_ok := v_ok || 'T7 ok; ';
  -- §T10 e T11
  a := pg_temp.tit(150, 'venda'); v_t := NULL;
  BEGIN PERFORM fn_vincular_extrato_lancamento(pg_temp.ext(100, '2031-03-04'), a, 100); EXCEPTION WHEN sqlstate 'P0001' THEN v_t := SQLERRM; END;
  IF v_t IS DISTINCT FROM 'Este título é de operação comercial e o valor do extrato é menor que o do título. Faça o recebimento parcial pela Conferência (bloco). Nada foi gravado.'
     OR (SELECT status_transacao FROM financeiro_lancamentos_v2 WHERE id = a) IS DISTINCT FROM 'programado'
     OR public._fn_lancamento_aplicado_vivo(a) IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'T10 OC: %', v_t; END IF;
  s := pg_temp.tit(150, NULL);   -- sem OC: como sempre (passa, e o titulo e' promovido)
  PERFORM fn_vincular_extrato_lancamento(pg_temp.ext(100, '2031-03-04'), s, 100);
  IF (SELECT status_transacao FROM financeiro_lancamentos_v2 WHERE id = s) IS DISTINCT FROM 'realizado' THEN RAISE EXCEPTION 'T10 sem OC: nao passou'; END IF;
  PERFORM fn_vincular_extrato_lancamento(pg_temp.ext(150, '2031-03-04'), a, 150);
  IF (SELECT status_transacao FROM financeiro_lancamentos_v2 WHERE id = a) IS DISTINCT FROM 'realizado'
     OR pg_temp.liq(a) IS DISTINCT FROM '150.00|2031-03-04|recebimento|financeiro n=1' THEN RAISE EXCEPTION 'T11: %', pg_temp.liq(a); END IF;
  v_ok := v_ok || 'T10 ok; T11 ok; ';
  -- §T9 (como admin) e T8
  v_m := 0;
  FOR r IN SELECT id FROM clientes LOOP
    SELECT count(*) INTO v_n FROM fn_lancamentos_parciais(r.id);
    IF v_n IS DISTINCT FROM (SELECT count(*) FROM financeiro_lancamentos_v2 l WHERE l.cliente_id = r.id AND l.cancelado IS NOT TRUE
          AND l.status_transacao NOT IN ('realizado', 'conciliado')
          AND (SELECT sum(abs(c.valor_aplicado)) FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL) > 0
          AND (SELECT sum(abs(c.valor_aplicado)) FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL) < abs(l.valor)) THEN
      RAISE EXCEPTION 'T9: cliente % diverge (%)', r.id, v_n; END IF;
    v_m := v_m + v_n;
  END LOOP;
  IF v_m < 3 THEN RAISE EXCEPTION 'T9: a busca nao sabe achar (% linhas; os sinteticos parciais deste teste sao 3)', v_m; END IF;
  SELECT m.user_id INTO v_u FROM cliente_membros m JOIN auth.users u ON u.id = m.user_id
   WHERE m.ativo AND m.perfil <> 'admin_agroinblue' AND m.cliente_id <> c_cli
     AND NOT EXISTS (SELECT 1 FROM cliente_membros x WHERE x.user_id = m.user_id AND (x.cliente_id = c_cli OR x.perfil = 'admin_agroinblue')) LIMIT 1;
  IF v_u IS NULL THEN RAISE EXCEPTION 'T8: sem usuario de outro cliente para o teste'; END IF;
  FOREACH v_t IN ARRAY ARRAY[json_build_object('sub', v_u, 'role', 'authenticated')::text, ''] LOOP
    PERFORM set_config('request.jwt.claims', v_t, true);
    BEGIN PERFORM fn_lancamentos_parciais(c_cli); RAISE EXCEPTION 'T8: leu sem acesso (%)', v_t;
    EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  END LOOP;
  v_ok := v_ok || 'T9 ok (' || v_m || ' linhas nos clientes); T8 ok; ';
  RAISE EXCEPTION 'OK — %', v_ok;
END
$teste$;
