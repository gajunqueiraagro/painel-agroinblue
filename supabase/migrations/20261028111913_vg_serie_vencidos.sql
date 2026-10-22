-- FIN-VISAO-GERAL-01 PR 2 — PREVISTO VENCIDO no mes corrente (fn_vg_serie e fn_vg_serie_unidade).
-- Previsto/programado/agendado com vencimento ANTES do mes de `p_hoje` e ainda nao realizado CONTA no mes de `p_hoje` (o mes corrente):
-- o dia dele passa a ser greatest(vencimento, 1o dia do mes de hoje). Ele segue dentro de `previsto` e vem tambem, a parte, em
-- `previsto_vencido` (a marca "vencido" da tela). Antes ele ficava no mes do vencimento, no passado, como se ainda fosse acontecer la'.
-- Medido em 22/10/2026: 84 lancamentos vencidos nos 7 clientes (R$ 4,66 mi), 4,40 mi de um cliente so', com 17 de antes de 2026
-- (o mais antigo de jan/2024) — dado a revisar pelo cliente, nao corrigido aqui.
-- `p_hoje` (padrao CURRENT_DATE) entra no fim da assinatura, por isso o DROP: quem chama com os argumentos de antes segue funcionando.
-- O realizado nao muda. A fn_vg_serie_unidade repassa p_hoje e devolve previsto_vencido.

DROP FUNCTION IF EXISTS public.fn_vg_serie_unidade(uuid, date, date, text, text, uuid[], uuid[], uuid, text);
DROP FUNCTION IF EXISTS public.fn_vg_serie(uuid, date, date, uuid[], uuid[], uuid, text);

