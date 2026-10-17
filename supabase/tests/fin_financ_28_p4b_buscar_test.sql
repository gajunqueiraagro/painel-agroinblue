-- FIN-FINANC-28 · PASSO 4b — buscar entradas e pagamentos do contrato de credito. Roda depois da 20261027200300, numa transacao que
-- TERMINA EM RAISE (nada fica). Admin simulado; sintetico no cliente Teste: um financiamento de 1.000,00 com 2 parcelas (motor), um
-- credor, uma entrada de captacao e um pagamento de 550,00 (= o total da parcela 1).
-- B1 candidatas de liberacao: a entrada aparece com "valor = o que falta liberar"; a tela grava pelo salvar de sempre (passo 4).
-- B2 candidatas da parcela 1: o pagamento aparece com papel "total" e diferenca 0.
-- B3 SIMULACAO = GRAVACAO desfeita: o retorno diz o que acontece e nada muda.
-- B4 vincular (total): a parcela aponta para o pagamento, os dois programados sao CANCELADOS pelo dono, o pagamento so' ganha o
--    contrato (valor, status, plano, favorecido, conta e datas identicos por md5), a parcela fica paga na data do pagamento.
-- B5 o motor PULA a parcela vinculada; o total nao se reparte quando o valor do pagamento muda.
-- B6 o pagamento ja' vinculado aparece na parcela 2 como "parcela_vinculada" movivel; sem mover e' recusado.
-- B7 GESTO CONTRARIO: desvincular exige motivo; devolve a parcela, tira o contrato do pagamento e o motor recria os programados.
-- B9 parcela "paga sem lancamento": volta como estava, sem lancamento inventado.
-- B8 recusas: entrada como pagamento; lugar com pagamento vinculado; contrato de outro cliente (42501); anon nao executa.
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_amort constant uuid := '0d42d354-926a-4a10-ab3a-f082adaef972';
  c_entr constant uuid := '287caabf-91ba-40e2-82b6-379f33f31ab2';
  v_cred uuid; v_fin uuid; v_p1 uuid; v_p2 uuid; v_x uuid; v_y uuid; v_e uuid; v_vinc uuid;
  v_lp uuid; v_lj uuid; r jsonb; v_md5 text; v_ok boolean; v_n int; q record;
