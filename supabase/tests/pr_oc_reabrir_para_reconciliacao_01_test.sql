-- PR-OC-REABRIR-PARA-RECONCILIACAO-01 — testes de public.oc_reabrir_para_reconciliacao (T1..T24).
--   Porta administrativa para OC cancelada PARCIALMENTE REVERTIDA (títulos cancelados; partes/parcelas/
--   programações/compromissos ativos; SEM efeito ativo). Disjunção soberana com oc_reabrir_para_estorno.
--   Fixtures FIÉIS via oc_criar/programar/materializar; estado meio-revertido = cancelar títulos + oc_cancelar.
--   Requer aplicadas: 20260809120000 (este) + cadeia OC. SOMENTE no PROTO. BEGIN...ROLLBACK + resíduo zero (T24).
SELECT set_config('app.rc_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

-- Fixture base: op programada + compromisso(obrigacao/frete) + programação(N parcelas) + materialização opcional.
CREATE FUNCTION pg_temp._rc_base(p_cli uuid,p_admin uuid,p_fA uuid,p_faz uuid,p_sub text,p_tag text,p_valores numeric[],p_mat boolean)
RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v_op uuid; v_ver int; v_r jsonb; v_comp uuid; v_prog uuid; v_total numeric; v_parcelas jsonb; v_pc jsonb; v_parc uuid; v_arr jsonb:='[]'::jsonb;
BEGIN
  SELECT coalesce(sum(x),0) INTO v_total FROM unnest(p_valores) x;
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (p_cli,'compra',DATE '2026-07-01','programada',false,5,'garrotes',v_total,0,p_fA,p_faz,p_tag,p_admin,p_admin) RETURNING id,versao INTO v_op,v_ver;
  v_r := public.oc_criar_compromisso(v_op,v_ver, jsonb_build_object('valor_total',v_total,'natureza','obrigacao','componente','frete','favorecido_id',p_fA,'subcentro',p_sub,'descricao','RC '||p_tag));
  v_ver:=(v_r->>'operacao_versao')::int; v_comp:=(v_r->'compromisso'->>'id')::uuid;
  SELECT jsonb_agg(jsonb_build_object('sequencia',ord,'valor',val)) INTO v_parcelas FROM (SELECT row_number() OVER () ord, val FROM unnest(p_valores) val) t;
  v_r := public.oc_programar_compromisso(v_op,v_ver,v_comp, jsonb_build_object('parcelas',v_parcelas));
  v_ver:=(v_r->>'operacao_versao')::int; v_prog:=(v_r->'programacao'->>'id')::uuid;
  FOR v_pc IN SELECT * FROM jsonb_array_elements(v_r->'parcelas') LOOP
    v_parc:=(v_pc->>'id')::uuid;
    IF p_mat THEN
      v_r := public.oc_materializar_programacao(v_op,v_ver,v_prog,v_parc); v_ver:=(v_r->>'operacao_versao')::int;
      v_arr := v_arr || jsonb_build_array(jsonb_build_object('parcela',v_parc,'parte',(v_r->'parte'->>'id'),'titulo',(v_r->'titulo'->>'id')));
    ELSE
      v_arr := v_arr || jsonb_build_array(jsonb_build_object('parcela',v_parc,'parte',NULL,'titulo',NULL));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('op',v_op,'ver',v_ver,'comp',v_comp,'prog',v_prog,'itens',v_arr);
END $f$;

-- Coloca a op em estado MEIO-REVERTIDO: cancela títulos (legado) + oc_cancelar (guard passa). Retorna versão.
CREATE FUNCTION pg_temp._rc_partial(p_op uuid,p_cli uuid,p_ver int)
RETURNS int LANGUAGE plpgsql AS $f$
BEGIN
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true, cancelado_em=now()
   WHERE id IN (SELECT financeiro_lancamento_id FROM public.zoo_operacao_partes WHERE operacao_id=p_op AND financeiro_lancamento_id IS NOT NULL) AND cancelado IS DISTINCT FROM true;
  RETURN (public.oc_cancelar(p_op,p_cli,p_ver,'setup: cancelamento legado (titulos ja estornados)')->>'versao')::int;
END $f$;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_fA uuid; v_faz uuid; v_sub text;
  f jsonb; v_op uuid; v_ver int; v_res jsonb; v_ok boolean; v_lote uuid; v_parc uuid; v_tit uuid;
  v_prog uuid; v_comp uuid; v_i jsonb; v_ev jsonb; v_snap_partes int; v_snap_parc int; v_extrato uuid;
BEGIN
  v_tag := current_setting('app.rc_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true AND public.is_admin_agroinblue(cm.user_id) ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  SELECT id INTO v_fA FROM public.financeiro_fornecedores WHERE cliente_id=v_cli ORDER BY nome LIMIT 1;
  SELECT id INTO v_faz FROM public.fazendas WHERE cliente_id=v_cli ORDER BY id LIMIT 1;
  SELECT subcentro INTO v_sub FROM public.financeiro_plano_contas WHERE ativo IS TRUE AND (cliente_id IS NULL OR cliente_id=v_cli) AND subcentro IS NOT NULL GROUP BY subcentro HAVING count(*)=1 ORDER BY subcentro LIMIT 1;
  IF v_fA IS NULL OR v_faz IS NULL OR v_sub IS NULL THEN RAISE EXCEPTION 'fixture: fornecedor/fazenda/subcentro'; END IF;

  -- ===== T1 — 3493b6a9-like: títulos cancelados + partes ativas + parcelas materializadas + prog ativa -> reabre
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000,500]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=pg_temp._rc_partial(v_op,v_cli,(f->>'ver')::int);
  v_res := public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'reparo T1');
  IF (v_res->>'status_comercial') <> 'programada' OR (v_res->>'operacao_versao')::int <> v_ver+1
     OR (SELECT status_comercial FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> 'programada'
     OR (SELECT cancelado_em FROM public.zoo_operacoes_comerciais WHERE id=v_op) IS NOT NULL THEN RAISE EXCEPTION 'T1 FAIL'; END IF;
  RAISE NOTICE 'T1 PASS';

  -- ===== T2 — parte ativa + título cancelado -> elegível
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=pg_temp._rc_partial(v_op,v_cli,(f->>'ver')::int);
  v_res := public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'reparo T2');
  IF (v_res->>'status_comercial') <> 'programada'
     OR (v_res->'inconsistencias_detectadas'->>'partes_ativas_titulo_cancelado')::int < 1 THEN RAISE EXCEPTION 'T2 FAIL'; END IF;
  RAISE NOTICE 'T2 PASS';

  -- ===== T3 — parcela materializada + título cancelado -> elegível
  IF (v_res->'inconsistencias_detectadas'->>'parcelas_materializadas_pagas')::int < 1 THEN RAISE EXCEPTION 'T3 FAIL'; END IF;
  RAISE NOTICE 'T3 PASS';

  -- ===== T4 — programação ativa residual (sem materialização) -> elegível
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],false);  -- não materializa (sem títulos)
  v_op:=(f->>'op')::uuid;
  v_ver := (public.oc_cancelar(v_op,v_cli,(f->>'ver')::int,'setup T4')->>'versao')::int;  -- sem título ativo -> cancela
  v_res := public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'reparo T4');
  IF (v_res->>'status_comercial') <> 'programada' OR (v_res->'inconsistencias_detectadas'->>'programacoes_ativas')::int < 1 THEN RAISE EXCEPTION 'T4 FAIL'; END IF;
  RAISE NOTICE 'T4 PASS';

  -- ===== T5 — movimentação ativa -> P0001 orienta oc_reabrir_para_estorno
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-02','programada',false,5,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem) VALUES (v_op,v_cli,'garrotes',5,'total',20000,1) RETURNING id INTO v_lote;
  PERFORM public.oc_registrar_movimentacao(v_op,v_cli,v_lote,DATE '2026-07-05','garrotes',5,NULL,NULL,v_tag);  -- mov ativa
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), cancelado_por=v_admin, cancelado_motivo='legado', versao=versao+1 WHERE id=v_op;
  INSERT INTO public.zoo_operacao_eventos (cliente_id,operacao_id,acao,dados_anteriores,detalhes,usuario_id,origem) VALUES (v_cli,v_op,'cancelar',jsonb_build_object('status_comercial','programada'),'{}'::jsonb,v_admin,'rpc');
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T5'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' AND SQLERRM LIKE '%oc_reabrir_para_estorno%' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T5 FAIL'; END IF; RAISE NOTICE 'T5 PASS';

  -- ===== T6 — título ativo -> P0001 orienta estorno
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);  -- título ATIVO (não cancelado)
  v_op:=(f->>'op')::uuid;
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), cancelado_por=v_admin, cancelado_motivo='legado', versao=versao+1 WHERE id=v_op;  -- cancel manual (guard normal barraria)
  INSERT INTO public.zoo_operacao_eventos (cliente_id,operacao_id,acao,dados_anteriores,detalhes,usuario_id,origem) VALUES (v_cli,v_op,'cancelar',jsonb_build_object('status_comercial','programada'),'{}'::jsonb,v_admin,'rpc');
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T6'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' AND SQLERRM LIKE '%oc_reabrir_para_estorno%' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T6 FAIL'; END IF; RAISE NOTICE 'T6 PASS';

  -- ===== T7 — liquidação ativa -> P0001 orienta estorno
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_tit:=(f->'itens'->0->>'titulo')::uuid;
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true, cancelado_em=now() WHERE id=v_tit;  -- título cancelado
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id,operacao_id,data,natureza,forma,valor,estornado,financeiro_lancamento_id,origem,created_by,updated_by) VALUES (v_cli,v_op,DATE '2026-07-10','pagamento','outro',1000,false,v_tit,'manual',v_admin,v_admin);  -- liq ATIVA
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), cancelado_por=v_admin, cancelado_motivo='legado', versao=versao+1 WHERE id=v_op;
  INSERT INTO public.zoo_operacao_eventos (cliente_id,operacao_id,acao,dados_anteriores,detalhes,usuario_id,origem) VALUES (v_cli,v_op,'cancelar',jsonb_build_object('status_comercial','programada'),'{}'::jsonb,v_admin,'rpc');
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T7'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' AND SQLERRM LIKE '%oc_reabrir_para_estorno%' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T7 FAIL'; END IF; RAISE NOTICE 'T7 PASS';

  -- ===== T8 — conciliação bancária ativa -> P0001 orienta estorno
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_tit:=(f->'itens'->0->>'titulo')::uuid;
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true, cancelado_em=now() WHERE id=v_tit;
  SELECT id INTO v_extrato FROM public.extrato_bancario_v2 WHERE cliente_id=v_cli LIMIT 1;  -- reutiliza extrato existente do cliente
  IF v_extrato IS NULL THEN RAISE EXCEPTION 'T8 fixture: cliente sem extrato bancario'; END IF;
  INSERT INTO public.conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado) VALUES (v_cli, v_extrato, v_tit, 1000);  -- conciliação ATIVA (desfeito_em NULL)
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), cancelado_por=v_admin, cancelado_motivo='legado', versao=versao+1 WHERE id=v_op;
  INSERT INTO public.zoo_operacao_eventos (cliente_id,operacao_id,acao,dados_anteriores,detalhes,usuario_id,origem) VALUES (v_cli,v_op,'cancelar',jsonb_build_object('status_comercial','programada'),'{}'::jsonb,v_admin,'rpc');
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T8'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' AND SQLERRM LIKE '%oc_reabrir_para_estorno%' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T8 FAIL'; END IF; RAISE NOTICE 'T8 PASS';

  -- ===== T9 — cancelada SEM incompletude -> P0001 "nada a reconciliar"
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-03','programada',false,5,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  v_ver := (public.oc_cancelar(v_op,v_cli,(SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op),'setup T9')->>'versao')::int;  -- sem downstream
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T9'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' AND SQLERRM LIKE '%nada a reconciliar%' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T9 FAIL'; END IF; RAISE NOTICE 'T9 PASS';

  -- ===== T10 — compromisso aberto ISOLADO (sem programação/parte/parcela) -> NÃO elegível (P0001)
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-04','programada',false,5,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_op;
  v_res := public.oc_criar_compromisso(v_op,(SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op), jsonb_build_object('valor_total',1000,'natureza','obrigacao','componente','frete','favorecido_id',v_fA,'subcentro',v_sub,'descricao','iso'));
  v_ver := (public.oc_cancelar(v_op,v_cli,(v_res->>'operacao_versao')::int,'setup T10')->>'versao')::int;  -- compromisso aberto isolado
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T10'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' AND SQLERRM LIKE '%nada a reconciliar%' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T10 FAIL'; END IF; RAISE NOTICE 'T10 PASS';

  -- ===== T11 — evento cancelar ausente -> P0001
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid;
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true WHERE id IN (SELECT financeiro_lancamento_id FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND financeiro_lancamento_id IS NOT NULL);
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), cancelado_por=v_admin, versao=versao+1 WHERE id=v_op;  -- cancelada SEM evento
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T11'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T11 FAIL'; END IF; RAISE NOTICE 'T11 PASS';

  -- ===== T12 — status anterior inválido -> P0001
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid;
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true WHERE id IN (SELECT financeiro_lancamento_id FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND financeiro_lancamento_id IS NOT NULL);
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', cancelado_em=now(), versao=versao+1 WHERE id=v_op;
  INSERT INTO public.zoo_operacao_eventos (cliente_id,operacao_id,acao,dados_anteriores,detalhes,usuario_id,origem) VALUES (v_cli,v_op,'cancelar',jsonb_build_object('status_comercial','rascunho'),'{}'::jsonb,v_admin,'rpc');  -- status_ant inválido
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T12'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T12 FAIL'; END IF; RAISE NOTICE 'T12 PASS';

  -- ===== T13 — operação NÃO cancelada -> P0001
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid;
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true WHERE id IN (SELECT financeiro_lancamento_id FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND financeiro_lancamento_id IS NOT NULL);  -- programada, títulos cancelados, NÃO cancela op
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T13'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T13 FAIL'; END IF; RAISE NOTICE 'T13 PASS';

  -- ===== T14/T15/T16/T17 — 40001 / tenant 42501 / não-admin 42501 / motivo vazio
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=pg_temp._rc_partial(v_op,v_cli,(f->>'ver')::int);
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver+99,'T14'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='40001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T14 FAIL'; END IF; RAISE NOTICE 'T14 PASS';
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op, gen_random_uuid(), v_ver,'T15'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='42501' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T15 FAIL'; END IF; RAISE NOTICE 'T15 PASS';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T16'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='42501' THEN v_ok:=true; END IF; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  IF NOT v_ok THEN RAISE EXCEPTION 'T16 FAIL'; END IF; RAISE NOTICE 'T16 PASS';
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'   '); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T17 FAIL'; END IF; RAISE NOTICE 'T17 PASS';

  -- ===== T18 — dupla execução: 2ª chamada bloqueada (status já restaurado)
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=pg_temp._rc_partial(v_op,v_cli,(f->>'ver')::int);
  v_res := public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T18a'); v_ver:=(v_res->>'operacao_versao')::int;
  v_ok:=false; BEGIN PERFORM public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T18b'); EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T18 FAIL'; END IF; RAISE NOTICE 'T18 PASS';

  -- ===== T19/T20/T21 — downstream byte a byte + versão+1 + evento/estorno_id/contagens
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000,500]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_prog:=(f->>'prog')::uuid; v_comp:=(f->>'comp')::uuid; v_ver:=pg_temp._rc_partial(v_op,v_cli,(f->>'ver')::int);
  SELECT count(*) INTO v_snap_partes FROM public.zoo_operacao_partes WHERE operacao_id=v_op;
  SELECT count(*) INTO v_snap_parc FROM public.zoo_operacao_parcelas_programacao pp JOIN public.zoo_operacao_programacoes pr ON pr.id=pp.programacao_id WHERE pr.compromisso_id=v_comp AND pp.status='materializada';
  v_res := public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T19-21');
  -- T20 versão +1
  IF (v_res->>'operacao_versao')::int <> v_ver+1 THEN RAISE EXCEPTION 'T20 FAIL'; END IF; RAISE NOTICE 'T20 PASS';
  -- T19 downstream inalterado
  IF (SELECT status FROM public.zoo_operacao_programacoes WHERE id=v_prog) <> 'ativa'
     OR (SELECT status FROM public.zoo_operacao_compromissos WHERE id=v_comp) <> 'programado'
     OR (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id=v_op) <> v_snap_partes
     OR (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND cancelada IS NOT TRUE) <> 2
     OR (SELECT count(*) FROM public.zoo_operacao_parcelas_programacao pp JOIN public.zoo_operacao_programacoes pr ON pr.id=pp.programacao_id WHERE pr.compromisso_id=v_comp AND pp.status='materializada') <> v_snap_parc THEN RAISE EXCEPTION 'T19 FAIL'; END IF;
  RAISE NOTICE 'T19 PASS';
  -- T21 evento + estorno_id + contagens
  SELECT detalhes INTO v_ev FROM public.zoo_operacao_eventos WHERE operacao_id=v_op AND acao='reabrir_para_reconciliacao' ORDER BY created_at DESC LIMIT 1;
  IF (v_ev->>'estorno_id')::uuid <> (v_res->>'estorno_id')::uuid
     OR (v_ev->'inconsistencias_detectadas'->>'partes_ativas_titulo_cancelado')::int <> 2
     OR (v_ev->'inconsistencias_detectadas'->>'parcelas_materializadas_pagas')::int <> 2
     OR (v_ev->'inconsistencias_detectadas'->>'programacoes_ativas')::int <> 1
     OR (v_ev->>'evento_cancelar_origem') IS NULL THEN RAISE EXCEPTION 'T21 FAIL'; END IF;
  RAISE NOTICE 'T21 PASS';

  -- ===== T22 — ACL
  IF has_function_privilege('anon','public.oc_reabrir_para_reconciliacao(uuid,uuid,integer,text)'::regprocedure,'EXECUTE')
     OR NOT has_function_privilege('authenticated','public.oc_reabrir_para_reconciliacao(uuid,uuid,integer,text)'::regprocedure,'EXECUTE')
     OR NOT has_function_privilege('service_role','public.oc_reabrir_para_reconciliacao(uuid,uuid,integer,text)'::regprocedure,'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, unnest(coalesce(p.proacl,ARRAY[]::aclitem[])) a
                 WHERE n.nspname='public' AND p.proname='oc_reabrir_para_reconciliacao' AND a::text LIKE '=%') THEN
    RAISE EXCEPTION 'T22 FAIL: ACL'; END IF;
  RAISE NOTICE 'T22 PASS';

  -- ===== T23 — integração completa: reabre -> estorna materializações retomáveis -> cancelar prog -> cancelar comp -> oc_cancelar
  f := pg_temp._rc_base(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000,500,300]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_prog:=(f->>'prog')::uuid; v_comp:=(f->>'comp')::uuid; v_ver:=pg_temp._rc_partial(v_op,v_cli,(f->>'ver')::int);
  v_res := public.oc_reabrir_para_reconciliacao(v_op,v_cli,v_ver,'T23 reabre'); v_ver:=(v_res->>'operacao_versao')::int;
  FOR v_i IN SELECT * FROM jsonb_array_elements(f->'itens') LOOP
    v_res := public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,(v_i->>'parcela')::uuid,'T23 estorno retomavel', (v_res->>'estorno_id')::uuid);  -- retomável (título já cancelado)
    v_ver:=(v_res->>'operacao_versao')::int;
    IF NOT (v_res->'etapas_ja_concluidas' @> '["titulo_ja_cancelado"]') THEN RAISE EXCEPTION 'T23 FAIL: nao retomavel'; END IF;
  END LOOP;
  v_res := public.oc_cancelar_programacao(v_op,v_cli,v_ver,v_prog,'T23 prog'); v_ver:=(v_res->>'operacao_versao')::int;
  v_res := public.oc_cancelar_compromisso(v_op,v_cli,v_ver,v_comp,'T23 comp'); v_ver:=(v_res->>'operacao_versao')::int;
  v_res := public.oc_cancelar(v_op,v_cli,v_ver,'T23 cancelar final'); v_ver:=(v_res->>'versao')::int;
  IF (SELECT status_comercial FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> 'cancelada'
     OR (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND cancelada IS NOT TRUE) <> 0
     OR (SELECT count(*) FROM public.zoo_operacao_parcelas_programacao WHERE programacao_id=v_prog AND status <> 'cancelada') <> 0
     OR (SELECT status FROM public.zoo_operacao_programacoes WHERE id=v_prog) <> 'cancelada'
     OR (SELECT status FROM public.zoo_operacao_compromissos WHERE id=v_comp) <> 'cancelado'
     OR (SELECT count(*) FROM public.zoo_operacao_partes pt JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id=pt.programacao_parcela_id WHERE pp.programacao_id=v_prog) <> 3 THEN RAISE EXCEPTION 'T23 FAIL estado'; END IF;
  RAISE NOTICE 'T23 PASS';

  RAISE NOTICE 'PR-OC-REABRIR-PARA-RECONCILIACAO-01: PASS (T1-T23)';
END $t$;

ROLLBACK;

-- T24 — resíduo zero após ROLLBACK.
SELECT count(*) AS residuo FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.rc_tag');
