-- P79 (Gabriel 23/10/2026) — FILTRO DE STATUS e VENCIDOS nos saldos da Visao Geral (fn_vg_saldos).
-- O mesmo filtro da fn_vg_serie (111930): `p_status` escolhe quais nao realizados entram (nulo = os tres, o padrao da CPR) e
-- `p_incluir_vencidos` se o vencido nao realizado entra no mes corrente. A ancora e a rolagem usam so' realizados: nao mudam. O filtro
-- age no CTE `lanc`, de onde saem as pernas, o efeito e o mov_mes — entao saldo_final = saldo_inicial + entradas - saidas fecha para
-- QUALQUER combinacao (provado no teste vg_status_test.sql). Parametros no fim, com o padrao de antes; por isso o DROP.

DROP FUNCTION IF EXISTS public.fn_vg_saldos(uuid, date, date, uuid[], date);

CREATE OR REPLACE FUNCTION public.fn_vg_saldos(
  p_cliente uuid, p_de date, p_ate date, p_contas uuid[] DEFAULT NULL, p_hoje date DEFAULT CURRENT_DATE,
  p_status text[] DEFAULT NULL, p_incluir_vencidos boolean DEFAULT true)
RETURNS TABLE(ano_mes text, saldo_inicial numeric, entradas numeric, saidas numeric, saldo_final numeric,
              com_previsto boolean, conciliado_ate date, contas_sem_ancora text[],
              entradas_vencidas numeric, saidas_vencidas numeric)
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
       AND CASE WHEN v_todas THEN c.ativa AND lower(coalesce(c.tipo_conta, '')) IN ('cc', 'inv', 'permuta')
                ELSE c.id = ANY (p_contas) END
  ), lanc AS (
    SELECT l.id, l.status_transacao = 'realizado' AS eh_real,
           CASE WHEN l.status_transacao = 'realizado' THEN l.data_pagamento
                ELSE greatest(coalesce(l.data_vencimento, l.data_competencia), v_atual) END AS dia,
           l.status_transacao <> 'realizado' AND coalesce(l.data_vencimento, l.data_competencia) < v_atual AS venc,
           abs(l.valor) AS v, l.conta_bancaria_id AS co, l.conta_destino_id AS cd,
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
             AND (v_venc OR coalesce(l.data_vencimento, l.data_competencia) >= v_atual)
             AND greatest(coalesce(l.data_vencimento, l.data_competencia), v_atual) BETWEEN v_ini AND v_fim_dia))
  ), pernas AS (
    -- uma linha por (lancamento, conta do conjunto): o movimento NAQUELA conta (movimentoNaConta)
    SELECT x.id, x.eh_real, x.venc, x.dia, k.id AS conta,
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
    SELECT p.id, p.eh_real, p.venc, date_trunc('month', p.dia)::date AS mes, sum(p.mov) AS e
      FROM pernas p
     WHERE p.conta IN (SELECT a.conta FROM anc a) AND p.dia BETWEEN v_ini AND v_fim_dia
     GROUP BY 1, 2, 3, 4
    UNION ALL
    SELECT x.id, false, x.venc, date_trunc('month', x.dia)::date, x.v * x.s
      FROM lanc x
     WHERE NOT x.eh_real AND v_todas AND x.co IS NULL AND x.cd IS NULL
  ), mov_mes AS (
    SELECT g::date AS mes,
           round(coalesce(sum(e.e) FILTER (WHERE e.e > 0), 0), 2) AS ent,
           round(coalesce(-sum(e.e) FILTER (WHERE e.e < 0), 0), 2) AS sai,
           coalesce(bool_or(NOT e.eh_real), false) AS prev,
           round(coalesce(sum(e.e) FILTER (WHERE e.e > 0 AND e.venc), 0), 2) AS ent_v,
           round(coalesce(-sum(e.e) FILTER (WHERE e.e < 0 AND e.venc), 0), 2) AS sai_v
      FROM generate_series(v_ini, v_fim, interval '1 month') g
      LEFT JOIN efeito e ON e.mes = g::date
     GROUP BY 1
  )
  SELECT to_char(mm.mes, 'YYYY-MM'),
         (SELECT s0.s FROM s0) + coalesce(sum(mm.ent - mm.sai) OVER w_ant, 0),
         mm.ent, mm.sai,
         (SELECT s0.s FROM s0) + sum(mm.ent - mm.sai) OVER w,
         mm.prev,
         (SELECT min(a.data) FROM anc a),
         ARRAY(SELECT k.nome FROM contas k WHERE k.id NOT IN (SELECT a.conta FROM anc a) ORDER BY 1),
         mm.ent_v, mm.sai_v
    FROM mov_mes mm
  WINDOW w AS (ORDER BY mm.mes), w_ant AS (ORDER BY mm.mes ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
   ORDER BY mm.mes;
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_saldos(uuid, date, date, uuid[], date, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_saldos(uuid, date, date, uuid[], date, text[], boolean) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_saldos(uuid, date, date, uuid[], date, text[], boolean) IS
  'FIN-VISAO-GERAL-01: saldo inicial/final, entradas e saidas por mes (ancora conciliada da CPR, rolada pelos realizados; previsto do mes de hoje em diante; vencido e nao realizado no mes de hoje, em entradas/saidas_vencidas). P79: p_status (os nao realizados que entram; nulo = os tres) e p_incluir_vencidos.';