CREATE OR REPLACE FUNCTION public.fn_vg_serie(
  p_cliente uuid, p_de date, p_ate date,
  p_contas uuid[] DEFAULT NULL, p_fazendas uuid[] DEFAULT NULL, p_safra uuid DEFAULT NULL, p_atividade text DEFAULT NULL,
  p_hoje date DEFAULT CURRENT_DATE)
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
           v.status_transacao <> 'realizado' AND coalesce(v.data_vencimento, v.data_competencia) < v_atual AS vencido,
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
         OR (v.status_transacao IN ('previsto', 'programado', 'agendado')
             AND greatest(coalesce(v.data_vencimento, v.data_competencia), v_atual) BETWEEN p_de AND p_ate))
       AND (p_fazendas IS NULL OR v.fazenda_id = ANY (p_fazendas))
       AND (p_safra IS NULL OR v.safra_id = p_safra)
  ), sentido AS (
    SELECT b.*,
      CASE WHEN b.conta_bancaria_id IS NULL AND b.conta_destino_id IS NULL
           THEN CASE WHEN v_todas AND NOT b.eh_real THEN b.sinal_ef ELSE 0 END
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

REVOKE ALL ON FUNCTION public.fn_vg_serie(uuid, date, date, uuid[], uuid[], uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_serie(uuid, date, date, uuid[], uuid[], uuid, text, date) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_serie(uuid, date, date, uuid[], uuid[], uuid, text, date) IS
  'FIN-VISAO-GERAL-01: realizado (data_pagamento) e previsto (vencimento; vencido e nao realizado no mes de p_hoje, em previsto_vencido) por no da Visao Geral x mes, pelas partes da classificacao.';

CREATE OR REPLACE FUNCTION public.fn_vg_serie_unidade(
  p_cliente uuid, p_de date, p_ate date, p_criterio text DEFAULT 'mes', p_unidade text DEFAULT 'rs',
  p_contas uuid[] DEFAULT NULL, p_fazendas uuid[] DEFAULT NULL, p_safra uuid DEFAULT NULL, p_atividade text DEFAULT NULL,
  p_hoje date DEFAULT CURRENT_DATE)
RETURNS TABLE(nivel text, lado text, grupo text, atividade text, centro text, subcentro text, ano_mes text,
              realizado numeric, previsto numeric, previsto_vencido numeric, denominador numeric, valor_realizado numeric, valor_previsto numeric,
              unidade_valida boolean, unidades_validas text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_ini date := date_trunc('month', p_de)::date;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_criterio IS NULL OR p_criterio NOT IN ('mes', 'media', 'acumulado') THEN
    RAISE EXCEPTION 'Critério inválido: use mes, media ou acumulado.' USING ERRCODE = '22023';
  END IF;
  IF p_unidade IS NULL OR p_unidade NOT IN ('rs', 'rs_cab', 'rs_ua', 'rs_ha_prod', 'rs_ha_pec', 'rs_ha_agri', 'rs_ha_plant', 'rs_arroba') THEN
    RAISE EXCEPTION 'Unidade inválida.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH d AS (
    SELECT x.ano_mes AS am,
           CASE p_unidade WHEN 'rs_cab' THEN x.cab_media WHEN 'rs_ua' THEN x.ua_media WHEN 'rs_ha_prod' THEN x.ha_produtiva
                          WHEN 'rs_ha_pec' THEN x.ha_pecuaria WHEN 'rs_ha_agri' THEN x.ha_agricultura
                          WHEN 'rs_ha_plant' THEN x.ha_plantado WHEN 'rs_arroba' THEN x.arrobas END AS dm
      FROM public.fn_vg_denominadores(p_cliente, p_de, p_ate, p_fazendas, p_safra) x
     WHERE x.ano_mes IS NOT NULL
  ), dacc AS (
    SELECT d.am, d.dm,
           CASE WHEN p_unidade = 'rs_arroba' THEN sum(d.dm) OVER w
                ELSE avg(nullif(d.dm, 0)) OVER w END AS da
      FROM d WINDOW w AS (ORDER BY d.am ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  ), s AS (
    SELECT x.nivel AS nv, x.lado AS ld, x.grupo AS gr, x.atividade AS at, x.centro AS ce, x.subcentro AS sc, x.ano_mes AS am,
           x.realizado AS re, x.previsto AS pv, x.previsto_vencido AS pvv,
           sum(x.realizado) OVER w AS re_acc, sum(x.previsto) OVER w AS pv_acc,
           ((left(x.ano_mes, 4)::int - extract(year FROM v_ini)::int) * 12
             + substr(x.ano_mes, 6, 2)::int - extract(month FROM v_ini)::int + 1) AS k,
           CASE coalesce(x.atividade, p_atividade)
             WHEN 'pecuaria' THEN ARRAY['rs', 'rs_cab', 'rs_ua', 'rs_arroba', 'rs_ha_prod', 'rs_ha_pec']
             WHEN 'agricultura' THEN ARRAY['rs', 'rs_ha_prod', 'rs_ha_agri', 'rs_ha_plant']
             ELSE ARRAY['rs', 'rs_ha_prod'] END AS uv
      FROM public.fn_vg_serie(p_cliente, p_de, p_ate, p_contas, p_fazendas, p_safra, p_atividade, p_hoje) x
    WINDOW w AS (PARTITION BY x.nivel, x.lado, x.grupo, x.atividade, x.centro, x.subcentro ORDER BY x.ano_mes
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  ), c AS (
    SELECT s.*, p_unidade = ANY (s.uv) AS ok,
           CASE WHEN p_unidade = 'rs' THEN 1::numeric
                WHEN p_criterio = 'mes' THEN nullif(dacc.dm, 0)
                ELSE nullif(dacc.da, 0) END AS den,
           CASE WHEN p_criterio = 'mes' THEN 1::numeric
                WHEN p_criterio = 'media' AND p_unidade <> 'rs_arroba' THEN s.k::numeric
                ELSE 1::numeric END AS div_k
      FROM s LEFT JOIN dacc ON dacc.am = s.am
  )
  SELECT c.nv, c.ld, c.gr, c.at, c.ce, c.sc, c.am, c.re, c.pv, c.pvv,
         CASE WHEN p_unidade = 'rs' THEN NULL ELSE c.den END,
         CASE WHEN c.ok THEN round((CASE WHEN p_criterio = 'mes' THEN c.re ELSE c.re_acc END) / c.div_k / c.den, 2) END,
         CASE WHEN c.ok THEN round((CASE WHEN p_criterio = 'mes' THEN c.pv ELSE c.pv_acc END) / c.div_k / c.den, 2) END,
         c.ok, c.uv
    FROM c;
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_serie_unidade(uuid, date, date, text, text, uuid[], uuid[], uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_serie_unidade(uuid, date, date, text, text, uuid[], uuid[], uuid, text, date) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_serie_unidade(uuid, date, date, text, text, uuid[], uuid[], uuid, text, date) IS
  'FIN-VISAO-GERAL-01 PR 2: fn_vg_serie por unidade (R$, R$/cab, R$/UA, R$/ha produtiva/pecuaria/agricultura/plantado, R$/@) e criterio (mes, media, acumulado), com as unidades validas por no.';
