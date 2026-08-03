-- PR-OC-LIMPEZA-HOMOLOGACAO-02 — testes de public.oc_limpar_operacao_teste (T1..T12).
--   Valida guards (inexistente→P0002; is_teste=false→P0001; confirmação errada→P0001; motivo vazio→P0001;
--   liquidação ativa→P0001; conciliação ativa→P0001; admin→42501); exclusão limpa (op+lote+eventos removidos,
--   auditoria gravada, snapshot completo); remoção de título financeiro exclusivo e de lançamento zootécnico
--   exclusivo; ISOLAMENTO (operação real is_teste=false vizinha permanece intacta); rollback total.
--   Fixtures FIÉIS: compromisso(obrigacao/frete)+programação+materialização pelos writers reais.
--   Requer aplicadas: 20260811120000 (este) + 20260810120000 (is_teste) + toda a cadeia OC. SOMENTE no PROTO.
--   BEGIN...ROLLBACK + resíduo zero (T-final).
SELECT set_config('app.lt_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

-- Fixture: op(is_teste=true)+compromisso(obrigacao/frete)+programação(N parcelas)+materialização opcional.
CREATE FUNCTION pg_temp._lt_mk(p_cli uuid, p_admin uuid, p_fA uuid, p_faz uuid, p_sub text, p_tag text,
                               p_valores numeric[], p_materializar boolean, p_is_teste boolean)
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
                              'favorecido_id',p_fA,'subcentro',p_sub,'descricao','LT '||p_tag));
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
  -- marca massa de teste POR ÚLTIMO (writers rodam sobre op normal)
  UPDATE public.zoo_operacoes_comerciais SET is_teste = p_is_teste WHERE id = v_op;
  RETURN jsonb_build_object('op',v_op,'ver',v_ver,'comp',v_comp,'prog',v_prog,'itens',v_arr);
END $f$;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_fA uuid; v_faz uuid; v_sub text;
  v_extrato uuid; v_op uuid; v_op_b uuid; v_lote uuid; v_res jsonb; v_ok boolean;
  f jsonb; it jsonb; v_tit uuid; v_parte uuid; v_mov uuid; v_aid uuid; v_tit_b uuid; v_partes_b int;
