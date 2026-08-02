-- PR-OC-ESTORNO-FINANCEIRO-01 — testes dos 3 writers granulares (T1..T31).
--   oc_estornar_materializacao / oc_cancelar_programacao / oc_cancelar_compromisso.
--   Fixtures FIÉIS: criam op+compromisso(obrigacao/frete, sem teto)+programação+materialização pelos WRITERS reais
--   (oc_criar_compromisso/oc_programar_compromisso/oc_materializar_programacao). E1 parcela→prevista; E2 compromisso→aberto;
--   E3 bloqueio duro (liquidado/conciliado/paga/liquidação|conciliação ativa); E5 retomável+idempotente.
--   Requer aplicadas: 20260808120000 (este) + toda a cadeia OC. SOMENTE no PROTO. BEGIN...ROLLBACK + resíduo zero (T31).
SELECT set_config('app.ef_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

-- Fixture: op+compromisso(obrigacao/frete)+programação(N parcelas)+materialização opcional. Retorna ids + versão.
CREATE FUNCTION pg_temp._er_mk(p_cli uuid, p_admin uuid, p_fA uuid, p_faz uuid, p_sub text, p_tag text,
                               p_valores numeric[], p_materializar boolean)
RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v_op uuid; v_ver int; v_r jsonb; v_comp uuid; v_prog uuid; v_total numeric;
        v_parcelas jsonb; v_pc jsonb; v_parc uuid; v_val numeric; v_arr jsonb := '[]'::jsonb;
BEGIN
  SELECT coalesce(sum(x),0) INTO v_total FROM unnest(p_valores) x;
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (p_cli,'compra',DATE '2026-07-01','programada',false,5,'garrotes',v_total,0,p_fA,p_faz,p_tag,p_admin,p_admin)
    RETURNING id, versao INTO v_op, v_ver;
  v_r := public.oc_criar_compromisso(v_op, v_ver,
           jsonb_build_object('valor_total',v_total,'natureza','obrigacao','componente','frete',
                              'favorecido_id',p_fA,'subcentro',p_sub,'descricao','ER '||p_tag));
  v_ver := (v_r->>'operacao_versao')::int; v_comp := (v_r->'compromisso'->>'id')::uuid;
  SELECT jsonb_agg(jsonb_build_object('sequencia',ord,'valor',val)) INTO v_parcelas
    FROM (SELECT row_number() OVER () AS ord, val FROM unnest(p_valores) val) t;
  v_r := public.oc_programar_compromisso(v_op, v_ver, v_comp, jsonb_build_object('parcelas',v_parcelas));
  v_ver := (v_r->>'operacao_versao')::int; v_prog := (v_r->'programacao'->>'id')::uuid;
  FOR v_pc IN SELECT * FROM jsonb_array_elements(v_r->'parcelas') LOOP
    v_parc := (v_pc->>'id')::uuid; v_val := (v_pc->>'valor')::numeric;
    IF p_materializar THEN
      v_r := public.oc_materializar_programacao(v_op, v_ver, v_prog, v_parc);
      v_ver := (v_r->>'operacao_versao')::int;
      v_arr := v_arr || jsonb_build_array(jsonb_build_object('parcela',v_parc,'parte',(v_r->'parte'->>'id'),'titulo',(v_r->'titulo'->>'id'),'valor',v_val));
    ELSE
      v_arr := v_arr || jsonb_build_array(jsonb_build_object('parcela',v_parc,'parte',NULL,'titulo',NULL,'valor',v_val));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('op',v_op,'ver',v_ver,'comp',v_comp,'prog',v_prog,'itens',v_arr);
END $f$;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_fA uuid; v_faz uuid; v_sub text;
  f jsonb; it jsonb; v_op uuid; v_ver int; v_prog uuid; v_comp uuid; v_parc uuid; v_parte uuid; v_tit uuid; v_val numeric;
  v_res jsonb; v_ok boolean;
  v_mat_antes numeric; v_mat_depois numeric; v_saldo_antes numeric; v_saldo_depois numeric;
  v_eid uuid; v_i jsonb; v_ver2 int;
BEGIN
  v_tag := current_setting('app.ef_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  SELECT id INTO v_fA FROM public.financeiro_fornecedores WHERE cliente_id=v_cli ORDER BY nome LIMIT 1;
  SELECT id INTO v_faz FROM public.fazendas WHERE cliente_id=v_cli ORDER BY id LIMIT 1;
  SELECT subcentro INTO v_sub FROM public.financeiro_plano_contas
    WHERE ativo IS TRUE AND (cliente_id IS NULL OR cliente_id=v_cli) AND subcentro IS NOT NULL
    GROUP BY subcentro HAVING count(*)=1 ORDER BY subcentro LIMIT 1;
  IF v_fA IS NULL OR v_faz IS NULL OR v_sub IS NULL THEN RAISE EXCEPTION 'fixture: fornecedor/fazenda/subcentro'; END IF;

  -- ============ MATERIALIZAÇÃO ============
  -- T1 — materialização viva → título cancelado + parte cancelada + parcela prevista; versão +1
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid;
  it:=f->'itens'->0; v_parc:=(it->>'parcela')::uuid; v_parte:=(it->>'parte')::uuid; v_tit:=(it->>'titulo')::uuid;
  v_res := public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'estorno T1');
  IF (v_res->>'operacao_versao')::int <> v_ver+1 THEN RAISE EXCEPTION 'T1 FAIL versao'; END IF;
  IF (SELECT cancelado FROM public.financeiro_lancamentos_v2 WHERE id=v_tit) IS NOT TRUE
     OR (SELECT cancelada FROM public.zoo_operacao_partes WHERE id=v_parte) IS NOT TRUE
     OR (SELECT status FROM public.zoo_operacao_parcelas_programacao WHERE id=v_parc) <> 'prevista' THEN RAISE EXCEPTION 'T1 FAIL estado'; END IF;
  RAISE NOTICE 'T1 PASS';

  -- T2 — estado parcial (título já cancelado) → completa só parte/parcela, sem evento falso do título
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid;
  it:=f->'itens'->0; v_parc:=(it->>'parcela')::uuid; v_parte:=(it->>'parte')::uuid; v_tit:=(it->>'titulo')::uuid;
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true, cancelado_em=now(), cancelado_por=v_admin WHERE id=v_tit;  -- simula reversão parcial
  v_res := public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'estorno T2');
  IF NOT (v_res->'etapas_ja_concluidas' @> '["titulo_ja_cancelado"]'
          AND v_res->'etapas_executadas' @> '["parte_cancelada"]'
          AND v_res->'etapas_executadas' @> '["parcela_prevista"]') THEN RAISE EXCEPTION 'T2 FAIL etapas'; END IF;
  IF (SELECT cancelada FROM public.zoo_operacao_partes WHERE id=v_parte) IS NOT TRUE
     OR (SELECT status FROM public.zoo_operacao_parcelas_programacao WHERE id=v_parc) <> 'prevista' THEN RAISE EXCEPTION 'T2 FAIL estado'; END IF;
  RAISE NOTICE 'T2 PASS';

  -- T3 — cadeia já integralmente estornada → P0001, versão inalterada
  v_ver2 := (v_res->>'operacao_versao')::int;
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver2,v_prog,v_parc,'T3');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok OR (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> v_ver2 THEN RAISE EXCEPTION 'T3 FAIL'; END IF;
  RAISE NOTICE 'T3 PASS';

  -- T4 — título realizado → P0001
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0;
  v_parc:=(it->>'parcela')::uuid; v_tit:=(it->>'titulo')::uuid;
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='realizado' WHERE id=v_tit;
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T4');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T4 FAIL'; END IF; RAISE NOTICE 'T4 PASS';

  -- T5 — título conciliado (status) → P0001
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0;
  v_parc:=(it->>'parcela')::uuid; v_tit:=(it->>'titulo')::uuid;
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='conciliado' WHERE id=v_tit;
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T5');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T5 FAIL'; END IF; RAISE NOTICE 'T5 PASS';

  -- T6 — conciliado_em preenchido → P0001
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0;
  v_parc:=(it->>'parcela')::uuid; v_tit:=(it->>'titulo')::uuid;
  UPDATE public.financeiro_lancamentos_v2 SET conciliado_em=now() WHERE id=v_tit;
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T6');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T6 FAIL'; END IF; RAISE NOTICE 'T6 PASS';

  -- T7 — liquidação MANUAL ativa → P0001
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0;
  v_parc:=(it->>'parcela')::uuid; v_tit:=(it->>'titulo')::uuid;
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id,operacao_id,data,natureza,forma,valor,estornado,financeiro_lancamento_id,origem,created_by,updated_by)
    VALUES (v_cli,v_op,DATE '2026-07-10','pagamento','outro',1000,false,v_tit,'manual',v_admin,v_admin);
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T7');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T7 FAIL'; END IF; RAISE NOTICE 'T7 PASS';

  -- T8 — liquidação AUTOMÁTICA ativa (origem financeiro, título ainda programado) → P0001
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0;
  v_parc:=(it->>'parcela')::uuid; v_tit:=(it->>'titulo')::uuid;
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id,operacao_id,data,natureza,forma,valor,estornado,financeiro_lancamento_id,origem,created_by,updated_by)
    VALUES (v_cli,v_op,DATE '2026-07-10','pagamento','outro',1000,false,v_tit,'financeiro',v_admin,v_admin);
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T8');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T8 FAIL'; END IF; RAISE NOTICE 'T8 PASS';

  -- T9 — parcela paga → P0001
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0; v_parc:=(it->>'parcela')::uuid;
  UPDATE public.zoo_operacao_parcelas_programacao SET status='paga' WHERE id=v_parc;
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T9');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T9 FAIL'; END IF; RAISE NOTICE 'T9 PASS';

  -- T10 — operação cancelada → P0001
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0; v_parc:=(it->>'parcela')::uuid;
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada', versao=versao+1 WHERE id=v_op;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T10');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T10 FAIL'; END IF; RAISE NOTICE 'T10 PASS';

  -- T11 — programação renegociada → P0001
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0; v_parc:=(it->>'parcela')::uuid;
  UPDATE public.zoo_operacao_programacoes SET status='renegociada' WHERE id=v_prog;
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T11');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T11 FAIL'; END IF; RAISE NOTICE 'T11 PASS';

  -- T12 — divergência de identidade parte/parcela/título → P0001
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0; v_parc:=(it->>'parcela')::uuid;
  UPDATE public.zoo_operacao_parcelas_programacao SET valor=999 WHERE id=v_parc;  -- quebra 1:1:1
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T12');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T12 FAIL'; END IF; RAISE NOTICE 'T12 PASS';

  -- T13 — título NÃO deletado; FK/vínculo parte→título preservados após estorno
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0;
  v_parc:=(it->>'parcela')::uuid; v_parte:=(it->>'parte')::uuid; v_tit:=(it->>'titulo')::uuid;
  PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T13');
  IF NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE id=v_tit)
     OR (SELECT financeiro_lancamento_id FROM public.zoo_operacao_partes WHERE id=v_parte) <> v_tit THEN RAISE EXCEPTION 'T13 FAIL'; END IF;
  RAISE NOTICE 'T13 PASS';

  -- T14 — View 3 (grão compromisso): materializado diminui e saldo_a_materializar aumenta
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; v_comp:=(f->>'comp')::uuid; it:=f->'itens'->0; v_parc:=(it->>'parcela')::uuid;
  SELECT total_materializado, saldo_a_materializar INTO v_mat_antes, v_saldo_antes FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_comp;
  PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T14');
  SELECT total_materializado, saldo_a_materializar INTO v_mat_depois, v_saldo_depois FROM public.vw_oc_compromissos_resumo WHERE compromisso_id=v_comp;
  IF NOT (v_mat_depois < v_mat_antes AND v_saldo_depois > v_saldo_antes AND round(v_mat_antes-v_mat_depois,2)=1000) THEN RAISE EXCEPTION 'T14 FAIL'; END IF;
  RAISE NOTICE 'T14 PASS';

  -- T15 — Financeiro V2: título cancelado deixa de satisfazer o predicado ativo (cancelado=false)
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0; v_parc:=(it->>'parcela')::uuid; v_tit:=(it->>'titulo')::uuid;
  PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T15');
  IF EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE id=v_tit AND cancelado IS NOT TRUE) THEN RAISE EXCEPTION 'T15 FAIL'; END IF;
  RAISE NOTICE 'T15 PASS';

  -- T16 — versão +1 e evento/estorno_id corretos
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0; v_parc:=(it->>'parcela')::uuid;
  v_eid := gen_random_uuid();
  v_res := public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T16',v_eid);
  IF (v_res->>'estorno_id')::uuid <> v_eid OR (v_res->>'operacao_versao')::int <> v_ver+1
     OR (SELECT detalhes->>'estorno_id' FROM public.zoo_operacao_eventos WHERE operacao_id=v_op AND acao='estornar_materializacao' ORDER BY created_at DESC LIMIT 1) <> v_eid::text THEN RAISE EXCEPTION 'T16 FAIL'; END IF;
  RAISE NOTICE 'T16 PASS';

  -- T17 — 40001, 42501, motivo vazio
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0; v_parc:=(it->>'parcela')::uuid;
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver+99,v_prog,v_parc,'T17a');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='40001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T17 FAIL 40001'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'T17b');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='42501' THEN v_ok:=true; END IF; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  IF NOT v_ok THEN RAISE EXCEPTION 'T17 FAIL 42501'; END IF;
  v_ok:=false; BEGIN PERFORM public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,v_parc,'   ');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T17 FAIL motivo'; END IF; RAISE NOTICE 'T17 PASS';

  -- ============ PROGRAMAÇÃO ============
  -- T18 — parcela materializada ativa → bloqueia
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid;
  v_ok:=false; BEGIN PERFORM public.oc_cancelar_programacao(v_op,v_cli,v_ver,v_prog,'T18');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T18 FAIL'; END IF; RAISE NOTICE 'T18 PASS';

  -- T19 — parte ativa inconsistente (parcela prevista, parte não cancelada) → bloqueia
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; it:=f->'itens'->0; v_parc:=(it->>'parcela')::uuid;
  UPDATE public.zoo_operacao_parcelas_programacao SET status='prevista' WHERE id=v_parc;  -- deixa parte ativa órfã
  v_ok:=false; BEGIN PERFORM public.oc_cancelar_programacao(v_op,v_cli,v_ver,v_prog,'T19');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T19 FAIL'; END IF; RAISE NOTICE 'T19 PASS';

  -- T20 — todas previstas → parcelas canceladas, programação cancelada, compromisso aberto
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000,500]::numeric[],false);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; v_comp:=(f->>'comp')::uuid;
  v_res := public.oc_cancelar_programacao(v_op,v_cli,v_ver,v_prog,'T20');
  IF (SELECT status FROM public.zoo_operacao_programacoes WHERE id=v_prog) <> 'cancelada'
     OR EXISTS (SELECT 1 FROM public.zoo_operacao_parcelas_programacao WHERE programacao_id=v_prog AND status <> 'cancelada')
     OR (SELECT status FROM public.zoo_operacao_compromissos WHERE id=v_comp) <> 'aberto'
     OR (v_res->>'compromisso_reaberto') <> 'true' OR (v_res->>'parcelas_canceladas')::int <> 2 THEN RAISE EXCEPTION 'T20 FAIL'; END IF;
  RAISE NOTICE 'T20 PASS';

  -- T21 — programação renegociada → bloqueia
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],false);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid;
  UPDATE public.zoo_operacao_programacoes SET status='renegociada' WHERE id=v_prog;
  v_ok:=false; BEGIN PERFORM public.oc_cancelar_programacao(v_op,v_cli,v_ver,v_prog,'T21');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T21 FAIL'; END IF; RAISE NOTICE 'T21 PASS';

  -- T22 — dupla execução → sem novo evento/versão
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],false);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid;
  PERFORM public.oc_cancelar_programacao(v_op,v_cli,v_ver,v_prog,'T22');
  SELECT versao INTO v_ver2 FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false; BEGIN PERFORM public.oc_cancelar_programacao(v_op,v_cli,v_ver2,v_prog,'T22b');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok OR (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> v_ver2 THEN RAISE EXCEPTION 'T22 FAIL'; END IF;
  RAISE NOTICE 'T22 PASS';

  -- ============ COMPROMISSO ============
  -- T23 — programação ativa → bloqueia
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],false);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_comp:=(f->>'comp')::uuid;
  v_ok:=false; BEGIN PERFORM public.oc_cancelar_compromisso(v_op,v_cli,v_ver,v_comp,'T23');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T23 FAIL'; END IF; RAISE NOTICE 'T23 PASS';

  -- T24 — efeitos residuais (materializada) com programação não-ativa → bloqueia
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; v_comp:=(f->>'comp')::uuid;
  UPDATE public.zoo_operacao_programacoes SET status='cancelada' WHERE id=v_prog;  -- prog não-ativa, mas parcela segue materializada
  v_ok:=false; BEGIN PERFORM public.oc_cancelar_compromisso(v_op,v_cli,v_ver,v_comp,'T24');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T24 FAIL'; END IF; RAISE NOTICE 'T24 PASS';

  -- T25 — compromisso aberto sem efeitos → cancelado
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],false);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; v_comp:=(f->>'comp')::uuid;
  v_res := public.oc_cancelar_programacao(v_op,v_cli,v_ver,v_prog,'T25 prep');  -- compromisso→aberto
  v_ver := (v_res->>'operacao_versao')::int;
  v_res := public.oc_cancelar_compromisso(v_op,v_cli,v_ver,v_comp,'T25');
  IF (SELECT status FROM public.zoo_operacao_compromissos WHERE id=v_comp) <> 'cancelado'
     OR (v_res->>'operacao_versao')::int <> v_ver+1 THEN RAISE EXCEPTION 'T25 FAIL'; END IF;
  RAISE NOTICE 'T25 PASS';

  -- T26 — compromisso 'programado' sem programação ativa/efeitos → cancelado
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],false);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; v_comp:=(f->>'comp')::uuid;
  UPDATE public.zoo_operacao_parcelas_programacao SET status='cancelada' WHERE programacao_id=v_prog;
  UPDATE public.zoo_operacao_programacoes SET status='cancelada' WHERE id=v_prog;  -- compromisso permanece 'programado'
  v_res := public.oc_cancelar_compromisso(v_op,v_cli,v_ver,v_comp,'T26');
  IF (SELECT status FROM public.zoo_operacao_compromissos WHERE id=v_comp) <> 'cancelado' THEN RAISE EXCEPTION 'T26 FAIL'; END IF;
  RAISE NOTICE 'T26 PASS';

  -- T27 — dupla execução → sem novo evento/versão
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],false);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; v_comp:=(f->>'comp')::uuid;
  v_res := public.oc_cancelar_programacao(v_op,v_cli,v_ver,v_prog,'T27 prep'); v_ver:=(v_res->>'operacao_versao')::int;
  PERFORM public.oc_cancelar_compromisso(v_op,v_cli,v_ver,v_comp,'T27');
  SELECT versao INTO v_ver2 FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_ok:=false; BEGIN PERFORM public.oc_cancelar_compromisso(v_op,v_cli,v_ver2,v_comp,'T27b');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok OR (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> v_ver2 THEN RAISE EXCEPTION 'T27 FAIL'; END IF;
  RAISE NOTICE 'T27 PASS';

  -- ============ INTEGRAÇÃO ============
  -- T28/T29 — fluxo completo 4 parcelas materializadas → estorna A×4 (mesmo estorno_id) → cancelar prog → cancelar comp
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[2000,3000,4000,1000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid; v_comp:=(f->>'comp')::uuid;
  v_eid := gen_random_uuid();
  FOR v_i IN SELECT * FROM jsonb_array_elements(f->'itens') LOOP
    v_res := public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,(v_i->>'parcela')::uuid,'T28 estorno',v_eid);
    v_ver := (v_res->>'operacao_versao')::int;
  END LOOP;
  v_res := public.oc_cancelar_programacao(v_op,v_cli,v_ver,v_prog,'T28 prog',v_eid); v_ver:=(v_res->>'operacao_versao')::int;
  v_res := public.oc_cancelar_compromisso(v_op,v_cli,v_ver,v_comp,'T28 comp',v_eid); v_ver:=(v_res->>'operacao_versao')::int;
  -- títulos/partes preservados e cancelados; parcelas/programação/compromisso cancelados
  IF (SELECT count(*) FROM public.zoo_operacao_partes pt JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id=pt.programacao_parcela_id WHERE pp.programacao_id=v_prog AND pt.cancelada IS NOT TRUE) <> 0
     OR (SELECT count(*) FROM public.zoo_operacao_partes pt JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id=pt.programacao_parcela_id JOIN public.financeiro_lancamentos_v2 fl ON fl.id=pt.financeiro_lancamento_id WHERE pp.programacao_id=v_prog AND fl.cancelado IS NOT TRUE) <> 0
     OR (SELECT count(*) FROM public.zoo_operacao_parcelas_programacao WHERE programacao_id=v_prog AND status <> 'cancelada') <> 0
     OR (SELECT status FROM public.zoo_operacao_programacoes WHERE id=v_prog) <> 'cancelada'
     OR (SELECT status FROM public.zoo_operacao_compromissos WHERE id=v_comp) <> 'cancelado' THEN RAISE EXCEPTION 'T28 FAIL estado'; END IF;
  IF (SELECT count(*) FROM public.zoo_operacao_partes pt JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id=pt.programacao_parcela_id WHERE pp.programacao_id=v_prog) <> 4 THEN RAISE EXCEPTION 'T28 FAIL: parte deletada'; END IF;
  -- View 3: sem obrigação ativa (nada materializado)
  IF (SELECT total_materializado FROM public.vw_oc_operacao_compromissos_resumo WHERE operacao_id=v_op) <> 0 THEN RAISE EXCEPTION 'T28 FAIL: View3 materializado<>0'; END IF;
  RAISE NOTICE 'T28 PASS';
  -- T29 — mesmo estorno_id nas 3 etapas
  IF (SELECT count(DISTINCT detalhes->>'estorno_id') FROM public.zoo_operacao_eventos
        WHERE operacao_id=v_op AND acao IN ('estornar_materializacao','cancelar_programacao','cancelar_compromisso')) <> 1 THEN RAISE EXCEPTION 'T29 FAIL'; END IF;
  RAISE NOTICE 'T29 PASS';

  -- T30 — retomabilidade/isolamento: estorno de 1 parcela persiste; cancelar_programacao com outra materializada falha sem desfazer
  f := pg_temp._er_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000,2000]::numeric[],true);
  v_op:=(f->>'op')::uuid; v_ver:=(f->>'ver')::int; v_prog:=(f->>'prog')::uuid;
  v_res := public.oc_estornar_materializacao(v_op,v_cli,v_ver,v_prog,(f->'itens'->0->>'parcela')::uuid,'T30 estorno1');
  v_ver := (v_res->>'operacao_versao')::int;
  v_ok:=false; BEGIN PERFORM public.oc_cancelar_programacao(v_op,v_cli,v_ver,v_prog,'T30 prog');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok
     OR (SELECT status FROM public.zoo_operacao_parcelas_programacao WHERE id=(f->'itens'->0->>'parcela')::uuid) <> 'prevista'  -- estorno1 persistiu
     OR (SELECT status FROM public.zoo_operacao_programacoes WHERE id=v_prog) <> 'ativa'                                       -- prog intacta
     OR (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> v_ver THEN RAISE EXCEPTION 'T30 FAIL'; END IF;
  RAISE NOTICE 'T30 PASS';

  RAISE NOTICE 'PR-OC-ESTORNO-FINANCEIRO-01: PASS (T1-T30)';
END $t$;

ROLLBACK;

-- T31 — resíduo zero após ROLLBACK.
SELECT count(*) AS residuo FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.ef_tag');
