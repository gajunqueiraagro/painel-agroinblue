-- PR-P1-SNAPSHOT-AREA-P0B2 — Migração 4: fn_gerar_area_de_snapshot (INTERNA, sem grant)
-- Recebe SO o snapshot; deriva fazenda/cliente/ano_mes; autor auth.uid(); autorizacao
--   multi-tenant. Adquire fn_lock_p1 e RE-valida vigencia sob lock antes do UPSERT
--   (fecha corrida). Modelo 1 sobrescreve area do mes (versao++); historico do conjunto
--   fica no P0-B.1. Retorna diagnostico; NAO bloqueia por membro sem card (pendencia
--   bloqueia OFICIALIZACAO no P0-B.3).

CREATE OR REPLACE FUNCTION public.fn_gerar_area_de_snapshot(
  p_fechamento_p1_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  s RECORD;
  v_ano_mes_date date;
  v_area_id uuid;
  v_prod numeric; v_pec numeric; v_agric numeric; v_total numeric;
  v_reserva numeric; v_benf numeric; v_outras numeric;
  v_membros int; v_sem_card int; v_nao_fechados int; v_apto boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado';
  END IF;

  SELECT id, fechamento_p1_id, fazenda_id, cliente_id, ano_mes, status
    INTO s FROM public.fechamento_p1_snapshot WHERE id=p_fechamento_p1_snapshot_id;
  IF s.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='snapshot_inexistente';
  END IF;

  IF NOT (public.is_admin_agroinblue(v_uid)
    OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id) WHERE t.cliente_id=s.cliente_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao';
  END IF;

  PERFORM public.fn_lock_p1(s.fazenda_id, s.ano_mes);
  SELECT status INTO s.status FROM public.fechamento_p1_snapshot WHERE id=s.id;  -- relê sob lock
  IF s.status <> 'vigente'::public.snapshot_status THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='snapshot_nao_vigente: snapshot deixou de ser vigente (invalidado/substituido) antes da geracao da area';
  END IF;

  v_ano_mes_date := to_date(s.ano_mes || '-01', 'YYYY-MM-DD');

  SELECT area_produtiva_ha, area_pecuaria_ha, area_agricultura_ha, area_total_ha,
         area_reserva_ha, area_benfeitorias_ha, area_outras_ha
    INTO v_prod, v_pec, v_agric, v_total, v_reserva, v_benf, v_outras
    FROM public.fazenda_cadastros
   WHERE fazenda_id=s.fazenda_id AND cliente_id=s.cliente_id;
  IF v_prod IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='fazenda_cadastros_sem_area';
  END IF;

  INSERT INTO public.fechamento_area_snapshot (
    cliente_id, fazenda_id, ano_mes,
    area_total_ha, area_produtiva_ha, area_pecuaria_ha, area_agricultura_ha,
    area_reserva_ha, area_benfeitorias_ha, area_outras_ha,
    origem_area, versao, fechado_em, fechado_por, fechamento_p1_snapshot_id, schema_version)
  VALUES (
    s.cliente_id, s.fazenda_id, v_ano_mes_date,
    coalesce(v_total, coalesce(v_pec,0)+coalesce(v_agric,0)),
    v_prod, v_pec, v_agric, v_reserva, v_benf, v_outras,
    'fechamento_p1', 1, now(), v_uid, s.id, 1)
  ON CONFLICT (fazenda_id, ano_mes) DO UPDATE SET
    cliente_id                = EXCLUDED.cliente_id,
    area_total_ha             = EXCLUDED.area_total_ha,
    area_produtiva_ha         = EXCLUDED.area_produtiva_ha,
    area_pecuaria_ha          = EXCLUDED.area_pecuaria_ha,
    area_agricultura_ha       = EXCLUDED.area_agricultura_ha,
    area_reserva_ha           = EXCLUDED.area_reserva_ha,
    area_benfeitorias_ha      = EXCLUDED.area_benfeitorias_ha,
    area_outras_ha            = EXCLUDED.area_outras_ha,
    origem_area               = EXCLUDED.origem_area,
    fechamento_p1_snapshot_id = EXCLUDED.fechamento_p1_snapshot_id,
    schema_version            = 1,
    fechado_em                = now(),
    fechado_por               = EXCLUDED.fechado_por,
    versao                    = public.fechamento_area_snapshot.versao + 1
  RETURNING id INTO v_area_id;

  SELECT count(*)::int,
         count(*) FILTER (WHERE fechamento_pasto_id IS NULL)::int,
         count(*) FILTER (WHERE card_fechado=false)::int
    INTO v_membros, v_sem_card, v_nao_fechados
    FROM public.fechamento_pastos_membros WHERE snapshot_id=s.id;
  v_apto := (v_sem_card=0 AND v_nao_fechados=0);

  RETURN jsonb_build_object(
    'area_snapshot_id', v_area_id,
    'fechamento_p1_snapshot_id', s.id,
    'membros_count', v_membros,
    'membros_sem_card', v_sem_card,
    'membros_nao_fechados', v_nao_fechados,
    'apto_para_oficializacao', v_apto);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_gerar_area_de_snapshot(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_gerar_area_de_snapshot(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_gerar_area_de_snapshot(uuid) FROM authenticated;
COMMENT ON FUNCTION public.fn_gerar_area_de_snapshot(uuid) IS
  'INTERNA (sem grant). So o snapshot; deriva fazenda/cliente/ano_mes; autor auth.uid(); autorizacao multi-tenant. Adquire fn_lock_p1 e RE-valida vigencia sob lock antes do UPSERT (fecha corrida). Modelo 1 sobrescreve area do mes (versao++), NAO preserva historico de area (historico do conjunto fica no P0-B.1). Retorna diagnostico; NAO bloqueia por membro sem card — pendencia bloqueia OFICIALIZACAO no P0-B.3.';
