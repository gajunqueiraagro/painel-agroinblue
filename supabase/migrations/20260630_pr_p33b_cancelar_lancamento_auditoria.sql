-- 20260630_pr_p33b_cancelar_lancamento_auditoria.sql
-- PR-P3.3b — cancelar (soft-delete auditado) um lançamento duplicado/errado pelo modal de
-- leitura da Auditoria. NUNCA DELETE físico. Cancelar = cancelado=true + cancelado_em/_por/
-- _motivo, desfazendo antes (se houver) o CBI ativo (recalcula status do extrato + audita
-- conciliacao_desfeita). O cancelamento do lançamento é auditado pelo trigger nativo
-- trg_audit_financeiro_v2 + os campos cancelado_*. Mês fechado bloqueia (guard explícito +
-- trigger trg_guard_mes_fechado_lancamentos_v2). Validado em BEGIN/ROLLBACK. Forward-only.

-- Schema: coluna de motivo do cancelamento (aditiva, idempotente). Decisão Opção A (Gabriel).
ALTER TABLE financeiro_lancamentos_v2 ADD COLUMN IF NOT EXISTS cancelado_motivo text;

CREATE OR REPLACE FUNCTION public.fn_cancelar_lancamento_auditoria(
  p_lancamento_id uuid,
  p_motivo text DEFAULT 'duplicado_auditoria'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_lan financeiro_lancamentos_v2%ROWTYPE;
  v_cbi conciliacao_bancaria_itens%ROWTYPE;
  v_cbi_desfeito boolean := false;
  v_ext_id uuid := NULL;
  v_soma numeric;
  v_status text;
BEGIN
  SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lancamento inexistente: %', p_lancamento_id;
  END IF;

  -- idempotente: já cancelado -> ok sem reprocessar
  IF COALESCE(v_lan.cancelado, false) = true THEN
    RETURN jsonb_build_object('ok', true, 'lancamento_id', p_lancamento_id,
      'ja_cancelado', true, 'cbi_desfeito', false, 'extrato_id', NULL, 'motivo', v_lan.cancelado_motivo);
  END IF;

  -- mês fechado (mesma lógica do fn_vincular; o trigger nativo também guarda)
  IF EXISTS (SELECT 1 FROM financeiro_fechamentos f
             WHERE f.cliente_id = v_lan.cliente_id AND f.fazenda_id = v_lan.fazenda_id
               AND f.ano_mes = v_lan.ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION 'competencia % em mes fechado: cancelamento bloqueado', v_lan.ano_mes;
  END IF;

  -- desfazer CBI ativo (se houver) ANTES de cancelar: recalcula status do extrato + audita
  SELECT * INTO v_cbi FROM conciliacao_bancaria_itens
   WHERE lancamento_id = p_lancamento_id AND desfeito_em IS NULL LIMIT 1;
  IF FOUND THEN
    v_ext_id := v_cbi.extrato_id;
    UPDATE conciliacao_bancaria_itens
       SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = 'cancelamento_lancamento_auditoria'
     WHERE id = v_cbi.id;

    SELECT COALESCE(sum(valor_aplicado),0) INTO v_soma FROM conciliacao_bancaria_itens
     WHERE extrato_id = v_ext_id AND desfeito_em IS NULL;
    SELECT CASE WHEN v_soma <= 0 THEN 'nao_conciliado'
                WHEN v_soma + 0.005 >= abs(e.valor) THEN 'conciliado'
                ELSE 'parcial' END INTO v_status
      FROM extrato_bancario_v2 e WHERE e.id = v_ext_id;
    UPDATE extrato_bancario_v2 SET status = v_status WHERE id = v_ext_id;

    INSERT INTO conciliacao_audit_log
      (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id, motivo, payload_depois)
    VALUES ('conciliacao_desfeita', v_uid, v_lan.cliente_id, v_ext_id, p_lancamento_id, v_cbi.id,
            'cancelamento_lancamento_auditoria', jsonb_build_object('status', v_status));
    v_cbi_desfeito := true;
  END IF;

  -- soft-delete do lançamento (auditado por trg_audit_financeiro_v2; trg_cbi_desfazer_on_
  -- cancelamento vira no-op pois o CBI já foi desfeito acima). NUNCA DELETE físico.
  UPDATE financeiro_lancamentos_v2
     SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid, cancelado_motivo = p_motivo
   WHERE id = p_lancamento_id;

  RETURN jsonb_build_object('ok', true, 'lancamento_id', p_lancamento_id,
    'cbi_desfeito', v_cbi_desfeito, 'extrato_id', v_ext_id, 'motivo', p_motivo);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_cancelar_lancamento_auditoria(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cancelar_lancamento_auditoria(uuid, text) TO authenticated;
