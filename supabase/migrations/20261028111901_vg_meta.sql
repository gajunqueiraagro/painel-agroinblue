-- FIN-VISAO-GERAL-01 PR 2 — fn_vg_meta: a META da Visao Geral por no' x mes, na MESMA arvore da fn_vg_serie
-- (raiz › grupo › atividade › centro › subcentro), lida de planejamento_financeiro pelo plano_conta_id.
--   · Lado e grupo vem do PLANO (tipo 1-Entradas = entrada, 2-Saídas = saida; grupo_fluxo); atividade = escopo do plano (a mesma da
--     serie, cujos lancamentos copiam o escopo do plano); centro e subcentro do plano.
--   · So' cenario 'meta'. Valores positivos (como na serie). No' sem meta cadastrada NAO aparece (a tela mostra "—"); nunca um zero
--     inventado — zero so' sai quando ha' meta cadastrada com valor zero.
--   · Filtros: fazendas e atividade. SEGURANCA: SECURITY DEFINER com tenant_ok (senao 42501); EXECUTE so' para authenticated.

CREATE OR REPLACE FUNCTION public.fn_vg_meta(
  p_cliente uuid, p_de date, p_ate date, p_fazendas uuid[] DEFAULT NULL, p_atividade text DEFAULT NULL)
RETURNS TABLE(nivel text, lado text, grupo text, atividade text, centro text, subcentro text, ano_mes text, meta numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH m AS (
    SELECT CASE WHEN pc.tipo_operacao = '1-Entradas' THEN 'entrada' ELSE 'saida' END AS lado_,
           coalesce(pc.grupo_fluxo, CASE WHEN pc.tipo_operacao = '1-Entradas' THEN 'Outras entradas' ELSE 'Outras saídas' END) AS grupo_,
           pc.escopo_negocio AS atividade_, pc.centro_custo AS centro_, pc.subcentro AS sub_,
           to_char(make_date(pf.ano, pf.mes, 1), 'YYYY-MM') AS am, abs(pf.valor_planejado) AS v
      FROM public.planejamento_financeiro pf
      JOIN public.financeiro_plano_contas pc ON pc.id = pf.plano_conta_id
     WHERE pf.cliente_id = p_cliente
       AND pf.cenario = 'meta'
       AND pc.tipo_operacao IN ('1-Entradas', '2-Saídas')
       AND make_date(pf.ano, pf.mes, 1) BETWEEN date_trunc('month', p_de)::date AND p_ate
       AND (p_fazendas IS NULL OR pf.fazenda_id = ANY (p_fazendas))
       AND (p_atividade IS NULL OR pc.escopo_negocio = p_atividade)
  )
  SELECT CASE WHEN GROUPING(m.grupo_) = 1 THEN 'raiz'
              WHEN GROUPING(m.atividade_) = 1 THEN 'grupo'
              WHEN GROUPING(m.centro_) = 1 THEN 'atividade'
              WHEN GROUPING(m.sub_) = 1 THEN 'centro'
              ELSE 'subcentro' END,
         m.lado_, m.grupo_, m.atividade_, m.centro_, m.sub_, m.am, round(sum(m.v), 2)
    FROM m
   GROUP BY GROUPING SETS (
     (m.lado_, m.am),
     (m.lado_, m.grupo_, m.am),
     (m.lado_, m.grupo_, m.atividade_, m.am),
     (m.lado_, m.grupo_, m.atividade_, m.centro_, m.am),
     (m.lado_, m.grupo_, m.atividade_, m.centro_, m.sub_, m.am));
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_meta(uuid, date, date, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_meta(uuid, date, date, uuid[], text) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_meta(uuid, date, date, uuid[], text) IS
  'FIN-VISAO-GERAL-01 PR 2: meta (planejamento_financeiro pelo plano_conta_id) por no da Visao Geral x mes. Sem meta: sem linha.';
