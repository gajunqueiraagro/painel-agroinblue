
CREATE OR REPLACE FUNCTION public.auditar_integridade_classificacao(_cliente_id uuid)
  RETURNS TABLE (
    lancamento_id uuid,
    subcentro text,
    campo_divergente text,
    valor_lancamento text,
    valor_plano text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    l.id AS lancamento_id,
    l.subcentro,
    d.campo AS campo_divergente,
    d.val_lanc AS valor_lancamento,
    d.val_plano AS valor_plano
  FROM public.financeiro_lancamentos_v2 l
  INNER JOIN public.financeiro_plano_contas p
    ON p.cliente_id = l.cliente_id
    AND p.subcentro = l.subcentro
    AND p.tipo_operacao = l.tipo_operacao
    AND p.ativo = true
  CROSS JOIN LATERAL (
    VALUES
      ('macro_custo', l.macro_custo, p.macro_custo),
      ('grupo_custo', l.grupo_custo, p.grupo_custo),
      ('centro_custo', l.centro_custo, p.centro_custo),
      ('escopo_negocio', l.escopo_negocio, p.escopo_negocio)
  ) AS d(campo, val_lanc, val_plano)
  WHERE l.cliente_id = _cliente_id
    AND l.cancelado = false
    AND l.subcentro IS NOT NULL
    AND COALESCE(d.val_lanc, '') <> COALESCE(d.val_plano, '')
  ORDER BY l.subcentro, d.campo;
END;
$function$;
