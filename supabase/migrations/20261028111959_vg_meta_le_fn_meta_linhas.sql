-- P109 (FIN-META-01) — a Visao Geral le' a meta do DONO UNICO: fn_vg_meta = fn_meta_linhas(cliente, ano, 'caixa') por ano do
-- periodo, na conta do plano (plano_conta_id). O que o P108 montou aqui (planejamento + calculada em caixa + espelho da deducao)
-- vira esta chamada; e a VG passa a ter TAMBEM o que a tela de meta ja' tinha e ela nao: os projetos de investimento, o adiantamento
-- de boitel e as parcelas de financiamento (caixa). Valores em modulo (como antes). Saida e assinatura iguais.
-- Guarda pelo md5 do corpo de antes (o da 111955).
SET LOCAL lock_timeout = '2s';
DO $g$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_vg_meta(uuid, date, date, uuid[], text)'::regprocedure)
     IS DISTINCT FROM 'a1ef9cc5803f2b593e69a0efa43d0c15' THEN
    RAISE EXCEPTION 'fn_vg_meta: corpo de origem inesperado.';
  END IF;
END $g$;

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
           to_char(make_date(y.ano, ml.mes, 1), 'YYYY-MM') AS am, abs(ml.valor) AS v
      FROM generate_series(extract(year FROM p_de)::int, extract(year FROM p_ate)::int) AS y(ano)
     CROSS JOIN LATERAL public.fn_meta_linhas(p_cliente, y.ano, 'caixa') ml
      JOIN public.financeiro_plano_contas pc ON pc.id = ml.plano_conta_id
     WHERE pc.tipo_operacao IN ('1-Entradas', '2-Saídas')
       AND make_date(y.ano, ml.mes, 1) BETWEEN date_trunc('month', p_de)::date AND p_ate
       AND (p_fazendas IS NULL OR ml.fazenda_id = ANY (p_fazendas))
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
  'FIN-VISAO-GERAL-01 PR 2 + P108 + P109: meta por no da Visao Geral x mes = fn_meta_linhas(caixa), o dono unico da meta. Sem meta: sem linha.';
