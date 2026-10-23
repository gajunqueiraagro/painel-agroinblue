-- P79 (Gabriel 23/10/2026) — IGUALDADE COM A CPR: com as contas do caixa (o padrao, `p_contas` nulo), o NAO REALIZADO que nao e'
-- transferencia, lancado numa conta FORA do caixa ou sem ancora (o cartao de credito), entra nas somas e no saldo como o "sem conta"
-- ja' entrava — a regra da Contas a Pagar e Receber em "todas as contas" (cprRecorte.ts: so' a PONTA de transferencia fora do caixa
-- nao soma). Medido em 23/10/2026 (out/26, saldo do fim do mes): a Vera ja' era igual a CPR; Agnaldo diferia R$ 4.491,97 (10 contas no
-- cartao: 8 agendadas R$ 2.849,53 + 2 programadas) e NJ R$ 5.749,11 (12 no cartao) — exatamente esses lancamentos. Com UMA conta
-- escolhida nada muda. O realizado nao muda (o caixa e' o das ancoras). Mesma assinatura: sem DROP.

CREATE OR REPLACE FUNCTION public.fn_vg_serie(
  p_cliente uuid, p_de date, p_ate date,
  p_contas uuid[] DEFAULT NULL, p_fazendas uuid[] DEFAULT NULL, p_safra uuid DEFAULT NULL, p_atividade text DEFAULT NULL,
  p_hoje date DEFAULT CURRENT_DATE, p_status text[] DEFAULT NULL, p_incluir_vencidos boolean DEFAULT true)
RETURNS TABLE(nivel text, lado text, grupo text, atividade text, centro text, subcentro text, ano_mes text,
              realizado numeric, previsto numeric, qtd_lancamentos integer, previsto_vencido numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_contas uuid[];
  v_todas boolean := p_contas IS NULL;
  v_atual date := date_trunc('month', p_hoje)::date;
  v_status text[] := public.fn_vg_status_validos(p_status);
  v_venc boolean := coalesce(p_incluir_vencidos, true);
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de OR p_hoje IS NULL THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;
  -- as contas do conjunto: so' as deste cliente (conta de outro cliente em p_contas e' ignorada)
  v_contas := ARRAY(
    SELECT c.id FROM public.financeiro_contas_bancarias c
     WHERE c.cliente_id = p_cliente
       AND CASE WHEN v_todas THEN c.ativa AND lower(coalesce(c.tipo_conta, '')) IN ('cc', 'inv', 'permuta')
                ELSE c.id = ANY (p_contas) END);

  RETURN QUERY
  WITH base AS (
    SELECT v.lancamento_id, abs(v.valor) AS vparte, v.plano_conta_id, v.escopo_negocio, v.centro_custo, v.subcentro AS sub,
           v.tipo_operacao, v.status_transacao = 'realizado' AS eh_real,
           CASE WHEN v.status_transacao = 'realizado' THEN v.data_pagamento
                ELSE greatest(coalesce(v.data_vencimento, v.data_competencia), v_atual) END AS dia,
           v.status_transacao <> 'realizado' AND coalesce(v.data_vencimento, v.data_competencia) < p_hoje AS vencido,
           v.conta_bancaria_id, v.conta_destino_id,
           CASE v.sinal::text WHEN '1' THEN 1 WHEN '-1' THEN -1
                ELSE CASE WHEN v.tipo_operacao = '1-Entradas' THEN 1
                          WHEN v.tipo_operacao LIKE '2-%' OR v.tipo_operacao LIKE '3-%' THEN -1 ELSE 0 END END AS sinal_ef
      FROM public.vw_fin_classificacao_por_parte v
     WHERE v.cliente_id = p_cliente
       AND v.cancelado = false
       AND v.cenario IS DISTINCT FROM 'meta'
       AND coalesce(v.sem_movimentacao_caixa, false) = false
       AND ((v.status_transacao = 'realizado' AND v.data_pagamento BETWEEN p_de AND p_ate)
         OR (v.status_transacao = ANY (v_status)
             AND (v_venc OR coalesce(v.data_vencimento, v.data_competencia) >= p_hoje)
             AND greatest(coalesce(v.data_vencimento, v.data_competencia), v_atual) BETWEEN p_de AND p_ate))
       AND (p_fazendas IS NULL OR v.fazenda_id = ANY (p_fazendas))
       AND (p_safra IS NULL OR v.safra_id = p_safra)
  ), sentido AS (
    SELECT b.*,
      CASE WHEN b.conta_bancaria_id IS NULL AND b.conta_destino_id IS NULL
           THEN CASE WHEN v_todas AND NOT b.eh_real THEN b.sinal_ef ELSE 0 END
           -- P79: em aberto que nao e' transferencia, numa conta fora do caixa (cartao), conta como o sem conta (a regra da CPR)
           WHEN v_todas AND NOT b.eh_real AND b.tipo_operacao NOT LIKE '3-%'
                AND NOT coalesce(b.conta_bancaria_id = ANY (v_contas), false) AND NOT coalesce(b.conta_destino_id = ANY (v_contas), false)
           THEN b.sinal_ef
           ELSE (CASE WHEN b.conta_bancaria_id = ANY (v_contas) THEN b.sinal_ef ELSE 0 END)
              + (CASE WHEN b.conta_destino_id = ANY (v_contas) AND b.conta_destino_id IS DISTINCT FROM b.conta_bancaria_id
                      THEN 1 ELSE 0 END) END AS dir
      FROM base b
  ), nos AS (
    SELECT s.lancamento_id, s.vparte, s.eh_real, s.vencido, to_char(s.dia, 'YYYY-MM') AS am,
           CASE WHEN s.dir > 0 THEN 'entrada' ELSE 'saida' END AS lado_,
           CASE WHEN s.tipo_operacao LIKE '3-%' THEN CASE WHEN s.dir > 0 THEN 'Outras entradas' ELSE 'Outras saídas' END
                WHEN s.plano_conta_id IS NULL THEN 'Sem classificação'
                WHEN (s.dir > 0 AND p.tipo_operacao IS DISTINCT FROM '1-Entradas')
                  OR (s.dir < 0 AND p.tipo_operacao IS DISTINCT FROM '2-Saídas')
                  OR p.grupo_fluxo IS NULL
                  THEN CASE WHEN s.dir > 0 THEN 'Outras entradas' ELSE 'Outras saídas' END
                ELSE p.grupo_fluxo END AS grupo_,
           CASE WHEN s.tipo_operacao LIKE '3-%' THEN NULL ELSE coalesce(s.escopo_negocio, p.escopo_negocio) END AS atividade_,
           CASE WHEN s.tipo_operacao LIKE '3-%'
                THEN CASE WHEN s.dir > 0 THEN 'Transferências de outras contas' ELSE 'Transferências para outras contas' END
                ELSE s.centro_custo END AS centro_,
           CASE WHEN s.tipo_operacao LIKE '3-%' THEN NULL ELSE s.sub END AS sub_
      FROM sentido s
      LEFT JOIN public.financeiro_plano_contas p ON p.id = s.plano_conta_id
     WHERE s.dir <> 0
  )
  SELECT CASE WHEN GROUPING(n.grupo_) = 1 THEN 'raiz'
              WHEN GROUPING(n.atividade_) = 1 THEN 'grupo'
              WHEN GROUPING(n.centro_) = 1 THEN 'atividade'
              WHEN GROUPING(n.sub_) = 1 THEN 'centro'
              ELSE 'subcentro' END,
         n.lado_, n.grupo_, n.atividade_, n.centro_, n.sub_, n.am,
         round(coalesce(sum(n.vparte) FILTER (WHERE n.eh_real), 0), 2),
         round(coalesce(sum(n.vparte) FILTER (WHERE NOT n.eh_real), 0), 2),
         count(DISTINCT n.lancamento_id)::integer,
         round(coalesce(sum(n.vparte) FILTER (WHERE n.vencido), 0), 2)
    FROM nos n
   WHERE p_atividade IS NULL OR n.atividade_ = p_atividade
   GROUP BY GROUPING SETS (
     (n.lado_, n.am),
     (n.lado_, n.grupo_, n.am),
     (n.lado_, n.grupo_, n.atividade_, n.am),
     (n.lado_, n.grupo_, n.atividade_, n.centro_, n.am),
     (n.lado_, n.grupo_, n.atividade_, n.centro_, n.sub_, n.am));
END $function$;

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
           l.status_transacao <> 'realizado' AND coalesce(l.data_vencimento, l.data_competencia) < p_hoje AS venc,
           abs(l.valor) AS v, l.conta_bancaria_id AS co, l.conta_destino_id AS cd, l.tipo_operacao LIKE '3-%' AS tr,
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
     WHERE NOT x.eh_real AND v_todas
       AND ((x.co IS NULL AND x.cd IS NULL)
         -- P79: em aberto que nao e' transferencia, em conta fora do caixa ou sem ancora (cartao), conta como o sem conta (a regra da CPR)
         OR (NOT x.tr AND NOT EXISTS (SELECT 1 FROM anc a WHERE a.conta = x.co OR a.conta = x.cd)))
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
