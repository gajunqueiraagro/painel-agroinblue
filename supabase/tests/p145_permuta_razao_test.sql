-- P145 — a conta PERMUTA conta o razão dela (os "sem caixa" da própria conta); a conta comum continua sem os sem caixa.
-- Roda como `postgres`, numa transação que TERMINA EM RAISE: nada fica no banco. Sucesso = a exceção final começa com "OK".
-- Fixture SINTÉTICO no cliente Teste (43f32d07), mês 03/2031.
-- T1  permuta: as duas pontas sem caixa (entrada de 300 e saída de 100) e a de caixa (saída de 7) entram no movimento do sistema.
-- T2  conta comum: a saída SEM caixa (50) fica fora; a com caixa (20) entra — o de sempre.
DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  v_perm uuid := gen_random_uuid(); v_cc uuid := gen_random_uuid();
  v_n int; v_soma numeric; v_ok text := '';
BEGIN
  SET LOCAL lock_timeout = '2s'; SET LOCAL statement_timeout = '15s';
  INSERT INTO financeiro_contas_bancarias (id, cliente_id, nome_conta, tipo_conta) VALUES
    (v_perm, c_cli, 'ENSAIO P145 Permuta', 'permuta'), (v_cc, c_cli, 'ENSAIO P145 Conta', 'cc');
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id, data_competencia, data_vencimento,
      data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, cenario, sem_movimentacao_caixa) VALUES
    (c_cli, c_faz, NULL,   v_perm, '2031-03-01', '2031-03-10', '2031-03-10', 300, '1',  '1-Entradas', 'realizado', 'SINT barter entra', 'realizado', true),
    (c_cli, c_faz, v_perm, NULL,   '2031-03-01', '2031-03-11', '2031-03-11', 100, '-1', '2-Saídas',   'realizado', 'SINT barter sai',   'realizado', true),
    (c_cli, c_faz, v_perm, NULL,   '2031-03-01', '2031-03-12', '2031-03-12', 7,   '-1', '2-Saídas',   'realizado', 'SINT caixa sai',    'realizado', false),
    (c_cli, c_faz, v_cc,   NULL,   '2031-03-01', '2031-03-13', '2031-03-13', 50,  '-1', '2-Saídas',   'realizado', 'SINT cc sem caixa', 'realizado', true),
    (c_cli, c_faz, v_cc,   NULL,   '2031-03-01', '2031-03-14', '2031-03-14', 20,  '-1', '2-Saídas',   'realizado', 'SINT cc caixa',     'realizado', false);

  SELECT count(DISTINCT lancamento_id), round(coalesce(sum(valor), 0), 2) INTO v_n, v_soma
    FROM public.fn_caixa_sistema_pontas(c_cli, v_perm, '2031-03-01', '2031-03-31', false);
  IF v_n <> 3 OR v_soma <> 193 THEN RAISE EXCEPTION 'T1: permuta % lançamentos, soma % (esperado 3, 193)', v_n, v_soma; END IF;
  v_ok := v_ok || 'T1 ok (permuta: 3 lançamentos, +300 −100 −7 = 193); ';

  SELECT count(DISTINCT lancamento_id), round(coalesce(sum(valor), 0), 2) INTO v_n, v_soma
    FROM public.fn_caixa_sistema_pontas(c_cli, v_cc, '2031-03-01', '2031-03-31', false);
  IF v_n <> 1 OR v_soma <> -20 THEN RAISE EXCEPTION 'T2: conta comum % lançamentos, soma % (esperado 1, −20)', v_n, v_soma; END IF;
  v_ok := v_ok || 'T2 ok (conta comum: só o de caixa, −20); ';

  RAISE EXCEPTION 'OK P145 — %', v_ok;
END $teste$;
