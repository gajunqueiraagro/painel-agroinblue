-- RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01, parte 1 de 2 (Gabriel, 10/10/2026; SUBSTITUI a trava "nunca historico" de 30/09).
-- _fn_recorrencia_vagas: a serie comeca no INICIO DA VIGENCIA (meses passados inclusive); ganha o 5o parametro
-- p_com_fechados e a coluna motivo (DROP + CREATE). A chamada de 4 argumentos (o gerar antigo e o propagar, NAO tocado)
-- devolve o de antes: mes fechado fora. NENHUMA CARGA. Regra, medicao e desvios: bloco de mesmo nome no CLAUDE.md.
-- (Duas partes porque o canal de aplicacao recusa carga acima de ~10 KB.)
SET LOCAL lock_timeout = '2s';

DO $guarda$
DECLARE v text;
BEGIN
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date)'::regprocedure;
  IF v IS DISTINCT FROM 'f5f85da4fb420c5f400908704622132c' THEN RAISE EXCEPTION 'origem: _fn_recorrencia_vagas md5 %', v; END IF;
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public.fn_recorrencia_propagar(uuid, text, boolean)'::regprocedure;
  IF v IS DISTINCT FROM '6a932aa9771cbfb81ae09bbef4572f57' THEN RAISE EXCEPTION 'origem: fn_recorrencia_propagar md5 %', v; END IF;
END
$guarda$;

DROP FUNCTION public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date);

CREATE FUNCTION public._fn_recorrencia_vagas(p_r public.financeiro_recorrencias, p_ocupadas date[], p_ate date DEFAULT NULL::date, p_marca date DEFAULT NULL::date, p_com_fechados boolean DEFAULT false)
 RETURNS TABLE(competencia date, vencimento date, motivo text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- Competencias da regra SEM lancamento entre o INICIO DA VIGENCIA e min(marca, fim, p_ate) — meses passados inclusive
  -- (RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01; ate' 10/10/2026 a serie comecava no mes corrente).
  -- p_marca NULL = a marca gravada na recorrencia; sem marca nenhuma, nao ha' vaga (a serie ainda nao comecou).
  -- motivo NULL = pode gerar. Mes fechado nao recebe lancamento novo: so' aparece com p_com_fechados, e com o motivo.
  SELECT x.competencia, x.vencimento, x.motivo
    FROM (
      SELECT gs::date AS competencia, public._fn_recorrencia_vencimento(p_r, gs::date) AS vencimento,
             CASE WHEN EXISTS (SELECT 1 FROM public.financeiro_fechamentos ff
                                WHERE ff.cliente_id = p_r.cliente_id AND ff.status_fechamento = 'fechado'
                                  AND ff.ano_mes = to_char(gs, 'YYYY-MM'))
                  THEN 'mês fechado' END AS motivo
        FROM generate_series(
               date_trunc('month', p_r.data_inicio),
               least(date_trunc('month', coalesce(p_marca, p_r.ultimo_lancamento_gerado)),
                     date_trunc('month', p_r.data_fim),
                     coalesce(date_trunc('month', p_ate), date_trunc('month', p_r.data_fim))),
               interval '1 month') AS gs
       WHERE coalesce(p_marca, p_r.ultimo_lancamento_gerado) IS NOT NULL
         -- cancelado conta como ocupado: o chamador passa TODAS as competencias da recorrencia
         AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p_ocupadas, '{}'::date[])) AS o(d)
                          WHERE date_trunc('month', o.d) = gs)
    ) x
   WHERE p_com_fechados OR x.motivo IS NULL
   ORDER BY 1;
$function$;

REVOKE ALL ON FUNCTION public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date, boolean) TO service_role;

DO $confere$
DECLARE v text;
BEGIN
  IF has_function_privilege('anon', 'public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL aberta demais';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = '_fn_recorrencia_vagas') <> 1 THEN
    RAISE EXCEPTION 'ha mais de uma _fn_recorrencia_vagas';
  END IF;
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date, boolean)'::regprocedure;
  IF v IS DISTINCT FROM 'f13b4eca5ba0663b71ffac881c24897d' THEN RAISE EXCEPTION 'destino: _fn_recorrencia_vagas md5 %', v; END IF;
END
$confere$;
