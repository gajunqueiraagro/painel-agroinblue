-- PR-OC-PESO-OBRIGATORIO-01 — testes do peso obrigatorio em oc_salvar_lotes.
--   Requer aplicada: 20260831120000.
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + residuo zero.
--
--   Fixture 100% SINTETICA. Nenhuma operacao real e' tocada.
SELECT set_config('app.ocpeso_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text;
  v_faz uuid; v_op uuid; v_op_receb uuid;
  v_forn uuid; v_mov uuid; v_lote_id uuid;
  v_env jsonb; v_cnt int; v_erro text;
  v_lote_ok jsonb; v_versao int;
BEGIN
  v_tag := current_setting('app.ocpeso_tag');

  /* ⚠ JOIN COM auth.users OBRIGATORIO — `cliente_membros` nao tem FK para `auth.users`
     e ha admin ativo apontando para usuario inexistente (medido no proto). Sem o JOIN
     a fixture morre em 23503 antes de asseverar qualquer coisa. */
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm
    JOIN auth.users u ON u.id = cm.user_id
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
   ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin com usuario valido em auth.users'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

  INSERT INTO public.fazendas (cliente_id, nome, codigo, owner_id)
    VALUES (v_cli, 'ZZ TESTE PESO '||v_tag, 'ZP'||left(v_tag,6), v_admin) RETURNING id INTO v_faz;
  INSERT INTO public.financeiro_fornecedores (cliente_id, nome)
    VALUES (v_cli, 'ZZ FORN PESO '||v_tag) RETURNING id INTO v_forn;

  INSERT INTO public.zoo_operacoes_comerciais
    (cliente_id, fazenda_id, tipo_operacao, data_operacao, cenario, contraparte_id, status_comercial, rascunho, versao)
  VALUES (v_cli, v_faz, 'compra', DATE '2026-05-10', 'realizado', v_forn, 'programada', true, 1)
  RETURNING id INTO v_op;

  v_lote_ok := jsonb_build_object(
    'ordem', 1, 'categoria_negociada', 'garrotes', 'qtd_negociada', 10,
    'peso_medio_negociado_kg', 200, 'criterio_valor', 'kg', 'valor_informado', 14.5);

  -- ===================== T1 — peso valido SALVA =====================
  v_env := public.oc_salvar_lotes(v_op, v_cli, 1, jsonb_build_array(v_lote_ok));
  IF (v_env->>'ok') <> 'true' THEN RAISE EXCEPTION 'T1 FAIL: envelope sem ok: %', v_env; END IF;
  IF (v_env->>'lotes')::int <> 1 THEN RAISE EXCEPTION 'T1 FAIL: esperado 1 lote, veio %', v_env->>'lotes'; END IF;
  v_versao := (v_env->>'versao')::int;
  IF v_versao <> 2 THEN RAISE EXCEPTION 'T1 FAIL: versao deveria ser 2, veio %', v_versao; END IF;

  -- ===================== T2 — peso AUSENTE (chave nem vem) =====================
  --   Este e' o caso NOVO: ate a migration, chave ausente passava batida.
  BEGIN
    PERFORM public.oc_salvar_lotes(v_op, v_cli, v_versao, jsonb_build_array(
      jsonb_build_object('ordem', 1, 'categoria_negociada', 'garrotes', 'qtd_negociada', 10,
                         'criterio_valor', 'cabeca', 'valor_informado', 2500)));
    RAISE EXCEPTION 'T2 FAIL: peso ausente deveria ser recusado';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF position('garrotes' in v_erro) = 0 THEN
      RAISE EXCEPTION 'T2 FAIL: recusou sem NOMEAR o lote: %', v_erro; END IF;
  END;

  -- ===================== T3 — peso NULL explicito =====================
  BEGIN
    PERFORM public.oc_salvar_lotes(v_op, v_cli, v_versao, jsonb_build_array(
      v_lote_ok || jsonb_build_object('peso_medio_negociado_kg', NULL)));
    RAISE EXCEPTION 'T3 FAIL: peso NULL deveria ser recusado';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL;
  END;

  -- ===================== T4 — peso ZERO =====================
  BEGIN
    PERFORM public.oc_salvar_lotes(v_op, v_cli, v_versao, jsonb_build_array(
      v_lote_ok || jsonb_build_object('peso_medio_negociado_kg', 0)));
    RAISE EXCEPTION 'T4 FAIL: peso zero deveria ser recusado';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL;
  END;

  -- ===================== T5 — peso NEGATIVO =====================
  BEGIN
    PERFORM public.oc_salvar_lotes(v_op, v_cli, v_versao, jsonb_build_array(
      v_lote_ok || jsonb_build_object('peso_medio_negociado_kg', -5)));
    RAISE EXCEPTION 'T5 FAIL: peso negativo deveria ser recusado';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL;
  END;

  -- ===================== T6 — VALIDO + INVALIDO: nada e salvo =====================
  --   A recusa e' da operacao inteira. O laco varre todo o payload e estoura ANTES
  --   de qualquer DELETE/INSERT, entao o lote 1 (que ja existia de T1) tem de
  --   continuar la, intacto, e o lote 2 nao pode ter entrado.
  BEGIN
    PERFORM public.oc_salvar_lotes(v_op, v_cli, v_versao, jsonb_build_array(
      v_lote_ok,
      jsonb_build_object('ordem', 2, 'categoria_negociada', 'novilhas', 'qtd_negociada', 5,
                         'criterio_valor', 'kg', 'valor_informado', 15)));
    RAISE EXCEPTION 'T6 FAIL: lote 2 sem peso deveria derrubar a chamada inteira';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF position('novilhas' in v_erro) = 0 THEN
      RAISE EXCEPTION 'T6 FAIL: deveria nomear o lote INVALIDO (novilhas): %', v_erro; END IF;
  END;

  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_lotes WHERE operacao_id = v_op;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T6 FAIL: gravacao PARCIAL — % lotes na tabela (esperado 1)', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_lotes
   WHERE operacao_id = v_op AND ordem = 1 AND peso_medio_negociado_kg = 200;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T6 FAIL: o lote valido de T1 foi alterado pela chamada recusada'; END IF;

  -- ===================== T7 — CAMINHO B (com recebimento) tambem recusa =====================
  --   O laco de validacao roda ANTES da bifurcacao `IF v_tem_receb`, entao o caminho
  --   de correcao de valor precisa recusar igual. Prova disso aqui.
  INSERT INTO public.zoo_operacoes_comerciais
    (cliente_id, fazenda_id, tipo_operacao, data_operacao, cenario, contraparte_id, status_comercial, rascunho, versao)
  VALUES (v_cli, v_faz, 'compra', DATE '2026-05-10', 'realizado', v_forn, 'programada', true, 1)
  RETURNING id INTO v_op_receb;
  PERFORM public.oc_salvar_lotes(v_op_receb, v_cli, 1, jsonb_build_array(v_lote_ok));

  /* Movimentacao de recebimento SINTETICA, so para `v_tem_receb` enxergar recebimento
     e a funcao tomar o CAMINHO B.
     ⚠ `movimentacao_id` NAO tem FK (medido 28/08), entao um uuid qualquer serve — mas
     `operacao_lote_id` e' NOT NULL SEM DEFAULT (conferido no schema antes de escrever),
     e omiti-lo mataria a fixture em 23502. Vai o lote REAL que acabou de ser gravado. */
  SELECT id INTO v_lote_id FROM public.zoo_operacao_lotes WHERE operacao_id = v_op_receb AND ordem = 1;
  IF v_lote_id IS NULL THEN RAISE EXCEPTION 'fixture: lote de v_op_receb nao foi gravado'; END IF;
  INSERT INTO public.zoo_operacao_movimentacoes (cliente_id, operacao_id, movimentacao_id, operacao_lote_id)
    VALUES (v_cli, v_op_receb, gen_random_uuid(), v_lote_id) RETURNING id INTO v_mov;

  BEGIN
    PERFORM public.oc_salvar_lotes(v_op_receb, v_cli, 2, jsonb_build_array(
      v_lote_ok || jsonb_build_object('peso_medio_negociado_kg', 0)));
    RAISE EXCEPTION 'T7 FAIL: caminho com recebimento deveria recusar peso zero';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    -- Tem de morrer no PESO, nao no guard de "nao pode mudar o fisico": o laco de
    -- validacao vem antes. Se a mensagem falar de recebimento, a ordem esta errada.
    IF position('peso' in lower(v_erro)) = 0 THEN
      RAISE EXCEPTION 'T7 FAIL: recusou por outro motivo que nao o peso: %', v_erro; END IF;
  END;

  -- ===================== T8 — nada vazou das recusas =====================
  SELECT versao INTO v_versao FROM public.zoo_operacoes_comerciais WHERE id = v_op;
  IF v_versao <> 2 THEN RAISE EXCEPTION 'T8 FAIL: versao vazou para % apos as recusas', v_versao; END IF;

  RAISE NOTICE 'PR-OC-PESO-OBRIGATORIO-01: T1..T8 PASS';
END $t$;

ROLLBACK;
