-- PR-PROGRAMACAO-01 — testes sinteticos de public.oc_programar_compromisso (T1..T20 + Agnaldo).
--   Valida: cria programacao+parcelas de UM compromisso; 2o teto (Sigma parcelas <= valor_total);
--   unicidade de programacao ativa; contiguidade 1..N; vencimento/forma/conta opcionais; conta do tenant;
--   transicao aberto->programado; tenant/auth/versao; e FRONTEIRA (nenhum titulo/parte materializado).
--   Requer aplicadas: 20260803160000 (writer), 20260803150000 (criar_compromisso), 20260803130000 (estrutura).
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + residuo zero.
SELECT set_config('app.ocp_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_fA uuid;
  v_sub_ani text; v_sub_frete text;
  v_user3 uuid; v_cli3 uuid;
  v_conta1 uuid; v_conta2 uuid; v_conta_x uuid;
  v_op uuid; v_op2 uuid; v_lote uuid; v_ver int;
  v_res jsonb; v_cnt int; v_ok boolean; v_comp uuid;
BEGIN
  v_tag := current_setting('app.ocp_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT id INTO v_fA FROM public.financeiro_fornecedores WHERE cliente_id=v_cli ORDER BY nome LIMIT 1;
  IF v_fA IS NULL THEN RAISE EXCEPTION 'fixture: cliente sem fornecedor'; END IF;
  SELECT cm.user_id, cm.cliente_id INTO v_user3, v_cli3 FROM public.cliente_membros cm
   WHERE cm.ativo=true AND cm.perfil<>'admin_agroinblue' AND cm.cliente_id IS DISTINCT FROM v_cli
     AND NOT EXISTS (SELECT 1 FROM public.cliente_membros a WHERE a.user_id=cm.user_id AND a.perfil='admin_agroinblue' AND a.ativo)
   ORDER BY cm.user_id LIMIT 1;
  SELECT id INTO v_conta1 FROM public.financeiro_contas_bancarias WHERE cliente_id=v_cli ORDER BY ordem_exibicao LIMIT 1;
  SELECT id INTO v_conta2 FROM public.financeiro_contas_bancarias WHERE cliente_id=v_cli AND id IS DISTINCT FROM v_conta1 ORDER BY ordem_exibicao LIMIT 1;
  SELECT id INTO v_conta_x FROM public.financeiro_contas_bancarias WHERE cliente_id IS DISTINCT FROM v_cli LIMIT 1;
  SELECT pc.subcentro INTO v_sub_ani FROM public.financeiro_plano_contas pc
   WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id=v_cli) AND pc.subcentro ILIKE '%Compra Bovinos Machos%'
     AND 1=(SELECT count(*) FROM public.financeiro_plano_contas p2 WHERE p2.ativo IS TRUE AND (p2.cliente_id IS NULL OR p2.cliente_id=v_cli) AND p2.subcentro IS NOT DISTINCT FROM pc.subcentro) LIMIT 1;
  SELECT pc.subcentro INTO v_sub_frete FROM public.financeiro_plano_contas pc
   WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id=v_cli) AND pc.subcentro ILIKE '%Frete%'
     AND 1=(SELECT count(*) FROM public.financeiro_plano_contas p2 WHERE p2.ativo IS TRUE AND (p2.cliente_id IS NULL OR p2.cliente_id=v_cli) AND p2.subcentro IS NOT DISTINCT FROM pc.subcentro) LIMIT 1;
  IF v_sub_ani IS NULL OR v_sub_frete IS NULL THEN RAISE EXCEPTION 'fixture: subcentros unicos ausentes'; END IF;

  -- op base (compra fechada) + lote
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-01','fechada',false,300000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'novilhas',10,'total',100,1) RETURNING id INTO v_lote;

  -- ===== T1/T16/T19/T20: programar compromisso obrigacao (valor_total=300) com Sigma=300 (3 parcelas contiguas) =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',300));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('condicoes','3x', 'parcelas', jsonb_build_array(
    jsonb_build_object('sequencia',1,'valor',100,'vencimento','2026-08-01','conta_bancaria_id',v_conta1,'forma','pix'),
    jsonb_build_object('sequencia',2,'valor',100,'conta_bancaria_id',COALESCE(v_conta2,v_conta1)),                    -- vencimento NULL (T19); forma NULL (T20)
    jsonb_build_object('sequencia',3,'valor',100,'vencimento','2026-10-01'))));                                       -- sem conta/forma
  IF (v_res->'programacao'->>'id') IS NULL OR jsonb_array_length(v_res->'parcelas')<>3 THEN RAISE EXCEPTION 'T1 FAIL: programacao/parcelas'; END IF;
  IF (v_res->>'operacao_versao')::int <> v_ver+1 THEN RAISE EXCEPTION 'T1 FAIL: versao'; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_compromissos WHERE id=v_comp AND status='programado';
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T16 FAIL: compromisso nao virou programado'; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_parcelas_programacao pp JOIN public.zoo_operacao_programacoes pr ON pr.id=pp.programacao_id WHERE pr.compromisso_id=v_comp AND pp.status='prevista';
  IF v_cnt<>3 THEN RAISE EXCEPTION 'T1/T19 FAIL: parcelas prevista=%',v_cnt; END IF;
  RAISE NOTICE 'T1/T16/T19/T20 PASS';

  -- ===== T4: mesmo compromisso ja programado -> P0001 (unicidade) =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',50))));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T4 FAIL: 2a programacao aceita'; END IF; RAISE NOTICE 'T4 PASS';

  -- ===== T17: 2a programacao ATIVA direto no banco -> viola UNIQUE (zoo_operacao_programacoes_ativa_uniq) =====
  v_ok:=false;
  BEGIN INSERT INTO public.zoo_operacao_programacoes (cliente_id,compromisso_id,status) VALUES (v_cli,v_comp,'ativa');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='23505'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T17 FAIL: UNIQUE de programacao ativa nao barrou'; END IF; RAISE NOTICE 'T17 PASS';

  -- ===== T2: Sigma parcelas > valor_total -> P0001 (2o teto) =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',1000));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',1001))));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T2 FAIL: Sigma>valor_total aceito'; END IF; RAISE NOTICE 'T2 PASS';

  -- ===== T3: Sigma parcial < valor_total -> cria (mesmo compromisso do T2, ainda sem programacao) =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(
    jsonb_build_object('sequencia',1,'valor',400), jsonb_build_object('sequencia',2,'valor',200))));  -- Sigma 600 < 1000
  IF (v_res->'programacao'->>'id') IS NULL THEN RAISE EXCEPTION 'T3 FAIL: parcial recusado'; END IF; RAISE NOTICE 'T3 PASS';

  -- ===== T7/T8: contiguidade =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',1000));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',100), jsonb_build_object('sequencia',3,'valor',100))));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T7 FAIL: buraco 1,3 aceito'; END IF;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',2,'valor',100), jsonb_build_object('sequencia',3,'valor',100))));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T8 FAIL: 2,3 aceito'; END IF; RAISE NOTICE 'T7/T8 PASS';

  -- ===== T9: valor<=0 -> P0001 ; T11: array vazio -> P0001 =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',0))));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T9 FAIL: valor 0 aceito'; END IF;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array()));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T11 FAIL: array vazio aceito'; END IF; RAISE NOTICE 'T9/T11 PASS';

  -- ===== T10: conta de outro tenant -> P0001 =====
  IF v_conta_x IS NOT NULL THEN
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
    v_ok:=false;
    BEGIN v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',100,'conta_bancaria_id',v_conta_x))));
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T10 FAIL: conta de outro tenant aceita'; END IF; RAISE NOTICE 'T10 PASS';
  ELSE RAISE NOTICE 'T10 SKIP (sem conta de outro tenant)'; END IF;

  -- ===== T5: compromisso cancelado -> P0001 =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',500));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  UPDATE public.zoo_operacao_compromissos SET status='cancelado' WHERE id=v_comp;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',100))));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T5 FAIL: cancelado programado'; END IF; RAISE NOTICE 'T5 PASS';

  -- ===== T5b: compromisso status='programado' SEM programacao ativa -> P0001 (Ajuste 1 fecha o buraco) =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',500));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  UPDATE public.zoo_operacao_compromissos SET status='programado' WHERE id=v_comp;  -- programado SEM criar programacao ativa
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',100))));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T5b FAIL: programado sem ativa aceitou primeira programacao'; END IF; RAISE NOTICE 'T5b PASS';

  -- ===== T6: compromisso de OUTRA operacao -> P0001 =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-02','fechada',false,50000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op2;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op2;
  v_res := public.oc_criar_compromisso(v_op2, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',500));
  DECLARE v_comp_op2 uuid := (v_res->'compromisso'->>'id')::uuid;
  BEGIN
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
    v_ok:=false;
    BEGIN v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp_op2, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',100))));
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T6 FAIL: compromisso de outra op programado'; END IF; RAISE NOTICE 'T6 PASS';
  END;

  -- ===== T12: versao divergente -> 40001 ; T13: sem acesso -> 42501 =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',500));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  v_ok:=false;
  BEGIN v_res := public.oc_programar_compromisso(v_op, 999999, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',100))));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='40001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T12 FAIL'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',100))));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='42501'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T13 FAIL'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  RAISE NOTICE 'T12/T13 PASS';

  -- ===== T14 service_role -> sucesso (programa o v_comp do T12) =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',500))));
  IF (v_res->'programacao'->>'id') IS NULL THEN RAISE EXCEPTION 'T14 FAIL: service_role recusado'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  RAISE NOTICE 'T14 PASS (admin via T1; service_role aqui)';

  -- ===== T15: operacao rascunho / cancelada -> P0001 =====
  DECLARE v_opR uuid; v_opC uuid; v_compR uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-05','fechada',false,5000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opR;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opR;
    v_res := public.oc_criar_compromisso(v_opR, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',500));
    v_compR := (v_res->'compromisso'->>'id')::uuid;
    UPDATE public.zoo_operacoes_comerciais SET rascunho=true WHERE id=v_opR;  -- torna rascunho apos criar
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opR;
    v_ok:=false;
    BEGIN v_res := public.oc_programar_compromisso(v_opR, v_ver, v_compR, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',100))));
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T15 FAIL: rascunho programado'; END IF;
    RAISE NOTICE 'T15 PASS';
  END;

  -- ===== T17b usuario nao-admin com acesso -> sucesso =====
  IF v_user3 IS NOT NULL THEN
   DECLARE v_op17 uuid; v_sub3 text; v_comp17 uuid;
   BEGIN
    SELECT pc.subcentro INTO v_sub3 FROM public.financeiro_plano_contas pc
     WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id=v_cli3)
       AND 1=(SELECT count(*) FROM public.financeiro_plano_contas p2 WHERE p2.ativo IS TRUE AND (p2.cliente_id IS NULL OR p2.cliente_id=v_cli3) AND p2.subcentro IS NOT DISTINCT FROM pc.subcentro) LIMIT 1;
    IF v_sub3 IS NOT NULL THEN
      INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
        VALUES (v_cli3,'compra',DATE '2026-07-06','fechada',false,10000,NULL,v_tag,v_user3,v_user3) RETURNING id INTO v_op17;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user3::text, 'role','authenticated')::text, true);
      SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op17;
      v_res := public.oc_criar_compromisso(v_op17, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub3,'valor_total',900));
      v_comp17 := (v_res->'compromisso'->>'id')::uuid;
      SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op17;
      v_res := public.oc_programar_compromisso(v_op17, v_ver, v_comp17, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',900))));
      IF (v_res->'programacao'->>'id') IS NULL THEN RAISE EXCEPTION 'T14b FAIL: usuario com acesso recusado'; END IF;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
      RAISE NOTICE 'T14b PASS (usuario do cliente)';
    END IF;
   END;
  END IF;

  -- ===== CASO AGNALDO: compromisso Compra animais (300k) programado em 3x 100k (Sicredi/Bradesco/Sicredi) =====
  DECLARE v_opA uuid; v_loteA uuid; v_compA uuid; v_v int;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-07','fechada',false,300000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opA;
    INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
      VALUES (v_opA,v_cli,'novilhas',20,'total',200,1) RETURNING id INTO v_loteA;
    SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_opA;
    v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_fA,'subcentro',v_sub_ani,'lote_id',v_loteA,'valor_total',300000));
    v_compA := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_programar_compromisso(v_opA, v_v, v_compA, jsonb_build_object('condicoes','entrada + 30 + 60', 'parcelas', jsonb_build_array(
      jsonb_build_object('sequencia',1,'valor',100000,'vencimento','2026-07-07','conta_bancaria_id',v_conta1,'forma','ted'),
      jsonb_build_object('sequencia',2,'valor',100000,'vencimento','2026-08-06','conta_bancaria_id',COALESCE(v_conta2,v_conta1),'forma','ted'),
      jsonb_build_object('sequencia',3,'valor',100000,'vencimento','2026-09-05','conta_bancaria_id',v_conta1,'forma','ted'))));
    IF jsonb_array_length(v_res->'parcelas')<>3 THEN RAISE EXCEPTION 'AGNALDO FAIL: parcelas'; END IF;
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_programacoes WHERE compromisso_id=v_compA AND status='ativa';
    IF v_cnt<>1 THEN RAISE EXCEPTION 'AGNALDO FAIL: programacoes ativas=%',v_cnt; END IF;
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_parcelas_programacao pp JOIN public.zoo_operacao_programacoes pr ON pr.id=pp.programacao_id WHERE pr.compromisso_id=v_compA AND pp.status='prevista';
    IF v_cnt<>3 THEN RAISE EXCEPTION 'AGNALDO FAIL: parcelas prevista=%',v_cnt; END IF;
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_compromissos WHERE id=v_compA AND status='programado';
    IF v_cnt<>1 THEN RAISE EXCEPTION 'AGNALDO FAIL: compromisso nao programado'; END IF;
    RAISE NOTICE 'AGNALDO PASS (programacao unica; 3 parcelas prevista 1/2/3; compromisso programado)';
  END;

  -- ===== T18: FRONTEIRA — zero titulo/parte materializado nas ops tagueadas =====
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes p JOIN public.zoo_operacoes_comerciais o ON o.id=p.operacao_id WHERE o.observacoes=v_tag;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T18 FAIL: parte materializada (%)',v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2 WHERE descricao=v_tag OR origem_tipo LIKE 'oc:programacao%';
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T18 FAIL: titulo materializado (%)',v_cnt; END IF;
  RAISE NOTICE 'T18 PASS (zero titulo/parte)';

  RAISE NOTICE 'PR-PROGRAMACAO-01: T1..T20 + AGNALDO OK';
