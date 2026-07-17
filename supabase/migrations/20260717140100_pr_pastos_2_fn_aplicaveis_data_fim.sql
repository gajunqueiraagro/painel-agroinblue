-- PR-PASTOS-VIGENCIA — Migração 2: fn_pastos_aplicaveis_mes + data_fim
--
-- CREATE OR REPLACE preservando assinatura, tipo de retorno, LANGUAGE/STABLE/
-- SECURITY DEFINER, search_path e grants da versao P0-B.1 (20260716130100).
-- Acrescenta o lado direito da vigencia; o resto do contrato e verbatim.
--
-- REGRA OFICIAL (intersecao mensal):
--   entra_conciliacao = true
--   tipo_uso IS DISTINCT FROM 'divergencia'
--   data_inicio IS NULL OR data_inicio <= ultimo dia do mes
--   data_fim    IS NULL OR data_fim    >= primeiro dia do mes
--
-- POR QUE `ativo` PERMANECE — e por que NAO e filtro historico soberano
-- --------------------------------------------------------------------
-- Apos a migracao 3, esta funcao rege APENAS meses sem conjunto materializado
-- (mes corrente/futuro). Mes com snapshot vigente passa a ser regido pelos
-- membros congelados, e nenhuma alteracao posterior em `pastos` — inclusive
-- `ativo` — o alcanca. Ou seja: `ativo` deixa de ter efeito retroativo, que era
-- exatamente o defeito.
-- Para o mes ainda nao congelado, `ativo` e o filtro de estado ATUAL correto:
-- um pasto desativado nao deve entrar num conjunto que ainda vai ser criado.
-- Remove-lo aqui incluiria pastos desativados no universo provisorio e mudaria
-- a contagem medida (63 na Faz. Sta. Rita) sem necessidade.
-- `data_fim` e o filtro temporal soberano; `ativo` e apenas o "nao descartado".

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
    AND p.tipo_uso IS DISTINCT FROM 'divergencia'
    AND (p.data_inicio IS NULL
         OR p.data_inicio <= (date_trunc('month', to_date(p_ano_mes,'YYYY-MM')) + interval '1 month - 1 day')::date)
    AND (p.data_fim IS NULL
         OR p.data_fim >= date_trunc('month', to_date(p_ano_mes,'YYYY-MM'))::date);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pastos_aplicaveis_mes(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_pastos_aplicaveis_mes(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_pastos_aplicaveis_mes(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_pastos_aplicaveis_mes(uuid, text) IS
  'Conjunto APLICAVEL ao mes por intersecao de vigencia: entra_conciliacao AND tipo_uso<>divergencia AND data_inicio<=ultimo dia AND data_fim>=primeiro dia. Deriva de pastos, nao de fechamento_pastos. Rege SOMENTE meses sem conjunto materializado — mes com snapshot vigente e regido pelos membros congelados (ver get_status_pilares_fechamento). `ativo` filtra estado atual do universo provisorio; o filtro temporal soberano e data_inicio/data_fim.';