BEGIN
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'SINT BANCO QUATROB', true) returning id into v_cred;
  insert into financiamentos (cliente_id, natureza, status, descricao, valor_total, numero_contrato, data_contrato, credor_id, fazenda_id,
    tipo_financiamento, conta_bancaria_id, total_parcelas)
  values (c_cli, 'financiamento', 'ativo', 'SINT P4B CONTRATO', 1000, 'SINT-4477', '2031-01-10', v_cred, c_faz, 'pecuaria', c_cta, 2)
  returning id into v_fin;
  insert into financiamento_parcelas (cliente_id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (c_cli, v_fin, 1, '2031-06-10', 500, 50, 550, 'pendente') returning id into v_p1;
  insert into financiamento_parcelas (cliente_id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (c_cli, v_fin, 2, '2031-07-10', 500, 40, 540, 'pendente') returning id into v_p2;
  perform fn_reconciliar_parcela_financiamento(v_p1, false, true, c_cta);
  perform fn_reconciliar_parcela_financiamento(v_p2, false, true, c_cta);
  select lancamento_id, lancamento_juros_id into v_lp, v_lj from financiamento_parcelas where id = v_p1;
  IF v_lp is null or v_lj is null THEN RAISE EXCEPTION 'preparo: o motor nao criou os lancamentos da parcela 1'; END IF;

  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento, data_pagamento,
    status_transacao, conta_bancaria_id, plano_conta_id, favorecido_id, cenario)
  values (c_cli, c_faz, '2-Saídas', 'PAGTO PARCELA SINT-4477', 550, '2031-06-12', '2031-06-12', '2031-06-12', 'realizado', c_cta, c_amort, v_cred, 'realizado')
  returning id into v_x;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento, data_pagamento,
    status_transacao, conta_destino_id, plano_conta_id, favorecido_id, cenario)
  values (c_cli, c_faz, '1-Entradas', 'LIBERACAO SINT-4477', 1000, '2031-01-15', '2031-01-15', '2031-01-15', 'realizado', c_cta, c_entr, v_cred, 'realizado')
  returning id into v_e;
  select md5(concat_ws('|', valor, status_transacao, plano_conta_id, favorecido_id, conta_bancaria_id, data_pagamento, data_vencimento, data_competencia, cancelado))
    into v_md5 from financeiro_lancamentos_v2 where id = v_x;

  -- B1
  r := fn_financiamento_candidatas(v_fin, 'liberacao');
  IF (r->>'saldo_a_liberar')::numeric <> 1000 THEN RAISE EXCEPTION 'B1 saldo a liberar: %', r->>'saldo_a_liberar'; END IF;
  IF NOT exists (select 1 from jsonb_array_elements(r->'linhas') e where (e->>'lancamento_id')::uuid = v_e
                   and e->'motivos' ? 'valor = o que falta liberar' and e->'motivos' ? 'nº do contrato na descrição') THEN
    RAISE EXCEPTION 'B1 a entrada nao veio como esperado: %', r->'linhas';
  END IF;
  IF exists (select 1 from jsonb_array_elements(r->'linhas') e where (e->>'lancamento_id')::uuid = v_x) THEN RAISE EXCEPTION 'B1 saida entre as entradas'; END IF;

  -- B2
  r := fn_financiamento_candidatas(v_fin, 'parcela', v_p1);
  IF NOT exists (select 1 from jsonb_array_elements(r->'linhas') e where (e->>'lancamento_id')::uuid = v_x
                   and e->>'papel_sugerido' = 'total' and (e->>'diferenca')::numeric = 0 and e->'outro' = 'null'::jsonb) THEN
    RAISE EXCEPTION 'B2 o pagamento nao veio como total: %', r->'linhas';
  END IF;
  IF exists (select 1 from jsonb_array_elements(r->'linhas') e where (e->>'lancamento_id')::uuid in (v_lp, v_lj)) THEN
    RAISE EXCEPTION 'B2 os lancamentos do proprio contrato vieram como candidatos';
  END IF;

  -- B3
  r := fn_financiamento_parcela_vincular(v_p1, v_x, 'total', false, true);
  IF r->>'simulado' <> 'true' OR r->'recusa' <> 'null'::jsonb OR NOT (r->'cancelados') @> to_jsonb(array[v_lp, v_lj]) THEN RAISE EXCEPTION 'B3 retorno: %', r; END IF;
  select count(*) into v_n from financiamento_parcela_vinculos where financiamento_id = v_fin;
  IF v_n <> 0 OR (select lancamento_id from financiamento_parcelas where id = v_p1) <> v_lp
     OR (select cancelado from financeiro_lancamentos_v2 where id = v_lp) THEN RAISE EXCEPTION 'B3 a simulacao gravou'; END IF;

  -- B4
  r := fn_financiamento_parcela_vincular(v_p1, v_x, 'total', false, false);
  v_vinc := (r->>'vinculo_id')::uuid;
  select * into q from financiamento_parcelas where id = v_p1;
  IF q.lancamento_id <> v_x OR q.lancamento_juros_id is not null OR q.status <> 'pago' OR q.data_pagamento <> '2031-06-12'
     OR q.valor_principal <> 500 OR q.valor_juros <> 50 THEN RAISE EXCEPTION 'B4 parcela: %', row_to_json(q); END IF;
  IF NOT (select cancelado from financeiro_lancamentos_v2 where id = v_lp) OR NOT (select cancelado from financeiro_lancamentos_v2 where id = v_lj) THEN
    RAISE EXCEPTION 'B4 os programados nao foram cancelados';
  END IF;
  IF (select financiamento_id from financeiro_lancamentos_v2 where id = v_x) <> v_fin THEN RAISE EXCEPTION 'B4 o pagamento nao ganhou o contrato'; END IF;
  IF (select md5(concat_ws('|', valor, status_transacao, plano_conta_id, favorecido_id, conta_bancaria_id, data_pagamento, data_vencimento, data_competencia, cancelado))
        from financeiro_lancamentos_v2 where id = v_x) <> v_md5 THEN RAISE EXCEPTION 'B4 o pagamento do operador foi reescrito'; END IF;

  -- B5
  r := fn_reconciliar_parcela_financiamento(v_p1, false, true, null);
  IF r->>'skip' is distinct from 'pagamento_vinculado_pelo_operador' THEN RAISE EXCEPTION 'B5 o motor nao pulou: %', r; END IF;
  update financeiro_lancamentos_v2 set valor = 560 where id = v_x;
  IF (select valor_principal from financiamento_parcelas where id = v_p1) <> 500 THEN RAISE EXCEPTION 'B5 o total foi repartido'; END IF;
  update financeiro_lancamentos_v2 set valor = 550 where id = v_x;

  -- B6
  r := fn_financiamento_candidatas(v_fin, 'parcela', v_p2);
  IF NOT exists (select 1 from jsonb_array_elements(r->'linhas') e where (e->>'lancamento_id')::uuid = v_x
                   and e->'outro'->>'tipo' = 'parcela_vinculada' and (e->'outro'->>'movivel')::boolean) THEN
    RAISE EXCEPTION 'B6 o vinculado nao veio como movivel: %', r->'linhas';
  END IF;
  r := fn_financiamento_parcela_vincular(v_p2, v_x, 'total', false, true);
  IF r->'recusa'->>'frase' not like '%Confirme para mover%' THEN RAISE EXCEPTION 'B6 sem mover nao recusou: %', r; END IF;

  -- B7
  v_ok := false;
  BEGIN perform fn_financiamento_parcela_desvincular(v_vinc, '  ', false); EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'B7 desvincular sem motivo passou'; END IF;
  r := fn_financiamento_parcela_desvincular(v_vinc, 'teste', false);
  select * into q from financiamento_parcelas where id = v_p1;
  IF q.status <> 'pendente' OR q.data_pagamento is not null OR q.lancamento_id is null OR q.lancamento_id in (v_x, v_lp)
     OR q.lancamento_juros_id is null OR q.lancamento_juros_id = v_lj THEN RAISE EXCEPTION 'B7 parcela: % / motor %', row_to_json(q), r->'motor'; END IF;
  IF (select cancelado from financeiro_lancamentos_v2 where id = q.lancamento_id) OR (select status_transacao from financeiro_lancamentos_v2 where id = q.lancamento_id) = 'realizado' THEN
    RAISE EXCEPTION 'B7 o programado recriado nao esta em aberto';
  END IF;
  IF (select financiamento_id from financeiro_lancamentos_v2 where id = v_x) is not null THEN RAISE EXCEPTION 'B7 o contrato ficou no pagamento'; END IF;
  IF (select desfeito_em from financiamento_parcela_vinculos where id = v_vinc) is null THEN RAISE EXCEPTION 'B7 vinculo nao desfeito'; END IF;

  -- B8
  r := fn_financiamento_parcela_vincular(v_p1, v_e, 'principal', false, true);
  IF r->'recusa'->>'frase' not like '%tem de ser uma saída%' THEN RAISE EXCEPTION 'B8 entrada como pagamento: %', r; END IF;
  perform fn_financiamento_parcela_vincular(v_p1, v_x, 'principal', false, false);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento, data_pagamento,
    status_transacao, conta_bancaria_id, plano_conta_id, favorecido_id, cenario)
  values (c_cli, c_faz, '2-Saídas', 'PAGTO SINT-4477 outro', 550, '2031-06-13', '2031-06-13', '2031-06-13', 'realizado', c_cta, c_amort, v_cred, 'realizado')
  returning id into v_y;
  r := fn_financiamento_parcela_vincular(v_p1, v_y, 'total', false, true);
  IF r->'recusa' = 'null'::jsonb THEN RAISE EXCEPTION 'B8 lugar ocupado aceitou: %', r; END IF;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  v_ok := false;
  BEGIN perform fn_financiamento_candidatas(v_fin, 'liberacao'); EXCEPTION WHEN sqlstate '42501' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'B8 outro usuario leu'; END IF;
  v_ok := false;
  BEGIN perform fn_financiamento_parcela_vincular(v_p2, v_y, 'total', false, true); EXCEPTION WHEN sqlstate '42501' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'B8 outro usuario vinculou'; END IF;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  IF has_function_privilege('anon', 'public.fn_financiamento_parcela_vincular(uuid,uuid,text,boolean,boolean,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_financiamento_candidatas(uuid,text,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_financiamento_parcela_desvincular(uuid,text,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_financiamento_parcela_desvincular_exec(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'B8 ACL';
  END IF;

  -- B9 parcela "paga sem lancamento": vincular e desvincular a devolvem como estava, sem lancamento criado pelo motor
  insert into financiamento_parcelas (cliente_id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status, data_pagamento)
  values (c_cli, v_fin, 3, '2031-08-10', 100, 0, 100, 'pago', '2031-08-10') returning id into v_p2;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento, data_pagamento,
    status_transacao, conta_bancaria_id, plano_conta_id, favorecido_id, cenario)
  values (c_cli, c_faz, '2-Saídas', 'PAGTO SINT-4477 p3', 100, '2031-08-10', '2031-08-10', '2031-08-10', 'realizado', c_cta, c_amort, v_cred, 'realizado')
  returning id into v_y;
  r := fn_financiamento_parcela_vincular(v_p2, v_y, 'principal', false, false);
  r := fn_financiamento_parcela_desvincular((r->>'vinculo_id')::uuid, 'teste', false);
  select * into q from financiamento_parcelas where id = v_p2;
  IF q.status <> 'pago' OR q.lancamento_id is not null OR r->'motor'->>'skip' <> 'sem_lancamento_antes' THEN RAISE EXCEPTION 'B9: % / %', row_to_json(q), r; END IF;

  RAISE EXCEPTION 'FIN_FINANC_28_P4B OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'FIN_FINANC_28_P4B OK' THEN RAISE NOTICE 'OK'; RAISE EXCEPTION 'OK'; END IF;
  RAISE;
END $t$;
