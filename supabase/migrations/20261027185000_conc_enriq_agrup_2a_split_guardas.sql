-- PR-CONC-ENRIQ-AGRUP-2a — o desmembrar existente (fn_classificacao_split_substituir, o "Agrupar" da Mesa) ganha:
--   (a) GUARDAS DE ORIGEM com motivo escrito: so' desmembra lancamento CRU ou MANUAL (origem 'extrato', 'ofx',
--       'manual') sem nenhum vinculo de origem. Medido no proto em 01/10/2026 (lancamentos vivos):
--         recorrencia_id ......... 1.328 (origem 'recorrencia')
--         contrato_id ............   163 (origem 'contrato' 99 + 'barter' 64)
--         financiamento_id ......   893 (origem 'parcela_financiamento' 816 + 'financiamento' 66 + 11 sem origem/legado)
--         boitel_id/boitel_lote_id     0 hoje (a coluna existe; guarda preventiva)
--         movimentacao_rebanho_id   169 (Zoo)
--         parte VIVA de OC ......   525 (zoo_operacao_partes.cancelada = false) — 12 delas em lancamento 'ofx'/'manual'/'extrato'
--         transferencia ......... tipo '3-%' ou transferencia_grupo_id (4.199)
--       Qualquer outra origem (importacao_incremental, excel, mesa_excel, mesa_split, operacao_comercial, ...) recusa
--       com 'origem_nao_desmembravel'.
--   (b) GUARDA DE MES FECHADO, a mesma da fn_vincular_grupo_conciliacao (financeiro_fechamentos fechado na fazenda/mes),
--       conferida no consolidado E em cada lancamento novo (fazenda proposta, mes da competencia).
--   (c) COPIA TODOS OS CAMPOS DO apply_row: safra, tipo de documento, forma de pagamento, vencimento, numero do
--       documento, observacao e a competencia da regra do cru (a proposta; sem ela, a data da linha). COALESCE(proposta,
--       consolidado) como no apply_row overwrite — ausente = sistema, nunca apaga.
--   (d) GRUPO NOS VINCULOS NOVOS: grupo_id unico do desmembramento e tipo_aprovacao 'agrupamento_manual' (o modelo da
--       fn_vincular_grupo_conciliacao). Era 'manual' e sem grupo (33 vinculos vivos assim).
--   (e) SOMA das linhas = valor do consolidado AO CENTAVO (round 2), senao recusa (ja' existia com tolerancia 0,005;
--       agora comparada em centavos inteiros).
-- Todo UPDATE/DELETE com WHERE (pg_safeupdate no PostgREST). ACL: so' authenticated (sem anon, sem PUBLIC).
-- Corpo INTEGRAL (regra do CLAUDE.md); o anterior tinha md5(prosrc) 9d356b669f442e30420531fe3e498951.

