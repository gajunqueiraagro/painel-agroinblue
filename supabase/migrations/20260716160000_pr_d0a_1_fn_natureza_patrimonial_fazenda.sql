-- PR-D0A-CONTRATOS-LEITURA — Migração 1: fn_natureza_patrimonial_fazenda
-- Fonte canonica unica tipo_uso->natureza (reproduz classificacaoArea.ts).
-- GATE DE NATUREZA (pre-freeze) confirmou: valores reais de pastos.tipo_uso =
--   {divergencia, engorda, recria, pecuaria}. Todos mapeados exceto 'pecuaria'
--   (LEGADO_D1, 3 ocorrencias: Arrendamento/P_24/P_25) -> NULL por paridade.

CREATE OR REPLACE FUNCTION public.fn_natureza_patrimonial_fazenda(p_fazenda_id uuid)
RETURNS TABLE (pasto_id uuid, natureza_patrimonial text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_cli uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado'; END IF;
  SELECT cliente_id INTO v_cli FROM public.fazendas WHERE id=p_fazenda_id;
  IF v_cli IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='fazenda_inexistente'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid)
    OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id) WHERE t.cliente_id=v_cli)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao'; END IF;
  RETURN QUERY
    SELECT p.id,
      CASE
        WHEN coalesce(p.tipo_uso,'') IN ('cria','recria','engorda','vedado','reforma_pecuaria') THEN 'pecuaria_produtiva'
        WHEN coalesce(p.tipo_uso,'') = 'agricultura' THEN 'agricultura_produtiva'
        WHEN coalesce(p.tipo_uso,'') IN ('reserva','reserva_legal') THEN 'reserva_legal'
        WHEN coalesce(p.tipo_uso,'') = 'app' THEN 'app'
        WHEN coalesce(p.tipo_uso,'') = 'benfeitorias' THEN 'benfeitoria'
        WHEN coalesce(p.tipo_uso,'') = 'divergencia' THEN NULL   -- ajuste: sem natureza territorial
        -- LEGADO_D1: 'pecuaria' cai aqui -> NULL (paridade deliberada; reclassificar no D.1)
        ELSE NULL
      END::text
    FROM public.pastos p WHERE p.fazenda_id=p_fazenda_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_natureza_patrimonial_fazenda(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_natureza_patrimonial_fazenda(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_natureza_patrimonial_fazenda(uuid) TO authenticated;
COMMENT ON FUNCTION public.fn_natureza_patrimonial_fazenda(uuid) IS
  'FONTE CANONICA UNICA tipo_uso->natureza (D.0A, reproduz classificacaoArea.ts). LEGADO_D1: tipo_uso=pecuaria -> NULL por paridade; reclassificar no D.1. No D.1 le pastos.natureza_patrimonial sem mudar assinatura.';