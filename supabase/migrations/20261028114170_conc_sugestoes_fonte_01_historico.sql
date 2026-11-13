-- CONC-SUGESTOES-FONTE-01 item 4 (Gabriel 08/11/2026, opção B: "regra única no banco") — o FORNECEDOR QUE O HISTÓRICO CONHECE para cada
-- texto do banco de um mês, numa chamada só, para o motor das sugestões (`sugerirCasamentos`) pôr esse fornecedor primeiro e o que entrou
-- só por texto parecido no fim — no "(N)" do menu e no modal, a MESMA lista (decisão de 30/09).
--
-- ⚠ UMA REGRA SÓ, POR CONSTRUÇÃO: para cada termo, o `resumo` é o da PRÓPRIA `fn_conciliacao_historico_buscar` (a faixa amarela do
--   "Procurar no histórico": o fornecedor PAGO que mais vezes aparece para aquele texto), chamada com os MESMOS parâmetros que o modal usa
--   ao abrir (os 3 lugares; de 1º/jan do ano do movimento até o fim do mês seguinte). O `resumo` não depende do valor (`p_valor` NULL).
--   O termo é o `nomeDoHistorico` da tela (a tela o calcula e manda a lista; aqui ele só é aparado).
-- ⚠ SÓ LEITURA: nenhum dado muda. Nasce FECHADA (SEG-TENANT-VARREDURA-01C): SECURITY DEFINER com `tenant_ok` (42501), REVOKE de PUBLIC/anon.
-- ⚠ Até 200 termos por chamada (um mês de uma conta; o caso BB out/26 tem 40).

CREATE FUNCTION public.fn_conciliacao_fornecedores_do_historico(p_cliente uuid, p_termos text[], p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v jsonb := '{}'::jsonb;
  t text;
  r jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(p_termos, 1), 0) > 200 THEN
    RAISE EXCEPTION 'termos demais: % (até 200)', array_length(p_termos, 1) USING ERRCODE = '22023';
  END IF;
  FOR t IN SELECT DISTINCT btrim(x) FROM unnest(coalesce(p_termos, '{}'::text[])) x WHERE length(btrim(x)) >= 2 LOOP
    r := public.fn_conciliacao_historico_buscar(p_cliente, t, ARRAY['banco', 'descricao', 'fornecedor'], p_de, p_ate, NULL) -> 'resumo';
    IF r IS NOT NULL AND jsonb_typeof(r) = 'object' THEN
      v := v || jsonb_build_object(t, r);
    END IF;
  END LOOP;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_conciliacao_fornecedores_do_historico(uuid, text[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_fornecedores_do_historico(uuid, text[], date, date) TO authenticated, service_role;

DO $conf$
DECLARE r record;
BEGIN
  SELECT p.oid, p.prosecdef, p.proconfig, p.provolatile INTO r FROM pg_proc p
   WHERE p.oid = 'public.fn_conciliacao_fornecedores_do_historico(uuid,text[],date,date)'::regprocedure;
  IF NOT r.prosecdef OR r.provolatile <> 's' OR has_function_privilege('anon', r.oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE')
     OR NOT ('plan_cache_mode=force_custom_plan' = ANY (r.proconfig)) OR NOT ('search_path=public' = ANY (r.proconfig)) THEN
    RAISE EXCEPTION 'CONC-SUGESTOES-FONTE-01: fn_conciliacao_fornecedores_do_historico fora do esperado (secdef/ACL/config)';
  END IF;
  -- a busca de origem é a do P153b (o resumo que a faixa mostra)
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_historico_buscar(uuid,text,text[],date,date,numeric)'::regprocedure)
     <> 'd93e93a7a4e71098b5037621b763547b' THEN
    RAISE EXCEPTION 'CONC-SUGESTOES-FONTE-01: fn_conciliacao_historico_buscar com corpo inesperado';
  END IF;
END $conf$;
