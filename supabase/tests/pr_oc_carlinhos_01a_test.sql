-- PR-OC-CARLINHOS-01A — testes sinteticos da RPC oc_adotar_titulo_financeiro (WRITER Financeiro->OC).
--   Valida: vinculo de titulo EXISTENTE -> INSERT de parte -> ponte 01A auto-liquida; nunca altera o
--   Financeiro; idempotencia; bloqueios (cancelado/tenant/sentido/valor0/transferencia/vinculo soberano/
--   OC cancelada/rascunho/parte cancelada); divergencia de favorecido = confirmacao com motivo (nao bloqueio);
--   AUTORIZACAO por acesso ao cliente (nao admin-only); UNIQUE global preservado; evento auditavel.
--   Matriz A1..A35 + AUTH-1..AUTH-7 + FAV-1..FAV-7. BEGIN...ROLLBACK + sentinela de residuo.
--   Requer aplicada: 20260802140000 (e 20260802130000). Rodar SOMENTE no PROTO (binbcdfbisgscrifztia).
--   Fixtures sinteticas; NAO usa IDs reais do caso. NAO toca: fb902b30, d2890ac0, 80716db4, 759c798b, 4828cfd3, f1e31753.
SELECT set_config('app.occarl_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_forn uuid[]; v_fA uuid; v_fB uuid;
  v_op uuid; v_op_v uuid; v_op_a uuid; v_op_r uuid; v_op_c uuid; v_op2 uuid;
  v_t uuid; v_res jsonb; v_res2 jsonb; v_parte public.zoo_operacao_partes%ROWTYPE; v_cnt int; v_val numeric; v_ok boolean;
  v_snap_before jsonb; v_snap_after jsonb; v_liq uuid; v_parte_id uuid; v_cliB uuid;
  v_user3 uuid; v_cli3 uuid; v_f3 uuid;                 -- fixture AUTH-3/AUTH-6: membro NAO-admin com acesso ao proprio cliente
  v_opF uuid; v_opN uuid;                               -- ops p/ FAV (contraparte preenchida / nula)
  v_fin uuid;                                           -- financiamento real (A20a: financiamento_id tem FK -> financiamentos)
BEGIN
  v_tag := current_setting('app.occarl_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  -- JWT admin (sub + role=authenticated) para is_admin_agroinblue(auth.uid())
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  -- NEUTRALIZA request.jwt.claim.sub: auth.uid() = COALESCE(claim.sub, claims->>'sub'); com '' o coalesce
  -- cai SEMPRE em request.jwt.claims->>'sub', respeitando cada troca de JWT (admin/cliente/service/anon).
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT array_agg(id) INTO v_forn FROM (SELECT id FROM public.financeiro_fornecedores WHERE cliente_id=v_cli LIMIT 2) s;
  v_fA := v_forn[1]; v_fB := COALESCE(v_forn[2], v_forn[1]);
  SELECT cliente_id INTO v_cliB FROM public.cliente_membros WHERE cliente_id IS DISTINCT FROM v_cli LIMIT 1;  -- 2o cliente p/ tenant
  -- membro NAO-admin (em nenhum cliente) com fornecedor no proprio cliente: fixture da autorizacao por tenant
  SELECT cm.user_id, cm.cliente_id INTO v_user3, v_cli3
  FROM public.cliente_membros cm
  WHERE cm.ativo=true AND cm.perfil <> 'admin_agroinblue' AND cm.cliente_id IS DISTINCT FROM v_cli
    AND NOT EXISTS (SELECT 1 FROM public.cliente_membros a WHERE a.user_id=cm.user_id AND a.perfil='admin_agroinblue' AND a.ativo)
    AND EXISTS (SELECT 1 FROM public.financeiro_fornecedores f WHERE f.cliente_id=cm.cliente_id)
  ORDER BY cm.user_id LIMIT 1;
  IF v_user3 IS NOT NULL THEN
    SELECT id INTO v_f3 FROM public.financeiro_fornecedores WHERE cliente_id=v_cli3 LIMIT 1;
  END IF;
  SELECT id INTO v_fin FROM public.financiamentos LIMIT 1;  -- A20a exige financiamento_id valido (FK)

  -- OC de compra base (fechada). contraparte = v_fA.
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-01','fechada',false,20000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op;

  -- ===== A1: titulo PROGRAMADO -> cria parte, NAO cria liquidacao =====
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,5000,'-1','2-Saídas','programado',false,v_fA,v_tag) RETURNING id INTO v_t;
  v_res := public.oc_adotar_titulo_financeiro(v_op, v_t, 'principal','principal',1,3, NULL, 'adocao teste A1');
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id=v_t AND cancelada=false;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'A1 FAIL: parte nao criada'; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_t AND estornado=false;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'A1/A19 FAIL: programado gerou liquidacao'; END IF;
  RAISE NOTICE 'A1/A19 PASS';

  -- ===== A2: titulo REALIZADO -> cria parte + liquidacao automatica (A18: origem/valor/forma) =====
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao,data_pagamento)
    VALUES (v_cli,5000,'-1','2-Saídas','realizado',false,v_fA,v_tag,DATE '2026-06-20') RETURNING id INTO v_t;
  SELECT to_jsonb(f) INTO v_snap_before FROM public.financeiro_lancamentos_v2 f WHERE f.id=v_t;   -- A17 snapshot ANTES
  v_res := public.oc_adotar_titulo_financeiro(v_op, v_t, 'principal','principal',2,3, NULL, 'adocao teste A2');
  SELECT count(*), max(valor) INTO v_cnt, v_val
    FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_t AND estornado=false;
  IF v_cnt<>1 OR v_val<>5000 THEN RAISE EXCEPTION 'A2/A18 FAIL: liquidacao cnt=% val=%',v_cnt,v_val; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_t AND estornado=false AND origem='financeiro' AND forma='outro' AND data=DATE '2026-06-20';
  IF v_cnt<>1 THEN RAISE EXCEPTION 'A18 FAIL: origem/forma/data da liquidacao incorretos'; END IF;
  SELECT to_jsonb(f) INTO v_snap_after FROM public.financeiro_lancamentos_v2 f WHERE f.id=v_t;      -- A17 titulo inalterado
  IF v_snap_before <> v_snap_after THEN RAISE EXCEPTION 'A17 FAIL: titulo alterado pela adocao'; END IF;
  RAISE NOTICE 'A2/A17/A18 PASS';

  -- ===== A16: campos da parte + AUTH-4 (admin -> executor_role='authenticated_admin', usuario_id=v_admin) =====
  SELECT * INTO v_parte FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id=v_t;
  IF v_parte.valor<>5000 OR v_parte.incluso_no_total<>false OR v_parte.origem<>'manual'
     OR v_parte.favorecido_id IS DISTINCT FROM v_fA OR v_parte.chave_idempotencia<>('adocao_titulo:'||v_t::text) THEN
    RAISE EXCEPTION 'A16 FAIL: campos da parte incorretos'; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_eventos
    WHERE acao='adotar_titulo_financeiro' AND (detalhes->>'financeiro_lancamento_id')=v_t::text
      AND (detalhes->>'executor_role')='authenticated_admin' AND (detalhes->>'executor_uid')=v_admin::text AND usuario_id=v_admin
      AND (detalhes->>'confirmacao_divergencia_favorecido')='false';
  IF v_cnt<>1 THEN RAISE EXCEPTION 'A16/AUTH-4 FAIL: evento admin sem executor_role/usuario corretos'; END IF;
  RAISE NOTICE 'A16/AUTH-4 PASS';

  -- ===== A7/A10: idempotencia (mesma OC, atributos compativeis) =====
  v_res2 := public.oc_adotar_titulo_financeiro(v_op, v_t, 'principal','principal',2,3, 'outra descricao', 'reexec A7');
  IF (v_res2->>'idempotente')<>'true' OR (v_res2->>'parte_id')<>v_parte.id::text THEN RAISE EXCEPTION 'A7 FAIL: nao idempotente'; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id=v_t;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'A7 FAIL: duplicou parte (%)',v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_eventos WHERE operacao_id=v_op AND acao='adotar_titulo_financeiro' AND (detalhes->>'financeiro_lancamento_id')=v_t::text;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'A7 FAIL: evento duplicado (%)',v_cnt; END IF;
  RAISE NOTICE 'A7/A10 PASS';

  -- ===== A8: mesma OC, atributos divergentes -> P0001 =====
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t, 'principal','principal',3,3, NULL,'A8');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A8 FAIL'; END IF; RAISE NOTICE 'A8 PASS';

  -- ===== A9: titulo vinculado a OUTRA operacao -> P0001 =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-02','fechada',false,5000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op2;
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op2, v_t, 'principal','principal',1,1, NULL,'A9');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A9 FAIL'; END IF; RAISE NOTICE 'A9 PASS';

  -- ===== A4: titulo CANCELADO -> P0001, nenhuma parte =====
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,3000,'-1','2-Saídas','realizado',true,v_fA,v_tag) RETURNING id INTO v_t;
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t,'principal','principal',1,1,NULL,'A4');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A4 FAIL'; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id=v_t;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'A4 FAIL: parte criada p/ cancelado'; END IF;
  RAISE NOTICE 'A4 PASS';

  -- ===== A5: titulo inexistente -> P0002 =====
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, gen_random_uuid(),'principal','principal',1,1,NULL,'A5');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0002'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A5 FAIL'; END IF; RAISE NOTICE 'A5 PASS';

  -- ===== A11: compra com SAIDA -> aceita ; A12: compra com ENTRADA -> P0001 =====
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,1000,'1','1-Entradas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t;
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t,'principal','principal',1,1,NULL,'A12');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A12 FAIL: compra aceitou entrada'; END IF;
  RAISE NOTICE 'A11/A12 PASS (A11 coberto por A1/A2 saida)';

  -- ===== A13: VENDA com entrada -> aceita ; A14: ABATE com entrada -> aceita =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'venda',DATE '2026-07-03','fechada',false,1000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op_v;
  v_res:=public.oc_adotar_titulo_financeiro(v_op_v, v_t,'principal','principal',1,1,NULL,'A13');
  IF (v_res->>'ok')<>'true' THEN RAISE EXCEPTION 'A13 FAIL'; END IF;
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'abate',DATE '2026-07-03','fechada',false,1000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op_a;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,900,'1','1-Entradas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t;
  v_res:=public.oc_adotar_titulo_financeiro(v_op_a, v_t,'principal','principal',1,1,NULL,'A14');
  IF (v_res->>'ok')<>'true' THEN RAISE EXCEPTION 'A14 FAIL'; END IF;
  RAISE NOTICE 'A13/A14 PASS';

  -- ===== A15: valor ZERO -> P0001 =====
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,0,'-1','2-Saídas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t;
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t,'principal','principal',1,1,NULL,'A15');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A15 FAIL'; END IF; RAISE NOTICE 'A15 PASS';

  -- ===== A20: vinculos soberanos incompativeis + transferencia economica -> P0001 (nenhuma parte) =====
  --   A20a financiamento_id ; A20b movimentacao_rebanho_id ; A20c transferencia_grupo_id ; A20d '3-' economico puro.
  --   (financiamento_id tem FK -> financiamentos; usa id real v_fin. movimentacao_rebanho_id/transferencia_grupo_id sem FK.)
  IF v_fin IS NOT NULL THEN
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao,financiamento_id)
      VALUES (v_cli,1500,'-1','2-Saídas','realizado',false,v_fA,v_tag,v_fin) RETURNING id INTO v_t;
    v_ok:=false;
    BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t,'principal','principal',1,1,NULL,'A20a fin');
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'A20a FAIL: titulo de financiamento adotado'; END IF;
  ELSE RAISE EXCEPTION 'A20a SKIP nao permitido (sem financiamento para fixture)'; END IF;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao,movimentacao_rebanho_id)
    VALUES (v_cli,1500,'-1','2-Saídas','realizado',false,v_fA,v_tag,gen_random_uuid()) RETURNING id INTO v_t;
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t,'principal','principal',1,1,NULL,'A20b reb');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A20b FAIL: titulo de rebanho adotado'; END IF;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao,transferencia_grupo_id)
    VALUES (v_cli,1500,'-1','2-Saídas','realizado',false,v_fA,v_tag,gen_random_uuid()) RETURNING id INTO v_t;
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t,'principal','principal',1,1,NULL,'A20c transf-grupo');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A20c FAIL: titulo de grupo de transferencia adotado'; END IF;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao,conta_destino_id)
    VALUES (v_cli,1500,'-1','3-Transferência','realizado',false,v_fA,v_tag,gen_random_uuid()) RETURNING id INTO v_t;   -- economico puro (sem grupo; conta_destino exigida por guard, sem FK)
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t,'principal','principal',1,1,NULL,'A20d transf-econ');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A20d FAIL: transferencia economica adotada'; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE descricao IN ('A20a fin','A20b reb','A20c transf-grupo','A20d transf-econ');
  IF v_cnt<>0 THEN RAISE EXCEPTION 'A20 FAIL: parte criada em bloqueio (%)',v_cnt; END IF;
  RAISE NOTICE 'A20a/A20b/A20c/A20d PASS';

  -- ===== A21: rollback se a PONTE falhar (titulo com liquidacao MANUAL ativa) =====
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,2000,'-1','2-Saídas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t;
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id,operacao_id,data,natureza,forma,valor,financeiro_lancamento_id,origem,descricao,created_by,updated_by)
    VALUES (v_cli,v_op,DATE '2026-06-20','pagamento','dinheiro',2000,v_t,'manual',v_tag,v_admin,v_admin);  -- manual ativa
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t,'principal','principal',1,1,NULL,'A21');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A21 FAIL: ponte nao bloqueou'; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id=v_t;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'A21 FAIL: parte persistiu apos falha da ponte (%)',v_cnt; END IF;
  RAISE NOTICE 'A21 PASS';

  -- ===== A24/A25: OC cancelada -> P0001 ; OC rascunho -> P0001 =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-04','cancelada',false,1000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op_c;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,1000,'-1','2-Saídas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t;
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op_c, v_t,'principal','principal',1,1,NULL,'A24oc-cancelada');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A24 FAIL (OC cancelada)'; END IF;
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-04','programada',true,1000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op_r;
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op_r, v_t,'principal','principal',1,1,NULL,'A25rascunho');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A25 FAIL (rascunho)'; END IF;
  RAISE NOTICE 'A24/A25 PASS';

  -- ===== A26/A27/A28: tres parcelas -> tres partes; soma; parte cancelada bloqueia revinculo =====
  DECLARE v_op3 uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-05','fechada',false,17062,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_op3;
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
      VALUES (v_cli,3525,'-1','2-Saídas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t1;
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
      VALUES (v_cli,1537,'-1','2-Saídas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t2;
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
      VALUES (v_cli,12000,'-1','2-Saídas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t3;
    PERFORM public.oc_adotar_titulo_financeiro(v_op3, v_t1,'principal','principal',1,3,NULL,'parc1');
    PERFORM public.oc_adotar_titulo_financeiro(v_op3, v_t2,'principal','principal',2,3,NULL,'parc2');
    PERFORM public.oc_adotar_titulo_financeiro(v_op3, v_t3,'principal','principal',3,3,NULL,'parc3');
    SELECT count(*), COALESCE(sum(valor),0) INTO v_cnt, v_val FROM public.zoo_operacao_partes WHERE operacao_id=v_op3 AND cancelada=false;
    IF v_cnt<>3 OR v_val<>17062 THEN RAISE EXCEPTION 'A26/A27 FAIL partes=% soma=%',v_cnt,v_val; END IF;
    SELECT COALESCE(sum(valor),0) INTO v_val FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_op3 AND origem='financeiro' AND estornado=false;
    IF v_val<>17062 THEN RAISE EXCEPTION 'A26 FAIL liquidado=%',v_val; END IF;
    SELECT id INTO v_parte_id FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id=v_t1;
    -- cancela SOMENTE a parte (titulo permanece realizado/ativo) para exercitar o ramo "parte cancelada" da
    -- idempotencia. oc_cancelar_obrigacao recusa titulo realizado/agendado/conciliado ("cancele pelo Financeiro");
    -- para programado ele tambem cancelaria o titulo, disparando o check "titulo cancelado" antes do ramo alvo.
    UPDATE public.zoo_operacao_partes SET cancelada=true, cancelada_em=now(), cancelada_por=v_admin, cancelada_motivo='teste A28', updated_at=now() WHERE id=v_parte_id;
    v_ok:=false;
    BEGIN PERFORM public.oc_adotar_titulo_financeiro(v_op3, v_t1,'principal','principal',1,3,NULL,'readocao A28');
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'A28 FAIL: readocao de titulo com parte cancelada permitida'; END IF;
  END;
  RAISE NOTICE 'A26/A27/A28 PASS';

  -- ===== A31: sequencia invalida ; A32: componente invalido =====
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,800,'-1','2-Saídas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t;
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t,'principal','principal',9,3,NULL,'A31 seq');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A31 FAIL'; END IF;
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t,'principal','inexistente_xyz',1,1,NULL,'A32 comp');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'A32 FAIL'; END IF;
  RAISE NOTICE 'A31/A32 PASS';

  -- ===== A33/A34: nenhuma movimentacao / nenhum lancamento financeiro novo pela RPC =====
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_movimentacoes m
    JOIN public.zoo_operacoes_comerciais o ON o.id=m.operacao_id WHERE o.observacoes=v_tag;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'A33 FAIL: movimentacao criada (%)',v_cnt; END IF;
  -- (A34 e coberto por A17 snapshot + ausencia de qualquer INSERT/UPDATE em financeiro pela RPC.)
  RAISE NOTICE 'A33/A34 PASS';

  -- ===== A35: caso sintetico Carlinhos (compra; contraparte Vendedor A; 3 titulos realizados a Terceiros B/C;
  --   todos com motivo de confirmacao de divergencia; 3 partes; 3 liquidacoes; soma correta; base=soma=quitada).
  --   NAO cobre permuta nem ajuste comercial de R$0,50 — apenas a infra monetaria do vinculo.
  DECLARE v_opk uuid; v_k1 uuid; v_k2 uuid; v_k3 uuid; v_estado text; v_fC uuid; v_evdiv int;
  BEGIN
    v_fC := COALESCE(v_forn[2], v_fB);  -- Terceiro C (>= diferente de v_fA quando ha 2 fornecedores)
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-07','fechada',false,17062,0,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opk;  -- contraparte Vendedor A
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
      VALUES (v_cli,3525,'-1','2-Saídas','realizado',false,v_fB,v_tag) RETURNING id INTO v_k1;   -- pago a Terceiro B
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
      VALUES (v_cli,1537,'-1','2-Saídas','realizado',false,v_fB,v_tag) RETURNING id INTO v_k2;   -- pago a Terceiro B
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
      VALUES (v_cli,12000,'-1','2-Saídas','realizado',false,v_fC,v_tag) RETURNING id INTO v_k3;  -- pago a Terceiro C
    -- favorecido != contraparte => motivo obrigatorio em cada vinculo
    PERFORM public.oc_adotar_titulo_financeiro(v_opk, v_k1,'principal','principal',1,3,NULL,'pagamento a terceiro por conta da compra');
    PERFORM public.oc_adotar_titulo_financeiro(v_opk, v_k2,'principal','principal',2,3,NULL,'pagamento a terceiro por conta da compra');
    PERFORM public.oc_adotar_titulo_financeiro(v_opk, v_k3,'principal','principal',3,3,NULL,'pagamento a terceiro por conta da compra');
    SELECT COALESCE(sum(valor),0) INTO v_val FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_opk AND estornado=false;
    IF v_val<>17062 THEN RAISE EXCEPTION 'A35 FAIL liquidado=%',v_val; END IF;
    SELECT estado_liquidacao INTO v_estado FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_opk;   -- base=valor_acordado=17062 -> quitada
    IF v_estado<>'quitada' THEN RAISE EXCEPTION 'A35 FAIL estado=%',v_estado; END IF;
    -- eventos: 3 vinculos com divergencia confirmada e motivo (se ha fornecedor distinto)
    IF v_fB IS DISTINCT FROM v_fA THEN
      SELECT count(*) INTO v_evdiv FROM public.zoo_operacao_eventos
        WHERE operacao_id=v_opk AND acao='adotar_titulo_financeiro'
          AND (detalhes->>'divergencia_favorecido')='true' AND (detalhes->>'confirmacao_divergencia_favorecido')='true'
          AND (detalhes->>'motivo') IS NOT NULL;
      IF v_evdiv<>3 THEN RAISE EXCEPTION 'A35 FAIL: eventos de divergencia=% (esperado 3)', v_evdiv; END IF;
    END IF;
  END;
  RAISE NOTICE 'A35 PASS';

  -- =====================================================================================
  -- FAV-1..FAV-7: divergencia de favorecido NAO bloqueia; exige confirmacao com motivo.
  -- =====================================================================================
  -- op com contraparte preenchida (v_fA) e op com contraparte NULA, reutilizadas nos FAV.
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-08','fechada',false,1000,v_fA,v_tag,v_admin,v_admin) RETURNING id INTO v_opF;
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-08','fechada',false,1000,NULL,v_tag,v_admin,v_admin) RETURNING id INTO v_opN;

  -- FAV-1: favorecido = contraparte, motivo NULL -> aceito, divergencia=false
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,500,'-1','2-Saídas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t;
  v_res:=public.oc_adotar_titulo_financeiro(v_opF, v_t,'principal','principal',1,1,NULL,NULL);
  IF (v_res->>'ok')<>'true' OR (v_res->>'divergencia_favorecido')<>'false' OR (v_res->>'confirmacao_divergencia_favorecido')<>'false' THEN
    RAISE EXCEPTION 'FAV-1 FAIL: favorecido igual exigiu motivo ou marcou divergencia'; END IF;
  RAISE NOTICE 'FAV-1 PASS';

  IF v_fB IS DISTINCT FROM v_fA THEN
    -- FAV-2: favorecido diferente, motivo NULL -> P0001
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
      VALUES (v_cli,510,'-1','2-Saídas','realizado',false,v_fB,v_tag) RETURNING id INTO v_t;
    v_ok:=false;
    BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_opF, v_t,'principal','principal',1,1,NULL,NULL);
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAV-2 FAIL: divergente sem motivo aceito'; END IF;
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id=v_t;
    IF v_cnt<>0 THEN RAISE EXCEPTION 'FAV-2 FAIL: parte criada'; END IF;
    -- FAV-3: favorecido diferente, motivo VAZIO -> P0001 (reusa o mesmo titulo)
    v_ok:=false;
    BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_opF, v_t,'principal','principal',1,1,NULL,'   ');
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'FAV-3 FAIL: motivo vazio aceito'; END IF;
    -- FAV-4: favorecido diferente, motivo preenchido -> aceito, divergencia+confirmacao=true, motivo no evento
    v_res:=public.oc_adotar_titulo_financeiro(v_opF, v_t,'principal','principal',1,1,NULL,'confirmo pagamento a terceiro');
    IF (v_res->>'ok')<>'true' OR (v_res->>'divergencia_favorecido')<>'true' OR (v_res->>'confirmacao_divergencia_favorecido')<>'true' THEN
      RAISE EXCEPTION 'FAV-4 FAIL: divergente com motivo nao confirmado'; END IF;
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_eventos WHERE operacao_id=v_opF AND acao='adotar_titulo_financeiro'
      AND (detalhes->>'divergencia_favorecido')='true' AND (detalhes->>'confirmacao_divergencia_favorecido')='true'
      AND (detalhes->>'motivo')='confirmo pagamento a terceiro'
      AND (detalhes->>'titulo_favorecido_id')=v_fB::text AND (detalhes->>'oc_contraparte_id')=v_fA::text;
    IF v_cnt<>1 THEN RAISE EXCEPTION 'FAV-4 FAIL: evento de divergencia incompleto'; END IF;
    RAISE NOTICE 'FAV-2/FAV-3/FAV-4 PASS';
  ELSE RAISE EXCEPTION 'FAV-2/3/4 CRITICO nao pode ficar em SKIP (fixture: cliente sem 2o fornecedor)'; END IF;

  -- FAV-5: favorecido NULL, contraparte preenchida -> divergencia, exige motivo (P0001 sem; aceito com)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,520,'-1','2-Saídas','realizado',false,NULL,v_tag) RETURNING id INTO v_t;
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_opF, v_t,'principal','principal',1,1,NULL,NULL);
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'FAV-5 FAIL: favorecido nulo x contraparte preenchida sem motivo aceito'; END IF;
  v_res:=public.oc_adotar_titulo_financeiro(v_opF, v_t,'principal','principal',1,1,NULL,'conta indicada pela contraparte');
  IF (v_res->>'divergencia_favorecido')<>'true' THEN RAISE EXCEPTION 'FAV-5 FAIL: divergencia nao marcada'; END IF;
  RAISE NOTICE 'FAV-5 PASS';

  -- FAV-6: favorecido preenchido, contraparte NULL -> divergencia, exige motivo (P0001 sem motivo)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,530,'-1','2-Saídas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t;
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_opN, v_t,'principal','principal',1,1,NULL,NULL);
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'FAV-6 FAIL: favorecido preenchido x contraparte nula sem motivo aceito'; END IF;
  RAISE NOTICE 'FAV-6 PASS';

  -- FAV-7: ambos NULL -> sem divergencia, motivo NULL aceito
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,540,'-1','2-Saídas','realizado',false,NULL,v_tag) RETURNING id INTO v_t;
  v_res:=public.oc_adotar_titulo_financeiro(v_opN, v_t,'principal','principal',2,2,NULL,NULL);
  IF (v_res->>'ok')<>'true' OR (v_res->>'divergencia_favorecido')<>'false' THEN
    RAISE EXCEPTION 'FAV-7 FAIL: ambos nulos marcou divergencia ou exigiu motivo'; END IF;
  RAISE NOTICE 'FAV-7 PASS';

  -- =====================================================================================
  -- AUTH-2..AUTH-7 (AUTH-1 grants: bloco estatico apos ROLLBACK).
  -- =====================================================================================

  -- AUTH-3: usuario NAO-admin COM acesso ao proprio cliente vincula titulo compativel -> sucesso.
  IF v_user3 IS NOT NULL AND v_f3 IS NOT NULL THEN
   DECLARE v_op3a uuid; v_t3a uuid;
   BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli3,'compra',DATE '2026-07-09','fechada',false,700,v_f3,v_tag,v_user3,v_user3) RETURNING id INTO v_op3a;
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
      VALUES (v_cli3,700,'-1','2-Saídas','realizado',false,v_f3,v_tag) RETURNING id INTO v_t3a;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user3::text, 'role','authenticated')::text, true);  -- usuario comum COM acesso
    v_res:=public.oc_adotar_titulo_financeiro(v_op3a, v_t3a,'principal','principal',1,1,NULL,NULL);
    IF (v_res->>'ok')<>'true' THEN RAISE EXCEPTION 'AUTH-3 FAIL: usuario com acesso ao cliente foi bloqueado'; END IF;
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_eventos
      WHERE acao='adotar_titulo_financeiro' AND (detalhes->>'financeiro_lancamento_id')=v_t3a::text
        AND (detalhes->>'executor_role')='authenticated_cliente' AND (detalhes->>'executor_uid')=v_user3::text AND usuario_id=v_user3;
    IF v_cnt<>1 THEN RAISE EXCEPTION 'AUTH-3 FAIL: executor_role/usuario incorretos'; END IF;
    -- AUTH-6: mesmo usuario (cliente A) tentando OP de outro cliente (v_cli) -> 42501, nenhuma escrita.
    v_ok:=false;
    BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, gen_random_uuid(),'principal','principal',1,1,NULL,'AUTH-6');
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='42501'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'AUTH-6 FAIL: usuario do cliente A operou OP do cliente B'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);  -- restaura admin
   END;
   RAISE NOTICE 'AUTH-3/AUTH-6 PASS';
  ELSE RAISE EXCEPTION 'AUTH-3/6 CRITICO nao pode ficar em SKIP (fixture: sem membro nao-admin com fornecedor)'; END IF;

  -- AUTH-2: authenticated SEM acesso a nenhum cliente -> 42501, nenhuma escrita.
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,700,'-1','2-Saídas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);  -- sub aleatorio, sem membership
  v_ok:=false;
  BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t,'principal','principal',1,1,NULL,'AUTH-2 comum');
  EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='42501'); END;
  IF NOT v_ok THEN RAISE EXCEPTION 'AUTH-2 FAIL: usuario sem acesso executou'; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id=v_t;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'AUTH-2 FAIL: parte criada por usuario sem acesso'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);  -- restaura admin
  RAISE NOTICE 'AUTH-2 PASS';

  -- AUTH-5: service_role SEM sub (auth.uid() NULL) -> permitido; evento executor_role='service_role', usuario_id NULL.
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,favorecido_id,descricao)
    VALUES (v_cli,600,'-1','2-Saídas','realizado',false,v_fA,v_tag) RETURNING id INTO v_t;
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);  -- sem sub
  v_res:=public.oc_adotar_titulo_financeiro(v_op, v_t,'principal','principal',5,5,NULL,'AUTH-5 service sem sub');
  IF (v_res->>'ok')<>'true' THEN RAISE EXCEPTION 'AUTH-5 FAIL: service_role bloqueado'; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_eventos
    WHERE acao='adotar_titulo_financeiro' AND (detalhes->>'financeiro_lancamento_id')=v_t::text
      AND (detalhes->>'executor_role')='service_role' AND (detalhes->>'executor_uid') IS NULL AND usuario_id IS NULL;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'AUTH-5 FAIL: evento service_role incorreto (uid/role)'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);  -- restaura admin
  RAISE NOTICE 'AUTH-5 PASS';

  -- AUTH-7: OP cliente A x TITULO cliente B, por admin E service_role -> P0001 tenant; nenhuma escrita.
  IF v_cliB IS NOT NULL THEN
   DECLARE v_tB uuid;
   BEGIN
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,sinal,tipo_operacao,status_transacao,cancelado,descricao)
      VALUES (v_cliB,1000,'-1','2-Saídas','realizado',false,v_tag) RETURNING id INTO v_tB;
    v_ok:=false;   -- (a) admin
    BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_tB,'principal','principal',1,1,NULL,'AUTH-7 admin cross-tenant');
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'AUTH-7 FAIL: cross-tenant aceito (admin)'; END IF;
    -- (b) service_role tambem NAO fura tenant
    PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
    v_ok:=false;
    BEGIN v_res:=public.oc_adotar_titulo_financeiro(v_op, v_tB,'principal','principal',1,1,NULL,'AUTH-7 service cross-tenant');
    EXCEPTION WHEN OTHERS THEN v_ok:=(SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'AUTH-7 FAIL: service_role furou tenant'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);  -- restaura admin
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id=v_tB;
    IF v_cnt<>0 THEN RAISE EXCEPTION 'AUTH-7 FAIL: parte cross-tenant criada'; END IF;
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tB;
    IF v_cnt<>0 THEN RAISE EXCEPTION 'AUTH-7 FAIL: liquidacao cross-tenant criada'; END IF;
   END;
   RAISE NOTICE 'AUTH-7 PASS';
  ELSE RAISE EXCEPTION 'AUTH-7 CRITICO nao pode ficar em SKIP (fixture: sem 2o cliente)'; END IF;

  RAISE NOTICE 'PR-OC-CARLINHOS-01A: A1..A35 + FAV-1..7 + AUTH-2..7 OK';
