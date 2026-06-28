-- 20260628_fn_criar_lancamento_de_extrato_d2.sql
-- TASK-005 / D2 — Criar lançamento a partir de um OFX sem vínculo, JÁ vinculando
-- (financeiro_lancamentos_v2 + conciliacao_bancaria_itens) de forma ATÔMICA.
--
-- Reusa o padrão do D1 (SECURITY DEFINER + guards no topo + recompute de status,
-- regra literal do conciliacaoSync) e a verdade bancária da fn_promover_staging
-- (valor/sinal/tipo/conta vêm do extrato; classificação vem do operador).
-- NÃO mexe em D1, transferência, agrupamento, ignorar, Mesa, matching/score.
--
-- Atomicidade: tudo numa função (1 transação). Falha de guard/trigger/FK = rollback
-- total -> NUNCA cria lançamento sem vínculo.
--
-- Guards:
--   1. extrato existe e SEM vínculo ativo;
--   2. fazenda pertence ao cliente do extrato (coerência cliente/fazenda/conta);
--   3. competência (ano_mes do extrato) NÃO em mês fechado;
--   4. plano de contas válido -> garantido pelo trigger resolve_classificacao_from_plano
--      (subcentro órfão faz RAISE no INSERT, dentro da mesma transação).
-- Verdade bancária (valor/sinal/tipo/conta/data) vem SEMPRE do extrato — params do
-- operador só completam classificação (fazenda/subcentro/favorecido/descrição/doc).

CREATE OR REPLACE FUNCTION public.fn_criar_lancamento_de_extrato(
  p_extrato_id        uuid,
  p_fazenda_id        uuid,
  p_subcentro         text DEFAULT NULL,
  p_descricao         text DEFAULT NULL,
  p_observacao        text DEFAULT NULL,
  p_favorecido_id     uuid DEFAULT NULL,
  p_numero_documento  text DEFAULT NULL,
  p_data_competencia  date DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_ext      extrato_bancario_v2%ROWTYPE;
  v_sinal    text;
  v_tipo     text;
  v_valor    numeric;
  v_ano_mes  text;
  v_lanc_id  uuid;
  v_cbi_id   uuid;
  v_soma     numeric;
  v_status   text;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'extrato nao encontrado: %', p_extrato_id; END IF;

  -- GUARD 1 — extrato já vinculado (cria 1:1; split fica para o Modo Avançado).
  IF EXISTS (
    SELECT 1 FROM conciliacao_bancaria_itens c
    WHERE c.extrato_id = p_extrato_id AND c.desfeito_em IS NULL
  ) THEN
    RAISE EXCEPTION 'extrato ja possui vinculo ativo: %', p_extrato_id;
  END IF;

  -- GUARD 2 — fazenda obrigatória e coerente com o cliente do extrato.
  IF p_fazenda_id IS NULL THEN
    RAISE EXCEPTION 'fazenda obrigatoria para criar lancamento';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM fazendas f WHERE f.id = p_fazenda_id AND f.cliente_id = v_ext.cliente_id
  ) THEN
    RAISE EXCEPTION 'fazenda % nao pertence ao cliente do extrato (%)', p_fazenda_id, v_ext.cliente_id;
  END IF;

  -- Verdade bancária derivada do extrato.
  v_valor   := abs(v_ext.valor);
  v_sinal   := CASE WHEN v_ext.valor < 0 THEN '-1' ELSE '1' END;
  v_tipo    := CASE WHEN v_ext.valor < 0 THEN '2-Saídas' ELSE '1-Entradas' END;
  v_ano_mes := to_char(v_ext.data_movimento, 'YYYY-MM');

  -- GUARD 3 — mês fechado (competência do extrato / fazenda escolhida).
  IF EXISTS (
    SELECT 1 FROM financeiro_fechamentos f
    WHERE f.cliente_id = v_ext.cliente_id
      AND f.fazenda_id = p_fazenda_id
      AND f.ano_mes = v_ano_mes
      AND f.status_fechamento = 'fechado'
  ) THEN
    RAISE EXCEPTION 'competencia % em mes fechado: criacao bloqueada', v_ano_mes;
  END IF;

  -- INSERT do lançamento (verdade bancária do extrato + classificação do operador).
  -- O trigger resolve_classificacao_from_plano resolve macro/grupo/centro a partir do
  -- subcentro (e faz RAISE se o subcentro estiver fora do plano) — GUARD 4 automático.
  INSERT INTO financeiro_lancamentos_v2 (
    id, cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id,
    ano_mes, data_pagamento, data_competencia,
    valor, sinal, tipo_operacao,
    subcentro, descricao, observacao, numero_documento, favorecido_id,
    cenario, status_transacao, sem_movimentacao_caixa, origem_lancamento,
    cancelado, created_by, updated_by
  ) VALUES (
    gen_random_uuid(), v_ext.cliente_id, p_fazenda_id,
    CASE WHEN v_tipo = '1-Entradas' THEN NULL ELSE v_ext.conta_bancaria_id END,
    CASE WHEN v_tipo = '1-Entradas' THEN v_ext.conta_bancaria_id ELSE NULL END,
    v_ano_mes, v_ext.data_movimento, COALESCE(p_data_competencia, v_ext.data_movimento),
    v_valor, v_sinal, v_tipo,
    NULLIF(btrim(p_subcentro), ''),
    COALESCE(NULLIF(btrim(p_descricao), ''), v_ext.descricao),
    NULLIF(btrim(p_observacao), ''),
    COALESCE(NULLIF(btrim(p_numero_documento), ''), v_ext.documento),
    p_favorecido_id,
    'realizado', 'realizado', false, 'extrato',
    false, v_uid, v_uid
  ) RETURNING id INTO v_lanc_id;

  -- INSERT do vínculo (mesma lógica do D1).
  INSERT INTO conciliacao_bancaria_itens (
    cliente_id, extrato_id, lancamento_id, valor_aplicado,
    criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
    snapshot_extrato_valor, snapshot_lancamento_valor,
    snapshot_extrato_data, snapshot_lancamento_data
  ) VALUES (
    v_ext.cliente_id, p_extrato_id, v_lanc_id, v_valor,
    v_uid, 'manual', v_uid, now(),
    v_ext.valor, v_valor,
    v_ext.data_movimento, v_ext.data_movimento
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
    'lancamento_id', v_lanc_id,
    'cbi_id', v_cbi_id,
    'extrato_id', p_extrato_id,
    'valor', v_valor,
    'tipo_operacao', v_tipo,
    'novo_status_extrato', v_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_criar_lancamento_de_extrato(uuid, uuid, text, text, text, uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_criar_lancamento_de_extrato(uuid, uuid, text, text, text, uuid, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_criar_lancamento_de_extrato(uuid, uuid, text, text, text, uuid, text, date) TO authenticated;
