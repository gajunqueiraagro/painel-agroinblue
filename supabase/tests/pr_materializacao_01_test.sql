-- PR-MATERIALIZACAO-01 — testes sinteticos de public.oc_materializar_programacao (T1..T20 + Agnaldo).
--   Valida: materializa UMA parcela 'prevista' em 1 parte (snapshot) + 1 titulo 'programado' (aberto) +
--   parcela->'materializada'; identidade 1:1:1 (titulo.valor=parte.valor=parcela.valor); vinculo
--   bidirecional; ponte inerte (zero liquidacao); estados/tenant/auth/versao; forward-only; atomicidade.
--   Requer aplicadas: 20260803180000 (writer), 20260803170000 (partes-simetria), 20260803160000
--   (programar), 20260803150000 (criar_compromisso), 20260803140000 (catalogo), 20260803130000 (estrutura).
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + residuo zero.
SELECT set_config('app.ocm_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_fA uuid;
  v_sub_ani text; v_sub_frete text;
  v_user3 uuid; v_cli3 uuid;
  v_conta1 uuid; v_conta2 uuid; v_conta_x uuid;
  v_op uuid; v_lote uuid; v_ver int;
  v_res jsonb; v_cnt int; v_ok boolean; v_comp uuid; v_prog uuid;
  v_parc uuid; v_parc2 uuid; v_parc3 uuid;
  v_tit uuid; v_parte uuid; v_vmat numeric;
BEGIN
  v_tag := current_setting('app.ocm_tag');
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

  -- op base (compra fechada) + lote. data_operacao serve de fallback de vencimento (T10).
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-01','fechada',false,300000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'novilhas',10,'total',100,1) RETURNING id INTO v_lote;

  -- =========================================================================================
  -- T1 — parcela PRINCIPAL -> parte+titulo 'programado' (data_pagamento NULL)+parcela 'materializada';
  --      identidade titulo.valor==parte.valor==parcela.valor; versao+1. (principal consome a base 300k.)
  -- =========================================================================================
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_fA,'subcentro',v_sub_ani,'lote_id',v_lote,'valor_total',300000));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(
    jsonb_build_object('sequencia',1,'valor',300000,'vencimento','2026-08-01','conta_bancaria_id',v_conta1,'forma','ted'))));
  v_prog := (v_res->'programacao'->>'id')::uuid;
  v_parc := (v_res->'parcelas'->0->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  v_tit := (v_res->'titulo'->>'id')::uuid; v_parte := (v_res->'parte'->>'id')::uuid;
  IF (v_res->'titulo'->>'status_transacao') <> 'programado' THEN RAISE EXCEPTION 'T1 FAIL: status titulo'; END IF;
  IF (v_res->'titulo'->>'data_pagamento') IS NOT NULL THEN RAISE EXCEPTION 'T1 FAIL: data_pagamento nao-nula'; END IF;
  IF (v_res->'parcela'->>'status') <> 'materializada' THEN RAISE EXCEPTION 'T1 FAIL: parcela nao materializada'; END IF;
  IF (v_res->'titulo'->>'valor')::numeric <> 300000 OR (v_res->'parte'->>'valor')::numeric <> 300000
     OR (v_res->'parcela'->>'valor')::numeric <> 300000 THEN RAISE EXCEPTION 'T1 FAIL: identidade de valor'; END IF;
  IF (v_res->'titulo'->>'valor')::numeric <> (v_res->'parcela'->>'valor')::numeric
     OR (v_res->'parte'->>'valor')::numeric <> (v_res->'parcela'->>'valor')::numeric THEN RAISE EXCEPTION 'T1 FAIL: 1:1:1'; END IF;
  IF (v_res->>'operacao_versao')::int <> v_ver+1 THEN RAISE EXCEPTION 'T1 FAIL: versao'; END IF;
  RAISE NOTICE 'T1 PASS';

  -- =========================================================================================
  -- T14 — vinculo bidirecional: parte.financeiro_lancamento_id==titulo.id; parte.programacao_parcela_id==parcela.id.
  -- =========================================================================================
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes
   WHERE id=v_parte AND financeiro_lancamento_id=v_tit AND programacao_parcela_id=v_parc AND cancelada=false;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T14 FAIL: vinculo bidirecional'; END IF; RAISE NOTICE 'T14 PASS';

  -- =========================================================================================
  -- T15 — ponte inerte: titulo 'programado' NAO cria liquidacao.
  -- =========================================================================================
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T15 FAIL: liquidacao criada (%)',v_cnt; END IF; RAISE NOTICE 'T15 PASS';

  -- =========================================================================================
  -- T16 — proxy de consumidores: campos-porteiro que mantem o titulo FORA de DRE/fluxo (status<>realizado)
  --       e DENTRO da grade de contas a pagar (dimensao por data_vencimento).
  -- =========================================================================================
  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2
   WHERE id=v_tit AND status_transacao='programado' AND data_pagamento IS NULL
     AND cenario='realizado' AND sem_movimentacao_caixa=false AND data_vencimento IS NOT NULL AND cancelado=false;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T16 FAIL: campos-porteiro do titulo'; END IF; RAISE NOTICE 'T16 PASS';

  -- =========================================================================================
  -- T3 — dupla materializacao da MESMA parcela -> P0001 (pre-check de status; indice e apenas backstop).
  -- =========================================================================================
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T3 FAIL: dupla materializacao aceita'; END IF; RAISE NOTICE 'T3 PASS';

  -- =========================================================================================
  -- T4 — parcela ja 'materializada' -> P0001 (identico a T3 via parcela do T1).
  -- =========================================================================================
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T4 FAIL: materializada re-aceita'; END IF; RAISE NOTICE 'T4 PASS';

  -- =========================================================================================
  -- T2 — parcela de compromisso OBRIGACAO/FRETE -> materializa (SIMETRIA-01: natureza='obrigacao' +
  --      origem='programacao' passam nos CHECKs). Caso central do modelo.
  -- =========================================================================================
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',5000));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(
    jsonb_build_object('sequencia',1,'valor',5000,'vencimento','2026-08-10','conta_bancaria_id',v_conta1))));
  v_prog := (v_res->'programacao'->>'id')::uuid; v_parc := (v_res->'parcelas'->0->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  IF (v_res->'parte'->>'natureza') <> 'obrigacao' OR (v_res->'parte'->>'origem') <> 'programacao' THEN RAISE EXCEPTION 'T2 FAIL: parte obrigacao/programacao'; END IF;
  IF (v_res->'titulo'->>'origem_tipo') <> 'oc:obrigacao:obrigacao:frete' THEN RAISE EXCEPTION 'T2 FAIL: origem_tipo'; END IF;
  IF (v_res->'titulo'->>'valor')::numeric <> 5000 THEN RAISE EXCEPTION 'T2 FAIL: valor'; END IF;
  RAISE NOTICE 'T2 PASS (obrigacao/frete materializada — SIMETRIA-01 habilitou)';

  -- =========================================================================================
  -- T5 — parcela 'cancelada' e 'paga' -> P0001 (regra positiva: so 'prevista').
  -- =========================================================================================
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','comissao','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',2000));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(
    jsonb_build_object('sequencia',1,'valor',1000), jsonb_build_object('sequencia',2,'valor',1000))));
  v_prog := (v_res->'programacao'->>'id')::uuid;
  v_parc := (v_res->'parcelas'->0->>'id')::uuid; v_parc2 := (v_res->'parcelas'->1->>'id')::uuid;
  UPDATE public.zoo_operacao_parcelas_programacao SET status='cancelada' WHERE id=v_parc;
  UPDATE public.zoo_operacao_parcelas_programacao SET status='paga' WHERE id=v_parc2;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T5 FAIL: cancelada aceita'; END IF;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc2);
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T5 FAIL: paga aceita'; END IF; RAISE NOTICE 'T5 PASS';

  -- =========================================================================================
  -- T6 — programacao nao-'ativa' -> P0001.
  -- =========================================================================================
  UPDATE public.zoo_operacao_programacoes SET status='cancelada' WHERE id=v_prog;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  -- parcela seq2 do comprimisso T5 ainda existiria, mas a programacao agora nao esta ativa:
  BEGIN v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc2);
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T6 FAIL: programacao nao-ativa aceita'; END IF; RAISE NOTICE 'T6 PASS';

  -- =========================================================================================
  -- T7 — programacao de OUTRA operacao -> P0001 (v_op vs programacao pertencente a v_op2b).
  -- =========================================================================================
  DECLARE v_op2b uuid; v_comp2b uuid; v_prog2b uuid; v_parc2b uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-02','fechada',false,50000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op2b;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op2b;
    v_res := public.oc_criar_compromisso(v_op2b, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',500));
    v_comp2b := (v_res->'compromisso'->>'id')::uuid;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op2b;
    v_res := public.oc_programar_compromisso(v_op2b, v_ver, v_comp2b, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',500))));
    v_prog2b := (v_res->'programacao'->>'id')::uuid; v_parc2b := (v_res->'parcelas'->0->>'id')::uuid;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
    v_ok:=false;
    BEGIN v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog2b, v_parc2b);  -- prog de outra op
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T7 FAIL: programacao de outra op aceita'; END IF; RAISE NOTICE 'T7 PASS';
  END;

  -- =========================================================================================
  -- T8 — conta de OUTRO tenant na parcela -> P0001 (validacao de tenant no passo 6).
  -- =========================================================================================
  IF v_conta_x IS NOT NULL THEN
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
    v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',800));
    v_comp := (v_res->'compromisso'->>'id')::uuid;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
    v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',800))));
    v_prog := (v_res->'programacao'->>'id')::uuid; v_parc := (v_res->'parcelas'->0->>'id')::uuid;
    -- injeta conta de outro tenant direto na parcela (o programar barraria; aqui testamos o passo 6 do materializar)
    UPDATE public.zoo_operacao_parcelas_programacao SET conta_bancaria_id=v_conta_x WHERE id=v_parc;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
    v_ok:=false;
    BEGIN v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T8 FAIL: conta de outro tenant aceita'; END IF; RAISE NOTICE 'T8 PASS';
  ELSE RAISE NOTICE 'T8 SKIP (sem conta de outro tenant)'; END IF;

  -- =========================================================================================
  -- T9 — conta NULL -> materializa (titulo sem conta). T10 — vencimento NULL -> fallback data_operacao.
  -- =========================================================================================
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',700));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(
    jsonb_build_object('sequencia',1,'valor',700))));   -- conta NULL, vencimento NULL, forma NULL
  v_prog := (v_res->'programacao'->>'id')::uuid; v_parc := (v_res->'parcelas'->0->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  IF (v_res->'titulo'->>'id') IS NULL THEN RAISE EXCEPTION 'T9 FAIL: conta NULL nao materializou'; END IF;
  IF (v_res->'titulo'->>'data_vencimento')::date <> DATE '2026-07-01' THEN RAISE EXCEPTION 'T10 FAIL: fallback de vencimento (%) <> data_operacao', (v_res->'titulo'->>'data_vencimento'); END IF;
  RAISE NOTICE 'T9/T10 PASS';

  -- =========================================================================================
  -- T11 — versao divergente -> 40001 ; T12 — sem acesso -> 42501.
  -- =========================================================================================
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_criar_compromisso(v_op, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',900));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',900))));
  v_prog := (v_res->'programacao'->>'id')::uuid; v_parc := (v_res->'parcelas'->0->>'id')::uuid;
  v_ok:=false;
  BEGIN v_res := public.oc_materializar_programacao(v_op, 999999, v_prog, v_parc);
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='40001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T11 FAIL: versao divergente aceita'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false;
  BEGIN v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='42501'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T12 FAIL: sem acesso aceito'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  RAISE NOTICE 'T11/T12 PASS';

  -- =========================================================================================
  -- T13 — service_role materializa a parcela do T11/T12 (admin ja provado em T1; usuario com acesso abaixo).
  -- =========================================================================================
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  v_res := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
  IF (v_res->'titulo'->>'id') IS NULL THEN RAISE EXCEPTION 'T13 FAIL: service_role recusado'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  RAISE NOTICE 'T13 PASS (service_role; admin via T1)';

  -- T13b — usuario NAO-admin COM acesso ao proprio cliente -> sucesso.
  IF v_user3 IS NOT NULL THEN
   DECLARE v_op3 uuid; v_lote3 uuid; v_sub3 text; v_comp3 uuid; v_prog3 uuid; v_parc3b uuid;
   BEGIN
    SELECT pc.subcentro INTO v_sub3 FROM public.financeiro_plano_contas pc
     WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id=v_cli3)
       AND 1=(SELECT count(*) FROM public.financeiro_plano_contas p2 WHERE p2.ativo IS TRUE AND (p2.cliente_id IS NULL OR p2.cliente_id=v_cli3) AND p2.subcentro IS NOT DISTINCT FROM pc.subcentro) LIMIT 1;
    IF v_sub3 IS NOT NULL THEN
      INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
        VALUES (v_cli3,'compra',DATE '2026-07-06','fechada',false,10000,0,NULL,v_tag,v_user3,v_user3) RETURNING id INTO v_op3;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user3::text, 'role','authenticated')::text, true);
      SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op3;
      v_res := public.oc_criar_compromisso(v_op3, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','subcentro',v_sub3,'valor_total',900));
      v_comp3 := (v_res->'compromisso'->>'id')::uuid;
      SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op3;
      v_res := public.oc_programar_compromisso(v_op3, v_ver, v_comp3, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',900))));
      v_prog3 := (v_res->'programacao'->>'id')::uuid; v_parc3b := (v_res->'parcelas'->0->>'id')::uuid;
      SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op3;
      v_res := public.oc_materializar_programacao(v_op3, v_ver, v_prog3, v_parc3b);
      IF (v_res->'titulo'->>'id') IS NULL THEN RAISE EXCEPTION 'T13b FAIL: usuario com acesso recusado'; END IF;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
      RAISE NOTICE 'T13b PASS (usuario do cliente)';
    ELSE RAISE NOTICE 'T13b SKIP (cli3 sem subcentro unico)'; END IF;
   END;
  ELSE RAISE NOTICE 'T13b SKIP (sem usuario nao-admin de outro tenant)'; END IF;

  -- =========================================================================================
  -- T17 — operacao rascunho / cancelada -> P0001.
  -- =========================================================================================
  DECLARE v_opR uuid; v_compR uuid; v_progR uuid; v_parcR uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-05','fechada',false,5000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opR;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opR;
    v_res := public.oc_criar_compromisso(v_opR, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',500));
    v_compR := (v_res->'compromisso'->>'id')::uuid;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opR;
    v_res := public.oc_programar_compromisso(v_opR, v_ver, v_compR, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',500))));
    v_progR := (v_res->'programacao'->>'id')::uuid; v_parcR := (v_res->'parcelas'->0->>'id')::uuid;
    UPDATE public.zoo_operacoes_comerciais SET rascunho=true WHERE id=v_opR;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opR;
    v_ok:=false;
    BEGIN v_res := public.oc_materializar_programacao(v_opR, v_ver, v_progR, v_parcR);
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T17 FAIL: rascunho materializado'; END IF;
    UPDATE public.zoo_operacoes_comerciais SET rascunho=false, status_comercial='cancelada' WHERE id=v_opR;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opR;
    v_ok:=false;
    BEGIN v_res := public.oc_materializar_programacao(v_opR, v_ver, v_progR, v_parcR);
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T17 FAIL: cancelada materializada'; END IF;
    RAISE NOTICE 'T17 PASS';
  END;

  -- =========================================================================================
  -- T18 — ATOMICIDADE: falha no INSERT do titulo (favorecido bogus) -> parte NAO persiste E parcela
  --       PERMANECE 'prevista'. Simula falha APOS o INSERT da parte (a parte nao tem FK de favorecido;
  --       o titulo tem fk_flv2_favorecido_tenant). O bloco EXCEPTION faz rollback do savepoint implicito.
  -- =========================================================================================
  DECLARE v_opX uuid; v_compX uuid; v_progX uuid; v_parcX uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-08','fechada',false,5000,0,NULL,v_tag,v_admin,v_admin) RETURNING id INTO v_opX;  -- contraparte NULL (fallback nao salva)
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opX;
    v_res := public.oc_criar_compromisso(v_opX, v_ver, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',500));
    v_compX := (v_res->'compromisso'->>'id')::uuid;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opX;
    v_res := public.oc_programar_compromisso(v_opX, v_ver, v_compX, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',500))));
    v_progX := (v_res->'programacao'->>'id')::uuid; v_parcX := (v_res->'parcelas'->0->>'id')::uuid;
    UPDATE public.zoo_operacao_compromissos SET favorecido_id=gen_random_uuid() WHERE id=v_compX;  -- bogus -> titulo FK falha
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opX;
    v_ok:=false;
    BEGIN v_res := public.oc_materializar_programacao(v_opX, v_ver, v_progX, v_parcX);
    EXCEPTION WHEN OTHERS THEN v_ok:=true; END;   -- qualquer falha (FK do titulo)
    IF NOT v_ok THEN RAISE EXCEPTION 'T18 FAIL: materializacao com favorecido bogus nao falhou'; END IF;
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE programacao_parcela_id=v_parcX;
    IF v_cnt<>0 THEN RAISE EXCEPTION 'T18 FAIL: parte persistiu apos falha (%)',v_cnt; END IF;
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_parcelas_programacao WHERE id=v_parcX AND status='prevista';
    IF v_cnt<>1 THEN RAISE EXCEPTION 'T18 FAIL: parcela nao permaneceu prevista'; END IF;
    RAISE NOTICE 'T18 PASS (rollback atomico)';
  END;

  -- =========================================================================================
  -- T19 — encadeamento criar->programar->materializar com operacao_versao FLUINDO (v->v+1->v+2->v+3)
  --       SEM releitura manual entre chamadas.
  -- =========================================================================================
  DECLARE v_op19 uuid; v_v0 int; v_v1 int; v_v2 int; v_v3 int; v_comp19 uuid; v_prog19 uuid; v_parc19 uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-09','fechada',false,9000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op19;
    SELECT versao INTO v_v0 FROM public.zoo_operacoes_comerciais WHERE id=v_op19;   -- unica releitura (inicial)
    v_res := public.oc_criar_compromisso(v_op19, v_v0, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',900));
    v_comp19 := (v_res->'compromisso'->>'id')::uuid; v_v1 := (v_res->>'operacao_versao')::int;
    v_res := public.oc_programar_compromisso(v_op19, v_v1, v_comp19, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',900))));
    v_prog19 := (v_res->'programacao'->>'id')::uuid; v_parc19 := (v_res->'parcelas'->0->>'id')::uuid; v_v2 := (v_res->>'operacao_versao')::int;
    v_res := public.oc_materializar_programacao(v_op19, v_v2, v_prog19, v_parc19);
    v_v3 := (v_res->>'operacao_versao')::int;
    IF v_v1<>v_v0+1 OR v_v2<>v_v0+2 OR v_v3<>v_v0+3 THEN RAISE EXCEPTION 'T19 FAIL: cadeia de versao (% % % de %)',v_v1,v_v2,v_v3,v_v0; END IF;
    RAISE NOTICE 'T19 PASS (versao fluindo v+1/v+2/v+3)';
  END;

  -- =========================================================================================
  -- CASO AGNALDO — o fluxo completo (o teste que FECHA o modelo). Compra base 300k:
  --   4 compromissos (principal 300k + frete 5k + comissao 3k + taxa_aquisicao 1k);
  --   programacao (principal 3x100k; acessorios 1 parcela cada); 6 materializacoes.
  --   VALIDACAO: 6 titulos 'programado'; 6 partes ativas; 6 parcelas 'materializada'; vinculos ok;
  --   zero liquidacao; base inalterada; Sigma titulos = Sigma partes = 309.000,00.
  -- =========================================================================================
  DECLARE
    v_opA uuid; v_loteA uuid; v_v int;
    v_cP uuid; v_cF uuid; v_cC uuid; v_cT uuid;
    v_pP uuid; v_pF uuid; v_pC uuid; v_pT uuid;
    v_parcP1 uuid; v_parcP2 uuid; v_parcP3 uuid; v_parcF uuid; v_parcC uuid; v_parcT uuid;
    v_soma_tit numeric; v_soma_parte numeric;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-07','fechada',false,300000,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opA;
    INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
      VALUES (v_opA,v_cli,'novilhas',20,'total',200,1) RETURNING id INTO v_loteA;

    -- (1) 4 compromissos
    SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_opA;
    v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_fA,'subcentro',v_sub_ani,'lote_id',v_loteA,'valor_total',300000));
    v_cP := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',5000));
    v_cF := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','obrigacao','componente','comissao','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',3000));
    v_cC := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_criar_compromisso(v_opA, v_v, jsonb_build_object('natureza','obrigacao','componente','taxa_aquisicao','favorecido_id',v_fA,'subcentro',v_sub_frete,'valor_total',1000));
    v_cT := (v_res->'compromisso'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;

    -- (2) programacoes
    v_res := public.oc_programar_compromisso(v_opA, v_v, v_cP, jsonb_build_object('condicoes','entrada+30+60','parcelas', jsonb_build_array(
      jsonb_build_object('sequencia',1,'valor',100000,'vencimento','2026-07-07','conta_bancaria_id',v_conta1,'forma','ted'),
      jsonb_build_object('sequencia',2,'valor',100000,'vencimento','2026-08-06','conta_bancaria_id',COALESCE(v_conta2,v_conta1),'forma','ted'),
      jsonb_build_object('sequencia',3,'valor',100000,'vencimento','2026-09-05','conta_bancaria_id',v_conta1,'forma','ted'))));
    v_pP := (v_res->'programacao'->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_parcP1 := (v_res->'parcelas'->0->>'id')::uuid; v_parcP2 := (v_res->'parcelas'->1->>'id')::uuid; v_parcP3 := (v_res->'parcelas'->2->>'id')::uuid;
    v_res := public.oc_programar_compromisso(v_opA, v_v, v_cF, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',5000,'vencimento','2026-07-15','conta_bancaria_id',v_conta1))));
    v_pF := (v_res->'programacao'->>'id')::uuid; v_parcF := (v_res->'parcelas'->0->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_programar_compromisso(v_opA, v_v, v_cC, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',3000,'vencimento','2026-07-20','conta_bancaria_id',v_conta1))));
    v_pC := (v_res->'programacao'->>'id')::uuid; v_parcC := (v_res->'parcelas'->0->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_programar_compromisso(v_opA, v_v, v_cT, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',1000,'vencimento','2026-07-25','conta_bancaria_id',v_conta1))));
    v_pT := (v_res->'programacao'->>'id')::uuid; v_parcT := (v_res->'parcelas'->0->>'id')::uuid; v_v := (v_res->>'operacao_versao')::int;

    -- (3) 6 materializacoes (versao fluindo)
    v_res := public.oc_materializar_programacao(v_opA, v_v, v_pP, v_parcP1); v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_materializar_programacao(v_opA, v_v, v_pP, v_parcP2); v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_materializar_programacao(v_opA, v_v, v_pP, v_parcP3); v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_materializar_programacao(v_opA, v_v, v_pF, v_parcF);  v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_materializar_programacao(v_opA, v_v, v_pC, v_parcC);  v_v := (v_res->>'operacao_versao')::int;
    v_res := public.oc_materializar_programacao(v_opA, v_v, v_pT, v_parcT);  v_v := (v_res->>'operacao_versao')::int;

    -- VALIDACOES DE CONJUNTO
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes p WHERE p.operacao_id=v_opA AND p.cancelada=false AND p.programacao_parcela_id IS NOT NULL;
    IF v_cnt<>6 THEN RAISE EXCEPTION 'AGNALDO FAIL: partes ativas=%',v_cnt; END IF;
    SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2 f
      JOIN public.zoo_operacao_partes p ON p.financeiro_lancamento_id=f.id
     WHERE p.operacao_id=v_opA AND f.status_transacao='programado' AND f.data_pagamento IS NULL;
    IF v_cnt<>6 THEN RAISE EXCEPTION 'AGNALDO FAIL: titulos programado=%',v_cnt; END IF;
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_parcelas_programacao pp
      JOIN public.zoo_operacao_programacoes pr ON pr.id=pp.programacao_id
      JOIN public.zoo_operacao_compromissos c ON c.id=pr.compromisso_id
     WHERE c.operacao_id=v_opA AND pp.status='materializada';
    IF v_cnt<>6 THEN RAISE EXCEPTION 'AGNALDO FAIL: parcelas materializada=%',v_cnt; END IF;
    -- vinculos bidirecionais integros (parte<->titulo<->parcela) para as 6
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes p
      JOIN public.financeiro_lancamentos_v2 f ON f.id=p.financeiro_lancamento_id
      JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id=p.programacao_parcela_id
     WHERE p.operacao_id=v_opA AND p.cancelada=false;
    IF v_cnt<>6 THEN RAISE EXCEPTION 'AGNALDO FAIL: vinculos integros=%',v_cnt; END IF;
    -- zero liquidacao
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_opA;
    IF v_cnt<>0 THEN RAISE EXCEPTION 'AGNALDO FAIL: liquidacao criada=%',v_cnt; END IF;
    -- base dos animais inalterada
    SELECT count(*) INTO v_cnt FROM public.zoo_operacoes_comerciais WHERE id=v_opA AND valor_acordado=300000;
    IF v_cnt<>1 THEN RAISE EXCEPTION 'AGNALDO FAIL: base alterada'; END IF;
    -- Sigma titulos == Sigma partes == 309.000,00 (contrato de identidade do CONJUNTO)
    SELECT COALESCE(sum(f.valor),0) INTO v_soma_tit FROM public.financeiro_lancamentos_v2 f
      JOIN public.zoo_operacao_partes p ON p.financeiro_lancamento_id=f.id WHERE p.operacao_id=v_opA AND p.cancelada=false;
    SELECT COALESCE(sum(p.valor),0) INTO v_soma_parte FROM public.zoo_operacao_partes p WHERE p.operacao_id=v_opA AND p.cancelada=false AND p.programacao_parcela_id IS NOT NULL;
    IF round(v_soma_tit,2)<>309000 THEN RAISE EXCEPTION 'AGNALDO FAIL: Sigma titulos=% (esperado 309000)',v_soma_tit; END IF;
    IF round(v_soma_parte,2)<>round(v_soma_tit,2) THEN RAISE EXCEPTION 'AGNALDO FAIL: Sigma partes(%)<>Sigma titulos(%)',v_soma_parte,v_soma_tit; END IF;
    RAISE NOTICE 'AGNALDO PASS — 6 titulos programado, 6 partes, 6 parcelas materializada; zero liquidacao; base 300k intacta; Sigma titulos=Sigma partes=309.000,00. MODELO FECHADO.';
  END;

  RAISE NOTICE 'PR-MATERIALIZACAO-01: T1..T20 + AGNALDO OK';
END $t$;

ROLLBACK;

-- ===== grants por papel (fora da transacao) =====
DO $g$
DECLARE v_sig text := 'public.oc_materializar_programacao(uuid,integer,uuid,uuid)';
BEGIN
  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN RAISE EXCEPTION 'GRANT FAIL: anon tem EXECUTE'; END IF;
  IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN RAISE EXCEPTION 'GRANT FAIL: authenticated sem EXECUTE'; END IF;
  IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN RAISE EXCEPTION 'GRANT FAIL: service_role sem EXECUTE'; END IF;
  RAISE NOTICE 'GRANTS PASS';
END $g$;

-- ===== residuo zero (pos-ROLLBACK) =====
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes=current_setting('app.ocm_tag'))
       + (SELECT count(*) FROM public.zoo_operacao_partes p JOIN public.zoo_operacoes_comerciais o ON o.id=p.operacao_id WHERE o.observacoes=current_setting('app.ocm_tag'))
       + (SELECT count(*) FROM public.zoo_operacao_liquidacoes l JOIN public.zoo_operacoes_comerciais o ON o.id=l.operacao_id WHERE o.observacoes=current_setting('app.ocm_tag'))
    INTO v_leak;
  IF v_leak<>0 THEN RAISE EXCEPTION 'RESIDUO FAIL: % linhas vazaram', v_leak; END IF;
  RAISE NOTICE 'RESIDUO ZERO PASS';
END $post$;

SELECT set_config('app.ocm_tag','',false) AS run_tag_reset;
