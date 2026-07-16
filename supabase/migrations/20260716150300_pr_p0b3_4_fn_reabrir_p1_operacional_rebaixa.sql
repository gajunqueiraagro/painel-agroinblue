-- PR-P1-OFICIALIZACAO-P0B3 — Migração 4: fn_reabrir_p1_operacional passa a rebaixar oficial
-- Corpo capturado (P0-A: regex ano_mes; elegibilidade sob lock; no-op total; RETURNING)
--   PRESERVADO byte a byte, com UMA insercao: PERFORM fn_rebaixar_p1_oficial imediatamente
--   apos confirmar v_alvo_elegivel=true e ANTES de qualquer mutacao em P2/fechamento/cards.
--   Assim, disparos A8A posteriores (nos cards) acham 'reaberto' -> no-op. O log de
--   rebaixamento e gravado DENTRO da funcao interna (nao duplicar). O UPDATE existente de
--   fechamento_p1 (status=reaberto/reaberto_em/reaberto_por) permanece e NAO incrementa
--   versao (o incremento e exclusivo de fn_rebaixar_p1_oficial). Logs de invalidacao de P2
--   (bloco afetados/logs) permanecem independentes.

CREATE OR REPLACE FUNCTION public.fn_reabrir_p1_operacional(p_fazenda_id uuid, p_ano_mes text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente_id uuid;
  v_meses text[] := ARRAY[]::text[];
  v_estados jsonb := '[]'::jsonb;
  v_p2val_alterados integer := 0;
  v_logs integer := 0;
  v_p2fech_aberto boolean := false;
  v_cards integer := 0;
  v_cab_existia boolean := false;
  v_houve_mudanca boolean := false;
  v_cab_atualizado boolean := false;
  v_alvo_elegivel boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado' USING ERRCODE = '42501';
  END IF;

  -- Formato estrito ANTES de qualquer efeito/comparacao textual.
  IF p_ano_mes IS NULL OR p_ano_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'ano_mes_invalido: esperado YYYY-MM com mes 01-12, recebido %', coalesce(p_ano_mes, 'NULL')
      USING ERRCODE = '22007';
  END IF;

  SELECT cliente_id INTO v_cliente_id FROM public.fazendas WHERE id = p_fazenda_id;
  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'fazenda_inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_admin_agroinblue(v_uid)
    OR EXISTS (
      SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id)
      WHERE t.cliente_id = v_cliente_id
    )
  ) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  PERFORM public.fn_lock_p1(p_fazenda_id, p_ano_mes);

  -- Elegibilidade do ALVO sob o lock: cascata condicionada a estado real do alvo.
  SELECT
       EXISTS (SELECT 1 FROM public.valor_rebanho_realizado_validado
                WHERE fazenda_id = p_fazenda_id AND ano_mes = p_ano_mes AND status = 'validado')
    OR EXISTS (SELECT 1 FROM public.valor_rebanho_fechamento
                WHERE fazenda_id = p_fazenda_id AND ano_mes = p_ano_mes AND status = 'fechado')
    OR EXISTS (SELECT 1 FROM public.fechamento_pastos
                WHERE fazenda_id = p_fazenda_id AND ano_mes = p_ano_mes AND status = 'fechado')
    OR EXISTS (SELECT 1 FROM public.fechamento_p1
                WHERE fazenda_id = p_fazenda_id AND ano_mes = p_ano_mes AND status IN ('oficial','oficializando'))
  INTO v_alvo_elegivel;

  IF NOT v_alvo_elegivel THEN
    -- No-op total: nada alterado, cadeia posterior intacta.
    RETURN jsonb_build_object(
      'ano_mes', p_ano_mes,
      'p2_realizados_alterados', 0,
      'meses_invalidados', '[]'::jsonb,
      'estados_por_mes', '[]'::jsonb,
      'p2_fechamento_aberto', false,
      'cards_reabertos', 0,
      'logs_gravados', 0,
      'cabecalho_criado', false,
      'cabecalho_atualizado', false,
      'nenhuma_alteracao', true
    );
  END IF;

  -- rebaixar oficial ANTES de mexer nos cards -> disparos A8A posteriores acham 'reaberto' -> no-op.
  -- Log de rebaixamento e gravado DENTRO de fn_rebaixar_p1_oficial (nao duplicar aqui).
  PERFORM public.fn_rebaixar_p1_oficial(
    (SELECT id FROM public.fechamento_p1 WHERE fazenda_id=p_fazenda_id AND ano_mes=p_ano_mes),
    'Rebaixamento oficial por reabertura operacional P1: ' || coalesce(p_motivo,'(sem motivo)'));

  -- Alvo elegivel: invalidar realizado (alvo + cadeia) e logar SOMENTE transicoes reais.
  WITH afetados AS (
    UPDATE public.valor_rebanho_realizado_validado
       SET status = CASE WHEN ano_mes = p_ano_mes THEN 'invalidado' ELSE 'cadeia_quebrada' END
     WHERE fazenda_id = p_fazenda_id
       AND (ano_mes = p_ano_mes OR ano_mes > p_ano_mes)
       AND status = 'validado'
    RETURNING ano_mes, status
  ),
  logs AS (
    INSERT INTO public.fechamento_reaberturas_log
      (fazenda_id, cliente_id, ano_mes, pilar, motivo, reaberto_por, reaberto_em)
    SELECT p_fazenda_id, v_cliente_id, a.ano_mes, 'p1_mapa_pastos',
           'Reabertura operacional P1: ' || coalesce(p_motivo, '(sem motivo)')
           || CASE WHEN a.ano_mes <> p_ano_mes THEN ' [cadeia a partir de ' || p_ano_mes || ']' ELSE '' END,
           v_uid, now()
    FROM afetados a
    RETURNING id
  )
  SELECT
    coalesce(array_agg(a.ano_mes ORDER BY a.ano_mes), ARRAY[]::text[]),
    coalesce(jsonb_agg(jsonb_build_object('ano_mes', a.ano_mes, 'status', a.status) ORDER BY a.ano_mes), '[]'::jsonb),
    count(*)::integer,
    (SELECT count(*)::integer FROM logs)
  INTO v_meses, v_estados, v_p2val_alterados, v_logs
  FROM afetados a;

  WITH ab AS (
    UPDATE public.valor_rebanho_fechamento
       SET status = 'aberto'
     WHERE fazenda_id = p_fazenda_id AND ano_mes = p_ano_mes AND status = 'fechado'
    RETURNING 1
  )
  SELECT (count(*) > 0) INTO v_p2fech_aberto FROM ab;

  WITH rb AS (
    UPDATE public.fechamento_pastos
       SET status = 'rascunho'
     WHERE fazenda_id = p_fazenda_id AND ano_mes = p_ano_mes AND status = 'fechado'
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_cards FROM rb;

  v_houve_mudanca := (v_p2val_alterados > 0) OR v_p2fech_aberto OR (v_cards > 0);

  SELECT EXISTS (SELECT 1 FROM public.fechamento_p1
                  WHERE fazenda_id = p_fazenda_id AND ano_mes = p_ano_mes)
    INTO v_cab_existia;

  IF v_houve_mudanca THEN
    IF NOT v_cab_existia THEN
      INSERT INTO public.fechamento_p1
        (fazenda_id, cliente_id, ano_mes, status, origem_legado, versao, reaberto_em, reaberto_por)
      VALUES
        (p_fazenda_id, v_cliente_id, p_ano_mes, 'reaberto', true, 1, now(), v_uid);
    ELSE
      UPDATE public.fechamento_p1
         SET status = 'reaberto', reaberto_em = now(), reaberto_por = v_uid
       WHERE fazenda_id = p_fazenda_id AND ano_mes = p_ano_mes;
      v_cab_atualizado := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ano_mes', p_ano_mes,
    'p2_realizados_alterados', v_p2val_alterados,
    'meses_invalidados', v_meses,
    'estados_por_mes', v_estados,
    'p2_fechamento_aberto', v_p2fech_aberto,
    'cards_reabertos', v_cards,
    'logs_gravados', v_logs,
    'cabecalho_criado', (v_houve_mudanca AND NOT v_cab_existia),
    'cabecalho_atualizado', v_cab_atualizado,
    'nenhuma_alteracao', NOT v_houve_mudanca
  );
END $function$;
