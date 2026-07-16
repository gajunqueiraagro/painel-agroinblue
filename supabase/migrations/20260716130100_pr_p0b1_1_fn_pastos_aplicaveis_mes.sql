-- PR-P1-SNAPSHOT-CONJUNTO-P0B1 — Migração 1: fn_pastos_aplicaveis_mes
-- CAMADA TRANSITORIA. Conjunto APLICAVEL ao mes deriva de `pastos` (nao de
--   fechamento_pastos): ativo + entra_conciliacao + vigencia; exclui divergencia.
-- Sem grant a anon/PUBLIC; grant a authenticated.

CREATE OR REPLACE FUNCTION public.fn_pastos_aplicaveis_mes(
  p_fazenda_id uuid, p_ano_mes text)
RETURNS TABLE (
  pasto_id uuid, nome text, area_considerada_ha numeric,
  tipo_uso text, entra_conciliacao boolean, data_inicio date, ativo boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.nome,
         coalesce(p.area_produtiva_ha, p.area) AS area_considerada_ha,
         p.tipo_uso, p.entra_conciliacao, p.data_inicio, p.ativo
  FROM public.pastos p
  WHERE p.fazenda_id = p_fazenda_id
    AND p.ativo = true
    AND p.entra_conciliacao = true
    AND coalesce(p.tipo_uso,'') <> 'divergencia'
    AND (p.data_inicio IS NULL
         OR p.data_inicio <= (date_trunc('month', to_date(p_ano_mes,'YYYY-MM')) + interval '1 month - 1 day')::date);
$$;
REVOKE EXECUTE ON FUNCTION public.fn_pastos_aplicaveis_mes(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_pastos_aplicaveis_mes(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_pastos_aplicaveis_mes(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.fn_pastos_aplicaveis_mes(uuid, text) IS
  'CAMADA TRANSITORIA. Conjunto APLICAVEL ao mes (deriva de pastos: ativo + entra_conciliacao + vigencia; exclui divergencia). NAO deriva de fechamento_pastos. Substituivel por pasto_versoes futuramente.';
