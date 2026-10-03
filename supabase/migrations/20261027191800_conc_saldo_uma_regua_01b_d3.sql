-- PR-CONC-SALDO-UMA-REGUA-01b — AJUSTE DO D3 (decisao do Gabriel, 03/10, no OK do relatorio do 01b)
--
-- POR QUE: o 01b fazia o status do agregado (subtotal por tipo e TOTAL) olhar so' as contas COM EXTRATO no mes. Medido em 4
-- cliente-meses — Vera Conta Fazenda jan–mar/26 (−0,03) e NJ Cartao BB Visa Infinite set/26 (−6.470,73) — o total saia
-- 'conciliado' com uma conta 'nao_conciliado' (sem extrato, pela regua de hoje) e a diferenca do total ≠ 0.
-- REGRA NOVA: o agregado so' e' 'conciliado' quando NENHUMA conta esta' 'nao_conciliado', com ou sem extrato; a que diverge
-- entra listada com o motivo (`contas_nao_conciliadas`). Conta 'pendente' NAO derruba o agregado; ele diz quantas sao
-- (`contas_pendentes`, motivo informativo, como `lancamentos_sem_conta`). Nenhuma conciliada e nenhuma divergente = 'pendente'.
--
-- O QUE MUDA
-- 1. `_fn_conciliacao_resumo`: PATCH GUARDADO POR md5 (origem d364e139…, cinco ancoras que casam 1x cada, destino conferido):
--    a contagem do agregado passa de "contas com extrato" a "todas as contas", e o motivo `sem_extrato` do agregado sai
--    (nenhuma conta com extrato ja' nao decide nada). As linhas de CONTA nao mudam. E, so' desempenho, a conta SEM extrato e
--    SEM lancamento no mes usa o dia do helper sobre um periodo vazio, calculado uma vez por chamada (o detalhe dela e' vazio
--    por construcao): o status do ano passou a olhar tambem as contas com saldo informado, e cada conta vazia replanejava as
--    consultas grandes (~6 ms). Saida das linhas de conta identica por md5 (relatorio do PR).
-- 2. `fn_conciliacao_status_ano`: corpo INTEGRAL (pequeno; origem d27b8623… guardada, destino conferido). Para o total ser o
--    do resumo, a interna recebe tambem a conta com SALDO INFORMADO no mes; as demais sao 'pendente' por construcao e entram
--    so' na contagem de pendentes. Continua devolvendo so' as contas com extrato ou lancamento no mes.
-- ACL, SECURITY DEFINER, search_path e plan_cache_mode: CREATE OR REPLACE com a mesma assinatura (conferidos no fim).
-- Nenhuma escrita em dado.

DO $mig$
DECLARE
  v_antes text; v_def text; v_novo text; v_depois text;
  a1 text; b1 text; a2 text; b2 text; a3 text; b3 text; a4 text; b4 text; a5 text; b5 text; a text;
BEGIN
  -- ═══ 1. _fn_conciliacao_resumo — patch guardado por md5 ═══
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO v_antes, v_def FROM pg_proc p
   WHERE p.oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure;
  IF md5(v_antes) <> 'd364e1391a4811f6de7b00769e9df097' THEN
    RAISE EXCEPTION '_fn_conciliacao_resumo nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  a1 := $a1$  v_det boolean; v_origem text; v_contas jsonb := '[]'::jsonb; v_sem jsonb; g record; v_next int; v_nfal int; v_falhas jsonb;
$a1$;
  b1 := $b1$  v_det boolean; v_origem text; v_contas jsonb := '[]'::jsonb; v_sem jsonb; g record; v_next int; v_nfal int; v_falhas jsonb;
  v_npend int; v_vazio jsonb; v_vazio_pos jsonb;
$b1$;
  a2 := $a2$  -- saldo ignora a conta sem ele e e' NULA so' quando nenhuma o tem. STATUS: sobre TODAS as contas COM EXTRATO no mes
  -- (internas inclusive) — 'conciliado' so' com todas conciliadas; senao 'nao_conciliado' com cada conta e os motivos
  -- dela; nenhuma com extrato = 'pendente' ('sem_extrato'). Nao existe 'parcial'.
$a2$;
  b2 := $b2$  -- saldo ignora a conta sem ele e e' NULA so' quando nenhuma o tem. STATUS (decisao do Gabriel, 03/10, no 01b): sobre TODAS
  -- as contas, com ou sem extrato (internas inclusive) — qualquer 'nao_conciliado' faz o agregado 'nao_conciliado', com cada
  -- conta e os motivos dela; 'pendente' nao derruba e o agregado diz quantas sao ('contas_pendentes'); nenhuma conciliada e
  -- nenhuma divergente = 'pendente'; o resto, 'conciliado'. Nao existe 'parcial'.
$b2$;
  a3 := $a3$      count(*) FILTER (WHERE (y->>'tem_extrato')::boolean),
      count(*) FILTER (WHERE (y->>'tem_extrato')::boolean AND y->>'status' <> 'conciliado'),
      jsonb_agg(jsonb_build_object('conta_id', y->'conta_id', 'conta_nome', y->'conta_nome', 'status', y->'status',
                                   'motivos', y->'motivos') ORDER BY i)
        FILTER (WHERE (y->>'tem_extrato')::boolean AND y->>'status' <> 'conciliado')
      INTO tem_extrato, saldo_inicial, entradas, saidas, saldo_sistema, saldo_extrato, diferenca, banco,
           extratos_sem_par, lancamentos_sem_par, retido_em_depositos,
           entradas_terceiros, entradas_transferencias, saidas_terceiros, saidas_transferencias, v_next, v_nfal, v_falhas
$a3$;
  b3 := $b3$      count(*) FILTER (WHERE y->>'status' = 'conciliado'),
      count(*) FILTER (WHERE y->>'status' = 'nao_conciliado'),
      jsonb_agg(jsonb_build_object('conta_id', y->'conta_id', 'conta_nome', y->'conta_nome', 'status', y->'status',
                                   'motivos', y->'motivos') ORDER BY i)
        FILTER (WHERE y->>'status' = 'nao_conciliado'),
      count(*) FILTER (WHERE y->>'status' = 'pendente')
      INTO tem_extrato, saldo_inicial, entradas, saidas, saldo_sistema, saldo_extrato, diferenca, banco,
           extratos_sem_par, lancamentos_sem_par, retido_em_depositos,
           entradas_terceiros, entradas_transferencias, saidas_terceiros, saidas_transferencias, v_next, v_nfal, v_falhas, v_npend
$b3$;
  a4 := $a4$    v_mot := '[]'::jsonb;
    IF v_next = 0 THEN
      v_status := 'pendente';
      v_mot := jsonb_build_array(jsonb_build_object('motivo', 'sem_extrato'));
    ELSIF v_nfal = 0 THEN
      v_status := 'conciliado';
    ELSE
      v_status := 'nao_conciliado';
      v_mot := jsonb_build_array(jsonb_build_object('motivo', 'contas_nao_conciliadas', 'qtde', v_nfal, 'contas', v_falhas));
    END IF;
$a4$;
  b4 := $b4$    v_mot := '[]'::jsonb;
    IF v_nfal > 0 THEN
      v_status := 'nao_conciliado';
      v_mot := jsonb_build_array(jsonb_build_object('motivo', 'contas_nao_conciliadas', 'qtde', v_nfal, 'contas', v_falhas));
    ELSIF v_next = 0 THEN
      v_status := 'pendente';
    ELSE
      v_status := 'conciliado';
    END IF;
    IF v_npend > 0 THEN
      v_mot := v_mot || jsonb_build_array(jsonb_build_object('motivo', 'contas_pendentes', 'qtde', v_npend));
    END IF;
$b4$;
  a5 := $a5$    v := public._fn_conciliacao_dias_conta(p_cliente_id, c.id, v_d1, v_d2, v_det,
                                           CASE WHEN v_data < v_d2 THEN v_data END, v_ini);
$a5$;
  b5 := $b5$    -- Ajuste do D3 (20261027191800), so' desempenho: conta SEM extrato e SEM lancamento no mes (qualquer status, cancelado
    -- inclusive — o teste e' mais largo que o do helper) tem o detalhe VAZIO por construcao, e o dia dela e' o do helper sobre
    -- um periodo vazio (p_de > p_ate), calculado UMA vez por chamada (com e sem posicao). Replanejar as consultas grandes por
    -- conta vazia custava ~6 ms (force_custom_plan) e o status do ano passou a olhar as contas com saldo informado.
    IF EXISTS (SELECT 1 FROM extrato_bancario_v2 e
                WHERE e.cliente_id = p_cliente_id AND e.conta_bancaria_id = c.id AND e.data_movimento BETWEEN v_d1 AND v_d2)
       OR EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 l
                   WHERE l.cliente_id = p_cliente_id AND l.conta_bancaria_id = c.id AND l.data_pagamento BETWEEN v_d1 AND v_d2)
       OR EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 l
                   WHERE l.cliente_id = p_cliente_id AND l.conta_destino_id = c.id AND l.data_pagamento BETWEEN v_d1 AND v_d2) THEN
      v := public._fn_conciliacao_dias_conta(p_cliente_id, c.id, v_d1, v_d2, v_det,
                                             CASE WHEN v_data < v_d2 THEN v_data END, v_ini);
    ELSIF v_data < v_d2 THEN
      IF v_vazio_pos IS NULL THEN
        v_vazio_pos := public._fn_conciliacao_dias_conta(p_cliente_id, c.id, v_d2 + 1, v_d1, v_det, v_data, NULL);
      END IF;
      v := v_vazio_pos;
    ELSE
      IF v_vazio IS NULL THEN
        v_vazio := public._fn_conciliacao_dias_conta(p_cliente_id, c.id, v_d2 + 1, v_d1, v_det, NULL, NULL);
      END IF;
      v := v_vazio;
    END IF;
