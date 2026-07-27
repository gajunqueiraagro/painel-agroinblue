-- SEC-RPC-TENANT-01B-A — Endurecimento de tenant em fn_cancelar_lancamento_auditoria.
--   VULNERABILIDADE (comprovada em runtime, SEC-RPC-TENANT-01A): a função SECURITY DEFINER
--   cancelava qualquer lançamento por id, SEM validar que o chamador pertence ao cliente do
--   lançamento — permitindo cancelamento CROSS-TENANT por usuário authenticated não-admin.
--
--   CORREÇÃO: deriva cliente_id do próprio lançamento (v_lan.cliente_id) e, ANTES de qualquer
--   escrita, exige is_admin_agroinblue(auth.uid()) OU cliente_id ∈ get_user_cliente_ids(auth.uid()).
--   Mantém SECURITY DEFINER, a assinatura, o search_path e TODO o corpo restante VERBATIM.
--   NÃO altera grants/ACL/RLS/views/callers/outras RPCs. Requer aplicação no PROTO (binbcdfbisgscrifztia).
--   NUNCA em produção.

CREATE OR REPLACE FUNCTION public.fn_cancelar_lancamento_auditoria(p_lancamento_id uuid, p_motivo text DEFAULT 'duplicado_auditoria'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- SEC-RPC-TENANT-01B-A: guard de tenant (cliente derivado do lançamento, nunca do chamador).
  IF NOT (
    public.is_admin_agroinblue(v_uid)
    OR (v_lan.cliente_id IN (SELECT t.cliente_id FROM public.get_user_cliente_ids(v_uid) t(cliente_id)))
  ) THEN
    RAISE EXCEPTION 'Operação não autorizada para este cliente';
  END IF;

  IF COALESCE(v_lan.cancelado, false) = true THEN
    RETURN jsonb_build_object('ok', true, 'lancamento_id', p_lancamento_id,
      'ja_cancelado', true, 'cbi_desfeito', false, 'extrato_id', NULL, 'motivo', v_lan.cancelado_motivo);
  END IF;

  IF EXISTS (SELECT 1 FROM financeiro_fechamentos f
             WHERE f.cliente_id = v_lan.cliente_id AND f.fazenda_id = v_lan.fazenda_id
               AND f.ano_mes = v_lan.ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION 'competencia % em mes fechado: cancelamento bloqueado', v_lan.ano_mes;
  END IF;

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

  UPDATE financeiro_lancamentos_v2
     SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid, cancelado_motivo = p_motivo
   WHERE id = p_lancamento_id;

  RETURN jsonb_build_object('ok', true, 'lancamento_id', p_lancamento_id,
    'cbi_desfeito', v_cbi_desfeito, 'extrato_id', v_ext_id, 'motivo', p_motivo);
END $function$;
