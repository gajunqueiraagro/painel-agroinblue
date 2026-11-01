-- FECH-P2-TRAVA-01 D2 (Gabriel 31/10): reabrir o Valor do Rebanho desliga as DUAS marcas que travam os pastos.
-- Antes, a tela fazia um UPDATE direto só no valor_rebanho_fechamento ('aberto'), e o
-- valor_rebanho_realizado_validado ficava 'validado': o _fn_fechamento_p2_travado seguia travando o salvar dos pastos.
-- Numa transação, esta função:
--   1. abre o valor_rebanho_fechamento do mês (status 'fechado' -> 'aberto', reaberto_por/em);
--   2. põe 'invalidado' no realizado validado do mês e 'cadeia_quebrada' nos meses seguintes validados
--      (a mesma regra da fn_reabrir_p1_operacional);
--   3. grava a trilha em fechamento_reaberturas_log (pilar 'p2_valor_rebanho'), uma linha por mês que mudou.
-- Não mexe nos cards de pasto nem no fechamento_p1. Nada mudou = nada gravado (nenhuma_alteracao).
-- Nasce fechada: SECURITY DEFINER, guarda de tenant (42501), sem EXECUTE para PUBLIC/anon.

CREATE OR REPLACE FUNCTION public.fn_valor_rebanho_reabrir(p_fazenda_id uuid, p_ano_mes text, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente_id uuid;
  v_motivo text := coalesce(nullif(btrim(p_motivo), ''), '(sem motivo)');
  v_fech_aberto boolean := false;
  v_meses text[] := ARRAY[]::text[];
  v_estados jsonb := '[]'::jsonb;
  v_alterados integer := 0;
  v_logs integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_ano_mes IS NULL OR p_ano_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'ano_mes_invalido: esperado YYYY-MM com mes 01-12, recebido %', coalesce(p_ano_mes, 'NULL')
      USING ERRCODE = '22007';
  END IF;

  SELECT cliente_id INTO v_cliente_id FROM public.fazendas WHERE id = p_fazenda_id;
  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'fazenda_inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.tenant_ok(v_cliente_id) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  -- O mesmo lock por (fazenda, mês) do reabrir do P1: as duas reaberturas não se cruzam.
  PERFORM public.fn_lock_p1(p_fazenda_id, p_ano_mes);

  WITH ab AS (
    UPDATE public.valor_rebanho_fechamento
       SET status = 'aberto', reaberto_por = v_uid, reaberto_em = now()
     WHERE fazenda_id = p_fazenda_id AND ano_mes = p_ano_mes AND status = 'fechado'
    RETURNING 1
  )
  SELECT (count(*) > 0) INTO v_fech_aberto FROM ab;

  WITH afetados AS (
    UPDATE public.valor_rebanho_realizado_validado
       SET status = CASE WHEN ano_mes = p_ano_mes THEN 'invalidado' ELSE 'cadeia_quebrada' END
     WHERE fazenda_id = p_fazenda_id
       AND ano_mes >= p_ano_mes
       AND status = 'validado'
    RETURNING ano_mes, status
  )
  SELECT
    coalesce(array_agg(a.ano_mes ORDER BY a.ano_mes), ARRAY[]::text[]),
    coalesce(jsonb_agg(jsonb_build_object('ano_mes', a.ano_mes, 'status', a.status) ORDER BY a.ano_mes), '[]'::jsonb),
    count(*)::integer
  INTO v_meses, v_estados, v_alterados
  FROM afetados a;

  -- Trilha: o mês reaberto (se algo mudou nele) e cada mês seguinte que perdeu o validado.
  WITH meses_log AS (
    SELECT p_ano_mes AS ano_mes
     WHERE v_fech_aberto OR p_ano_mes = ANY (v_meses)
    UNION
    SELECT m FROM unnest(v_meses) AS m WHERE m <> p_ano_mes
  ),
  ins AS (
    INSERT INTO public.fechamento_reaberturas_log
      (fazenda_id, cliente_id, ano_mes, pilar, motivo, reaberto_por, reaberto_em)
    SELECT p_fazenda_id, v_cliente_id, ml.ano_mes, 'p2_valor_rebanho',
           'Reabertura do Valor do Rebanho: ' || v_motivo
           || CASE WHEN ml.ano_mes <> p_ano_mes THEN ' [cadeia a partir de ' || p_ano_mes || ']' ELSE '' END,
           v_uid, now()
      FROM meses_log ml
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_logs FROM ins;

  RETURN jsonb_build_object(
    'ano_mes', p_ano_mes,
    'fechamento_aberto', v_fech_aberto,
    'realizados_alterados', v_alterados,
    'meses_invalidados', to_jsonb(v_meses),
    'estados_por_mes', v_estados,
    'logs_gravados', v_logs,
    'travado_depois', public._fn_fechamento_p2_travado(p_fazenda_id, p_ano_mes),
    'nenhuma_alteracao', NOT (v_fech_aberto OR v_alterados > 0)
  );
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_valor_rebanho_reabrir(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_valor_rebanho_reabrir(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_valor_rebanho_reabrir(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.fn_valor_rebanho_reabrir(uuid, text, text) IS
  'FECH-P2-TRAVA-01: reabre o Valor do Rebanho do mês desligando as duas marcas do _fn_fechamento_p2_travado (fechamento -> aberto; realizado validado -> invalidado no mês, cadeia_quebrada nos seguintes) e grava a trilha p2_valor_rebanho. Guarda tenant_ok (42501).';
