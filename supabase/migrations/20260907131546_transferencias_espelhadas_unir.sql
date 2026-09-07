-- 20260907131546 transferencias_espelhadas_unir (aplicada no proto via Management API em 07/09/2026)

CREATE OR REPLACE FUNCTION public.fn_transferencias_espelhadas(p_cliente_id uuid, p_ano_mes text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $fn$
DECLARE v_uid uuid; v_de date; v_ate date; v_out jsonb;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_uid) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente';
  END IF;
  IF p_ano_mes !~ '^[0-9]{4}-[0-9]{2}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='p_ano_mes deve ser AAAA-MM'; END IF;
  v_de := to_date(p_ano_mes||'-01','YYYY-MM-DD'); v_ate := (v_de + interval '1 month' - interval '1 day')::date;
  WITH l AS (
    SELECT l.id, l.valor, l.data_pagamento d, l.sinal, l.subcentro, l.descricao,
           CASE WHEN l.tipo_operacao = '1-Entradas' THEN l.conta_destino_id ELSE l.conta_bancaria_id END conta
      FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente_id AND l.cancelado IS NOT TRUE AND l.sem_movimentacao_caixa IS NOT TRUE
       AND COALESCE(l.cenario,'realizado') <> 'meta'
       AND l.data_pagamento BETWEEN v_de AND v_ate AND l.tipo_operacao IN ('1-Entradas','2-Saídas')
       AND l.subcentro IS NULL
  ), pares AS (
    SELECT s.id saida_id, e.id entrada_id, s.valor, s.d dia_saida, e.d dia_entrada, s.conta conta_saida, e.conta conta_entrada,
           s.descricao desc_saida, e.descricao desc_entrada,
           count(*) OVER (PARTITION BY s.id) cand_saida, count(*) OVER (PARTITION BY e.id) cand_entrada
      FROM l s JOIN l e ON e.sinal = '1' AND s.sinal = '-1' AND round(e.valor,2) = round(s.valor,2)
                        AND abs(e.d - s.d) <= 1 AND e.conta <> s.conta
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'saida_id', p.saida_id, 'entrada_id', p.entrada_id, 'valor', p.valor,
           'dia_saida', p.dia_saida, 'dia_entrada', p.dia_entrada,
           'conta_saida_id', p.conta_saida, 'conta_saida', fs.nome_exibicao,
           'conta_entrada_id', p.conta_entrada, 'conta_entrada', fe.nome_exibicao,
           'desc_saida', p.desc_saida, 'desc_entrada', p.desc_entrada,
           'ambiguo', (p.cand_saida > 1 OR p.cand_entrada > 1)) ORDER BY p.dia_saida, p.valor DESC), '[]'::jsonb)
    INTO v_out
    FROM pares p JOIN financeiro_contas_bancarias fs ON fs.id = p.conta_saida JOIN financeiro_contas_bancarias fe ON fe.id = p.conta_entrada;
  RETURN jsonb_build_object('ok', true, 'ano_mes', p_ano_mes, 'pares', v_out, 'total', jsonb_array_length(v_out),
    'unicos', (SELECT count(*) FROM jsonb_array_elements(v_out) x WHERE NOT (x->>'ambiguo')::boolean));
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_transferencias_espelhadas(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencias_espelhadas(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_transferencia_unir(p_saida_id uuid, p_entrada_id uuid, p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $fn$
DECLARE v_uid uuid; s financeiro_lancamentos_v2%ROWTYPE; e financeiro_lancamentos_v2%ROWTYPE;
        v_conta_e uuid; v_plano uuid; v_sub text; v_macro text; v_grupo text; v_centro text; n_vinc int := 0;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  SELECT * INTO s FROM financeiro_lancamentos_v2 WHERE id = p_saida_id;
  SELECT * INTO e FROM financeiro_lancamentos_v2 WHERE id = p_entrada_id;
  IF s.id IS NULL OR e.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='lancamento nao encontrado'; END IF;
  IF s.cliente_id <> e.cliente_id THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='lancamentos de clientes diferentes'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR s.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente';
  END IF;
  IF s.cancelado OR e.cancelado THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='lancamento cancelado'; END IF;
  IF s.sinal <> '-1' OR e.sinal <> '1' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='esperado saida (-1) e entrada (+1)'; END IF;
  IF round(s.valor,2) <> round(e.valor,2) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='valores diferentes'; END IF;
  IF abs(COALESCE(e.data_pagamento, e.data_vencimento) - COALESCE(s.data_pagamento, s.data_vencimento)) > 1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='datas com mais de 1 dia de diferenca'; END IF;
  v_conta_e := COALESCE(e.conta_destino_id, e.conta_bancaria_id);
  IF v_conta_e IS NULL OR s.conta_bancaria_id IS NULL OR v_conta_e = s.conta_bancaria_id THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='contas invalidas para transferencia'; END IF;
  SELECT pc.id, pc.subcentro, pc.macro_custo, pc.grupo_custo, pc.centro_custo INTO v_plano, v_sub, v_macro, v_grupo, v_centro
    FROM financeiro_plano_contas pc WHERE pc.subcentro = 'Transferência entre Contas Bancárias' AND pc.ativo IS NOT FALSE LIMIT 1;
  IF v_plano IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='plano 18010 nao encontrado'; END IF;
  SELECT count(*) INTO n_vinc FROM conciliacao_bancaria_itens WHERE lancamento_id = e.id AND desfeito_em IS NULL;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'saida_id', s.id, 'entrada_id', e.id, 'valor', s.valor,
      'conta_origem_id', s.conta_bancaria_id, 'conta_destino_id', v_conta_e, 'vinculos_a_mover', n_vinc, 'plano_conta_id', v_plano);
  END IF;
  UPDATE financeiro_lancamentos_v2
     SET tipo_operacao = '3-Transferências', conta_destino_id = v_conta_e,
         plano_conta_id = v_plano, subcentro = v_sub, macro_custo = v_macro, grupo_custo = v_grupo, centro_custo = v_centro,
         descricao = COALESCE(NULLIF(s.descricao,''), 'Transferência entre contas'),
         updated_by = v_uid, updated_at = now()
   WHERE id = s.id;
  UPDATE conciliacao_bancaria_itens SET lancamento_id = s.id WHERE lancamento_id = e.id AND desfeito_em IS NULL;
  UPDATE financeiro_lancamentos_v2
     SET cancelado = true, cancelado_em = now(), cancelado_motivo = 'unido em transferencia interna com o lancamento '||s.id::text, updated_at = now()
   WHERE id = e.id;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'transferencia_id', s.id, 'entrada_cancelada_id', e.id, 'vinculos_movidos', n_vinc);
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_transferencia_unir(uuid,uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_unir(uuid,uuid,boolean) TO authenticated;

