-- FECH-PASTO-SALVAR-TRANSACAO-01 parte 1 (Gabriel 16/10/2026) — o card do pasto tem dois escritores, no banco, cada um numa transacao:
--   fn_fechamento_pasto_salvar(card, campos, itens): os campos do mes (lote, atividade, qualidade, observacao) + a troca dos itens,
--     preservando a marca `peso_atualizado`; qualquer recusa desfaz tudo (antes eram tres idas soltas: UPDATE, DELETE, INSERT).
--   fn_fechamento_pasto_reabrir(card, motivo): so' aquele card volta a rascunho e a reabertura vai para `fechamento_reaberturas_log`
--     na mesma transacao (antes o modal so' trocava o status, sem trilha).
-- As duas: SECURITY DEFINER com a guarda de cliente pelo card (`_fn_exigir_tenant_das_linhas`), card FECHADO nao se altera (salvar) /
-- so' card FECHADO se reabre (reabrir), e mes com Valor do Rebanho validado ou P2 fechado recusa com a MESMA frase de
-- `guard_fechamento_pastos_snapshot`. A regra do P2 tem UM dono aqui, `_fn_fechamento_p2_travado`, espelho declarado das duas guardas.
-- O nome do pasto NAO entra (e' do cadastro: `editarPasto`).
-- Antes: nenhuma funcao existente muda (so' nascem tres). A trava P2 em INSERT/DELETE dos itens e' a parte 2 (20261027199500).
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public._fn_fechamento_p2_travado(p_fazenda_id uuid, p_ano_mes text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM public.valor_rebanho_realizado_validado
                  WHERE fazenda_id = p_fazenda_id AND ano_mes = p_ano_mes AND status = 'validado')
      OR EXISTS (SELECT 1 FROM public.valor_rebanho_fechamento
                  WHERE fazenda_id = p_fazenda_id AND ano_mes = p_ano_mes AND status = 'fechado');
$f$;
REVOKE ALL ON FUNCTION public._fn_fechamento_p2_travado(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_fechamento_p2_travado(uuid, text) TO service_role;

CREATE FUNCTION public.fn_fechamento_pasto_salvar(p_fechamento_id uuid, p_campos jsonb, p_itens jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_fp public.fechamento_pastos%ROWTYPE;
  v_marcas jsonb;
  v_n integer;
BEGIN
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(
    SELECT f.cliente_id FROM public.fechamento_pastos fp JOIN public.fazendas f ON f.id = fp.fazenda_id WHERE fp.id = p_fechamento_id)]);
  SELECT * INTO v_fp FROM public.fechamento_pastos WHERE id = p_fechamento_id FOR UPDATE;
  IF v_fp.status = 'fechado' THEN
    RAISE EXCEPTION 'O pasto está fechado neste mês. Reabra o pasto antes de alterar.' USING ERRCODE = 'P0001';
  END IF;
  IF public._fn_fechamento_p2_travado(v_fp.fazenda_id, v_fp.ano_mes) THEN
    RAISE EXCEPTION 'Mês % possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar pastos.', v_fp.ano_mes
      USING ERRCODE = 'P0001';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'Itens do pasto em formato inválido.' USING ERRCODE = '22023';
  END IF;

  /* os campos do mes: so' os que vierem (a chave ausente mantem o gravado), vazio = nulo — o que `atualizarCamposMensais` fazia */
  UPDATE public.fechamento_pastos SET
    lote_mes       = CASE WHEN p_campos ? 'lote_mes'       THEN NULLIF(p_campos->>'lote_mes', '')               ELSE lote_mes END,
    tipo_uso_mes   = CASE WHEN p_campos ? 'tipo_uso_mes'   THEN NULLIF(p_campos->>'tipo_uso_mes', '')           ELSE tipo_uso_mes END,
    qualidade_mes  = CASE WHEN p_campos ? 'qualidade_mes'  THEN NULLIF(p_campos->>'qualidade_mes', '')::numeric ELSE qualidade_mes END,
    observacao_mes = CASE WHEN p_campos ? 'observacao_mes' THEN NULLIF(p_campos->>'observacao_mes', '')         ELSE observacao_mes END
  WHERE id = p_fechamento_id;

  /* os itens: a marca de peso de cada categoria e' lida ANTES de apagar e volta na linha nova (o que `salvarItens` fazia) */
  SELECT COALESCE(jsonb_object_agg(categoria_id::text, peso_atualizado), '{}'::jsonb) INTO v_marcas
    FROM public.fechamento_pasto_itens WHERE fechamento_id = p_fechamento_id;
  DELETE FROM public.fechamento_pasto_itens WHERE fechamento_id = p_fechamento_id;
  INSERT INTO public.fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_medio_kg, lote, observacoes, origem_dado, peso_atualizado)
  SELECT p_fechamento_id, (e->>'categoria_id')::uuid, (e->>'quantidade')::integer, NULLIF(e->>'peso_medio_kg', '')::numeric,
         NULLIF(e->>'lote', ''), NULLIF(e->>'observacoes', ''), COALESCE(NULLIF(e->>'origem_dado', ''), 'manual'),
         COALESCE((e->>'peso_atualizado')::boolean, (v_marcas->>(e->>'categoria_id'))::boolean, false)
    FROM jsonb_array_elements(p_itens) e
   WHERE COALESCE((e->>'quantidade')::integer, 0) > 0;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'fechamento_id', p_fechamento_id, 'itens', v_n);
END $f$;
REVOKE ALL ON FUNCTION public.fn_fechamento_pasto_salvar(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fechamento_pasto_salvar(uuid, jsonb, jsonb) TO authenticated, service_role;

CREATE FUNCTION public.fn_fechamento_pasto_reabrir(p_fechamento_id uuid, p_motivo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_fp public.fechamento_pastos%ROWTYPE;
  v_cliente uuid;
  v_nome text;
BEGIN
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(
    SELECT f.cliente_id FROM public.fechamento_pastos fp JOIN public.fazendas f ON f.id = fp.fazenda_id WHERE fp.id = p_fechamento_id)]);
  IF NULLIF(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Motivo da reabertura é obrigatório.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_fp FROM public.fechamento_pastos WHERE id = p_fechamento_id FOR UPDATE;
  IF v_fp.status IS DISTINCT FROM 'fechado' THEN
    RAISE EXCEPTION 'O pasto não está fechado neste mês.' USING ERRCODE = 'P0001';
  END IF;
  IF public._fn_fechamento_p2_travado(v_fp.fazenda_id, v_fp.ano_mes) THEN
    RAISE EXCEPTION 'Mês % possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar pastos.', v_fp.ano_mes
      USING ERRCODE = 'P0001';
  END IF;
  SELECT f.cliente_id INTO v_cliente FROM public.fazendas f WHERE f.id = v_fp.fazenda_id;
  SELECT p.nome INTO v_nome FROM public.pastos p WHERE p.id = v_fp.pasto_id;

  UPDATE public.fechamento_pastos SET status = 'rascunho' WHERE id = p_fechamento_id;
  /* o log nao tem coluna de pasto: o pasto vai no motivo, como os outros escritores do log fazem */
  INSERT INTO public.fechamento_reaberturas_log (cliente_id, fazenda_id, ano_mes, pilar, motivo, reaberto_por, reaberto_em)
  VALUES (v_cliente, v_fp.fazenda_id, v_fp.ano_mes, 'p1_mapa_pastos', btrim(p_motivo) || ' · pasto ' || COALESCE(v_nome, v_fp.pasto_id::text),
          auth.uid(), now());
  RETURN jsonb_build_object('ok', true, 'fechamento_id', p_fechamento_id, 'status', 'rascunho');
END $f$;
REVOKE ALL ON FUNCTION public.fn_fechamento_pasto_reabrir(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fechamento_pasto_reabrir(uuid, text) TO authenticated, service_role;
