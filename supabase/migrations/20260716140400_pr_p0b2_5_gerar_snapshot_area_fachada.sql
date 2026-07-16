-- PR-P1-SNAPSHOT-AREA-P0B2 — Migração 5: gerar_snapshot_area (FACHADA compativel)
-- Comando de alto nivel: "garantir conjunto vigente -> gerar area vinculada a ele".
--   Opcao 1 (auto-materializa): reutiliza o snapshot vigente se existir; senao chama
--   fn_materializar_conjunto_mes e revalida vigencia. NAO oficializa; NAO mascara
--   pendencia (aplicavel sem card segue como pendencia no diagnostico interno). NAO
--   ha caminho legado. Mantem todas as validacoes (auth/competencia/autoria/tenant).
--   Mesmo fn_lock_p1 de materializacao/geracao/A8A; reaquisicao reentrante na txn.

CREATE OR REPLACE FUNCTION public.gerar_snapshot_area(
  p_fazenda_id uuid, p_ano_mes date, p_fechado_por uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente_id uuid;
  v_ano_mes_txt text;
  v_snap uuid;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado';
  END IF;
  IF p_ano_mes IS NULL
     OR p_ano_mes <> date_trunc('month', p_ano_mes)::date THEN
    RAISE EXCEPTION USING ERRCODE='22007',
      MESSAGE='competencia_invalida: p_ano_mes deve ser o primeiro dia da competencia (YYYY-MM-01)';
  END IF;
  IF p_fechado_por IS NOT NULL AND p_fechado_por <> v_uid THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='autoria_invalida: p_fechado_por deve ser igual a auth.uid()';
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

  PERFORM public.fn_lock_p1(p_fazenda_id, v_ano_mes_txt);

  SELECT s.id INTO v_snap
    FROM public.fechamento_p1_snapshot s
    JOIN public.fechamento_p1 p ON p.id = s.fechamento_p1_id
   WHERE p.fazenda_id = p_fazenda_id
     AND p.ano_mes = v_ano_mes_txt
     AND s.status = 'vigente'::public.snapshot_status;

  IF v_snap IS NULL THEN
    v_res := public.fn_materializar_conjunto_mes(
      p_fazenda_id,
      v_ano_mes_txt
    );

    v_snap := NULLIF(v_res->>'snapshot_id', '')::uuid;

    IF v_snap IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'materializacao_sem_snapshot: fn_materializar_conjunto_mes nao retornou snapshot_id';
    END IF;

    SELECT s.id INTO v_snap
      FROM public.fechamento_p1_snapshot s
     WHERE s.id = v_snap
       AND s.fazenda_id = p_fazenda_id
       AND s.ano_mes = v_ano_mes_txt
       AND s.status = 'vigente'::public.snapshot_status;

    IF v_snap IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'materializacao_nao_vigente: snapshot criado nao permaneceu vigente';
    END IF;
  END IF;

  v_res := public.fn_gerar_area_de_snapshot(v_snap);
  RETURN (v_res->>'area_snapshot_id')::uuid;
END $$;
REVOKE EXECUTE ON FUNCTION public.gerar_snapshot_area(uuid, date, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gerar_snapshot_area(uuid, date, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.gerar_snapshot_area(uuid, date, uuid) TO authenticated;
