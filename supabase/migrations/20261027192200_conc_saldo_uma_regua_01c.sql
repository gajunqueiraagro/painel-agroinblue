-- PR-CONC-SALDO-UMA-REGUA-01c — o dono do resumo completa o que a tela (PR 02) precisa para so' desenhar
--
-- POR QUE (o PARE das 15:13 do PR 02): tres numeros da tela ainda seriam conta do front —
--   G1 o CONJUNTO DE CONTAS: a tela mostra so' conta ATIVA e ja' existente no mes (`mes_inicio`, a regua de `perContaSaldos`); o
--      dono somava e contava todas as contas do cliente (em 2026, 1 conta a mais em jan–mar no Santa Rita e no 537661af);
--   G3 a DIFERENCA POR LADO do quadro do topo do Casar (banco − sistema nas entradas e nas saidas), que a tela subtraia;
--   G4 o SALDO CORRIDO da aba Sistema, o centro e o status de exibicao de cada linha.
--
-- O QUE MUDA (aditivo)
-- D1. `_fn_conciliacao_resumo` (patch guardado por md5; DROP + CREATE pela definicao viva, o retorno ganha colunas): com
--     `p_conta_ids` NULO o conjunto e' o da tela (ativa e `mes_inicio <= mes`); com `p_conta_ids`, nada muda.
--     `fn_conciliacao_status_ano` (corpo integral) usa o mesmo universo por mes.
-- D2. Toda linha ganha `diferenca_entradas` e `diferenca_saidas` (banco − sistema, do cru, arredondado; nos agregados, a soma
--     das contas fora as internas).
-- D3. `linhas_sistema` (`_fn_conciliacao_dias_conta`, patch guardado) ganha `saldo_apos` (saldo inicial + as linhas ate' ela, na
--     ordem da lista — fecha em `saldo_sistema`), `centro` e `status_exibicao` ('conciliado' | 'parcial' | 'realizado').
-- `fn_conciliacao_resumo_mes`: mesmo corpo, as duas colunas novas no fim (DROP + CREATE: o tipo de retorno mudou).
-- ACL, SECURITY DEFINER, search_path, plan_cache_mode e tenant_ok mantidos e conferidos no fim. Nenhuma escrita em dado.

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])'::regprocedure)
       IS DISTINCT FROM '25aa2ac47b2bec06c951377cb2cecc84'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure)
       IS DISTINCT FROM 'b31bf6ac20476dde577519116bdc752f' THEN
    RAISE EXCEPTION 'resumo publico ou status do ano fora do corpo esperado. Migration abortada.';
  END IF;
END $guarda$;

-- ═══ D3 — linhas_sistema ═══
DO $mig$
DECLARE
  v_src text; v_def text; v_novo text; v_depois text; a text; a1 text; b1 text; a2 text; b2 text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO v_src, v_def FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)'::regprocedure;
  IF md5(v_src) <> 'b194103ab9b83d24d8428af971fc8881' THEN
    RAISE EXCEPTION '_fn_conciliacao_dias_conta nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a1 := $a1$           l.tipo_operacao, l.status_transacao, l.data_pagamento, l.valor, l.numero_documento
$a1$;
  b1 := $b1$           l.tipo_operacao, l.status_transacao, l.data_pagamento, l.valor, l.numero_documento, l.centro_custo AS centro
$b1$;
  a2 := $a2$    'linhas_sistema', CASE WHEN p_detalhe THEN coalesce((
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'tipo', p.tipo, 'data', p.data, 'valor', p.valor, 'lancamento_id', p.lancamento_id,
                 'extrato_id', p.extrato_id, 'extrato_valor', p.extrato_valor,
                 'transferencia', CASE WHEN p.transf THEN true END,
                 'parcial', CASE WHEN car.lancamento_id IS NOT NULL THEN true END, 'falta', car.falta,
                 'sobre_aplicado', CASE WHEN EXISTS (SELECT 1 FROM sobre WHERE sobre.lancamento_id = p.lancamento_id) THEN true END,
                 'descricao', t.descricao, 'fornecedor', f.nome, 'subcentro', t.subcentro, 'tipo_operacao', t.tipo_operacao,
                 'status_transacao', t.status_transacao, 'data_pagamento', t.data_pagamento, 'valor_lancamento', t.valor,
                 'numero_documento', t.numero_documento))
                 ORDER BY p.data, p.tipo DESC, p.extrato_id, p.lancamento_id)
          FROM pecas2 p
          LEFT JOIN tip t ON t.id = p.lancamento_id
          LEFT JOIN financeiro_fornecedores f ON f.id = t.favorecido_id
          LEFT JOIN (SELECT c.lancamento_id, max(c.falta) AS falta
                       FROM public.fn_caixa_sistema_pontas(p_cliente, p_conta, p_de, p_ate) c
                      WHERE c.parcial GROUP BY c.lancamento_id) car
                 ON car.lancamento_id = p.lancamento_id AND p.tipo = 'vinculo'), '[]'::jsonb) END