END $t$;

ROLLBACK;

-- ===== grants por papel (fora da transacao) =====
DO $g$
DECLARE v_sig text := 'public.oc_programar_compromisso(uuid,integer,uuid,jsonb)';
BEGIN
  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN RAISE EXCEPTION 'GRANT FAIL: anon tem EXECUTE'; END IF;
  IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN RAISE EXCEPTION 'GRANT FAIL: authenticated sem EXECUTE'; END IF;
  IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN RAISE EXCEPTION 'GRANT FAIL: service_role sem EXECUTE'; END IF;
  RAISE NOTICE 'GRANTS PASS';
END $g$;

-- Residuo zero
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes=current_setting('app.ocp_tag'))
       + (SELECT count(*) FROM public.zoo_operacao_programacoes pr JOIN public.zoo_operacao_compromissos c ON c.id=pr.compromisso_id JOIN public.zoo_operacoes_comerciais o ON o.id=c.operacao_id WHERE o.observacoes=current_setting('app.ocp_tag'))
    INTO v_leak;
  IF v_leak<>0 THEN RAISE EXCEPTION 'RESIDUO FAIL: % linhas vazaram', v_leak; END IF;
  RAISE NOTICE 'RESIDUO ZERO PASS';
END $post$;

SELECT set_config('app.ocp_tag','',false) AS run_tag_reset;
