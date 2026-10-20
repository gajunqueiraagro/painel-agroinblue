-- CRIAR-DO-EXTRATO-01 · PARTE C — as três funções que podiam gravar vencimento nulo (20261028100600).
--
-- Roda como `postgres`, numa transacao que TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Qualquer outra excecao e' falha e diz qual prova caiu.
--
-- D1  fn_reconciliar_parcela_financiamento: o ajuste do vencimento nunca grava nulo — valor novo vazio mantem o da linha, depois a
--     data da parcela, depois a competencia; e NENHUM `SET data_vencimento = NULLIF(` sobra na funcao (a mutacao que derruba).
-- D2  fn_extrato_desfazer_arquivo: vivo restaura com foto > pagamento > competencia; cancelado restaura como estava.
-- D3  _fn_lancamento_programado_gravar, CHAMADA DE VERDADE: criar sem vencimento e atualizar com vencimento vazio sao RECUSADOS com
--     "Informe o vencimento."; atualizar com vencimento grava; atualizar sem a chave do vencimento nao o toca.

DO $teste$
DECLARE v_ok text := ''; v_def text; v_msg text; v_id uuid; v_venc date; v_cli uuid; v_faz uuid; v_plano uuid; v_forn uuid;
BEGIN
  -- D1
  v_def := pg_get_functiondef('public.fn_reconciliar_parcela_financiamento(uuid, boolean, boolean, uuid)'::regprocedure);
  IF v_def ~* 'set\s+data_vencimento\s*=\s*nullif\(' THEN
    RAISE EXCEPTION 'D1 a reconciliacao da parcela ainda grava data_vencimento = NULLIF(...) (pode gravar nulo)'; END IF;
  IF position('SET data_vencimento = COALESCE(NULLIF(v_depois,'''')::date, data_vencimento, v_parcela.data_vencimento, data_competencia),' in v_def) = 0 THEN
    RAISE EXCEPTION 'D1 a reconciliacao da parcela nao cai em vencimento da linha > data da parcela > competencia'; END IF;
  v_ok := v_ok || 'D1 ok (reconciliar: valor vazio mantem o da linha > parcela > competencia); ';

  -- D2
  v_def := pg_get_functiondef('public.fn_extrato_desfazer_arquivo(uuid, text, boolean)'::regprocedure);
  IF position('data_vencimento = CASE WHEN COALESCE(cancelado, false) THEN (v_aud->>''data_vencimento'')::date' in v_def) = 0
     OR position('ELSE COALESCE((v_aud->>''data_vencimento'')::date, (v_aud->>''data_pagamento'')::date, (v_aud->>''data_competencia'')::date, data_competencia) END,' in v_def) = 0 THEN
    RAISE EXCEPTION 'D2 o desfazer do arquivo restaura vencimento nulo em lancamento vivo'; END IF;
  IF v_def ~ 'data_vencimento = \(v_aud->>''data_vencimento''\)::date,' THEN
    RAISE EXCEPTION 'D2 sobrou a restauracao crua do vencimento'; END IF;
  v_ok := v_ok || 'D2 ok (desfazer: vivo foto > pagamento > competencia; cancelado como estava); ';

  -- D3: criar sem vencimento
  SELECT l.cliente_id, l.fazenda_id, l.plano_conta_id, l.favorecido_id INTO v_cli, v_faz, v_plano, v_forn
    FROM public.financeiro_lancamentos_v2 l
   WHERE NOT coalesce(l.cancelado, false) AND l.plano_conta_id IS NOT NULL AND l.favorecido_id IS NOT NULL ORDER BY l.created_at DESC LIMIT 1;
  BEGIN
    PERFORM public._fn_lancamento_programado_gravar('criar', NULL, jsonb_build_object('cliente_id', v_cli, 'fazenda_id', v_faz,
      'tipo_operacao', '2-Saídas', 'data_competencia', current_date, 'valor', 10, 'plano_conta_id', v_plano, 'favorecido_id', v_forn));
    RAISE EXCEPTION 'D3 criar sem vencimento PASSOU';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'Informe o vencimento.' THEN RAISE EXCEPTION 'D3 criar sem vencimento: recusa com outra frase (%)', v_msg; END IF;
  END;
  -- criar com vencimento grava; atualizar vazio recusa; atualizar com data grava; atualizar sem a chave nao toca
  v_id := public._fn_lancamento_programado_gravar('criar', NULL, jsonb_build_object('cliente_id', v_cli, 'fazenda_id', v_faz,
      'tipo_operacao', '2-Saídas', 'data_competencia', current_date, 'data_vencimento', current_date + 10, 'valor', 10,
      'plano_conta_id', v_plano, 'favorecido_id', v_forn));
  BEGIN
    PERFORM public._fn_lancamento_programado_gravar('atualizar', v_id, jsonb_build_object('data_vencimento', ''));
    RAISE EXCEPTION 'D3 atualizar com vencimento vazio PASSOU';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'Informe o vencimento.' THEN RAISE EXCEPTION 'D3 atualizar vazio: recusa com outra frase (%)', v_msg; END IF;
  END;
  PERFORM public._fn_lancamento_programado_gravar('atualizar', v_id, jsonb_build_object('data_vencimento', (current_date + 20)::text));
  PERFORM public._fn_lancamento_programado_gravar('atualizar', v_id, jsonb_build_object('valor', 11));
  SELECT data_vencimento INTO v_venc FROM public.financeiro_lancamentos_v2 WHERE id = v_id;
  IF v_venc IS DISTINCT FROM current_date + 20 THEN RAISE EXCEPTION 'D3 vencimento depois dos updates: % (esperado %)', v_venc, current_date + 20; END IF;
  v_ok := v_ok || 'D3 ok (Lucro Rural: sem vencimento recusa com "Informe o vencimento."; com vencimento grava); ';

  RAISE EXCEPTION 'OK — %', v_ok;
END
$teste$;
