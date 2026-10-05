-- REC-VALOR-DO-MES-MODAL-01 — a marca que o MODAL grava (um UPDATE so', como `authenticated`) faz o Propagar pular a conta;
-- o "Voltar ao previsto" (outro UPDATE so') devolve a conta ao Propagar.
--
-- Roda como `postgres`, numa transacao que TERMINA EM RAISE: nada fica no banco. Sucesso = a excecao final comeca com "OK".
-- Cenario sintetico no cliente Teste (43f32d07): uma recorrencia de 1.000 com 4 ocorrencias futuras, criada aqui dentro.
--
-- T0  a busca sabe achar: sem marca, a simulacao do Propagar diz puladas = 0.
-- T1  o UPDATE do modal (valor + valor_do_mes_em + valor_do_mes_origem = 'manual', numa instrucao, sob RLS, como o usuario):
--     grava 1 linha e nenhum gatilho desfaz a marca.
-- T2  a simulacao do Propagar ('futuros' e 'todos') devolve a conta como PULADA (1) e nao grava nada.
-- T3  o UPDATE do "Voltar ao previsto" (valor = |valor_base|, vencimento = o da regra, as duas colunas NULAS, uma instrucao,
--     como o usuario): a simulacao volta a puladas = 0, e a linha fica igual a' irma nao tocada em valor e vencimento da regra.
DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_rec uuid; v_alvo uuid; v_res jsonb; v_e text; v_n int; v_md5_a text; v_md5_d text; v_ok text := '';
  v_l financeiro_lancamentos_v2; v_r financeiro_recorrencias; v_venc_antes date;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base,
                                       dia_vencimento, data_inicio, primeiro_vencimento, data_fim, forma_pagamento, observacao)
  VALUES (c_cli, 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'ENSAIO Valor do mes', '131b8501-caf7-4964-b1b1-3f552ad2b75d',
          'Dividendos Despesas Familiares', -1000, 10, '2026-11-01', '2026-11-10', '2027-02-01', 'Boleto', 'obs')
  RETURNING id INTO v_rec;
  PERFORM fn_recorrencia_gerar(v_rec, NULL, false);
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_rec AND NOT cancelado;
  IF v_n <> 4 THEN RAISE EXCEPTION 'SETUP: % ocorrencias (esperado 4)', v_n; END IF;
  SELECT id, data_vencimento INTO v_alvo, v_venc_antes FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_rec AND data_competencia = '2026-12-01';
  -- a regra muda, para o Propagar ter o que aplicar
  UPDATE financeiro_recorrencias SET valor_base = -1500 WHERE id = v_rec;

  -- T0
  v_res := fn_recorrencia_propagar(v_rec, 'futuros', true);
  IF (v_res ->> 'puladas_valor_do_mes') <> '0' OR (v_res ->> 'futuros') <> '4' THEN RAISE EXCEPTION 'T0 sem marca: %', v_res; END IF;
  v_ok := v_ok || 'T0 ok (sem marca: 4 futuras, puladas 0); ';

  -- T1: o UPDATE do modal, como o usuario
  SET LOCAL ROLE authenticated;
  UPDATE financeiro_lancamentos_v2
     SET valor = 1234.56, data_vencimento = '2026-12-15', valor_do_mes_em = now(), valor_do_mes_origem = 'manual', editado_manual = true
   WHERE id = v_alvo;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T1: o UPDATE do modal gravou % linha(s)', v_n; END IF;
  SELECT * INTO v_l FROM financeiro_lancamentos_v2 WHERE id = v_alvo;
  IF v_l.valor <> 1234.56 OR v_l.data_vencimento <> '2026-12-15' OR v_l.valor_do_mes_em IS NULL OR v_l.valor_do_mes_origem <> 'manual' THEN
    RAISE EXCEPTION 'T1: a linha nao ficou como o UPDATE mandou: valor % venc % em % origem %', v_l.valor, v_l.data_vencimento, v_l.valor_do_mes_em, v_l.valor_do_mes_origem;
  END IF;
  v_ok := v_ok || 'T1 ok (UPDATE unico como authenticated: 1 linha, valor 1.234,56, marca manual); ';

  -- T2
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_md5_a FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_rec;
  FOREACH v_e IN ARRAY ARRAY['futuros', 'todos'] LOOP
    v_res := fn_recorrencia_propagar(v_rec, v_e, true);
    IF (v_res ->> 'puladas_valor_do_mes') <> '1' OR (v_res ->> 'simulado') <> 'true' THEN RAISE EXCEPTION 'T2 simulacao %: %', v_e, v_res; END IF;
  END LOOP;
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_md5_d FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_rec;
  IF v_md5_a <> v_md5_d THEN RAISE EXCEPTION 'T2: a simulacao gravou'; END IF;
  v_ok := v_ok || 'T2 ok (simulacao do Propagar: a conta marcada pelo modal e'' pulada, 1 nos dois escopos, nada gravado); ';

  -- T3: o "Voltar ao previsto", como o usuario (o previsto e' o da regra de AGORA: 1.500 no dia 10)
  SELECT * INTO v_r FROM financeiro_recorrencias WHERE id = v_rec;
  SET LOCAL ROLE authenticated;
  UPDATE financeiro_lancamentos_v2
     SET valor = abs(v_r.valor_base), data_vencimento = '2026-12-10', valor_do_mes_em = NULL, valor_do_mes_origem = NULL
   WHERE id = v_alvo;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T3: o UPDATE do voltar gravou % linha(s)', v_n; END IF;
  SELECT * INTO v_l FROM financeiro_lancamentos_v2 WHERE id = v_alvo;
  IF v_l.valor <> 1500 OR v_l.valor_do_mes_em IS NOT NULL OR v_l.valor_do_mes_origem IS NOT NULL
     OR v_l.data_vencimento <> _fn_recorrencia_vencimento(v_r, '2026-12-01'::date) OR v_l.data_vencimento <> v_venc_antes THEN
    RAISE EXCEPTION 'T3: a linha nao voltou ao previsto: valor % venc % (regra %, antes %) em %', v_l.valor, v_l.data_vencimento,
      _fn_recorrencia_vencimento(v_r, '2026-12-01'::date), v_venc_antes, v_l.valor_do_mes_em;
  END IF;
  v_res := fn_recorrencia_propagar(v_rec, 'futuros', true);
  IF (v_res ->> 'puladas_valor_do_mes') <> '0' OR (v_res ->> 'futuros') <> '4' THEN RAISE EXCEPTION 'T3 depois do voltar: %', v_res; END IF;
  v_ok := v_ok || 'T3 ok (voltar ao previsto: 1.500, vencimento da regra, marca nula; o Propagar volta a ver as 4, puladas 0)';

  RAISE EXCEPTION 'OK %', v_ok;
END $teste$;