$a2$;
  b2 := $b2$    'linhas_sistema', CASE WHEN p_detalhe THEN coalesce((
        -- PR-CONC-SALDO-UMA-REGUA-01c: + saldo_apos (saldo inicial + as linhas ate' esta, na ordem da lista — fecha em
        -- saldo_sistema), centro e o status de exibicao ('conciliado' o vinculo, 'parcial' o programado que nao quitou,
        -- 'realizado' o sem par e o resto). Nenhuma tela soma linha.
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'tipo', q.tipo, 'data', q.data, 'valor', q.valor, 'lancamento_id', q.lancamento_id,
                 'extrato_id', q.extrato_id, 'extrato_valor', q.extrato_valor,
                 'transferencia', CASE WHEN q.transf THEN true END,
                 'parcial', CASE WHEN q.car_lid IS NOT NULL THEN true END, 'falta', q.falta,
                 'sobre_aplicado', CASE WHEN EXISTS (SELECT 1 FROM sobre WHERE sobre.lancamento_id = q.lancamento_id) THEN true END,
                 'descricao', q.descricao, 'fornecedor', q.fornecedor, 'subcentro', q.subcentro, 'tipo_operacao', q.tipo_operacao,
                 'status_transacao', q.status_transacao, 'data_pagamento', q.data_pagamento, 'valor_lancamento', q.valor_lancamento,
                 'numero_documento', q.numero_documento,
                 'centro', q.centro,
                 'status_exibicao', CASE WHEN q.car_lid IS NOT NULL THEN 'parcial' WHEN q.tipo = 'vinculo' THEN 'conciliado' ELSE 'realizado' END,
                 'saldo_apos', round(p_saldo_inicial + q.acum, 2)))
                 ORDER BY q.rn)
          FROM (SELECT z.*, sum(z.valor) OVER (ORDER BY z.rn ROWS UNBOUNDED PRECEDING) AS acum
                  FROM (SELECT p.tipo, p.data, p.valor, p.lancamento_id, p.extrato_id, p.extrato_valor, p.transf,
                               car.lancamento_id AS car_lid, car.falta, t.descricao, f.nome AS fornecedor, t.subcentro, t.centro,
                               t.tipo_operacao, t.status_transacao, t.data_pagamento, t.valor AS valor_lancamento, t.numero_documento,
                               row_number() OVER (ORDER BY p.data, p.tipo DESC, p.extrato_id, p.lancamento_id) AS rn
                          FROM pecas2 p
                          LEFT JOIN tip t ON t.id = p.lancamento_id
                          LEFT JOIN financeiro_fornecedores f ON f.id = t.favorecido_id
                          LEFT JOIN (SELECT c.lancamento_id, max(c.falta) AS falta
                                       FROM public.fn_caixa_sistema_pontas(p_cliente, p_conta, p_de, p_ate) c
                                      WHERE c.parcial GROUP BY c.lancamento_id) car
                                 ON car.lancamento_id = p.lancamento_id AND p.tipo = 'vinculo') z) q), '[]'::jsonb) END
$b2$;
  FOREACH a IN ARRAY ARRAY[a1, a2] LOOP
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION '_fn_conciliacao_dias_conta: ancora nao casa exatamente 1x na definicao: %', left(a, 80);
    END IF;
  END LOOP;
  v_novo := replace(replace(v_def, a1, b1), a2, b2);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)'::regprocedure;
  IF md5(v_depois) <> 'b00a0840cf0361ddcd6a367bc2db3fb0' THEN
    RAISE EXCEPTION '_fn_conciliacao_dias_conta: corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
END $mig$;

-- ═══ D1/D2 — a interna do resumo ═══
-- a publica e o status do ano a chamam: a publica cai antes (o tipo de retorno dela muda junto)
DROP FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]);

