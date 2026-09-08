-- 20260908143631 transferencia_aplicar_qualquer_ponta (aplicada no proto via Management API em 08/09/2026)

CREATE OR REPLACE FUNCTION public.fn_transferencia_aplicar(p_lancamento_id uuid, p_conta_outra_id uuid, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE v_uid uuid; l financeiro_lancamentos_v2%ROWTYPE; c financeiro_contas_bancarias%ROWTYPE; pt record;
        v_origem uuid; v_destino uuid; v_conta_propria uuid;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  SELECT * INTO l FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF l.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='lancamento nao encontrado'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR l.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente'; END IF;
  IF l.cancelado THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='lancamento cancelado'; END IF;
  IF l.tipo_operacao LIKE '3-%' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ja e transferencia'; END IF;
  SELECT * INTO c FROM financeiro_contas_bancarias WHERE id = p_conta_outra_id AND cliente_id = l.cliente_id;
  IF c.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='conta nao encontrada para o cliente'; END IF;
  v_conta_propria := CASE WHEN l.tipo_operacao = '1-Entradas' THEN l.conta_destino_id ELSE l.conta_bancaria_id END;
  IF v_conta_propria IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='lancamento sem conta'; END IF;
  IF v_conta_propria = c.id THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='a outra conta tem de ser diferente da conta do lancamento'; END IF;
  IF l.tipo_operacao = '1-Entradas' THEN v_origem := c.id; v_destino := v_conta_propria; ELSE v_origem := v_conta_propria; v_destino := c.id; END IF;
  SELECT id, subcentro, macro_custo, grupo_custo, centro_custo INTO pt FROM financeiro_plano_contas WHERE subcentro = 'Transferência entre Contas Bancárias' AND ativo IS NOT FALSE LIMIT 1;
  IF pt.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='plano 18010 nao encontrado'; END IF;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'lancamento_id', l.id, 'valor', l.valor, 'tipo_antes', l.tipo_operacao,
      'conta_origem_id', v_origem, 'conta_destino_id', v_destino, 'subcentro_antes', l.subcentro);
  END IF;
  UPDATE financeiro_lancamentos_v2
     SET tipo_operacao = '3-Transferências', sinal = '-1', conta_bancaria_id = v_origem, conta_destino_id = v_destino,
         plano_conta_id = pt.id, subcentro = pt.subcentro, macro_custo = pt.macro_custo, grupo_custo = pt.grupo_custo, centro_custo = pt.centro_custo,
         descricao = COALESCE(NULLIF(l.descricao,''), 'Transferência entre contas'), updated_by = v_uid, updated_at = now()
   WHERE id = l.id;
  -- memoria: a descricao normalizada vira apelido da outra conta
  UPDATE financeiro_contas_bancarias SET aliases = COALESCE(aliases,'[]'::jsonb) || to_jsonb(left(btrim(l.descricao),80))
   WHERE id = c.id AND NULLIF(btrim(l.descricao),'') IS NOT NULL AND NOT (COALESCE(aliases,'[]'::jsonb) ? left(btrim(l.descricao),80));
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'lancamento_id', l.id, 'conta_origem_id', v_origem, 'conta_destino_id', v_destino);
END; $fn$;
REVOKE ALL ON FUNCTION public.fn_transferencia_aplicar(uuid,uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_aplicar(uuid,uuid,boolean) TO authenticated;

