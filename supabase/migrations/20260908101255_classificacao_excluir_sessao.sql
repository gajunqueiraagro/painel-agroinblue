-- 20260908101255 classificacao_excluir_sessao (aplicada no proto via Management API em 08/09/2026)

CREATE OR REPLACE FUNCTION public.fn_classificacao_excluir_sessao(p_sessao_id uuid, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE v_uid uuid; v_cli uuid; n_total int; n_gravadas int; n_apagadas int := 0;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  SELECT cliente_id, count(*), count(*) FILTER (WHERE aplicado OR match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido'))
    INTO v_cli, n_total, n_gravadas
    FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id GROUP BY cliente_id;
  IF v_cli IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='sessao inexistente ou vazia'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_cli IN (SELECT public.get_user_cliente_ids(v_uid))) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente'; END IF;
  IF n_gravadas > 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_com_linhas_gravadas', 'linhas', n_total, 'gravadas', n_gravadas, 'simulado', p_simular);
  END IF;
  IF p_simular THEN RETURN jsonb_build_object('ok', true, 'simulado', true, 'linhas', n_total, 'gravadas', 0); END IF;
  DELETE FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id; GET DIAGNOSTICS n_apagadas = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'linhas', n_total, 'apagadas', n_apagadas);
END; $fn$;
REVOKE ALL ON FUNCTION public.fn_classificacao_excluir_sessao(uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_excluir_sessao(uuid,boolean) TO authenticated;

