-- 20260630_pr_transferir_vinculo.sql
-- PR-Estacao-DesvincularTransferir (Partes A+B, server-side).
--
-- A) fn_transferir_vinculo_extrato — RPC ATÔMICA: desfaz o vínculo de um lançamento no
--    extrato de origem e o vincula ao extrato de destino (OFX da Estação), tudo numa única
--    transação plpgsql (qualquer RAISE = rollback total; sem savepoint). Trata o índice
--    UNIQUE idx_conciliacao_itens_par_unico (sem filtro desfeito_em): se já existe um CBI
--    do par (destino,lançamento), REATIVA (UPDATE desfeito_em=NULL) em vez de INSERT.
-- B) fn_ws_candidatos_financeiros — +1 campo read-only extrato_vinculado_id (o extrato a que
--    o candidato está vinculado hoje; NULL se livre). Corpo materializado do banco VIVO +
--    1 chave aditiva. NÃO muda classificacao/score/filtros/ordenação.
--
-- Mecânica espelha fn_vincular_extrato_lancamento (guards, INSERT de CBI com tipo_aprovacao=
-- 'manual' + snapshots, recálculo de status) e fn_desfazer_vinculo_extrato (desfazer + audit).
-- Sem coluna 'origem' no CBI. Guard de conta inclui a exceção transferência-por-lado (PR E).
-- Validado em BEGIN/ROLLBACK (A1..A6, B1). Forward-only. Grants: só authenticated.

BEGIN;

