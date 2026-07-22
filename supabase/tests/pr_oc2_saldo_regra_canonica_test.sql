-- PR-OC2-SALDO — regra canônica de saldo (fonte única: _oc_estado_liquidacao + _oc_base_saldo_operacao).
--   BEGIN...ROLLBACK + sentinela de resíduo (tag de sessão sobrevive ao rollback). NADA persiste.
--   Requer aplicada a migration 20260722120000_pr_oc2_saldo_regra_canonica.sql (homolog FASE runtime).
--   Bloco A: classificador puro (tolerância R$ 0,01, D1). Bloco B: precedência de base (D2) —
--     final(valor_total) só com valor final CONFIRMADO (fechada + não-rascunho + principal incluído);
--     programada/rascunho com principal NÃO é final (cai no fallback acordado>estimado>indefinida).
--   Bloco C: integração views/RPC (estorno, multi-liquidação, consistência, tenant).
--   Bloco D: preservação de segurança (security_invoker, grants) + resíduo zero.
SELECT set_config('app.oc2saldo_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO A — classificador canônico puro (sem fixture): tolerância e contrato de estado.
-- ═══════════════════════════════════════════════════════════════════════════════
DO $a$
DECLARE v_e text;
BEGIN
  -- Caso 1: base indefinida (NULL) → 'base_indefinida' (independe do liquidado)
  IF public._oc_estado_liquidacao(NULL, 0)   <> 'base_indefinida' THEN RAISE EXCEPTION 'A1 FAIL (liq=0)'; END IF;
  IF public._oc_estado_liquidacao(NULL, 500) <> 'base_indefinida' THEN RAISE EXCEPTION 'A1 FAIL (liq>0)'; END IF;
  -- Caso 5: base definida, nenhuma liquidação → 'nao_iniciada'
  IF public._oc_estado_liquidacao(1000, 0)   <> 'nao_iniciada'    THEN RAISE EXCEPTION 'A5 FAIL'; END IF;
  -- Caso 6: liquidação parcial → 'parcial'
  IF public._oc_estado_liquidacao(1000, 400) <> 'parcial'         THEN RAISE EXCEPTION 'A6 FAIL'; END IF;
  -- Caso 7: saldo +0,02 (liquidado 999.98) → 'parcial'
  IF public._oc_estado_liquidacao(1000, 999.98) <> 'parcial'      THEN RAISE EXCEPTION 'A7 FAIL'; END IF;
  -- Caso 8: saldo +0,01 (liquidado 999.99) → 'liquidada'
  IF public._oc_estado_liquidacao(1000, 999.99) <> 'liquidada'    THEN RAISE EXCEPTION 'A8 FAIL'; END IF;
  -- Caso 9: saldo 0 (liquidado 1000) → 'liquidada'
  IF public._oc_estado_liquidacao(1000, 1000)   <> 'liquidada'    THEN RAISE EXCEPTION 'A9 FAIL'; END IF;
  -- Caso 10: saldo -0,01 (liquidado 1000.01) → 'liquidada'
  IF public._oc_estado_liquidacao(1000, 1000.01) <> 'liquidada'   THEN RAISE EXCEPTION 'A10 FAIL'; END IF;
  -- Caso 11: saldo -0,02 (liquidado 1000.02) → 'excedente'
  IF public._oc_estado_liquidacao(1000, 1000.02) <> 'excedente'   THEN RAISE EXCEPTION 'A11 FAIL'; END IF;
  -- Fronteiras extras: liquidado NULL tratado como 0; base 0 trivialmente liquidada
  IF public._oc_estado_liquidacao(1000, NULL) <> 'nao_iniciada'   THEN RAISE EXCEPTION 'A-extra FAIL (liq NULL)'; END IF;
  IF public._oc_estado_liquidacao(0, 0)       <> 'liquidada'      THEN RAISE EXCEPTION 'A-extra FAIL (base 0)'; END IF;
  RAISE NOTICE 'BLOCO A PASS (classificador + tolerância 0,01)';
END $a$;

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCOS B e C — precedência de base e integração (fixture sintética, tenant real admin).
-- ═══════════════════════════════════════════════════════════════════════════════
DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text;
  v_opE uuid; v_opAE uuid; v_opFAE uuid; v_opN uuid; v_opRascP uuid; v_opProgP uuid; v_opRascN uuid;
  v_opT uuid; v_titT uuid; v_liq1 uuid; v_res jsonb;
  v_base numeric; v_orig text; v_est text; v_saldo numeric;
  v_est_tit text; v_saldo_tit numeric; v_est_op text; v_saldo_op numeric; v_cnt int;
BEGIN
  v_tag := current_setting('app.oc2saldo_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  -- ── Caso 2: base estimada (só valor_estimado) ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_estimado, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-08-01','programada',true,700,v_tag,v_admin,v_admin) RETURNING id INTO v_opE;
  SELECT base, base_origem INTO v_base, v_orig FROM public._oc_base_saldo_operacao(v_opE);
  IF v_base<>700 OR v_orig<>'estimado' THEN RAISE EXCEPTION 'B2 FAIL base=% orig=%',v_base,v_orig; END IF;

  -- ── Caso 3: acordado prevalece sobre estimado ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_acordado, valor_estimado, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-08-01','programada',true,900,700,v_tag,v_admin,v_admin) RETURNING id INTO v_opAE;
  SELECT base, base_origem INTO v_base, v_orig FROM public._oc_base_saldo_operacao(v_opAE);
  IF v_base<>900 OR v_orig<>'acordado' THEN RAISE EXCEPTION 'B3 FAIL base=% orig=%',v_base,v_orig; END IF;

  -- ── Caso 4: VALOR FINAL CONFIRMADO (fechada + NÃO rascunho + principal incluído) usa valor_total ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, valor_acordado, valor_estimado, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-08-01','fechada',false,1200,900,700,v_tag,v_admin,v_admin) RETURNING id INTO v_opFAE;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, incluso_no_total)
    VALUES (v_cli,v_opFAE,'principal','principal',1200,true);
  SELECT base, base_origem INTO v_base, v_orig FROM public._oc_base_saldo_operacao(v_opFAE);
  IF v_base<>1200 OR v_orig<>'final' THEN RAISE EXCEPTION 'B4 FAIL base=% orig=%',v_base,v_orig; END IF;

  -- ── Caso 4b: RASCUNHO com principal materializado NÃO é final → fallback acordado ──
  --   (rascunho=true; principal incluído 1200 presente; acordado 900, estimado 700)
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, valor_acordado, valor_estimado, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-08-01','fechada',true,1200,900,700,v_tag,v_admin,v_admin) RETURNING id INTO v_opRascP;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, incluso_no_total)
    VALUES (v_cli,v_opRascP,'principal','principal',1200,true);
  SELECT base, base_origem INTO v_base, v_orig FROM public._oc_base_saldo_operacao(v_opRascP);
  IF v_base<>900 OR v_orig<>'acordado' THEN RAISE EXCEPTION 'B4b FAIL (rascunho c/ principal) base=% orig=%',v_base,v_orig; END IF;

  -- ── Caso 4c: PROGRAMADA (não rascunho) com principal materializado NÃO é final → fallback acordado ──
  --   (status programada; rascunho=false; principal incluído 1200; acordado 900, estimado 700)
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, valor_acordado, valor_estimado, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-08-01','programada',false,1200,900,700,v_tag,v_admin,v_admin) RETURNING id INTO v_opProgP;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, incluso_no_total)
    VALUES (v_cli,v_opProgP,'principal','principal',1200,true);
  SELECT base, base_origem INTO v_base, v_orig FROM public._oc_base_saldo_operacao(v_opProgP);
  IF v_base<>900 OR v_orig<>'acordado' THEN RAISE EXCEPTION 'B4c FAIL (programada c/ principal) base=% orig=%',v_base,v_orig; END IF;

  -- ── Caso 4d: programada com principal e SEM acordado/estimado → indefinida (não cai em final) ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-08-01','programada',true,1200,v_tag,v_admin,v_admin) RETURNING id INTO v_opRascN;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, incluso_no_total)
    VALUES (v_cli,v_opRascN,'principal','principal',1200,true);
  SELECT base, base_origem INTO v_base, v_orig FROM public._oc_base_saldo_operacao(v_opRascN);
  IF v_base IS NOT NULL OR v_orig<>'indefinida' THEN RAISE EXCEPTION 'B4d FAIL (programada s/ acordado) base=% orig=%',v_base,v_orig; END IF;

  -- ── Caso 1 (integração): sem base alguma → indefinida (base NULL) ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-08-01','programada',true,v_tag,v_admin,v_admin) RETURNING id INTO v_opN;
  SELECT base, base_origem INTO v_base, v_orig FROM public._oc_base_saldo_operacao(v_opN);
  IF v_base IS NOT NULL OR v_orig<>'indefinida' THEN RAISE EXCEPTION 'B1 FAIL base=% orig=%',v_base,v_orig; END IF;
  -- e a view de operação reflete base_indefinida com saldo NULL
  SELECT estado_liquidacao, saldo_operacao INTO v_est_op, v_saldo_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_opN;
  IF v_est_op<>'base_indefinida' OR v_saldo_op IS NOT NULL THEN RAISE EXCEPTION 'B1 FAIL view estado=% saldo=%',v_est_op,v_saldo_op; END IF;
  -- e a RPC também
  v_res := public.oc_derivar_status(v_opN, v_cli);
  IF (v_res->'liquidacao'->>'status_liquidacao')<>'base_indefinida'
     OR (v_res->'liquidacao'->'saldo') IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'B1 FAIL rpc=%', v_res->'liquidacao'; END IF;
  RAISE NOTICE 'BLOCO B PASS (precedência + valor final confirmado: só fechada/não-rascunho/principal usa valor_total)';

  -- ══════════════ BLOCO C — integração de saldo por título/operação/RPC ══════════════
  -- Título de 1000 vinculado a operação com composição final 1000.
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'venda',DATE '2026-08-01','fechada',false,1000,v_tag,v_admin,v_admin) RETURNING id INTO v_opT;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, data_pagamento, cancelado, descricao)
    VALUES (v_cli,1000,'venda',DATE '2026-09-01',false,v_tag) RETURNING id INTO v_titT;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, incluso_no_total, financeiro_lancamento_id)
    VALUES (v_cli,v_opT,'principal','principal',1000,true,v_titT);

  -- Caso 5 (view): sem liquidação → nao_liquidado / nao_liquidada
  SELECT estado, saldo_titulo INTO v_est_tit, v_saldo_tit FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_opT AND titulo_id=v_titT;
  IF v_est_tit<>'nao_liquidado' OR v_saldo_tit<>1000 THEN RAISE EXCEPTION 'C5 FAIL tit estado=% saldo=%',v_est_tit,v_saldo_tit; END IF;
  SELECT estado_liquidacao, saldo_operacao INTO v_est_op, v_saldo_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_opT;
  IF v_est_op<>'nao_liquidada' OR v_saldo_op<>1000 THEN RAISE EXCEPTION 'C5 FAIL op estado=% saldo=%',v_est_op,v_saldo_op; END IF;

  -- Caso 13: mais de uma liquidação válida (300 + 200 = 500) → parcial, saldo 500
  v_res := public.oc_registrar_liquidacao(v_opT, v_cli, jsonb_build_object('data','2026-08-02','natureza','recebimento','forma','pix','valor',300,'descricao',v_tag,'financeiro_lancamento_id',v_titT::text));
  v_liq1 := (v_res->>'liquidacao_id')::uuid;
  v_res := public.oc_registrar_liquidacao(v_opT, v_cli, jsonb_build_object('data','2026-08-03','natureza','recebimento','forma','pix','valor',200,'descricao',v_tag,'financeiro_lancamento_id',v_titT::text));
  SELECT estado, saldo_titulo INTO v_est_tit, v_saldo_tit FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_opT AND titulo_id=v_titT;
  IF v_est_tit<>'parcial' OR v_saldo_tit<>500 THEN RAISE EXCEPTION 'C13 FAIL estado=% saldo=%',v_est_tit,v_saldo_tit; END IF;

  -- Caso 14: consistência título × operação × RPC (todos parcial/500)
  SELECT estado_liquidacao, saldo_operacao INTO v_est_op, v_saldo_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_opT;
  v_res := public.oc_derivar_status(v_opT, v_cli);
  IF v_est_op<>'parcial' OR v_saldo_op<>500 THEN RAISE EXCEPTION 'C14 FAIL op estado=% saldo=%',v_est_op,v_saldo_op; END IF;
  IF (v_res->'liquidacao'->>'status_liquidacao')<>'parcial'
     OR (v_res->'liquidacao'->>'saldo')::numeric<>500
     OR (v_res->'liquidacao'->>'base_origem')<>'final' THEN
    RAISE EXCEPTION 'C14 FAIL rpc=%', v_res->'liquidacao'; END IF;

  -- Caso 12: estorno de uma liquidação (300) → sai das somas; saldo volta a 800, parcial
  v_res := public.oc_estornar_liquidacao(v_liq1, v_cli, 'teste estorno '||v_tag);
  SELECT estado, saldo_titulo INTO v_est_tit, v_saldo_tit FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_opT AND titulo_id=v_titT;
  IF v_est_tit<>'parcial' OR v_saldo_tit<>800 THEN RAISE EXCEPTION 'C12 FAIL estado=% saldo=%',v_est_tit,v_saldo_tit; END IF;
  v_res := public.oc_derivar_status(v_opT, v_cli);
  IF (v_res->'liquidacao'->>'total_liquidado')::numeric<>200 THEN RAISE EXCEPTION 'C12 FAIL rpc total=%', v_res->'liquidacao'->>'total_liquidado'; END IF;

  -- Caso 8 na VIEW (tolerância 0,01): total já válido = 200 (após estorno).
  -- Liquidar +799.99 → total 999.99, saldo +0.01 (dentro da tolerância) → quitado.
  v_res := public.oc_registrar_liquidacao(v_opT, v_cli, jsonb_build_object('data','2026-08-04','natureza','recebimento','forma','pix','valor',799.99,'descricao',v_tag,'financeiro_lancamento_id',v_titT::text));
  SELECT estado, saldo_titulo INTO v_est_tit, v_saldo_tit FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_opT AND titulo_id=v_titT;
  IF v_est_tit<>'quitado' THEN RAISE EXCEPTION 'C8 FAIL view tolerância estado=% saldo=%',v_est_tit,v_saldo_tit; END IF;

  -- Caso 15: isolamento de tenant — JWT de sub sem vínculo não enxerga a operação (view security_invoker)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  SELECT count(*) INTO v_cnt FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_opT;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'C15 FAIL título visível a não-membro (%)',v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_opT;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'C15 FAIL operação visível a não-membro (%)',v_cnt; END IF;
  RAISE NOTICE 'BLOCO C PASS (integração título/operação/RPC + estorno + tolerância + tenant)';