DO $mig$
DECLARE
  v_src text; v_def text; v_novo text; v_depois text; a text; a1 text; b1 text; a2 text; b2 text; a3 text; b3 text; a4 text; b4 text; a5 text; b5 text; a6 text; b6 text; a7 text; b7 text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO v_src, v_def FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure;
  IF md5(v_src) <> 'd8463a56410399b049280a336ae47b27' THEN
    RAISE EXCEPTION '_fn_conciliacao_resumo nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a1 := $a1$posicao jsonb, dias jsonb, linhas_sistema jsonb, sem_conta jsonb)$a1$;
  b1 := $b1$posicao jsonb, dias jsonb, linhas_sistema jsonb, sem_conta jsonb, diferenca_entradas numeric, diferenca_saidas numeric)$b1$;
  a2 := $a2$  v_det := coalesce(p_detalhe, (SELECT count(*) = 1 FROM financeiro_contas_bancarias b
                                 WHERE b.cliente_id = p_cliente_id AND (p_conta_ids IS NULL OR b.id = ANY (p_conta_ids))));$a2$;
  b2 := $b2$  -- PR-CONC-SALDO-UMA-REGUA-01c (D1): sem `p_conta_ids`, o conjunto e' o da tela — conta ATIVA e ja' existente no mes
  -- (`mes_inicio`, a regua de `perContaSaldos`); com `p_conta_ids`, as contas pedidas, como antes.
  v_det := coalesce(p_detalhe, (SELECT count(*) = 1 FROM financeiro_contas_bancarias b
                                 WHERE b.cliente_id = p_cliente_id
                                   AND CASE WHEN p_conta_ids IS NULL THEN b.ativa AND (b.mes_inicio IS NULL OR b.mes_inicio <= p_ano_mes)
                                            ELSE b.id = ANY (p_conta_ids) END));$b2$;
  a3 := $a3$      FROM financeiro_contas_bancarias b
     WHERE b.cliente_id = p_cliente_id AND (p_conta_ids IS NULL OR b.id = ANY (p_conta_ids))
     ORDER BY$a3$;
  b3 := $b3$      FROM financeiro_contas_bancarias b
     WHERE b.cliente_id = p_cliente_id
       AND CASE WHEN p_conta_ids IS NULL THEN b.ativa AND (b.mes_inicio IS NULL OR b.mes_inicio <= p_ano_mes)
                ELSE b.id = ANY (p_conta_ids) END
     ORDER BY$b3$;
  a4 := $a4$    saidas_transferencias := round((v->>'saidas_transferencias')::numeric, 2);
