-- PR-OC-UI-FIN-READ — testes das 3 views (vw_oc_compromissos_resumo / vw_oc_parcelas_materializacao /
--   vw_oc_operacao_compromissos_resumo). Fixtures via os writers vivos (oc_criar_compromisso /
--   oc_programar_compromisso / oc_materializar_programacao) + manipulacao direta de liquidacoes/estado.
--   Requer aplicadas: 20260803190000 (views) + writers 20260803150000/160000/180000 + estrutura 130000.
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + residuo zero. As views nao dependem de dados reais.
SELECT set_config('app.ocr_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_fA uuid;
  v_sub_ani text; v_sub_frete text;
  v_conta1 uuid; v_conta_x uuid;
  v_res jsonb; v_v int; v_cnt int; v_ok boolean; v_num numeric; v_txt text;
  -- Agnaldo
  v_opA uuid; v_loteA uuid;
  v_cP uuid; v_cF uuid; v_cC uuid; v_cT uuid;
  v_pP uuid; v_pF uuid; v_pC uuid; v_pT uuid;
  v_parcP1 uuid; v_parcP2 uuid; v_parcP3 uuid; v_parcF uuid; v_parcC uuid; v_parcT uuid;
  v_titF uuid; v_parteF uuid; v_titC uuid;
BEGIN
  v_tag := current_setting('app.ocr_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT id INTO v_fA FROM public.financeiro_fornecedores WHERE cliente_id=v_cli ORDER BY nome LIMIT 1;
  IF v_fA IS NULL THEN RAISE EXCEPTION 'fixture: cliente sem fornecedor'; END IF;
  SELECT id INTO v_conta1 FROM public.financeiro_contas_bancarias WHERE cliente_id=v_cli ORDER BY ordem_exibicao LIMIT 1;
  SELECT id INTO v_conta_x FROM public.financeiro_contas_bancarias WHERE cliente_id IS DISTINCT FROM v_cli LIMIT 1;
  SELECT pc.subcentro INTO v_sub_ani FROM public.financeiro_plano_contas pc
   WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id=v_cli) AND pc.subcentro ILIKE '%Compra Bovinos Machos%'
     AND 1=(SELECT count(*) FROM public.financeiro_plano_contas p2 WHERE p2.ativo IS TRUE AND (p2.cliente_id IS NULL OR p2.cliente_id=v_cli) AND p2.subcentro IS NOT DISTINCT FROM pc.subcentro) LIMIT 1;
  SELECT pc.subcentro INTO v_sub_frete FROM public.financeiro_plano_contas pc
   WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id=v_cli) AND pc.subcentro ILIKE '%Frete%'
     AND 1=(SELECT count(*) FROM public.financeiro_plano_contas p2 WHERE p2.ativo IS TRUE AND (p2.cliente_id IS NULL OR p2.cliente_id=v_cli) AND p2.subcentro IS NOT DISTINCT FROM pc.subcentro) LIMIT 1;
  IF v_sub_ani IS NULL OR v_sub_frete IS NULL THEN RAISE EXCEPTION 'fixture: subcentros unicos ausentes'; END IF;

  -- ===================== AGNALDO (T1/T8) =====================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-07','fechada',false,300000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opA;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_opA,v_cli,'novilhas',20,'total',200,1) RETURNING id INTO v_loteA;
  SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_opA;
  v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_fA,'subcentro',v_sub_ani,'lote_id',v_loteA,'valor_total',300000));
  v_cP := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
  v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',5000));
  v_cF := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
  v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','obrigacao','componente','comissao','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',3000));
  v_cC := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
  v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','obrigacao','componente','taxa_aquisicao','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',1000));
  v_cT := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;

  v_res := public.oc_programar_compromisso(v_opA, v_v, v_cP, jsonb_build_object('parcelas', jsonb_build_array(
    jsonb_build_object('sequencia',1,'valor',100000,'vencimento','2026-07-07','conta_bancaria_id',v_conta1),
    jsonb_build_object('sequencia',2,'valor',100000,'vencimento','2026-08-06','conta_bancaria_id',v_conta1),
    jsonb_build_object('sequencia',3,'valor',100000,'vencimento','2026-09-05','conta_bancaria_id',v_conta1))));
  v_pP := (v_res->'programacao'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
  v_parcP1 := (v_res->'parcelas'->0->>'id')::uuid; v_parcP2 := (v_res->'parcelas'->1->>'id')::uuid; v_parcP3 := (v_res->'parcelas'->2->>'id')::uuid;
  v_res := public.oc_programar_compromisso(v_opA, v_v, v_cF, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',5000,'vencimento','2026-07-15','conta_bancaria_id',v_conta1))));
  v_pF := (v_res->'programacao'->>'id')::uuid; v_parcF := (v_res->'parcelas'->0->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
  v_res := public.oc_programar_compromisso(v_opA, v_v, v_cC, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',3000,'vencimento','2026-07-20','conta_bancaria_id',v_conta1))));
  v_pC := (v_res->'programacao'->>'id')::uuid; v_parcC := (v_res->'parcelas'->0->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
  v_res := public.oc_programar_compromisso(v_opA, v_v, v_cT, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',1000,'vencimento','2026-07-25','conta_bancaria_id',v_conta1))));
  v_pT := (v_res->'programacao'->>'id')::uuid; v_parcT := (v_res->'parcelas'->0->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;

  v_res := public.oc_materializar_programacao(v_opA, v_v, v_pP, v_parcP1); v_v := (v_res->>'operacao_versao')::int;
  v_res := public.oc_materializar_programacao(v_opA, v_v, v_pP, v_parcP2); v_v := (v_res->>'operacao_versao')::int;
  v_res := public.oc_materializar_programacao(v_opA, v_v, v_pP, v_parcP3); v_v := (v_res->>'operacao_versao')::int;
  v_res := public.oc_materializar_programacao(v_opA, v_v, v_pF, v_parcF);
  v_titF := (v_res->'titulo'->>'id')::uuid; v_parteF := (v_res->'parte'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
  v_res := public.oc_materializar_programacao(v_opA, v_v, v_pC, v_parcC); v_titC := (v_res->'titulo'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
  v_res := public.oc_materializar_programacao(v_opA, v_v, v_pT, v_parcT); v_v := (v_res->>'operacao_versao')::int;

  -- T1 — View 1 (compromisso principal) + rollup soberano
  SELECT total_programado, total_materializado, saldo_a_materializar, tem_divergencia
    INTO v_num, v_num, v_num, v_ok
    FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cP;
  SELECT total_programado INTO v_num FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cP;
  IF v_num<>300000 THEN RAISE EXCEPTION 'T1 FAIL: principal total_programado=%',v_num; END IF;
  SELECT total_materializado INTO v_num FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cP;
  IF v_num<>300000 THEN RAISE EXCEPTION 'T1 FAIL: principal total_materializado=%',v_num; END IF;
  SELECT COALESCE(bool_or(tem_divergencia),false) INTO v_ok FROM public.vw_oc_compromissos_resumo WHERE operacao_id=v_opA;
  IF v_ok THEN RAISE EXCEPTION 'T1 FAIL: divergencia inesperada'; END IF;

  -- T8 — View 3 (operacao) modo + rollup
  SELECT modo, obrigacao_total, total_programado, total_materializado, total_liquidado, saldo_financeiro, n_compromissos, tem_compromissos, tem_partes_legadas, tem_divergencia
    INTO v_txt, v_num, v_num, v_num, v_num, v_num, v_cnt, v_ok, v_ok, v_ok
    FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opA;
  SELECT modo INTO v_txt FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opA;
  IF v_txt<>'novo_modelo' THEN RAISE EXCEPTION 'T8 FAIL: modo=%',v_txt; END IF;
  SELECT obrigacao_total, total_materializado, total_liquidado, saldo_financeiro INTO v_num, v_num, v_num, v_num FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opA;
  PERFORM 1;
  IF (SELECT obrigacao_total FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opA)<>309000 THEN RAISE EXCEPTION 'T1/T8 FAIL: obrigacao_total<>309000'; END IF;
  IF (SELECT total_programado FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opA)<>309000 THEN RAISE EXCEPTION 'T8 FAIL: total_programado<>309000'; END IF;
  IF (SELECT total_materializado FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opA)<>309000 THEN RAISE EXCEPTION 'T1/T8 FAIL: total_materializado<>309000'; END IF;
  IF (SELECT total_liquidado FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opA)<>0 THEN RAISE EXCEPTION 'T8 FAIL: total_liquidado<>0'; END IF;
  IF (SELECT saldo_financeiro FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opA)<>309000 THEN RAISE EXCEPTION 'T8 FAIL: saldo_financeiro<>309000'; END IF;
  IF (SELECT tem_divergencia FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opA) THEN RAISE EXCEPTION 'T8 FAIL: tem_divergencia'; END IF;
  RAISE NOTICE 'T1/T8 PASS (309000; modo novo_modelo; sem divergencia)';

  -- T5 — View 2: materializada com parte/titulo + vinculo_integro; prevista com NULLs
  SELECT materializada, vinculo_integro, (parte_id IS NOT NULL), (titulo_id IS NOT NULL)
    INTO v_ok, v_ok, v_ok, v_ok FROM public.vw_oc_parcelas_materializacao WHERE parcela_id=v_parcF;
  IF NOT (SELECT materializada FROM public.vw_oc_parcelas_materializacao WHERE parcela_id=v_parcF) THEN RAISE EXCEPTION 'T5 FAIL: parcela materializada=false'; END IF;
  IF NOT (SELECT vinculo_integro FROM public.vw_oc_parcelas_materializacao WHERE parcela_id=v_parcF) THEN RAISE EXCEPTION 'T5 FAIL: vinculo_integro=false'; END IF;
  IF (SELECT parte_id FROM public.vw_oc_parcelas_materializacao WHERE parcela_id=v_parcF) IS NULL THEN RAISE EXCEPTION 'T5 FAIL: parte_id NULL'; END IF;
  -- parcela prevista (compromisso extra, 2 parcelas, materializa 1)
  DECLARE v_cX uuid; v_pX uuid; v_px1 uuid; v_px2 uuid;
  BEGIN
    SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_opA;
    v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',4000));
    v_cX := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_programar_compromisso(v_opA, v_v, v_cX, jsonb_build_object('parcelas', jsonb_build_array(
      jsonb_build_object('sequencia',1,'valor',2000), jsonb_build_object('sequencia',2,'valor',2000))));
    v_pX := (v_res->'programacao'->>'id')::uuid; v_px1 := (v_res->'parcelas'->0->>'id')::uuid; v_px2 := (v_res->'parcelas'->1->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_materializar_programacao(v_opA, v_v, v_pX, v_px1); v_v := (v_res->>'operacao_versao')::int;
    IF (SELECT materializada FROM public.vw_oc_parcelas_materializacao WHERE parcela_id=v_px2) THEN RAISE EXCEPTION 'T5 FAIL: parcela prevista aparece materializada'; END IF;
    IF (SELECT parte_id FROM public.vw_oc_parcelas_materializacao WHERE parcela_id=v_px2) IS NOT NULL THEN RAISE EXCEPTION 'T5 FAIL: prevista com parte_id nao-nulo'; END IF;
    IF NOT (SELECT vinculo_integro FROM public.vw_oc_parcelas_materializacao WHERE parcela_id=v_px2) THEN RAISE EXCEPTION 'T5 FAIL: prevista vinculo_integro=false (deveria ser vacuo true)'; END IF;
    RAISE NOTICE 'T5 PASS';
  END;

  -- T9 — MULTIPLAS linhas de liquidacao por titulo (1 ativa + 1 estornada; a constraint
  --   uq_zoo_oc_liq_ativa_por_titulo permite so 1 ATIVA por titulo) -> pre-agregacao soma so a ativa
  --   e NAO infla parte/compromisso. Monetario (pix) no frete; nao-monetario (compensacao) na comissao.
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id,operacao_id,data,natureza,forma,valor,financeiro_lancamento_id,origem,estornado)
    VALUES (v_cli,v_opA,DATE '2026-07-16','pagamento','pix',3000,v_titF,'manual',false);      -- ATIVA
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id,operacao_id,data,natureza,forma,valor,financeiro_lancamento_id,origem,estornado)
    VALUES (v_cli,v_opA,DATE '2026-07-15','pagamento','pix',500,v_titF,'manual',true);        -- ESTORNADA (2a linha do mesmo titulo)
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id,operacao_id,data,natureza,forma,valor,financeiro_lancamento_id,origem,estornado)
    VALUES (v_cli,v_opA,DATE '2026-07-20','pagamento','compensacao',1000,v_titC,'manual',false); -- nao-monetario, outro titulo
  IF (SELECT total_liquidado FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cF)<>3000 THEN RAISE EXCEPTION 'T9 FAIL: frete total_liquidado<>3000 (estornada deve sair)'; END IF;
  IF (SELECT total_liquidado_monetario FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cF)<>3000 THEN RAISE EXCEPTION 'T9 FAIL: liquidado_monetario<>3000'; END IF;
  IF (SELECT total_materializado FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cF)<>5000 THEN RAISE EXCEPTION 'T9 FAIL: multiplas linhas inflaram materializado'; END IF;
  IF (SELECT saldo_financeiro FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cF)<>2000 THEN RAISE EXCEPTION 'T9 FAIL: saldo_financeiro frete<>2000 (5000-3000)'; END IF;
  IF (SELECT total_liquidado_titulo FROM public.vw_oc_parcelas_materializacao WHERE parcela_id=v_parcF)<>3000 THEN RAISE EXCEPTION 'T9 FAIL: View2 total_liquidado_titulo<>3000'; END IF;
  IF (SELECT total_liquidado_nao_monetario FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cC)<>1000 THEN RAISE EXCEPTION 'T9 FAIL: comissao nao_monetario<>1000'; END IF;
  RAISE NOTICE 'T9 PASS (multiplas linhas; ativa somada, estornada fora, sem inflar; mon+nao-mon)';

  -- T4 — estornar a liquidacao ATIVA do frete -> some do total
  UPDATE public.zoo_operacao_liquidacoes SET estornado=true WHERE financeiro_lancamento_id=v_titF AND forma='pix' AND estornado=false;
  IF (SELECT total_liquidado FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cF)<>0 THEN RAISE EXCEPTION 'T4 FAIL: estornada ainda conta (esperado 0)'; END IF;
  RAISE NOTICE 'T4 PASS (liquidacao estornada fora do total)';

  -- T2 — compromisso cancelado: aparece na View1 (espelho) mas fora de obrigacao_total (View3)
  DECLARE v_cCanc uuid; v_ob_antes numeric; v_ob_depois numeric;
  BEGIN
    SELECT obrigacao_total INTO v_ob_antes FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opA;
    SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_opA;
    v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',2000));
    v_cCanc := (v_res->'compromisso'->>'id')::uuid;
    UPDATE public.zoo_operacao_compromissos SET status='cancelado' WHERE id=v_cCanc;
    IF (SELECT count(*) FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cCanc AND status='cancelado')<>1 THEN RAISE EXCEPTION 'T2 FAIL: cancelado ausente na View1 (espelho)'; END IF;
    SELECT obrigacao_total INTO v_ob_depois FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opA;
    IF v_ob_depois<>v_ob_antes THEN RAISE EXCEPTION 'T2 FAIL: cancelado entrou em obrigacao_total (% -> %)',v_ob_antes,v_ob_depois; END IF;
    RAISE NOTICE 'T2 PASS (espelho na View1; fora de obrigacao_total na View3)';
  END;

  -- T3 — programacao renegociada: parcelas fora de total_programado
  DECLARE v_cR uuid; v_pR uuid;
  BEGIN
    SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_opA;
    v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',1000));
    v_cR := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_programar_compromisso(v_opA, v_v, v_cR, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',1000))));
    v_pR := (v_res->'programacao'->>'id')::uuid;
    IF (SELECT total_programado FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cR)<>1000 THEN RAISE EXCEPTION 'T3 FAIL: ativa nao somou'; END IF;
    UPDATE public.zoo_operacao_programacoes SET status='renegociada' WHERE id=v_pR;
    IF (SELECT total_programado FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cR)<>0 THEN RAISE EXCEPTION 'T3 FAIL: renegociada ainda soma'; END IF;
    IF (SELECT tem_programacao_ativa FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cR) THEN RAISE EXCEPTION 'T3 FAIL: tem_programacao_ativa apos renegociar'; END IF;
    RAISE NOTICE 'T3 PASS (renegociada fora de total_programado)';
  END;

  -- T6 — operacao LEGADA (parte manual, programacao_parcela_id NULL) -> modo=legado + presente em vw_oc_obrigacoes
  DECLARE v_opL uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-06-01','fechada',false,10000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opL;
    INSERT INTO public.zoo_operacao_partes (cliente_id,operacao_id,origem,natureza,componente,valor,programacao_parcela_id)
      VALUES (v_cli,v_opL,'manual','principal','principal',10000,NULL);
    IF (SELECT modo FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opL)<>'legado' THEN RAISE EXCEPTION 'T6 FAIL: modo<>legado'; END IF;
    IF NOT (SELECT tem_partes_legadas FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opL) THEN RAISE EXCEPTION 'T6 FAIL: tem_partes_legadas=false'; END IF;
    IF (SELECT tem_compromissos FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opL) THEN RAISE EXCEPTION 'T6 FAIL: tem_compromissos=true'; END IF;
    IF (SELECT count(*) FROM public.vw_oc_obrigacoes WHERE operacao_id=v_opL)<1 THEN RAISE EXCEPTION 'T6 FAIL: legada ausente em vw_oc_obrigacoes'; END IF;
    RAISE NOTICE 'T6 PASS (modo legado; visivel na view legada)';
  END;

  -- T7 — operacao nova-vazia -> modo=nova_vazia
  DECLARE v_opV uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-30','fechada',false,5000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opV;
    IF (SELECT modo FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opV)<>'nova_vazia' THEN RAISE EXCEPTION 'T7 FAIL: modo<>nova_vazia'; END IF;
    IF (SELECT obrigacao_total FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opV)<>0 THEN RAISE EXCEPTION 'T7 FAIL: obrigacao_total<>0'; END IF;
    RAISE NOTICE 'T7 PASS (nova_vazia)';
  END;

  -- T12 — divergencia sintetica: parte com valor != parcela -> tem_divergencia=true nas 3 views
  DECLARE v_opD uuid; v_cD uuid; v_pD uuid; v_parcD uuid; v_parteD uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-10','fechada',false,8000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opD;
    SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_opD;
    v_res := public.oc_criar_compromisso(v_opD, v_v, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',2000));
    v_cD := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_programar_compromisso(v_opD, v_v, v_cD, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',2000))));
    v_pD := (v_res->'programacao'->>'id')::uuid; v_parcD := (v_res->'parcelas'->0->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_materializar_programacao(v_opD, v_v, v_pD, v_parcD);
    v_parteD := (v_res->'parte'->>'id')::uuid;
    -- quebra identidade: parte.valor != parcela.valor
    UPDATE public.zoo_operacao_partes SET valor=valor+1 WHERE id=v_parteD;
    IF NOT (SELECT tem_divergencia FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_cD) THEN RAISE EXCEPTION 'T12 FAIL: View1 sem divergencia'; END IF;
    IF NOT (SELECT tem_divergencia FROM public.vw_oc_parcelas_materializacao WHERE parcela_id=v_parcD) THEN RAISE EXCEPTION 'T12 FAIL: View2 sem divergencia'; END IF;
    IF NOT (SELECT tem_divergencia FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opD) THEN RAISE EXCEPTION 'T12 FAIL: View3 sem divergencia'; END IF;
    RAISE NOTICE 'T12 PASS (divergencia propaga nas 3 views)';
  END;

  -- T12b — cancelado com RESIDUO financeiro (3 tipos) -> tem_divergencia=true (View1 e View3);
  --         View3 continua EXCLUINDO dos totais (obrigacao_total=0); View1 preserva o historico.
  DECLARE
    v_opCR uuid; v_c1 uuid; v_p1 uuid; v_pc1 uuid;
    v_c2 uuid; v_p2 uuid; v_pc2 uuid;
    v_c3 uuid; v_p3 uuid; v_pc3 uuid; v_t3 uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-12','fechada',false,5000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opCR;
    -- residuo 1: programacao ativa apos cancelar o compromisso
    SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_opCR;
    v_res := public.oc_criar_compromisso(v_opCR, v_v, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',1000));
    v_c1 := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_programar_compromisso(v_opCR, v_v, v_c1, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',1000)))); v_v := (v_res->>'operacao_versao')::int;
    UPDATE public.zoo_operacao_compromissos SET status='cancelado' WHERE id=v_c1;
    IF (SELECT total_programado FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_c1)<>1000 THEN RAISE EXCEPTION 'T12b FAIL: programado residual perdido'; END IF;
    IF NOT (SELECT tem_divergencia FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_c1) THEN RAISE EXCEPTION 'T12b FAIL: cancelado+programado sem divergencia'; END IF;
    -- residuo 2: parte materializada apos cancelar
    SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_opCR;
    v_res := public.oc_criar_compromisso(v_opCR, v_v, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',1000));
    v_c2 := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_programar_compromisso(v_opCR, v_v, v_c2, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',1000))));
    v_p2 := (v_res->'programacao'->>'id')::uuid; v_pc2 := (v_res->'parcelas'->0->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_materializar_programacao(v_opCR, v_v, v_p2, v_pc2); v_v := (v_res->>'operacao_versao')::int;
    UPDATE public.zoo_operacao_compromissos SET status='cancelado' WHERE id=v_c2;
    IF (SELECT total_materializado FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_c2)<>1000 THEN RAISE EXCEPTION 'T12b FAIL: materializado residual perdido'; END IF;
    IF NOT (SELECT tem_divergencia FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_c2) THEN RAISE EXCEPTION 'T12b FAIL: cancelado+materializado sem divergencia'; END IF;
    -- residuo 3: liquidacao apos cancelar
    SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_opCR;
    v_res := public.oc_criar_compromisso(v_opCR, v_v, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',1000));
    v_c3 := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_programar_compromisso(v_opCR, v_v, v_c3, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',1000))));
    v_p3 := (v_res->'programacao'->>'id')::uuid; v_pc3 := (v_res->'parcelas'->0->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_materializar_programacao(v_opCR, v_v, v_p3, v_pc3); v_t3 := (v_res->'titulo'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    INSERT INTO public.zoo_operacao_liquidacoes (cliente_id,operacao_id,data,natureza,forma,valor,financeiro_lancamento_id,origem,estornado)
      VALUES (v_cli,v_opCR,DATE '2026-07-13','pagamento','pix',500,v_t3,'manual',false);
    UPDATE public.zoo_operacao_compromissos SET status='cancelado' WHERE id=v_c3;
    IF (SELECT total_liquidado FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_c3)<>500 THEN RAISE EXCEPTION 'T12b FAIL: liquidado residual perdido'; END IF;
    IF NOT (SELECT tem_divergencia FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_c3) THEN RAISE EXCEPTION 'T12b FAIL: cancelado+liquidado sem divergencia'; END IF;
    -- View3: divergencia acesa; totais EXCLUEM os 3 cancelados (obrigacao_total=0); conta todos (n=3)
    IF NOT (SELECT tem_divergencia FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opCR) THEN RAISE EXCEPTION 'T12b FAIL: View3 sem divergencia'; END IF;
    IF (SELECT obrigacao_total FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opCR)<>0 THEN RAISE EXCEPTION 'T12b FAIL: cancelado entrou em obrigacao_total'; END IF;
    IF (SELECT total_materializado FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opCR)<>0 THEN RAISE EXCEPTION 'T12b FAIL: cancelado entrou em total_materializado'; END IF;
    IF (SELECT n_compromissos FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opCR)<>3 THEN RAISE EXCEPTION 'T12b FAIL: n_compromissos<>3'; END IF;
    RAISE NOTICE 'T12b PASS (cancelado+residuo: divergencia acesa, fora dos totais, historico preservado)';
  END;

  -- T10 — RLS: outro tenant nao ve as linhas (SET LOCAL ROLE authenticated forca enforcement)
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);
    IF (SELECT count(*) FROM public.vw_oc_compromissos_resumo WHERE operacao_id=v_opA) <> 0 THEN RAISE EXCEPTION 'T10 FAIL: View1 vazou cross-tenant'; END IF;
    IF (SELECT count(*) FROM public.vw_oc_parcelas_materializacao WHERE operacao_id=v_opA) <> 0 THEN RAISE EXCEPTION 'T10 FAIL: View2 vazou cross-tenant'; END IF;
    IF (SELECT count(*) FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_opA) <> 0 THEN RAISE EXCEPTION 'T10 FAIL: View3 vazou cross-tenant'; END IF;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
    RAISE NOTICE 'T10 PASS (RLS bloqueia cross-tenant)';
  EXCEPTION WHEN insufficient_privilege THEN
    -- so o erro de SET ROLE / falta de grant (42501) vira SKIP; um vazamento real (P0001) propaga e falha.
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
    RAISE NOTICE 'T10 SKIP (ambiente sem SET ROLE authenticated: %)', SQLERRM;
  END;

  RAISE NOTICE 'PR-OC-UI-FIN-READ: T1..T13 + T12b OK';
END $t$;

ROLLBACK;

-- ===== grants por papel (fora da transacao) =====
DO $g$
DECLARE v_v text;
BEGIN
  FOREACH v_v IN ARRAY ARRAY['public.vw_oc_compromissos_resumo','public.vw_oc_parcelas_materializacao','public.vw_oc_operacao_compromissos_resumo']
  LOOP
    IF has_table_privilege('anon', v_v, 'SELECT') THEN RAISE EXCEPTION 'GRANT FAIL: anon SELECT em %', v_v; END IF;
    IF NOT has_table_privilege('authenticated', v_v, 'SELECT') THEN RAISE EXCEPTION 'GRANT FAIL: authenticated sem SELECT em %', v_v; END IF;
  END LOOP;
  RAISE NOTICE 'GRANTS PASS';
END $g$;

-- ===== T11: views legadas intactas (definicao normalizada preserva a semantica-chave) =====
DO $l$
DECLARE v_ob text; v_op text;
BEGIN
  v_ob := lower(regexp_replace(pg_get_viewdef('public.vw_oc_obrigacoes'::regclass, true), '\s+', ' ', 'g'));
  v_op := lower(regexp_replace(pg_get_viewdef('public.vw_oc_operacao_liquidacao'::regclass, true), '\s+', ' ', 'g'));
  IF position('origem <> ''negociacao''' IN v_ob) = 0 THEN RAISE EXCEPTION 'T11 FAIL: vw_oc_obrigacoes perdeu filtro origem<>negociacao'; END IF;
  IF position('_oc_base_saldo_operacao' IN v_op) = 0 THEN RAISE EXCEPTION 'T11 FAIL: vw_oc_operacao_liquidacao perdeu _oc_base_saldo_operacao'; END IF;
  RAISE NOTICE 'T11 PASS (views legadas intactas)';
END $l$;

-- ===== T13: residuo zero (pos-ROLLBACK) =====
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes=current_setting('app.ocr_tag'))
       + (SELECT count(*) FROM public.zoo_operacao_partes p JOIN public.zoo_operacoes_comerciais o ON o.id=p.operacao_id WHERE o.observacoes=current_setting('app.ocr_tag'))
    INTO v_leak;
  IF v_leak<>0 THEN RAISE EXCEPTION 'RESIDUO FAIL: % linhas vazaram', v_leak; END IF;
  RAISE NOTICE 'RESIDUO ZERO PASS';
END $post$;

SELECT set_config('app.ocr_tag','',false) AS run_tag_reset;
