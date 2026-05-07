-- fix: fn_zoot_cache_rebuild chamava overload (uuid, integer, integer) com mes=NULL
-- WHERE mes = NULL nunca casa em SQL — DELETE e INSERT retornavam zero linhas
-- Corrigido para chamar overload anual (uuid, integer) sem terceiro argumento

CREATE OR REPLACE FUNCTION public.fn_zoot_cache_rebuild(
  p_cliente_id uuid,
  p_ano integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fazenda record;
BEGIN
  FOR v_fazenda IN
    SELECT id FROM public.fazendas WHERE cliente_id = p_cliente_id
  LOOP
    PERFORM public.refresh_zoot_cache(v_fazenda.id, p_ano);
  END LOOP;
END;
$$;