$a4$;
  b4 := $b4$    saidas_transferencias := round((v->>'saidas_transferencias')::numeric, 2);
    -- PR-CONC-SALDO-UMA-REGUA-01c (D2): a diferenca por lado, banco − sistema, do cru (o lado e' o do extrato)
    diferenca_entradas := round((v->>'banco_entradas')::numeric - (v->>'entradas')::numeric, 2);
    diferenca_saidas := round((v->>'banco_saidas')::numeric - (v->>'saidas')::numeric, 2);
$b4$;
  a5 := $a5$      'et', entradas_terceiros, 'etr', entradas_transferencias, 'st', saidas_terceiros, 'str', saidas_transferencias));$a5$;
  b5 := $b5$      'et', entradas_terceiros, 'etr', entradas_transferencias, 'st', saidas_terceiros, 'str', saidas_transferencias,
      'de', diferenca_entradas, 'ds', diferenca_saidas));$b5$;
  a6 := $a6$      coalesce(sum((y->>'str')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
$a6$;
  b6 := $b6$      coalesce(sum((y->>'str')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
      coalesce(sum((y->>'de')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
      coalesce(sum((y->>'ds')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
$b6$;
  a7 := $a7$entradas_terceiros, entradas_transferencias, saidas_terceiros, saidas_transferencias, v_next, v_nfal, v_falhas, v_npend$a7$;
  b7 := $b7$entradas_terceiros, entradas_transferencias, saidas_terceiros, saidas_transferencias, diferenca_entradas, diferenca_saidas,
           v_next, v_nfal, v_falhas, v_npend$b7$;
  FOREACH a IN ARRAY ARRAY[a1, a2, a3, a4, a5, a6, a7] LOOP
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION '_fn_conciliacao_resumo: ancora nao casa exatamente 1x na definicao: %', left(a, 80);
    END IF;
  END LOOP;
  v_novo := replace(replace(replace(replace(replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3), a4, b4), a5, b5), a6, b6), a7, b7);
  DROP FUNCTION public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure;
  IF md5(v_depois) <> '3f91479aabbe56182c0e275f8ed9a57f' THEN
    RAISE EXCEPTION '_fn_conciliacao_resumo: corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
END $mig$;
REVOKE ALL ON FUNCTION public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean) TO service_role;

-- ═══ a publica: mesmo corpo (md5 25aa2ac4…), as duas colunas novas no fim ═══
CREATE FUNCTION public.fn_conciliacao_resumo_mes(p_cliente_id uuid, p_ano_mes text, p_conta_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(conta_id uuid, conta_nome text, consolida_em_conta_id uuid, tem_extrato boolean, saldo_inicial numeric, entradas numeric, saidas numeric, saldo_sistema numeric, saldo_extrato numeric, saldo_extrato_data date, diferenca numeric, banco jsonb, extratos_sem_par jsonb, lancamentos_sem_par jsonb, retido_em_depositos jsonb, dias_com_diferenca jsonb, status text, motivos jsonb, legado jsonb, nivel text, tipo_conta text, entradas_terceiros numeric, entradas_transferencias numeric, saidas_terceiros numeric, saidas_transferencias numeric, saldo_inicial_origem text, posicao jsonb, dias jsonb, linhas_sistema jsonb, sem_conta jsonb, diferenca_entradas numeric, diferenca_saidas numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- PR-CONC-SALDO-UMA-REGUA-01 / 01b — o RESUMO DA CONTA NO MES: uma linha por conta (NULL = todas as do cliente), um
-- subtotal por tipo e o total. Com UMA conta, tambem os dias e a lista do sistema. O corpo e' `_fn_conciliacao_resumo`.
BEGIN
  IF p_cliente_id IS NULL OR p_ano_mes !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'p_cliente_id e p_ano_mes (YYYY-MM) obrigatorios'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  RETURN QUERY SELECT * FROM public._fn_conciliacao_resumo(p_cliente_id, p_ano_mes, p_conta_ids, NULL, p_conta_ids IS NULL);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]) TO authenticated, service_role;

-- ═══ D1 — o status do ano no mesmo universo (corpo integral) ═══
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
  FOR i IN 1..12 LOOP
    v_mes := p_ano::text || '-' || lpad(i::text, 2, '0');
    v_ids := coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v_mov->v_mes, '[]'::jsonb))::uuid), '{}'::uuid[]);
    -- PR-CONC-SALDO-UMA-REGUA-01c: o universo do mes e' o do resumo sem `p_conta_ids` — conta ATIVA e ja' existente no mes
    SELECT count(*) INTO v_total FROM financeiro_contas_bancarias b
     WHERE b.cliente_id = p_cliente_id AND b.ativa AND (b.mes_inicio IS NULL OR b.mes_inicio <= v_mes);
    v_calc := ARRAY(SELECT b.id FROM financeiro_contas_bancarias b
                     WHERE b.cliente_id = p_cliente_id AND b.ativa AND (b.mes_inicio IS NULL OR b.mes_inicio <= v_mes)
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
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])'::regprocedure)
       IS DISTINCT FROM '25aa2ac47b2bec06c951377cb2cecc84'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure)
       IS DISTINCT FROM 'fd79e1bde1b45a80d364670fc1a2f7cf' THEN
    RAISE EXCEPTION 'corpo de destino inesperado (resumo publico / status do ano)';
  END IF;
  FOREACH f IN ARRAY ARRAY['public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)',
                           'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)',
                           'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])',
                           'public.fn_conciliacao_status_ano(uuid, integer)'] LOOP
    SELECT p.oid, p.proconfig, p.prosecdef INTO r FROM pg_proc p WHERE p.oid = f::regprocedure;
    IF NOT ('plan_cache_mode=force_custom_plan' = ANY (r.proconfig)) OR NOT ('search_path=pg_catalog, public' = ANY (r.proconfig))
       OR NOT r.prosecdef OR has_function_privilege('anon', r.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', r.oid, 'EXECUTE') <> (f NOT LIKE 'public.\_fn%')
       OR EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = r.oid)) x WHERE x.grantee = 0) THEN
      RAISE EXCEPTION '%: config/ACL inesperados (%)', f, r.proconfig;
    END IF;
  END LOOP;
END $guarda$;