-- 20260908143922 financiamento_pagar_pelo_extrato_v2 (aplicada no proto via Management API em 08/09/2026)

CREATE OR REPLACE FUNCTION public.fn_financiamento_pagar_pelo_extrato(p_lancamento_cru_id uuid, p_parcela_id uuid, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE v_uid uuid; cru financeiro_lancamentos_v2%ROWTYPE; p financiamento_parcelas%ROWTYPE; f financiamentos%ROWTYPE;
        v_conta uuid; v_juros numeric; v_rec jsonb; v_lp uuid; v_lj uuid; v_ci conciliacao_bancaria_itens%ROWTYPE; n_vinc int; v_grupo uuid := gen_random_uuid();
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  SELECT * INTO cru FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_cru_id;
  IF cru.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='lancamento nao encontrado'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR cru.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente'; END IF;
  IF cru.cancelado OR cru.sinal <> '-1' OR cru.tipo_operacao LIKE '3-%' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='esperado uma saida ativa'; END IF;
  SELECT * INTO p FROM financiamento_parcelas WHERE id = p_parcela_id AND cliente_id = cru.cliente_id;
  IF p.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='parcela nao encontrada para o cliente'; END IF;
  IF p.status = 'pago' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='parcela ja paga'; END IF;
  SELECT * INTO f FROM financiamentos WHERE id = p.financiamento_id;
  v_conta := cru.conta_bancaria_id;
  v_juros := round(cru.valor - COALESCE(p.valor_principal,0), 2);
  IF v_juros < 0 THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE=format('valor do extrato (%s) menor que o principal da parcela (%s)', cru.valor, p.valor_principal); END IF;
  SELECT count(*) INTO n_vinc FROM conciliacao_bancaria_itens WHERE lancamento_id = cru.id AND desfeito_em IS NULL;
  IF n_vinc <> 1 THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE=format('esperado exatamente 1 vinculo ao extrato, ha %s', n_vinc); END IF;
  SELECT * INTO v_ci FROM conciliacao_bancaria_itens WHERE lancamento_id = cru.id AND desfeito_em IS NULL;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'contrato', f.descricao, 'parcela', p.numero_parcela, 'vencimento', p.data_vencimento,
      'principal', p.valor_principal, 'juros_previstos', p.valor_juros, 'juros_reais', v_juros, 'valor_extrato', cru.valor, 'data_pagamento', cru.data_pagamento, 'cru_id', cru.id);
  END IF;
  UPDATE financiamento_parcelas SET status = 'pago', data_pagamento = cru.data_pagamento, valor_juros = v_juros, valor_total = cru.valor, updated_at = now(),
         observacao = COALESCE(observacao,'') || ' [pago pelo extrato em '||to_char(now(),'DD/MM/YYYY')||']' WHERE id = p.id;
  v_rec := public.fn_reconciliar_parcela_financiamento(p.id, false, true, v_conta);
  SELECT lancamento_id, lancamento_juros_id INTO v_lp, v_lj FROM financiamento_parcelas WHERE id = p.id;
  IF v_lp IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='motor nao criou o lancamento do principal: '||left(v_rec::text,300); END IF;
  -- vinculos ao mesmo extrato
  INSERT INTO conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado, criado_por, snapshot_extrato_valor, snapshot_lancamento_valor, snapshot_extrato_data, snapshot_lancamento_data, snapshot_historico_banco, tipo_aprovacao, aprovado_por, aprovado_em, grupo_id)
  VALUES (cru.cliente_id, v_ci.extrato_id, v_lp, p.valor_principal, v_uid, v_ci.snapshot_extrato_valor, p.valor_principal, v_ci.snapshot_extrato_data, cru.data_pagamento, v_ci.snapshot_historico_banco, 'agrupamento_manual', v_uid, now(), v_grupo);
  IF v_lj IS NOT NULL AND v_juros > 0 THEN
    INSERT INTO conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado, criado_por, snapshot_extrato_valor, snapshot_lancamento_valor, snapshot_extrato_data, snapshot_lancamento_data, snapshot_historico_banco, tipo_aprovacao, aprovado_por, aprovado_em, grupo_id)
    VALUES (cru.cliente_id, v_ci.extrato_id, v_lj, v_juros, v_uid, v_ci.snapshot_extrato_valor, v_juros, v_ci.snapshot_extrato_data, cru.data_pagamento, v_ci.snapshot_historico_banco, 'agrupamento_manual', v_uid, now(), v_grupo);
  END IF;
  UPDATE conciliacao_bancaria_itens SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = 'cru substituido pela parcela '||p.id::text WHERE id = v_ci.id;
  UPDATE financeiro_lancamentos_v2 SET cancelado = true, cancelado_em = now(), cancelado_motivo = 'substituido pela parcela de financiamento '||p.id::text, updated_by = v_uid, updated_at = now() WHERE id = cru.id;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'parcela_id', p.id, 'lancamento_principal_id', v_lp, 'lancamento_juros_id', v_lj, 'juros_reais', v_juros, 'motor', v_rec->'executado');
END; $fn$;
REVOKE ALL ON FUNCTION public.fn_financiamento_pagar_pelo_extrato(uuid,uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_financiamento_pagar_pelo_extrato(uuid,uuid,boolean) TO authenticated;

