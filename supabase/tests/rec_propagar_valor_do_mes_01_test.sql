-- REC-PROPAGAR-VALOR-DO-MES-01 — o Propagar da recorrencia PULA a ocorrencia com o valor do mes ajustado.
--
-- Roda como `postgres`, DEPOIS da migration 20261027193100, numa transacao que TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Qualquer outra excecao e' falha e diz qual prova caiu.
-- Cenario sintetico no cliente Teste (43f32d07): uma recorrencia com 4 ocorrencias futuras; a de dezembro recebe o valor do
-- mes (1.234,56, vencimento levado a marco de proposito) e a marca; a REGRA muda (valor, descricao, observacao, forma).
--
-- T1  simulacao: 'futuros' e 'todos' devolvem puladas = 1 e nao gravam nada; 'nenhum' devolve 0.
-- T2  execucao em 'futuros' e em 'todos': 3 aplicadas, 1 pulada; a marcada nao muda em NENHUM campo (valor, vencimento,
--     descricao, competencia — linha inteira); as outras 3 ficam com a regra nova.
-- T3  sem a marca (a busca sabe achar): a mesma execucao regrava as 4 e move a competencia de dezembro.
-- T4  o CHECK recusa origem invalida e marca sem origem; a funcao segue sem `anon` e com `authenticated`.
DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  f regprocedure := 'public.fn_recorrencia_propagar(uuid, text, boolean)'::regprocedure;
  v_rec uuid; v_marc uuid; v_res jsonb; v_e text; v_n int; v_a jsonb; v_md5_a text; v_md5_d text; v_ok text := '';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base,
                                       dia_vencimento, data_inicio, primeiro_vencimento, data_fim, forma_pagamento, observacao)
  VALUES (c_cli, 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'ENSAIO Propagar', '131b8501-caf7-4964-b1b1-3f552ad2b75d',
          'Dividendos Despesas Familiares', -1000, 10, '2026-11-01', '2026-11-10', '2027-02-01', 'Boleto', 'obs antiga')
  RETURNING id INTO v_rec;
  PERFORM fn_recorrencia_gerar(v_rec, NULL, false);
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_rec AND NOT cancelado;
  IF v_n <> 4 THEN RAISE EXCEPTION 'SETUP: % ocorrencias (esperado 4)', v_n; END IF;
  UPDATE financeiro_lancamentos_v2 SET valor = 1234.56, data_vencimento = '2027-03-15', status_transacao = 'programado'
   WHERE recorrencia_id = v_rec AND data_competencia = '2026-12-01' RETURNING id INTO v_marc;
  UPDATE financeiro_recorrencias SET valor_base = -1500, descricao = 'ENSAIO Propagar NOVA', observacao = 'obs nova', forma_pagamento = 'PIX' WHERE id = v_rec;

  -- T3 primeiro (sem marca): a busca sabe achar
  BEGIN
    v_res := fn_recorrencia_propagar(v_rec, 'futuros', false);
    SELECT count(*) FILTER (WHERE valor = 1500), count(*) FILTER (WHERE data_competencia = '2027-03-01') INTO v_n, v_md5_a
      FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_rec;
    RAISE EXCEPTION USING MESSAGE = jsonb_build_object('regravadas', v_n, 'em_marco', v_md5_a, 'res', v_res)::text, ERRCODE = 'ENS01';
  EXCEPTION WHEN SQLSTATE 'ENS01' THEN
    IF (SQLERRM::jsonb ->> 'regravadas') <> '4' OR (SQLERRM::jsonb ->> 'em_marco') <> '1' OR (SQLERRM::jsonb -> 'res' ->> 'puladas_valor_do_mes') <> '0' THEN
      RAISE EXCEPTION 'T3 sem marca, esperava as 4 regravadas e dezembro em marco: %', SQLERRM;
    END IF;
  END;
  v_ok := v_ok || 'T3 ok (sem marca: 4 regravadas, competencia movida, puladas 0); ';

  UPDATE financeiro_lancamentos_v2 SET valor_do_mes_em = now(), valor_do_mes_origem = 'planilha' WHERE id = v_marc;
  SELECT to_jsonb(l) INTO v_a FROM financeiro_lancamentos_v2 l WHERE l.id = v_marc;
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_md5_a FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_rec;

  -- T1
  FOREACH v_e IN ARRAY ARRAY['futuros', 'todos'] LOOP
    v_res := fn_recorrencia_propagar(v_rec, v_e, true);
    IF (v_res ->> 'puladas_valor_do_mes') <> '1' OR (v_res -> 'valor_do_mes') <> '{"futuros": 1, "todos": 1}'::jsonb OR (v_res ->> 'futuros') <> '4' OR (v_res ->> 'simulado') <> 'true' THEN
      RAISE EXCEPTION 'T1 simulacao %: %', v_e, v_res;
    END IF;
  END LOOP;
  IF (fn_recorrencia_propagar(v_rec, 'nenhum', true) ->> 'puladas_valor_do_mes') <> '0' THEN RAISE EXCEPTION 'T1: "nenhum" diz que pula'; END IF;
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_md5_d FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_rec;
  IF v_md5_a <> v_md5_d THEN RAISE EXCEPTION 'T1: a simulacao gravou'; END IF;
  v_ok := v_ok || 'T1 ok (simulacao: puladas 1 nos dois escopos, 0 em "nenhum", nada gravado); ';

  -- T2
  FOREACH v_e IN ARRAY ARRAY['futuros', 'todos'] LOOP
    BEGIN
      v_res := fn_recorrencia_propagar(v_rec, v_e, false);
      SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_rec AND l.id <> v_marc
         AND l.valor = 1500 AND l.descricao = 'ENSAIO Propagar NOVA' AND l.observacao = 'obs nova' AND l.forma_pagamento = 'PIX';
      RAISE EXCEPTION USING MESSAGE = jsonb_build_object('res', v_res, 'marcada', (SELECT to_jsonb(l) FROM financeiro_lancamentos_v2 l WHERE l.id = v_marc), 'outras', v_n)::text, ERRCODE = 'ENS01';
    EXCEPTION WHEN SQLSTATE 'ENS01' THEN
      IF (SQLERRM::jsonb -> 'marcada') IS DISTINCT FROM v_a THEN RAISE EXCEPTION 'T2 %: a marcada MUDOU: % -> %', v_e, v_a, SQLERRM::jsonb -> 'marcada'; END IF;
      IF (SQLERRM::jsonb ->> 'outras') <> '3' THEN RAISE EXCEPTION 'T2 %: outras com a regra nova = %', v_e, SQLERRM::jsonb ->> 'outras'; END IF;
      IF (SQLERRM::jsonb -> 'res' ->> 'aplicados_futuros') <> '3' OR (SQLERRM::jsonb -> 'res' ->> 'puladas_valor_do_mes') <> '1' OR (SQLERRM::jsonb -> 'res' -> 'competencia' ->> 'aplicadas') <> '0' THEN
        RAISE EXCEPTION 'T2 %: retorno %', v_e, SQLERRM::jsonb -> 'res';
      END IF;
    END;
  END LOOP;
  v_ok := v_ok || 'T2 ok (execucao: 3 aplicadas, 1 pulada, a marcada identica campo a campo, nos dois escopos); ';

  -- T4
  BEGIN
    UPDATE financeiro_lancamentos_v2 SET valor_do_mes_origem = 'outra' WHERE id = v_marc;
    RAISE EXCEPTION 'T4: o CHECK aceitou origem invalida';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE financeiro_lancamentos_v2 SET valor_do_mes_origem = NULL WHERE id = v_marc;
    RAISE EXCEPTION 'T4: o CHECK aceitou marca sem origem';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF has_function_privilege('anon', f, 'EXECUTE') OR NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION 'T4: ACL da funcao mudou'; END IF;
  v_ok := v_ok || 'T4 ok (CHECK recusa origem invalida e marca sem origem; anon nao, authenticated sim)';

  RAISE EXCEPTION 'OK %', v_ok;
END $teste$;
