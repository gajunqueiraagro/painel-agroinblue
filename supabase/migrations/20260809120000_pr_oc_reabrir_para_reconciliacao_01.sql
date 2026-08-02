-- PR-OC-REABRIR-PARA-RECONCILIACAO-01 — porta ADMINISTRATIVA para OCs canceladas em estado downstream
--   PARCIALMENTE REVERTIDO (ex.: títulos já cancelados, mas partes/parcelas/programações/compromissos ativos),
--   onde NÃO há efeito ativo (mov/título/liquidação/conciliação) e por isso oc_reabrir_para_estorno recusa.
--   Restaura TEMPORARIAMENTE o status comercial anterior (do último evento 'cancelar') para que os writers
--   oficiais de estorno concluam as transições faltantes; depois a OC volta a 'cancelada' pelo oc_cancelar.
--   DISJUNÇÃO SOBERANA: se existir QUALQUER efeito ativo → P0001 orientando oc_reabrir_para_estorno (os dois
--   conjuntos são mutuamente exclusivos). NÃO toca downstream. NÃO descancela comercialmente. Admin-only; sem UI.
--   NÃO altera oc_reabrir_para_estorno nem nenhum writer normal. Sem flag persistida (evento+status+estorno_id).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_reabrir_para_reconciliacao(
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
  v_status_anterior text;
  v_estorno_id uuid := gen_random_uuid();
  -- efeitos ativos (disjunção)
  v_mov_ativa boolean; v_titulo_ativo boolean; v_liq_ativa boolean; v_concil_ativa boolean;
  -- incompletude estrutural
  v_parte_incompleta boolean; v_parcela_incompleta boolean; v_prog_incompleta boolean;
  -- contagens de auditoria
  v_n_partes_ativas_tit_canc int; v_n_parcelas_mat_paga int; v_n_prog_ativas int; v_n_comp_nao_terminais int;
  v_incons jsonb;
BEGIN
  -- Pertencimento + tenant + admin.
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.cliente_id <> p_cliente_id THEN RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  IF NOT (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor)) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores' USING ERRCODE = '42501'; END IF;                       -- admin-only soberano
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Reconciliacao exige motivo' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.status_comercial <> 'cancelada' THEN
    RAISE EXCEPTION 'Operacao nao esta cancelada; esta RPC reconcilia apenas OC cancelada parcialmente revertida' USING ERRCODE = 'P0001'; END IF;

  -- DISJUNÇÃO: qualquer efeito ATIVO -> usar a porta normal de estorno (mutuamente exclusivo).
  v_mov_ativa := EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id = m.movimentacao_id
                          WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE);
  v_titulo_ativo := EXISTS (SELECT 1 FROM public.zoo_operacao_partes p JOIN public.financeiro_lancamentos_v2 fl ON fl.id = p.financeiro_lancamento_id
                             WHERE p.operacao_id = p_operacao_id AND p.financeiro_lancamento_id IS NOT NULL AND fl.cancelado IS NOT TRUE);
  v_liq_ativa := EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes lq WHERE lq.operacao_id = p_operacao_id AND lq.estornado IS NOT TRUE);
  v_concil_ativa := EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi WHERE cbi.desfeito_em IS NULL
                             AND cbi.lancamento_id IN (SELECT financeiro_lancamento_id FROM public.zoo_operacao_partes
                                                        WHERE operacao_id = p_operacao_id AND financeiro_lancamento_id IS NOT NULL));
  IF v_mov_ativa OR v_titulo_ativo OR v_liq_ativa OR v_concil_ativa THEN
    RAISE EXCEPTION 'Operacao possui efeitos ativos. Utilize oc_reabrir_para_estorno.' USING ERRCODE = 'P0001'; END IF;

  -- INCOMPLETUDE ESTRUTURAL mínima (>=1). Compromisso aberto/programado ISOLADO nao torna elegivel.
  v_parte_incompleta := EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt JOIN public.financeiro_lancamentos_v2 fl ON fl.id = pt.financeiro_lancamento_id
                                 WHERE pt.operacao_id = p_operacao_id AND pt.cancelada IS NOT TRUE AND fl.cancelado IS TRUE);
  v_parcela_incompleta := EXISTS (SELECT 1 FROM public.zoo_operacao_parcelas_programacao pp
                                   JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
                                   JOIN public.zoo_operacao_compromissos c ON c.id = pr.compromisso_id
                                   WHERE c.operacao_id = p_operacao_id AND pp.status IN ('materializada','paga'));
  v_prog_incompleta := EXISTS (SELECT 1 FROM public.zoo_operacao_programacoes pr JOIN public.zoo_operacao_compromissos c ON c.id = pr.compromisso_id
                                WHERE c.operacao_id = p_operacao_id AND pr.status = 'ativa');
  IF NOT (v_parte_incompleta OR v_parcela_incompleta OR v_prog_incompleta) THEN
    RAISE EXCEPTION 'Operacao cancelada sem downstream incompleto; nada a reconciliar' USING ERRCODE = 'P0001'; END IF;

  -- Último evento 'cancelar' válido -> status soberano a restaurar (sem inferência).
  SELECT * INTO v_evt FROM public.zoo_operacao_eventos
    WHERE operacao_id = p_operacao_id AND acao = 'cancelar' ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND OR v_evt.dados_anteriores IS NULL THEN
    RAISE EXCEPTION 'Evento de cancelamento ausente/invalido; impossivel restaurar status sem inferencia' USING ERRCODE = 'P0001'; END IF;
  v_status_anterior := v_evt.dados_anteriores->>'status_comercial';
  IF v_status_anterior IS NULL OR v_status_anterior NOT IN ('programada','fechada') THEN
    RAISE EXCEPTION 'Status anterior invalido no evento (%): so programada/fechada sao restauraveis', coalesce(v_status_anterior,'null') USING ERRCODE = 'P0001'; END IF;

  -- Contagens de inconsistência (auditoria).
  SELECT count(*) INTO v_n_partes_ativas_tit_canc FROM public.zoo_operacao_partes pt JOIN public.financeiro_lancamentos_v2 fl ON fl.id = pt.financeiro_lancamento_id
    WHERE pt.operacao_id = p_operacao_id AND pt.cancelada IS NOT TRUE AND fl.cancelado IS TRUE;
  SELECT count(*) INTO v_n_parcelas_mat_paga FROM public.zoo_operacao_parcelas_programacao pp
    JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id JOIN public.zoo_operacao_compromissos c ON c.id = pr.compromisso_id
    WHERE c.operacao_id = p_operacao_id AND pp.status IN ('materializada','paga');
  SELECT count(*) INTO v_n_prog_ativas FROM public.zoo_operacao_programacoes pr JOIN public.zoo_operacao_compromissos c ON c.id = pr.compromisso_id
    WHERE c.operacao_id = p_operacao_id AND pr.status = 'ativa';
  SELECT count(*) INTO v_n_comp_nao_terminais FROM public.zoo_operacao_compromissos c
    WHERE c.operacao_id = p_operacao_id AND c.status IN ('aberto','programado');
  v_incons := jsonb_build_object(
    'partes_ativas_titulo_cancelado', v_n_partes_ativas_tit_canc,
    'parcelas_materializadas_pagas', v_n_parcelas_mat_paga,
    'programacoes_ativas', v_n_prog_ativas,
    'compromissos_nao_terminais', v_n_comp_nao_terminais,
    'mov_ativas', 0, 'titulos_ativos', 0, 'liquidacoes_ativas', 0, 'conciliacoes_ativas', 0);

  -- Trilha ANTES do UPDATE.
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'reabrir_para_reconciliacao', to_jsonb(v_op),
          jsonb_build_object(
            'estorno_id', v_estorno_id, 'motivo', p_motivo,
            'status_restaurado', v_status_anterior, 'status_anterior', 'cancelada',
            'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1,
            'evento_cancelar_origem', v_evt.id,
            'inconsistencias_detectadas', v_incons,
            'cancelamento_desfeito', jsonb_build_object(
              'cancelado_em', v_op.cancelado_em, 'cancelado_por', v_op.cancelado_por,
              'cancelado_motivo', v_op.cancelado_motivo, 'evento_cancelar_id', v_evt.id)),
          v_actor, 'rpc');

  -- Restaura SOMENTE o status comercial + limpa metadados de cancelamento. NADA downstream é tocado.
  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial = v_status_anterior, cancelado_em = NULL, cancelado_por = NULL, cancelado_motivo = NULL,
        versao = versao + 1, updated_at = now(), updated_by = v_actor
  WHERE id = p_operacao_id;

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'status_comercial', v_status_anterior,
    'operacao_versao', v_op.versao + 1, 'estorno_id', v_estorno_id,
    'inconsistencias_detectadas', v_incons, 'evento_cancelar_origem', v_evt.id);
END;
$$;

-- Grants: idioma soberano (authenticated + service_role, sem PUBLIC/anon). O controle real e o guard interno
--   is_admin_agroinblue (só administradores executam). Sem UI.
REVOKE ALL ON FUNCTION public.oc_reabrir_para_reconciliacao(uuid,uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_reabrir_para_reconciliacao(uuid,uuid,integer,text) TO authenticated, service_role;
