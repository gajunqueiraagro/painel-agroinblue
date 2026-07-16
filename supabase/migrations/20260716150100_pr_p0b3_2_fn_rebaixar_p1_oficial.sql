-- PR-P1-OFICIALIZACAO-P0B3 — Migração 2: fn_rebaixar_p1_oficial (INTERNA, sem grant)
-- Transicao unica oficial->reaberto (WHERE status=oficial), versao++ e EXATAMENTE 1 log
--   (contrato enxuto 8 colunas; motivo=p_motivo literal; reaberto_por=auth.uid() NULL-aceitavel)
--   SOMENTE quando houve_transicao. Preserva o selo. Usada pela RPC e pelo A8A.

CREATE OR REPLACE FUNCTION public.fn_rebaixar_p1_oficial(
  p_fechamento_p1_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();   -- NULL aceitavel em contexto residual; nao inventar autoria
  v_row RECORD;
  v_houve boolean := false;
  v_log_gravado boolean := false;
BEGIN
  -- transicao REAL somente oficial->reaberto; versao++ uma unica vez; captura identidade p/ log
  UPDATE public.fechamento_p1
     SET status='reaberto', versao=versao+1, reaberto_em=now(), reaberto_por=v_uid
   WHERE id=p_fechamento_p1_id AND status='oficial'
  RETURNING fazenda_id, cliente_id, ano_mes, versao INTO v_row;

  v_houve := FOUND;

  IF v_houve THEN
    -- exatamente 1 log de rebaixamento, contrato enxuto de 8 colunas, p_motivo literal
    INSERT INTO public.fechamento_reaberturas_log
      (fazenda_id, cliente_id, ano_mes, pilar, motivo, reaberto_por, reaberto_em)
    VALUES
      (v_row.fazenda_id, v_row.cliente_id, v_row.ano_mes, 'p1_mapa_pastos', p_motivo, v_uid, now());
    v_log_gravado := true;
  END IF;
  -- Campos do ULTIMO selo NAO sao apagados (auditoria).

  RETURN jsonb_build_object(
    'houve_transicao', v_houve,
    'status_anterior', CASE WHEN v_houve THEN 'oficial' ELSE NULL END,
    'versao_nova',     CASE WHEN v_houve THEN v_row.versao ELSE NULL END,
    'log_gravado',     v_log_gravado
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_rebaixar_p1_oficial(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_rebaixar_p1_oficial(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_rebaixar_p1_oficial(uuid, text) FROM authenticated;
COMMENT ON FUNCTION public.fn_rebaixar_p1_oficial(uuid, text) IS
  'INTERNA (sem grant). Transicao unica oficial->reaberto (WHERE status=oficial) com versao++ e EXATAMENTE 1 log (contrato enxuto 8 colunas, motivo=p_motivo literal, reaberto_por=auth.uid() NULL-aceitavel) SOMENTE quando houve_transicao. Preserva o selo. Retorna {houve_transicao,status_anterior,versao_nova,log_gravado}. Chamada pela RPC (governanca) e pelo A8A (residual). RPC NAO grava segundo log de rebaixamento; logs de invalidacao de P2 sao independentes.';
