-- FIN-FINANC-28 · FIX 4b — busca com parcela ZERADA. Sintetico no Teste, admin simulado; termina em RAISE 'OK' (nada fica).
-- Z1 parcela zerada: o pagamento do credor a 30 dias do vencimento APARECE (sem filtro de valor), com "parcela sem valor".
-- Z2 o credor casa tambem pelo CPF/CNPJ de outro cadastro (mesmo documento).
-- Z3 busca livre por valor ("777,77" e "777") acha o lancamento de OUTRO contrato e diz o vinculo atual (parcela_vinculada, movivel).
-- Z4 faixa "10pct" numa parcela com valor: fora de ±10% nao aparece; "qualquer" aparece com "valor fora de ±10%".
-- Z5 janela: fora de ±45 nao aparece; com de/ate de 180 dias aparece.
-- Z6 juros com juros previsto 0 nao e' recusado.
-- Z7 vincular na parcela zerada com p_atualizar_valor: o principal vira o valor do pagamento; desvincular volta a zero.
-- Z8 sem p_atualizar_valor a parcela zerada fica zerada.
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_amort constant uuid := '0d42d354-926a-4a10-ab3a-f082adaef972';
  v_cred uuid; v_cred2 uuid; v_fin uuid; v_fin2 uuid; v_pz uuid; v_pv uuid; v_q2 uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid; r jsonb; v_vinc uuid; q record;
  achou boolean;
