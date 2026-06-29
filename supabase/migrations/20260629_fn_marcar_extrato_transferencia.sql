-- 20260629_fn_marcar_extrato_transferencia.sql
-- Materializa o corpo VIVO de fn_marcar_extrato_transferencia (gerado por
-- pg_get_functiondef após CREATE OR REPLACE no proto). Não reconstruído de memória.
-- Marca um extrato como transferência entre contas próprias: cria 1 lançamento
-- 3-Transferências (sinal -1, subcentro canônico) + CBI ativo (tipo_aprovacao='manual').

CREATE OR REPLACE FUNCTION public.fn_marcar_extrato_transferencia(p_extrato_id uuid, p_conta_contraparte uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ext   record;
  v_uid   uuid := auth.uid();
  v_lanc  uuid;
  v_cbi   uuid;
  v_orig  uuid;
  v_dest  uuid;
BEGIN
  -- carregar extrato
  SELECT id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, descricao
    INTO v_ext
  FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF v_ext.id IS NULL THEN
    RAISE EXCEPTION 'extrato inexistente: %', p_extrato_id;
  END IF;

  -- GUARD: valor zero
  IF COALESCE(v_ext.valor, 0) = 0 THEN
    RAISE EXCEPTION 'extrato com valor zero nao pode ser marcado como transferencia';
  END IF;

  -- GUARD: extrato sem CBI ativo
  IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = p_extrato_id AND c.desfeito_em IS NULL) THEN
    RAISE EXCEPTION 'extrato ja possui vinculo ativo: %', p_extrato_id;
  END IF;

  -- GUARD: contraparte do mesmo cliente e diferente da conta do extrato
  IF NOT EXISTS (SELECT 1 FROM financeiro_contas_bancarias cb WHERE cb.id = p_conta_contraparte AND cb.cliente_id = v_ext.cliente_id) THEN
    RAISE EXCEPTION 'conta contraparte invalida ou de outro cliente: %', p_conta_contraparte;
  END IF;
  IF p_conta_contraparte = v_ext.conta_bancaria_id THEN
    RAISE EXCEPTION 'conta contraparte nao pode ser a propria conta do extrato';
  END IF;

  -- direcao pelo sinal real do extrato (nao textual)
  IF v_ext.valor > 0 THEN
    -- credito na conta do extrato (resgate): origem = contraparte, destino = conta do extrato
    v_orig := p_conta_contraparte;
    v_dest := v_ext.conta_bancaria_id;
  ELSE
    -- debito na conta do extrato (aplicacao): origem = conta do extrato, destino = contraparte
    v_orig := v_ext.conta_bancaria_id;
    v_dest := p_conta_contraparte;
  END IF;

  -- 1 lancamento de transferencia
  INSERT INTO financeiro_lancamentos_v2
    (cliente_id, fazenda_id, ano_mes, data_pagamento, data_competencia, valor, sinal,
     tipo_operacao, descricao, status_transacao, cancelado,
     conta_bancaria_id, conta_destino_id, subcentro, origem_lancamento, sem_movimentacao_caixa)
  VALUES
    (v_ext.cliente_id, NULL, to_char(v_ext.data_movimento,'YYYY-MM'), v_ext.data_movimento, v_ext.data_movimento,
     abs(v_ext.valor), -1, '3-Transferências',
     'Transferência entre contas próprias — ' || COALESCE(v_ext.descricao,''), 'realizado', false,
     v_orig, v_dest, 'Transferência entre Contas Bancárias', 'conciliacao_transferencia', false)
  RETURNING id INTO v_lanc;

  -- CBI direto (replicando campos do D1; tipo_aprovacao='manual')
  INSERT INTO conciliacao_bancaria_itens
    (cliente_id, extrato_id, lancamento_id, valor_aplicado,
     criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
     snapshot_extrato_valor, snapshot_lancamento_valor, snapshot_extrato_data, snapshot_lancamento_data)
  VALUES
    (v_ext.cliente_id, p_extrato_id, v_lanc, abs(v_ext.valor),
     v_uid, 'manual', v_uid, now(),
     v_ext.valor, abs(v_ext.valor), v_ext.data_movimento, v_ext.data_movimento)
  RETURNING id INTO v_cbi;

  RETURN jsonb_build_object('lancamento_id', v_lanc, 'cbi_id', v_cbi, 'origem', v_orig, 'destino', v_dest, 'motivo', p_motivo);
END;
$function$;
