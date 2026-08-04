-- PR-CONC-GRUPO-FASE-1 — Migration 07 (CORRETIVA): fn_desfazer_grupo_conciliacao sem audit explícito.
-- A auditoria é trigger-driven: cada UPDATE que seta desfeito_em gera 'conciliacao_desfeita' com
-- payload_antes/depois (grupo_id incluso). Removido o INSERT explícito (redundante e acao fora do CHECK).
-- Update dos membros + recompute de status inalterados.

CREATE OR REPLACE FUNCTION public.fn_desfazer_grupo_conciliacao(
  p_grupo_id uuid,
  p_motivo   text DEFAULT 'grupo_desfeito_manual'
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_n        int;
  v_extratos jsonb := '[]'::jsonb;
  v_rec      record;
  v_status   text;
  v_ofx      numeric;
  v_soma     numeric;
BEGIN
  SELECT count(*) INTO v_n
  FROM conciliacao_bancaria_itens WHERE grupo_id = p_grupo_id AND desfeito_em IS NULL;
  IF v_n = 0 THEN RAISE EXCEPTION 'grupo_sem_itens_ativos: %', p_grupo_id; END IF;

  -- Soft-desfaz todos os membros ativos (o trigger trg_audit_conciliacao registra 'conciliacao_desfeita').
  UPDATE conciliacao_bancaria_itens
     SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = COALESCE(p_motivo, 'grupo_desfeito_manual')
   WHERE grupo_id = p_grupo_id AND desfeito_em IS NULL;

  -- Recompute do status de cada extrato tocado pelo grupo (cobre 1×N e N×1).
  FOR v_rec IN SELECT DISTINCT extrato_id FROM conciliacao_bancaria_itens WHERE grupo_id = p_grupo_id LOOP
    SELECT abs(valor) INTO v_ofx FROM extrato_bancario_v2 WHERE id = v_rec.extrato_id;
    SELECT COALESCE(sum(valor_aplicado), 0) INTO v_soma
    FROM conciliacao_bancaria_itens WHERE extrato_id = v_rec.extrato_id AND desfeito_em IS NULL;
    v_status := CASE
      WHEN v_soma <= 0 THEN 'nao_conciliado'
      WHEN v_soma + 0.005 >= v_ofx THEN 'conciliado'
      ELSE 'parcial' END;
    UPDATE extrato_bancario_v2 SET status = v_status WHERE id = v_rec.extrato_id;
    v_extratos := v_extratos || jsonb_build_object('extrato_id', v_rec.extrato_id, 'novo_status', v_status);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'grupo_id', p_grupo_id,
                            'itens_desfeitos', v_n, 'extratos_afetados', v_extratos);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_desfazer_grupo_conciliacao(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_desfazer_grupo_conciliacao(uuid, text) TO authenticated;

-- ROLLBACK: reaplicar a versão da Migration 03 (com audit explícito) — não recomendado (viola acao CHECK).
