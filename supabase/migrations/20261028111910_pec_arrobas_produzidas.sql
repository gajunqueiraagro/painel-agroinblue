-- FIN-VISAO-GERAL-01 PR 2 — a @ PRODUZIDA vira funcao propria (fn_pec_arrobas_produzidas, por fazenda x mes) e o fn_dre_pecuaria passa a
-- ler dela. Ate' aqui ela so' existia DENTRO do DRE (o passo `prod`: producao_biologica do zoot_mensal_cache, realizado, / 30).
--   · A funcao devolve, por fazenda e mes, a producao biologica em kg e a @ (kg / 30, 2 casas). O DRE soma os KG do periodo e divide uma
--     vez (round(sum(kg)/30, 2)) — a MESMA conta de antes, entao o numero do DRE nao muda (provado em todos os clientes).
--   · So' o passo `prod` do DRE muda. PATCH GUARDADO POR md5: o corpo de origem tem de ser bd90e8e9 e o trecho tem de casar 1 vez;
--     reexecutar FALHA na guarda de origem, que e' o comportamento certo para migration de corpo.
--   · SEGURANCA: SECURITY DEFINER com tenant_ok (senao 42501); EXECUTE so' para authenticated.

CREATE OR REPLACE FUNCTION public.fn_pec_arrobas_produzidas(p_cliente uuid, p_de text, p_ate text)
RETURNS TABLE(fazenda_id uuid, ano_mes text, producao_kg numeric, arrobas numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT z.fazenda_id, z.ano_mes, sum(z.producao_biologica), round(sum(z.producao_biologica) / 30.0, 2)
    FROM public.zoot_mensal_cache z
   WHERE z.cliente_id = p_cliente AND z.cenario = 'realizado' AND z.ano_mes BETWEEN p_de AND p_ate
   GROUP BY 1, 2;
END $function$;

REVOKE ALL ON FUNCTION public.fn_pec_arrobas_produzidas(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pec_arrobas_produzidas(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.fn_pec_arrobas_produzidas(uuid, text, text) IS
  'FIN-VISAO-GERAL-01 PR 2: @ produzida por fazenda x mes (producao_biologica do zoot_mensal_cache realizado / 30). Fonte do fn_dre_pecuaria e da Visao Geral.';

DO $patch$
DECLARE
  d text := pg_get_functiondef('public.fn_dre_pecuaria(uuid,text,text,text)'::regprocedure);
  v_de text := E'select fazenda_id, round(sum(producao_biologica)/30.0,2) at\n    from zoot_mensal_cache\n    where cliente_id=p_cliente and cenario=''realizado'' and p_cenario=''realizado'' and ano_mes between p_de and p_ate\n    group by 1';
  v_para text := E'select fazenda_id, round(sum(producao_kg)/30.0,2) at\n    from public.fn_pec_arrobas_produzidas(p_cliente, p_de, p_ate)\n    where p_cenario=''realizado''\n    group by 1';
BEGIN
  IF md5(d) <> 'bd90e8e9683fff869ecd40758a3c5dd5' THEN
    RAISE EXCEPTION 'fn_dre_pecuaria mudou desde a medicao (md5 %): o patch nao se aplica', md5(d);
  END IF;
  IF (length(d) - length(replace(d, v_de, ''))) / length(v_de) <> 1 THEN
    RAISE EXCEPTION 'o passo prod do fn_dre_pecuaria nao casou exatamente 1 vez';
  END IF;
  EXECUTE replace(d, v_de, v_para);
END $patch$;
