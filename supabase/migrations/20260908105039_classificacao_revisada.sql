-- 20260908105039 classificacao_revisada (aplicada no proto via Management API em 08/09/2026)

ALTER TABLE public.financeiro_classificacao_staging ADD COLUMN IF NOT EXISTS revisado_em timestamptz;
ALTER TABLE public.financeiro_classificacao_staging ADD COLUMN IF NOT EXISTS revisado_por uuid;
CREATE OR REPLACE FUNCTION public.fn_classificacao_marcar_revisada(p_staging_id uuid, p_revisada boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE v_uid uuid; v_cli uuid;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  SELECT cliente_id INTO v_cli FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF v_cli IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='linha nao encontrada'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_cli IN (SELECT public.get_user_cliente_ids(v_uid))) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente'; END IF;
  UPDATE financeiro_classificacao_staging SET revisado_em = CASE WHEN p_revisada THEN now() ELSE NULL END, revisado_por = CASE WHEN p_revisada THEN v_uid ELSE NULL END WHERE staging_id = p_staging_id;
  RETURN jsonb_build_object('ok', true, 'staging_id', p_staging_id, 'revisada', p_revisada);
END; $fn$;
REVOKE ALL ON FUNCTION public.fn_classificacao_marcar_revisada(uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_marcar_revisada(uuid,boolean) TO authenticated;

