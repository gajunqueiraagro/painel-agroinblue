-- PR-M9-AJUSTES-SUGERIDOS — fn_ajustes_sugeridos_mes (addendum aos contratos D.0A)
-- Sugere ajustes de conciliacao (Divergencia do Campeiro) aptos e SEM card no mes.
-- Complemento DISJUNTO de fn_locais_sugeridos_mes (que exclui tipo_uso='divergencia').
-- Funcao NOVA -> CREATE OR REPLACE seguro (sem mudanca de RETURNS TABLE preexistente).
-- Corpo qualificado (public.fazendas AS f) para evitar colisao com coluna OUT cliente_id (42702).
-- Read-only sobre dados; independe da deduplicacao DUP (NOT EXISTS por fazenda+pasto+ano_mes).

CREATE OR REPLACE FUNCTION public.fn_ajustes_sugeridos_mes(
  p_fazenda_id uuid,
  p_ano_mes text
)
RETURNS TABLE (
  cliente_id uuid,
  fazenda_id uuid,
  ano_mes text,
  pasto_id uuid,
  nome_exibicao text,
  tipo_uso text,
  entra_conciliacao boolean,
  data_inicio date,
  tipo_entidade text,
  eh_ajuste boolean,
  natureza_patrimonial text,
  sugerir_no_fechamento boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cli uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'nao_autenticado';
  END IF;
  IF p_ano_mes IS NULL
     OR p_ano_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22007',
      MESSAGE = 'competencia_invalida: YYYY-MM';
  END IF;
  SELECT f.cliente_id
    INTO v_cli
    FROM public.fazendas AS f
   WHERE f.id = p_fazenda_id;
  IF v_cli IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'fazenda_inexistente';
  END IF;
  IF NOT (
    public.is_admin_agroinblue(v_uid)
    OR EXISTS (
      SELECT 1
        FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id)
       WHERE t.cliente_id = v_cli
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'sem_permissao';
  END IF;
  RETURN QUERY
  SELECT
    v_cli,
    p_fazenda_id,
    p_ano_mes,
    p.id,
    p.nome,
    p.tipo_uso,
    p.entra_conciliacao,
    p.data_inicio,
    'ajuste_conciliacao'::text,
    true,
    NULL::text,
    p.entra_conciliacao
  FROM public.pastos AS p
  WHERE p.fazenda_id = p_fazenda_id
    AND coalesce(p.tipo_uso, '') = 'divergencia'
    AND p.ativo = true
    AND p.entra_conciliacao = true
    AND (
      p.data_inicio IS NULL
      OR p.data_inicio <= (
        date_trunc('month', to_date(p_ano_mes, 'YYYY-MM'))
        + interval '1 month - 1 day'
      )::date
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.fechamento_pastos AS fp
      WHERE fp.fazenda_id = p_fazenda_id
        AND fp.pasto_id = p.id
        AND fp.ano_mes = p_ano_mes
    );
END;
$$;
REVOKE EXECUTE
ON FUNCTION public.fn_ajustes_sugeridos_mes(uuid, text)
FROM PUBLIC;
REVOKE EXECUTE
ON FUNCTION public.fn_ajustes_sugeridos_mes(uuid, text)
FROM anon;
GRANT EXECUTE
ON FUNCTION public.fn_ajustes_sugeridos_mes(uuid, text)
TO authenticated;
COMMENT ON FUNCTION public.fn_ajustes_sugeridos_mes(uuid, text) IS
  'M9: sugere ajustes de conciliacao aptos e SEM card no mes. Complemento disjunto de fn_locais_sugeridos_mes. NOT EXISTS por fazenda+pasto+ano_mes. tipo_entidade=ajuste_conciliacao, eh_ajuste=true, natureza=NULL e sugerir_no_fechamento=entra_conciliacao.';
