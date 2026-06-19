-- 20260619_fn_promover_staging_merge.sql
-- MERGE-STAGING-01 — promocao como MERGE.
-- Se o OFX (staging.ofx_extrato_id) ja gerou lancamento cru vinculado via
-- conciliacao_bancaria_itens, ENRIQUECE (UPDATE) esse lancamento em vez de
-- inserir duplicata. Insere so quando nao ha lancamento vinculado.
-- Preserva verdade bancaria (valor/sinal/data/conta/descricao) e correcao manual.
-- Aplicada manualmente no proto via SQL Editor; este arquivo versiona o estado.

CREATE OR REPLACE FUNCTION public.fn_promover_staging(p_sessao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid               uuid := auth.uid();
  v_row               mesa_lancamento_staging%ROWTYPE;
  v_lanc_id           uuid;
  v_fornecedor_id     uuid;
  v_promovidos        int := 0;
  v_enriquecidos      int := 0;
  v_ja_promovido_ofx  int := 0;
  v_protegidos_manual int := 0;
  v_ambiguos          int := 0;
  v_divergentes_merge int := 0;
  v_count_pendente    int;
  v_count_divergente  int;
  v_count_transf      int;
  v_meses_fechados    text;
  v_n_vinc            int;
  v_alvo              financeiro_lancamentos_v2%ROWTYPE;
  v_obs_rica          text;
BEGIN
  SELECT count(*) INTO v_count_pendente
  FROM mesa_lancamento_staging
  WHERE sessao_id = p_sessao_id AND status_promocao = 'pendente';
  IF v_count_pendente = 0 THEN
    RETURN jsonb_build_object('ok', true, 'sessao_id', p_sessao_id,
      'promovidos', 0, 'enriquecidos', 0, 'ja_promovidos', 0,
      'protegidos_manual', 0, 'ambiguos', 0, 'divergentes_merge', 0,
      'motivo', 'sem_pendentes');
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
    -- GUARD 1 — STAGING-02: 1 OFX -> 1 promovido (idempotencia).
    IF v_row.ofx_extrato_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM mesa_lancamento_staging x
      WHERE x.ofx_extrato_id = v_row.ofx_extrato_id
        AND x.status_promocao = 'promovido'
    ) THEN
      v_ja_promovido_ofx := v_ja_promovido_ofx + 1;
      CONTINUE;
    END IF;

    -- Resolve fornecedor (cria se veio nome novo sem UUID) — usado por INSERT e MERGE.
    v_fornecedor_id := v_row.favorecido_id;
    IF v_fornecedor_id IS NULL
       AND v_row.favorecido_nome_marcado_novo IS NOT NULL
       AND length(btrim(v_row.favorecido_nome_marcado_novo)) > 0 THEN
      INSERT INTO financeiro_fornecedores (id, cliente_id, nome)
      VALUES (gen_random_uuid(), v_row.cliente_id, btrim(v_row.favorecido_nome_marcado_novo))
      RETURNING id INTO v_fornecedor_id;
    END IF;

    -- observacao rica: Produto · descricao Excel · observacao Excel (so os que existem).
    v_obs_rica := concat_ws(' · ',
      NULLIF(btrim(v_row.produto), ''),
      NULLIF(btrim(v_row.descricao), ''),
      NULLIF(btrim(v_row.observacao), '')
    );
    v_obs_rica := NULLIF(v_obs_rica, '');

    -- GUARD 2 — ofx_extrato_id null -> INSERT direto (orfao do Excel).
    IF v_row.ofx_extrato_id IS NULL THEN
      v_alvo := NULL; v_n_vinc := 0;
    ELSE
      -- GUARD 3 — buscar alvo via cbi (lancamento nao-cancelado).
      SELECT count(*) INTO v_n_vinc
      FROM conciliacao_bancaria_itens cbi
      JOIN financeiro_lancamentos_v2 l ON l.id = cbi.lancamento_id
      WHERE cbi.extrato_id = v_row.ofx_extrato_id
        AND l.cancelado = false;

      IF v_n_vinc > 1 THEN
        v_ambiguos := v_ambiguos + 1;
        CONTINUE;
      ELSIF v_n_vinc = 1 THEN
        SELECT l.* INTO v_alvo
        FROM conciliacao_bancaria_itens cbi
        JOIN financeiro_lancamentos_v2 l ON l.id = cbi.lancamento_id
        WHERE cbi.extrato_id = v_row.ofx_extrato_id
          AND l.cancelado = false
        LIMIT 1;

        -- GUARD 4 — editado_manual: proteger correcao manual, sem update parcial.
        IF COALESCE(v_alvo.editado_manual, false) = true THEN
          v_protegidos_manual := v_protegidos_manual + 1;
          CONTINUE;
        END IF;

        -- GUARD 5 — verdade bancaria: valor/sinal/data devem bater.
        IF v_alvo.valor IS DISTINCT FROM v_row.valor
           OR v_alvo.sinal IS DISTINCT FROM v_row.sinal
           OR v_alvo.data_pagamento IS DISTINCT FROM v_row.data_pagamento THEN
          v_divergentes_merge := v_divergentes_merge + 1;
          CONTINUE;
        END IF;

        -- GUARD 6 — MERGE: UPDATE enriquecendo o lancamento existente.
        -- NAO toca: valor, sinal, data_pagamento, data_competencia, conta_*,
        -- descricao, origem_lancamento, cenario, status_transacao, conciliado_em.
        UPDATE financeiro_lancamentos_v2
        SET fazenda_id     = COALESCE(v_row.fazenda_id, fazenda_id),
            favorecido_id  = COALESCE(v_fornecedor_id, favorecido_id),
            macro_custo    = v_row.macro_custo,
            grupo_custo    = v_row.grupo_custo,
            centro_custo   = v_row.centro_custo,
            subcentro      = v_row.subcentro,
            escopo_negocio = v_row.escopo_negocio,
            observacao     = v_obs_rica,
            staging_id     = v_row.staging_id,
            updated_by     = v_uid,
            updated_at     = now()
        WHERE id = v_alvo.id;

        UPDATE mesa_lancamento_staging
        SET status_promocao = 'promovido',
            lancamento_v2_id = v_alvo.id,
            promovido_em = now(),
            promovido_por = v_uid
        WHERE staging_id = v_row.staging_id;

        v_enriquecidos := v_enriquecidos + 1;
        CONTINUE;
      END IF;
    END IF;

    -- INSERT (guard 2 orfao, ou guard 3 com 0 vinculos): lancamento novo.
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

  RETURN jsonb_build_object('ok', true, 'sessao_id', p_sessao_id,
    'promovidos', v_promovidos,
    'enriquecidos', v_enriquecidos,
    'ja_promovidos', v_ja_promovido_ofx,
    'protegidos_manual', v_protegidos_manual,
    'ambiguos', v_ambiguos,
    'divergentes_merge', v_divergentes_merge);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_promover_staging(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_promover_staging(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_promover_staging(uuid) TO authenticated;
