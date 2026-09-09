CREATE OR REPLACE FUNCTION public.fn_extrato_desfazer_arquivo(p_importacao_id uuid, p_motivo text DEFAULT 'arquivo_desfeito', p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_imp record; v_uid uuid := auth.uid(); v_agora timestamptz := now();
  v_meses text[]; v_fechado text;
  v_ext record; v_cbi record; v_lan record; v_aud jsonb;
  n_ext int := 0; n_cru int := 0; n_cru_edit int := 0; n_subst int := 0; n_subst_audit int := 0;
  n_manual int := 0; n_sem_par int := 0; n_multi int := 0;
  v_ids_cru uuid[] := '{}'; v_ids_subst uuid[] := '{}'; v_ids_manual uuid[] := '{}';
BEGIN
  SELECT * INTO v_imp FROM financeiro_importacoes_v2 WHERE id = p_importacao_id;
  IF v_imp.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'importacao_nao_encontrada'); END IF;
  IF v_imp.status = 'cancelada' OR v_imp.cancelado_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'importacao_ja_cancelada');
  END IF;

  SELECT array_agg(DISTINCT to_char(data_movimento,'YYYY-MM')) INTO v_meses
    FROM extrato_bancario_v2 WHERE importacao_id = p_importacao_id AND cancelado_em IS NULL;
  SELECT string_agg(f.ano_mes, ', ') INTO v_fechado
    FROM financeiro_fechamentos f
   WHERE f.cliente_id = v_imp.cliente_id AND f.status_fechamento = 'fechado' AND f.ano_mes = ANY(COALESCE(v_meses,'{}'));
  IF v_fechado IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'mes_fechado', 'meses', v_fechado);
  END IF;

  FOR v_ext IN SELECT * FROM extrato_bancario_v2 WHERE importacao_id = p_importacao_id AND cancelado_em IS NULL LOOP
    n_ext := n_ext + 1;
    SELECT count(*) INTO n_multi FROM conciliacao_bancaria_itens WHERE extrato_id = v_ext.id AND desfeito_em IS NULL;
    IF n_multi = 0 THEN n_sem_par := n_sem_par + 1; END IF;

    FOR v_cbi IN SELECT * FROM conciliacao_bancaria_itens WHERE extrato_id = v_ext.id AND desfeito_em IS NULL LOOP
      SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = v_cbi.lancamento_id;

      IF v_cbi.tipo_aprovacao = 'ofx_cru' THEN
        n_cru := n_cru + 1;
        IF COALESCE(v_lan.editado_manual,false) THEN n_cru_edit := n_cru_edit + 1; END IF;
        v_ids_cru := v_ids_cru || v_lan.id;
        IF NOT p_simular THEN
          UPDATE conciliacao_bancaria_itens SET desfeito_em = v_agora, desfeito_por = v_uid, desfeito_motivo = p_motivo WHERE id = v_cbi.id;
          UPDATE financeiro_lancamentos_v2
             SET cancelado = true, cancelado_em = v_agora, cancelado_por = v_uid,
                 cancelado_motivo = 'arquivo desfeito: ' || COALESCE(v_imp.nome_arquivo,'?'),
                 updated_by = v_uid, updated_at = v_agora
           WHERE id = v_lan.id AND cancelado IS DISTINCT FROM true;
        END IF;

      ELSIF v_cbi.tipo_aprovacao = 'ofx_substituiu' THEN
        n_subst := n_subst + 1;
        v_ids_subst := v_ids_subst || v_lan.id;
        SELECT a.dados_anteriores INTO v_aud FROM audit_log a
         WHERE a.registro_id = v_lan.id AND a.tabela_origem = 'financeiro_lancamentos_v2'
           AND a.created_at BETWEEN v_cbi.created_at - interval '5 seconds' AND v_cbi.created_at + interval '5 seconds'
         ORDER BY a.created_at LIMIT 1;
        IF v_aud IS NOT NULL THEN n_subst_audit := n_subst_audit + 1; END IF;
        IF NOT p_simular THEN
          UPDATE conciliacao_bancaria_itens SET desfeito_em = v_agora, desfeito_por = v_uid, desfeito_motivo = p_motivo WHERE id = v_cbi.id;
          IF v_aud IS NOT NULL THEN
            UPDATE financeiro_lancamentos_v2
               SET data_pagamento = (v_aud->>'data_pagamento')::date,
                   data_vencimento = (v_aud->>'data_vencimento')::date,
                   valor = (v_aud->>'valor')::numeric,
                   status_transacao = COALESCE(v_aud->>'status_transacao', status_transacao),
                   updated_by = v_uid, updated_at = v_agora
             WHERE id = v_lan.id;
          ELSE
            UPDATE financeiro_lancamentos_v2
               SET data_pagamento = v_cbi.snapshot_lancamento_data,
                   valor = COALESCE(v_cbi.snapshot_lancamento_valor, valor),
                   updated_by = v_uid, updated_at = v_agora
             WHERE id = v_lan.id;
          END IF;
        END IF;

      ELSE
        n_manual := n_manual + 1;
        v_ids_manual := v_ids_manual || v_lan.id;
        IF NOT p_simular THEN
          UPDATE conciliacao_bancaria_itens SET desfeito_em = v_agora, desfeito_por = v_uid, desfeito_motivo = p_motivo WHERE id = v_cbi.id;
        END IF;
      END IF;
    END LOOP;

    IF NOT p_simular THEN
      UPDATE extrato_bancario_v2 SET status = 'nao_conciliado', cancelado_em = v_agora, cancelado_por = v_uid, cancelado_motivo = p_motivo, updated_at = v_agora WHERE id = v_ext.id;
      INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, importacao_id, ano_mes, motivo, payload_depois)
      VALUES ('importacao_revertida', v_uid, v_imp.cliente_id, v_ext.id, p_importacao_id, to_char(v_ext.data_movimento,'YYYY-MM'), p_motivo,
              jsonb_build_object('vinculos_desfeitos', n_multi));
    END IF;
  END LOOP;

  IF NOT p_simular THEN
    UPDATE financeiro_importacoes_v2 SET status = 'cancelada', cancelado_em = v_agora, cancelado_motivo = p_motivo, updated_at = v_agora WHERE id = p_importacao_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'simulado', p_simular, 'arquivo', v_imp.nome_arquivo, 'meses', v_meses,
    'extratos', n_ext, 'sem_par', n_sem_par,
    'crus_cancelados', n_cru, 'crus_enriquecidos', n_cru_edit,
    'substituidos_restaurados', n_subst, 'substituidos_com_audit', n_subst_audit,
    'vinculos_manuais_desfeitos', n_manual,
    'ids_cru', to_jsonb(v_ids_cru), 'ids_subst', to_jsonb(v_ids_subst), 'ids_manual', to_jsonb(v_ids_manual));
END $function$;