END $t$;

ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO D — preservação de segurança (catálogo) + resíduo zero pós-rollback.
-- ═══════════════════════════════════════════════════════════════════════════════
DO $d$
DECLARE v_leak int; v_si text; v_g int;
BEGIN
  -- Caso 16: security_invoker=true preservado nas duas views
  SELECT string_agg(c.relname||'='||COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name='security_invoker'),'default'),';' ORDER BY c.relname)
    INTO v_si FROM pg_class c WHERE c.relname IN ('vw_oc_titulos_liquidacao','vw_oc_operacao_liquidacao');
  IF v_si <> 'vw_oc_operacao_liquidacao=true;vw_oc_titulos_liquidacao=true' THEN
    RAISE EXCEPTION 'D16 FAIL security_invoker=%',v_si; END IF;

  -- Caso 17: grants (via catálogo/aclexplode — autoritativo) —
  --   SELECT a authenticated nas 2 views; zero SELECT a anon/PUBLIC; EXECUTE a authenticated nos 3 objetos.
  SELECT count(*) INTO v_g
    FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
   WHERE c.relname IN ('vw_oc_titulos_liquidacao','vw_oc_operacao_liquidacao')
     AND a.privilege_type='SELECT' AND r.rolname='authenticated';
  IF v_g<>2 THEN RAISE EXCEPTION 'D17 FAIL SELECT authenticated views=% (esperado 2)',v_g; END IF;
  SELECT count(*) INTO v_g
    FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
   WHERE c.relname IN ('vw_oc_titulos_liquidacao','vw_oc_operacao_liquidacao')
     AND a.privilege_type='SELECT' AND (a.grantee=0 OR r.rolname='anon');
  IF v_g<>0 THEN RAISE EXCEPTION 'D17 FAIL SELECT anon/PUBLIC presente=%',v_g; END IF;
  SELECT count(*) INTO v_g
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
   WHERE p.proname IN ('_oc_estado_liquidacao','_oc_base_saldo_operacao','oc_derivar_status')
     AND a.privilege_type='EXECUTE' AND r.rolname='authenticated';
  IF v_g<>3 THEN RAISE EXCEPTION 'D17 FAIL EXECUTE authenticated helpers/rpc=% (esperado 3)',v_g; END IF;

  -- Caso 18: resíduo zero (tag sobrevive ao rollback; nada persistiu)
  SELECT
    (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.oc2saldo_tag'))
  + (SELECT count(*) FROM public.zoo_operacao_liquidacoes WHERE descricao = current_setting('app.oc2saldo_tag'))
  + (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE descricao = current_setting('app.oc2saldo_tag'))
    INTO v_leak;
  IF v_leak <> 0 THEN RAISE EXCEPTION 'D18 FAIL: % linhas vazaram (resíduo não-zero)', v_leak; END IF;
  RAISE NOTICE 'BLOCO D PASS (security_invoker + grants + resíduo zero)';
  RAISE NOTICE 'PR-OC2-SALDO: A..D OK';
END $d$;

SELECT set_config('app.oc2saldo_tag', '', false) AS run_tag_reset;
