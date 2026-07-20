-- PR-OC-LIQ-02 — saldo por título/operação, estados derivados, estorno e gap de vínculo.
--   BEGIN...ROLLBACK + sentinela de resíduo (tag de sessão sobrevive ao rollback).
--   Requer aplicadas: LIQ-02-1 (views), LIQ-02-2 (RPC) e MODEL-02B (colunas/RPC de abate, p/ T10).
--   Scaffold do título é simulado por INSERT direto (parte sincronizada) — o vínculo E3
--   (partes.financeiro_lancamento_id) normalmente nasce de oc_sincronizar.
SELECT set_config('app.ocliq02_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text;
  v_op1 uuid; v_op2 uuid; v_op3 uuid; v_op4 uuid; v_op5 uuid; v_op6 uuid; v_op7 uuid; v_op8 uuid;
  v_titA uuid; v_titBc uuid; v_titCc uuid; v_titD uuid; v_titE uuid; v_titF uuid; v_titG uuid;
  v_liq_exc uuid; v_res jsonb;
  v_estado text; v_saldo numeric; v_estado_op text; v_saldo_op numeric; v_cnt int;
  v_op uuid; r public.zoo_operacoes_comerciais; v_nf text;
BEGIN
  v_tag := current_setting('app.ocliq02_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  -- ── T1: operação com 1 título, sem liquidação → 'nao_liquidado', saldo = valor ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'venda',DATE '2026-08-01','fechada',false,1000,v_tag,v_admin,v_admin) RETURNING id INTO v_op1;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, data_pagamento, cancelado, descricao)
    VALUES (v_cli,1000,'venda',DATE '2026-09-01',false,v_tag) RETURNING id INTO v_titA;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, financeiro_lancamento_id)
    VALUES (v_cli,v_op1,'principal','principal',1000,v_titA);
  SELECT estado, saldo_titulo INTO v_estado, v_saldo FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_op1 AND titulo_id=v_titA;
  IF v_estado<>'nao_liquidado' OR v_saldo<>1000 THEN RAISE EXCEPTION 'T1 FAIL estado=% saldo=%',v_estado,v_saldo; END IF;
  SELECT estado_liquidacao, saldo_operacao INTO v_estado_op, v_saldo_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_op1;
  IF v_estado_op<>'nao_liquidada' OR v_saldo_op<>1000 THEN RAISE EXCEPTION 'T1 FAIL op estado=% saldo=%',v_estado_op,v_saldo_op; END IF;
  RAISE NOTICE 'T1 PASS';

  -- ── T2: liquidação vinculada parcial 400 → 'parcial', saldo 600 ──
  v_res := public.oc_registrar_liquidacao(v_op1, v_cli, jsonb_build_object('data','2026-08-02','natureza','recebimento','forma','pix','valor',400,'descricao',v_tag,'financeiro_lancamento_id',v_titA::text));
  SELECT estado, saldo_titulo INTO v_estado, v_saldo FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_op1 AND titulo_id=v_titA;
  IF v_estado<>'parcial' OR v_saldo<>600 THEN RAISE EXCEPTION 'T2 FAIL estado=% saldo=%',v_estado,v_saldo; END IF;
  RAISE NOTICE 'T2 PASS';

  -- ── T3: segunda liquidação 600 completando → 'quitado', saldo 0 ──
  v_res := public.oc_registrar_liquidacao(v_op1, v_cli, jsonb_build_object('data','2026-08-03','natureza','recebimento','forma','pix','valor',600,'descricao',v_tag,'financeiro_lancamento_id',v_titA::text));
  SELECT estado, saldo_titulo INTO v_estado, v_saldo FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_op1 AND titulo_id=v_titA;
  IF v_estado<>'quitado' OR v_saldo<>0 THEN RAISE EXCEPTION 'T3 FAIL estado=% saldo=%',v_estado,v_saldo; END IF;
  RAISE NOTICE 'T3 PASS';

  -- ── T4: terceira 100 excedendo → 'excedente_divergente'; registro ACEITO (não bloqueado) ──
  v_res := public.oc_registrar_liquidacao(v_op1, v_cli, jsonb_build_object('data','2026-08-04','natureza','recebimento','forma','pix','valor',100,'descricao',v_tag,'financeiro_lancamento_id',v_titA::text));
  v_liq_exc := (v_res->>'liquidacao_id')::uuid;
  SELECT estado, saldo_titulo INTO v_estado, v_saldo FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_op1 AND titulo_id=v_titA;
  IF v_estado<>'excedente_divergente' OR v_saldo<>-100 THEN RAISE EXCEPTION 'T4 FAIL estado=% saldo=%',v_estado,v_saldo; END IF;
  RAISE NOTICE 'T4 PASS';

  -- ── T4b: título cancelado COM liquidação válida → aparece 'excedente_divergente';
  --         título cancelado SEM liquidação → ausente da view ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'venda',DATE '2026-08-01','fechada',false,500,v_tag,v_admin,v_admin) RETURNING id INTO v_op2;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, data_pagamento, cancelado, descricao)
    VALUES (v_cli,500,'venda',DATE '2026-09-02',true,v_tag) RETURNING id INTO v_titBc;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, data_pagamento, cancelado, descricao)
    VALUES (v_cli,300,'venda',DATE '2026-09-03',true,v_tag) RETURNING id INTO v_titCc;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, financeiro_lancamento_id)
    VALUES (v_cli,v_op2,'principal','principal',1,2,500,v_titBc);
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, financeiro_lancamento_id)
    VALUES (v_cli,v_op2,'principal','principal',2,2,300,v_titCc);
  v_res := public.oc_registrar_liquidacao(v_op2, v_cli, jsonb_build_object('data','2026-08-05','natureza','recebimento','forma','pix','valor',200,'descricao',v_tag,'financeiro_lancamento_id',v_titBc::text));
  SELECT estado INTO v_estado FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_op2 AND titulo_id=v_titBc;
  IF v_estado<>'excedente_divergente' THEN RAISE EXCEPTION 'T4b FAIL Bc estado=%',v_estado; END IF;
  SELECT count(*) INTO v_cnt FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_op2 AND titulo_id=v_titCc;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T4b FAIL Cc presente (%)',v_cnt; END IF;
  RAISE NOTICE 'T4b PASS';

  -- ── T5: estorno da excedente → volta a 'quitado'; estornada fora das somas ──
  v_res := public.oc_estornar_liquidacao(v_liq_exc, v_cli, 'teste estorno excedente');
  SELECT estado, saldo_titulo INTO v_estado, v_saldo FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_op1 AND titulo_id=v_titA;
  IF v_estado<>'quitado' OR v_saldo<>0 THEN RAISE EXCEPTION 'T5 FAIL estado=% saldo=%',v_estado,v_saldo; END IF;
  RAISE NOTICE 'T5 PASS';

  -- ── T6: liquidação SEM vínculo → não afeta saldo_titulo; afeta saldo_operacao ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'venda',DATE '2026-08-01','fechada',false,1000,v_tag,v_admin,v_admin) RETURNING id INTO v_op3;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, data_pagamento, cancelado, descricao)
    VALUES (v_cli,1000,'venda',DATE '2026-09-04',false,v_tag) RETURNING id INTO v_titD;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, financeiro_lancamento_id)
    VALUES (v_cli,v_op3,'principal','principal',1000,v_titD);
  v_res := public.oc_registrar_liquidacao(v_op3, v_cli, jsonb_build_object('data','2026-08-06','natureza','recebimento','forma','pix','valor',300,'descricao',v_tag));
  SELECT estado, saldo_titulo INTO v_estado, v_saldo FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_op3 AND titulo_id=v_titD;
  IF v_estado<>'nao_liquidado' OR v_saldo<>1000 THEN RAISE EXCEPTION 'T6 FAIL titulo estado=% saldo=%',v_estado,v_saldo; END IF;
  SELECT estado_liquidacao, saldo_operacao INTO v_estado_op, v_saldo_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_op3;
  IF v_estado_op<>'parcial' OR v_saldo_op<>700 THEN RAISE EXCEPTION 'T6 FAIL op estado=% saldo=%',v_estado_op,v_saldo_op; END IF;
  RAISE NOTICE 'T6 PASS';

  -- ── T7: permuta vinculada → reduz saldo do título; nenhuma leitura de caixa ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'venda',DATE '2026-08-01','fechada',false,1000,v_tag,v_admin,v_admin) RETURNING id INTO v_op4;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, data_pagamento, cancelado, descricao)
    VALUES (v_cli,1000,'venda',DATE '2026-09-05',false,v_tag) RETURNING id INTO v_titE;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, financeiro_lancamento_id)
    VALUES (v_cli,v_op4,'principal','principal',1000,v_titE);
  v_res := public.oc_registrar_liquidacao(v_op4, v_cli, jsonb_build_object('data','2026-08-07','natureza','recebimento','forma','permuta','valor',400,'descricao',v_tag,'financeiro_lancamento_id',v_titE::text,'permuta_tipo_bem','boi','permuta_valor_atribuido',400));
  SELECT estado, saldo_titulo INTO v_estado, v_saldo FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_op4 AND titulo_id=v_titE;
  IF v_estado<>'parcial' OR v_saldo<>600 THEN RAISE EXCEPTION 'T7 FAIL estado=% saldo=%',v_estado,v_saldo; END IF;
  RAISE NOTICE 'T7 PASS';

  -- ── T8: vínculo a título de OUTRA operação (mesmo tenant) → P0001 controlado ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'venda',DATE '2026-08-01','fechada',false,1000,v_tag,v_admin,v_admin) RETURNING id INTO v_op5;
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'venda',DATE '2026-08-01','fechada',false,1000,v_tag,v_admin,v_admin) RETURNING id INTO v_op6;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, data_pagamento, cancelado, descricao)
    VALUES (v_cli,1000,'venda',DATE '2026-09-06',false,v_tag) RETURNING id INTO v_titF;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, data_pagamento, cancelado, descricao)
    VALUES (v_cli,1000,'venda',DATE '2026-09-07',false,v_tag) RETURNING id INTO v_titG;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, financeiro_lancamento_id)
    VALUES (v_cli,v_op5,'principal','principal',1000,v_titF);
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, financeiro_lancamento_id)
    VALUES (v_cli,v_op6,'principal','principal',1000,v_titG);
  BEGIN
    v_res := public.oc_registrar_liquidacao(v_op5, v_cli, jsonb_build_object('data','2026-08-08','natureza','recebimento','forma','pix','valor',100,'descricao',v_tag,'financeiro_lancamento_id',v_titG::text));
    RAISE EXCEPTION 'T8 FAIL vinculo cross-operacao aceito';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'T8 SQLSTATE %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T8 PASS';

  -- ── T9: estados agregados da operação nos 4 cenários ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'venda',DATE '2026-08-01','fechada',false,100,v_tag,v_admin,v_admin) RETURNING id INTO v_op7;
  SELECT estado_liquidacao INTO v_estado_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_op7;
  IF v_estado_op<>'nao_liquidada' THEN RAISE EXCEPTION 'T9 FAIL nao_liquidada=%',v_estado_op; END IF;
  SELECT estado_liquidacao INTO v_estado_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_op3;
  IF v_estado_op<>'parcial' THEN RAISE EXCEPTION 'T9 FAIL parcial=%',v_estado_op; END IF;
  SELECT estado_liquidacao INTO v_estado_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_op1;
  IF v_estado_op<>'quitada' THEN RAISE EXCEPTION 'T9 FAIL quitada=%',v_estado_op; END IF;
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'venda',DATE '2026-08-01','fechada',false,100,v_tag,v_admin,v_admin) RETURNING id INTO v_op8;
  v_res := public.oc_registrar_liquidacao(v_op8, v_cli, jsonb_build_object('data','2026-08-09','natureza','recebimento','forma','pix','valor',150,'descricao',v_tag));
  SELECT estado_liquidacao INTO v_estado_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_op8;
  IF v_estado_op<>'excedente' THEN RAISE EXCEPTION 'T9 FAIL excedente=%',v_estado_op; END IF;
  RAISE NOTICE 'T9 PASS';

  -- ── T10: regressões — abate estruturado (7 campos) e numero_documento seguem persistindo ──
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
    'tipo_operacao','abate','data_operacao','2026-08-01','observacoes',v_tag,
    'data_embarque','2026-08-01','data_abate','2026-08-05','modalidade_comercial','escala',
    'tipo_peso','morto','rendimento_carcaca',55.5,'peso_carcaca_kg_total',280,'peso_carcaca_fonte','kg_total'));
  v_op := (v_res->>'operacao_id')::uuid;
  SELECT * INTO r FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  IF r.data_embarque<>DATE '2026-08-01' OR r.tipo_peso<>'morto' OR r.rendimento_carcaca<>55.5
     OR r.peso_carcaca_kg_total<>280 OR r.peso_carcaca_fonte<>'kg_total' THEN RAISE EXCEPTION 'T10 FAIL abate'; END IF;
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object('tipo_operacao','compra','data_operacao','2026-08-01','observacoes',v_tag,'numero_documento','NF-LIQ02'));
  SELECT numero_documento INTO v_nf FROM public.zoo_operacoes_comerciais WHERE id=(v_res->>'operacao_id')::uuid;
  IF v_nf<>'NF-LIQ02' THEN RAISE EXCEPTION 'T10 FAIL numero_documento=%',v_nf; END IF;
  RAISE NOTICE 'T10 PASS';

  RAISE NOTICE 'PR-OC-LIQ-02: T1..T10 OK';
END $t$;

ROLLBACK;

-- ── T11: resíduo zero (tag de sessão sobrevive ao rollback) ──
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT
    (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.ocliq02_tag'))
  + (SELECT count(*) FROM public.zoo_operacao_liquidacoes WHERE descricao = current_setting('app.ocliq02_tag'))
  + (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE descricao = current_setting('app.ocliq02_tag'))
    INTO v_leak;
  IF v_leak <> 0 THEN RAISE EXCEPTION 'T11 FAIL: % linhas vazaram (residuo nao-zero)', v_leak; END IF;
  RAISE NOTICE 'T11 PASS: residuo zero (rollback aplicado, nada persistiu)';
END $post$;

SELECT set_config('app.ocliq02_tag', '', false) AS run_tag_reset;
