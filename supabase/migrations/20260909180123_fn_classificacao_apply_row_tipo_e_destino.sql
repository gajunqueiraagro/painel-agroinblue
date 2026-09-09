CREATE OR REPLACE FUNCTION public.fn_classificacao_apply_row(p_staging_id uuid, p_overwrite boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conciliado boolean := false; v_staging financeiro_classificacao_staging%ROWTYPE; v_lanc financeiro_lancamentos_v2%ROWTYPE; v_proposto jsonb; v_estado jsonb; v_user_id uuid;
BEGIN
  IF p_staging_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'p_staging_id obrigatorio', 'lancamento_id', NULL, 'estado_anterior', NULL); END IF;
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'staging_nao_encontrada', 'lancamento_id', NULL, 'estado_anterior', NULL); END IF;
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'sem_permissao', 'lancamento_id', v_staging.match_lancamento_id, 'estado_anterior', NULL); END IF;
  IF v_staging.match_lancamento_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'sem_lancamento_vinculado', 'lancamento_id', NULL, 'estado_anterior', NULL); END IF;
  SELECT * INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = v_staging.match_lancamento_id;
  v_conciliado := EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = v_staging.match_lancamento_id AND c.desfeito_em IS NULL);
  IF NOT FOUND OR v_lanc.cancelado = true THEN
    UPDATE financeiro_classificacao_staging SET erro_apply = 'lancamento nao encontrado ou cancelado', aplicado = false WHERE staging_id = p_staging_id;
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'lancamento_inexistente_ou_cancelado', 'lancamento_id', v_staging.match_lancamento_id, 'estado_anterior', NULL); END IF;
  IF NOT p_overwrite AND v_lanc.subcentro IS NOT NULL THEN
    UPDATE financeiro_classificacao_staging SET erro_apply = 'subcentro ja preenchido no banco (conservador)', aplicado = false, match_status = 'ja_classificado' WHERE staging_id = p_staging_id;
    RETURN jsonb_build_object('ok', true, 'aplicado', false, 'motivo', 'pulado_subcentro_preenchido', 'lancamento_id', v_lanc.id, 'estado_anterior', NULL); END IF;

  v_proposto := v_staging.update_proposto;
  -- 20260908: conta do plano fora do plano oficial nunca chega ao gravador: mantem a atual (o Resultado da tela e a fonte; texto cru da planilha e so aviso)
  IF NULLIF(v_proposto->>'subcentro','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM financeiro_plano_contas pc WHERE pc.subcentro = v_proposto->>'subcentro' AND pc.ativo IS NOT FALSE) THEN
    v_proposto := v_proposto - ARRAY['subcentro','macro_custo','grupo_custo','centro_custo','plano_conta_id'];
  END IF;
  v_estado := COALESCE(v_staging.estado_anterior, jsonb_build_object('subcentro', v_lanc.subcentro, 'macro_custo', v_lanc.macro_custo, 'grupo_custo', v_lanc.grupo_custo,
    'centro_custo', v_lanc.centro_custo, 'plano_conta_id', v_lanc.plano_conta_id, 'favorecido_id', v_lanc.favorecido_id, 'fazenda_id', v_lanc.fazenda_id,
    'descricao', v_lanc.descricao, 'numero_documento', v_lanc.numero_documento,
    'data_competencia', v_lanc.data_competencia, 'data_vencimento', v_lanc.data_vencimento, 'data_pagamento', v_lanc.data_pagamento,
    'safra_id', v_lanc.safra_id, 'conta_bancaria_id', v_lanc.conta_bancaria_id, 'observacao', v_lanc.observacao));

  IF p_overwrite THEN
    UPDATE financeiro_lancamentos_v2 SET subcentro = COALESCE(v_proposto->>'subcentro', subcentro), macro_custo = COALESCE(v_proposto->>'macro_custo', macro_custo),
      grupo_custo = COALESCE(v_proposto->>'grupo_custo', grupo_custo), centro_custo = COALESCE(v_proposto->>'centro_custo', centro_custo),
      plano_conta_id = COALESCE(NULLIF(v_proposto->>'plano_conta_id','')::uuid, plano_conta_id), favorecido_id = COALESCE(NULLIF(v_proposto->>'favorecido_id','')::uuid, favorecido_id),
      fazenda_id = COALESCE(NULLIF(v_proposto->>'fazenda_id','')::uuid, fazenda_id),
      tipo_operacao = COALESCE(NULLIF(v_proposto->>'tipo_operacao',''), tipo_operacao),
      conta_destino_id = CASE WHEN COALESCE(NULLIF(v_proposto->>'tipo_operacao',''), tipo_operacao) IN ('3-Transferências','3-Transferência')
                              THEN COALESCE(NULLIF(v_proposto->>'conta_destino_id','')::uuid, conta_destino_id)
                              ELSE NULL END,
      descricao = COALESCE(NULLIF(v_proposto->>'produto',''), descricao),
      numero_documento = COALESCE(NULLIF(v_proposto->>'numero_documento',''), numero_documento),
      data_competencia = COALESCE(NULLIF(v_proposto->>'data_competencia','')::date, data_competencia),
      data_vencimento = COALESCE(NULLIF(v_proposto->>'data_vencimento','')::date, data_vencimento),
      data_pagamento = CASE WHEN v_conciliado THEN data_pagamento ELSE COALESCE(NULLIF(v_proposto->>'data_pagamento', '')::date, data_pagamento) END,
      safra_id = COALESCE(NULLIF(v_proposto->>'safra_id','')::uuid, safra_id),
      conta_bancaria_id = CASE WHEN v_conciliado THEN conta_bancaria_id ELSE COALESCE(NULLIF(v_proposto->>'conta_bancaria_id', '')::uuid, conta_bancaria_id) END,
      observacao = COALESCE(NULLIF(v_proposto->>'observacao',''), observacao),
      updated_at = now() WHERE id = v_lanc.id;
  ELSE
    UPDATE financeiro_lancamentos_v2 SET subcentro = COALESCE(subcentro, v_proposto->>'subcentro'), macro_custo = COALESCE(macro_custo, v_proposto->>'macro_custo'),
      grupo_custo = COALESCE(grupo_custo, v_proposto->>'grupo_custo'), centro_custo = COALESCE(centro_custo, v_proposto->>'centro_custo'),
      plano_conta_id = COALESCE(plano_conta_id, NULLIF(v_proposto->>'plano_conta_id','')::uuid), favorecido_id = COALESCE(favorecido_id, NULLIF(v_proposto->>'favorecido_id','')::uuid),
      fazenda_id = COALESCE(fazenda_id, NULLIF(v_proposto->>'fazenda_id','')::uuid),
      descricao = COALESCE(descricao, NULLIF(v_proposto->>'produto','')),
      numero_documento = COALESCE(numero_documento, NULLIF(v_proposto->>'numero_documento','')),
      data_vencimento = COALESCE(data_vencimento, NULLIF(v_proposto->>'data_vencimento','')::date),
      safra_id = COALESCE(safra_id, NULLIF(v_proposto->>'safra_id','')::uuid),
      conta_bancaria_id = COALESCE(conta_bancaria_id, NULLIF(v_proposto->>'conta_bancaria_id','')::uuid),
      observacao = COALESCE(observacao, NULLIF(v_proposto->>'observacao','')),
      updated_at = now() WHERE id = v_lanc.id;
  END IF;

  UPDATE financeiro_classificacao_staging SET aplicado = true, aplicado_em = now(), aplicado_por = v_user_id, estado_anterior = v_estado, erro_apply = NULL WHERE staging_id = p_staging_id;
  RETURN jsonb_build_object('ok', true, 'aplicado', true, 'motivo', CASE WHEN p_overwrite THEN 'aplicado_overwrite' ELSE 'aplicado_conservador' END, 'lancamento_id', v_lanc.id, 'estado_anterior', v_estado);
END;
$function$
