-- FIN-VISAO-GERAL-01 PR 1 — fn_vg_serie: o REALIZADO e o PREVISTO da Visao Geral por no' x mes, no banco (a tela nunca soma).
--
-- Nos: raiz (lado) · grupo (grupo_fluxo do plano) · atividade (escopo_negocio) · centro · subcentro — com GROUPING SETS, um no' por
-- linha (`nivel`). Valores sempre POSITIVOS; o lado (entrada/saida) diz o sentido.
--
-- REGRAS (decisoes do Gabriel, 22/10/2026 — docs/specs/FIN-VISAO-GERAL-01-agro.md):
--   · CAIXA: realizado = status 'realizado', pelo mes da data_pagamento; previsto = 'previsto' | 'programado' | 'agendado' (os status "a
--     acontecer" do banco; 'conciliado' so' existe em cancelado e nao ha' 'confirmado'), pelo mes do vencimento (sem vencimento, a
--     competencia). Cancelado fora; cenario meta NUNCA; sem_movimentacao_caixa fora (a mesma cesta da Conciliacao).
--   · A fonte e' vw_fin_classificacao_por_parte: lancamento dividido entra pelas partes (cada parte no grupo dela).
--   · CONTAS: p_contas nulo = as contas que contam no caixa (ativas, cc + inv/permuta; cartao fora, como a CPR). O SENTIDO de cada
--     lancamento no conjunto e' o da regua da Conciliacao (`movimentoNaConta`): a conta de origem pelo sinal (sem sinal, o tipo); a de
--     destino entra positiva. Somado sobre o conjunto: transferencia entre duas contas SELECIONADAS da' zero e nao aparece; para/de conta
--     nao selecionada vira saida/entrada no no' "Transferências para/de outras contas" (dentro de Outras saídas / Outras entradas).
--     Realizado precisa tocar uma conta do conjunto; previsto SEM conta nenhuma entra so' quando p_contas e' nulo (vai cair em alguma).
--   · Sem plano_conta_id: grupo "Sem classificação" (entrada ou saida pelo sentido). Plano do lado oposto ao sentido (entrada classificada
--     em conta de saida, ou o contrario): grupo "Outras entradas/saídas" do sentido — a tela nao inventa sinal.
--   · Filtros: fazenda (do lancamento), safra e atividade (da parte).
-- SEGURANCA: SECURITY DEFINER com tenant_ok(p_cliente) (senao 42501); EXECUTE so' para authenticated; plan_cache_mode custom.

CREATE OR REPLACE FUNCTION public.fn_vg_serie(
  p_cliente uuid, p_de date, p_ate date,
  p_contas uuid[] DEFAULT NULL, p_fazendas uuid[] DEFAULT NULL, p_safra uuid DEFAULT NULL, p_atividade text DEFAULT NULL)
RETURNS TABLE(nivel text, lado text, grupo text, atividade text, centro text, subcentro text, ano_mes text,
              realizado numeric, previsto numeric, qtd_lancamentos integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_contas uuid[];
  v_todas boolean := p_contas IS NULL;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de THEN
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
                ELSE coalesce(v.data_vencimento, v.data_competencia) END AS dia,
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
             AND coalesce(v.data_vencimento, v.data_competencia) BETWEEN p_de AND p_ate))
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
    SELECT s.lancamento_id, s.vparte, s.eh_real, to_char(s.dia, 'YYYY-MM') AS am,
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
         count(DISTINCT n.lancamento_id)::integer
    FROM nos n
   WHERE p_atividade IS NULL OR n.atividade_ = p_atividade
   GROUP BY GROUPING SETS (
     (n.lado_, n.am),
     (n.lado_, n.grupo_, n.am),
     (n.lado_, n.grupo_, n.atividade_, n.am),
     (n.lado_, n.grupo_, n.atividade_, n.centro_, n.am),
     (n.lado_, n.grupo_, n.atividade_, n.centro_, n.sub_, n.am));
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_serie(uuid, date, date, uuid[], uuid[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_serie(uuid, date, date, uuid[], uuid[], uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_serie(uuid, date, date, uuid[], uuid[], uuid, text) IS
  'FIN-VISAO-GERAL-01: realizado (data_pagamento) e previsto (vencimento) por no da Visao Geral x mes, pelas partes da classificacao.';