-- ============================================================================
-- PARTE A — RPC atômica de transferência de vínculo
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_transferir_vinculo_extrato(
  p_extrato_origem  uuid,
  p_extrato_destino uuid,
  p_lancamento_id   uuid,
  p_valor_aplicado  numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_ext_o  extrato_bancario_v2%ROWTYPE;
  v_ext_d  extrato_bancario_v2%ROWTYPE;
  v_lan    financeiro_lancamentos_v2%ROWTYPE;
  v_n_par  int;
  v_cbi_o  uuid;
  v_cbi_d  uuid;
  v_cbi_existente uuid;
  v_valor  numeric;
  v_soma   numeric;
  v_status_o text;
  v_status_d text;
BEGIN
  -- 0. EXISTÊNCIA E COERÊNCIA
  SELECT * INTO v_ext_o FROM extrato_bancario_v2 WHERE id = p_extrato_origem;
  IF NOT FOUND THEN RAISE EXCEPTION 'extrato de origem inexistente: %', p_extrato_origem; END IF;
  SELECT * INTO v_ext_d FROM extrato_bancario_v2 WHERE id = p_extrato_destino;
  IF NOT FOUND THEN RAISE EXCEPTION 'extrato de destino inexistente: %', p_extrato_destino; END IF;
  IF p_extrato_origem = p_extrato_destino THEN
    RAISE EXCEPTION 'extrato de origem e destino sao o mesmo: %', p_extrato_origem; END IF;
  SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lancamento inexistente: %', p_lancamento_id; END IF;
  IF COALESCE(v_lan.cancelado, false) = true THEN
    RAISE EXCEPTION 'lancamento cancelado nao pode ser transferido: %', p_lancamento_id; END IF;
  IF v_ext_o.cliente_id IS DISTINCT FROM v_lan.cliente_id
     OR v_ext_d.cliente_id IS DISTINCT FROM v_lan.cliente_id
     OR v_ext_o.cliente_id IS DISTINCT FROM v_ext_d.cliente_id THEN
    RAISE EXCEPTION 'cliente divergente entre extratos e lancamento'; END IF;

  -- mes fechado (mesma checagem do fn_vincular: por cliente+fazenda+ano_mes do lancamento)
  IF EXISTS (SELECT 1 FROM financeiro_fechamentos f
             WHERE f.cliente_id = v_lan.cliente_id AND f.fazenda_id = v_lan.fazenda_id
               AND f.ano_mes = v_lan.ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION 'competencia % em mes fechado: transferencia bloqueada', v_lan.ano_mes; END IF;

  -- 1. VALIDAR VÍNCULO DE ORIGEM (existe CBI ativo do PAR)
  SELECT count(*) INTO v_n_par FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_origem AND lancamento_id = p_lancamento_id AND desfeito_em IS NULL;
  IF v_n_par = 0 THEN
    RAISE EXCEPTION 'lancamento % nao esta vinculado ao extrato de origem %', p_lancamento_id, p_extrato_origem; END IF;
  SELECT id INTO v_cbi_o FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_origem AND lancamento_id = p_lancamento_id AND desfeito_em IS NULL LIMIT 1;

  v_valor := COALESCE(p_valor_aplicado, abs(v_ext_d.valor));

  -- 2. DESFAZER O VÍNCULO DE ORIGEM (mesma mecânica de fn_desfazer)
  UPDATE conciliacao_bancaria_itens
     SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = 'transferencia_vinculo'
   WHERE extrato_id = p_extrato_origem AND lancamento_id = p_lancamento_id AND desfeito_em IS NULL;

  SELECT COALESCE(sum(valor_aplicado),0) INTO v_soma FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_origem AND desfeito_em IS NULL;
  v_status_o := CASE WHEN v_soma <= 0 THEN 'nao_conciliado'
                     WHEN v_soma + 0.005 >= abs(v_ext_o.valor) THEN 'conciliado'
                     ELSE 'parcial' END;
  UPDATE extrato_bancario_v2 SET status = v_status_o WHERE id = p_extrato_origem;

  INSERT INTO conciliacao_audit_log
    (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id, motivo, payload_depois)
  VALUES ('conciliacao_desfeita', v_uid, v_lan.cliente_id, p_extrato_origem, p_lancamento_id, v_cbi_o,
          'transferencia_vinculo', jsonb_build_object('status', v_status_o));

  -- 3. VINCULAR AO DESTINO (guards do destino APÓS desfazer -> atomicidade: RAISE reverte tudo)
  IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
             WHERE c.extrato_id = p_extrato_destino AND c.desfeito_em IS NULL) THEN
    RAISE EXCEPTION 'extrato de destino ja possui vinculo ativo: %', p_extrato_destino; END IF;

  -- conta coerente (mesmo guard do fn_vincular pós-PR E: exceção transferencia-por-lado)
  IF v_lan.conta_bancaria_id IS NOT NULL
     AND v_lan.conta_bancaria_id IS DISTINCT FROM v_ext_d.conta_bancaria_id
     AND NOT (
       v_lan.tipo_operacao = '3-Transferências' AND (
         (v_ext_d.tipo_movimento = 'credito' AND v_lan.conta_destino_id  = v_ext_d.conta_bancaria_id) OR
         (v_ext_d.tipo_movimento = 'debito'  AND v_lan.conta_bancaria_id = v_ext_d.conta_bancaria_id)
       )
     ) THEN
    RAISE EXCEPTION 'conta do lancamento (%) difere da conta do extrato de destino (%): vinculo bloqueado',
      v_lan.conta_bancaria_id, v_ext_d.conta_bancaria_id; END IF;

  -- reativar CBI do par (destino,lancamento) se já existe (mesmo desfeito) -> evita unique_violation
  SELECT id INTO v_cbi_existente FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_destino AND lancamento_id = p_lancamento_id LIMIT 1;
  IF v_cbi_existente IS NOT NULL THEN
    UPDATE conciliacao_bancaria_itens
       SET desfeito_em = NULL, desfeito_por = NULL, desfeito_motivo = NULL,
           valor_aplicado = v_valor, aprovado_por = v_uid, aprovado_em = now(),
           criado_por = COALESCE(criado_por, v_uid)
     WHERE id = v_cbi_existente;
    v_cbi_d := v_cbi_existente;
  ELSE
    INSERT INTO conciliacao_bancaria_itens
      (cliente_id, extrato_id, lancamento_id, valor_aplicado,
       criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
       snapshot_extrato_valor, snapshot_lancamento_valor, snapshot_extrato_data, snapshot_lancamento_data)
    VALUES (v_lan.cliente_id, p_extrato_destino, p_lancamento_id, v_valor,
       v_uid, 'manual', v_uid, now(),
       v_ext_d.valor, v_lan.valor, v_ext_d.data_movimento, v_lan.data_pagamento)
    RETURNING id INTO v_cbi_d;
  END IF;

  SELECT COALESCE(sum(valor_aplicado),0) INTO v_soma FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_destino AND desfeito_em IS NULL;
  v_status_d := CASE WHEN v_soma <= 0 THEN 'nao_conciliado'
                     WHEN v_soma + 0.005 >= abs(v_ext_d.valor) THEN 'conciliado'
                     ELSE 'parcial' END;
  UPDATE extrato_bancario_v2 SET status = v_status_d WHERE id = p_extrato_destino;

  INSERT INTO conciliacao_audit_log
    (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id, motivo, payload_depois)
  VALUES ('conciliacao_criada', v_uid, v_lan.cliente_id, p_extrato_destino, p_lancamento_id, v_cbi_d,
          'transferencia_vinculo', jsonb_build_object('status', v_status_d, 'valor_aplicado', v_valor));

  RETURN jsonb_build_object(
    'ok', true, 'lancamento_id', p_lancamento_id,
    'extrato_origem', p_extrato_origem, 'status_origem', v_status_o,
    'extrato_destino', p_extrato_destino, 'status_destino', v_status_d,
    'cbi_destino', v_cbi_d);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_transferir_vinculo_extrato(uuid,uuid,uuid,numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_transferir_vinculo_extrato(uuid,uuid,uuid,numeric) TO authenticated;

-- ============================================================================
-- PARTE B — fn_ws_candidatos_financeiros: +1 chave read-only extrato_vinculado_id
--   (corpo materializado do banco vivo; única diferença = a chave nova após 'score').
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_ws_candidatos_financeiros(p_extrato_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH ofx AS (
  SELECT e.id, e.cliente_id, e.valor, e.data_movimento AS data_mov,
         e.conta_bancaria_id AS conta,
         CASE WHEN e.tipo_movimento = 'credito' THEN 1 ELSE -1 END AS sinal_ofx
  FROM extrato_bancario_v2 e
  WHERE e.id = p_extrato_id
),
cand AS (
  SELECT
    l.id, l.valor, l.sinal, l.data_pagamento, l.data_competencia,
    l.tipo_operacao, l.status_transacao, l.origem_lancamento, l.descricao,
    l.conta_bancaria_id, l.conta_destino_id,
    o.conta AS ofx_conta, o.data_mov, o.sinal_ofx,
    CASE WHEN l.conta_destino_id = o.conta THEN 'destino'
         WHEN l.conta_bancaria_id = o.conta THEN 'origem' END AS lado_match,
    (l.data_pagamento = o.data_mov) AS data_pgto_exata,
    LEAST(
      abs(COALESCE(l.data_pagamento   - o.data_mov, 999)),
      abs(COALESCE(l.data_competencia - o.data_mov, 999))
    ) AS dist_dias,
    CASE
      WHEN l.data_pagamento = o.data_mov AND l.data_competencia = o.data_mov THEN 'ambas'
      WHEN l.data_pagamento BETWEEN o.data_mov-5 AND o.data_mov+5 THEN 'pagamento'
      ELSE 'competencia'
    END AS qual_data,
    EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
            WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL
              AND c.extrato_id = p_extrato_id) AS cbi_neste,
    EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
            WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL
              AND c.extrato_id <> p_extrato_id) AS cbi_outro,
    EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
            WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL) AS cbi_qualquer
  FROM ofx o
  JOIN financeiro_lancamentos_v2 l
    ON l.cliente_id = o.cliente_id
   AND l.cancelado = false
   AND l.sem_movimentacao_caixa = false
   AND l.status_transacao IN ('realizado','programado')
   AND abs(l.valor) = abs(o.valor)
   AND (
        (l.data_pagamento   BETWEEN o.data_mov-5 AND o.data_mov+5)
     OR (l.data_competencia BETWEEN o.data_mov-5 AND o.data_mov+5)
       )
   AND (
        ( l.tipo_operacao = '3-Transferências' AND (
            (o.sinal_ofx > 0 AND l.conta_destino_id  = o.conta)
         OR (o.sinal_ofx < 0 AND l.conta_bancaria_id = o.conta)
        ))
        OR
        ( l.tipo_operacao <> '3-Transferências'
          AND l.conta_bancaria_id = o.conta
          AND l.sinal::int = o.sinal_ofx )
       )
),
scored AS (
  SELECT cand.*,
    LEAST(100,
      40 + 30
      + GREATEST(0, 20 - 4*dist_dias)
      + CASE WHEN tipo_operacao = '3-Transferências' THEN 10 ELSE 0 END
    ) AS score,
    CASE WHEN NOT cbi_qualquer THEN 'livre'
         WHEN cbi_neste THEN 'alerta_mesmo_extrato'
         ELSE 'alerta_outro_extrato' END AS classificacao
  FROM cand
)
SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
    'lancamento_id', s.id,
    'valor', s.valor,
    'sinal', s.sinal,
    'data_pagamento', s.data_pagamento,
    'data_competencia', s.data_competencia,
    'tipo_operacao', s.tipo_operacao,
    'status_transacao', s.status_transacao,
    'origem_lancamento', s.origem_lancamento,
    'descricao', s.descricao,
    'conta_bancaria_id', s.conta_bancaria_id,
    'conta_bancaria_nome', (SELECT nome_exibicao FROM financeiro_contas_bancarias WHERE id = s.conta_bancaria_id),
    'conta_destino_id', s.conta_destino_id,
    'conta_destino_nome', (SELECT nome_exibicao FROM financeiro_contas_bancarias WHERE id = s.conta_destino_id),
    'lado_match', s.lado_match,
    'qual_data', s.qual_data,
    'classificacao', s.classificacao,
    'score', s.score,
    'extrato_vinculado_id', (SELECT c.extrato_id FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = s.id AND c.desfeito_em IS NULL LIMIT 1),
    'criterios', jsonb_build_object(
      'valor_exato', true,
      'conta_lado_ok', true,
      'data_exata', s.data_pgto_exata,
      'tipo_transferencia', (s.tipo_operacao = '3-Transferências')
    )
  )
  ORDER BY (s.classificacao = 'livre') DESC, s.score DESC, s.data_pagamento ASC
), '[]'::jsonb)
FROM scored s;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ws_candidatos_financeiros(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_ws_candidatos_financeiros(uuid) TO authenticated;

COMMIT;
