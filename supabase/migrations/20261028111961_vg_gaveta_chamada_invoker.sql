-- P119 — a fn_vg_gaveta de 15 argumentos (a chamada da fn_vg_gaveta_ordenada na ordem de sempre, 111960) nasceu SECURITY DEFINER sem
-- guarda propria no texto: a guarda (tenant_ok + 42501) e' a da ordenada, que ela chama. Como chamada, ela nao precisa atravessar a RLS:
-- vira SECURITY INVOKER (quem chama precisa do EXECUTE da ordenada — `authenticated` tem; anon/public nao tem nenhuma das duas) e a
-- guarda continua UMA, na ordenada. SEG-DRE-TENANT-01: a ultima definicao e' a que vale (a 111960 e' registro historico, nao se reescreve).
SET LOCAL lock_timeout = '2s';
CREATE OR REPLACE FUNCTION public.fn_vg_gaveta(
  p_cliente uuid, p_de date, p_ate date, p_mes text, p_lado text, p_caminho text[] DEFAULT '{}'::text[], p_criterio text DEFAULT 'mes'::text,
  p_contas uuid[] DEFAULT NULL::uuid[], p_fazendas uuid[] DEFAULT NULL::uuid[], p_atividade text DEFAULT NULL::text, p_hoje date DEFAULT CURRENT_DATE,
  p_status text[] DEFAULT NULL::text[], p_incluir_vencidos boolean DEFAULT true, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 500)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT public.fn_vg_gaveta_ordenada(p_cliente, p_de, p_ate, p_mes, p_lado, p_caminho, p_criterio, p_contas, p_fazendas, p_atividade, p_hoje,
                                      p_status, p_incluir_vencidos, p_pagina, p_por_pagina, NULL, 'asc')
$function$;
REVOKE ALL ON FUNCTION public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer) TO authenticated;
