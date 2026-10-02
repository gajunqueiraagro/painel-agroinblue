-- PR-CONC-ENRIQ-SAFRA-COMPETENCIA (2/2) — o CUSTO da view: as duas colunas novas sem consulta por linha sob RLS.
--
-- POR QUE
-- A 20261027190700 dobrou o custo da view na 8d6efeb7 (como authenticated: {854,805,822} ms -> {1679,1630,1597} ms). O plano
-- mostrou a causa: cada subconsulta por linha em `financeiro_safras`/`financeiro_plano_contas` vira Seq Scan com a RLS avaliada
-- em CADA linha da tabela (`is_admin_agroinblue(...)` antes do filtro por id), 509 x 47 chamadas so' no "fora do periodo" — o
-- indice por id nao entra. O Recasar da tela ja' chegou a 7.997 ms de 8 s (FASE 0 de 14:37): a view nao pode dobrar.
--
-- O QUE MUDA (sem mudar o que as colunas dizem)
-- 1. `_fn_safra_da_competencia` passa a SECURITY DEFINER (le' `financeiro_safras` como dona, sem a RLS por linha) com a
--    guarda de tenant UMA vez por chamada: `tenant_ok(cliente)`; sem usuario (`auth.uid()` nulo: canal SQL, service_role)
--    a guarda nao se aplica — quem chega ali sem usuario ja' passa por cima da RLS. anon continua sem EXECUTE.
-- 2. a view: a safra que vai ser gravada sai dos JOINs que ela JA' TEM (`sfp` = a da proposta; sem ela, `sfl` = a do
--    lancamento) e o escopo do plano de um LEFT JOIN novo no fim (`pcv`, o plano da proposta; sem ele, o do lancamento) —
--    juncao avalia a RLS uma vez por linha da tabela, nao por linha da view. As duas colunas continuam no fim, mesmo nome.
-- Medido em ROLLBACK (02/10): as duas colunas IGUAIS antes x depois nas 47.366 linhas de staging do proto; custo da view na
-- 8d6efeb7 como authenticated {920,912,906} ms (antes do PR {883,791,798}; com a 190700 sozinha {1679,1630,1597}).
--
-- METODO: patch guardado por md5 de origem (ancoras contadas, destino conferido). Nenhum UPDATE em dado de cliente.
--   _fn_safra_da_competencia 14c43cf67eab51bfd7dc2ea940feb06a -> 81e2f6bbdc35d372f1483fb84c418ffd
--   view (definicao)         5f85748a03422b8b81b711662c1e6148 -> b041b03edbf792f2fc15abda63e1cf46

-- ═══ 1. a funcao: SECURITY DEFINER, guarda de tenant por chamada ═════════════════════════════════════════════════════
DO $fn$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_safra_da_competencia(uuid,text,date)'::regprocedure))
     <> '14c43cf67eab51bfd7dc2ea940feb06a' THEN
    RAISE EXCEPTION '_fn_safra_da_competencia nao esta no corpo esperado. Migration abortada.';
  END IF;
END $fn$;
CREATE OR REPLACE FUNCTION public._fn_safra_da_competencia(p_cliente_id uuid, p_escopo text, p_data date)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  -- A safra ATIVA do escopo cujo periodo contem a data; zero ou mais de uma -> NULL (sem palpite).
  -- SECURITY DEFINER para nao pagar a RLS de `financeiro_safras` linha a linha; a guarda de tenant e' por chamada.
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(sf.id))[1] END
    FROM public.financeiro_safras sf
   WHERE p_cliente_id IS NOT NULL AND p_escopo IS NOT NULL AND p_data IS NOT NULL
     AND ((SELECT auth.uid()) IS NULL OR public.tenant_ok(p_cliente_id))
     AND sf.cliente_id = p_cliente_id AND sf.ativa AND sf.escopo_negocio = p_escopo
     AND p_data BETWEEN sf.data_inicio AND sf.data_fim
$fn$;
REVOKE ALL ON FUNCTION public._fn_safra_da_competencia(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_safra_da_competencia(uuid, text, date) TO authenticated, service_role;
DO $fn$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_safra_da_competencia(uuid,text,date)'::regprocedure))
     <> '81e2f6bbdc35d372f1483fb84c418ffd' THEN
    RAISE EXCEPTION '_fn_safra_da_competencia: corpo resultante inesperado (md5 %).',
      md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_safra_da_competencia(uuid,text,date)'::regprocedure));
  END IF;
END $fn$;

-- ═══ 2. a view: as duas colunas pelos JOINs ═══════════════════════════════════════════════════════════════════════════
DO $v$
DECLARE
  d text; i_ini int; i_fim int;
  a_ini constant text := $a$s.proposto_editado_em,
    _fn_safra_da_competencia(s.cliente_id,$a$;
  a_fim constant text := $a$AS safra_fora_do_periodo
   FROM ($a$;
  a_join constant text := $a$LEFT JOIN financeiro_safras sfp ON ((sfp.id = (NULLIF((s.update_proposto ->> 'safra_id'::text), ''::text))::uuid)));$a$;
BEGIN
  d := pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass);
  IF md5(d) <> '5f85748a03422b8b81b711662c1e6148' THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview nao esta na definicao esperada (md5 %). Migration abortada.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, a_ini, ''))) / length(a_ini) <> 1
     OR (length(d) - length(replace(d, a_fim, ''))) / length(a_fim) <> 1
     OR (length(d) - length(replace(d, a_join, ''))) / length(a_join) <> 1
     OR right(d, length(a_join)) <> a_join THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview: as ancoras (inicio, fim das colunas novas, ultimo JOIN no fim) nao casam 1x';
  END IF;
  i_ini := position(a_ini IN d);
  i_fim := position(a_fim IN d);
  -- (a) as duas colunas: troca o trecho inteiro entre as ancoras
  d := left(d, i_ini - 1) || $c$s.proposto_editado_em,
    public._fn_safra_da_competencia(s.cliente_id,
      COALESCE(pcv.escopo_negocio, CASE WHEN sfp.id IS NOT NULL THEN sfp.escopo_negocio ELSE sfl.escopo_negocio END),
      COALESCE(NULLIF(s.update_proposto ->> 'data_competencia', '')::date, l.data_competencia, s.excel_data)) AS safra_da_competencia_id,
    CASE WHEN sfp.id IS NOT NULL
           THEN NOT (COALESCE(NULLIF(s.update_proposto ->> 'data_competencia', '')::date, l.data_competencia, s.excel_data)
                     BETWEEN sfp.data_inicio AND sfp.data_fim)
         WHEN sfl.id IS NOT NULL
           THEN NOT (COALESCE(NULLIF(s.update_proposto ->> 'data_competencia', '')::date, l.data_competencia, s.excel_data)
                     BETWEEN sfl.data_inicio AND sfl.data_fim)
    END $c$ || substr(d, i_fim);
  -- (b) o plano que vai ser gravado, por JOIN no fim (o `;` final sai e volta)
  d := left(d, length(d) - 1) || $j$
     LEFT JOIN financeiro_plano_contas pcv ON pcv.id = COALESCE(NULLIF(s.update_proposto ->> 'plano_conta_id', '')::uuid, l.plano_conta_id)$j$;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview WITH (security_invoker = true) AS ' || d;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.vw_classificacao_staging_preview'::regclass
                 AND reloptions @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview perdeu security_invoker';
  END IF;
  IF md5(pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass)) <> 'b041b03edbf792f2fc15abda63e1cf46' THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview: definicao resultante inesperada (md5 %).',
      md5(pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass));
  END IF;
END $v$;
