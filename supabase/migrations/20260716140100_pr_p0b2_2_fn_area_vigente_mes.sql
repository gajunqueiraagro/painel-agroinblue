-- PR-P1-SNAPSHOT-AREA-P0B2 — Migração 2: fn_area_vigente_mes (leitura soberana da area)
-- PRECEDENCIA RIGIDA: existe fechamento_p1 -> so area vinculada a snapshot vigente
--   (invalidado -> vazio; nunca legado); senao fallback legado. Competencia dia-1.

CREATE OR REPLACE FUNCTION public.fn_area_vigente_mes(
  p_fazenda_id uuid, p_ano_mes date)
RETURNS SETOF public.fechamento_area_snapshot
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente_id uuid;
  v_ano_mes_txt text;
  v_tem_p1 boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado';
  END IF;
  IF p_ano_mes IS NULL
     OR p_ano_mes <> date_trunc('month', p_ano_mes)::date THEN
    RAISE EXCEPTION USING ERRCODE='22007',
      MESSAGE='competencia_invalida: p_ano_mes deve ser o primeiro dia da competencia (YYYY-MM-01)';
  END IF;

  v_ano_mes_txt := to_char(p_ano_mes, 'YYYY-MM');

  SELECT cliente_id INTO v_cliente_id FROM public.fazendas WHERE id=p_fazenda_id;
  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='fazenda_inexistente';
  END IF;
  IF NOT (public.is_admin_agroinblue(v_uid)
    OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id) WHERE t.cliente_id=v_cliente_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.fechamento_p1
                  WHERE fazenda_id=p_fazenda_id AND ano_mes=v_ano_mes_txt) INTO v_tem_p1;

  IF v_tem_p1 THEN
    RETURN QUERY
      SELECT a.* FROM public.fechamento_area_snapshot a
        JOIN public.fechamento_p1_snapshot s ON s.id=a.fechamento_p1_snapshot_id
       WHERE a.fazenda_id=p_fazenda_id AND a.ano_mes=p_ano_mes
         AND s.status='vigente'::public.snapshot_status
         AND s.fazenda_id=a.fazenda_id AND s.ano_mes=v_ano_mes_txt;
  ELSE
    RETURN QUERY
      SELECT a.* FROM public.fechamento_area_snapshot a
       WHERE a.fazenda_id=p_fazenda_id AND a.ano_mes=p_ano_mes;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_area_vigente_mes(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_area_vigente_mes(uuid, date) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_area_vigente_mes(uuid, date) TO authenticated;
COMMENT ON FUNCTION public.fn_area_vigente_mes(uuid, date) IS
  'Leitura SOBERANA da area vigente. Autorizacao multi-tenant explicita. PRECEDENCIA RIGIDA: existe fechamento_p1 -> so area vinculada a snapshot vigente (invalidado->vazio; nunca legado); senao fallback legado. Competencia deve ser dia-1 (22007), NULL rejeitado.';
