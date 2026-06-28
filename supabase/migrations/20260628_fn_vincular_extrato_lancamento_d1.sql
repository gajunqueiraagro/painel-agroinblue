-- 20260628_fn_vincular_extrato_lancamento_d1.sql
-- TASK-003 / D1 — Vincular avulso: OFX (extrato_bancario_v2) <-> lançamento
-- existente (financeiro_lancamentos_v2), gravando em conciliacao_bancaria_itens.
--
-- Reusa o padrão soberano (SECURITY DEFINER + guards no topo, como
-- fn_promover_staging) e a regra de status do conciliacaoSync
-- (nao_conciliado / parcial / conciliado). NÃO cria lançamento, NÃO ignora,
-- NÃO agrupa, NÃO mexe em transferência, matching, apply ou staging.
--
-- Guards (todos obrigatórios):
--   1. cliente_id coerente entre extrato e lançamento;
--   2. competência do lançamento NÃO em mês fechado;
--   3. extrato sem vínculo ativo (1:1 nesta fase; split fica para o Modo Avançado);
--   4. lançamento sem vínculo ativo (premissa do bucket "sistema sem vínculo");
--   5. par (extrato, lançamento) sem vínculo ativo duplicado.
-- Defesa extra: lançamento não-cancelado (os candidatos da Estação já são
--   não-cancelados; guarda aqui caso a RPC seja chamada direto).

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

  -- Defesa — lançamento cancelado não concilia.
  IF COALESCE(v_lan.cancelado, false) = true THEN
    RAISE EXCEPTION 'lancamento cancelado nao pode ser vinculado: %', p_lancamento_id;
  END IF;

  -- GUARD 1 — cliente coerente.
  IF v_ext.cliente_id IS DISTINCT FROM v_lan.cliente_id THEN
    RAISE EXCEPTION 'cliente divergente: extrato=% lancamento=%', v_ext.cliente_id, v_lan.cliente_id;
  END IF;

  -- GUARD 2 — mês fechado (competência do lançamento).
  IF EXISTS (
    SELECT 1 FROM financeiro_fechamentos f
    WHERE f.cliente_id = v_lan.cliente_id
      AND f.fazenda_id = v_lan.fazenda_id
      AND f.ano_mes = v_lan.ano_mes
      AND f.status_fechamento = 'fechado'
  ) THEN
    RAISE EXCEPTION 'competencia % em mes fechado: vinculo bloqueado', v_lan.ano_mes;
  END IF;

  -- GUARD 3 — extrato já possui vínculo ativo (1:1 nesta fase).
  IF EXISTS (
    SELECT 1 FROM conciliacao_bancaria_itens c
    WHERE c.extrato_id = p_extrato_id AND c.desfeito_em IS NULL
  ) THEN
    RAISE EXCEPTION 'extrato ja possui vinculo ativo: %', p_extrato_id;
  END IF;

  -- GUARD 4 — lançamento já possui vínculo ativo (deve estar "sem vínculo").
  IF EXISTS (
    SELECT 1 FROM conciliacao_bancaria_itens c
    WHERE c.lancamento_id = p_lancamento_id AND c.desfeito_em IS NULL
  ) THEN
    RAISE EXCEPTION 'lancamento ja possui vinculo ativo: %', p_lancamento_id;
  END IF;

  -- GUARD 5 — par exato sem vínculo ativo duplicado (defesa redundante a 3/4).
  IF EXISTS (
    SELECT 1 FROM conciliacao_bancaria_itens c
    WHERE c.extrato_id = p_extrato_id AND c.lancamento_id = p_lancamento_id
      AND c.desfeito_em IS NULL
  ) THEN
    RAISE EXCEPTION 'vinculo ativo duplicado para o par';
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

  -- Recompute status do extrato (regra literal do conciliacaoSync).
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
    'novo_status_extrato', v_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vincular_extrato_lancamento(uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_vincular_extrato_lancamento(uuid, uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_vincular_extrato_lancamento(uuid, uuid, numeric) TO authenticated;
