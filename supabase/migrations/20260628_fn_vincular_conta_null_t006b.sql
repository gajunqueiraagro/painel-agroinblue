-- 20260628_fn_vincular_conta_null_t006b.sql
-- TASK-006B — fn_vincular_extrato_lancamento passa a tratar conta bancária do
-- lançamento na hora de vincular:
--   - lançamento.conta_bancaria_id IS NULL  -> preenche com extrato.conta_bancaria_id;
--   - preenchida e DIFERENTE do extrato     -> bloqueia com erro claro;
--   - igual                                  -> segue normalmente.
-- Resto da função idêntico ao D1 (guards/cbi/recompute). Não mexe em D2.

CREATE OR REPLACE FUNCTION public.fn_vincular_extrato_lancamento(
  p_extrato_id uuid,
  p_lancamento_id uuid,
  p_valor_aplicado numeric DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_ext     extrato_bancario_v2%ROWTYPE;
  v_lan     financeiro_lancamentos_v2%ROWTYPE;
  v_valor   numeric;
  v_cbi_id  uuid;
  v_soma    numeric;
  v_status  text;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'extrato nao encontrado: %', p_extrato_id; END IF;

  SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lancamento nao encontrado: %', p_lancamento_id; END IF;

  IF COALESCE(v_lan.cancelado, false) = true THEN
    RAISE EXCEPTION 'lancamento cancelado nao pode ser vinculado: %', p_lancamento_id;
  END IF;

  IF v_ext.cliente_id IS DISTINCT FROM v_lan.cliente_id THEN
    RAISE EXCEPTION 'cliente divergente: extrato=% lancamento=%', v_ext.cliente_id, v_lan.cliente_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM financeiro_fechamentos f
    WHERE f.cliente_id = v_lan.cliente_id
      AND f.fazenda_id = v_lan.fazenda_id
      AND f.ano_mes = v_lan.ano_mes
      AND f.status_fechamento = 'fechado'
  ) THEN
    RAISE EXCEPTION 'competencia % em mes fechado: vinculo bloqueado', v_lan.ano_mes;
  END IF;

  IF EXISTS (
    SELECT 1 FROM conciliacao_bancaria_itens c
    WHERE c.extrato_id = p_extrato_id AND c.desfeito_em IS NULL
  ) THEN
    RAISE EXCEPTION 'extrato ja possui vinculo ativo: %', p_extrato_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM conciliacao_bancaria_itens c
    WHERE c.lancamento_id = p_lancamento_id AND c.desfeito_em IS NULL
  ) THEN
    RAISE EXCEPTION 'lancamento ja possui vinculo ativo: %', p_lancamento_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM conciliacao_bancaria_itens c
    WHERE c.extrato_id = p_extrato_id AND c.lancamento_id = p_lancamento_id
      AND c.desfeito_em IS NULL
  ) THEN
    RAISE EXCEPTION 'vinculo ativo duplicado para o par';
  END IF;

  -- TASK-006B — conta bancária do lançamento (ex.: zootécnico nasce com conta nula).
  IF v_lan.conta_bancaria_id IS NULL THEN
    UPDATE financeiro_lancamentos_v2
       SET conta_bancaria_id = v_ext.conta_bancaria_id,
           updated_by = v_uid, updated_at = now()
     WHERE id = p_lancamento_id;
  ELSIF v_lan.conta_bancaria_id IS DISTINCT FROM v_ext.conta_bancaria_id THEN
    RAISE EXCEPTION 'conta do lancamento (%) difere da conta do extrato (%): vinculo bloqueado',
      v_lan.conta_bancaria_id, v_ext.conta_bancaria_id;
  END IF;

  v_valor := COALESCE(p_valor_aplicado, abs(v_ext.valor));

  INSERT INTO conciliacao_bancaria_itens (
    cliente_id, extrato_id, lancamento_id, valor_aplicado,
    criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
    snapshot_extrato_valor, snapshot_lancamento_valor,
    snapshot_extrato_data, snapshot_lancamento_data
  ) VALUES (
    v_lan.cliente_id, p_extrato_id, p_lancamento_id, v_valor,
    v_uid, 'manual', v_uid, now(),
    v_ext.valor, v_lan.valor,
    v_ext.data_movimento, v_lan.data_pagamento
  ) RETURNING id INTO v_cbi_id;

  SELECT COALESCE(sum(valor_aplicado), 0) INTO v_soma
  FROM conciliacao_bancaria_itens
  WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL;

  IF v_soma <= 0 THEN v_status := 'nao_conciliado';
  ELSIF v_soma + 0.005 >= abs(v_ext.valor) THEN v_status := 'conciliado';
  ELSE v_status := 'parcial';
  END IF;

  UPDATE extrato_bancario_v2 SET status = v_status WHERE id = p_extrato_id;

  RETURN jsonb_build_object(
    'ok', true,
    'cbi_id', v_cbi_id,
    'extrato_id', p_extrato_id,
    'lancamento_id', p_lancamento_id,
    'valor_aplicado', v_valor,
    'conta_definida_pelo_extrato', (v_lan.conta_bancaria_id IS NULL),
    'novo_status_extrato', v_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vincular_extrato_lancamento(uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_vincular_extrato_lancamento(uuid, uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_vincular_extrato_lancamento(uuid, uuid, numeric) TO authenticated;
