-- P82 (Gabriel 23/10/2026 08h10) — A REGRA DO CARTAO: "a compra do cartao e' SAIDA; o pagamento do cartao e' TRANSFERENCIA".
-- Substitui a regra da 111934 (o em aberto no cartao contado como o "sem conta", com o pagamento da fatura TAMBEM contado: dupla contagem
-- quando os dois estao em aberto — NJ out/26, R$ 5.017,49). A FORMA (o invariante): o cartao ENTRA no conjunto de contas padrao, com o
-- saldo dele (a fatura em aberto, devedor; a ancora conciliada do cartao, hoje zero). Entao a compra (lancamento 2- na conta do cartao)
-- e' saida do grupo dela, no mes dela; o pagamento da fatura (3-, banco -> cartao) e' transferencia DENTRO do conjunto e se anula; e
-- saldo final = inicial + entradas - saidas fecha sem linha nova. Com contas escolhidas SEM o cartao, o pagamento nunca vira saida: sai
-- da serie (aqui) e vem a parte nos saldos (111936, coluna `cartao`), e a tela o escreve como "Pagamento de cartao (transferencia)".
-- `fn_vg_eh_cartao` e' a regra unica do tipo (a mesma que a CPR usa pela `fn_cpr_cartoes`, 111936). Mesma assinatura da serie: sem DROP.

CREATE OR REPLACE FUNCTION public.fn_vg_eh_cartao(p_tipo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$ SELECT lower(trim(coalesce(p_tipo, ''))) LIKE 'cart%' $function$;

REVOKE ALL ON FUNCTION public.fn_vg_eh_cartao(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_eh_cartao(text) TO authenticated;

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
  v_cartoes uuid[];
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
       AND CASE WHEN v_todas THEN c.ativa AND (lower(coalesce(c.tipo_conta, '')) IN ('cc', 'inv', 'permuta') OR public.fn_vg_eh_cartao(c.tipo_conta))
                ELSE c.id = ANY (p_contas) END);
  -- P82: os cartoes do cliente (a transferencia para um deles, fora da selecao, nunca e' saida)
  v_cartoes := ARRAY(SELECT c.id FROM public.financeiro_contas_bancarias c WHERE c.cliente_id = p_cliente AND public.fn_vg_eh_cartao(c.tipo_conta));

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
      CASE WHEN b.tipo_operacao LIKE '3-%'
                AND ((coalesce(b.conta_bancaria_id = ANY (v_cartoes), false) AND NOT coalesce(b.conta_bancaria_id = ANY (v_contas), false))
                  OR (coalesce(b.conta_destino_id = ANY (v_cartoes), false) AND NOT coalesce(b.conta_destino_id = ANY (v_contas), false)))
           THEN 0  -- P82: pagamento de fatura com o cartao fora da selecao: transferencia, nunca saida (vem a parte, nos saldos)
           WHEN b.conta_bancaria_id IS NULL AND b.conta_destino_id IS NULL
           THEN CASE WHEN v_todas AND NOT b.eh_real THEN b.sinal_ef ELSE 0 END
           -- em aberto que nao e' transferencia, numa conta fora do conjunto, conta como o sem conta (a regra da CPR)
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