$b5$;

  FOREACH a IN ARRAY ARRAY[a1, a2, a3, a4, a5] LOOP
    IF (length(v_antes) - length(replace(v_antes, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION 'ancora nao casa exatamente 1x: %', left(a, 80);
    END IF;
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION 'ancora nao casa exatamente 1x na definicao: %', left(a, 80);
    END IF;
  END LOOP;
  v_novo := replace(replace(replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3), a4, b4), a5, b5);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p
   WHERE p.oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure;
  IF md5(v_depois) <> 'd8463a56410399b049280a336ae47b27' THEN
    RAISE EXCEPTION '_fn_conciliacao_resumo: corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;

  -- ═══ 2. fn_conciliacao_status_ano — guarda de origem ═══
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure)
       IS DISTINCT FROM 'd27b86236ab5d22e01289e830d563b0a' THEN
    RAISE EXCEPTION 'fn_conciliacao_status_ano nao esta no corpo esperado. Migration abortada.';
  END IF;
END $mig$;

CREATE OR REPLACE FUNCTION public.fn_conciliacao_status_ano(p_cliente_id uuid, p_ano integer)
 RETURNS TABLE(ano_mes text, nivel text, conta_id uuid, conta_nome text, tipo_conta text, status text, motivos jsonb)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- PR-CONC-SALDO-UMA-REGUA-01b (D7) — o selo dos 12 meses: por mes, o status e os motivos de cada conta que teve extrato
-- ou lancamento no mes, e o do TOTAL do mes. Sai da MESMA interna do resumo (`_fn_conciliacao_resumo`), sem detalhe.
-- Ajuste do D3 (20261027191800): o total olha TODAS as contas, com ou sem extrato. Por isso a interna recebe tambem a
-- conta com SALDO INFORMADO no mes (a unica que, sem extrato e sem lancamento, pode sair 'conciliado' ou 'nao_conciliado'
-- pela regua de hoje); as demais contas do cliente sao 'pendente' por construcao (sem extrato e sem saldo informado = a
-- regua de hoje diz 'pendente') e entram SO' na contagem `contas_pendentes` do total — o mesmo numero do resumo.
#variable_conflict use_column
DECLARE v_mov jsonb; v_sal jsonb; v_mes text; v_ids uuid[]; v_calc uuid[]; v_omit int; v_total int;
BEGIN
  IF p_cliente_id IS NULL OR p_ano IS NULL THEN RAISE EXCEPTION 'p_cliente_id e p_ano obrigatorios'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  -- as contas com movimento em cada mes do ano: extrato vivo, ou lancamento nao cancelado pago no mes (qualquer ponta)
  SELECT jsonb_object_agg(m.mes, m.contas) INTO v_mov
    FROM (SELECT x.mes, jsonb_agg(DISTINCT x.conta) AS contas
            FROM (SELECT to_char(e.data_movimento, 'YYYY-MM') AS mes, e.conta_bancaria_id AS conta
                    FROM extrato_bancario_v2 e
                   WHERE e.cliente_id = p_cliente_id AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL
                     AND e.data_movimento BETWEEN make_date(p_ano, 1, 1) AND make_date(p_ano, 12, 31)
                  UNION
                  SELECT to_char(l.data_pagamento, 'YYYY-MM'), k.conta
                    FROM financeiro_lancamentos_v2 l
                    CROSS JOIN LATERAL (VALUES (l.conta_bancaria_id), (l.conta_destino_id)) k(conta)
                   WHERE l.cliente_id = p_cliente_id AND l.cancelado = false
                     AND l.data_pagamento BETWEEN make_date(p_ano, 1, 1) AND make_date(p_ano, 12, 31)
                     AND k.conta IS NOT NULL) x
           WHERE x.conta IS NOT NULL
           GROUP BY x.mes) m;
  -- as contas com saldo informado em cada mes do ano
  SELECT jsonb_object_agg(m.mes, m.contas) INTO v_sal
    FROM (SELECT s.ano_mes AS mes, jsonb_agg(DISTINCT s.conta_bancaria_id) AS contas
            FROM financeiro_saldos_bancarios_v2 s
           WHERE s.cliente_id = p_cliente_id AND s.ano_mes LIKE p_ano::text || '-%' AND s.conta_bancaria_id IS NOT NULL
           GROUP BY s.ano_mes) m;
  SELECT count(*) INTO v_total FROM financeiro_contas_bancarias b WHERE b.cliente_id = p_cliente_id;
  FOR i IN 1..12 LOOP
    v_mes := p_ano::text || '-' || lpad(i::text, 2, '0');
    v_ids := coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v_mov->v_mes, '[]'::jsonb))::uuid), '{}'::uuid[]);
    v_calc := ARRAY(SELECT b.id FROM financeiro_contas_bancarias b
                     WHERE b.cliente_id = p_cliente_id
                       AND (b.id = ANY (v_ids)
                            OR b.id IN (SELECT jsonb_array_elements_text(coalesce(v_sal->v_mes, '[]'::jsonb))::uuid)));
    v_omit := v_total - cardinality(v_calc);
    RETURN QUERY
      SELECT v_mes, r.nivel, r.conta_id, r.conta_nome, r.tipo_conta, r.status,
             CASE WHEN r.nivel <> 'total' OR v_omit = 0 THEN r.motivos
                  -- as omitidas somam-se a' contagem de pendentes, na MESMA posicao em que o resumo a escreve
                  WHEN r.motivos @> '[{"motivo": "contas_pendentes"}]'::jsonb THEN
                    (SELECT jsonb_agg(CASE WHEN x.m->>'motivo' = 'contas_pendentes'
                                           THEN jsonb_set(x.m, '{qtde}', to_jsonb((x.m->>'qtde')::int + v_omit)) ELSE x.m END
                                      ORDER BY x.o)
                       FROM jsonb_array_elements(r.motivos) WITH ORDINALITY AS x(m, o))
                  ELSE
                    (SELECT jsonb_agg(z.m ORDER BY z.k)
                       FROM (SELECT x.m, x.o::numeric AS k FROM jsonb_array_elements(r.motivos) WITH ORDINALITY AS x(m, o)
                             UNION ALL
                             SELECT jsonb_build_object('motivo', 'contas_pendentes', 'qtde', v_omit),
                                    coalesce((SELECT x.o FROM jsonb_array_elements(r.motivos) WITH ORDINALITY AS x(m, o)
                                               WHERE x.m->>'motivo' = 'lancamentos_sem_conta'), 1000000) - 0.5) z)
             END
        FROM public._fn_conciliacao_resumo(p_cliente_id, v_mes, v_calc, false, true) r
       WHERE (r.nivel = 'conta' AND r.conta_id = ANY (v_ids)) OR r.nivel = 'total';
  END LOOP;
END
$function$;

-- ═══ guardas de destino ═══
DO $guarda$
DECLARE r record; f text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure)
       IS DISTINCT FROM 'b31bf6ac20476dde577519116bdc752f' THEN
    RAISE EXCEPTION 'fn_conciliacao_status_ano: corpo de destino inesperado';
  END IF;
  FOREACH f IN ARRAY ARRAY['public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)',
                           'public.fn_conciliacao_status_ano(uuid, integer)'] LOOP
    SELECT p.oid, p.proconfig, p.prosecdef INTO r FROM pg_proc p WHERE p.oid = f::regprocedure;
    IF NOT ('plan_cache_mode=force_custom_plan' = ANY (r.proconfig)) OR NOT ('search_path=pg_catalog, public' = ANY (r.proconfig))
       OR NOT r.prosecdef OR has_function_privilege('anon', r.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', r.oid, 'EXECUTE') <> (f NOT LIKE 'public.\_fn%') THEN
      RAISE EXCEPTION '%: config/ACL inesperados (%)', f, r.proconfig;
    END IF;
  END LOOP;
END $guarda$;