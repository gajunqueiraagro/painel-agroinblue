-- PR-P1-SNAPSHOT-CONJUNTO-P0B1 — Migração 4: fn_materializar_conjunto_mes
-- Materializa o conjunto aplicavel do mes num snapshot vigente + membros congelados.
--   Ordem: substituir-antes-de-inserir (anterior -> substituido; novo -> vigente).
--   NUNCA deleta membros/snapshot (historico preservado). Serializa por fn_lock_p1.
-- SECURITY DEFINER, search_path=public, guard auth.uid()+membership. Sem anon/PUBLIC.

CREATE OR REPLACE FUNCTION public.fn_materializar_conjunto_mes(
  p_fazenda_id uuid, p_ano_mes text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente_id uuid;
  v_p1_id uuid;
  v_snapshot_id uuid;
  v_anterior uuid;
  v_membros int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nao_autenticado' USING ERRCODE='42501'; END IF;
  SELECT cliente_id INTO v_cliente_id FROM public.fazendas WHERE id=p_fazenda_id;
  IF v_cliente_id IS NULL THEN RAISE EXCEPTION 'fazenda_inexistente' USING ERRCODE='P0002'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid)
    OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id) WHERE t.cliente_id=v_cliente_id)) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE='42501';
  END IF;

  PERFORM public.fn_lock_p1(p_fazenda_id, p_ano_mes);

  INSERT INTO public.fechamento_p1 (fazenda_id, cliente_id, ano_mes, status, origem_legado, versao)
  VALUES (p_fazenda_id, v_cliente_id, p_ano_mes, 'aberto', false, 1)
  ON CONFLICT (fazenda_id, ano_mes) DO NOTHING;
  SELECT id INTO v_p1_id FROM public.fechamento_p1 WHERE fazenda_id=p_fazenda_id AND ano_mes=p_ano_mes;

  SELECT id INTO v_anterior FROM public.fechamento_p1_snapshot
   WHERE fechamento_p1_id=v_p1_id AND status='vigente'::public.snapshot_status;

  IF v_anterior IS NOT NULL THEN
    UPDATE public.fechamento_p1_snapshot SET status='substituido'::public.snapshot_status WHERE id=v_anterior;
  END IF;

  INSERT INTO public.fechamento_p1_snapshot
    (fechamento_p1_id, fazenda_id, cliente_id, ano_mes, status, schema_version, created_by, substitui_snapshot_id)
  VALUES (v_p1_id, p_fazenda_id, v_cliente_id, p_ano_mes, 'vigente'::public.snapshot_status, 1, v_uid, v_anterior)
  RETURNING id INTO v_snapshot_id;

  IF v_anterior IS NOT NULL THEN
    UPDATE public.fechamento_p1_snapshot SET substituido_por=v_snapshot_id WHERE id=v_anterior;
  END IF;

  INSERT INTO public.fechamento_pastos_membros (
    snapshot_id, fechamento_p1_id, fazenda_id, cliente_id, ano_mes, pasto_id,
    fechamento_pasto_id, nome_exibicao, area_considerada_ha, tipo_uso, entra_conciliacao,
    data_inicio_congelada, ativo_congelado, card_fechado, vazio_confirmado,
    quantidade_total, peso_total_congelado, congelado_em, congelado_por)
  SELECT
    v_snapshot_id, v_p1_id, p_fazenda_id, v_cliente_id, p_ano_mes, a.pasto_id,
    fp.id, a.nome, a.area_considerada_ha, a.tipo_uso, a.entra_conciliacao,
    a.data_inicio, a.ativo,
    coalesce(fp.id IS NOT NULL AND fp.status='fechado', false),
    coalesce(fp.id IS NOT NULL AND fp.status='fechado' AND coalesce(it.qtd,0)=0, false),
    coalesce(it.qtd,0), coalesce(it.peso,0),
    now(), v_uid
  FROM public.fn_pastos_aplicaveis_mes(p_fazenda_id, p_ano_mes) a
  LEFT JOIN LATERAL (
    SELECT fpa.id, fpa.status FROM public.fechamento_pastos fpa
    WHERE fpa.fazenda_id=p_fazenda_id AND fpa.ano_mes=p_ano_mes AND fpa.pasto_id=a.pasto_id
    ORDER BY (fpa.status='fechado') DESC, fpa.updated_at DESC NULLS LAST, fpa.created_at DESC
    LIMIT 1
  ) fp ON true
  LEFT JOIN LATERAL (
    SELECT sum(i.quantidade)::integer AS qtd, sum(i.peso_total)::numeric AS peso
    FROM public.fechamento_pasto_itens i WHERE i.fechamento_id = fp.id
  ) it ON true;
  GET DIAGNOSTICS v_membros = ROW_COUNT;

  UPDATE public.fechamento_p1_snapshot SET membros_count=v_membros WHERE id=v_snapshot_id;

  RETURN jsonb_build_object(
    'fechamento_p1_id', v_p1_id,
    'snapshot_id', v_snapshot_id,
    'snapshot_anterior', v_anterior,
    'membros', v_membros
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_materializar_conjunto_mes(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_materializar_conjunto_mes(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_materializar_conjunto_mes(uuid, text) TO authenticated;
