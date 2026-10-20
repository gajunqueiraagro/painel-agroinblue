-- FIN-POS-FIXADO-01b — o juro real da parcela pos-fixada pelo extrato. Termina em RAISE 'OK'; tudo desfeito.
-- Molde: o 8.233.040 (RRCC), parcela 2 (principal 120.004,50 + juros estimado 35.665,34), extratos SINTETICOS na conta do lancamento.
--   P1 simulacao com extrato de 160.000,00: juro real 39.995,50, a parcela ficaria paga; nada gravado
--   P2 extrato de 100.000,00: recusado com a frase (simulacao e gravacao)
--   P3 o bloco: com soma diferente recusa com a frase da parcela pos ('exato' e 'mais antigo primeiro'); com soma igual passa
--   P4 gravacao com 160.000,00: principal igual, juros 39.995,50 no lancamento e na parcela, parcela paga pelo gatilho, a trilha no audit_log
--      com o motivo e o autor, os dois vinculos, e a marca de estimado some
--   P5 contrato nao pos: o dono recusa e o bloco volta a' recusa de soma de sempre
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
SELECT set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

CREATE FUNCTION pg_temp.ext(p_valor numeric, p_data date) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
  VALUES (v_id, '537661af-a934-4c66-b138-f8dbc378a00f', '219dbf52-6e0a-4017-ae18-961313ce7456', p_data, p_valor,
          CASE WHEN p_valor < 0 THEN 'debito' ELSE 'credito' END, 'SINT-POS01B-' || v_id, 'SINT POS01B DEBITO PARCELA');
  RETURN v_id;
END $f$;

DO $t$
DECLARE
  c_par constant uuid := 'cb7b9963-a93b-4206-96d8-ee5d68e059b4';
  c_lp  constant uuid := 'f13e1d49-4bd2-4e81-aee5-17fd3e35fe23';
  c_lj  constant uuid := '00239d5a-389c-46b7-852e-d7ed042839c9';
  c_fin constant uuid := '74567fe0-3e09-4f22-84a5-2513d6557d27';
  u_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  e160 uuid; e100 uuid; e150 uuid; eok uuid; r jsonb; v_msg text; v_ok boolean; v_n int; v_antes text;
