-- 20260908091431 estornos_e_faturas_cartao (aplicada no proto via Management API em 08/09/2026)

CREATE OR REPLACE FUNCTION public.fn_estornos_espelhados(p_cliente_id uuid, p_ano_mes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE v_uid uuid; v_de date; v_ate date; v_out jsonb;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_uid) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente'; END IF;
  IF p_ano_mes !~ '^[0-9]{4}-[0-9]{2}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='p_ano_mes deve ser AAAA-MM'; END IF;
  v_de := to_date(p_ano_mes||'-01','YYYY-MM-DD'); v_ate := (v_de + interval '1 month' - interval '1 day')::date;
  WITH pares AS (
    SELECT s.id saida_id, e.id entrada_id, s.valor, s.data_pagamento dia_saida, e.data_pagamento dia_entrada, s.conta_bancaria_id conta_id,
           s.descricao desc_saida, e.descricao desc_entrada, s.subcentro sub_saida, e.subcentro sub_entrada,
           count(*) OVER (PARTITION BY s.id) cand_s, count(*) OVER (PARTITION BY e.id) cand_e
      FROM financeiro_lancamentos_v2 s
      JOIN financeiro_lancamentos_v2 e ON e.cliente_id = s.cliente_id AND e.cancelado IS NOT TRUE AND e.sinal = '1'
           AND round(e.valor,2) = round(s.valor,2) AND e.conta_destino_id = s.conta_bancaria_id
           AND e.data_pagamento BETWEEN s.data_pagamento AND s.data_pagamento + 5
           AND (e.descricao ~* 'rejeit|estorn|devolu|cancel')
     WHERE s.cliente_id = p_cliente_id AND s.cancelado IS NOT TRUE AND s.sinal = '-1' AND s.sem_movimentacao_caixa IS NOT TRUE
       AND s.data_pagamento BETWEEN v_de AND v_ate
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('saida_id', p.saida_id, 'entrada_id', p.entrada_id, 'valor', p.valor, 'dia_saida', p.dia_saida, 'dia_entrada', p.dia_entrada,
           'conta_id', p.conta_id, 'conta', f.nome_exibicao, 'desc_saida', p.desc_saida, 'desc_entrada', p.desc_entrada,
           'ja_classificado', (p.sub_saida = 'Pagamento Estornado' AND p.sub_entrada = 'Estorno Recebido'),
           'ambiguo', (p.cand_s > 1 OR p.cand_e > 1)) ORDER BY p.dia_saida), '[]'::jsonb) INTO v_out
    FROM pares p JOIN financeiro_contas_bancarias f ON f.id = p.conta_id;
  RETURN jsonb_build_object('ok', true, 'ano_mes', p_ano_mes, 'pares', v_out, 'total', jsonb_array_length(v_out),
    'pendentes', (SELECT count(*) FROM jsonb_array_elements(v_out) x WHERE NOT (x->>'ja_classificado')::boolean));
