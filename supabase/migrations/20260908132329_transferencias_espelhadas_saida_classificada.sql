-- 20260908132329 transferencias_espelhadas_saida_classificada (aplicada no proto via Management API em 08/09/2026)
CREATE OR REPLACE FUNCTION public.fn_transferencias_espelhadas(p_cliente_id uuid, p_ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
       AND l.tipo_operacao NOT LIKE '3-%'
  ), pares AS (
    SELECT s.id saida_id, e.id entrada_id, s.valor, s.d dia_saida, e.d dia_entrada, s.conta conta_saida, e.conta conta_entrada,
           s.descricao desc_saida, e.descricao desc_entrada, s.subcentro sub_saida, e.subcentro sub_entrada,
           count(*) OVER (PARTITION BY s.id) cand_saida, count(*) OVER (PARTITION BY e.id) cand_entrada
      FROM l s JOIN l e ON e.sinal = '1' AND s.sinal = '-1' AND round(e.valor,2) = round(s.valor,2)
                        AND abs(e.d - s.d) <= 1 AND e.conta <> s.conta AND (e.subcentro IS NULL OR s.subcentro IS NULL)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'saida_id', p.saida_id, 'entrada_id', p.entrada_id, 'valor', p.valor, 'sub_saida', p.sub_saida, 'sub_entrada', p.sub_entrada, 'saida_classificada', (p.sub_saida IS NOT NULL), 'entrada_classificada', (p.sub_entrada IS NOT NULL),
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
$function$
;
