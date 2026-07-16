-- ROLLBACK R8 (Addendum M8 — envelope completo de fn_pendencias_fechamento_mes).
-- NAO destrutivo: dropa a funcao com envelope ampliado (13 col) e RECRIA literalmente a versao
--   anterior de M5 (8 colunas, ja qualificada por f.cliente_id). Restaura SECDEF, search_path
--   e grants. NUNCA reabre anon/PUBLIC. Rodar APENAS se algum consumidor do envelope ampliado
--   nao existir; nao deixar a funcao ausente.
DROP FUNCTION public.fn_pendencias_fechamento_mes(uuid, text);

CREATE FUNCTION public.fn_pendencias_fechamento_mes(p_fazenda_id uuid, p_ano_mes text)
RETURNS TABLE (
  cliente_id uuid, fazenda_id uuid, ano_mes text,
  fechamento_pasto_id uuid, pasto_id uuid, nome_exibicao text, status text, tipo_uso_mes text)
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
    SELECT v_cli, p_fazenda_id, p_ano_mes, fp.id, fp.pasto_id, p.nome, fp.status, fp.tipo_uso_mes
    FROM public.fechamento_pastos fp JOIN public.pastos p ON p.id=fp.pasto_id
    WHERE fp.fazenda_id=p_fazenda_id AND fp.ano_mes=p_ano_mes AND fp.status IN ('rascunho','aberto');
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_pendencias_fechamento_mes(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_pendencias_fechamento_mes(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_pendencias_fechamento_mes(uuid, text) TO authenticated;