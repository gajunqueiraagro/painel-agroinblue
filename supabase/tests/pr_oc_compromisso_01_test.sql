-- PR-COMPROMISSO-01 — testes sinteticos de public.oc_criar_compromisso (T1..T21 + caso Agnaldo).
--   Valida: declaracao de compromisso (o que se deve, a quem, classificacao, valor); teto por natureza
--   (principal <= base; obrigacao sem teto); base indefinida bloqueia principal; resolucao de subcentro
--   0/1/>1; tenant/auth/versao; incremento de versao; evento; e FRONTEIRA (nenhuma programacao/parcela/
--   titulo criado). Requer aplicadas: 20260803150000 (writer), 20260803140000 (natureza obrigacao),
--   20260803130000 (estrutura). Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + residuo zero.
SELECT set_config('app.occ_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_fA uuid; v_fB uuid; v_fx uuid;
  v_sub_ani text; v_sub_frete text;
  v_user3 uuid; v_cli3 uuid; v_cliB uuid;
  v_op uuid; v_op2 uuid; v_lote uuid; v_lote2 uuid; v_ver int;
  v_res jsonb; v_cnt int; v_ok boolean;
BEGIN
  v_tag := current_setting('app.occ_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT id INTO v_fA FROM public.financeiro_fornecedores WHERE cliente_id=v_cli ORDER BY nome LIMIT 1;
  SELECT id INTO v_fB FROM public.financeiro_fornecedores WHERE cliente_id=v_cli AND id<>v_fA ORDER BY nome LIMIT 1;
  IF v_fA IS NULL THEN RAISE EXCEPTION 'fixture: cliente sem fornecedor'; END IF;
  SELECT id INTO v_fx FROM public.financeiro_fornecedores WHERE cliente_id IS NOT NULL AND cliente_id IS DISTINCT FROM v_cli LIMIT 1;  -- outro tenant
  SELECT cliente_id INTO v_cliB FROM public.cliente_membros WHERE cliente_id IS DISTINCT FROM v_cli LIMIT 1;
  SELECT cm.user_id, cm.cliente_id INTO v_user3, v_cli3 FROM public.cliente_membros cm
   WHERE cm.ativo=true AND cm.perfil<>'admin_agroinblue' AND cm.cliente_id IS DISTINCT FROM v_cli
     AND NOT EXISTS (SELECT 1 FROM public.cliente_membros a WHERE a.user_id=cm.user_id AND a.perfil='admin_agroinblue' AND a.ativo)
   ORDER BY cm.user_id LIMIT 1;

  -- subcentros que RESOLVEM UNICAMENTE (ativo, global+cliente) — animais e frete/comissao
  SELECT pc.subcentro INTO v_sub_ani FROM public.financeiro_plano_contas pc
   WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id=v_cli) AND pc.subcentro ILIKE '%Compra Bovinos Machos%'
     AND 1=(SELECT count(*) FROM public.financeiro_plano_contas p2 WHERE p2.ativo IS TRUE AND (p2.cliente_id IS NULL OR p2.cliente_id=v_cli) AND p2.subcentro IS NOT DISTINCT FROM pc.subcentro)
   LIMIT 1;
  SELECT pc.subcentro INTO v_sub_frete FROM public.financeiro_plano_contas pc
   WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id=v_cli) AND pc.subcentro ILIKE '%Frete%'
     AND 1=(SELECT count(*) FROM public.financeiro_plano_contas p2 WHERE p2.ativo IS TRUE AND (p2.cliente_id IS NULL OR p2.cliente_id=v_cli) AND p2.subcentro IS NOT DISTINCT FROM pc.subcentro)
   LIMIT 1;
  IF v_sub_ani IS NULL OR v_sub_frete IS NULL THEN RAISE EXCEPTION 'fixture: subcentros unicos ausentes (ani=%, frete=%)', v_sub_ani, v_sub_frete; END IF;

  -- ===== T1/T12/T18: principal dentro do teto -> cria; classificacao resolvida no servidor =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-01','fechada',false,300000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'novilhas',10,'total',100,1) RETURNING id INTO v_lote;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_fA,'subcentro',v_sub_ani,'lote_id',v_lote,'valor_total',300000,'descricao','T1'));
  IF (v_res->'compromisso'->>'plano_conta_id') IS NULL OR (v_res->'compromisso'->>'subcentro') IS DISTINCT FROM v_sub_ani THEN RAISE EXCEPTION 'T1/T12 FAIL: classificacao nao resolvida'; END IF;
  IF (v_res->>'operacao_versao')::int <> v_ver+1 THEN RAISE EXCEPTION 'T1 FAIL: versao nao incrementada (%->%)', v_ver, v_res->>'operacao_versao'; END IF;
  RAISE NOTICE 'T1/T12/T18 PASS';

  -- ===== T2: principal ultrapassa base -> P0001 =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-02','fechada',false,100000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op2;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op2;
  v_ok:=false;
  BEGIN v_res := public.oc_criar_compromisso(v_op2, v_ver, jsonb_build_object('natureza','principal','componente','principal','subcentro',v_sub_ani,'valor_total',100001));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T2 FAIL: principal acima da base aceito'; END IF; RAISE NOTICE 'T2 PASS';

  -- ===== T3/T4: base indefinida -> principal bloqueia; obrigacao cria =====
  DECLARE v_opN uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_estimado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-03','fechada',false,NULL,NULL,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opN;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opN;
    v_ok:=false;
    BEGIN v_res := public.oc_criar_compromisso(v_opN, v_ver, jsonb_build_object('natureza','principal','componente','principal','subcentro',v_sub_ani,'valor_total',1000));
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T3 FAIL: principal com base indefinida aceito'; END IF;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opN;
    v_res := public.oc_criar_compromisso(v_opN, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',5000));
    IF (v_res->'compromisso'->>'id') IS NULL THEN RAISE EXCEPTION 'T4 FAIL: obrigacao com base indefinida recusada'; END IF;
    RAISE NOTICE 'T3/T4 PASS';
  END;

  -- ===== T5: obrigacao acima do valor dos animais -> cria (sem teto) =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op2;   -- base 100000
  v_res := public.oc_criar_compromisso(v_op2, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',999999));
  IF (v_res->'compromisso'->>'id') IS NULL THEN RAISE EXCEPTION 'T5 FAIL: obrigacao grande recusada'; END IF; RAISE NOTICE 'T5 PASS';

  -- ===== T6: dois obrigacao/frete mesma operacao+lote -> ambos criam =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'lote_id',v_lote,'valor_total',1000));
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'lote_id',v_lote,'valor_total',2000));
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_compromissos WHERE operacao_id=v_op AND natureza='obrigacao' AND componente='frete' AND lote_id=v_lote;
  IF v_cnt<>2 THEN RAISE EXCEPTION 'T6 FAIL: dois obrigacao/frete no lote = %', v_cnt; END IF; RAISE NOTICE 'T6 PASS';

  -- ===== T7: dois principal soma <= base criam; alem disso rejeita =====
  DECLARE v_op7 uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-04','fechada',false,100000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op7;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op7;
    v_res := public.oc_criar_compromisso(v_op7, v_ver, jsonb_build_object('natureza','principal','componente','principal','subcentro',v_sub_ani,'valor_total',60000));
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op7;
    v_res := public.oc_criar_compromisso(v_op7, v_ver, jsonb_build_object('natureza','principal','componente','principal','subcentro',v_sub_ani,'valor_total',40000));  -- soma 100000 = base
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op7;
    v_ok:=false;
    BEGIN v_res := public.oc_criar_compromisso(v_op7, v_ver, jsonb_build_object('natureza','principal','componente','principal','subcentro',v_sub_ani,'valor_total',1));  -- estoura
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T7 FAIL: 3o principal acima da base aceito'; END IF; RAISE NOTICE 'T7 PASS';
  END;

  -- ===== T7b: principal PROGRAMADO consome o teto (regra positiva; nao so 'aberto') ; cancelado NAO conta =====
  DECLARE v_op7b uuid; v_comp7b uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-04','fechada',false,100000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op7b;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op7b;
    v_res := public.oc_criar_compromisso(v_op7b, v_ver, jsonb_build_object('natureza','principal','componente','principal','subcentro',v_sub_ani,'valor_total',60000));
    v_comp7b := (v_res->'compromisso'->>'id')::uuid;
    -- move para 'programado' (estado que o proximo writer atribuiria); deve continuar consumindo a base
    UPDATE public.zoo_operacao_compromissos SET status='programado' WHERE id=v_comp7b;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op7b;
    v_ok:=false;
    BEGIN v_res := public.oc_criar_compromisso(v_op7b, v_ver, jsonb_build_object('natureza','principal','componente','principal','subcentro',v_sub_ani,'valor_total',41000));
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T7b FAIL: principal PROGRAMADO nao consumiu o teto'; END IF;
    -- cancelar o programado libera a base: 41000 agora cabe
    UPDATE public.zoo_operacao_compromissos SET status='cancelado' WHERE id=v_comp7b;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op7b;
    v_res := public.oc_criar_compromisso(v_op7b, v_ver, jsonb_build_object('natureza','principal','componente','principal','subcentro',v_sub_ani,'valor_total',41000));
    IF (v_res->'compromisso'->>'id') IS NULL THEN RAISE EXCEPTION 'T7b FAIL: cancelado ainda consumiu o teto'; END IF;
    RAISE NOTICE 'T7b PASS (programado consome; cancelado libera)';
  END;

  -- ===== T8: favorecido de outro tenant -> bloqueio =====
  IF v_fx IS NOT NULL THEN
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op2;
    v_ok:=false;
    BEGIN v_res := public.oc_criar_compromisso(v_op2, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fx,'subcentro',v_sub_frete,'valor_total',100));
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T8 FAIL: favorecido de outro tenant aceito'; END IF; RAISE NOTICE 'T8 PASS';
  ELSE RAISE NOTICE 'T8 SKIP (sem fornecedor de outro tenant)'; END IF;

  -- ===== T9/T10: lote de outra operacao -> P0001 ; lote NULL -> cria =====
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'novilhas',5,'total',50,2) RETURNING id INTO v_lote2;  -- lote do v_op
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op2;
  v_ok:=false;
  BEGIN v_res := public.oc_criar_compromisso(v_op2, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','lote_id',v_lote2,'subcentro',v_sub_frete,'valor_total',100));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T9 FAIL: lote de outra operacao aceito'; END IF;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op2;
  v_res := public.oc_criar_compromisso(v_op2, v_ver, jsonb_build_object('natureza','obrigacao','componente','comissao','subcentro',v_sub_frete,'valor_total',100));  -- lote NULL
  IF (v_res->'compromisso'->>'id') IS NULL THEN RAISE EXCEPTION 'T10 FAIL: lote NULL recusado'; END IF;
  RAISE NOTICE 'T9/T10 PASS';

  -- ===== T11: subcentro inexistente -> P0001 =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op2;
  v_ok:=false;
  BEGIN v_res := public.oc_criar_compromisso(v_op2, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro','__subcentro_inexistente__','valor_total',100));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T11 FAIL: subcentro inexistente aceito'; END IF; RAISE NOTICE 'T11 PASS';

  -- ===== T13/T14: rascunho -> bloqueio ; cancelada -> bloqueio =====
  DECLARE v_opR uuid; v_opC uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-05','programada',true,50000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opR;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opR;
    v_ok:=false;
    BEGIN v_res := public.oc_criar_compromisso(v_opR, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',100));
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T13 FAIL: rascunho aceito'; END IF;
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-05','cancelada',false,50000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opC;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opC;
    v_ok:=false;
    BEGIN v_res := public.oc_criar_compromisso(v_opC, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',100));
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T14 FAIL: cancelada aceita'; END IF;
    RAISE NOTICE 'T13/T14 PASS';
  END;

  -- ===== T15: versao divergente -> 40001 =====
  v_ok:=false;
  BEGIN v_res := public.oc_criar_compromisso(v_op2, 999999, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',100));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='40001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T15 FAIL: versao divergente aceita'; END IF; RAISE NOTICE 'T15 PASS';

  -- ===== T21: natureza deducao/acrescimo -> P0001 (nao suportada) =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op2;
  v_ok:=false;
  BEGIN v_res := public.oc_criar_compromisso(v_op2, v_ver, jsonb_build_object('natureza','deducao','componente','frete','subcentro',v_sub_frete,'valor_total',100));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T21 FAIL: natureza deducao aceita'; END IF; RAISE NOTICE 'T21 PASS';

  -- ===== T16: sem acesso -> 42501 =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op2;
  v_ok:=false;
  BEGIN v_res := public.oc_criar_compromisso(v_op2, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',100));
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='42501'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T16 FAIL: sem acesso executou'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  RAISE NOTICE 'T16 PASS';

  -- ===== T19: service_role -> sucesso =====
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op2;
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  v_res := public.oc_criar_compromisso(v_op2, v_ver, jsonb_build_object('natureza','obrigacao','componente','comissao','subcentro',v_sub_frete,'valor_total',100));
  IF (v_res->'compromisso'->>'id') IS NULL THEN RAISE EXCEPTION 'T19 FAIL: service_role recusado'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  RAISE NOTICE 'T19 PASS';

  -- ===== T17: usuario NAO-admin com acesso ao proprio cliente -> sucesso =====
  IF v_user3 IS NOT NULL THEN
   DECLARE v_op17 uuid; v_sub3 text;
   BEGIN
    SELECT pc.subcentro INTO v_sub3 FROM public.financeiro_plano_contas pc
     WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id=v_cli3)
       AND 1=(SELECT count(*) FROM public.financeiro_plano_contas p2 WHERE p2.ativo IS TRUE AND (p2.cliente_id IS NULL OR p2.cliente_id=v_cli3) AND p2.subcentro IS NOT DISTINCT FROM pc.subcentro)
     LIMIT 1;
    IF v_sub3 IS NOT NULL THEN
      INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
        VALUES (v_cli3,'compra',DATE '2026-07-06','fechada',false,10000,NULL,v_tag,v_user3,v_user3) RETURNING id INTO v_op17;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user3::text, 'role','authenticated')::text, true);
      SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op17;
      v_res := public.oc_criar_compromisso(v_op17, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub3,'valor_total',500));
      IF (v_res->'compromisso'->>'id') IS NULL THEN RAISE EXCEPTION 'T17 FAIL: usuario com acesso recusado'; END IF;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
      RAISE NOTICE 'T17 PASS';
    ELSE RAISE NOTICE 'T17 SKIP (cliente do membro sem subcentro unico)'; END IF;
   END;
  ELSE RAISE NOTICE 'T17 SKIP (sem membro nao-admin de outro cliente)'; END IF;

  -- ===== CASO AGNALDO (sintetico): 1 principal (=base) + 3 obrigacao; base inalterada =====
  DECLARE v_opA uuid; v_loteA uuid; v_base_antes numeric; v_base_depois numeric; v_v int;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-07','fechada',false,300000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opA;
    INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
      VALUES (v_opA,v_cli,'novilhas',20,'total',200,1) RETURNING id INTO v_loteA;
    SELECT b.base INTO v_base_antes FROM public._oc_base_saldo_operacao(v_opA) b;
    SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_opA;
    v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_fA,'subcentro',v_sub_ani,'lote_id',v_loteA,'valor_total',300000));
    v_v := (v_res->>'operacao_versao')::int;   -- usa a versao retornada
    v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub_frete,'valor_total',5000));
    v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','obrigacao','componente','comissao','subcentro',v_sub_frete,'valor_total',3000));
    v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','obrigacao','componente','taxa_aquisicao','subcentro',v_sub_frete,'valor_total',1000));
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_compromissos WHERE operacao_id=v_opA AND status<>'cancelado';
    IF v_cnt<>4 THEN RAISE EXCEPTION 'AGNALDO FAIL: compromissos=%', v_cnt; END IF;
    SELECT COALESCE(sum(valor_total),0) INTO v_cnt FROM public.zoo_operacao_compromissos WHERE operacao_id=v_opA AND natureza='obrigacao';
    IF v_cnt<>9000 THEN RAISE EXCEPTION 'AGNALDO FAIL: obrigacoes somam %', v_cnt; END IF;
    SELECT b.base INTO v_base_depois FROM public._oc_base_saldo_operacao(v_opA) b;
    IF v_base_depois IS DISTINCT FROM v_base_antes THEN RAISE EXCEPTION 'AGNALDO FAIL: base mudou (% -> %)', v_base_antes, v_base_depois; END IF;
    RAISE NOTICE 'AGNALDO PASS (4 compromissos; obrigacao=9000 sem teto; base inalterada)';
  END;

  -- ===== T20: FRONTEIRA — nenhuma programacao/parcela/titulo/parte criada nas ops tagueadas =====
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_programacoes pr
    JOIN public.zoo_operacao_compromissos c ON c.id=pr.compromisso_id
    JOIN public.zoo_operacoes_comerciais o ON o.id=c.operacao_id WHERE o.observacoes=v_tag;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T20 FAIL: programacao criada (%)', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_parcelas_programacao pp
    JOIN public.zoo_operacao_programacoes pr ON pr.id=pp.programacao_id
    JOIN public.zoo_operacao_compromissos c ON c.id=pr.compromisso_id
    JOIN public.zoo_operacoes_comerciais o ON o.id=c.operacao_id WHERE o.observacoes=v_tag;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T20 FAIL: parcela criada (%)', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes p
    JOIN public.zoo_operacoes_comerciais o ON o.id=p.operacao_id WHERE o.observacoes=v_tag;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T20 FAIL: parte criada (%)', v_cnt; END IF;
  RAISE NOTICE 'T20 PASS (nenhuma programacao/parcela/parte/titulo)';

  RAISE NOTICE 'PR-COMPROMISSO-01: T1..T21 + AGNALDO OK';
END $t$;

ROLLBACK;

-- ===== grants por papel (fora da transacao) =====
DO $g$
DECLARE v_sig text := 'public.oc_criar_compromisso(uuid,integer,jsonb)';
BEGIN
  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN RAISE EXCEPTION 'GRANT FAIL: anon tem EXECUTE'; END IF;
  IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN RAISE EXCEPTION 'GRANT FAIL: authenticated sem EXECUTE'; END IF;
  IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN RAISE EXCEPTION 'GRANT FAIL: service_role sem EXECUTE'; END IF;
  RAISE NOTICE 'GRANTS PASS';
END $g$;

-- Residuo zero (tag sobrevive ao rollback)
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes=current_setting('app.occ_tag'))
       + (SELECT count(*) FROM public.zoo_operacao_compromissos c JOIN public.zoo_operacoes_comerciais o ON o.id=c.operacao_id WHERE o.observacoes=current_setting('app.occ_tag'))
    INTO v_leak;
  IF v_leak<>0 THEN RAISE EXCEPTION 'RESIDUO FAIL: % linhas vazaram', v_leak; END IF;
  RAISE NOTICE 'RESIDUO ZERO PASS';
END $post$;

SELECT set_config('app.occ_tag','',false) AS run_tag_reset;
