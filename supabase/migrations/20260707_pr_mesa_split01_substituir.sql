-- ============================================================================
-- PR-MESA-SPLIT-01 — Substituir consolidado por detalhes do Excel (ato único, atômico).
--
-- "O sistema explica, o operador decide — e o sistema executa." [Princípio 9]
-- Inverso do GRUPO-01: 1 lançamento consolidado (não explicado) → N lançamentos
-- detalhados do Excel, cancelando o consolidado e religando o MESMO OFX aos N novos.
-- Encapsula o roteiro manual de 12 passos numa transação (plpgsql = atômico).
--
-- CAMINHO A (decisão do Gabriel): a fn_vincular_extrato_lancamento é 1:1 por desenho
-- (GUARD 3 bloqueia 2º vínculo no mesmo extrato — "split fica para o Modo Avançado").
-- NÃO relaxamos essa função compartilhada. Esta RPC é a DONA do religamento N:1 e faz
-- os próprios INSERTs em conciliacao_bancaria_itens, ESPELHANDO o INSERT da fn_vincular
-- (mesmos snapshots, tipo_aprovacao='manual', auditoria, valor_aplicado) e recomputando
-- o status do extrato ao final com a MESMA regra vigente (conciliacaoSync). A lógica N:1
-- fica confinada AQUI; fn_vincular permanece 1:1 e INTOCADA.
--
-- Rastreabilidade (Gabriel, obrigatória): financeiro_lancamentos_v2 NÃO tem coluna
-- jsonb de metadados → usamos observação estruturada (opção 3 do briefing):
--   observacao = <excel_observacao> [split: stg=<uuid8> consol=<uuid8> ofx=<uuid8> sessao=<uuid8>]
-- PROIBIDO criar coluna nova. Nenhum ALTER de tabela nesta migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_classificacao_split_substituir(
  p_lancamento_id uuid, p_sessao_id uuid, p_staging_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente uuid; v_uid uuid;
  v_lan financeiro_lancamentos_v2%ROWTYPE;
  v_ext extrato_bancario_v2%ROWTYPE;
  v_extratos uuid[]; v_extrato_id uuid;
  v_conta_lanc uuid[];
  v_n int; v_dist int; v_ok int;
  v_soma_excel numeric; v_dif numeric;
  v_s financeiro_classificacao_staging%ROWTYPE;
  v_novo_id uuid; v_criados uuid[] := ARRAY[]::uuid[];
  v_soma numeric; v_status text;
BEGIN
  SELECT cliente_id INTO v_cliente FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cliente IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_vazia_ou_inexistente'); END IF;

  -- (a) permissão (guard de cliente padrão).
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_cliente IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  -- (b) lançamento existe, vivo, realizado.
  SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id AND cliente_id = v_cliente;
  IF NOT FOUND OR COALESCE(v_lan.cancelado, false) = true OR v_lan.status_transacao <> 'realizado' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_inexistente_ou_cancelado');
  END IF;

  -- (c) lançamento é NÃO-EXPLICADO na sessão (nenhuma linha o referencia).
  IF EXISTS (
    SELECT 1 FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id
      AND (match_lancamento_id = p_lancamento_id
           OR p_lancamento_id = ANY(COALESCE(match_lancamento_ids, ARRAY[]::uuid[])))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_referenciado');
  END IF;

  -- (d) staging_ids: >=2, sem duplicatas, todos da sessão, SEM match, elegíveis, não aplicados.
  IF p_staging_ids IS NULL OR array_length(p_staging_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lista_vazia');
  END IF;
  v_n := array_length(p_staging_ids, 1);
  SELECT COUNT(DISTINCT x) INTO v_dist FROM unnest(p_staging_ids) AS x;
  IF v_dist <> v_n THEN RETURN jsonb_build_object('ok', false, 'motivo', 'ids_duplicados'); END IF;
  IF v_n < 2 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'poucos_itens'); END IF;
  SELECT COUNT(*) INTO v_ok FROM financeiro_classificacao_staging
   WHERE staging_id = ANY(p_staging_ids) AND sessao_id = p_sessao_id
     AND match_status IN ('sem_match','sem_conta_para_match','candidatos_proximos')
     AND match_lancamento_id IS NULL AND match_lancamento_ids IS NULL
     AND aplicado = false;
  IF v_ok <> v_n THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_invalido'); END IF;

  -- (e) SOMA excel_valor = ABS(valor do lançamento) ± 0,005.
  SELECT SUM(excel_valor) INTO v_soma_excel FROM financeiro_classificacao_staging WHERE staging_id = ANY(p_staging_ids);
  v_dif := v_soma_excel - ABS(v_lan.valor);
  IF ABS(v_dif) > 0.005 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'soma_divergente', 'soma', v_soma_excel, 'diferenca', v_dif);
  END IF;

  -- (f) conta compatível (MESMA expressão da composicao_sugerida).
  v_conta_lanc := array_remove(ARRAY[v_lan.conta_bancaria_id, v_lan.conta_destino_id], NULL);
  SELECT COUNT(*) INTO v_ok FROM financeiro_classificacao_staging s
   WHERE s.staging_id = ANY(p_staging_ids)
     AND ((s.conta_origem_id = ANY(v_conta_lanc) OR s.conta_destino_id = ANY(v_conta_lanc))
          OR (s.conta_origem_id IS NULL AND s.conta_destino_id IS NULL));
  IF v_ok <> v_n THEN RETURN jsonb_build_object('ok', false, 'motivo', 'conta_incompativel'); END IF;

  -- (g) vínculos cbi ATIVOS do lançamento: exatamente 1 extrato; valor casando.
  SELECT array_agg(DISTINCT extrato_id) INTO v_extratos
    FROM conciliacao_bancaria_itens WHERE lancamento_id = p_lancamento_id AND desfeito_em IS NULL;
  IF v_extratos IS NULL OR array_length(v_extratos, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_vinculo_ofx');
  END IF;
  IF array_length(v_extratos, 1) > 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'multi_extrato_nao_suportado');
  END IF;
  v_extrato_id := v_extratos[1];
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = v_extrato_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_vinculo_ofx'); END IF;
  IF ABS(ABS(v_ext.valor) - ABS(v_lan.valor)) > 0.005 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_divergente', 'valor_extrato', v_ext.valor, 'valor_lancamento', v_lan.valor);
  END IF;

  -- (h) subcentro CANÔNICO — validação prévia (ANTES de qualquer INSERT).
  -- Espelha EXATAMENTE a condição de RAISE do trigger resolve_classificacao_from_plano
  -- (fonte da 23514): bloqueia quando o subcentro efetivo (update_proposto->>'subcentro')
  -- NÃO é NULL, NÃO existe em financeiro_plano_contas (ativo=true, mesma consulta da
  -- "Tentativa 2" do trigger — sem filtro de cliente/tipo), e macro_custo IS DISTINCT
  -- FROM 'Dividendos' (mesma exceção do trigger). ZERO normalização: não parseia caminho,
  -- não adivinha canônico, não insere NULL silenciosamente — o operador classifica na Mesa.
  FOR v_s IN SELECT * FROM financeiro_classificacao_staging
             WHERE staging_id = ANY(p_staging_ids) ORDER BY excel_linha_origem
  LOOP
    IF (v_s.update_proposto->>'subcentro') IS NOT NULL
       AND (v_s.update_proposto->>'macro_custo') IS DISTINCT FROM 'Dividendos'
       AND NOT EXISTS (
         SELECT 1 FROM public.financeiro_plano_contas
         WHERE ativo = true AND subcentro = v_s.update_proposto->>'subcentro'
       ) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'subcentro_nao_canonico',
        'linha', v_s.excel_linha_origem,
        'subcentro', v_s.update_proposto->>'subcentro',
        'mensagem', format('Classifique a linha %s com um subcentro canônico na Mesa antes de substituir.', v_s.excel_linha_origem));
    END IF;
  END LOOP;

  -- ── EXECUÇÃO (atômica) ──────────────────────────────────────────────────
  -- 1) Criar os N lançamentos (classificação do update_proposto — mesmo mapeamento
  --    do apply_row overwrite) + 2) marcar cada linha staging (espelho do apply_row:
  --    aplicado=true + auditoria + match_lancamento_id; estado_anterior=NULL pois o
  --    lançamento é NOVO — não há estado a reverter, e reverter_row recusa NULL).
  FOR v_s IN SELECT * FROM financeiro_classificacao_staging
             WHERE staging_id = ANY(p_staging_ids) ORDER BY excel_linha_origem
  LOOP
    INSERT INTO financeiro_lancamentos_v2 (
      cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id,
      ano_mes, data_competencia, data_pagamento, valor, sinal, tipo_operacao,
      status_transacao, descricao, observacao,
      subcentro, macro_custo, grupo_custo, centro_custo, plano_conta_id, favorecido_id,
      origem_lancamento, created_by, sem_movimentacao_caixa
    ) VALUES (
      v_cliente,
      COALESCE(NULLIF(v_s.update_proposto->>'fazenda_id','')::uuid, v_lan.fazenda_id),
      v_lan.conta_bancaria_id, v_lan.conta_destino_id,
      COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM')),
      v_s.excel_data, v_s.excel_data, v_s.excel_valor, v_lan.sinal, v_lan.tipo_operacao,
      'realizado',
      COALESCE(NULLIF(v_s.excel_produto, ''), NULLIF(v_s.excel_observacao, ''), 'Detalhe ' || v_s.excel_linha_origem),
      NULLIF(trim(COALESCE(v_s.excel_observacao, '') || ' ' ||
        format('[split: stg=%s consol=%s ofx=%s sessao=%s]',
          left(v_s.staging_id::text, 8), left(p_lancamento_id::text, 8),
          left(v_extrato_id::text, 8), left(p_sessao_id::text, 8))), ''),
      v_s.update_proposto->>'subcentro', v_s.update_proposto->>'macro_custo',
      v_s.update_proposto->>'grupo_custo', v_s.update_proposto->>'centro_custo',
      NULLIF(v_s.update_proposto->>'plano_conta_id', '')::uuid,
      NULLIF(v_s.update_proposto->>'favorecido_id', '')::uuid,
      'mesa_split', v_uid, false
    ) RETURNING id INTO v_novo_id;

    v_criados := array_append(v_criados, v_novo_id);

    UPDATE financeiro_classificacao_staging
       SET aplicado = true, aplicado_em = now(), aplicado_por = v_uid,
           match_lancamento_id = v_novo_id, estado_anterior = NULL, updated_at = now()
     WHERE staging_id = v_s.staging_id;
  END LOOP;

  -- 3) Cancelar o consolidado (o trigger trg_cbi_desfazer_on_cancelamento desfaz o cbi dele).
  UPDATE financeiro_lancamentos_v2
     SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid,
         updated_at = now(), updated_by = v_uid
   WHERE id = p_lancamento_id;

  -- 4) Religar: INSERT cbi por lançamento novo (ESPELHO do INSERT da fn_vincular).
  FOR v_s IN SELECT * FROM financeiro_classificacao_staging
             WHERE staging_id = ANY(p_staging_ids) ORDER BY excel_linha_origem
  LOOP
    INSERT INTO conciliacao_bancaria_itens (
      cliente_id, extrato_id, lancamento_id, valor_aplicado,
      criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
      snapshot_extrato_valor, snapshot_lancamento_valor,
      snapshot_extrato_data, snapshot_lancamento_data
    ) VALUES (
      v_cliente, v_extrato_id, v_s.match_lancamento_id, v_s.excel_valor,
      v_uid, 'manual', v_uid, now(),
      v_ext.valor, v_s.excel_valor,
      v_ext.data_movimento, v_s.excel_data
    );
  END LOOP;

  -- Recompute do status do extrato UMA vez ao final (regra literal do conciliacaoSync;
  -- resultado idêntico a recomputar a cada vínculo — o extrato fecha com N vínculos).
  SELECT COALESCE(sum(valor_aplicado), 0) INTO v_soma
    FROM conciliacao_bancaria_itens WHERE extrato_id = v_extrato_id AND desfeito_em IS NULL;
  IF v_soma <= 0 THEN v_status := 'nao_conciliado';
  ELSIF v_soma + 0.005 >= abs(v_ext.valor) THEN v_status := 'conciliado';
  ELSE v_status := 'parcial';
  END IF;
  UPDATE extrato_bancario_v2 SET status = v_status WHERE id = v_extrato_id;

  RETURN jsonb_build_object(
    'ok', true, 'motivo', 'substituido',
    'lancamentos_criados', to_jsonb(v_criados),
    'consolidado_cancelado', p_lancamento_id,
    'extrato_religado', v_extrato_id,
    'status_extrato_final', v_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_classificacao_split_substituir(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_classificacao_split_substituir(uuid, uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_split_substituir(uuid, uuid, uuid[]) TO authenticated;
