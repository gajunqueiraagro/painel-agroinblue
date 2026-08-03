-- PR-CONC-GRUPO-FASE-1 — Migration 02: fn_vincular_grupo_conciliacao (atômica)
-- Vincula 1 OFX ↔ N lançamentos numa única transação. Reusa AS MESMAS validações de
-- fn_vincular_extrato_lancamento (por membro) e relaxa APENAS a trava "extrato já tem vínculo"
-- (para permitir os N do grupo). Mantém "lançamento já vinculado". Grava grupo_id + audit_log.

CREATE OR REPLACE FUNCTION public.fn_vincular_grupo_conciliacao(
  p_extrato_id  uuid,
  p_lancamentos uuid[],
  p_valores     numeric[] DEFAULT NULL,
  p_motivo      text      DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_ext      extrato_bancario_v2%ROWTYPE;
  v_lan      financeiro_lancamentos_v2%ROWTYPE;
  v_grupo_id uuid := gen_random_uuid();
  v_lanc     uuid;
  v_val      numeric;
  v_i        int;
  v_n        int;
  v_total    numeric := 0;
  v_soma     numeric;
  v_status   text;
  v_itens    jsonb := '[]'::jsonb;
  v_cbi_id   uuid;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'extrato_nao_encontrado: %', p_extrato_id; END IF;

  v_n := COALESCE(array_length(p_lancamentos, 1), 0);
  IF v_n < 2 THEN RAISE EXCEPTION 'array_vazio: grupo exige >= 2 lancamentos (recebidos: %)', v_n; END IF;
  IF p_valores IS NOT NULL AND COALESCE(array_length(p_valores, 1), 0) <> v_n THEN
    RAISE EXCEPTION 'valores_len_diverge: % valores para % lancamentos', array_length(p_valores, 1), v_n;
  END IF;
  IF v_n <> (SELECT count(DISTINCT y) FROM unnest(p_lancamentos) AS y) THEN
    RAISE EXCEPTION 'membro_repetido: lancamento_id duplicado no array';
  END IF;

  -- 1ª passada: valida cada membro e acumula o total (nada é gravado ainda).
  FOR v_i IN 1..v_n LOOP
    v_lanc := p_lancamentos[v_i];
    SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = v_lanc;
    IF NOT FOUND THEN RAISE EXCEPTION 'lancamento_nao_encontrado: %', v_lanc; END IF;
    IF COALESCE(v_lan.cancelado, false) THEN RAISE EXCEPTION 'lancamento_cancelado: %', v_lanc; END IF;
    IF v_ext.cliente_id IS DISTINCT FROM v_lan.cliente_id THEN
      RAISE EXCEPTION 'cliente_divergente: extrato=% lancamento=%', v_ext.cliente_id, v_lan.cliente_id;
    END IF;
    IF EXISTS (
      SELECT 1 FROM financeiro_fechamentos f
      WHERE f.cliente_id = v_lan.cliente_id AND f.fazenda_id = v_lan.fazenda_id
        AND f.ano_mes = v_lan.ano_mes AND f.status_fechamento = 'fechado'
    ) THEN RAISE EXCEPTION 'mes_fechado: %', v_lan.ano_mes; END IF;
    IF EXISTS (
      SELECT 1 FROM conciliacao_bancaria_itens c
      WHERE c.lancamento_id = v_lanc AND c.desfeito_em IS NULL
    ) THEN RAISE EXCEPTION 'lancamento_ja_vinculado: %', v_lanc; END IF;
    IF EXISTS (
      SELECT 1 FROM conciliacao_bancaria_itens c
      WHERE c.extrato_id = p_extrato_id AND c.lancamento_id = v_lanc AND c.desfeito_em IS NULL
    ) THEN RAISE EXCEPTION 'par_duplicado: % / %', p_extrato_id, v_lanc; END IF;
    -- conta compatível (idêntica a fn_vincular; só quando a conta do lançamento não é nula)
    IF v_lan.conta_bancaria_id IS NOT NULL
       AND v_lan.conta_bancaria_id IS DISTINCT FROM v_ext.conta_bancaria_id
       AND NOT (
         v_lan.tipo_operacao = '3-Transferências' AND (
           (v_ext.tipo_movimento = 'credito' AND v_lan.conta_destino_id  = v_ext.conta_bancaria_id) OR
           (v_ext.tipo_movimento = 'debito'  AND v_lan.conta_bancaria_id = v_ext.conta_bancaria_id)
         )
       )
    THEN RAISE EXCEPTION 'conta_incompativel: lanc=% ext=%', v_lan.conta_bancaria_id, v_ext.conta_bancaria_id;
    END IF;

    v_val := COALESCE(CASE WHEN p_valores IS NOT NULL THEN p_valores[v_i] END, abs(v_lan.valor));
    v_total := v_total + v_val;
  END LOOP;

  -- A soma do grupo tem que fechar com o OFX (mesma tolerância 0.005 do modelo).
  IF abs(v_total - abs(v_ext.valor)) > 0.005 THEN
    RAISE EXCEPTION 'soma_diverge: total_aplicado=% ofx=%', v_total, abs(v_ext.valor);
  END IF;

  -- 2ª passada: grava os N membros (define conta pelo extrato quando nula), com grupo_id.
  FOR v_i IN 1..v_n LOOP
    v_lanc := p_lancamentos[v_i];
    SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = v_lanc;
    IF v_lan.conta_bancaria_id IS NULL THEN
      UPDATE financeiro_lancamentos_v2
         SET conta_bancaria_id = v_ext.conta_bancaria_id, updated_by = v_uid, updated_at = now()
       WHERE id = v_lanc;
    END IF;
    v_val := COALESCE(CASE WHEN p_valores IS NOT NULL THEN p_valores[v_i] END, abs(v_lan.valor));
    INSERT INTO conciliacao_bancaria_itens (
      cliente_id, extrato_id, lancamento_id, valor_aplicado, grupo_id,
      criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
      snapshot_extrato_valor, snapshot_lancamento_valor, snapshot_extrato_data, snapshot_lancamento_data
    ) VALUES (
      v_ext.cliente_id, p_extrato_id, v_lanc, v_val, v_grupo_id,
      v_uid, 'agrupamento_manual', v_uid, now(),
      v_ext.valor, v_lan.valor, v_ext.data_movimento, v_lan.data_pagamento
    ) RETURNING id INTO v_cbi_id;
    v_itens := v_itens || jsonb_build_object('cbi_id', v_cbi_id, 'lancamento_id', v_lanc, 'valor_aplicado', v_val);
  END LOOP;

  -- Recompute do status do extrato (uma única vez), fórmula existente.
  SELECT COALESCE(sum(valor_aplicado), 0) INTO v_soma
  FROM conciliacao_bancaria_itens WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL;
  IF v_soma <= 0 THEN v_status := 'nao_conciliado';
  ELSIF v_soma + 0.005 >= abs(v_ext.valor) THEN v_status := 'conciliado';
  ELSE v_status := 'parcial'; END IF;
  UPDATE extrato_bancario_v2 SET status = v_status WHERE id = p_extrato_id;

  -- Trilha de decisão (prova de que o agrupamento foi ato deliberado do usuário).
  INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, ano_mes, motivo, payload_depois)
  VALUES ('conciliacao_grupo_criada', v_uid, v_ext.cliente_id, p_extrato_id,
          to_char(v_ext.data_movimento, 'YYYY-MM'), COALESCE(p_motivo, 'agrupamento_manual'),
          jsonb_build_object('grupo_id', v_grupo_id, 'itens', v_itens,
                             'total_ofx', abs(v_ext.valor), 'total_aplicado', v_total,
                             'diferenca', abs(v_ext.valor) - v_total, 'status', v_status));

  RETURN jsonb_build_object(
    'ok', true,
    'grupo_id', v_grupo_id,
    'extrato_id', p_extrato_id,
    'total_ofx', abs(v_ext.valor),
    'total_aplicado', v_total,
    'diferenca', abs(v_ext.valor) - v_total,
    'status_extrato', v_status,
    'tipo_aprovacao', 'agrupamento_manual',
    'itens', v_itens
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vincular_grupo_conciliacao(uuid, uuid[], numeric[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vincular_grupo_conciliacao(uuid, uuid[], numeric[], text) TO authenticated;

-- ROLLBACK: DROP FUNCTION public.fn_vincular_grupo_conciliacao(uuid, uuid[], numeric[], text);
