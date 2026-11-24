-- DA-NOTA-JUROS-01 — fn_nota_completar com p_diferenca (juros / desconto). Roda como postgres com as claims de um admin; fixture
-- SINTÉTICO no cliente Teste (43f32d07); termina em RAISE 'OK…' (nada fica no banco).
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_plano constant uuid := 'f4fec107-569a-42a1-b413-bf133474c7fa';  -- Investimento em Instalações Pecuária (global)
  v_pago uuid; v_menor uuid; v_aberto uuid; r jsonb; v_n int; v_vals numeric[]; v_sub text; l record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);

  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, ano_mes, valor, tipo_operacao, sinal, descricao, status_transacao,
      data_pagamento, conta_bancaria_id, data_competencia, data_vencimento, plano_conta_id, cenario, origem_lancamento)
  VALUES (c_cli, c_faz, '2026-11', 3446.34, '2-Saídas', '-1', 'TESTE JUROS pago', 'realizado', '2026-11-06', c_conta, '2026-11-05', '2026-11-05', c_plano, 'realizado', 'manual')
  RETURNING id INTO v_pago;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, ano_mes, valor, tipo_operacao, sinal, descricao, status_transacao,
      data_pagamento, conta_bancaria_id, data_competencia, data_vencimento, plano_conta_id, cenario, origem_lancamento)
  VALUES (c_cli, c_faz, '2026-11', 3400.00, '2-Saídas', '-1', 'TESTE DESCONTO pago', 'realizado', '2026-11-04', c_conta, '2026-11-05', '2026-11-05', c_plano, 'realizado', 'manual')
  RETURNING id INTO v_menor;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, ano_mes, valor, tipo_operacao, sinal, descricao, status_transacao,
      conta_bancaria_id, data_competencia, data_vencimento, plano_conta_id, cenario, origem_lancamento)
  VALUES (c_cli, c_faz, '2026-11', 10.00, '2-Saídas', '-1', 'TESTE em aberto', 'programado', c_conta, '2026-11-05', '2026-11-20', c_plano, 'realizado', 'manual')
  RETURNING id INTO v_aberto;

  -- J1: sem motivo, pago > nota = a recusa de sempre (P167-B2)
  r := public.fn_nota_completar(c_cli, jsonb_build_array(jsonb_build_object('id', v_pago)), false, NULL, true, 3441.75);
  IF (r->>'ok')::boolean OR r->'recusas'->0->>'frase' NOT LIKE 'Os lançamentos somam R$ 3.446,34, mais que a nota%' THEN
    RAISE EXCEPTION 'J1 falhou: %', r;
  END IF;

  -- J2: juros, prévia: não recusa; a diferença e a parte de juros voltam; nada gravado
  r := public.fn_nota_completar(c_cli, jsonb_build_array(jsonb_build_object('id', v_pago)), false, NULL, true, 3441.75, '{"motivo":"juros"}');
  IF NOT (r->>'ok')::boolean OR (r->'diferenca'->>'diferenca')::numeric <> 4.59 OR (r->'diferenca'->'parte_juros'->>'valor')::numeric <> 4.59
     OR r->'diferenca'->'parte_juros'->>'lancamento_id' <> v_pago::text OR r->'diferenca'->>'motivo' <> 'juros' THEN
    RAISE EXCEPTION 'J2 falhou: %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_lancamento_partes p WHERE p.lancamento_id = v_pago) THEN RAISE EXCEPTION 'J2: a prévia gravou partes'; END IF;

  -- J3: juros, gravar: o MESMO pagamento fica dividido (nota na conta dele + juros em Despesas Financeiras); valor e status iguais
  r := public.fn_nota_completar(c_cli, jsonb_build_array(jsonb_build_object('id', v_pago)), false, NULL, false, 3441.75, '{"motivo":"juros"}');
  SELECT count(*), array_agg(p.valor ORDER BY p.valor DESC) INTO v_n, v_vals FROM public.financeiro_lancamento_partes p WHERE p.lancamento_id = v_pago;
  SELECT p.subcentro INTO v_sub FROM public.financeiro_lancamento_partes p WHERE p.lancamento_id = v_pago ORDER BY p.valor LIMIT 1;
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = v_pago;
  IF NOT (r->>'ok')::boolean OR v_n <> 2 OR v_vals <> ARRAY[3441.75, 4.59]::numeric[] OR v_sub <> 'Despesas Financeiras Administrativo'
     OR l.valor <> 3446.34 OR l.status_transacao <> 'realizado' OR l.data_pagamento <> '2026-11-06' OR l.conta_bancaria_id <> c_conta
     OR NOT l.classificacao_dividida OR l.plano_conta_id <> c_plano THEN
    RAISE EXCEPTION 'J3 falhou: r=% n=% vals=% sub=% valor=% status=% dividido=%', r, v_n, v_vals, v_sub, l.valor, l.status_transacao, l.classificacao_dividida;
  END IF;

  -- J4: o mesmo pago, agora já dividido: juros de novo recusa (dividir de novo apagaria as partes)
  r := public.fn_nota_completar(c_cli, jsonb_build_array(jsonb_build_object('id', v_pago)), false, NULL, true, 3441.75, '{"motivo":"juros"}');
  IF (r->>'ok')::boolean OR r->'recusas'->0->>'frase' NOT LIKE '%já tem a classificação dividida%' THEN RAISE EXCEPTION 'J4 falhou: %', r; END IF;

  -- J5: desconto NÃO desculpa o pago MAIOR que a nota (a guarda B2 recusa)
  r := public.fn_nota_completar(c_cli, jsonb_build_array(jsonb_build_object('id', v_menor)), false, NULL, true, 3000.00, '{"motivo":"desconto"}');
  IF (r->>'ok')::boolean OR r->'recusas'->0->>'frase' NOT LIKE 'Os lançamentos somam%' THEN RAISE EXCEPTION 'J5 falhou: %', r; END IF;

  -- J6: desconto com pago MENOR: passa, a diferença negativa volta, nada é dividido
  r := public.fn_nota_completar(c_cli, jsonb_build_array(jsonb_build_object('id', v_menor)), false, NULL, false, 3441.75, '{"motivo":"desconto"}');
  IF NOT (r->>'ok')::boolean OR (r->'diferenca'->>'diferenca')::numeric <> -41.75 OR r->'diferenca'->'parte_juros' <> 'null'::jsonb
     OR EXISTS (SELECT 1 FROM public.financeiro_lancamento_partes p WHERE p.lancamento_id = v_menor) THEN
    RAISE EXCEPTION 'J6 falhou: %', r;
  END IF;

  -- J7: juros com um lançamento EM ABERTO no pedido: recusa (juros só no que foi pago)
  r := public.fn_nota_completar(c_cli, jsonb_build_array(jsonb_build_object('id', v_menor), jsonb_build_object('id', v_aberto)), false, NULL, true, 3000.00,
                                '{"motivo":"juros"}');
  IF (r->>'ok')::boolean OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'recusas') x WHERE x->>'frase' LIKE 'Juros só no que já foi pago%') THEN
    RAISE EXCEPTION 'J7 falhou: %', r;
  END IF;

  -- J8: motivo inventado recusa; sem p_valor_nota tudo como antes
  r := public.fn_nota_completar(c_cli, jsonb_build_array(jsonb_build_object('id', v_menor)), false, NULL, true, 3441.75, '{"motivo":"bonus"}');
  IF (r->>'ok')::boolean OR r->'recusas'->0->>'frase' NOT LIKE 'Motivo da diferença «bonus» não existe%' THEN RAISE EXCEPTION 'J8a falhou: %', r; END IF;
  r := public.fn_nota_completar(c_cli, jsonb_build_array(jsonb_build_object('id', v_menor)), false, NULL, true);
  IF NOT (r->>'ok')::boolean OR r->'diferenca' <> 'null'::jsonb THEN RAISE EXCEPTION 'J8b falhou: %', r; END IF;

  RAISE EXCEPTION 'OK DA-NOTA-JUROS-01: J1–J8';
END $t$;
