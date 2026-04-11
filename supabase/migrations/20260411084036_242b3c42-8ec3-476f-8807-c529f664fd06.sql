CREATE OR REPLACE FUNCTION public.get_anos_financeiro_v2(p_cliente_id uuid)
RETURNS TABLE(ano int) 
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT CAST(substring(ano_mes from 1 for 4) AS int) AS ano
  FROM financeiro_lancamentos_v2
  WHERE cliente_id = p_cliente_id
    AND status_transacao IS DISTINCT FROM 'cancelado'
  ORDER BY ano;
$$;