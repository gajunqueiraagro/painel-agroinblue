-- FIN-FINANC-28 · PASSO 5 — "Dar baixa" no contrato de credito e o "Desfazer baixa". Roda depois da 20261027200500, numa transacao que
-- TERMINA EM RAISE (nada fica). Admin simulado; sintetico no cliente Teste: contrato de 1.000,00 em 3 parcelas (motor), a 1a paga,
-- liberacao de 1.000,00 "a casar".
-- Q1 quitado com diferenca: a simulacao recusa pedindo a confirmacao (principal 1.000,00 x liquidado 400,00).
-- Q2 quitado confirmado: as parcelas em aberto e os programados delas saem (cancelados), status quitado, a trilha guarda o antes; o
--    gatilho de quitacao nao o devolve a ativo.
-- Q3 GESTO CONTRARIO: desfazer devolve o status, as parcelas e recria os programados pelo motor; desfeita uma vez, nao de novo.
-- R1 rolado: o contrato novo ganha a liberacao "liquidacao do anterior" pelo saldo, sem caixa; o antigo fica rolado com o sucessor,
--    saldo 0. R2 desfazer: a liberacao sai do novo, o antigo volta.
-- P1 prorrogado: sem aditivo recusa; com "aditivo a anexar" as parcelas em aberto andam N meses guardando o vencimento original, o
--    motor recria os programados no vencimento novo, status prorrogado com a pendencia "aditivo_a_anexar"; o gatilho o mantem
--    prorrogado com parcela em aberto. P2 desfazer: vencimentos de volta, vencimento original limpo.
-- P3 o prorrogado quita sozinho quando tudo fica pago (o patch do P3-FIX4).
-- C1 cancelado com parcela paga e liberacao recusa dizendo o porque; contrato sem nada cancela e desfaz.
-- G1 compra parcelada recusa; outro usuario 42501; anon nao executa.
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  v_cred uuid; v_fin uuid; v_suc uuid; v_c2 uuid; v_parc uuid; v_p uuid[] := '{}'; v_id uuid; v_b uuid; r jsonb; v_ok boolean; v_n int;
  q record; v_lp uuid; v_lj uuid;
