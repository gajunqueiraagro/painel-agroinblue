-- PR-D0A-CONTRATOS-LEITURA — Migração 6: fn_locais_sugeridos_mes
-- Locais sugeridos para o fechamento (reproduz fn_pastos_aplicaveis_mes atual):
--   ativos, entra_conciliacao, nao-divergencia, vigentes na competencia.
--   sugerir_no_fechamento = entra_conciliacao (nome estavel desde ja).

CREATE OR REPLACE FUNCTION public.fn_locais_sugeridos_mes(p_fazenda_id uuid, p_ano_mes text)
RETURNS TABLE (
  cliente_id uuid, fazenda_id uuid, ano_mes text,
  pasto_id uuid, nome_exibicao text, tipo_uso text,
  entra_conciliacao boolean, data_inicio date,
  natureza_patrimonial text, sugerir_no_fechamento boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_cli uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado'; END IF;
  IF p_ano_mes IS NULL OR p_ano_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='competencia_invalida: YYYY-MM'; END IF;
  SELECT f.cliente_id INTO v_cli FROM public.fazendas AS f WHERE f.id=p_fazenda_id;  -- qualificado: evita colisao com coluna OUT cliente_id
  IF v_cli IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='fazenda_inexistente'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid)
    OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id) WHERE t.cliente_id=v_cli)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao'; END IF;
  RETURN QUERY
    SELECT v_cli, p_fazenda_id, p_ano_mes, p.id, p.nome, p.tipo_uso,
      p.entra_conciliacao, p.data_inicio,
      nat.natureza_patrimonial,
      p.entra_conciliacao   -- sugerir_no_fechamento = entra_conciliacao (nome estável desde já)
    FROM public.pastos p
    LEFT JOIN public.fn_natureza_patrimonial_fazenda(p_fazenda_id) nat ON nat.pasto_id=p.id
    WHERE p.fazenda_id=p_fazenda_id
      AND p.ativo=true AND p.entra_conciliacao=true
      AND coalesce(p.tipo_uso,'')<>'divergencia'
      AND (p.data_inicio IS NULL
           OR p.data_inicio <= (date_trunc('month', to_date(p_ano_mes,'YYYY-MM')) + interval '1 month - 1 day')::date);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_locais_sugeridos_mes(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_locais_sugeridos_mes(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_locais_sugeridos_mes(uuid, text) TO authenticated;