END; $fn$;
REVOKE ALL ON FUNCTION public.fn_estornos_espelhados(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_estornos_espelhados(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_estorno_aplicar(p_saida_id uuid, p_entrada_id uuid, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE v_uid uuid; s financeiro_lancamentos_v2%ROWTYPE; e financeiro_lancamentos_v2%ROWTYPE; ps record; pe record;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  SELECT * INTO s FROM financeiro_lancamentos_v2 WHERE id = p_saida_id; SELECT * INTO e FROM financeiro_lancamentos_v2 WHERE id = p_entrada_id;
  IF s.id IS NULL OR e.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='lancamento nao encontrado'; END IF;
  IF s.cliente_id <> e.cliente_id THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='lancamentos de clientes diferentes'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR s.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente'; END IF;
  IF s.sinal <> '-1' OR e.sinal <> '1' OR round(s.valor,2) <> round(e.valor,2) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='par invalido: esperado saida e entrada de mesmo valor'; END IF;
  SELECT id, subcentro, macro_custo, grupo_custo, centro_custo INTO ps FROM financeiro_plano_contas WHERE subcentro = 'Pagamento Estornado' AND ativo IS NOT FALSE LIMIT 1;
  SELECT id, subcentro, macro_custo, grupo_custo, centro_custo INTO pe FROM financeiro_plano_contas WHERE subcentro = 'Estorno Recebido' AND ativo IS NOT FALSE LIMIT 1;
  IF ps.id IS NULL OR pe.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='plano de estorno nao encontrado'; END IF;
  IF p_simular THEN RETURN jsonb_build_object('ok', true, 'simulado', true, 'saida_id', s.id, 'entrada_id', e.id, 'valor', s.valor, 'saida_vira', ps.subcentro, 'entrada_vira', pe.subcentro); END IF;
  UPDATE financeiro_lancamentos_v2 SET plano_conta_id = ps.id, subcentro = ps.subcentro, macro_custo = ps.macro_custo, grupo_custo = ps.grupo_custo, centro_custo = ps.centro_custo, updated_by = v_uid, updated_at = now() WHERE id = s.id;
  UPDATE financeiro_lancamentos_v2 SET plano_conta_id = pe.id, subcentro = pe.subcentro, macro_custo = pe.macro_custo, grupo_custo = pe.grupo_custo, centro_custo = pe.centro_custo, favorecido_id = COALESCE(e.favorecido_id, s.favorecido_id), fazenda_id = COALESCE(e.fazenda_id, s.fazenda_id), updated_by = v_uid, updated_at = now() WHERE id = e.id;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'saida_id', s.id, 'entrada_id', e.id);
END; $fn$;
REVOKE ALL ON FUNCTION public.fn_estorno_aplicar(uuid,uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_estorno_aplicar(uuid,uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_faturas_cartao(p_cliente_id uuid, p_ano_mes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE v_uid uuid; v_de date; v_ate date; v_out jsonb;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_uid) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente'; END IF;
  IF p_ano_mes !~ '^[0-9]{4}-[0-9]{2}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='p_ano_mes deve ser AAAA-MM'; END IF;
  v_de := to_date(p_ano_mes||'-01','YYYY-MM-DD'); v_ate := (v_de + interval '1 month' - interval '1 day')::date;
  WITH faturas AS (
    SELECT l.id saida_id, l.valor, l.data_pagamento dia, l.conta_bancaria_id conta_id, l.descricao, l.subcentro, l.tipo_operacao
      FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente_id AND l.cancelado IS NOT TRUE AND l.sinal = '-1' AND l.sem_movimentacao_caixa IS NOT TRUE
       AND l.data_pagamento BETWEEN v_de AND v_ate
       AND l.descricao ~* '(fatura|pagto\s*cart|pgto\s*cart|cart[aã]o\s*(de\s*)?cr[eé]d|ourocard|cartao\s*credito)'
  ), cartoes AS (
    SELECT c.id cartao_id, c.nome_exibicao nome, c.aliases,
           (SELECT COALESCE(sum(x.valor),0) FROM financeiro_lancamentos_v2 x WHERE x.cliente_id = p_cliente_id AND x.cancelado IS NOT TRUE AND x.sinal = '-1' AND x.conta_bancaria_id = c.id AND x.data_pagamento BETWEEN v_de AND v_ate) soma_mes
      FROM financeiro_contas_bancarias c WHERE c.cliente_id = p_cliente_id AND c.ativa IS NOT FALSE AND (c.tipo_conta ILIKE '%cart%' OR c.nome_exibicao ILIKE 'cart%')
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('saida_id', f.saida_id, 'valor', f.valor, 'dia', f.dia, 'conta_id', f.conta_id, 'conta', fc.nome_exibicao, 'descricao', f.descricao,
           'ja_transferencia', (f.tipo_operacao LIKE '3-%'),
           'candidatos', (SELECT COALESCE(jsonb_agg(jsonb_build_object('cartao_id', k.cartao_id, 'cartao', k.nome, 'soma_mes', k.soma_mes, 'bate', (round(k.soma_mes,2) = round(f.valor,2))) ORDER BY (round(k.soma_mes,2) = round(f.valor,2)) DESC, k.nome), '[]'::jsonb) FROM cartoes k),
           'sugerido_cartao_id', (SELECT k.cartao_id FROM cartoes k WHERE round(k.soma_mes,2) = round(f.valor,2) LIMIT 1)
         ) ORDER BY f.dia), '[]'::jsonb) INTO v_out
    FROM faturas f JOIN financeiro_contas_bancarias fc ON fc.id = f.conta_id;
  RETURN jsonb_build_object('ok', true, 'ano_mes', p_ano_mes, 'faturas', v_out, 'total', jsonb_array_length(v_out),
    'pendentes', (SELECT count(*) FROM jsonb_array_elements(v_out) x WHERE NOT (x->>'ja_transferencia')::boolean));
END; $fn$;
REVOKE ALL ON FUNCTION public.fn_faturas_cartao(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_faturas_cartao(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_fatura_aplicar(p_saida_id uuid, p_cartao_id uuid, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE v_uid uuid; s financeiro_lancamentos_v2%ROWTYPE; c financeiro_contas_bancarias%ROWTYPE; pt record;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  SELECT * INTO s FROM financeiro_lancamentos_v2 WHERE id = p_saida_id;
  IF s.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='lancamento nao encontrado'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR s.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente'; END IF;
  SELECT * INTO c FROM financeiro_contas_bancarias WHERE id = p_cartao_id AND cliente_id = s.cliente_id;
  IF c.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='conta cartao nao encontrada para o cliente'; END IF;
  IF s.sinal <> '-1' OR s.cancelado OR s.conta_bancaria_id IS NULL OR s.conta_bancaria_id = c.id THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='saida invalida para fatura'; END IF;
  SELECT id, subcentro, macro_custo, grupo_custo, centro_custo INTO pt FROM financeiro_plano_contas WHERE subcentro = 'Transferência entre Contas Bancárias' AND ativo IS NOT FALSE LIMIT 1;
  IF pt.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='plano 18010 nao encontrado'; END IF;
  IF p_simular THEN RETURN jsonb_build_object('ok', true, 'simulado', true, 'saida_id', s.id, 'valor', s.valor, 'conta_origem_id', s.conta_bancaria_id, 'conta_destino_id', c.id, 'cartao', c.nome_exibicao); END IF;
  UPDATE financeiro_lancamentos_v2
     SET tipo_operacao = '3-Transferências', conta_destino_id = c.id, plano_conta_id = pt.id, subcentro = pt.subcentro, macro_custo = pt.macro_custo, grupo_custo = pt.grupo_custo, centro_custo = pt.centro_custo,
         descricao = COALESCE(NULLIF(s.descricao,''), 'Pagamento de fatura '||c.nome_exibicao), updated_by = v_uid, updated_at = now()
   WHERE id = s.id;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'transferencia_id', s.id, 'cartao', c.nome_exibicao);
END; $fn$;
REVOKE ALL ON FUNCTION public.fn_fatura_aplicar(uuid,uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_fatura_aplicar(uuid,uuid,boolean) TO authenticated;

