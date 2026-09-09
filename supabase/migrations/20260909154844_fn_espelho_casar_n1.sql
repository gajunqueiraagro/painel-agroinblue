CREATE OR REPLACE FUNCTION public.fn_espelho_casar_n1(p_lancamento_id uuid, p_extratos uuid[], p_simular boolean DEFAULT true, p_motivo text DEFAULT 'casado_no_espelho_n1'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lan record; v_ext record; v_uid uuid := auth.uid(); v_agora timestamptz := now();
  v_soma numeric := 0; v_n int := 0; v_conta uuid; v_data date; v_grupo uuid := gen_random_uuid();
  v_eid uuid; v_ids uuid[] := '{}';
BEGIN
  SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF v_lan.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_nao_encontrado'); END IF;
  IF COALESCE(v_lan.cancelado,false) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_cancelado'); END IF;
  IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens WHERE lancamento_id = p_lancamento_id AND desfeito_em IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_conciliado');
  END IF;
  IF p_extratos IS NULL OR cardinality(p_extratos) < 2 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'minimo_dois_extratos'); END IF;

  FOREACH v_eid IN ARRAY p_extratos LOOP
    SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = v_eid AND cancelado_em IS NULL;
    IF v_ext.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_nao_encontrado', 'extrato_id', v_eid); END IF;
    IF v_ext.cliente_id <> v_lan.cliente_id THEN RETURN jsonb_build_object('ok', false, 'motivo', 'cliente_divergente', 'extrato_id', v_eid); END IF;
    IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens WHERE extrato_id = v_eid AND desfeito_em IS NULL) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_ja_conciliado', 'extrato_id', v_eid);
    END IF;
    IF v_conta IS NULL THEN v_conta := v_ext.conta_bancaria_id;
    ELSIF v_conta <> v_ext.conta_bancaria_id THEN RETURN jsonb_build_object('ok', false, 'motivo', 'contas_diferentes'); END IF;
    IF v_ext.id = ANY(v_ids) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_repetido', 'extrato_id', v_eid); END IF;
    v_ids := v_ids || v_ext.id; v_soma := v_soma + abs(v_ext.valor); v_n := v_n + 1;
    v_data := GREATEST(COALESCE(v_data, v_ext.data_movimento), v_ext.data_movimento);
  END LOOP;

  IF abs(v_soma - abs(v_lan.valor)) > 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'soma_nao_bate', 'no_lancamento', abs(v_lan.valor), 'soma_extratos', v_soma, 'diferenca', round(v_soma - abs(v_lan.valor), 2));
  END IF;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'no_lancamento', abs(v_lan.valor), 'soma_extratos', v_soma, 'extratos', v_n, 'data_pagamento', v_data);
  END IF;

  UPDATE financeiro_lancamentos_v2
     SET data_pagamento = v_data, status_transacao = 'realizado',
         conta_bancaria_id = COALESCE(conta_bancaria_id, v_conta),
         updated_by = v_uid, updated_at = v_agora
   WHERE id = p_lancamento_id
     AND (data_pagamento IS DISTINCT FROM v_data OR status_transacao IS DISTINCT FROM 'realizado' OR conta_bancaria_id IS NULL);

  FOREACH v_eid IN ARRAY v_ids LOOP
    SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = v_eid;
    INSERT INTO conciliacao_bancaria_itens (
      cliente_id, extrato_id, lancamento_id, valor_aplicado, grupo_id,
      criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
      snapshot_extrato_valor, snapshot_lancamento_valor, snapshot_extrato_data, snapshot_lancamento_data,
      snapshot_favorecido_id, snapshot_historico_banco
    ) VALUES (
      v_lan.cliente_id, v_eid, p_lancamento_id, abs(v_ext.valor), v_grupo,
      v_uid, 'agrupamento_manual', v_uid, v_agora,
      v_ext.valor, v_lan.valor, v_ext.data_movimento, v_lan.data_pagamento,
      v_lan.favorecido_id, v_ext.descricao
    );
    UPDATE extrato_bancario_v2 SET status = 'conciliado' WHERE id = v_eid;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'simulado', false, 'grupo_id', v_grupo, 'extratos', v_n, 'soma_extratos', v_soma, 'data_pagamento', v_data);
END $function$;

GRANT EXECUTE ON FUNCTION public.fn_espelho_casar_n1(uuid, uuid[], boolean, text) TO authenticated;
