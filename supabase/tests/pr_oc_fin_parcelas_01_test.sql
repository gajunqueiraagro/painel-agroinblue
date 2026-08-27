-- PR-OC-FIN-PARCELAS-01 — testes de oc_acrescentar_parcelas.
--   Fixtures pelos writers vivos (oc_criar_compromisso / oc_programar_compromisso /
--   oc_materializar_programacao). Requer aplicada: 20260829120000.
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + residuo zero.
SELECT set_config('app.ocap_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_forn uuid; v_conta1 uuid; v_sub text;
  v_res jsonb; v_v int; v_num numeric; v_cnt int; v_txt text; v_err text;
  v_op uuid; v_lote uuid;
  v_comp uuid; v_prog uuid; v_parc1 uuid;
  v_comp_semprog uuid; v_comp_canc uuid;
  v_seq_nova int; v_val_antes numeric; v_st_antes text; v_venc_antes date; v_venc_depois date;
BEGIN
  v_tag := current_setting('app.ocap_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT id INTO v_forn FROM public.financeiro_fornecedores WHERE cliente_id=v_cli ORDER BY nome LIMIT 1;
  IF v_forn IS NULL THEN RAISE EXCEPTION 'fixture: cliente sem fornecedor'; END IF;
  SELECT id INTO v_conta1 FROM public.financeiro_contas_bancarias WHERE cliente_id=v_cli ORDER BY ordem_exibicao LIMIT 1;
  SELECT pc.subcentro INTO v_sub FROM public.financeiro_plano_contas pc
   WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id=v_cli) AND pc.subcentro ILIKE '%Compra Bovinos Machos%'
     AND 1=(SELECT count(*) FROM public.financeiro_plano_contas p2 WHERE p2.ativo IS TRUE AND (p2.cliente_id IS NULL OR p2.cliente_id=v_cli) AND p2.subcentro IS NOT DISTINCT FROM pc.subcentro) LIMIT 1;
  IF v_sub IS NULL THEN RAISE EXCEPTION 'fixture: subcentro unico ausente'; END IF;

  -- ===================== FIXTURE =====================
  -- Espelho do caso real (OC 765058f8): compromisso de 326.250 com programacao ativa
  -- de 206.250 ja materializada/paga, e 120.000 de saldo a programar.
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-13','fechada',false,326250,0,v_forn,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',115,'total',326250,1) RETURNING id INTO v_lote;
  SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_op;

  v_res := public.oc_criar_compromisso(v_op, v_v, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_forn,'subcentro',v_sub,'lote_id',v_lote,'valor_total',326250));
  v_comp := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;

  v_res := public.oc_programar_compromisso(v_op, v_v, v_comp, jsonb_build_object('parcelas', jsonb_build_array(
    jsonb_build_object('sequencia',1,'valor',206250,'vencimento','2026-07-31','conta_bancaria_id',v_conta1))));
  v_prog := (v_res->'programacao'->>'id')::uuid; v_parc1 := (v_res->'parcelas'->0->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
  v_res := public.oc_materializar_programacao(v_op, v_v, v_prog, v_parc1); v_v := (v_res->>'operacao_versao')::int;

  SELECT valor, status, vencimento INTO v_val_antes, v_st_antes, v_venc_antes
    FROM public.zoo_operacao_parcelas_programacao WHERE id=v_parc1;

  -- ===================== T1 — acrescenta na programacao ativa =====================
  v_res := public.oc_acrescentar_parcelas(v_op, v_v, v_comp, jsonb_build_object('parcelas', jsonb_build_array(
    jsonb_build_object('valor',120000,'vencimento','2026-09-30','conta_bancaria_id',v_conta1))));
  v_v := (v_res->>'operacao_versao')::int;
  IF (v_res->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'T1 FAIL: envelope sem ok'; END IF;
  IF (v_res->>'programacao_id')::uuid <> v_prog THEN RAISE EXCEPTION 'T1 FAIL: programacao_id=% (esperado %)', v_res->>'programacao_id', v_prog; END IF;
  IF (v_res->>'soma_programada')::numeric <> 326250 THEN RAISE EXCEPTION 'T1 FAIL: soma_programada=%', v_res->>'soma_programada'; END IF;
  SELECT jsonb_array_length(v_res->'parcelas_criadas') INTO v_cnt;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T1 FAIL: parcelas_criadas=%', v_cnt; END IF;

  -- sequencia continua de max+1 (a existente e' 1, entao a nova e' 2)
  v_seq_nova := (v_res->'parcelas_criadas'->0->>'sequencia')::int;
  IF v_seq_nova <> 2 THEN RAISE EXCEPTION 'T1 FAIL: sequencia=% (esperado 2)', v_seq_nova; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_parcelas_programacao WHERE programacao_id=v_prog;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'T1 FAIL: parcelas na programacao=%', v_cnt; END IF;

  -- ===================== T2 — existente INTACTA =====================
  SELECT valor, status, vencimento INTO v_num, v_txt, v_venc_depois
    FROM public.zoo_operacao_parcelas_programacao WHERE id=v_parc1;
  IF v_num <> v_val_antes THEN RAISE EXCEPTION 'T2 FAIL: valor mudou % -> %', v_val_antes, v_num; END IF;
  IF v_txt IS DISTINCT FROM v_st_antes THEN RAISE EXCEPTION 'T2 FAIL: status mudou % -> %', v_st_antes, v_txt; END IF;
  IF v_venc_depois IS DISTINCT FROM v_venc_antes THEN RAISE EXCEPTION 'T2 FAIL: vencimento mudou % -> %', v_venc_antes, v_venc_depois; END IF;
  /* e o titulo materializado continua vinculado (homologacao 6).
     ⚠ `programacao_parcela_id` e `cancelada` — conferidos no schema. A tabela NAO tem
     `parcela_programacao_id` nem `cancelado`, apesar de os nomes irmaos existirem em
     zoo_operacao_parcelas_programacao; trocar um pelo outro nao compila. */
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes
   WHERE programacao_parcela_id=v_parc1 AND cancelada IS NOT TRUE AND financeiro_lancamento_id IS NOT NULL;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T2 FAIL: parte/titulo da parcela materializada=% (esperado 1)', v_cnt; END IF;
  IF v_txt NOT IN ('materializada','paga') THEN RAISE EXCEPTION 'T2 FAIL: parcela deveria seguir materializada/paga, esta %', v_txt; END IF;
  -- o compromisso segue 'programado': acrescentar nao muda status
  SELECT status INTO v_txt FROM public.zoo_operacao_compromissos WHERE id=v_comp;
  IF v_txt <> 'programado' THEN RAISE EXCEPTION 'T2 FAIL: compromisso status=%', v_txt; END IF;

  -- ===================== T3 — estouro do teto =====================
  BEGIN
    v_res := public.oc_acrescentar_parcelas(v_op, v_v, v_comp, jsonb_build_object('parcelas', jsonb_build_array(
      jsonb_build_object('valor',0.01,'vencimento','2026-10-31'))));
    RAISE EXCEPTION 'T3 FAIL: acrescimo acima do teto foi aceito';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT ILIKE '%excede o valor do compromisso%' THEN RAISE EXCEPTION 'T3 FAIL: mensagem inesperada: %', v_err; END IF;
  END;
  -- nada foi inserido pela tentativa recusada
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_parcelas_programacao WHERE programacao_id=v_prog;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'T3 FAIL: parcelas apos recusa=%', v_cnt; END IF;

  -- ===================== T4 — sem programacao ativa =====================
  v_res := public.oc_criar_compromisso(v_op, v_v, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_forn,'subcentro',v_sub,'valor_total',1000));
  v_comp_semprog := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
  BEGIN
    v_res := public.oc_acrescentar_parcelas(v_op, v_v, v_comp_semprog, jsonb_build_object('parcelas', jsonb_build_array(
      jsonb_build_object('valor',500,'vencimento','2026-08-31'))));
    RAISE EXCEPTION 'T4 FAIL: aceitou sem programacao ativa';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT ILIKE '%sem programacao ativa%' OR v_err NOT ILIKE '%primeira programacao%' THEN
      RAISE EXCEPTION 'T4 FAIL: mensagem nao orienta a primeira programacao: %', v_err; END IF;
  END;

  -- ===================== T5 — compromisso cancelado =====================
  v_res := public.oc_criar_compromisso(v_op, v_v, jsonb_build_object('natureza','obrigacao','componente','comissao','favorecido_id',v_forn,'subcentro',v_sub,'valor_total',900));
  v_comp_canc := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
  UPDATE public.zoo_operacao_compromissos SET status='cancelado' WHERE id=v_comp_canc;
  BEGIN
    v_res := public.oc_acrescentar_parcelas(v_op, v_v, v_comp_canc, jsonb_build_object('parcelas', jsonb_build_array(
      jsonb_build_object('valor',100,'vencimento','2026-08-31'))));
    RAISE EXCEPTION 'T5 FAIL: aceitou compromisso cancelado';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT ILIKE '%cancelado%' THEN RAISE EXCEPTION 'T5 FAIL: mensagem inesperada: %', v_err; END IF;
  END;

  -- ===================== T6 — version-lock =====================
  BEGIN
    v_res := public.oc_acrescentar_parcelas(v_op, v_v + 99, v_comp, jsonb_build_object('parcelas', jsonb_build_array(
      jsonb_build_object('valor',1,'vencimento','2026-08-31'))));
    RAISE EXCEPTION 'T6 FAIL: aceitou versao errada';
  EXCEPTION WHEN sqlstate '40001' THEN
    NULL;
  END;

  -- ===================== T7 — parcela CANCELADA nao conta no teto =====================
  -- Cancela a de 120.000 (seq 2): o teto volta a ter 120.000 livres, e o mesmo valor
  -- que T3 recusou por 0,01 passa a caber inteiro.
  UPDATE public.zoo_operacao_parcelas_programacao SET status='cancelada'
   WHERE programacao_id=v_prog AND sequencia=2;
  v_res := public.oc_acrescentar_parcelas(v_op, v_v, v_comp, jsonb_build_object('parcelas', jsonb_build_array(
    jsonb_build_object('valor',120000,'vencimento','2026-11-30','conta_bancaria_id',v_conta1))));
  v_v := (v_res->>'operacao_versao')::int;
  IF (v_res->>'soma_programada')::numeric <> 326250 THEN
    RAISE EXCEPTION 'T7 FAIL: soma_programada=% (cancelada deveria estar fora)', v_res->>'soma_programada'; END IF;
  -- e a sequencia NAO reaproveita o numero da cancelada
  v_seq_nova := (v_res->'parcelas_criadas'->0->>'sequencia')::int;
  IF v_seq_nova <> 3 THEN RAISE EXCEPTION 'T7 FAIL: sequencia=% (esperado 3; nao pode reaproveitar a cancelada)', v_seq_nova; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_parcelas_programacao WHERE programacao_id=v_prog;
  IF v_cnt <> 3 THEN RAISE EXCEPTION 'T7 FAIL: parcelas na programacao=%', v_cnt; END IF;

  -- ===================== T8 — evento proprio na auditoria =====================
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_eventos
   WHERE operacao_id=v_op AND acao='acrescentar_parcelas';
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'T8 FAIL: eventos acrescentar_parcelas=% (esperado 2)', v_cnt; END IF;

  RAISE NOTICE 'PR-OC-FIN-PARCELAS-01: T1..T8 PASS';
END $t$;

ROLLBACK;
