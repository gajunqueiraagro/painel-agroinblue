-- PR-OC-EDICAO-POS-FECHAMENTO-01 — testes de oc_editar_dados_operacao.
--   Requer aplicada: 20260830120000.
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + residuo zero.
--
--   Fixture 100% SINTETICA: operacao, fornecedores, parte e titulo sao criados aqui e
--   desfeitos no rollback. Nenhum dado real e' tocado.
SELECT set_config('app.ocedf_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text;
  v_faz uuid; v_op uuid; v_op_canc uuid;
  v_forn_a uuid; v_forn_b uuid;
  v_titulo uuid; v_parte uuid;
  v_env jsonb; v_versao int; v_cnt int;
  v_data date; v_contra uuid; v_obs text; v_nf text;
  v_fav_titulo uuid; v_fav_parte uuid;
  v_erro text;
BEGIN
  v_tag := current_setting('app.ocedf_tag');

  /* ⚠ JOIN COM auth.users OBRIGATORIO. `cliente_membros` nao tem FK para `auth.users`
     e ha admin ativo apontando para usuario inexistente — medido no proto. Sem o JOIN
     o ORDER BY ... LIMIT 1 pega um orfao e a fixture morre em 23503 antes de asseverar
     qualquer coisa. Mesma armadilha do pr_p1_data_fim_01_test. */
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm
    JOIN auth.users u ON u.id = cm.user_id
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
   ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin com usuario valido em auth.users'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

  /* `codigo` e' NOT NULL sem default; `owner_id` e' exigido na pratica pelo trigger
     auto_add_owner_as_membro (grava fazenda_membros.user_id NOT NULL). */
  INSERT INTO public.fazendas (cliente_id, nome, codigo, owner_id)
    VALUES (v_cli, 'ZZ TESTE OCEDF '||v_tag, 'ZE'||left(v_tag,6), v_admin) RETURNING id INTO v_faz;

  INSERT INTO public.financeiro_fornecedores (cliente_id, nome)
    VALUES (v_cli, 'ZZ FORN A '||v_tag) RETURNING id INTO v_forn_a;
  INSERT INTO public.financeiro_fornecedores (cliente_id, nome)
    VALUES (v_cli, 'ZZ FORN B '||v_tag) RETURNING id INTO v_forn_b;

  -- Operacao FECHADA, que e' o caso que este PR existe para atender.
  INSERT INTO public.zoo_operacoes_comerciais
    (cliente_id, fazenda_id, tipo_operacao, data_operacao, cenario, contraparte_id,
     observacoes, numero_documento, status_comercial, rascunho, versao)
  VALUES
    (v_cli, v_faz, 'compra', DATE '2026-05-10', 'realizado', v_forn_a,
     'obs original', 'NF-111', 'fechada', false, 1)
  RETURNING id INTO v_op;

  /* TITULO MATERIALIZADO. Prova do ponto central da FASE 0: o favorecido do titulo
     vem do COMPROMISSO (parte), nao da contraparte da operacao. Favorecido do titulo
     e' o FORN_B de proposito — diferente da contraparte (FORN_A) — para que nenhuma
     coincidencia possa mascarar o resultado. */
  /* ⚠ Vocabulario REAL da tabela, copiado de linhas vivas — nao inventado:
     sinal '-1', tipo_operacao '2-Saidas', status_transacao 'realizado'. A flv2 nao tem
     CHECK nenhum, entao valor errado passaria calado e o teste documentaria ficcao.
     Ha 14 triggers nesta tabela; data_competencia vai preenchida porque
     trg_00_ano_mes_from_competencia deriva ano_mes dela. */
  INSERT INTO public.financeiro_lancamentos_v2
    (cliente_id, fazenda_id, valor, sinal, tipo_operacao, cenario, status_transacao,
     data_competencia, data_vencimento, favorecido_id, descricao, cancelado, sem_movimentacao_caixa)
  VALUES (v_cli, v_faz, 1000, '-1', '2-Saídas', 'realizado', 'realizado',
          DATE '2026-05-10', DATE '2026-06-10', v_forn_b, 'ZZ TITULO '||v_tag, false, false)
  RETURNING id INTO v_titulo;

  INSERT INTO public.zoo_operacao_partes
    (cliente_id, operacao_id, natureza, valor, favorecido_id, financeiro_lancamento_id, cancelada)
  VALUES (v_cli, v_op, 'principal', 1000, v_forn_b, v_titulo, false)
  RETURNING id INTO v_parte;

  -- ===================== T1 — FECHADA aceita edicao =====================
  v_env := public.oc_editar_dados_operacao(
    v_op, v_cli, jsonb_build_object('contraparte_id', v_forn_b::text, 'data_operacao', '2026-05-20'), 1);
  IF (v_env->>'ok') <> 'true' THEN RAISE EXCEPTION 'T1 FAIL: envelope sem ok=true: %', v_env; END IF;
  IF (v_env->>'versao')::int <> 2 THEN
    RAISE EXCEPTION 'T1 FAIL: versao deveria subir para 2, veio %', v_env->>'versao'; END IF;
  IF (v_env->>'status_comercial') <> 'fechada' THEN
    RAISE EXCEPTION 'T1 FAIL: status mudou para %', v_env->>'status_comercial'; END IF;

  SELECT contraparte_id, data_operacao, observacoes, numero_documento, versao
    INTO v_contra, v_data, v_obs, v_nf, v_versao
    FROM public.zoo_operacoes_comerciais WHERE id = v_op;
  IF v_contra <> v_forn_b THEN RAISE EXCEPTION 'T1 FAIL: contraparte nao gravou'; END IF;
  IF v_data <> DATE '2026-05-20' THEN RAISE EXCEPTION 'T1 FAIL: data nao gravou (%)', v_data; END IF;

  -- ===================== T2 — chave AUSENTE preserva =====================
  IF v_obs <> 'obs original' THEN RAISE EXCEPTION 'T2 FAIL: observacoes foi apagada (%)', v_obs; END IF;
  IF v_nf <> 'NF-111' THEN RAISE EXCEPTION 'T2 FAIL: numero_documento foi apagado (%)', v_nf; END IF;

  -- ===================== T3 — evento com o diff =====================
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_eventos
   WHERE operacao_id = v_op AND acao = 'editar_dados';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T3 FAIL: esperado 1 evento editar_dados, achou %', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_eventos
   WHERE operacao_id = v_op AND acao = 'editar_dados'
     AND dados_anteriores->>'contraparte_id' = v_forn_a::text
     AND dados_novos->>'contraparte_id'      = v_forn_b::text
     AND dados_anteriores->>'data_operacao'  = '2026-05-10'
     AND dados_novos->>'data_operacao'       = '2026-05-20'
     -- chave nao tocada NAO entra no diff: em fechada, o evento e' a auditoria e
     -- registrar campo intocado como se tivesse mudado seria ruido perigoso.
     AND NOT (dados_novos ? 'observacoes');
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T3 FAIL: diff do evento nao confere'; END IF;

  -- ===================== T4 — TITULO NAO MUDA DE FAVORECIDO =====================
  --   A contraparte foi de FORN_A para FORN_B em T1. O titulo (e a parte) tinham
  --   FORN_B desde o inicio e devem continuar com ele, intocados.
  SELECT favorecido_id INTO v_fav_titulo FROM public.financeiro_lancamentos_v2 WHERE id = v_titulo;
  SELECT favorecido_id INTO v_fav_parte  FROM public.zoo_operacao_partes       WHERE id = v_parte;
  IF v_fav_titulo <> v_forn_b THEN
    RAISE EXCEPTION 'T4 FAIL: favorecido do TITULO mudou para %', v_fav_titulo; END IF;
  IF v_fav_parte <> v_forn_b THEN
    RAISE EXCEPTION 'T4 FAIL: favorecido da PARTE mudou para %', v_fav_parte; END IF;

  -- ===================== T5 — chave fora da lista, NOMEADA =====================
  BEGIN
    PERFORM public.oc_editar_dados_operacao(v_op, v_cli, jsonb_build_object('fazenda_id', v_faz::text), 2);
    RAISE EXCEPTION 'T5 FAIL: fazenda_id deveria ser recusada';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF position('fazenda_id' in v_erro) = 0 THEN
      RAISE EXCEPTION 'T5 FAIL: recusou sem nomear a chave: %', v_erro; END IF;
  END;

  -- ===================== T6 — base economica recusada =====================
  BEGIN
    PERFORM public.oc_editar_dados_operacao(v_op, v_cli, jsonb_build_object('valor_acordado', 999), 2);
    RAISE EXCEPTION 'T6 FAIL: valor_acordado deveria ser recusado';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF position('valor_acordado' in v_erro) = 0 THEN
      RAISE EXCEPTION 'T6 FAIL: recusou sem nomear a chave: %', v_erro; END IF;
  END;

  -- ===================== T7 — versao errada =====================
  BEGIN
    PERFORM public.oc_editar_dados_operacao(v_op, v_cli, jsonb_build_object('observacoes','x'), 99);
    RAISE EXCEPTION 'T7 FAIL: versao errada deveria estourar';
  EXCEPTION WHEN sqlstate '40001' THEN NULL;
  END;

  -- ===================== T8 — cancelada e imutavel =====================
  INSERT INTO public.zoo_operacoes_comerciais
    (cliente_id, fazenda_id, tipo_operacao, data_operacao, cenario, contraparte_id, status_comercial, rascunho, versao)
  VALUES (v_cli, v_faz, 'compra', DATE '2026-05-10', 'realizado', v_forn_a, 'cancelada', false, 1)
  RETURNING id INTO v_op_canc;
  BEGIN
    PERFORM public.oc_editar_dados_operacao(v_op_canc, v_cli, jsonb_build_object('observacoes','x'), 1);
    RAISE EXCEPTION 'T8 FAIL: cancelada deveria recusar';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF position('cancelada' in v_erro) = 0 THEN
      RAISE EXCEPTION 'T8 FAIL: mensagem inesperada: %', v_erro; END IF;
  END;

  -- ===================== T9 — data vazia recusada com sentido =====================
  --   Sem este guard viria 23502 cru do banco, ilegivel na tela.
  BEGIN
    PERFORM public.oc_editar_dados_operacao(v_op, v_cli, jsonb_build_object('data_operacao',''), 2);
    RAISE EXCEPTION 'T9 FAIL: data vazia deveria recusar';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL;
  END;

  -- ===================== T10 — nao encontrada =====================
  BEGIN
    PERFORM public.oc_editar_dados_operacao(gen_random_uuid(), v_cli, jsonb_build_object('observacoes','x'), 1);
    RAISE EXCEPTION 'T10 FAIL: operacao inexistente deveria estourar P0002';
  EXCEPTION WHEN sqlstate 'P0002' THEN NULL;
  END;

  -- ===================== T11 — nenhuma recusa deixou efeito =====================
  --   T5..T9 estouraram DENTRO de blocos EXCEPTION, que fazem rollback ao savepoint
  --   implicito. A versao tem de continuar em 2 e o evento continuar unico.
  SELECT versao INTO v_versao FROM public.zoo_operacoes_comerciais WHERE id = v_op;
  IF v_versao <> 2 THEN RAISE EXCEPTION 'T11 FAIL: versao vazou para % apos as recusas', v_versao; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_eventos
   WHERE operacao_id = v_op AND acao = 'editar_dados';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T11 FAIL: % eventos apos as recusas', v_cnt; END IF;

  RAISE NOTICE 'PR-OC-EDICAO-POS-FECHAMENTO-01: T1..T11 PASS';
END $t$;

ROLLBACK;