BEGIN
  v_tag := current_setting('app.lt_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  SELECT id INTO v_fA FROM public.financeiro_fornecedores WHERE cliente_id=v_cli ORDER BY nome LIMIT 1;
  SELECT id INTO v_faz FROM public.fazendas WHERE cliente_id=v_cli ORDER BY id LIMIT 1;
  SELECT subcentro INTO v_sub FROM public.financeiro_plano_contas
    WHERE ativo IS TRUE AND (cliente_id IS NULL OR cliente_id=v_cli) AND subcentro IS NOT NULL
    GROUP BY subcentro HAVING count(*)=1 ORDER BY subcentro LIMIT 1;
  SELECT id INTO v_extrato FROM public.extrato_bancario_v2 LIMIT 1;  -- reuso p/ conciliação (FK)
  IF v_fA IS NULL OR v_faz IS NULL OR v_sub IS NULL OR v_extrato IS NULL THEN RAISE EXCEPTION 'fixture: fornecedor/fazenda/subcentro/extrato'; END IF;

  -- ===== T1 — operação inexistente → P0002 =====
  v_ok:=false; BEGIN PERFORM public.oc_limpar_operacao_teste(gen_random_uuid(), gen_random_uuid(), 'T1');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0002' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T1 FAIL: esperado P0002'; END IF; RAISE NOTICE 'T1 PASS';

  -- ===== T2 — operação REAL (is_teste=false) → P0001 =====
  f := pg_temp._lt_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],false,false);
  v_op:=(f->>'op')::uuid;
  v_ok:=false; BEGIN PERFORM public.oc_limpar_operacao_teste(v_op, v_op, 'T2');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T2 FAIL: op real deveria bloquear'; END IF; RAISE NOTICE 'T2 PASS';

  -- ===== T3 — confirmação errada → P0001 =====
  f := pg_temp._lt_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],false,true);
  v_op:=(f->>'op')::uuid;
  v_ok:=false; BEGIN PERFORM public.oc_limpar_operacao_teste(v_op, gen_random_uuid(), 'T3');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T3 FAIL: confirmação errada deveria bloquear'; END IF; RAISE NOTICE 'T3 PASS';

  -- ===== T4 — motivo vazio → P0001 =====
  v_ok:=false; BEGIN PERFORM public.oc_limpar_operacao_teste(v_op, v_op, '   ');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T4 FAIL: motivo vazio deveria bloquear'; END IF; RAISE NOTICE 'T4 PASS';

  -- ===== T5 — liquidação ativa → P0001 =====
  INSERT INTO public.zoo_operacao_liquidacoes (cliente_id, operacao_id, data, natureza, forma, valor)
    VALUES (v_cli, v_op, DATE '2026-07-10', 'pagamento', 'dinheiro', 1000);
  v_ok:=false; BEGIN PERFORM public.oc_limpar_operacao_teste(v_op, v_op, 'T5');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T5 FAIL: liquidação ativa deveria bloquear'; END IF; RAISE NOTICE 'T5 PASS';

  -- ===== T6 — conciliação bancária ativa → P0001 =====
  f := pg_temp._lt_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true,true);
  v_op:=(f->>'op')::uuid; it:=f->'itens'->0; v_tit:=(it->>'titulo')::uuid;
  INSERT INTO public.conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado)
    VALUES (v_cli, v_extrato, v_tit, 1000);
  v_ok:=false; BEGIN PERFORM public.oc_limpar_operacao_teste(v_op, v_op, 'T6');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok:=true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T6 FAIL: conciliação ativa deveria bloquear'; END IF; RAISE NOTICE 'T6 PASS';

  -- ===== T7 — exclusão LIMPA (op simples is_teste=true) + auditoria gravada =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by,is_teste)
    VALUES (v_cli,'compra',DATE '2026-07-01','programada',true,5,'garrotes',0,0,v_fA,v_faz,v_tag,v_admin,v_admin,true) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',5,'total',20000,1) RETURNING id INTO v_lote;
  v_res := public.oc_limpar_operacao_teste(v_op, v_op, 'T7 exclusão limpa');
  IF (v_res->>'ok') <> 'true' OR (v_res->'contagens_removidas_por_tabela'->>'operacoes') <> '1'
     OR (v_res->'contagens_removidas_por_tabela'->>'lotes') <> '1' THEN RAISE EXCEPTION 'T7 FAIL: retorno'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacoes_comerciais WHERE id=v_op)
     OR EXISTS (SELECT 1 FROM public.zoo_operacao_lotes WHERE id=v_lote) THEN RAISE EXCEPTION 'T7 FAIL: op/lote nao removidos'; END IF;
  v_aid := (v_res->>'auditoria_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_exclusoes_teste WHERE id=v_aid AND operacao_id=v_op) THEN RAISE EXCEPTION 'T7 FAIL: auditoria ausente'; END IF;
  RAISE NOTICE 'T7 PASS';

  -- ===== T11 — snapshot completo (reusa auditoria de T7) =====
  IF (SELECT snapshot->'operacao'->>'id' FROM public.zoo_operacao_exclusoes_teste WHERE id=v_aid) <> v_op::text THEN RAISE EXCEPTION 'T11 FAIL: snapshot sem operacao'; END IF;
  RAISE NOTICE 'T11 PASS';

  -- ===== T8 — título financeiro EXCLUSIVO é removido (op materializada is_teste=true, título programado) =====
  f := pg_temp._lt_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true,true);
  v_op:=(f->>'op')::uuid; it:=f->'itens'->0; v_tit:=(it->>'titulo')::uuid; v_parte:=(it->>'parte')::uuid;
  IF v_tit IS NULL THEN RAISE EXCEPTION 'T8 FIXTURE: sem titulo'; END IF;
  v_res := public.oc_limpar_operacao_teste(v_op, v_op, 'T8 titulo exclusivo');
  IF (v_res->'contagens_removidas_por_tabela'->>'titulos')::int < 1 THEN RAISE EXCEPTION 'T8 FAIL: contagem titulos'; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE id=v_tit)
     OR EXISTS (SELECT 1 FROM public.zoo_operacao_partes WHERE id=v_parte)
     OR EXISTS (SELECT 1 FROM public.zoo_operacoes_comerciais WHERE id=v_op) THEN RAISE EXCEPTION 'T8 FAIL: titulo/parte/op remanescente'; END IF;
  RAISE NOTICE 'T8 PASS';

  -- ===== T9 — lançamento zootécnico EXCLUSIVO é removido =====
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by,is_teste)
    VALUES (v_cli,'compra',DATE '2026-07-02','programada',false,5,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin,true) RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_op,v_cli,'garrotes',5,'total',20000,1) RETURNING id INTO v_lote;
  PERFORM public.oc_registrar_movimentacao(v_op, v_cli, v_lote, DATE '2026-07-05', 'garrotes', 5, NULL, NULL, v_tag);
  SELECT movimentacao_id INTO v_mov FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op LIMIT 1;  -- FK → lancamentos.id (id do lançamento zoo)
  IF v_mov IS NULL OR NOT EXISTS (SELECT 1 FROM public.lancamentos WHERE id=v_mov) THEN RAISE EXCEPTION 'T9 FIXTURE: lançamento nao criado'; END IF;
  v_res := public.oc_limpar_operacao_teste(v_op, v_op, 'T9 lancamento exclusivo');
  IF (v_res->'contagens_removidas_por_tabela'->>'lancamentos')::int < 1
     OR (v_res->'contagens_removidas_por_tabela'->>'movimentacoes')::int < 1 THEN RAISE EXCEPTION 'T9 FAIL: contagens'; END IF;
  IF EXISTS (SELECT 1 FROM public.lancamentos WHERE id=v_mov)
     OR EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op)
     OR EXISTS (SELECT 1 FROM public.zoo_operacoes_comerciais WHERE id=v_op) THEN RAISE EXCEPTION 'T9 FAIL: lançamento/mov/op remanescente'; END IF;
  IF jsonb_array_length(v_res->'fazendas_afetadas') < 1 OR jsonb_array_length(v_res->'anos_afetados') < 1 THEN RAISE EXCEPTION 'T9 FAIL: fazendas/anos p/ cache'; END IF;
  RAISE NOTICE 'T9 PASS';

  -- ===== T10 — ISOLAMENTO: operação real vizinha (is_teste=false) permanece intacta =====
  f := pg_temp._lt_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],true,true);   -- A: teste
  v_op:=(f->>'op')::uuid;
  f := pg_temp._lt_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[2000]::numeric[],true,false);   -- B: real
  v_op_b:=(f->>'op')::uuid; it:=f->'itens'->0; v_tit_b:=(it->>'titulo')::uuid;
  SELECT count(*) INTO v_partes_b FROM public.zoo_operacao_partes WHERE operacao_id=v_op_b;
  PERFORM public.oc_limpar_operacao_teste(v_op, v_op, 'T10 exclui A');
  IF EXISTS (SELECT 1 FROM public.zoo_operacoes_comerciais WHERE id=v_op) THEN RAISE EXCEPTION 'T10 FAIL: A nao removida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacoes_comerciais WHERE id=v_op_b)
     OR NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE id=v_tit_b)
     OR (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id=v_op_b) <> v_partes_b THEN RAISE EXCEPTION 'T10 FAIL: op real vizinha afetada'; END IF;
  RAISE NOTICE 'T10 PASS';

  -- ===== T12 — não-admin → 42501 =====
  f := pg_temp._lt_mk(v_cli,v_admin,v_fA,v_faz,v_sub,v_tag,ARRAY[1000]::numeric[],false,true);
  v_op:=(f->>'op')::uuid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);
  v_ok:=false; BEGIN PERFORM public.oc_limpar_operacao_teste(v_op, v_op, 'T12');
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE='42501' THEN v_ok:=true; END IF; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  IF NOT v_ok THEN RAISE EXCEPTION 'T12 FAIL: nao-admin deveria receber 42501'; END IF; RAISE NOTICE 'T12 PASS';

  RAISE NOTICE 'PR-OC-LIMPEZA-HOMOLOGACAO-02: PASS (T1-T12)';
END $t$;

ROLLBACK;

-- T-final — resíduo zero após ROLLBACK (nenhuma OP sintética nem linha de auditoria persistida).
--   Auditoria isolada pela tag via snapshot (independe de motivo; não colide com limpezas reais).
SELECT (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.lt_tag'))
     + (SELECT count(*) FROM public.zoo_operacao_exclusoes_teste WHERE snapshot->'operacao'->>'observacoes' = current_setting('app.lt_tag')) AS residuo_total;