END $t$;

ROLLBACK;

-- ===== AUTH-1 (grants por papel): fora da transacao, checagem estatica de privilegios =====
DO $g$
DECLARE v_sig text := 'public.oc_adotar_titulo_financeiro(uuid,uuid,text,text,integer,integer,text,text)';
BEGIN
  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN RAISE EXCEPTION 'AUTH-1 FAIL: anon tem EXECUTE'; END IF;
  IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN RAISE EXCEPTION 'AUTH-1 FAIL: authenticated sem EXECUTE'; END IF;
  IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN RAISE EXCEPTION 'AUTH-1 FAIL: service_role sem EXECUTE'; END IF;
  RAISE NOTICE 'AUTH-1 PASS (anon nega; authenticated/service_role permitem; corpo autoriza por tenant/admin/service)';
END $g$;

-- Residuo zero (tag sobrevive ao rollback)
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes=current_setting('app.occarl_tag'))
       + (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE descricao=current_setting('app.occarl_tag'))
       + (SELECT count(*) FROM public.zoo_operacao_liquidacoes WHERE descricao=current_setting('app.occarl_tag'))
    INTO v_leak;
  IF v_leak<>0 THEN RAISE EXCEPTION 'RESIDUO FAIL: % linhas vazaram', v_leak; END IF;
  RAISE NOTICE 'RESIDUO ZERO PASS';
END $post$;

SELECT set_config('app.occarl_tag','',false) AS run_tag_reset;
