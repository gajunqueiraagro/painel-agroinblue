-- PR-OC-FIN-LIQ-01A — Ponte idempotente Financeiro -> Liquidacao da OC (T1..T26).
--   Valida: elo automatico via TRIGGERS (independente do React), idempotencia, estorno/reativacao,
--   coexistencia com permuta/manual, anti dupla-contagem (guard RPC + indices estruturais), OC cancelada,
--   rollback integral, e o cenario Carlinhos/Silvana. Sem pagamento parcial POR TITULO (titulo liquida
--   integral). BEGIN...ROLLBACK + sentinela de residuo. Requer aplicada: 20260802130000. Rodar SOMENTE
--   no PROTO (binbcdfbisgscrifztia). Fixtures isoladas (admin real de cliente_membros; nada de OC viva).
SELECT set_config('app.ocfinliq_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text;
  v_op uuid; v_op2 uuid; v_opc uuid; v_op_cs uuid;
  v_t1 uuid; v_tit uuid; v_titb uuid; v_titneg uuid; v_titadm uuid; v_titc uuid;
  v_parte uuid; v_res jsonb; v_id1 uuid; v_id2 uuid;
  v_cnt int; v_val numeric; v_estado text; v_saldo numeric; v_estado_op text; v_saldo_op numeric;
  v_cs1 uuid; v_cs2 uuid; v_cs3 uuid;
BEGIN
  v_tag := current_setting('app.ocfinliq_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  -- OC de compra (fechada, elegivel). natureza esperada da liquidacao = 'pagamento'.
  -- base = valor_total (regra viva _oc_base_saldo_operacao) = total das 2 parcelas (5000+3000).
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-01','fechada',false,8000,v_tag,v_admin,v_admin) RETURNING id INTO v_op;

  -- ── T1: lancamento SEM vinculo OC -> realizado nao cria liquidacao, sem excecao ──
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, cancelado, status_transacao, descricao)
    VALUES (v_cli,1234,'compra',false,'previsto',v_tag) RETURNING id INTO v_t1;
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='realizado' WHERE id=v_t1;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_t1;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T1 FAIL: lancamento sem vinculo criou % liquidacao(oes)', v_cnt; END IF;
  RAISE NOTICE 'T1 PASS';

  -- ── T2: titulo OC programado -> nenhuma liquidacao automatica ──
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, data_pagamento, cancelado, status_transacao, descricao)
    VALUES (v_cli,5000,'compra',DATE '2026-08-05',false,'programado',v_tag) RETURNING id INTO v_tit;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, financeiro_lancamento_id, origem)
    VALUES (v_cli,v_op,'principal','principal',5000,v_tit,'documento') RETURNING id INTO v_parte;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND estornado=false;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T2 FAIL: titulo programado gerou liquidacao'; END IF;
  RAISE NOTICE 'T2 PASS';

  -- ── T3: titulo OC realizado -> exatamente 1 liquidacao automatica (origem financeiro, valor integral, nao permuta) ──
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='realizado', data_pagamento=DATE '2026-08-06' WHERE id=v_tit;
  SELECT count(*), max(valor) INTO v_cnt, v_val
    FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND estornado=false;
  IF v_cnt<>1 OR v_val<>5000 THEN RAISE EXCEPTION 'T3 FAIL: cnt=% valor=%', v_cnt,v_val; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes
    WHERE financeiro_lancamento_id=v_tit AND estornado=false AND origem='financeiro' AND forma<>'permuta';
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T3 FAIL: origem/forma incorretos (cnt=%)', v_cnt; END IF;
  SELECT id INTO v_id1 FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND origem='financeiro';
  -- view: titulo quitado, saldo 0
  SELECT estado, saldo_titulo INTO v_estado, v_saldo FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_op AND titulo_id=v_tit;
  IF v_estado<>'quitado' OR v_saldo<>0 THEN RAISE EXCEPTION 'T3 FAIL view estado=% saldo=%',v_estado,v_saldo; END IF;
  RAISE NOTICE 'T3 PASS';

  -- ── T4: idempotencia (re-salvar realizado + chamar a ponte) -> 1 linha, mesmo id ──
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='realizado' WHERE id=v_tit;
  PERFORM public.oc_sincronizar_liquidacao_de_financeiro(v_tit);
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND origem='financeiro';
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T4 FAIL: % linhas auto (esperado 1)', v_cnt; END IF;
  IF (SELECT id FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND origem='financeiro')<>v_id1 THEN
    RAISE EXCEPTION 'T4 FAIL: id da linha automatica mudou'; END IF;
  RAISE NOTICE 'T4 PASS';

  -- ── T5: realizado -> conciliado: mesma liquidacao, valor intacto ──
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='conciliado' WHERE id=v_tit;
  SELECT count(*), max(valor) INTO v_cnt, v_val FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND estornado=false;
  IF v_cnt<>1 OR v_val<>5000 THEN RAISE EXCEPTION 'T5 FAIL cnt=% val=%',v_cnt,v_val; END IF;
  RAISE NOTICE 'T5 PASS';

  -- ── T6: conciliado -> realizado: 1 liquidacao ativa ──
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='realizado' WHERE id=v_tit;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND estornado=false;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T6 FAIL cnt=%',v_cnt; END IF;
  RAISE NOTICE 'T6 PASS';

  -- ── T7: realizado -> programado: estorno logico (nao apaga), view volta a nao_liquidado ──
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='programado' WHERE id=v_tit;
  SELECT count(*) FILTER (WHERE estornado=false), count(*) FILTER (WHERE estornado)
    INTO v_cnt, v_val FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND origem='financeiro';
  IF v_cnt<>0 OR v_val<>1 THEN RAISE EXCEPTION 'T7 FAIL ativas=% estornadas=%',v_cnt,v_val; END IF;
  SELECT estado, saldo_titulo INTO v_estado, v_saldo FROM public.vw_oc_titulos_liquidacao WHERE operacao_id=v_op AND titulo_id=v_tit;
  IF v_estado<>'nao_liquidado' OR v_saldo<>5000 THEN RAISE EXCEPTION 'T7 FAIL view estado=% saldo=%',v_estado,v_saldo; END IF;
  RAISE NOTICE 'T7 PASS';

  -- ── T8: reativacao -> mesma linha (mesmo id), ativa de novo, sem 2a linha ──
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='realizado' WHERE id=v_tit;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND origem='financeiro';
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T8 FAIL total auto=% (esperado 1)',v_cnt; END IF;
  IF (SELECT id FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND origem='financeiro' AND estornado=false)<>v_id1 THEN
    RAISE EXCEPTION 'T8 FAIL: reativacao criou linha diferente'; END IF;
  RAISE NOTICE 'T8 PASS';

  -- ── T9: cancelamento do titulo -> estorno automatico ──
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true WHERE id=v_tit;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND estornado=false;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T9 FAIL: liquidacao ativa apos cancelamento (%)',v_cnt; END IF;
  RAISE NOTICE 'T9 PASS';

  -- ── T10: descancelamento (mantendo realizado) -> reativa ──
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=false WHERE id=v_tit;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND estornado=false;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T10 FAIL: nao reativou (%)',v_cnt; END IF;
  RAISE NOTICE 'T10 PASS';

  -- ── T11: alteracao administrativa (descricao) -> trigger nao dispara; liquidacao intacta ──
  UPDATE public.financeiro_lancamentos_v2 SET descricao=v_tag||' edit', observacao='x' WHERE id=v_tit;
  SELECT count(*), max(valor) INTO v_cnt,v_val FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND estornado=false;
  IF v_cnt<>1 OR v_val<>5000 THEN RAISE EXCEPTION 'T11 FAIL cnt=% val=%',v_cnt,v_val; END IF;
  RAISE NOTICE 'T11 PASS';

  -- ── T12: alteracao de valor do titulo realizado -> mesma linha atualizada; abs() (titulo negativo) ──
  UPDATE public.financeiro_lancamentos_v2 SET valor=-5500 WHERE id=v_tit;  -- financeiro.valor e assinado
  SELECT count(*), max(valor) INTO v_cnt,v_val FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit AND estornado=false;
  IF v_cnt<>1 OR v_val<>5500 THEN RAISE EXCEPTION 'T12 FAIL cnt=% val=% (esperado 1 e abs=5500)',v_cnt,v_val; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET valor=5000 WHERE id=v_tit;  -- restaura p/ demais asserts
  RAISE NOTICE 'T12 PASS';

  -- ── T13/T14/T15: duas parcelas (=duas obrigacoes) na MESMA operacao ──
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, cancelado, status_transacao, descricao)
    VALUES (v_cli,3000,'compra',false,'programado',v_tag) RETURNING id INTO v_titb;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, financeiro_lancamento_id, origem)
    VALUES (v_cli,v_op,'principal','principal',2,2,3000,v_titb,'documento');
  -- T13: uma paga (v_tit ja realizado 5000; v_titb programado) -> op parcial
  SELECT estado_liquidacao, saldo_operacao INTO v_estado_op, v_saldo_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_op;
  IF v_estado_op<>'parcial' THEN RAISE EXCEPTION 'T13 FAIL op estado=% (esperado parcial)',v_estado_op; END IF;
  RAISE NOTICE 'T13 PASS';
  -- T14: paga a segunda -> 2 liquidacoes automaticas; op quitada
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='realizado' WHERE id=v_titb;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_op AND origem='financeiro' AND estornado=false;
  IF v_cnt<>2 THEN RAISE EXCEPTION 'T14 FAIL: % liquidacoes auto (esperado 2)',v_cnt; END IF;
  SELECT estado_liquidacao INTO v_estado_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_op;
  IF v_estado_op<>'quitada' THEN RAISE EXCEPTION 'T14 FAIL op estado=% (esperado quitada)',v_estado_op; END IF;
  RAISE NOTICE 'T14 PASS';
  -- T15: soma consolidada correta (5000+3000=8000)
  SELECT COALESCE(sum(valor),0) INTO v_val FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_op AND estornado=false;
  IF v_val<>8000 THEN RAISE EXCEPTION 'T15 FAIL soma=% (esperado 8000)',v_val; END IF;
  RAISE NOTICE 'T15 PASS';

  -- ── T16: permuta manual + monetaria automatica coexistem (op nova) ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-02','fechada',false,5000,v_tag,v_admin,v_admin) RETURNING id INTO v_op2;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, cancelado, status_transacao, descricao)
    VALUES (v_cli,2000,'compra',false,'realizado',v_tag) RETURNING id INTO v_titc;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, financeiro_lancamento_id, origem)
    VALUES (v_cli,v_op2,'principal','principal',2000,v_titc,'documento');
  -- permuta manual (sem titulo financeiro): INSERT direto origem='manual'
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id, operacao_id, data, natureza, forma, valor, permuta_tipo_bem, permuta_valor_atribuido, origem, descricao, created_by, updated_by)
    VALUES (v_cli,v_op2,DATE '2026-07-03','pagamento','permuta',3000,'boi',3000,'manual',v_tag,v_admin,v_admin);
  SELECT count(*) FILTER (WHERE origem='financeiro'), count(*) FILTER (WHERE forma='permuta'), COALESCE(sum(valor),0)
    INTO v_cnt, v_val, v_saldo FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_op2 AND estornado=false;
  IF v_cnt<>1 OR v_val<>1 OR v_saldo<>5000 THEN RAISE EXCEPTION 'T16 FAIL auto=% permuta=% soma=%',v_cnt,v_val,v_saldo; END IF;
  RAISE NOTICE 'T16 PASS';

  -- ── T17: somente permuta (op nova) -> nenhuma automatica; permuta ativa ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-04','fechada',false,1000,v_tag,v_admin,v_admin) RETURNING id INTO v_opc;
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id, operacao_id, data, natureza, forma, valor, permuta_tipo_bem, permuta_valor_atribuido, origem, descricao, created_by, updated_by)
    VALUES (v_cli,v_opc,DATE '2026-07-05','pagamento','permuta',1000,'boi',1000,'manual',v_tag,v_admin,v_admin);
  SELECT count(*) FILTER (WHERE origem='financeiro'), count(*) FILTER (WHERE estornado=false)
    INTO v_cnt, v_val FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_opc;
  IF v_cnt<>0 OR v_val<>1 THEN RAISE EXCEPTION 'T17 FAIL auto=% ativas=%',v_cnt,v_val; END IF;
  RAISE NOTICE 'T17 PASS';

  -- ── T18: bloqueio de liquidacao MANUAL monetaria duplicada (guard da RPC, com auth admin) ──
  --   v_titc (op2) ja possui liquidacao automatica ativa -> registrar manual monetaria deve falhar P0001.
  DECLARE v_ok boolean := false;
  BEGIN
    BEGIN
      v_res := public.oc_registrar_liquidacao(v_op2, v_cli, jsonb_build_object(
        'data','2026-07-06','natureza','pagamento','forma','dinheiro','valor',2000,'descricao',v_tag,'financeiro_lancamento_id',v_titc::text));
    EXCEPTION WHEN OTHERS THEN v_ok := (SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T18 FAIL: manual monetaria duplicada aceita ou SQLSTATE inesperado'; END IF;
  END;
  RAISE NOTICE 'T18 PASS';

  -- ── T19: estorno de liquidacao MANUAL nao afeta a AUTOMATICA ──
  --   na op2: estorna a permuta manual; a automatica de v_titc segue ativa.
  UPDATE public.zoo_operacao_liquidacoes SET estornado=true, estornado_em=now(), estornado_por=v_admin, estorno_motivo='teste'
    WHERE operacao_id=v_op2 AND forma='permuta' AND estornado=false;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_titc AND origem='financeiro' AND estornado=false;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T19 FAIL: automatica afetada pelo estorno manual (%)',v_cnt; END IF;
  RAISE NOTICE 'T19 PASS';

  -- ── T20: estorno AUTOMATICO nao afeta permuta/manual ──
  --   op nova: permuta manual + titulo realizado; cancela titulo -> auto estornada, permuta intacta.
  DECLARE v_op20 uuid; v_tit20 uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-07','fechada',false,2000,v_tag,v_admin,v_admin) RETURNING id INTO v_op20;
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, cancelado, status_transacao, descricao)
      VALUES (v_cli,2000,'compra',false,'realizado',v_tag) RETURNING id INTO v_tit20;
    INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, financeiro_lancamento_id, origem)
      VALUES (v_cli,v_op20,'principal','principal',2000,v_tit20,'documento');
    INSERT INTO public.zoo_operacao_liquidacoes (cliente_id, operacao_id, data, natureza, forma, valor, permuta_tipo_bem, permuta_valor_atribuido, origem, descricao, created_by, updated_by)
      VALUES (v_cli,v_op20,DATE '2026-07-08','pagamento','permuta',500,'boi',500,'manual',v_tag,v_admin,v_admin);
    UPDATE public.financeiro_lancamentos_v2 SET cancelado=true WHERE id=v_tit20;  -- estorna a automatica
    SELECT count(*) FILTER (WHERE origem='financeiro' AND estornado=false), count(*) FILTER (WHERE forma='permuta' AND estornado=false)
      INTO v_cnt, v_val FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_op20;
    IF v_cnt<>0 OR v_val<>1 THEN RAISE EXCEPTION 'T20 FAIL auto_ativa=% permuta_ativa=%',v_cnt,v_val; END IF;
  END;
  RAISE NOTICE 'T20 PASS';

  -- ── T21: titulo criado JA realizado e vinculado DEPOIS (ordem oc_gerar_obrigacoes) ──
  DECLARE v_op21 uuid; v_parte21 uuid; v_tit21 uuid;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-09','fechada',false,1500,v_tag,v_admin,v_admin) RETURNING id INTO v_op21;
    INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, origem)
      VALUES (v_cli,v_op21,'principal','principal',1500,'documento') RETURNING id INTO v_parte21;      -- 1) parte SEM vinculo
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, cancelado, status_transacao, descricao)
      VALUES (v_cli,1500,'compra',false,'realizado',v_tag) RETURNING id INTO v_tit21;                  -- 2) financeiro (trigger no-op: sem vinculo)
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit21;
    IF v_cnt<>0 THEN RAISE EXCEPTION 'T21 FAIL: liquidacao criada antes do vinculo (%)',v_cnt; END IF;
    UPDATE public.zoo_operacao_partes SET financeiro_lancamento_id=v_tit21 WHERE id=v_parte21;         -- 3) vinculo (trigger complementar)
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit21 AND origem='financeiro' AND estornado=false;
    IF v_cnt<>1 THEN RAISE EXCEPTION 'T21 FAIL: trigger complementar nao gerou liquidacao (%)',v_cnt; END IF;
  END;
  RAISE NOTICE 'T21 PASS';

  -- ── T22: writer DIRETO (UPDATE puro em financeiro, sem RPC/React) gera liquidacao ──
  --   ja demonstrado em T3/T6/T8 via UPDATE direto; reafirma explicitamente sobre v_titb.
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_titb AND origem='financeiro' AND estornado=false;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T22 FAIL: writer direto nao refletiu (%)',v_cnt; END IF;
  RAISE NOTICE 'T22 PASS';

  -- ── T23: indices impedem duplicidade estrutural ──
  --   (a) 2a linha automatica p/ o mesmo titulo -> unique_violation (indice i)
  BEGIN
    INSERT INTO public.zoo_operacao_liquidacoes (cliente_id, operacao_id, data, natureza, forma, valor, financeiro_lancamento_id, origem, descricao, created_by, updated_by)
      VALUES (v_cli,v_op,DATE '2026-08-10','pagamento','outro',5000,v_tit,'financeiro',v_tag,v_admin,v_admin);
    RAISE EXCEPTION 'T23a FAIL: 2a automatica aceita';
  EXCEPTION WHEN unique_violation THEN NULL; WHEN OTHERS THEN IF SQLSTATE<>'23505' THEN RAISE EXCEPTION 'T23a SQLSTATE %',SQLSTATE; END IF; END;
  --   (b) manual monetaria ativa concorrente ao mesmo titulo -> unique_violation (indice ii)
  BEGIN
    INSERT INTO public.zoo_operacao_liquidacoes (cliente_id, operacao_id, data, natureza, forma, valor, financeiro_lancamento_id, origem, descricao, created_by, updated_by)
      VALUES (v_cli,v_op,DATE '2026-08-11','pagamento','dinheiro',5000,v_tit,'manual',v_tag,v_admin,v_admin);
    RAISE EXCEPTION 'T23b FAIL: manual monetaria concorrente aceita';
  EXCEPTION WHEN unique_violation THEN NULL; WHEN OTHERS THEN IF SQLSTATE<>'23505' THEN RAISE EXCEPTION 'T23b SQLSTATE %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T23 PASS';

  -- ── T24: OC CANCELADA -> titulo realizado nao cria liquidacao automatica (conservador) ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-10','cancelada',false,1000,v_tag,v_admin,v_admin) RETURNING id INTO v_op_cs;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, cancelado, status_transacao, descricao)
    VALUES (v_cli,1000,'compra',false,'realizado',v_tag) RETURNING id INTO v_titadm;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, financeiro_lancamento_id, origem)
    VALUES (v_cli,v_op_cs,'principal','principal',1000,v_titadm,'documento');
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_titadm AND estornado=false;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T24 FAIL: OC cancelada gerou liquidacao (%)',v_cnt; END IF;
  RAISE NOTICE 'T24 PASS';

  -- ── T25: rollback integral em falha (titulo valor 0 -> ponte RAISE -> update financeiro revertido) ──
  DECLARE v_op25 uuid; v_tit25 uuid; v_st_antes text; v_st_depois text; v_ok boolean := false;
  BEGIN
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
      VALUES (v_cli,'compra',DATE '2026-07-11','fechada',false,0,v_tag,v_admin,v_admin) RETURNING id INTO v_op25;
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, cancelado, status_transacao, descricao)
      VALUES (v_cli,0,'compra',false,'programado',v_tag) RETURNING id INTO v_tit25;
    INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, valor, financeiro_lancamento_id, origem)
      VALUES (v_cli,v_op25,'principal','principal',0,v_tit25,'documento');
    BEGIN
      UPDATE public.financeiro_lancamentos_v2 SET status_transacao='realizado' WHERE id=v_tit25;  -- ponte RAISE (valor 0)
    EXCEPTION WHEN OTHERS THEN v_ok := (SQLSTATE='P0001'); END;
    IF NOT v_ok THEN RAISE EXCEPTION 'T25 FAIL: ponte nao falhou em valor 0'; END IF;
    SELECT status_transacao INTO v_st_depois FROM public.financeiro_lancamentos_v2 WHERE id=v_tit25;
    IF v_st_depois<>'programado' THEN RAISE EXCEPTION 'T25 FAIL: update financeiro nao reverteu (status=%)',v_st_depois; END IF;
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE financeiro_lancamento_id=v_tit25;
    IF v_cnt<>0 THEN RAISE EXCEPTION 'T25 FAIL: liquidacao parcial persistiu (%)',v_cnt; END IF;
  END;
  RAISE NOTICE 'T25 PASS';

  -- ── T26: Carlinhos/Silvana conceitual (compra base 27.062,50; permuta 10.000; monetario 17.062,50) ──
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-12','fechada',false,27062.50,v_tag,v_admin,v_admin) RETURNING id INTO v_op_cs;
  -- permuta manual 10.000 (nao monetaria, sem titulo)
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id, operacao_id, data, natureza, forma, valor, permuta_tipo_bem, permuta_valor_atribuido, origem, descricao, created_by, updated_by)
    VALUES (v_cli,v_op_cs,DATE '2026-07-12','pagamento','permuta',10000,'imovel',10000,'manual',v_tag,v_admin,v_admin);
  -- 3 titulos monetarios somando 17.062,50 (5000 + 7000 + 5062,50)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, cancelado, status_transacao, descricao)
    VALUES (v_cli,5000,'compra',false,'programado',v_tag) RETURNING id INTO v_cs1;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, cancelado, status_transacao, descricao)
    VALUES (v_cli,7000,'compra',false,'programado',v_tag) RETURNING id INTO v_cs2;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, valor, tipo_operacao, cancelado, status_transacao, descricao)
    VALUES (v_cli,5062.50,'compra',false,'programado',v_tag) RETURNING id INTO v_cs3;
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, financeiro_lancamento_id, origem)
    VALUES (v_cli,v_op_cs,'principal','principal',1,3,5000,v_cs1,'documento');
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, financeiro_lancamento_id, origem)
    VALUES (v_cli,v_op_cs,'principal','principal',2,3,7000,v_cs2,'documento');
  INSERT INTO public.zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, financeiro_lancamento_id, origem)
    VALUES (v_cli,v_op_cs,'principal','principal',3,3,5062.50,v_cs3,'documento');
  -- pagar somente a 1a parcela -> liquidado = 10000(permuta)+5000 = 15000 (parcial)
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='realizado' WHERE id=v_cs1;
  SELECT COALESCE(sum(valor),0) INTO v_val FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_op_cs AND estornado=false;
  IF v_val<>15000 THEN RAISE EXCEPTION 'T26 FAIL parcial soma=% (esperado 15000)',v_val; END IF;
  SELECT estado_liquidacao INTO v_estado_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_op_cs;
  IF v_estado_op<>'parcial' THEN RAISE EXCEPTION 'T26 FAIL estado parcial=%',v_estado_op; END IF;
  -- pagar as demais -> liquidado = 27.062,50 (quitada)
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='realizado' WHERE id IN (v_cs2, v_cs3);
  SELECT COALESCE(sum(valor),0) INTO v_val FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_op_cs AND estornado=false;
  IF v_val<>27062.50 THEN RAISE EXCEPTION 'T26 FAIL total soma=% (esperado 27062.50)',v_val; END IF;
  SELECT estado_liquidacao INTO v_estado_op FROM public.vw_oc_operacao_liquidacao WHERE operacao_id=v_op_cs;
  IF v_estado_op<>'quitada' THEN RAISE EXCEPTION 'T26 FAIL estado quitada=%',v_estado_op; END IF;
  -- cancelar uma parcela -> volta parcial; permuta intacta
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true WHERE id=v_cs2;
  SELECT COALESCE(sum(valor),0) INTO v_val FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_op_cs AND estornado=false;
  IF v_val<>20062.50 THEN RAISE EXCEPTION 'T26 FAIL pos-cancel soma=% (esperado 20062.50)',v_val; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_liquidacoes WHERE operacao_id=v_op_cs AND forma='permuta' AND estornado=false;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T26 FAIL: permuta afetada (%)',v_cnt; END IF;
  RAISE NOTICE 'T26 PASS';

  RAISE NOTICE 'PR-OC-FIN-LIQ-01A: T1..T26 OK';
END $t$;

ROLLBACK;

-- ── Residuo zero (tag de sessao sobrevive ao rollback) ──
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT
    (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.ocfinliq_tag'))
  + (SELECT count(*) FROM public.zoo_operacao_liquidacoes WHERE descricao = current_setting('app.ocfinliq_tag'))
  + (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE descricao = current_setting('app.ocfinliq_tag')
                                                              OR descricao = current_setting('app.ocfinliq_tag')||' edit')
    INTO v_leak;
  IF v_leak <> 0 THEN RAISE EXCEPTION 'RESIDUO FAIL: % linhas vazaram (rollback nao aplicado)', v_leak; END IF;
  RAISE NOTICE 'RESIDUO ZERO PASS (rollback aplicado, nada persistiu)';
END $post$;

SELECT set_config('app.ocfinliq_tag', '', false) AS run_tag_reset;
