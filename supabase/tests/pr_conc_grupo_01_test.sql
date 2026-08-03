-- PR-CONC-GRUPO-FASE-1 — Testes das RPCs de grupo + constraints.
-- Rodar em HOMOLOG/PROTO (NUNCA prod). Transacional: cria fixtures efêmeros e faz ROLLBACK ao final —
-- nada é persistido. Usa FKs reais (cliente/conta/fazenda da Vera) + competência FUTURA (2099-01) para
-- não esbarrar em mês fechado. auth.uid() é NULL numa sessão SQL direta (criado_por/actor ficam NULL, ok).
-- Pré-requisito: migrations 01–03 aplicadas.
\set VERBOSITY verbose
BEGIN;

DO $$
DECLARE
  c_cli   uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; -- Vera Ligia Milani
  c_faz   uuid := '673f02ad-62b3-4b63-9557-f80af953a82f'; -- Administrativo
  c_conta uuid := '1afe76df-b61e-49f4-b637-f5ce020c778b'; -- Itaú Personalite
  v_ext   uuid;
  v_l1    uuid; v_l2 uuid; v_l3 uuid;
  v_res   jsonb;
  v_grupo uuid;
  v_n     int;
  v_err   text;
BEGIN
  -- Fixture: 1 OFX crédito 218.859,05 + 2 lançamentos (entrada) que somam exatamente.
  INSERT INTO extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, descricao, documento,
                                   valor, tipo_movimento, hash_movimento, status)
  VALUES (gen_random_uuid(), c_cli, c_conta, date '2099-01-15', 'TESTE PIX JBS', 'T-JBS',
          218859.05, 'credito', 'test-'||gen_random_uuid()::text, 'nao_conciliado')
  RETURNING id INTO v_ext;

  INSERT INTO financeiro_lancamentos_v2 (id, cliente_id, fazenda_id, ano_mes, data_pagamento, data_competencia,
                                         valor, sinal, tipo_operacao, status_transacao, descricao, cancelado)
  VALUES (gen_random_uuid(), c_cli, c_faz, '2099-01', date '2099-01-15', date '2099-01-15',
          109345.56, '1', '1-Entradas', 'realizado', 'TESTE Abate Novilhas', false) RETURNING id INTO v_l1;
  INSERT INTO financeiro_lancamentos_v2 (id, cliente_id, fazenda_id, ano_mes, data_pagamento, data_competencia,
                                         valor, sinal, tipo_operacao, status_transacao, descricao, cancelado)
  VALUES (gen_random_uuid(), c_cli, c_faz, '2099-01', date '2099-01-15', date '2099-01-15',
          109513.49, '1', '1-Entradas', 'realizado', 'TESTE Abate Vacas', false) RETURNING id INTO v_l2;

  -- (1) HAPPY PATH ----------------------------------------------------------------------------------
  v_res := fn_vincular_grupo_conciliacao(v_ext, ARRAY[v_l1, v_l2]);
  ASSERT (v_res->>'ok')::boolean, 'happy: ok=false';
  v_grupo := (v_res->>'grupo_id')::uuid;
  ASSERT v_grupo IS NOT NULL, 'happy: grupo_id nulo';
  ASSERT (v_res->>'status_extrato') = 'conciliado', 'happy: status != conciliado';
  ASSERT round((v_res->>'total_aplicado')::numeric,2) = 218859.05, 'happy: total != 218859.05';
  ASSERT round((v_res->>'diferenca')::numeric,2) = 0.00, 'happy: diferenca != 0';
  ASSERT (v_res->>'tipo_aprovacao') = 'agrupamento_manual', 'happy: tipo_aprovacao errado';
  SELECT count(*) INTO v_n FROM conciliacao_bancaria_itens
   WHERE grupo_id = v_grupo AND desfeito_em IS NULL AND tipo_aprovacao='agrupamento_manual';
  ASSERT v_n = 2, 'happy: nao gravou 2 itens do grupo';
  SELECT status INTO v_err FROM extrato_bancario_v2 WHERE id = v_ext;
  ASSERT v_err = 'conciliado', 'happy: extrato.status nao atualizado';

  -- (2) CHECK constraint: grupo_id sem tipo de agrupamento -----------------------------------------
  BEGIN
    UPDATE conciliacao_bancaria_itens SET tipo_aprovacao='manual' WHERE grupo_id=v_grupo AND desfeito_em IS NULL;
    RAISE EXCEPTION 'FALHA: chk_cbi_grupo_tipo nao barrou grupo_id + manual';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- (3) DESFAZER GRUPO -------------------------------------------------------------------------------
  v_res := fn_desfazer_grupo_conciliacao(v_grupo);
  ASSERT (v_res->>'itens_desfeitos')::int = 2, 'desfazer: itens_desfeitos != 2';
  SELECT count(*) INTO v_n FROM conciliacao_bancaria_itens WHERE grupo_id=v_grupo AND desfeito_em IS NULL;
  ASSERT v_n = 0, 'desfazer: sobrou item ativo';
  SELECT status INTO v_err FROM extrato_bancario_v2 WHERE id = v_ext;
  ASSERT v_err = 'nao_conciliado', 'desfazer: extrato nao voltou a nao_conciliado';

  -- (4) SOMA DIVERGE ---------------------------------------------------------------------------------
  BEGIN
    v_res := fn_vincular_grupo_conciliacao(v_ext, ARRAY[v_l1]); -- 1 só → array_vazio (>=2)
    RAISE EXCEPTION 'FALHA: array_vazio nao barrou grupo de 1';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE 'array_vazio%', 'esperado array_vazio, veio: '||SQLERRM; END;

  INSERT INTO financeiro_lancamentos_v2 (id, cliente_id, fazenda_id, ano_mes, data_pagamento, data_competencia,
                                         valor, sinal, tipo_operacao, status_transacao, descricao, cancelado)
  VALUES (gen_random_uuid(), c_cli, c_faz, '2099-01', date '2099-01-15', date '2099-01-15',
          1.00, '1', '1-Entradas', 'realizado', 'TESTE valor errado', false) RETURNING id INTO v_l3;
  BEGIN
    v_res := fn_vincular_grupo_conciliacao(v_ext, ARRAY[v_l1, v_l3]); -- soma != 218859.05
    RAISE EXCEPTION 'FALHA: soma_diverge nao barrou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE 'soma_diverge%', 'esperado soma_diverge, veio: '||SQLERRM; END;

  -- (5) LANÇAMENTO CANCELADO -------------------------------------------------------------------------
  UPDATE financeiro_lancamentos_v2 SET cancelado=true WHERE id=v_l3;
  BEGIN
    v_res := fn_vincular_grupo_conciliacao(v_ext, ARRAY[v_l1, v_l3]);
    RAISE EXCEPTION 'FALHA: lancamento_cancelado nao barrou';
  EXCEPTION WHEN others THEN
    ASSERT SQLERRM LIKE 'lancamento_cancelado%' OR SQLERRM LIKE 'soma_diverge%',
           'esperado lancamento_cancelado, veio: '||SQLERRM; END;

  RAISE NOTICE 'PR-CONC-GRUPO testes: TODOS OS ASSERTS PASSARAM';
END $$;

ROLLBACK;   -- nada é persistido