CREATE OR REPLACE FUNCTION public.fn_classificacao_split_substituir(p_lancamento_id uuid, p_sessao_id uuid, p_staging_ids uuid[])
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
  v_grupo_id uuid := gen_random_uuid();
  v_comp date; v_faz uuid; v_mes text;
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

  -- (b2) PR-CONC-ENRIQ-AGRUP-2a — GUARDAS DE ORIGEM: só desmembra lançamento CRU/MANUAL sem vínculo de origem.
  --      Cancelar o consolidado quebraria a série da recorrência, a parcela do financiamento, o contrato, a OC e o Zoo.
  IF v_lan.recorrencia_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'origem_recorrencia',
      'mensagem', 'Lançamento de recorrência não se desmembra: desmembrar cancelaria uma parcela da série.');
  END IF;
  IF v_lan.contrato_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'origem_contrato',
      'mensagem', 'Lançamento de contrato (ou barter) não se desmembra: corrija pelo contrato.');
  END IF;
  IF v_lan.financiamento_id IS NOT NULL OR v_lan.origem_lancamento IN ('parcela_financiamento','financiamento') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'origem_financiamento',
      'mensagem', 'Parcela ou captação de financiamento não se desmembra: corrija pelo financiamento.');
  END IF;
  IF v_lan.boitel_id IS NOT NULL OR v_lan.boitel_lote_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'origem_boitel',
      'mensagem', 'Lançamento de boitel não se desmembra: corrija pela operação do boitel.');
  END IF;
  IF EXISTS (SELECT 1 FROM zoo_operacao_partes p WHERE p.financeiro_lancamento_id = p_lancamento_id AND p.cancelada = false) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'origem_oc_parte_viva',
      'mensagem', 'Lançamento vinculado a uma Operação Comercial não se desmembra: o caminho é a própria OC.');
  END IF;
  IF v_lan.movimentacao_rebanho_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'origem_zoo',
      'mensagem', 'Lançamento ligado a uma movimentação do rebanho não se desmembra: altere pelo Zootécnico.');
  END IF;
  IF v_lan.tipo_operacao LIKE '3-%' OR v_lan.transferencia_grupo_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'origem_transferencia',
      'mensagem', 'Transferência entre contas não se desmembra.');
  END IF;
  IF COALESCE(v_lan.origem_lancamento, '') NOT IN ('extrato','ofx','manual') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'origem_nao_desmembravel', 'origem', v_lan.origem_lancamento,
      'mensagem', format('Só se desmembra lançamento cru do extrato ou lançado à mão (este é "%s").', COALESCE(v_lan.origem_lancamento, 'sem origem')));
  END IF;

  -- (b3) PR-CONC-ENRIQ-AGRUP-2a — MÊS FECHADO do consolidado (a mesma regra da fn_vincular_grupo_conciliacao).
  IF EXISTS (
    SELECT 1 FROM financeiro_fechamentos f
    WHERE f.cliente_id = v_lan.cliente_id AND f.fazenda_id = v_lan.fazenda_id
      AND f.ano_mes = v_lan.ano_mes AND f.status_fechamento = 'fechado'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'mes_fechado', 'ano_mes', v_lan.ano_mes,
      'mensagem', format('O mês %s está fechado nesta fazenda: reabra antes de desmembrar.', v_lan.ano_mes));
  END IF;

  -- (c) lançamento é NÃO-EXPLICADO na sessão (nenhuma linha o referencia).
  IF EXISTS (
    SELECT 1 FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id
        AND NOT (staging_id = ANY(COALESCE(p_staging_ids, '{}'::uuid[])))
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
     AND match_status IN ('sem_match','sem_conta_para_match','candidatos_proximos','sugestao_split')
      AND (match_lancamento_id IS NULL OR match_lancamento_id = p_lancamento_id) AND match_lancamento_ids IS NULL
     AND aplicado = false;
  IF v_ok <> v_n THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_invalido'); END IF;

  -- (e) SOMA excel_valor = ABS(valor do lançamento) AO CENTAVO (PR-CONC-ENRIQ-AGRUP-2a: centavos inteiros).
  SELECT SUM(excel_valor) INTO v_soma_excel FROM financeiro_classificacao_staging WHERE staging_id = ANY(p_staging_ids);
  v_dif := round(v_soma_excel, 2) - round(ABS(v_lan.valor), 2);
  -- soma nula (linha sem valor) também recusa: NULL <> 0 é NULL, e o IF deixaria passar.
  IF v_soma_excel IS NULL OR v_dif <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'soma_divergente', 'soma', v_soma_excel, 'diferenca', v_dif,
      'mensagem', format('A soma da planilha difere do lançamento em R$ %s.', translate(to_char(abs(v_dif), 'FM999,999,990.00'), ',.', '.,')));
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
    -- (i) PR-CONC-ENRIQ-AGRUP-2a — MÊS FECHADO de cada lançamento NOVO (fazenda proposta, mês da competência).
    v_comp := COALESCE(NULLIF(v_s.update_proposto->>'data_competencia','')::date, v_s.excel_data);
    v_faz := COALESCE(NULLIF(v_s.update_proposto->>'fazenda_id','')::uuid, v_lan.fazenda_id);
    v_mes := to_char(v_comp, 'YYYY-MM');
    IF EXISTS (
      SELECT 1 FROM financeiro_fechamentos f
      WHERE f.cliente_id = v_cliente AND f.fazenda_id = v_faz
        AND f.ano_mes = v_mes AND f.status_fechamento = 'fechado'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'mes_fechado', 'ano_mes', v_mes, 'linha', v_s.excel_linha_origem,
        'mensagem', format('A linha %s cai no mês %s, que está fechado nesta fazenda.', v_s.excel_linha_origem, v_mes));
    END IF;
  END LOOP;

  -- ── EXECUÇÃO (atômica) ──────────────────────────────────────────────────
  -- 1) Criar os N lançamentos — PR-CONC-ENRIQ-AGRUP-2a: TODOS os campos do apply_row overwrite,
  --    COALESCE(proposta, consolidado): ausente = sistema, nunca apaga. Conta, sinal, tipo e data de
  --    pagamento seguem o consolidado/extrato (o banco manda). 2) marcar cada linha staging (espelho do
  --    apply_row: aplicado=true + auditoria + match_lancamento_id; estado_anterior=NULL pois o lançamento
  --    é NOVO — a reversão do desmembramento vem com a tabela de blocos, PR 2b).
  FOR v_s IN SELECT * FROM financeiro_classificacao_staging
             WHERE staging_id = ANY(p_staging_ids) ORDER BY excel_linha_origem
  LOOP
    v_comp := COALESCE(NULLIF(v_s.update_proposto->>'data_competencia','')::date, v_s.excel_data);
    INSERT INTO financeiro_lancamentos_v2 (
      cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id,
      ano_mes, data_competencia, data_pagamento, data_vencimento, valor, sinal, tipo_operacao,
      status_transacao, descricao, observacao, numero_documento,
      subcentro, macro_custo, grupo_custo, centro_custo, plano_conta_id, favorecido_id,
      safra_id, tipo_documento, forma_pagamento,
      origem_lancamento, created_by, sem_movimentacao_caixa
    ) VALUES (
      v_cliente,
      COALESCE(NULLIF(v_s.update_proposto->>'fazenda_id','')::uuid, v_lan.fazenda_id),
      v_lan.conta_bancaria_id, v_lan.conta_destino_id,
      to_char(v_comp, 'YYYY-MM'), -- inerte: trg_00_ano_mes_from_competencia deriva de data_competencia
      v_comp, v_ext.data_movimento, -- data_pagamento = data do extrato vinculado
      COALESCE(NULLIF(v_s.update_proposto->>'data_vencimento','')::date, v_lan.data_vencimento),
      v_s.excel_valor, v_lan.sinal, v_lan.tipo_operacao,
      'realizado',
      COALESCE(NULLIF(v_s.update_proposto->>'produto', ''), NULLIF(v_s.excel_produto, ''), NULLIF(v_s.excel_observacao, ''), 'Detalhe ' || v_s.excel_linha_origem),
      NULLIF(trim(COALESCE(NULLIF(v_s.update_proposto->>'observacao', ''), v_s.excel_observacao, '') || ' ' ||
        format('[split: stg=%s consol=%s ofx=%s sessao=%s]',
          left(v_s.staging_id::text, 8), left(p_lancamento_id::text, 8),
          left(v_extrato_id::text, 8), left(p_sessao_id::text, 8))), ''),
      COALESCE(NULLIF(v_s.update_proposto->>'numero_documento', ''), v_lan.numero_documento),
      v_s.update_proposto->>'subcentro', v_s.update_proposto->>'macro_custo',
      v_s.update_proposto->>'grupo_custo', v_s.update_proposto->>'centro_custo',
      NULLIF(v_s.update_proposto->>'plano_conta_id', '')::uuid,
      COALESCE(NULLIF(v_s.update_proposto->>'favorecido_id', '')::uuid, v_lan.favorecido_id),
      COALESCE(NULLIF(v_s.update_proposto->>'safra_id', '')::uuid, v_lan.safra_id),
      COALESCE(NULLIF(v_s.update_proposto->>'tipo_documento', ''), v_lan.tipo_documento),
      COALESCE(NULLIF(v_s.update_proposto->>'forma_pagamento', ''), v_lan.forma_pagamento),
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

  -- 4) Religar: INSERT cbi por lançamento novo — PR-CONC-ENRIQ-AGRUP-2a: no modelo da
  --    fn_vincular_grupo_conciliacao (um grupo_id para o desmembramento, tipo 'agrupamento_manual').
  FOR v_s IN SELECT * FROM financeiro_classificacao_staging
             WHERE staging_id = ANY(p_staging_ids) ORDER BY excel_linha_origem
  LOOP
    INSERT INTO conciliacao_bancaria_itens (
      cliente_id, extrato_id, lancamento_id, valor_aplicado, grupo_id,
      criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
      snapshot_extrato_valor, snapshot_lancamento_valor,
      snapshot_extrato_data, snapshot_lancamento_data
    ) VALUES (
      v_cliente, v_extrato_id, v_s.match_lancamento_id, v_s.excel_valor, v_grupo_id,
      v_uid, 'agrupamento_manual', v_uid, now(),
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
    'grupo_id', v_grupo_id,
    'status_extrato_final', v_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_classificacao_split_substituir(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_classificacao_split_substituir(uuid, uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_split_substituir(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_split_substituir(uuid, uuid, uuid[]) TO service_role;
