-- FIN-VISAO-GERAL-01 PR 5 (SPEC §5, §7, §8) — a FONTE UNICA das linhas da Visao Geral: `fn_vg_partes` devolve cada PARTE (da visao
-- por parte, `vw_fin_classificacao_por_parte`) que entra na serie, ja' com o no' (lado › grupo › atividade › centro › subcentro), o
-- mes de caixa e o que a gaveta escreve (data, favorecido, descricao, conta, valor da parte e do lancamento). O recorte e' o da serie
-- de sempre (P82/111935): regime de CAIXA (realizado pela data de pagamento; o em aberto pelo vencimento, nunca antes do mes de hoje),
-- contas escolhidas (cartao incluido), transferencia entre contas escolhidas neutra, fazenda/safra/atividade e os status da tela.
-- `fn_vg_serie` passa a SOMAR estas linhas (mesma assinatura, mesma saida — o ensaio provou igualdade linha a linha antes do apply):
-- a gaveta (111945) e o modal (fn_vg_analise, sobre a serie) leem a MESMA linha, entao a soma da gaveta e' o valor do no'.
-- Chave da linha: o lancamento_id; a parte 2+ da classificacao dividida vem como "id#2" (abrir e' SEMPRE pelo lancamento_id).
-- SEGURANCA: SECURITY DEFINER com tenant_ok (senao 42501); EXECUTE so' para authenticated.

CREATE OR REPLACE FUNCTION public.fn_vg_partes(
  p_cliente uuid, p_de date, p_ate date,
  p_contas uuid[] DEFAULT NULL, p_fazendas uuid[] DEFAULT NULL, p_safra uuid DEFAULT NULL, p_atividade text DEFAULT NULL,
  p_hoje date DEFAULT CURRENT_DATE, p_status text[] DEFAULT NULL, p_incluir_vencidos boolean DEFAULT true)
RETURNS TABLE(chave text, lancamento_id uuid, parte_ordem integer, partes_total integer, valor numeric, valor_lancamento numeric,
              eh_real boolean, vencido boolean, status text, dia date, ano_mes text,
              lado text, grupo text, atividade text, centro text, subcentro text,
              conta_id uuid, favorecido_id uuid, descricao text, data_pagamento date, data_vencimento date, data_competencia date)
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
    SELECT v.lancamento_id AS lid, v.parte_ordem AS po, v.partes_total AS pt, abs(v.valor) AS vparte, abs(v.valor_lancamento) AS vlanc,
           v.plano_conta_id, v.escopo_negocio, v.centro_custo, v.subcentro AS sub,
           v.tipo_operacao, v.status_transacao AS st, v.status_transacao = 'realizado' AS eh_real,
           CASE WHEN v.status_transacao = 'realizado' THEN v.data_pagamento
                ELSE greatest(coalesce(v.data_vencimento, v.data_competencia), v_atual) END AS dia_,
           v.status_transacao <> 'realizado' AND coalesce(v.data_vencimento, v.data_competencia) < p_hoje AS venc_,
           v.conta_bancaria_id, v.conta_destino_id, v.favorecido_id AS fav, v.descricao AS descr,
           v.data_pagamento AS dpg, v.data_vencimento AS dvc, v.data_competencia AS dcp,
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
    SELECT s.*, to_char(s.dia_, 'YYYY-MM') AS am,
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
           CASE WHEN s.tipo_operacao LIKE '3-%' THEN NULL ELSE s.sub END AS sub_,
           -- a conta que a linha movimenta no conjunto: a de destino quando e' ela que entra (transferencia recebida)
           CASE WHEN s.tipo_operacao LIKE '3-%' AND s.dir > 0 THEN s.conta_destino_id ELSE s.conta_bancaria_id END AS conta_
      FROM sentido s
      LEFT JOIN public.financeiro_plano_contas p ON p.id = s.plano_conta_id
     WHERE s.dir <> 0
  )
  SELECT n.lid::text || CASE WHEN n.po > 1 THEN '#' || n.po ELSE '' END, n.lid, n.po, n.pt, n.vparte, n.vlanc,
         n.eh_real, n.venc_, n.st, n.dia_, n.am, n.lado_, n.grupo_, n.atividade_, n.centro_, n.sub_,
         n.conta_, n.fav, n.descr, n.dpg, n.dvc, n.dcp
    FROM nos n
   WHERE p_atividade IS NULL OR n.atividade_ = p_atividade;
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_partes(uuid, date, date, uuid[], uuid[], uuid, text, date, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_partes(uuid, date, date, uuid[], uuid[], uuid, text, date, text[], boolean) TO authenticated;

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
BEGIN
  -- PR 5: a serie SOMA as linhas da fn_vg_partes (a fonte unica que a gaveta tambem le); o acesso e o periodo sao checados la'
  RETURN QUERY
  SELECT CASE WHEN GROUPING(n.grupo) = 1 THEN 'raiz'
              WHEN GROUPING(n.atividade) = 1 THEN 'grupo'
              WHEN GROUPING(n.centro) = 1 THEN 'atividade'
              WHEN GROUPING(n.subcentro) = 1 THEN 'centro'
              ELSE 'subcentro' END,
         n.lado, n.grupo, n.atividade, n.centro, n.subcentro, n.ano_mes,
         round(coalesce(sum(n.valor) FILTER (WHERE n.eh_real), 0), 2),
         round(coalesce(sum(n.valor) FILTER (WHERE NOT n.eh_real), 0), 2),
         count(DISTINCT n.lancamento_id)::integer,
         round(coalesce(sum(n.valor) FILTER (WHERE n.vencido), 0), 2)
    FROM public.fn_vg_partes(p_cliente, p_de, p_ate, p_contas, p_fazendas, p_safra, p_atividade, p_hoje, p_status, p_incluir_vencidos) n
   GROUP BY GROUPING SETS (
     (n.lado, n.ano_mes),
     (n.lado, n.grupo, n.ano_mes),
     (n.lado, n.grupo, n.atividade, n.ano_mes),
     (n.lado, n.grupo, n.atividade, n.centro, n.ano_mes),
     (n.lado, n.grupo, n.atividade, n.centro, n.subcentro, n.ano_mes));
END $function$;

COMMENT ON FUNCTION public.fn_vg_partes(uuid, date, date, uuid[], uuid[], uuid, text, date, text[], boolean) IS
  'FIN-VISAO-GERAL-01 PR 5: as linhas (por PARTE) que a Visao Geral soma — no'' da arvore, mes de caixa, conta, favorecido; a serie e a gaveta leem daqui.';
