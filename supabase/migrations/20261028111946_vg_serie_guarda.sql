-- FIN-VISAO-GERAL-01 PR 5 — a GUARDA de cliente de volta DENTRO da fn_vg_serie (a regra da casa: toda SECURITY DEFINER com parametro
-- de cliente checa o tenant_ok ela mesma, `guardaDeClienteNasMigrations.test.ts`). Na 111944 ela delegava a checagem a' fn_vg_partes
-- (que a faz): o resultado era o mesmo, mas a guarda nao ficava escrita onde o leitor a procura. Mesma assinatura e mesma saida.

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
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  -- PR 5: a serie SOMA as linhas da fn_vg_partes (a fonte unica que a gaveta tambem le)
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
