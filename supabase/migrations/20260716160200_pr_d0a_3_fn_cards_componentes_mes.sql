-- PR-D0A-CONTRATOS-LEITURA — Migração 3: fn_cards_componentes_mes
-- Cards fechados do mes com agregados. peso_total_kg numeric INTEGRAL (sem round);
--   possui_itens = EXISTS (nao count>0). natureza vem da fonte canonica (LEFT JOIN).

CREATE OR REPLACE FUNCTION public.fn_cards_componentes_mes(p_fazenda_id uuid, p_ano_mes text)
RETURNS TABLE (
  cliente_id uuid, fazenda_id uuid, ano_mes text,
  fechamento_pasto_id uuid, pasto_id uuid, nome_exibicao text,
  status text, quantidade_total integer, peso_total_kg numeric,
  possui_itens boolean, tipo_uso_mes text,
  uso_operacional text, uso_operacional_origem text,
  tipo_entidade text, natureza_patrimonial text, eh_ajuste boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_cli uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado'; END IF;
  IF p_ano_mes IS NULL OR p_ano_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='competencia_invalida: YYYY-MM'; END IF;
  SELECT cliente_id INTO v_cli FROM public.fazendas WHERE id=p_fazenda_id;
  IF v_cli IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='fazenda_inexistente'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid)
    OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id) WHERE t.cliente_id=v_cli)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao'; END IF;
  RETURN QUERY
    SELECT v_cli, p_fazenda_id, p_ano_mes,
      fp.id, fp.pasto_id, p.nome, fp.status,
      coalesce(agg.qtd,0)::integer,
      coalesce(agg.peso,0)::numeric,                 -- numeric INTEGRAL, sem round
      EXISTS (SELECT 1 FROM public.fechamento_pasto_itens i WHERE i.fechamento_id=fp.id),
      fp.tipo_uso_mes, fp.tipo_uso_mes, NULL::text,
      CASE WHEN coalesce(p.tipo_uso,'')='divergencia' THEN 'ajuste_conciliacao' ELSE 'local_fisico' END::text,
      nat.natureza_patrimonial,
      (coalesce(p.tipo_uso,'')='divergencia')
    FROM public.fechamento_pastos fp
    JOIN public.pastos p ON p.id=fp.pasto_id
    LEFT JOIN LATERAL (
      SELECT sum(i.quantidade)::integer qtd, sum(i.peso_total)::numeric peso
      FROM public.fechamento_pasto_itens i WHERE i.fechamento_id=fp.id
    ) agg ON true
    LEFT JOIN public.fn_natureza_patrimonial_fazenda(p_fazenda_id) nat ON nat.pasto_id=fp.pasto_id
    WHERE fp.fazenda_id=p_fazenda_id AND fp.ano_mes=p_ano_mes AND fp.status='fechado';
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_cards_componentes_mes(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cards_componentes_mes(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_cards_componentes_mes(uuid, text) TO authenticated;