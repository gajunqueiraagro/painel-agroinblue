-- P58 (Gabriel 23/10/2026) — Contas bancárias › Saldo inicial › "Efeito na Conciliação": o "Meses conciliados" levava ~25 s no NJ — a
-- tela chamava `fn_conciliacao_status_ano` UMA VEZ POR ANO (7 no NJ), e cada uma julga TODAS as contas do cliente nos 12 meses.
-- `fn_conta_bancaria_efeito_conciliacao(conta)`: numa ida, a contagem e as datas da CONTA — os meses conciliados (>= o mes de inicio),
-- o ultimo, e o saldo do ultimo (`financeiro_saldos_bancarios_v2`, o que a tela ja' lia). A MESMA fonte do status mensal: a interna
-- `_fn_conciliacao_resumo` (a que o `fn_conciliacao_status_ano` usa), chamada com a conta e o PAR dela (a interna e a mae sao julgadas
-- juntas), com o MESMO conjunto calculado do status do ano (conta ATIVA e ja' existente; movimento, saldo informado, saldo herdado <> 0
-- ou a mae com movimento) e so' nos meses em que a linha da conta sai la' (ela ou o par com movimento). Corte: so' nos meses com SALDO
-- FINAL INFORMADO da conta — o status do mes e' o saldo (sem o informado a interna diz 'pendente', nunca 'conciliado').
-- IGUALDADE (23/10, ensaio): Vera 6 contas e NJ 17 contas, meses e ultimo mes identicos aos do status do ano; 0 diferencas.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_conta_bancaria_efeito_conciliacao(p_conta_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public SET plan_cache_mode = force_custom_plan AS $$
DECLARE b public.financeiro_contas_bancarias; v_grupo uuid[]; v_d1 date; v_d2 date; v_mov jsonb; v_sal jsonb; v_ant jsonb; v_mes text; v_ids uuid[];
  v_calc uuid[]; v_meses text[] := '{}'; v_ultimo text; v_s record;
BEGIN
  SELECT * INTO b FROM public.financeiro_contas_bancarias WHERE id = p_conta_id;
  IF b.id IS NULL OR NOT coalesce(public.tenant_ok(b.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a esta conta.', DETAIL = coalesce(p_conta_id::text, '');
  END IF;
  IF b.mes_inicio IS NULL OR b.mes_inicio !~ '^\d{4}-\d{2}$' OR NOT b.ativa THEN
    RETURN jsonb_build_object('meses', 0, 'ultimo', NULL, 'saldo_data', NULL, 'saldo_final', NULL);
  END IF;
  -- a conta e o par (a mae dela, ou as internas dela): a interna e' julgada com a mae
  v_grupo := ARRAY(SELECT x.id FROM public.financeiro_contas_bancarias x
                    WHERE x.cliente_id = b.cliente_id AND (x.id = b.id OR x.id = b.consolida_em_conta_id OR x.consolida_em_conta_id = b.id));
  v_d1 := make_date(left(b.mes_inicio, 4)::int, 1, 1);
  v_d2 := make_date(extract(year FROM current_date)::int, 12, 31);
  -- numa passada so' (com os indices de data): por mes, quem do grupo teve movimento, saldo informado e saldo herdado <> 0
  SELECT coalesce(jsonb_object_agg(m.mes, m.contas), '{}') INTO v_mov FROM (
    SELECT x.mes, jsonb_agg(DISTINCT x.conta) contas FROM (
      SELECT to_char(e.data_movimento, 'YYYY-MM') mes, e.conta_bancaria_id conta FROM public.extrato_bancario_v2 e
       WHERE e.cliente_id = b.cliente_id AND e.conta_bancaria_id = ANY (v_grupo) AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL
         AND e.data_movimento BETWEEN v_d1 AND v_d2
      UNION
      SELECT to_char(l.data_pagamento, 'YYYY-MM'), k.conta FROM public.financeiro_lancamentos_v2 l
       CROSS JOIN LATERAL (VALUES (l.conta_bancaria_id), (l.conta_destino_id)) k(conta)
       WHERE l.cliente_id = b.cliente_id AND l.cancelado = false AND (l.conta_bancaria_id = ANY (v_grupo) OR l.conta_destino_id = ANY (v_grupo))
         AND l.data_pagamento BETWEEN v_d1 AND v_d2 AND k.conta = ANY (v_grupo)) x GROUP BY x.mes) m;
  SELECT coalesce(jsonb_object_agg(m.mes, m.contas), '{}') INTO v_sal FROM (
    SELECT s.ano_mes mes, jsonb_agg(DISTINCT s.conta_bancaria_id) contas FROM public.financeiro_saldos_bancarios_v2 s
     WHERE s.cliente_id = b.cliente_id AND s.conta_bancaria_id = ANY (v_grupo) GROUP BY s.ano_mes) m;
  SELECT coalesce(jsonb_object_agg(m.mes, m.contas), '{}') INTO v_ant FROM (
    SELECT to_char(to_date(s.ano_mes, 'YYYY-MM') + interval '1 month', 'YYYY-MM') mes, jsonb_agg(DISTINCT s.conta_bancaria_id) contas
      FROM public.financeiro_saldos_bancarios_v2 s
     WHERE s.cliente_id = b.cliente_id AND s.conta_bancaria_id = ANY (v_grupo) AND s.saldo_final IS NOT NULL AND s.saldo_final <> 0 GROUP BY 1) m;
  -- os meses em que a linha da conta sai no status do ano (ela ou o par com movimento) E em que ela pode sair 'conciliado' (o status
  -- e' o SALDO: sem saldo final informado da conta no mes, a interna diz 'pendente') — so' nesses a interna e' chamada
  FOR v_mes IN SELECT k FROM jsonb_object_keys(v_mov) k
                WHERE k >= b.mes_inicio AND EXISTS (SELECT 1 FROM public.financeiro_saldos_bancarios_v2 s
                                                     WHERE s.conta_bancaria_id = b.id AND s.ano_mes = k AND s.saldo_final IS NOT NULL)
                ORDER BY 1 LOOP
    v_ids := ARRAY(SELECT jsonb_array_elements_text(v_mov->v_mes)::uuid);
    v_calc := ARRAY(SELECT x.id FROM public.financeiro_contas_bancarias x
      WHERE x.id = ANY (v_grupo) AND x.ativa AND (x.mes_inicio IS NULL OR x.mes_inicio <= v_mes)
        AND (x.id = ANY (v_ids)
             OR x.id IN (SELECT jsonb_array_elements_text(coalesce(v_sal->v_mes, '[]'::jsonb))::uuid)
             OR x.id IN (SELECT jsonb_array_elements_text(coalesce(v_ant->v_mes, '[]'::jsonb))::uuid)
             OR x.consolida_em_conta_id = ANY (v_ids)));
    IF NOT (b.id = ANY (v_calc)) THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public._fn_conciliacao_resumo(b.cliente_id, v_mes, v_calc, false, true) r
                WHERE r.nivel = 'conta' AND r.conta_id = b.id AND r.status = 'conciliado'
                  AND (r.conta_id = ANY (v_ids) OR r.par_conta_id = ANY (v_ids))) THEN
      v_meses := v_meses || v_mes;
    END IF;
  END LOOP;
  v_ultimo := (SELECT max(m) FROM unnest(v_meses) m);
  SELECT x.saldo_final, x.saldo_data INTO v_s FROM public.financeiro_saldos_bancarios_v2 x WHERE x.conta_bancaria_id = b.id AND x.ano_mes = v_ultimo;
  RETURN jsonb_build_object('meses', cardinality(v_meses), 'ultimo', v_ultimo, 'saldo_data', v_s.saldo_data, 'saldo_final', v_s.saldo_final);
END $$;

REVOKE ALL ON FUNCTION public.fn_conta_bancaria_efeito_conciliacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conta_bancaria_efeito_conciliacao(uuid) TO authenticated, service_role;
