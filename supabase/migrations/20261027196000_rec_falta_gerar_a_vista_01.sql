-- REC-FALTA-GERAR-A-VISTA-01 commit A (Gabriel, 11/10/2026): O QUE CADA RECORRENCIA AINDA TEM PARA GERAR, NUMA LEITURA POR CLIENTE.
-- A tela so' mostrava "nao gerado" no MES escolhido; a regra com mes faltando em OUTRO mes nao dizia nada, e o operador abria
-- o "⋯" regra a regra. Esta funcao e' O GERAR PERGUNTADO SEM GRAVAR, para todas as regras ativas do cliente.
--
-- ⚠ COPIA OS DOIS RAMOS DO CORPO VIVO DE fn_recorrencia_gerar (md5 9fb51f246db33435d545fd74d714c3b9), com p_ate NULO:
--   (1) VAGAS ABAIXO DA MARCA: _fn_recorrencia_vagas(regra, ocupadas, NULL, NULL, true) com competencia < v_ini — ocupadas = TODA
--       competencia com lancamento da regra, vivo OU cancelado (cancelado conta como ocupado);
--   (2) AVANCO ACIMA DA MARCA: generate_series(v_ini, v_fim), com o motivo de mes fechado vindo da MESMA busca de vagas.
--   Nos dois, so' conta a competencia SEM lancamento VIVO (o NOT EXISTS do laco do Gerar). a_gerar = motivo nulo;
--   fechados = motivo 'mês fechado'. Quem mexer no laco do Gerar confere esta leitura (o teste A7 prende a igualdade).
-- ⚠ ACIMA DA MARCA o comportamento e' o do Gerar de hoje: competencia cuja unica linha esta' CANCELADA conta em a_gerar,
--   porque o avanco a recria (divida de 30/09, FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01 — nao corrigida aqui).
-- `passados` = as a_gerar com competencia anterior ao mes de p_hoje (a data LOCAL da tela). So' devolve regra com algo a dizer.
-- So' leitura. SECURITY DEFINER com tenant_ok + 42501 (sem usuario tambem). Nenhum dado e' alterado.
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public.fn_recorrencias_a_gerar(p_cliente_id uuid, p_hoje date DEFAULT CURRENT_DATE)
 RETURNS TABLE(recorrencia_id uuid, a_gerar integer, fechados integer, passados integer, primeira text, ultima text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF p_cliente_id IS NULL OR NOT COALESCE(public.tenant_ok(p_cliente_id), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH ocup AS (
    -- as MESMAS ocupadas do Gerar (toda competencia com lancamento da regra, vivo OU cancelado), lidas NUMA PASSADA para todas
    -- as regras: o unico indice por recorrencia e' parcial (so' vivos), e a subconsulta por regra varria a tabela inteira uma
    -- vez por regra (medido no NJ: 3.228 ms com ela, 43 ms assim; as mesmas 17 regras).
    SELECT fl.recorrencia_id AS rid, array_agg(fl.data_competencia) AS ocupadas
      FROM public.financeiro_lancamentos_v2 fl
     WHERE fl.recorrencia_id IN (SELECT r2.id FROM public.financeiro_recorrencias r2 WHERE r2.cliente_id = p_cliente_id AND r2.ativo)
     GROUP BY fl.recorrencia_id
  ), regras AS (
    -- a janela de avanco, como no Gerar
    SELECT rr AS reg, rr.id, o.ocupadas,
           greatest(
             date_trunc('month', rr.data_inicio)::date,
             coalesce((date_trunc('month', rr.ultimo_lancamento_gerado) + interval '1 month')::date, date_trunc('month', rr.data_inicio)::date)
           ) AS v_ini,
           date_trunc('month', rr.data_fim)::date AS v_fim
      FROM public.financeiro_recorrencias rr LEFT JOIN ocup o ON o.rid = rr.id
     WHERE rr.cliente_id = p_cliente_id AND rr.ativo
  ), comps AS (
    SELECT g.id, vg.competencia, vg.motivo
      FROM regras g CROSS JOIN LATERAL public._fn_recorrencia_vagas(g.reg, g.ocupadas, NULL, NULL, true) vg
     WHERE vg.competencia < g.v_ini
    UNION ALL
    SELECT g.id, a.competencia, a.motivo
      FROM regras g CROSS JOIN LATERAL (
        SELECT gs::date AS competencia, f.motivo
          FROM generate_series(g.v_ini, g.v_fim, interval '1 month') gs
          LEFT JOIN public._fn_recorrencia_vagas(g.reg, NULL, NULL, g.v_fim, true) f ON f.competencia = gs::date
      ) a
  ), faltam AS (
    SELECT c.id, c.competencia, c.motivo
      FROM comps c
     WHERE NOT EXISTS (
       SELECT 1 FROM public.financeiro_lancamentos_v2 fl
        WHERE fl.recorrencia_id = c.id AND fl.data_competencia = c.competencia
          AND fl.cancelado IS NOT TRUE
     )
  )
  SELECT f.id,
         (count(*) FILTER (WHERE f.motivo IS NULL))::int,
         (count(*) FILTER (WHERE f.motivo IS NOT NULL))::int,
         (count(*) FILTER (WHERE f.motivo IS NULL AND f.competencia < date_trunc('month', p_hoje)::date))::int,
         to_char(min(f.competencia) FILTER (WHERE f.motivo IS NULL), 'YYYY-MM'),
         to_char(max(f.competencia) FILTER (WHERE f.motivo IS NULL), 'YYYY-MM')
    FROM faltam f
   GROUP BY f.id
   ORDER BY f.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_recorrencias_a_gerar(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_recorrencias_a_gerar(uuid, date) TO authenticated, service_role;

DO $confere$
BEGIN
  IF has_function_privilege('anon', 'public.fn_recorrencias_a_gerar(uuid, date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_recorrencias_a_gerar(uuid, date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL diferente do esperado';
  END IF;
END
$confere$;
