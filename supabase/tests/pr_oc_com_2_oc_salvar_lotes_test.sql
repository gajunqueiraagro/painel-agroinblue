-- PR-OC-COM-2 — testes da RPC oc_salvar_lotes.
--   BEGIN...ROLLBACK + sentinela de resíduo. Requer COM-1 (tabela) e COM-2 (RPC) aplicadas.
--   Sentinelas: P0001 (validação/guarda) · 40001 (versão) · P0002 (não encontrada).
SELECT set_config('app.ocsl_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_op uuid; v_v int; v_res jsonb;
  v_movs_antes bigint; v_lanc_antes bigint;
BEGIN
  v_tag := current_setting('app.ocsl_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  SELECT count(*) INTO v_movs_antes FROM public.zoo_operacao_movimentacoes;
  SELECT count(*) INTO v_lanc_antes FROM public.lancamentos;

  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-08-01',v_tag,v_admin,v_admin) RETURNING id, versao INTO v_op, v_v;

  -- P1: salvar 2 lotes
  v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
    jsonb_build_object('ordem',1,'categoria_negociada','novilhas','qtd_negociada',20,'peso_medio_negociado_kg',235.5,'criterio_valor','kg','valor_informado',12.50),
    jsonb_build_object('ordem',2,'categoria_negociada','vacas','qtd_negociada',10,'criterio_valor','cabeca','valor_informado',3850.00)));
  IF (v_res->>'lotes')::int <> 2 THEN RAISE EXCEPTION 'P1 FAIL lotes=%', v_res->>'lotes'; END IF;
  IF (SELECT count(*) FROM public.zoo_operacao_lotes WHERE operacao_id=v_op) <> 2 THEN RAISE EXCEPTION 'P1 FAIL rows'; END IF;
  IF (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_op) <> v_v+1 THEN RAISE EXCEPTION 'P1 FAIL versao'; END IF;
  v_v := (v_res->>'versao')::int;
  RAISE NOTICE 'P1 PASS: 2 lotes, versao=%', v_v;

  -- P2: SUBSTITUIR por 1 lote (replace) -> resta só 1
  v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
    jsonb_build_object('ordem',1,'categoria_negociada','bezerros','qtd_negociada',5,'criterio_valor','total','valor_informado',9000.00)));
  IF (SELECT count(*) FROM public.zoo_operacao_lotes WHERE operacao_id=v_op) <> 1 THEN RAISE EXCEPTION 'P2 FAIL replace'; END IF;
  IF (SELECT criterio_valor FROM public.zoo_operacao_lotes WHERE operacao_id=v_op) <> 'total' THEN RAISE EXCEPTION 'P2 FAIL conteudo'; END IF;
  v_v := (v_res->>'versao')::int;
  RAISE NOTICE 'P2 PASS: replace para 1 lote';

  -- P3: array vazio -> 0 lotes
  v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, '[]'::jsonb);
  IF (SELECT count(*) FROM public.zoo_operacao_lotes WHERE operacao_id=v_op) <> 0 THEN RAISE EXCEPTION 'P3 FAIL nao esvaziou'; END IF;
  v_v := (v_res->>'versao')::int;
  RAISE NOTICE 'P3 PASS: replace vazio';

  -- N1: versão errada -> 40001
  BEGIN v_res := public.oc_salvar_lotes(v_op, v_cli, v_v-1, '[]'::jsonb);
    RAISE EXCEPTION 'N1 FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'40001' THEN RAISE EXCEPTION 'N1 %',SQLSTATE; END IF; END;
  RAISE NOTICE 'N1 PASS: lock de versão';

  -- N2: ordem duplicada no payload -> P0001
  BEGIN v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
      jsonb_build_object('ordem',1), jsonb_build_object('ordem',1)));
    RAISE EXCEPTION 'N2 FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'N2 %',SQLSTATE; END IF; END;
  RAISE NOTICE 'N2 PASS: ordem duplicada';

  -- N3: critério inválido -> P0001
  BEGIN v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
      jsonb_build_object('ordem',1,'criterio_valor','arroba')));
    RAISE EXCEPTION 'N3 FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'N3 %',SQLSTATE; END IF; END;
  RAISE NOTICE 'N3 PASS: critério inválido';

  -- N4: qtd <= 0 -> P0001
  BEGIN v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
      jsonb_build_object('ordem',1,'qtd_negociada',0)));
    RAISE EXCEPTION 'N4 FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'N4 %',SQLSTATE; END IF; END;
  RAISE NOTICE 'N4 PASS: qtd>0';

  -- N5: peso <= 0 -> P0001
  BEGIN v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
      jsonb_build_object('ordem',1,'peso_medio_negociado_kg',0)));
    RAISE EXCEPTION 'N5 FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'N5 %',SQLSTATE; END IF; END;
  RAISE NOTICE 'N5 PASS: peso>0';

  -- N6: valor negativo -> P0001
  BEGIN v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
      jsonb_build_object('ordem',1,'valor_informado',-1)));
    RAISE EXCEPTION 'N6 FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'N6 %',SQLSTATE; END IF; END;
  RAISE NOTICE 'N6 PASS: valor>=0';

  -- N7: operação inexistente -> P0002
  BEGIN v_res := public.oc_salvar_lotes(gen_random_uuid(), v_cli, 1, '[]'::jsonb);
    RAISE EXCEPTION 'N7 FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0002' THEN RAISE EXCEPTION 'N7 %',SQLSTATE; END IF; END;
  RAISE NOTICE 'N7 PASS: operação inexistente';

  -- N8: operação cancelada -> P0001
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='cancelada' WHERE id=v_op;
  BEGIN v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, '[]'::jsonb);
    RAISE EXCEPTION 'N8 FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'N8 %',SQLSTATE; END IF; END;
  RAISE NOTICE 'N8 PASS: cancelada bloqueia';

  -- N9: operação fechada -> P0001
  UPDATE public.zoo_operacoes_comerciais SET status_comercial='fechada' WHERE id=v_op;
  BEGIN v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, '[]'::jsonb);
    RAISE EXCEPTION 'N9 FAIL'; EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'N9 %',SQLSTATE; END IF; END;
  RAISE NOTICE 'N9 PASS: fechada bloqueia';

  -- R1: nenhum lancamento/movimentação criado pela RPC
  IF (SELECT count(*) FROM public.zoo_operacao_movimentacoes) <> v_movs_antes THEN RAISE EXCEPTION 'R1 FAIL movimentacoes'; END IF;
  IF (SELECT count(*) FROM public.lancamentos) <> v_lanc_antes THEN RAISE EXCEPTION 'R1 FAIL lancamentos'; END IF;
  RAISE NOTICE 'R1 PASS: sem físico (0 lancamentos/movimentacoes)';

  -- R2: evento salvar_lotes registrado
  IF (SELECT count(*) FROM public.zoo_operacao_eventos WHERE operacao_id=v_op AND acao='salvar_lotes') < 1 THEN RAISE EXCEPTION 'R2 FAIL evento'; END IF;
  RAISE NOTICE 'R2 PASS: evento salvar_lotes';

  RAISE NOTICE 'PR-OC-COM-2: P1..P3 + N1..N9 + R1..R2 OK';
END $t$;

ROLLBACK;

-- Resíduo zero
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes=current_setting('app.ocsl_tag'))
       + (SELECT count(*) FROM public.zoo_operacao_lotes l JOIN public.zoo_operacoes_comerciais o ON o.id=l.operacao_id
            WHERE o.observacoes=current_setting('app.ocsl_tag')) INTO v_leak;
  IF v_leak <> 0 THEN RAISE EXCEPTION 'RESIDUO FAIL: %', v_leak; END IF;
  RAISE NOTICE 'RESIDUO ZERO PASS';
END $post$;

SELECT set_config('app.ocsl_tag', '', false) AS run_tag_reset;
