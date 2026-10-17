-- FIN-FINANC-28 · PASSO 6 — a leitura "ao contrario" (do lancamento para o contrato). Roda depois da 20261027200600; termina em RAISE.
-- V1 o pagamento acha a parcela (papel total, diferenca 0) pelo MESMO motor do 4b; a entrada acha o contrato como liberacao.
-- V2 vinculado, o "atual" diz parcela + vinculo; a liberacao gravada, o "atual" da entrada diz liberacao.
-- V3 outro usuario 42501; anon nao executa.
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
  v_cred uuid; v_fin uuid; v_p1 uuid; v_x uuid; v_e uuid; r jsonb; v_ok boolean;
BEGIN
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'SINT BANCO SEIS', true) returning id into v_cred;
  insert into financiamentos (cliente_id, natureza, status, descricao, valor_total, numero_contrato, data_contrato, credor_id, fazenda_id, tipo_financiamento, conta_bancaria_id, total_parcelas)
  values (c_cli, 'financiamento', 'ativo', 'SINT P6 CONTRATO', 1000, 'SINT-6666', '2031-01-10', v_cred, c_faz, 'pecuaria', c_cta, 1) returning id into v_fin;
  insert into financiamento_parcelas (cliente_id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (c_cli, v_fin, 1, '2031-06-10', 500, 50, 550, 'pendente') returning id into v_p1;
  perform fn_reconciliar_parcela_financiamento(v_p1, false, true, c_cta);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento, data_pagamento,
    status_transacao, conta_bancaria_id, plano_conta_id, favorecido_id, cenario)
  values (c_cli, c_faz, '2-Saídas', 'PAGTO SINT-6666', 550, '2031-06-12', '2031-06-12', '2031-06-12', 'realizado', c_cta, c_amort, v_cred, 'realizado') returning id into v_x;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento, data_pagamento,
    status_transacao, conta_destino_id, plano_conta_id, favorecido_id, cenario)
  values (c_cli, c_faz, '1-Entradas', 'LIBERACAO SINT-6666', 1000, '2031-01-15', '2031-01-15', '2031-01-15', 'realizado', c_cta, c_entr, v_cred, 'realizado') returning id into v_e;

  -- V1
  r := fn_lancamento_financiamento(v_x);
  IF r->'atual' <> 'null'::jsonb OR NOT exists (select 1 from jsonb_array_elements(r->'parcelas') p
       where (p->>'parcela_id')::uuid = v_p1 and (p->>'financiamento_id')::uuid = v_fin and p->>'papel_sugerido' = 'total' and (p->>'diferenca')::numeric = 0) THEN
    RAISE EXCEPTION 'V1 pagamento: %', r;
  END IF;
  r := fn_lancamento_financiamento(v_e);
  IF NOT exists (select 1 from jsonb_array_elements(r->'liberacoes') p where (p->>'financiamento_id')::uuid = v_fin and (p->>'saldo_a_liberar')::numeric = 1000)
     OR jsonb_array_length(r->'parcelas') <> 0 THEN RAISE EXCEPTION 'V1 entrada: %', r; END IF;

  -- V2
  perform fn_financiamento_parcela_vincular(v_p1, v_x, 'total', false, false);
  r := fn_lancamento_financiamento(v_x);
  IF r->'atual'->>'tipo' <> 'parcela' OR (r->'atual'->>'financiamento_id')::uuid <> v_fin OR r->'atual'->>'vinculo_id' is null
     OR jsonb_array_length(r->'parcelas') <> 0 THEN RAISE EXCEPTION 'V2 pagamento: %', r; END IF;
  perform fn_financiamento_liberacao_salvar(v_fin, null, '2031-01-15', 1000, 'conta', v_e);
  r := fn_lancamento_financiamento(v_e);
  IF r->'atual'->>'tipo' <> 'liberacao' OR jsonb_array_length(r->'liberacoes') <> 0 THEN RAISE EXCEPTION 'V2 entrada: %', r; END IF;

  -- V3
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  v_ok := false;
  BEGIN perform fn_lancamento_financiamento(v_x); EXCEPTION WHEN sqlstate '42501' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'V3 outro usuario leu'; END IF;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  IF has_function_privilege('anon', 'public.fn_lancamento_financiamento(uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'V3 anon'; END IF;

  RAISE EXCEPTION 'FIN_FINANC_28_P6 OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'FIN_FINANC_28_P6 OK' THEN RAISE EXCEPTION 'OK'; END IF;
  RAISE;
END $t$;
