-- PR-D0A-CONTRATOS-LEITURA — Addendum M8: envelope completo de fn_pendencias_fechamento_mes
-- Amplia o RETURNS TABLE (8 -> 13 colunas) para expor a classificacao soberana (uso_operacional,
--   uso_operacional_origem, tipo_entidade, natureza_patrimonial, eh_ajuste), simetrica aos
--   envelopes de fn_cards_componentes_mes / fn_composicao. Necessario para o D.0B-i unir e
--   ordenar cards existentes (inclusive pendencias de Divergencia do Campeiro, eh_ajuste=true)
--   sem reconstruir classificacao no frontend.
-- Ampliar o tipo de retorno exige DROP + CREATE (CREATE OR REPLACE nao altera RETURNS TABLE).
--   Gate de dependencia (pre-M8): 0 dependentes no catalogo, 0 consumidores no frontend.
-- Corpo qualificado (public.fazendas AS f) desde ja (evita a ambiguidade cliente_id de M3/M4).

DROP FUNCTION public.fn_pendencias_fechamento_mes(uuid, text);

CREATE FUNCTION public.fn_pendencias_fechamento_mes(p_fazenda_id uuid, p_ano_mes text)
RETURNS TABLE (
  cliente_id uuid, fazenda_id uuid, ano_mes text,
  fechamento_pasto_id uuid, pasto_id uuid, nome_exibicao text, status text, tipo_uso_mes text,
  -- envelope completo (simetrico a fn_cards_componentes_mes):
  uso_operacional text, uso_operacional_origem text,
  tipo_entidade text, natureza_patrimonial text, eh_ajuste boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_cli uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado'; END IF;
  IF p_ano_mes IS NULL OR p_ano_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='competencia_invalida: YYYY-MM'; END IF;
  SELECT f.cliente_id INTO v_cli FROM public.fazendas AS f WHERE f.id=p_fazenda_id;  -- qualificado: evita colisao com coluna OUT cliente_id
  IF v_cli IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='fazenda_inexistente'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid)
    OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id) WHERE t.cliente_id=v_cli)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao'; END IF;
  RETURN QUERY
    SELECT v_cli, p_fazenda_id, p_ano_mes,
      fp.id, fp.pasto_id, p.nome, fp.status, fp.tipo_uso_mes,
      fp.tipo_uso_mes::text AS uso_operacional,
      NULL::text AS uso_operacional_origem,
      CASE WHEN coalesce(p.tipo_uso,'')='divergencia' THEN 'ajuste_conciliacao' ELSE 'local_fisico' END::text AS tipo_entidade,
      nat.natureza_patrimonial,
      (coalesce(p.tipo_uso,'')='divergencia') AS eh_ajuste
    FROM public.fechamento_pastos fp
    JOIN public.pastos p ON p.id=fp.pasto_id
    LEFT JOIN public.fn_natureza_patrimonial_fazenda(p_fazenda_id) nat ON nat.pasto_id=fp.pasto_id
    WHERE fp.fazenda_id=p_fazenda_id AND fp.ano_mes=p_ano_mes AND fp.status IN ('rascunho','aberto');
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_pendencias_fechamento_mes(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_pendencias_fechamento_mes(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_pendencias_fechamento_mes(uuid, text) TO authenticated;