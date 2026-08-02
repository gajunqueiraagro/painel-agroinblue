-- PR-OC-REABRIR-PARA-ESTORNO-01 — writer ADMINISTRATIVO de recuperação de OC cancelada pelo contrato
--   antigo que ainda possui efeitos downstream ATIVOS. NÃO é "descancelar" comercial: restaura apenas
--   temporariamente o status_comercial anterior (registrado na auditoria) para habilitar os writers
--   oficiais de estorno (frentes seguintes). Depois dos estornos, a OC volta a ser cancelada pelo
--   oc_cancelar já blindado. Estado final continua 'cancelada'. Não cria status novo.
--   Restrito a ADMIN (is_admin_agroinblue); sem UI. Toca SOMENTE a linha da operação (status + metadados
--   de cancelamento → NULL + versao+1). NÃO toca lotes/entrega/movimentações/compromissos/programações/
--   parcelas/partes/títulos/liquidações. Gera estorno_id (correlation_id) reutilizável nas etapas seguintes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_reabrir_para_estorno(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_evt public.zoo_operacao_eventos;
  v_mov_ativa boolean; v_titulo_ativo boolean; v_liq_ativa boolean; v_dominios text;
  v_status_anterior text;
  v_estorno_id uuid := gen_random_uuid();
BEGIN
  -- Recuperação de LEGADO: restrito a administradores (não é ação comercial comum).
  IF NOT public.is_admin_agroinblue(v_actor) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores' USING ERRCODE = '42501'; END IF;                        -- guard: admin
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Reabertura para estorno exige motivo' USING ERRCODE = 'P0001'; END IF; -- guard: motivo
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;  -- guard: pertencimento
  IF v_op.status_comercial <> 'cancelada' THEN
    RAISE EXCEPTION 'Operacao nao esta cancelada; esta RPC recupera apenas OC cancelada com efeitos ativos' USING ERRCODE = 'P0001'; END IF; -- guard: só cancelada
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF; -- guard: versão

  -- Exigir >=1 efeito downstream ATIVO (mesmos predicados soberanos do oc_cancelar). Não é reativação comum.
  SELECT EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id=m.movimentacao_id
                  WHERE m.operacao_id=p_operacao_id AND l.cancelado IS NOT TRUE) INTO v_mov_ativa;
  SELECT EXISTS (SELECT 1 FROM public.zoo_operacao_partes p JOIN public.financeiro_lancamentos_v2 fl ON fl.id=p.financeiro_lancamento_id
                  WHERE p.operacao_id=p_operacao_id AND p.financeiro_lancamento_id IS NOT NULL AND fl.cancelado IS NOT TRUE) INTO v_titulo_ativo;
  SELECT EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes lq
                  WHERE lq.operacao_id=p_operacao_id AND lq.estornado IS NOT TRUE) INTO v_liq_ativa;
  IF NOT (v_mov_ativa OR v_titulo_ativo OR v_liq_ativa) THEN
    RAISE EXCEPTION 'Operacao cancelada sem efeitos ativos; nada a recuperar' USING ERRCODE = 'P0001'; END IF;   -- guard: exige efeito ativo
  v_dominios := array_to_string(ARRAY[
    CASE WHEN v_mov_ativa THEN 'recebimento' END,
    CASE WHEN v_titulo_ativo THEN 'titulo' END,
    CASE WHEN v_liq_ativa THEN 'liquidacao' END], ',');

  -- Último evento 'cancelar' válido → status soberano a restaurar (da auditoria; SEM inferência).
  SELECT * INTO v_evt FROM public.zoo_operacao_eventos
    WHERE operacao_id=p_operacao_id AND acao='cancelar' ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND OR v_evt.dados_anteriores IS NULL THEN
    RAISE EXCEPTION 'Evento de cancelamento ausente/invalido; impossivel restaurar status sem inferencia' USING ERRCODE = 'P0001'; END IF; -- guard: sem evento
  v_status_anterior := v_evt.dados_anteriores->>'status_comercial';
  IF v_status_anterior IS NULL OR v_status_anterior NOT IN ('programada','fechada') THEN                          -- guard: só status oficial não-cancelado
    RAISE EXCEPTION 'Status anterior invalido no evento (%): so programada/fechada sao restauraveis', coalesce(v_status_anterior,'null') USING ERRCODE = 'P0001'; END IF;

  -- Trilha ANTES do UPDATE (preserva o estado cancelado desfeito + correlation_id).
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'reabrir_para_estorno', to_jsonb(v_op),
          jsonb_build_object(
            'estorno_id', v_estorno_id, 'motivo', p_motivo,
            'status_restaurado', v_status_anterior, 'status_anterior', 'cancelada',
            'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1,
            'dominios_ativos', v_dominios,
            'cancelamento_desfeito', jsonb_build_object(
              'cancelado_em', v_op.cancelado_em, 'cancelado_por', v_op.cancelado_por,
              'cancelado_motivo', v_op.cancelado_motivo, 'evento_cancelar_id', v_evt.id)),
          v_actor, 'rpc');

  -- Restaura SOMENTE o status comercial + limpa os metadados vivos de cancelamento. Nada downstream é tocado.
  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial = v_status_anterior, cancelado_em = NULL, cancelado_por = NULL, cancelado_motivo = NULL,
        versao = versao + 1, updated_at = now(), updated_by = v_actor
  WHERE id = p_operacao_id;

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'status_comercial', v_status_anterior,
    'operacao_versao', v_op.versao + 1, 'estorno_id', v_estorno_id);
END;
$$;

-- Grants: idioma soberano (authenticated + service_role, sem PUBLIC/anon). O CONTROLE REAL é o guard interno
--   is_admin_agroinblue (só administradores executam). Sem exposição em UI.
REVOKE ALL ON FUNCTION public.oc_reabrir_para_estorno(uuid,uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_reabrir_para_estorno(uuid,uuid,integer,text) TO authenticated, service_role;
