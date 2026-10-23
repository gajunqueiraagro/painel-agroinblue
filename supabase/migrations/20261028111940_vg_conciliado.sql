-- P70 (Gabriel 23/10/2026) — "Conciliado até dd/mm · R$ x": o SALDO das contas escolhidas NA DATA do conciliado ate'.
-- A data e' a da fn_vg_saldos (a ancora conciliada MAIS ANTIGA entre as contas do conjunto — a mesma regra da CPR); o saldo de cada
-- conta nessa data = o valor da ancora dela − os movimentos realizados dela DEPOIS da data e ATE' a ancora (a conta cuja ancora e'
-- a propria data entra com o saldo do extrato). Mesma escolha de ancora da fn_vg_saldos (o mes mais recente cujo saldo fecha com os
-- realizados; permuta sempre) e o mesmo conjunto padrao (contas ativas cc/inv/permuta + cartoes). Funcao NOVA (a fn_vg_saldos nao
-- muda de retorno: sem DROP); o teste prova a MESMA data das duas.
-- SEGURANCA: SECURITY DEFINER com tenant_ok (senao 42501); EXECUTE so' para authenticated.

CREATE OR REPLACE FUNCTION public.fn_vg_conciliado(p_cliente uuid, p_contas uuid[] DEFAULT NULL)
RETURNS TABLE(conciliado_ate date, saldo numeric, contas jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_todas boolean := p_contas IS NULL;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH contas AS (
    SELECT c.id, coalesce(nullif(c.nome_exibicao, ''), c.nome_conta) AS nome, lower(coalesce(c.tipo_conta, '')) AS tipo
      FROM public.financeiro_contas_bancarias c
     WHERE c.cliente_id = p_cliente
       AND CASE WHEN v_todas THEN c.ativa AND (lower(coalesce(c.tipo_conta, '')) IN ('cc', 'inv', 'permuta') OR public.fn_vg_eh_cartao(c.tipo_conta))
                ELSE c.id = ANY (p_contas) END
  ), lanc AS (
    SELECT l.id, l.data_pagamento AS dia, abs(l.valor) AS v, l.conta_bancaria_id AS co, l.conta_destino_id AS cd,
           CASE l.sinal::text WHEN '1' THEN 1 WHEN '-1' THEN -1
                ELSE CASE WHEN l.tipo_operacao = '1-Entradas' THEN 1
                          WHEN l.tipo_operacao LIKE '2-%' OR l.tipo_operacao LIKE '3-%' THEN -1 ELSE 0 END END AS s
      FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente
       AND l.cancelado = false
       AND l.cenario IS DISTINCT FROM 'meta'
       AND coalesce(l.sem_movimentacao_caixa, false) = false
       AND l.status_transacao = 'realizado' AND l.data_pagamento IS NOT NULL
  ), pernas AS (
    SELECT x.id, x.dia, k.id AS conta,
           CASE WHEN x.cd = k.id AND x.co IS DISTINCT FROM k.id THEN x.v ELSE x.v * x.s END AS mov
      FROM lanc x JOIN contas k ON k.id = x.co OR k.id = x.cd
  ), real_mes AS (
    SELECT p.conta, date_trunc('month', p.dia)::date AS mes, sum(p.mov) AS mov
      FROM pernas p GROUP BY 1, 2
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
                             ELSE coalesce((SELECT sum(p.mov) FROM pernas p WHERE p.conta = c.conta
                                              AND p.dia >= c.mes AND p.dia <= c.posicao), 0) END, 2) = round(c.sf, 2) AS ok
      FROM cand c JOIN contas k ON k.id = c.conta
      LEFT JOIN real_mes rm ON rm.conta = c.conta AND rm.mes = c.mes
  ), anc AS (
    SELECT DISTINCT ON (f.conta) f.conta, f.posicao AS data, round(f.sf, 2) AS valor
      FROM fecha f WHERE f.ok OR f.tipo = 'permuta'
     ORDER BY f.conta, f.mes DESC
  ), d AS (
    SELECT min(a.data) AS dt FROM anc a
  ), na_data AS (
    SELECT a.conta, k.nome, a.data AS ancora, a.valor,
           round(a.valor - coalesce((SELECT sum(p.mov) FROM pernas p WHERE p.conta = a.conta AND p.dia > d.dt AND p.dia <= a.data), 0), 2) AS sd
      FROM anc a JOIN contas k ON k.id = a.conta, d
  )
  SELECT d.dt,
         CASE WHEN d.dt IS NULL THEN NULL ELSE (SELECT round(coalesce(sum(n.sd), 0), 2) FROM na_data n) END,
         coalesce((SELECT jsonb_agg(jsonb_build_object('conta', n.conta, 'nome', n.nome, 'ancora', n.ancora, 'saldo_ancora', n.valor,
                                                       'saldo_na_data', n.sd) ORDER BY n.nome) FROM na_data n), '[]'::jsonb)
    FROM d;
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_conciliado(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_conciliado(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_conciliado(uuid, uuid[]) IS
  'P70: o conciliado ate'' (a ancora mais antiga das contas escolhidas, a regra da fn_vg_saldos) e o SALDO das contas nessa data (ancora de cada conta - os realizados depois da data ate'' a ancora), com o detalhe por conta.';
