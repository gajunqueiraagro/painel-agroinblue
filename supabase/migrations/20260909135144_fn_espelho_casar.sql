CREATE OR REPLACE FUNCTION public.fn_espelho_casar(p_extrato_id uuid, p_itens jsonb, p_simular boolean DEFAULT true, p_motivo text DEFAULT 'casado_no_espelho'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ext record; v_uid uuid := auth.uid(); v_agora timestamptz := now();
  v_item jsonb; v_lan record; v_soma numeric := 0; v_alvo numeric; v_n int := 0;
  v_ids uuid[] := '{}'; v_vals numeric[] := '{}'; v_r jsonb; v_lid uuid; v_val numeric;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id AND cancelado_em IS NULL;
  IF v_ext.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_nao_encontrado'); END IF;
  IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_ja_conciliado');
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_itens');
  END IF;
  v_alvo := abs(v_ext.valor);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_lid := (v_item->>'lancamento_id')::uuid;
    SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = v_lid;
    IF v_lan.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_nao_encontrado', 'lancamento_id', v_lid); END IF;
    IF v_lan.cliente_id <> v_ext.cliente_id THEN RETURN jsonb_build_object('ok', false, 'motivo', 'cliente_divergente', 'lancamento_id', v_lid); END IF;
    IF COALESCE(v_lan.cancelado, false) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_cancelado', 'lancamento_id', v_lid); END IF;
    IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens WHERE lancamento_id = v_lid AND desfeito_em IS NULL) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_conciliado', 'lancamento_id', v_lid);
    END IF;
    v_val := abs(COALESCE((v_item->>'valor')::numeric, v_lan.valor));
    IF v_val <= 0 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'valor_invalido', 'lancamento_id', v_lid); END IF;
    v_ids := v_ids || v_lid; v_vals := v_vals || v_val; v_soma := v_soma + v_val; v_n := v_n + 1;
  END LOOP;

  IF abs(v_soma - v_alvo) > 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'soma_nao_bate', 'no_extrato', v_alvo, 'soma', v_soma, 'diferenca', round(v_soma - v_alvo, 2));
  END IF;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'no_extrato', v_alvo, 'soma', v_soma, 'itens', v_n, 'data_extrato', v_ext.data_movimento);
  END IF;

  FOR i IN 1..v_n LOOP
    UPDATE financeiro_lancamentos_v2
       SET valor = v_vals[i],
           data_pagamento = v_ext.data_movimento,
           status_transacao = 'realizado',
           updated_by = v_uid, updated_at = v_agora
     WHERE id = v_ids[i]
       AND (valor IS DISTINCT FROM v_vals[i] OR data_pagamento IS DISTINCT FROM v_ext.data_movimento OR status_transacao IS DISTINCT FROM 'realizado');
  END LOOP;

  IF v_n = 1 THEN
    PERFORM public.fn_vincular_extrato_lancamento(p_extrato_id, v_ids[1], v_vals[1]);
  ELSE
    PERFORM public.fn_vincular_grupo_conciliacao(p_extrato_id, v_ids, v_vals, p_motivo);
  END IF;

  RETURN jsonb_build_object('ok', true, 'simulado', false, 'no_extrato', v_alvo, 'soma', v_soma, 'itens', v_n, 'data_extrato', v_ext.data_movimento, 'ids', to_jsonb(v_ids));
END $function$;

GRANT EXECUTE ON FUNCTION public.fn_espelho_casar(uuid, jsonb, boolean, text) TO authenticated;
