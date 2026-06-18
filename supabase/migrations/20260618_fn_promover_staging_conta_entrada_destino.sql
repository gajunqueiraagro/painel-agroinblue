-- P0-A — fn_promover_staging: roteamento de conta entrada→destino.
-- Aplicada/validada no proto via Management API; este arquivo versiona o estado.
-- 1-Entradas → conta_destino_id = v_row.conta_bancaria_id ; conta_bancaria_id = NULL
-- 2-Saídas   → conta_bancaria_id = v_row.conta_bancaria_id ; conta_destino_id = NULL
-- 3-Transferências permanecem bloqueadas pelo guard (não chegam ao INSERT).

CREATE OR REPLACE FUNCTION public.fn_promover_staging(p_sessao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid              uuid := auth.uid();
  v_row              mesa_lancamento_staging%ROWTYPE;
  v_lanc_id          uuid;
  v_fornecedor_id    uuid;
  v_promovidos       int := 0;
  v_count_pendente   int;
  v_count_divergente int;
  v_count_transf     int;
  v_meses_fechados   text;
BEGIN
  SELECT count(*) INTO v_count_pendente
  FROM mesa_lancamento_staging
  WHERE sessao_id = p_sessao_id AND status_promocao = 'pendente';
  IF v_count_pendente = 0 THEN
    RAISE EXCEPTION 'Sessao % nao tem lancamentos pendentes para promover.', p_sessao_id;
  END IF;

  SELECT count(*) INTO v_count_divergente
  FROM mesa_lancamento_staging
  WHERE sessao_id = p_sessao_id AND status_promocao = 'pendente'
    AND conta_resolvida_id IS NOT NULL
    AND conta_bancaria_id IS DISTINCT FROM conta_resolvida_id;
  IF v_count_divergente > 0 THEN
    RAISE EXCEPTION 'Sessao tem % lancamento(s) com divergencia entre conta escolhida e conta do Excel. Corrija antes de promover.', v_count_divergente;
  END IF;

  SELECT count(*) INTO v_count_transf
  FROM mesa_lancamento_staging
  WHERE sessao_id = p_sessao_id AND status_promocao = 'pendente'
    AND tipo_operacao = '3-Transferências';
  IF v_count_transf > 0 THEN
    RAISE EXCEPTION 'Sessao contem % transferencia(s). Transferencias nao sao promovidas pela Mesa.', v_count_transf;
  END IF;

  SELECT string_agg(DISTINCT s.ano_mes, ', ') INTO v_meses_fechados
  FROM mesa_lancamento_staging s
  WHERE s.sessao_id = p_sessao_id AND s.status_promocao = 'pendente'
    AND EXISTS (
      SELECT 1 FROM financeiro_fechamentos f
      WHERE f.cliente_id = s.cliente_id
        AND f.fazenda_id = s.fazenda_id
        AND f.ano_mes = s.ano_mes
        AND f.status_fechamento = 'fechado'
    );
  IF v_meses_fechados IS NOT NULL THEN
    RAISE EXCEPTION 'Sessao tem competencia(s) em mes fechado: %. Reabra o periodo ou ajuste antes de promover.', v_meses_fechados;
  END IF;

  FOR v_row IN
    SELECT * FROM mesa_lancamento_staging
    WHERE sessao_id = p_sessao_id AND status_promocao = 'pendente'
    ORDER BY data_pagamento, staging_id
  LOOP
    v_fornecedor_id := v_row.favorecido_id;
    IF v_fornecedor_id IS NULL
       AND v_row.favorecido_nome_marcado_novo IS NOT NULL
       AND length(btrim(v_row.favorecido_nome_marcado_novo)) > 0 THEN
      INSERT INTO financeiro_fornecedores (id, cliente_id, nome)
      VALUES (gen_random_uuid(), v_row.cliente_id, btrim(v_row.favorecido_nome_marcado_novo))
      RETURNING id INTO v_fornecedor_id;
    END IF;

    INSERT INTO financeiro_lancamentos_v2 (
      id, cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id,
      ano_mes, data_pagamento, data_competencia,
      valor, sinal, tipo_operacao,
      macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio,
      descricao, observacao, favorecido_id,
      cenario, status_transacao, sem_movimentacao_caixa, origem_lancamento,
      cancelado, staging_id, created_by, updated_by
    ) VALUES (
      gen_random_uuid(), v_row.cliente_id, v_row.fazenda_id,
      CASE WHEN v_row.tipo_operacao = '1-Entradas' THEN NULL ELSE v_row.conta_bancaria_id END,
      CASE WHEN v_row.tipo_operacao = '1-Entradas' THEN v_row.conta_bancaria_id ELSE NULL END,
      v_row.ano_mes, v_row.data_pagamento, COALESCE(v_row.data_competencia, v_row.data_pagamento),
      v_row.valor, v_row.sinal, v_row.tipo_operacao,
      v_row.macro_custo, v_row.grupo_custo, v_row.centro_custo, v_row.subcentro, v_row.escopo_negocio,
      CASE WHEN NULLIF(btrim(v_row.produto), '') IS NOT NULL AND NULLIF(btrim(v_row.descricao), '') IS NOT NULL THEN v_row.produto || ' — ' || v_row.descricao WHEN NULLIF(btrim(v_row.produto), '') IS NOT NULL THEN v_row.produto ELSE NULLIF(btrim(v_row.descricao), '') END,
      v_row.observacao, v_fornecedor_id,
      'realizado', 'realizado', false, 'mesa_excel',
      false, v_row.staging_id, v_uid, v_uid
    )
    RETURNING id INTO v_lanc_id;

    UPDATE mesa_lancamento_staging
    SET status_promocao = 'promovido',
        lancamento_v2_id = v_lanc_id,
        promovido_em = now(),
        promovido_por = v_uid
    WHERE staging_id = v_row.staging_id;

    v_promovidos := v_promovidos + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'sessao_id', p_sessao_id, 'promovidos', v_promovidos);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_promover_staging(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_promover_staging(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_promover_staging(uuid) TO authenticated;
