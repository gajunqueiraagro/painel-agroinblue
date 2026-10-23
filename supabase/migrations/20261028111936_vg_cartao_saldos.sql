-- P82 (Gabriel 23/10/2026) — a REGRA DO CARTAO nos saldos (fn_vg_saldos) e o caminho da CPR (fn_cpr_cartoes). Ver a 111935.
-- O cartao entra no conjunto padrao (saldo devedor = fatura em aberto, pela ancora conciliada dele); a compra no cartao e' saida; o
-- pagamento da fatura e' transferencia dentro do conjunto. Com o cartao FORA da selecao, a transferencia com ele vem na coluna nova
-- `cartao` (o caixa cai, mas nao como saida) e saldo_final = inicial + entradas - saidas - cartao. Coluna nova no retorno: DROP.

DROP FUNCTION IF EXISTS public.fn_vg_saldos(uuid, date, date, uuid[], date, text[], boolean);

CREATE OR REPLACE FUNCTION public.fn_vg_saldos(
  p_cliente uuid, p_de date, p_ate date, p_contas uuid[] DEFAULT NULL, p_hoje date DEFAULT CURRENT_DATE,
  p_status text[] DEFAULT NULL, p_incluir_vencidos boolean DEFAULT true)
RETURNS TABLE(ano_mes text, saldo_inicial numeric, entradas numeric, saidas numeric, saldo_final numeric,
              com_previsto boolean, conciliado_ate date, contas_sem_ancora text[],
              entradas_vencidas numeric, saidas_vencidas numeric, cartao numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_todas boolean := p_contas IS NULL;
  v_ini date;
  v_fim date;
  v_fim_dia date;
  v_atual date;
  v_status text[] := public.fn_vg_status_validos(p_status);
  v_venc boolean := coalesce(p_incluir_vencidos, true);
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de OR p_hoje IS NULL THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;
  v_ini := date_trunc('month', p_de)::date;
  v_fim := date_trunc('month', p_ate)::date;
  v_fim_dia := (v_fim + interval '1 month - 1 day')::date;
  v_atual := date_trunc('month', p_hoje)::date;

  RETURN QUERY
  WITH contas AS (
    SELECT c.id, coalesce(nullif(c.nome_exibicao, ''), c.nome_conta) AS nome, lower(coalesce(c.tipo_conta, '')) AS tipo
      FROM public.financeiro_contas_bancarias c
     WHERE c.cliente_id = p_cliente
       AND CASE WHEN v_todas THEN c.ativa AND (lower(coalesce(c.tipo_conta, '')) IN ('cc', 'inv', 'permuta') OR public.fn_vg_eh_cartao(c.tipo_conta))
                ELSE c.id = ANY (p_contas) END
  ), cartoes_fora AS (
    -- P82: os cartoes do cliente que NAO estao no conjunto: a transferencia com eles e' "Pagamento de cartao", nunca saida
    SELECT c.id FROM public.financeiro_contas_bancarias c
     WHERE c.cliente_id = p_cliente AND public.fn_vg_eh_cartao(c.tipo_conta) AND c.id NOT IN (SELECT k.id FROM contas k)
  ), lanc AS (
    SELECT l.id, l.status_transacao = 'realizado' AS eh_real,
           CASE WHEN l.status_transacao = 'realizado' THEN l.data_pagamento
                ELSE greatest(coalesce(l.data_vencimento, l.data_competencia), v_atual) END AS dia,
           l.status_transacao <> 'realizado' AND coalesce(l.data_vencimento, l.data_competencia) < p_hoje AS venc,
           abs(l.valor) AS v, l.conta_bancaria_id AS co, l.conta_destino_id AS cd, l.tipo_operacao LIKE '3-%' AS tr,
           l.tipo_operacao LIKE '3-%' AND (l.conta_bancaria_id IN (SELECT f.id FROM cartoes_fora f) OR l.conta_destino_id IN (SELECT f.id FROM cartoes_fora f)) AS cf,
           CASE l.sinal::text WHEN '1' THEN 1 WHEN '-1' THEN -1
                ELSE CASE WHEN l.tipo_operacao = '1-Entradas' THEN 1
                          WHEN l.tipo_operacao LIKE '2-%' OR l.tipo_operacao LIKE '3-%' THEN -1 ELSE 0 END END AS s
      FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente
       AND l.cancelado = false
       AND l.cenario IS DISTINCT FROM 'meta'
       AND coalesce(l.sem_movimentacao_caixa, false) = false
       AND ((l.status_transacao = 'realizado' AND l.data_pagamento IS NOT NULL)
         OR (l.status_transacao = ANY (v_status)
             AND (v_venc OR coalesce(l.data_vencimento, l.data_competencia) >= p_hoje)
             AND greatest(coalesce(l.data_vencimento, l.data_competencia), v_atual) BETWEEN v_ini AND v_fim_dia))
  ), pernas AS (
    -- uma linha por (lancamento, conta do conjunto): o movimento NAQUELA conta (movimentoNaConta)
    SELECT x.id, x.eh_real, x.venc, x.cf, x.dia, k.id AS conta,
           CASE WHEN x.cd = k.id AND x.co IS DISTINCT FROM k.id THEN x.v ELSE x.v * x.s END AS mov
      FROM lanc x JOIN contas k ON k.id = x.co OR k.id = x.cd
  ), real_mes AS (
    SELECT p.conta, date_trunc('month', p.dia)::date AS mes, sum(p.mov) AS mov
      FROM pernas p WHERE p.eh_real GROUP BY 1, 2
  ), cand AS (
    SELECT DISTINCT ON (s.conta_bancaria_id, s.ano_mes)
           s.conta_bancaria_id AS conta, to_date(s.ano_mes || '-01', 'YYYY-MM-DD') AS mes,
           coalesce(s.saldo_data, (to_date(s.ano_mes || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date) AS posicao,
           coalesce(s.saldo_inicial, 0) AS si, s.saldo_final AS sf
      FROM public.financeiro_saldos_bancarios_v2 s
     WHERE s.cliente_id = p_cliente AND s.saldo_final IS NOT NULL
       AND s.conta_bancaria_id IN (SELECT k.id FROM contas k)
     ORDER BY s.conta_bancaria_id, s.ano_mes, s.updated_at DESC
  ), fecha AS (
    SELECT c.conta, c.mes, c.posicao, c.sf, k.tipo,
           round(c.si + CASE WHEN c.posicao = (c.mes + interval '1 month - 1 day')::date THEN coalesce(rm.mov, 0)
                             ELSE coalesce((SELECT sum(p.mov) FROM pernas p WHERE p.eh_real AND p.conta = c.conta
                                              AND p.dia >= c.mes AND p.dia <= c.posicao), 0) END, 2) = round(c.sf, 2) AS ok
      FROM cand c JOIN contas k ON k.id = c.conta
      LEFT JOIN real_mes rm ON rm.conta = c.conta AND rm.mes = c.mes
  ), anc AS (
    SELECT DISTINCT ON (f.conta) f.conta, f.mes, f.posicao AS data, round(f.sf, 2) AS valor
      FROM fecha f WHERE f.ok OR f.tipo = 'permuta'
     ORDER BY f.conta, f.mes DESC
  ), serie_conta AS (
    SELECT a.conta, g::date AS mes
      FROM anc a,
           generate_series(least(a.mes, (v_ini - interval '1 month')::date,
                                 coalesce((SELECT min(r.mes) FROM real_mes r WHERE r.conta = a.conta), a.mes)),
                           greatest(v_fim, a.mes), interval '1 month') g
  ), cum AS (
    SELECT sc.conta, sc.mes, sum(coalesce(rm.mov, 0)) OVER (PARTITION BY sc.conta ORDER BY sc.mes) AS c
      FROM serie_conta sc LEFT JOIN real_mes rm ON rm.conta = sc.conta AND rm.mes = sc.mes
  ), base_a AS (
    -- o acumulado ate' a posicao da ancora: o do mes anterior + o do mes da ancora ate' o dia dela
    SELECT a.conta, a.valor,
           coalesce((SELECT cu.c FROM cum cu WHERE cu.conta = a.conta AND cu.mes = (a.mes - interval '1 month')::date), 0)
           + coalesce((SELECT sum(p.mov) FROM pernas p WHERE p.eh_real AND p.conta = a.conta AND p.dia >= a.mes AND p.dia <= a.data), 0) AS ca
      FROM anc a
  ), s0 AS (
    SELECT round(coalesce(sum(b.valor + cu.c - b.ca), 0), 2) AS s
      FROM cum cu JOIN base_a b ON b.conta = cu.conta
     WHERE cu.mes = (v_ini - interval '1 month')::date
  ), efeito AS (
    SELECT p.id, p.eh_real, p.venc, p.cf, date_trunc('month', p.dia)::date AS mes, sum(p.mov) AS e
      FROM pernas p
     WHERE p.conta IN (SELECT a.conta FROM anc a) AND p.dia BETWEEN v_ini AND v_fim_dia
     GROUP BY 1, 2, 3, 4, 5
    UNION ALL
    SELECT x.id, false, x.venc, x.cf, date_trunc('month', x.dia)::date, x.v * x.s
      FROM lanc x
     WHERE NOT x.eh_real AND v_todas
       AND ((x.co IS NULL AND x.cd IS NULL)
         -- em aberto que nao e' transferencia, em conta fora do conjunto ou sem ancora, conta como o sem conta (a regra da CPR)
         OR (NOT x.tr AND NOT EXISTS (SELECT 1 FROM anc a WHERE a.conta = x.co OR a.conta = x.cd)))
  ), mov_mes AS (
    SELECT g::date AS mes,
           round(coalesce(sum(e.e) FILTER (WHERE e.e > 0 AND NOT e.cf), 0), 2) AS ent,
           round(coalesce(-sum(e.e) FILTER (WHERE e.e < 0 AND NOT e.cf), 0), 2) AS sai,
           coalesce(bool_or(NOT e.eh_real), false) AS prev,
           round(coalesce(sum(e.e) FILTER (WHERE e.e > 0 AND e.venc AND NOT e.cf), 0), 2) AS ent_v,
           round(coalesce(-sum(e.e) FILTER (WHERE e.e < 0 AND e.venc AND NOT e.cf), 0), 2) AS sai_v,
           round(coalesce(-sum(e.e) FILTER (WHERE e.cf), 0), 2) AS car
      FROM generate_series(v_ini, v_fim, interval '1 month') g
      LEFT JOIN efeito e ON e.mes = g::date
     GROUP BY 1
  )
  SELECT to_char(mm.mes, 'YYYY-MM'),
         (SELECT s0.s FROM s0) + coalesce(sum(mm.ent - mm.sai - mm.car) OVER w_ant, 0),
         mm.ent, mm.sai,
         (SELECT s0.s FROM s0) + sum(mm.ent - mm.sai - mm.car) OVER w,
         mm.prev,
         (SELECT min(a.data) FROM anc a),
         ARRAY(SELECT k.nome FROM contas k WHERE k.id NOT IN (SELECT a.conta FROM anc a) ORDER BY 1),
         mm.ent_v, mm.sai_v, mm.car
    FROM mov_mes mm
  WINDOW w AS (ORDER BY mm.mes), w_ant AS (ORDER BY mm.mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
   ORDER BY mm.mes;
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_saldos(uuid, date, date, uuid[], date, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_saldos(uuid, date, date, uuid[], date, text[], boolean) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_saldos(uuid, date, date, uuid[], date, text[], boolean) IS
  'FIN-VISAO-GERAL-01: saldo inicial/final, entradas e saidas por mes (ancora conciliada, rolada pelos realizados; previsto do mes de hoje em diante; vencido nao realizado no mes de hoje). P79: p_status e p_incluir_vencidos. P82: o cartao no conjunto padrao (a fatura em aberto e'' saldo devedor); com o cartao fora da selecao, o pagamento da fatura vem em `cartao` (transferencia), nunca em saidas: saldo_final = inicial + entradas - saidas - cartao.';

-- P82 — o caminho da CPR usa a MESMA regra: os cartoes do cliente (fn_vg_eh_cartao) e o saldo deles hoje (a fatura em aberto, pela
-- fn_vg_saldos so' com os cartoes e so' o realizado). A CPR soma esse saldo ao caixa da serie e conta as pontas do cartao como dentro.
CREATE OR REPLACE FUNCTION public.fn_cpr_cartoes(p_cliente uuid, p_hoje date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_saldo numeric;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  v_ids := ARRAY(SELECT c.id FROM public.financeiro_contas_bancarias c WHERE c.cliente_id = p_cliente AND c.ativa AND public.fn_vg_eh_cartao(c.tipo_conta) ORDER BY c.id);
  IF cardinality(v_ids) > 0 THEN
    SELECT s.saldo_final INTO v_saldo
      FROM public.fn_vg_saldos(p_cliente, date_trunc('month', p_hoje)::date, p_hoje, v_ids, p_hoje, '{}'::text[], true) s
     ORDER BY s.ano_mes DESC LIMIT 1;
  END IF;
  RETURN jsonb_build_object('ids', to_jsonb(v_ids), 'saldo', coalesce(v_saldo, 0));
END $function$;

REVOKE ALL ON FUNCTION public.fn_cpr_cartoes(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cpr_cartoes(uuid, date) TO authenticated;
