-- FECH-ROTACAO-01 · GRUPO DE PASTEJO · FATIA 3 (fechamento com o grupo) · Code 1
-- Decisões do Gabriel (01/11): F3-1 a alocação é por CARD (lote '' = o card inteiro); F3-2 o padrão "grupo inteiro" é GRAVADO no
-- salvar (a conta nunca usa o grupo de hoje: o histórico congela no mês); F3-3 card + alocação numa transação só; F3-4 (a) marcar
-- Vedado num pasto que RECEBE lote de outro card no mês é recusado (b é a tela).
--   fn_fechamento_pasto_salvar_com_alocacao — chama o fn_fechamento_pasto_salvar e o fn_fechamento_alocacoes_salvar na MESMA transação:
--     se a alocação recusa, nada é gravado. p_pasto_ids NULL = não mexe na alocação; '{}' ou só o pasto do card = volta a como hoje.
--   fn_fechamento_pasto_salvar — troca de corpo: o mesmo de 20261016135459 (md5 do def 8faf912b…) + a recusa F3-4(a) depois das travas.
-- Sem alocação, nada muda: os números são os de hoje (portão da fatia 1).
set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_fechamento_pasto_salvar(p_fechamento_id uuid, p_campos jsonb, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fp public.fechamento_pastos%ROWTYPE;
  v_marcas jsonb;
  v_n integer;
  v_recebe text;
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

  /* FECH-ROTACAO-01 F3-4(a): vedar um pasto que RECEBE o lote de outro card no mês contradiz a alocação — tire-o de lá antes */
  IF p_campos ? 'tipo_uso_mes' AND NULLIF(p_campos->>'tipo_uso_mes', '') = 'vedado' THEN
    SELECT format('O %s recebe o lote do %s neste mês. Tire-o de lá antes de vedar.', d.nome, o.nome) INTO v_recebe
      FROM public.fechamento_alocacoes a
      JOIN public.fechamento_pastos c ON c.id = a.fechamento_id
      JOIN public.pastos o ON o.id = c.pasto_id
      JOIN public.pastos d ON d.id = a.pasto_id
     WHERE a.pasto_id = v_fp.pasto_id AND a.fazenda_id = v_fp.fazenda_id AND a.ano_mes = v_fp.ano_mes AND a.fechamento_id <> v_fp.id
     ORDER BY o.nome LIMIT 1;
    IF v_recebe IS NOT NULL THEN
      RAISE EXCEPTION '%', v_recebe USING ERRCODE = 'P0001';
    END IF;
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
END $function$;

CREATE FUNCTION public.fn_fechamento_pasto_salvar_com_alocacao(p_fechamento_id uuid, p_campos jsonb, p_itens jsonb, p_pasto_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_card     jsonb;
  v_aloc     jsonb;
  v_tipo     text;
BEGIN
  /* 1) o card (campos do mês + itens), com as travas dele (tenant, card fechado, P2, vedar quem recebe) */
  v_card := public.fn_fechamento_pasto_salvar(p_fechamento_id, p_campos, p_itens);
  IF p_pasto_ids IS NULL THEN
    RETURN v_card || jsonb_build_object('alocacao', NULL);
  END IF;
  /* 2) onde o lote do card esteve (lote '' = o card inteiro), com as travas do escritor da alocação */
  SELECT tipo_uso_mes INTO v_tipo FROM public.fechamento_pastos WHERE id = p_fechamento_id;
  IF v_tipo = 'vedado' AND cardinality(ARRAY(SELECT DISTINCT x FROM unnest(p_pasto_ids) x WHERE x IS NOT NULL)) > 1 THEN
    RAISE EXCEPTION 'O pasto está vedado neste mês: o lote dele não pode estar em outros pastos. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  v_aloc := public.fn_fechamento_alocacoes_salvar(p_fechamento_id, '', p_pasto_ids);
  RETURN v_card || jsonb_build_object('alocacao', v_aloc);
END $function$;

REVOKE ALL ON FUNCTION public.fn_fechamento_pasto_salvar_com_alocacao(uuid, jsonb, jsonb, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fechamento_pasto_salvar_com_alocacao(uuid, jsonb, jsonb, uuid[]) TO authenticated;