BEGIN
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (c_cli, 'SINT BANCO ZERO', '11.222.333/0001-81', true) returning id into v_cred;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (c_cli, 'SINT BCO ZERO AGENCIA', '11.222.333/0001-81', true) returning id into v_cred2;
  insert into financiamentos (cliente_id, natureza, status, descricao, valor_total, numero_contrato, data_contrato, credor_id, fazenda_id, tipo_financiamento, conta_bancaria_id, total_parcelas)
  values (c_cli, 'financiamento', 'ativo', 'SINT FIX4B', 0, 'SINT-9911', '2021-01-10', v_cred, c_faz, 'pecuaria', c_cta, 2) returning id into v_fin;
  insert into financiamento_parcelas (cliente_id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (c_cli, v_fin, 6, '2021-10-15', 0, 0, 0, 'pendente') returning id into v_pz;
  insert into financiamento_parcelas (cliente_id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (c_cli, v_fin, 7, '2022-10-15', 1000, 0, 1000, 'pendente') returning id into v_pv;
  -- outro contrato, com um pagamento ja' vinculado
  insert into financiamentos (cliente_id, natureza, status, descricao, valor_total, numero_contrato, data_contrato, credor_id, fazenda_id, tipo_financiamento, conta_bancaria_id, total_parcelas)
  values (c_cli, 'financiamento', 'ativo', 'SINT FIX4B OUTRO', 777.77, 'SINT-8822', '2021-01-10', v_cred, c_faz, 'pecuaria', c_cta, 1) returning id into v_fin2;
  insert into financiamento_parcelas (cliente_id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (c_cli, v_fin2, 1, '2021-03-10', 777.77, 0, 777.77, 'pendente') returning id into v_q2;

  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento, data_pagamento, status_transacao, conta_bancaria_id, plano_conta_id, favorecido_id, cenario)
  values (c_cli, c_faz, '2-Saídas', 'SINT DEBITO', 1234.56, '2021-11-14', '2021-11-14', '2021-11-14', 'realizado', c_cta, c_amort, v_cred2, 'realizado') returning id into l1;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento, data_pagamento, status_transacao, conta_bancaria_id, plano_conta_id, favorecido_id, cenario)
  values (c_cli, c_faz, '2-Saídas', 'SINT PGTO OUTRO', 777.77, '2021-03-10', '2021-03-10', '2021-03-10', 'realizado', c_cta, c_amort, v_cred, 'realizado') returning id into l3;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento, data_pagamento, status_transacao, conta_bancaria_id, plano_conta_id, favorecido_id, cenario)
  values (c_cli, c_faz, '2-Saídas', 'SINT LONGE', 500, '2022-04-15', '2022-04-15', '2022-04-15', 'realizado', c_cta, c_amort, v_cred, 'realizado') returning id into l4;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento, data_pagamento, status_transacao, conta_bancaria_id, plano_conta_id, favorecido_id, cenario)
  values (c_cli, c_faz, '2-Saídas', 'SINT FORA DA FAIXA', 1500, '2022-10-20', '2022-10-20', '2022-10-20', 'realizado', c_cta, c_amort, v_cred, 'realizado') returning id into l2;
  r := public.fn_financiamento_parcela_vincular(v_q2, l3, 'total', false, false);

  -- Z1 + Z2
  r := public.fn_financiamento_candidatas(v_fin, 'parcela', v_pz);
  select exists (select 1 from jsonb_array_elements(r->'linhas') x where (x->>'lancamento_id')::uuid = l1
                   and x->'motivos' ? 'parcela sem valor — sugestão só por credor/data' and x->'motivos' ? 'favorecido = credor') into achou;
  IF not achou or (r->'busca'->>'faixa') <> 'qualquer' or (r->'busca'->>'sem_previsto')::boolean is not true THEN RAISE EXCEPTION 'Z1/Z2: %', r; END IF;

  -- Z3 busca livre por valor, com e sem centavos
  r := public.fn_financiamento_candidatas(v_fin, 'parcela', v_pz, '{"busca":"777,77"}');
  select exists (select 1 from jsonb_array_elements(r->'linhas') x where (x->>'lancamento_id')::uuid = l3
                   and x->'outro'->>'tipo' = 'parcela_vinculada' and (x->'outro'->>'movivel')::boolean) into achou;
  IF not achou THEN RAISE EXCEPTION 'Z3 centavos: %', r; END IF;
  r := public.fn_financiamento_candidatas(v_fin, 'parcela', v_pz, '{"busca":"777"}');
  IF not exists (select 1 from jsonb_array_elements(r->'linhas') x where (x->>'lancamento_id')::uuid = l3) THEN RAISE EXCEPTION 'Z3 inteiro: %', r; END IF;

  -- Z4 faixa na parcela com valor (1000): 1500 fora de ±10%
  r := public.fn_financiamento_candidatas(v_fin, 'parcela', v_pv);
  IF exists (select 1 from jsonb_array_elements(r->'linhas') x where (x->>'lancamento_id')::uuid = l2) THEN RAISE EXCEPTION 'Z4 10pct deixou passar'; END IF;
  r := public.fn_financiamento_candidatas(v_fin, 'parcela', v_pv, '{"faixa":"qualquer"}');
  IF not exists (select 1 from jsonb_array_elements(r->'linhas') x where (x->>'lancamento_id')::uuid = l2 and x->'motivos' ? 'valor fora de ±10% do previsto')
    THEN RAISE EXCEPTION 'Z4 qualquer: %', r; END IF;

  -- Z5 janela: l4 a 183 dias do vencimento da parcela 6
  r := public.fn_financiamento_candidatas(v_fin, 'parcela', v_pz);
  IF exists (select 1 from jsonb_array_elements(r->'linhas') x where (x->>'lancamento_id')::uuid = l4) THEN RAISE EXCEPTION 'Z5 fora da janela apareceu'; END IF;
  r := public.fn_financiamento_candidatas(v_fin, 'parcela', v_pz, '{"de":"2021-01-01","ate":"2022-12-31"}');
  IF not exists (select 1 from jsonb_array_elements(r->'linhas') x where (x->>'lancamento_id')::uuid = l4) THEN RAISE EXCEPTION 'Z5 janela larga: %', r; END IF;

  -- Z6 juros com juros 0
  r := public.fn_financiamento_parcela_vincular(v_pz, l1, 'juros', false, true);
  IF r->'recusa' <> 'null'::jsonb THEN RAISE EXCEPTION 'Z6: %', r; END IF;

  -- Z8 sem a resposta: fica zerada
  r := public.fn_financiamento_parcela_vincular(v_pz, l1, 'principal', false, true);
  IF (r->>'parcela_zerada')::boolean is not true or (r->>'valor_atualizado')::boolean THEN RAISE EXCEPTION 'Z8 simulado: %', r; END IF;

  -- Z7 com o SIM: o principal vira 1234,56; desvincular volta a zero
  r := public.fn_financiamento_parcela_vincular(v_pz, l1, 'principal', false, false, true);
  v_vinc := (r->>'vinculo_id')::uuid;
  select valor_principal, valor_juros, valor_total into q from financiamento_parcelas where id = v_pz;
  IF q.valor_principal <> 1234.56 or q.valor_total <> 1234.56 or (r->>'valor_atualizado')::boolean is not true THEN RAISE EXCEPTION 'Z7 vincular: % %', row_to_json(q), r; END IF;
  r := public.fn_financiamento_parcela_desvincular(v_vinc, 'teste', false);
  select valor_principal, valor_juros, valor_total into q from financiamento_parcelas where id = v_pz;
  IF coalesce(q.valor_principal, 0) <> 0 or coalesce(q.valor_total, 0) <> 0 THEN RAISE EXCEPTION 'Z7 desfazer: %', row_to_json(q); END IF;

  RAISE EXCEPTION 'OK';
END $t$;
