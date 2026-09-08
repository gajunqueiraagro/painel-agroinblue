-- 20260908091453 faturas_cartao_so_conta_corrente (aplicada no proto via Management API em 08/09/2026)
CREATE OR REPLACE FUNCTION public.fn_faturas_cartao(p_cliente_id uuid, p_ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
       AND NOT EXISTS (SELECT 1 FROM financeiro_contas_bancarias k WHERE k.id = l.conta_bancaria_id AND (k.tipo_conta ILIKE '%cart%' OR k.nome_exibicao ILIKE 'cart%'))
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
END; $function$
;
