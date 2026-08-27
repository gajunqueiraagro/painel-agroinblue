-- PR-OC-LOTE-VALOR-01 — Testes dos DOIS CAMINHOS de `oc_salvar_lotes`.
-- Roda em BEGIN...ROLLBACK: NADA persiste. Requer a migration 20260828120000.
-- Contexto de auth simulado (admin real), como os demais testes pr_oc_*.
--
-- O que se prova, em ordem:
--   C1  sem recebimento: DELETE+INSERT segue funcionando (caminho A intacto)
--   C2  com recebimento, so valor mudou: PASSA e os IDS DOS LOTES SAO OS MESMOS
--   C3  com recebimento, quantidade mudou: P0001
--   C4  com recebimento, categoria mudou: P0001
--   C5  com recebimento, peso mudou: P0001  (o caso que `<>` deixaria passar)
--   C6  com recebimento, lote a mais no payload: P0001
--   C7  valor_acordado recalculado corretamente no caminho B

SELECT set_config('app.oclv_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_faz uuid; v_forn uuid;
  v_op uuid; v_res jsonb; v_v int;
  v_id1 uuid; v_id2 uuid; v_id1_depois uuid; v_id2_depois uuid;
  v_erro text; v_n int; v_val numeric;
  v_lotes jsonb;
BEGIN
  ---------------------------------------------------------------- fixture
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=cm.user_id)
     AND EXISTS (SELECT 1 FROM public.fazendas f WHERE f.cliente_id=cm.cliente_id)
     AND EXISTS (SELECT 1 FROM public.financeiro_fornecedores f WHERE f.cliente_id=cm.cliente_id)
   ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin com fazenda+fornecedor'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  SELECT id INTO v_faz  FROM public.fazendas               WHERE cliente_id=v_cli ORDER BY id LIMIT 1;
  SELECT id INTO v_forn FROM public.financeiro_fornecedores WHERE cliente_id=v_cli AND ativo=true ORDER BY id LIMIT 1;

  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
    'tipo_operacao','compra', 'fazenda_id', v_faz, 'contraparte_id', v_forn,
    'data_operacao', CURRENT_DATE, 'cenario','realizado'));
  v_op := (v_res->>'operacao_id')::uuid;
  v_v  := (v_res->>'versao')::int;

  ---------------------------------------------------------------- C1 · caminho A
  v_lotes := jsonb_build_array(
    jsonb_build_object('ordem',1,'categoria_negociada','desmama_f','qtd_negociada',10,
                       'peso_medio_negociado_kg',200,'criterio_valor','kg','valor_informado',12),
    jsonb_build_object('ordem',2,'categoria_negociada','novilhas','qtd_negociada',5,
                       'peso_medio_negociado_kg',300,'criterio_valor','kg','valor_informado',13));
  v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, v_lotes);
  v_v := (v_res->>'versao')::int;
  IF (v_res->>'lotes')::int <> 2 THEN RAISE EXCEPTION 'C1 FALHOU: esperava 2 lotes, veio %', v_res->>'lotes'; END IF;
  RAISE NOTICE 'C1 OK — caminho A grava 2 lotes, valor_acordado=%', v_res->>'valor_acordado';

  SELECT id INTO v_id1 FROM public.zoo_operacao_lotes WHERE operacao_id=v_op AND ordem=1;
  SELECT id INTO v_id2 FROM public.zoo_operacao_lotes WHERE operacao_id=v_op AND ordem=2;

  -- caminho A de novo: prova que os ids TROCAM quando nao ha recebimento
  v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, v_lotes);
  v_v := (v_res->>'versao')::int;
  IF (SELECT id FROM public.zoo_operacao_lotes WHERE operacao_id=v_op AND ordem=1) = v_id1 THEN
    RAISE EXCEPTION 'C1 FALHOU: caminho A deveria reinserir com id novo';
  END IF;
  RAISE NOTICE 'C1 OK — caminho A reinsere com ids novos (DELETE+INSERT preservado)';

  SELECT id INTO v_id1 FROM public.zoo_operacao_lotes WHERE operacao_id=v_op AND ordem=1;
  SELECT id INTO v_id2 FROM public.zoo_operacao_lotes WHERE operacao_id=v_op AND ordem=2;

  ---------------------------------------------------------------- cria recebimento
  v_res := public.oc_confirmar(v_op, v_cli, v_v);
  v_v := (v_res->>'versao')::int;
  /* ⚠ NOVE argumentos POSICIONAIS, nao jsonb — assinatura lida de
     `pg_get_function_identity_arguments`, nao de memoria:
       p_operacao_id, p_cliente_id, p_lote_id, p_data, p_categoria,
       p_quantidade, p_peso_medio_kg, p_peso_total_kg, p_observacao
     Nao ha overload que aceite jsonb; a primeira versao deste teste inventou um
     e morreu com 42883 antes do primeiro caso.
     ⚠ A ORDEM DA FIXTURE vem dos guards da propria RPC: ela recusa rascunho
     (tecnico ou legado), entao `oc_confirmar` tem de vir antes; e recusa entrega
     encerrada, entao `oc_reabrir` tem de vir depois. Nao e' cerimonia.
     ⚠ `peso_total` = 10 x 200 = 2000, coerente com o medio, para nao depender de
     a funcao derivar um a partir do outro. */
  PERFORM public.oc_registrar_movimentacao(
    v_op, v_cli, v_id1, CURRENT_DATE, 'desmama_f', 10, 200::numeric, 2000::numeric, 'fixture');
  SELECT versao INTO v_v FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  v_res := public.oc_reabrir(v_op, v_cli, v_v, 'teste');
  v_v := (v_res->>'versao')::int;
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op) THEN
    RAISE EXCEPTION 'fixture: recebimento nao foi registrado';
  END IF;
  RAISE NOTICE 'fixture OK — recebimento ativo, operacao reaberta';

  ---------------------------------------------------------------- C2 · so valor
  v_res := public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
    jsonb_build_object('ordem',1,'categoria_negociada','desmama_f','qtd_negociada',10,
                       'peso_medio_negociado_kg',200,'criterio_valor','kg','valor_informado',15),
    jsonb_build_object('ordem',2,'categoria_negociada','novilhas','qtd_negociada',5,
                       'peso_medio_negociado_kg',300,'criterio_valor','kg','valor_informado',13)));
  v_v := (v_res->>'versao')::int;
  SELECT id INTO v_id1_depois FROM public.zoo_operacao_lotes WHERE operacao_id=v_op AND ordem=1;
  SELECT id INTO v_id2_depois FROM public.zoo_operacao_lotes WHERE operacao_id=v_op AND ordem=2;
  IF v_id1_depois <> v_id1 OR v_id2_depois <> v_id2 THEN
    RAISE EXCEPTION 'C2 FALHOU: ids mudaram no caminho B (% -> %)', v_id1, v_id1_depois;
  END IF;
  IF (SELECT valor_informado FROM public.zoo_operacao_lotes WHERE operacao_id=v_op AND ordem=1) <> 15 THEN
    RAISE EXCEPTION 'C2 FALHOU: valor nao foi atualizado';
  END IF;
  RAISE NOTICE 'C2 OK — caminho B atualiza valor e PRESERVA os ids';

  ---------------------------------------------------------------- C7 · recalculo
  v_val := (v_res->>'valor_acordado')::numeric;
  -- `_oc_valor_do_lote` com criterio 'kg' faz qtd x peso_medio x valor_informado
  -- (lido da funcao no banco, nao suposto):
  --   10 cab x 200 kg x 15 = 30000 · 5 cab x 300 kg x 13 = 19500 · total 49500
  IF v_val IS DISTINCT FROM 49500 THEN
    RAISE EXCEPTION 'C7 FALHOU: valor_acordado esperado 49500, veio %', v_val;
  END IF;
  RAISE NOTICE 'C7 OK — valor_acordado recalculado no caminho B: %', v_val;

  ---------------------------------------------------------------- C3 · quantidade
  BEGIN
    PERFORM public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
      jsonb_build_object('ordem',1,'categoria_negociada','desmama_f','qtd_negociada',11,
                         'peso_medio_negociado_kg',200,'criterio_valor','kg','valor_informado',15),
      jsonb_build_object('ordem',2,'categoria_negociada','novilhas','qtd_negociada',5,
                         'peso_medio_negociado_kg',300,'criterio_valor','kg','valor_informado',13)));
    RAISE EXCEPTION 'C3 FALHOU: mudanca de quantidade deveria ter sido recusada';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF v_erro NOT LIKE '%quantidade e peso nao podem mudar%' THEN RAISE EXCEPTION 'C3 FALHOU: mensagem inesperada: %', v_erro; END IF;
    RAISE NOTICE 'C3 OK — quantidade recusada';
  END;

  ---------------------------------------------------------------- C4 · categoria
  BEGIN
    PERFORM public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
      jsonb_build_object('ordem',1,'categoria_negociada','novilhas','qtd_negociada',10,
                         'peso_medio_negociado_kg',200,'criterio_valor','kg','valor_informado',15),
      jsonb_build_object('ordem',2,'categoria_negociada','novilhas','qtd_negociada',5,
                         'peso_medio_negociado_kg',300,'criterio_valor','kg','valor_informado',13)));
    RAISE EXCEPTION 'C4 FALHOU: mudanca de categoria deveria ter sido recusada';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'C4 OK — categoria recusada';
  END;

  ---------------------------------------------------------------- C5 · peso
  BEGIN
    PERFORM public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
      jsonb_build_object('ordem',1,'categoria_negociada','desmama_f','qtd_negociada',10,
                         'peso_medio_negociado_kg',210,'criterio_valor','kg','valor_informado',15),
      jsonb_build_object('ordem',2,'categoria_negociada','novilhas','qtd_negociada',5,
                         'peso_medio_negociado_kg',300,'criterio_valor','kg','valor_informado',13)));
    RAISE EXCEPTION 'C5 FALHOU: mudanca de peso deveria ter sido recusada';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'C5 OK — peso recusado';
  END;

  ---------------------------------------------------------------- C6 · lote a mais
  BEGIN
    PERFORM public.oc_salvar_lotes(v_op, v_cli, v_v, jsonb_build_array(
      jsonb_build_object('ordem',1,'categoria_negociada','desmama_f','qtd_negociada',10,
                         'peso_medio_negociado_kg',200,'criterio_valor','kg','valor_informado',15),
      jsonb_build_object('ordem',2,'categoria_negociada','novilhas','qtd_negociada',5,
                         'peso_medio_negociado_kg',300,'criterio_valor','kg','valor_informado',13),
      jsonb_build_object('ordem',3,'categoria_negociada','vacas','qtd_negociada',2,
                         'peso_medio_negociado_kg',400,'criterio_valor','kg','valor_informado',14)));
    RAISE EXCEPTION 'C6 FALHOU: lote a mais deveria ter sido recusado';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF v_erro NOT LIKE '%adicionar ou remover lotes%' THEN RAISE EXCEPTION 'C6 FALHOU: mensagem inesperada: %', v_erro; END IF;
    RAISE NOTICE 'C6 OK — lote a mais recusado';
  END;

  ---------------------------------------------------------------- fisico intacto
  SELECT count(*) INTO v_n FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_op;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHOU: movimentacao de recebimento foi alterada (n=%)', v_n; END IF;
  RAISE NOTICE 'OK — a movimentacao de rebanho permaneceu intacta em todos os casos';

  RAISE NOTICE 'PR-OC-LOTE-VALOR-01: 7/7 PASSOU';
END
$t$;

ROLLBACK;