BEGIN
  e160 := pg_temp.ext(-160000, date '2027-08-15');
  e100 := pg_temp.ext(-100000, date '2027-08-15');
  e150 := pg_temp.ext(-150000, date '2027-08-15');
  eok  := pg_temp.ext(-155669.84, date '2027-08-15');
  v_antes := (SELECT md5(row(p.*)::text) FROM public.financiamento_parcelas p WHERE p.id = c_par);

  -- P1
  r := public.fn_financiamento_parcela_pos_pagar(e160, c_par, true);
  IF NOT (r->>'ok')::boolean OR (r#>>'{parcela,juro_real}')::numeric <> 39995.50 OR r#>>'{depois,status}' <> 'pago'
     OR (r#>>'{depois,valor_principal}')::numeric <> 120004.50 OR (r#>>'{depois,valor_juros}')::numeric <> 39995.50 THEN
    RAISE EXCEPTION 'P1 simulacao: %', r; END IF;
  IF (SELECT md5(row(p.*)::text) FROM public.financiamento_parcelas p WHERE p.id = c_par) <> v_antes
     OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens WHERE extrato_id = e160)
     OR EXISTS (SELECT 1 FROM public.audit_log WHERE registro_id = c_par AND acao = 'juro_real_pelo_extrato') THEN
    RAISE EXCEPTION 'P1 a simulacao gravou'; END IF;

  -- P2
  r := public.fn_financiamento_parcela_pos_pagar(e100, c_par, true);
  IF (r->>'ok')::boolean OR r#>>'{recusa,frase}' IS DISTINCT FROM 'o extrato é menor que o principal da parcela; case como pagamento parcial' THEN
    RAISE EXCEPTION 'P2 simulacao: %', r; END IF;
  v_ok := false;
  BEGIN
    PERFORM public.fn_financiamento_parcela_pos_pagar(e100, c_par, false);
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_ok := v_msg = 'o extrato é menor que o principal da parcela; case como pagamento parcial Nada foi gravado.';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'P2 gravacao nao recusou com a frase: %', v_msg; END IF;

  -- P3
  v_ok := false;
  BEGIN PERFORM public.fn_conciliar_bloco(array[e160], array[c_lp, c_lj], 'exato', true);
  EXCEPTION WHEN sqlstate 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_ok := v_msg LIKE 'parcela_pos: Parcela de contrato pós-fixado:%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'P3 exato: %', v_msg; END IF;
  v_ok := false;
  BEGIN PERFORM public.fn_conciliar_bloco(array[e150], array[c_lp, c_lj], 'mais_antigo_primeiro', true);
  EXCEPTION WHEN sqlstate 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_ok := v_msg LIKE 'parcela_pos: %'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'P3 mais antigo primeiro: %', v_msg; END IF;
  r := public.fn_conciliar_bloco(array[eok], array[c_lp, c_lj], 'exato', true);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'P3 soma igual devia passar: %', r; END IF;

  -- P4
  r := public.fn_financiamento_parcela_pos_pagar(e160, c_par, false);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'P4 gravacao: %', r; END IF;
  IF (SELECT status || '|' || valor_principal || '|' || valor_juros || '|' || coalesce(data_pagamento::text, '-') FROM public.financiamento_parcelas WHERE id = c_par)
     IS DISTINCT FROM 'pago|120004.50|39995.50|2027-08-15' THEN
    RAISE EXCEPTION 'P4 parcela: %', (SELECT row(status, valor_principal, valor_juros, data_pagamento)::text FROM public.financiamento_parcelas WHERE id = c_par); END IF;
  IF (SELECT valor FROM public.financeiro_lancamentos_v2 WHERE id = c_lp) <> 120004.50
     OR (SELECT valor FROM public.financeiro_lancamentos_v2 WHERE id = c_lj) <> 39995.50
     OR (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE id IN (c_lp, c_lj) AND status_transacao = 'realizado' AND data_pagamento = date '2027-08-15') <> 2 THEN
    RAISE EXCEPTION 'P4 lancamentos'; END IF;
  IF (SELECT count(*) FROM public.conciliacao_bancaria_itens WHERE extrato_id = e160 AND desfeito_em IS NULL) <> 2 THEN RAISE EXCEPTION 'P4 vinculos'; END IF;
  SELECT count(*) INTO v_n FROM public.audit_log
   WHERE registro_id = c_par AND acao = 'juro_real_pelo_extrato' AND tabela_origem = 'financiamento_parcelas'
     AND resumo = 'motivo: juro real pelo extrato de 15/08/2027' AND dados_novos->>'motivo' = 'juro real pelo extrato de 15/08/2027'
     AND usuario_id = u_admin AND (dados_anteriores->>'valor_juros')::numeric = 35665.34 AND (dados_novos->>'valor_juros')::numeric = 39995.50;
  IF v_n <> 1 THEN RAISE EXCEPTION 'P4 trilha: %', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.fn_juros_estimados_do_cliente('537661af-a934-4c66-b138-f8dbc378a00f') WHERE lancamento_id = c_lj) THEN
    RAISE EXCEPTION 'P4 marca de estimado ficou'; END IF;
  IF EXISTS (SELECT 1 FROM public.financiamento_parcelas_operacoes o WHERE o.financiamento_id = c_fin AND o.feita_em >= now() - interval '1 minute') THEN
    RAISE EXCEPTION 'P4 trilha foi para financiamento_parcelas_operacoes'; END IF;

  -- P5
  r := public.fn_financiamento_parcela_pos_pagar(e100, (SELECT id FROM public.financiamento_parcelas WHERE financiamento_id = c_fin AND numero_parcela = 3), true);
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'P5 pre: %', r; END IF;
  UPDATE public.financiamentos SET tipo_taxa = NULL WHERE id = c_fin;
  r := public.fn_financiamento_parcela_pos_pagar(e150, (SELECT id FROM public.financiamento_parcelas WHERE financiamento_id = c_fin AND numero_parcela = 3), true);
  IF r#>>'{recusa,motivo}' IS DISTINCT FROM 'nao_pos' THEN RAISE EXCEPTION 'P5 nao pos: %', r; END IF;
  v_ok := false;
  BEGIN PERFORM public.fn_conciliar_bloco(array[e150],
          array[(SELECT lancamento_id FROM public.financiamento_parcelas WHERE financiamento_id = c_fin AND numero_parcela = 3),
                (SELECT lancamento_juros_id FROM public.financiamento_parcelas WHERE financiamento_id = c_fin AND numero_parcela = 3)], 'exato', true);
  EXCEPTION WHEN sqlstate 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_ok := v_msg LIKE 'soma_diverge:%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'P5 bloco sem pos: %', v_msg; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
ROLLBACK;
