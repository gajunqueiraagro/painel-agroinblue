-- PR-OC-REABRIR-ENTREGA-01 — writer oficial de REABERTURA de entrega (inverso de oc_encerrar_entrega).
--   Desfaz entrega_encerrada (true->false) de forma AUDITADA e reversível, exigindo motivo. Espelha o
--   padrão soberano dos writers de recebimento: SECURITY DEFINER, tenant por p_cliente_id, FOR UPDATE,
--   version-lock otimista, erros soberanos (42501/P0002/40001/P0001).
--   GATE DE STATUS por evidência (igual ao irmão oc_encerrar_entrega): veda rascunho e cancelada; NÃO
--   exige 'fechada' — permite 'programada' (o irmão permite e os dois casos reais estão nesse estado).
--   EFEITO: altera SOMENTE a linha da operação — entrega_encerrada=false, metadados de encerramento
--   -> NULL (não pode haver metadado vigente com entrega aberta), versao+1, auditoria. Preserva byte a
--   byte: status_comercial, negociação, lotes, recebimentos, movimentações, compromissos, programações,
--   parcelas, partes, títulos e liquidações. Evento append-only 'reabrir_entrega' guarda os metadados
--   anteriores integralmente (saem do estado vivo, permanecem na trilha).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_reabrir_entrega(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;              -- guard: tenant
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF; -- guard: pertencimento
  IF v_op.rascunho OR v_op.status_comercial = 'rascunho' THEN                                                    -- guard: rascunho (técnico + legado)
    RAISE EXCEPTION 'Rascunho (tecnico ou legado) nao reabre entrega' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF; -- guard: cancelada
  IF NOT v_op.entrega_encerrada THEN                                                                             -- guard: exige entrega encerrada
    RAISE EXCEPTION 'Entrega nao esta encerrada' USING ERRCODE = 'P0001'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN                                                               -- guard: motivo obrigatório
    RAISE EXCEPTION 'Reabertura de entrega exige motivo' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF; -- guard: versão

  -- Trilha append-only ANTES do UPDATE: preserva integralmente os metadados do encerramento desfeito.
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'reabrir_entrega',
          jsonb_build_object(
            'motivo', p_motivo,
            'status_comercial', v_op.status_comercial,
            'versao_anterior', v_op.versao,
            'entrega_encerrada_em_anterior', v_op.entrega_encerrada_em,
            'entrega_encerrada_por_anterior', v_op.entrega_encerrada_por,
            'entrega_encerrada_motivo_anterior', v_op.entrega_encerrada_motivo),
          v_actor, 'rpc');

  -- Efeito EXCLUSIVO na linha da operação. Nenhuma outra tabela é tocada.
  UPDATE public.zoo_operacoes_comerciais
    SET entrega_encerrada = false, entrega_encerrada_em = NULL, entrega_encerrada_por = NULL,
        entrega_encerrada_motivo = NULL, versao = versao + 1, updated_at = now(), updated_by = v_actor
  WHERE id = p_operacao_id;

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'entrega_encerrada', false,
                            'operacao_versao', v_op.versao + 1);
END;
$$;

-- Grants: espelham o padrão soberano VIVO dos irmãos (oc_encerrar_entrega/oc_receber_lotes/oc_confirmar),
--   cuja ACL efetiva é postgres(owner) + service_role + authenticated, SEM PUBLIC/anon.
REVOKE ALL ON FUNCTION public.oc_reabrir_entrega(uuid,uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_reabrir_entrega(uuid,uuid,integer,text) TO authenticated, service_role;
