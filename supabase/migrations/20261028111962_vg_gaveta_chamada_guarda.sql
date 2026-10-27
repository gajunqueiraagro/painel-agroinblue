-- P119 — a fn_vg_gaveta de 15 argumentos com a GUARDA no proprio corpo (SEG-DRE-TENANT-01: a guarda de cliente nas migrations novas
-- olha a ULTIMA definicao SECURITY DEFINER de cada funcao; a INVOKER da 111961 nao a substitui para o detector, e a 111960 e' registro
-- historico). Volta a DEFINER, como era antes do P119, com tenant_ok + 42501 antes de chamar a fn_vg_gaveta_ordenada na ordem de sempre.
SET LOCAL lock_timeout = '2s';
CREATE OR REPLACE FUNCTION public.fn_vg_gaveta(
  p_cliente uuid, p_de date, p_ate date, p_mes text, p_lado text, p_caminho text[] DEFAULT '{}'::text[], p_criterio text DEFAULT 'mes'::text,
  p_contas uuid[] DEFAULT NULL::uuid[], p_fazendas uuid[] DEFAULT NULL::uuid[], p_atividade text DEFAULT NULL::text, p_hoje date DEFAULT CURRENT_DATE,
  p_status text[] DEFAULT NULL::text[], p_incluir_vencidos boolean DEFAULT true, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_vg_gaveta_ordenada(p_cliente, p_de, p_ate, p_mes, p_lado, p_caminho, p_criterio, p_contas, p_fazendas, p_atividade, p_hoje,
                                      p_status, p_incluir_vencidos, p_pagina, p_por_pagina, NULL, 'asc');
END $function$;
REVOKE ALL ON FUNCTION public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer) TO authenticated;