BEGIN
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'SINT BANCO CINCO', true) returning id into v_cred;
  insert into financiamentos (cliente_id, natureza, status, descricao, valor_total, numero_contrato, data_contrato, credor_id, fazenda_id, tipo_financiamento, conta_bancaria_id, total_parcelas)
  values (c_cli, 'financiamento', 'ativo', 'SINT P5 CONTRATO', 1000, 'SINT-5555', '2031-01-10', v_cred, c_faz, 'pecuaria', c_cta, 3) returning id into v_fin;
  FOR v_n IN 1..3 LOOP
    insert into financiamento_parcelas (cliente_id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
    values (c_cli, v_fin, v_n, ('2031-0' || (v_n + 3) || '-10')::date, case when v_n = 1 then 400 else 300 end, 20, case when v_n = 1 then 420 else 320 end, 'pendente')
    returning id into v_id;
    v_p := v_p || v_id;
    perform fn_reconciliar_parcela_financiamento(v_id, false, true, c_cta);
  END LOOP;
  -- a 1a paga: os dois lancamentos realizados
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = '2031-04-10'
   where id in (select lancamento_id from financiamento_parcelas where id = v_p[1] union select lancamento_juros_id from financiamento_parcelas where id = v_p[1]);
  perform fn_financiamento_liberacao_salvar(v_fin, null, '2031-01-15', 1000, 'conta');

  -- Q1
  r := fn_financiamento_baixa(v_fin, 'quitado', jsonb_build_object('motivo', 'teste', 'data', '2031-04-20'), true);
  IF r->'recusa'->>'frase' not like '%confirme a diferença%' OR r->'recusa'->>'frase' not like '%1.000,00%' THEN RAISE EXCEPTION 'Q1: %', r; END IF;

  -- Q2
  r := fn_financiamento_baixa(v_fin, 'quitado', jsonb_build_object('motivo', 'teste', 'data', '2031-04-20', 'confirmar_diferenca', true), false);
  v_b := (r->>'baixa_id')::uuid;
  IF (r->>'diferenca')::numeric <> 600 OR (r->>'lancamentos_cancelados')::int <> 4 THEN RAISE EXCEPTION 'Q2 retorno: %', r; END IF;
  IF (select status from financiamentos where id = v_fin) <> 'quitado' THEN RAISE EXCEPTION 'Q2 status'; END IF;
  IF (select count(*) from financiamento_parcelas where id = any(v_p[2:3]) and status = 'cancelado') <> 2 THEN RAISE EXCEPTION 'Q2 parcelas'; END IF;
  IF (select status from financiamento_parcelas where id = v_p[1]) = 'cancelado' THEN RAISE EXCEPTION 'Q2 a paga foi cancelada'; END IF;
  IF public._fn_financiamento_status_pelas_parcelas(v_fin) <> 'quitado' THEN RAISE EXCEPTION 'Q2 o gatilho desfez a quitacao'; END IF;

  -- Q3
  v_ok := false;
  BEGIN perform fn_financiamento_baixa_desfazer(v_b, ' ', false); EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'Q3 sem motivo passou'; END IF;
  r := fn_financiamento_baixa_desfazer(v_b, 'teste', false);
  IF (select status from financiamentos where id = v_fin) <> 'ativo' OR (select baixa_em from financiamentos where id = v_fin) is not null THEN RAISE EXCEPTION 'Q3 contrato'; END IF;
  FOR q IN select * from financiamento_parcelas where id = any(v_p[2:3]) LOOP
    IF q.status <> 'pendente' OR q.lancamento_id is null OR q.lancamento_juros_id is null
       OR (select cancelado from financeiro_lancamentos_v2 where id = q.lancamento_id) THEN RAISE EXCEPTION 'Q3 parcela %: %', q.numero_parcela, row_to_json(q); END IF;
  END LOOP;
  v_ok := false;
  BEGIN perform fn_financiamento_baixa_desfazer(v_b, 'de novo', false); EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'Q3 desfez duas vezes'; END IF;

  -- R1
  insert into financiamentos (cliente_id, natureza, status, descricao, valor_total, numero_contrato, data_contrato, credor_id, fazenda_id, tipo_financiamento)
  values (c_cli, 'financiamento', 'ativo', 'SINT P5 NOVO', 2000, 'SINT-5556', '2031-04-20', v_cred, c_faz, 'pecuaria') returning id into v_suc;
  r := fn_financiamento_baixa(v_fin, 'rolado', jsonb_build_object('motivo', 'teste', 'data', '2031-04-20', 'sucessor_id', v_suc), false);
  v_b := (r->>'baixa_id')::uuid;
  IF (select count(*) from financiamento_liberacoes where financiamento_id = v_suc and cancelado_em is null and forma = 'liquidacao'
        and contrato_liquidado_id = v_fin and valor = 600 and lancamento_id is null) <> 1 THEN RAISE EXCEPTION 'R1 liberacao do novo'; END IF;
  IF (select status from financiamentos where id = v_fin) <> 'rolado' OR (select contrato_sucessor_id from financiamentos where id = v_fin) <> v_suc THEN RAISE EXCEPTION 'R1 antigo'; END IF;
  IF (public._fn_financiamento_saldo(v_fin, '2031-12-31')->>'saldo')::numeric <> 0 THEN RAISE EXCEPTION 'R1 saldo do antigo'; END IF;
  -- R2
  perform fn_financiamento_baixa_desfazer(v_b, 'teste', false);
  IF (select count(*) from financiamento_liberacoes where financiamento_id = v_suc and cancelado_em is null) <> 0 THEN RAISE EXCEPTION 'R2 a liberacao ficou'; END IF;
  IF (select status from financiamentos where id = v_fin) <> 'ativo' OR (select contrato_sucessor_id from financiamentos where id = v_fin) is not null THEN RAISE EXCEPTION 'R2 antigo'; END IF;

  -- P1
  r := fn_financiamento_baixa(v_fin, 'prorrogado', jsonb_build_object('motivo', 'teste', 'meses', 2), true);
  IF r->'recusa'->>'frase' not like '%aditivo%' THEN RAISE EXCEPTION 'P1 sem aditivo: %', r; END IF;
  select lancamento_id into v_lp from financiamento_parcelas where id = v_p[2];
  r := fn_financiamento_baixa(v_fin, 'prorrogado', jsonb_build_object('motivo', 'teste', 'meses', 2, 'aditivo_a_anexar', true), false);
  v_b := (r->>'baixa_id')::uuid;
  select * into q from financiamento_parcelas where id = v_p[2];
  IF q.data_vencimento <> '2031-07-10' OR q.vencimento_original <> '2031-05-10' OR q.lancamento_id = v_lp THEN RAISE EXCEPTION 'P1 parcela 2: %', row_to_json(q); END IF;
  IF (select data_vencimento from financeiro_lancamentos_v2 where id = q.lancamento_id) <> '2031-07-10'
     OR (select data_competencia from financeiro_lancamentos_v2 where id = q.lancamento_id) <> '2031-07-10' THEN RAISE EXCEPTION 'P1 o programado novo'; END IF;
  IF NOT (select cancelado from financeiro_lancamentos_v2 where id = v_lp) THEN RAISE EXCEPTION 'P1 o programado antigo ficou'; END IF;
  IF (select data_vencimento from financiamento_parcelas where id = v_p[1]) <> '2031-04-10' THEN RAISE EXCEPTION 'P1 a paga andou'; END IF;
  IF (select status from financiamentos where id = v_fin) <> 'prorrogado' THEN RAISE EXCEPTION 'P1 status'; END IF;
  IF NOT (public._fn_financiamento_saldo(v_fin, '2031-12-31')->'pendencias') ? 'aditivo_a_anexar' THEN RAISE EXCEPTION 'P1 pendencia'; END IF;
  IF public._fn_financiamento_status_pelas_parcelas(v_fin) <> 'prorrogado' THEN RAISE EXCEPTION 'P1 o gatilho tirou o prorrogado'; END IF;
  -- P2
  perform fn_financiamento_baixa_desfazer(v_b, 'teste', false);
  select * into q from financiamento_parcelas where id = v_p[2];
  IF q.data_vencimento <> '2031-05-10' OR q.vencimento_original is not null OR q.lancamento_id is null
     OR (select data_vencimento from financeiro_lancamentos_v2 where id = q.lancamento_id) <> '2031-05-10' THEN RAISE EXCEPTION 'P2 parcela 2: %', row_to_json(q); END IF;
  IF (select status from financiamentos where id = v_fin) <> 'ativo' THEN RAISE EXCEPTION 'P2 status'; END IF;

  -- C1
  r := fn_financiamento_baixa(v_fin, 'cancelado', jsonb_build_object('motivo', 'teste'), true);
  IF r->'recusa'->>'frase' not like '%parcela 1 paga%' OR r->'recusa'->>'frase' not like '%liberação%' THEN RAISE EXCEPTION 'C1 recusa: %', r; END IF;
  insert into financiamentos (cliente_id, natureza, status, descricao, valor_total, numero_contrato, data_contrato, credor_id, fazenda_id, tipo_financiamento, total_parcelas)
  values (c_cli, 'emprestimo', 'ativo', 'SINT P5 CANCELA', 500, 'SINT-5557', '2031-01-10', v_cred, c_faz, 'pecuaria', 1) returning id into v_c2;
  insert into financiamento_parcelas (cliente_id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (c_cli, v_c2, 1, '2031-06-10', 500, 0, 500, 'pendente') returning id into v_id;
  perform fn_reconciliar_parcela_financiamento(v_id, false, true, c_cta);
  select lancamento_id into v_lp from financiamento_parcelas where id = v_id;
  r := fn_financiamento_baixa(v_c2, 'cancelado', jsonb_build_object('motivo', 'teste'), false);
  IF (select status from financiamentos where id = v_c2) <> 'cancelado' OR (select status from financiamento_parcelas where id = v_id) <> 'cancelado'
     OR NOT (select cancelado from financeiro_lancamentos_v2 where id = v_lp) THEN RAISE EXCEPTION 'C1 cancelar'; END IF;
  perform fn_financiamento_baixa_desfazer((r->>'baixa_id')::uuid, 'teste', false);
  IF (select status from financiamentos where id = v_c2) <> 'ativo' OR (select status from financiamento_parcelas where id = v_id) <> 'pendente'
     OR (select lancamento_id from financiamento_parcelas where id = v_id) is null THEN RAISE EXCEPTION 'C1 desfazer'; END IF;

  -- P3 o prorrogado QUITA sozinho quando todas as parcelas ficam pagas (o patch do gatilho P3-FIX4)
  perform fn_financiamento_baixa(v_fin, 'prorrogado', jsonb_build_object('motivo', 'teste', 'meses', 1, 'aditivo_a_anexar', true), false);
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = '2031-09-01'
   where id in (select lancamento_id from financiamento_parcelas where financiamento_id = v_fin and status <> 'cancelado'
                union select lancamento_juros_id from financiamento_parcelas where financiamento_id = v_fin and status <> 'cancelado')
     and status_transacao <> 'realizado';
  IF (select status from financiamentos where id = v_fin) <> 'quitado' THEN RAISE EXCEPTION 'P3 o prorrogado nao quitou: %', (select status from financiamentos where id = v_fin); END IF;

  -- G1
  insert into financiamentos (cliente_id, natureza, status, descricao, valor_total, data_contrato, fazenda_id)
  values (c_cli, 'parcelamento', 'ativo', 'SINT P5 COMPRA', 300, '2031-01-10', c_faz) returning id into v_parc;
  r := fn_financiamento_baixa(v_parc, 'quitado', jsonb_build_object('motivo', 'teste'), true);
  IF r->'recusa'->>'frase' not like '%Compra parcelada%' THEN RAISE EXCEPTION 'G1 parcelamento: %', r; END IF;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  v_ok := false;
  BEGIN perform fn_financiamento_baixa(v_fin, 'quitado', '{}'::jsonb, true); EXCEPTION WHEN sqlstate '42501' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'G1 outro usuario'; END IF;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  IF has_function_privilege('anon', 'public.fn_financiamento_baixa(uuid,text,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_financiamento_baixa_desfazer(uuid,text,boolean)', 'EXECUTE') THEN RAISE EXCEPTION 'G1 ACL'; END IF;

  RAISE EXCEPTION 'FIN_FINANC_28_P5 OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'FIN_FINANC_28_P5 OK' THEN RAISE EXCEPTION 'OK'; END IF;
  RAISE;
END $t$;
