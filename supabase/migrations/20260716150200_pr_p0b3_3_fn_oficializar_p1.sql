-- PR-P1-OFICIALIZACAO-P0B3 — Migração 3: fn_oficializar_p1
-- Pre-condicoes: conjunto vigente + completude (sem membro sem card / nao fechado) +
--   area vinculada + P2 fechado/validado. Estado oficializando -> oficial. Payload
--   construido NA RPC (prova imutavel). Idempotencia estrita (no-op identico) ou
--   divergencia_oficial. SECDEF, search_path=public; grant authenticated (sem anon/PUBLIC).

CREATE OR REPLACE FUNCTION public.fn_oficializar_p1(
  p_fazenda_id uuid, p_ano_mes text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente_id uuid;
  v_p1 RECORD; v_snap RECORD; v_area RECORD;
  v_membros int; v_sem_card int; v_nao_fechados int;
  v_p2_fech boolean; v_p2_val boolean;
  v_payload jsonb; v_ano_mes_date date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado'; END IF;
  IF p_ano_mes IS NULL OR p_ano_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='ano_mes_invalido: esperado YYYY-MM (01-12)';
  END IF;

  SELECT cliente_id INTO v_cliente_id FROM public.fazendas WHERE id=p_fazenda_id;
  IF v_cliente_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='fazenda_inexistente'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid)
    OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id) WHERE t.cliente_id=v_cliente_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao';
  END IF;

  PERFORM public.fn_lock_p1(p_fazenda_id, p_ano_mes);
  v_ano_mes_date := to_date(p_ano_mes||'-01','YYYY-MM-DD');

  SELECT * INTO v_p1 FROM public.fechamento_p1 WHERE fazenda_id=p_fazenda_id AND ano_mes=p_ano_mes;
  IF v_p1.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='fechamento_p1_inexistente'; END IF;

  SELECT * INTO v_snap FROM public.fechamento_p1_snapshot
   WHERE fechamento_p1_id=v_p1.id AND status='vigente'::public.snapshot_status;
  IF v_snap.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='conjunto_nao_vigente'; END IF;

  SELECT count(*)::int,
         count(*) FILTER (WHERE fechamento_pasto_id IS NULL)::int,
         count(*) FILTER (WHERE card_fechado=false)::int
    INTO v_membros, v_sem_card, v_nao_fechados
    FROM public.fechamento_pastos_membros WHERE snapshot_id=v_snap.id;
  IF v_sem_card>0 OR v_nao_fechados>0 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE=format('conjunto_incompleto: membros_sem_card=%s membros_nao_fechados=%s', v_sem_card, v_nao_fechados);
  END IF;

  SELECT * INTO v_area FROM public.fechamento_area_snapshot
   WHERE fazenda_id=p_fazenda_id AND ano_mes=v_ano_mes_date AND fechamento_p1_snapshot_id=v_snap.id;
  IF v_area.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='area_nao_vinculada'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.valor_rebanho_fechamento
                  WHERE fazenda_id=p_fazenda_id AND ano_mes=p_ano_mes AND status='fechado'),
         EXISTS (SELECT 1 FROM public.valor_rebanho_realizado_validado
                  WHERE fazenda_id=p_fazenda_id AND ano_mes=p_ano_mes AND status='validado')
    INTO v_p2_fech, v_p2_val;
  IF NOT (v_p2_fech AND v_p2_val) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE=format('p2_incompleto: fechamento=%s validado=%s', v_p2_fech, v_p2_val);
  END IF;

  v_payload := jsonb_build_object(
    'area_total_ha', v_area.area_total_ha, 'area_produtiva_ha', v_area.area_produtiva_ha,
    'area_pecuaria_ha', v_area.area_pecuaria_ha, 'area_agricultura_ha', v_area.area_agricultura_ha,
    'area_reserva_ha', v_area.area_reserva_ha, 'area_benfeitorias_ha', v_area.area_benfeitorias_ha,
    'area_outras_ha', v_area.area_outras_ha, 'origem_area', v_area.origem_area,
    'area_versao', v_area.versao, 'fechamento_p1_snapshot_id', v_area.fechamento_p1_snapshot_id);

  IF v_p1.status='oficial' THEN
    IF v_p1.conjunto_oficializado_snapshot_id=v_snap.id
       AND v_p1.area_oficializada_snapshot_id=v_area.id
       AND v_p1.area_oficializada_payload=v_payload
       AND v_p2_fech AND v_p2_val AND v_sem_card=0 AND v_nao_fechados=0 THEN
      RETURN jsonb_build_object('ja_oficial', true, 'nenhuma_alteracao', true,
        'fechamento_p1_id', v_p1.id, 'versao', v_p1.versao);
    ELSE
      RAISE EXCEPTION USING ERRCODE='P0001',
        MESSAGE='divergencia_oficial: mes ja oficial com selo diferente. Reabra formalmente antes de reoficializar.';
    END IF;
  END IF;

  UPDATE public.fechamento_p1 SET status='oficializando' WHERE id=v_p1.id;

  UPDATE public.fechamento_p1 SET
     status='oficial',
     conjunto_oficializado_snapshot_id=v_snap.id,
     area_oficializada_snapshot_id=v_area.id,
     area_oficializada_payload=v_payload,
     area_oficializada_schema_version=1,
     oficializado_em=now(), oficializado_por=v_uid
   WHERE id=v_p1.id;

  RETURN jsonb_build_object('oficializado', true, 'fechamento_p1_id', v_p1.id,
    'conjunto_oficializado_snapshot_id', v_snap.id, 'area_oficializada_snapshot_id', v_area.id,
    'membros_count', v_membros, 'versao', v_p1.versao);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_oficializar_p1(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_oficializar_p1(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_oficializar_p1(uuid, text) TO authenticated;
